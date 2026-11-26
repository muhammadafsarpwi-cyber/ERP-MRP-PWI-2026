import { rawNum } from './csvRoundTrip';

export const OPENING_STOCK_TEMPLATE_HEADERS = [
  'ITEM CODE',
  'ITEM NAME',
  'CATEGORY / TYPE',
  'UOM',
  'CURRENT STOCK (REFERENCE)',
  'OPENING QUANTITY',
  'UNIT COST (PKR)',
  'BATCH #',
  'SERIAL #',
  'NOTES',
] as const;

export interface TemplateItemRecord {
  id: string;
  itemCode: string;
  name: string;
  categoryName?: string | null;
  itemType?: string | null;
  uomId?: string | null;
  uomCode?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  costPrice?: number | null;
  standardCost?: number | null;
  isStoreItem?: boolean | null;
}

export interface TemplateUomRecord {
  id: string;
  code?: string;
  name?: string;
}

export interface TemplateDivisionRecord {
  id: string;
  name: string;
}

export interface TemplateGenerationOptions {
  divisionName: string;
  warehouseName: string;
  filterMode: 'ALL' | 'ZERO_STOCK' | 'CATEGORY';
  selectedCategory?: string;
  items: TemplateItemRecord[];
  balances: Map<string, number>;
  generatedAt?: string;
}

export interface ParsedSpreadsheetRow {
  rowNumber: number;
  cells: string[];
}

export type ImportValidationStatus = 'READY' | 'SKIPPED' | 'ERROR';

export interface ValidatedOpeningStockRow {
  key: string;
  rowNumber: number;
  itemCode: string;
  itemName: string;
  categoryType: string;
  uomCode: string;
  currentStockRef: number | null;
  quantityCell: string;
  quantity: number;
  unitCostCell: string;
  unitCost: number;
  batchNumber: string;
  serialNumber: string;
  notes: string;
  matchedItemId?: string;
  matchedUomId?: string;
  excludedByUser?: boolean;
  status: ImportValidationStatus;
  errors: string[];
  skipReason?: string;
}

export interface ValidationContext {
  selectedDivisionId?: string;
  selectedDivisionName?: string;
  divisionItems: TemplateItemRecord[];
  allItems: TemplateItemRecord[];
  divisions: TemplateDivisionRecord[];
  uoms: TemplateUomRecord[];
  balances: Map<string, number>;
}

export function formatCategoryTypeLabel(item: Pick<TemplateItemRecord, 'categoryName' | 'itemType'>): string {
  const cat = (item.categoryName || '').trim();
  const t = (item.itemType || '')
    .trim()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
  if (cat && t && cat.toLowerCase() !== t.toLowerCase()) {
    return `${cat} / ${t}`;
  }
  return cat || t || 'General';
}

export function filterTemplateItems(options: TemplateGenerationOptions): TemplateItemRecord[] {
  const { items, balances, filterMode, selectedCategory } = options;
  const filtered = items.filter((item) => {
    if (!item?.id || !item.itemCode) return false;
    if (filterMode === 'ZERO_STOCK') {
      return (balances.get(item.id) || 0) <= 0;
    }
    if (filterMode === 'CATEGORY' && selectedCategory) {
      const catLabel = formatCategoryTypeLabel(item);
      const rawCat = (item.categoryName || '').trim();
      const rawType = (item.itemType || '').trim();
      return (
        catLabel === selectedCategory ||
        rawCat === selectedCategory ||
        rawType === selectedCategory
      );
    }
    return true;
  });

  return [...filtered].sort((a, b) => {
    const catCmp = formatCategoryTypeLabel(a).localeCompare(formatCategoryTypeLabel(b));
    if (catCmp !== 0) return catCmp;
    return (a.itemCode || '').localeCompare(b.itemCode || '');
  });
}

function escapeCsvCell(val: unknown): string {
  const str = String(val ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildOpeningStockCsvContent(options: TemplateGenerationOptions): {
  content: string;
  rowCount: number;
} {
  const rows = filterTemplateItems(options);
  const lines: string[] = [
    OPENING_STOCK_TEMPLATE_HEADERS.map(escapeCsvCell).join(','),
    ...rows.map((item) => {
      const currentStock = options.balances.get(item.id) || 0;
      const defaultCost = Number(item.costPrice ?? item.standardCost ?? 0);
      return [
        escapeCsvCell(item.itemCode),
        escapeCsvCell(item.name),
        escapeCsvCell(formatCategoryTypeLabel(item)),
        escapeCsvCell(item.uomCode || ''),
        escapeCsvCell(rawNum(currentStock)),
        '', // OPENING QUANTITY left blank for operator input
        escapeCsvCell(defaultCost > 0 ? rawNum(defaultCost) : ''),
        '',
        '',
        '',
      ].join(',');
    }),
  ];
  return {
    content: '\uFEFF' + lines.join('\r\n'),
    rowCount: rows.length,
  };
}

// ── Zero-dependency OOXML (.xlsx) Generator (CRC32 + Stored ZIP) ────────────
const CRC_TABLE = (() => {
  const tbl = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tbl[n] = c >>> 0;
  }
  return tbl;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function colIndexToLetters(colIdxZeroBased: number): string {
  let n = colIdxZeroBased + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function escXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function inlineCell(ref: string, text: string, styleIdx: number): string {
  return `<c r="${ref}" t="inlineStr" s="${styleIdx}"><is><t>${escXml(text)}</t></is></c>`;
}

function numberCell(ref: string, num: number, styleIdx: number): string {
  return `<c r="${ref}" s="${styleIdx}"><v>${num}</v></c>`;
}

function emptyCell(ref: string, styleIdx: number): string {
  return `<c r="${ref}" s="${styleIdx}"/>`;
}

export function buildZipUint8Array(files: Array<{ name: string; content: string | Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = typeof file.content === 'string' ? encoder.encode(file.content) : file.content;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  });

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const totalLen =
    localParts.reduce((s, u) => s + u.length, 0) + centralSize + eocd.length;
  const out = new Uint8Array(totalLen);
  let cursor = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function buildOpeningStockXlsxBytes(options: TemplateGenerationOptions): {
  bytes: Uint8Array;
  rowCount: number;
} {
  const items = filterTemplateItems(options);
  const lastRow = Math.max(2, items.length + 1);

  const headerCells = OPENING_STOCK_TEMPLATE_HEADERS.map((hdr, cIdx) =>
    inlineCell(`${colIndexToLetters(cIdx)}1`, hdr, 1),
  ).join('');

  const dataRowsXml = items
    .map((item, idx) => {
      const r = idx + 2;
      const curStock = options.balances.get(item.id) || 0;
      const defaultCost = Number(item.costPrice ?? item.standardCost ?? 0);
      return `<row r="${r}">` +
        inlineCell(`A${r}`, item.itemCode, 2) +
        inlineCell(`B${r}`, item.name, 2) +
        inlineCell(`C${r}`, formatCategoryTypeLabel(item), 2) +
        inlineCell(`D${r}`, item.uomCode || '', 3) +
        numberCell(`E${r}`, curStock, 4) +
        emptyCell(`F${r}`, 5) +
        (defaultCost > 0 ? numberCell(`G${r}`, defaultCost, 6) : emptyCell(`G${r}`, 6)) +
        emptyCell(`H${r}`, 6) +
        emptyCell(`I${r}`, 6) +
        emptyCell(`J${r}`, 6) +
        '</row>';
    })
    .join('');

  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="18" customWidth="1"/>
    <col min="2" max="2" width="38" customWidth="1"/>
    <col min="3" max="3" width="24" customWidth="1"/>
    <col min="4" max="4" width="10" customWidth="1"/>
    <col min="5" max="5" width="24" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="18" customWidth="1"/>
    <col min="8" max="8" width="16" customWidth="1"/>
    <col min="9" max="9" width="16" customWidth="1"/>
    <col min="10" max="10" width="28" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${headerCells}</row>
    ${dataRowsXml}
  </sheetData>
  <autoFilter ref="A1:J${lastRow}"/>
</worksheet>`;

  const scopeLabel =
    options.filterMode === 'ZERO_STOCK'
      ? 'Zero-Stock Items Only'
      : options.filterMode === 'CATEGORY' && options.selectedCategory
        ? `Category: ${options.selectedCategory}`
        : 'All Active Items in Division';

  const guideRows: Array<[string, string]> = [
    ['Setting / Field', 'Value / Instruction'],
    ['Division Scope', options.divisionName || 'All Divisions'],
    ['Target Warehouse', options.warehouseName || 'Selected Warehouse'],
    ['Item Filter Scope', scopeLabel],
    ['Pre-Filled Items Count', String(items.length)],
    ['Generated At', options.generatedAt || new Date().toISOString()],
    ['How to Fill OPENING QUANTITY (Col F)', 'Type positive numbers only beside items you want to stock. Leave blank or 0 to automatically skip.'],
    ['UNIT COST (PKR) (Col G)', 'Pre-filled with latest item cost where available. Edit to override opening stock valuation rate.'],
    ['Re-Upload', 'Save this workbook as .xlsx or .csv and upload it in Store Opening Stock -> Import Excel / CSV.'],
  ];

  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="34" customWidth="1"/>
    <col min="2" max="2" width="76" customWidth="1"/>
  </cols>
  <sheetData>
    ${guideRows
      .map(([k, v], idx) => {
        const r = idx + 1;
        const s = idx === 0 ? 1 : 2;
        return `<row r="${r}">${inlineCell(`A${r}`, k, s)}${inlineCell(`B${r}`, v, s)}</row>`;
      })
      .join('')}
  </sheetData>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.####"/>
  </numFmts>
  <fonts count="3">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FF065F46"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="2" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Opening Stock" sheetId="1" r:id="rId1"/>
    <sheet name="Template Guide" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const bytes = buildZipUint8Array([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/styles.xml', content: stylesXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheet1Xml },
    { name: 'xl/worksheets/sheet2.xml', content: sheet2Xml },
  ]);

  return { bytes, rowCount: items.length };
}

export function buildOpeningStockXlsxBlob(options: TemplateGenerationOptions): {
  blob: Blob;
  rowCount: number;
} {
  const { bytes, rowCount } = buildOpeningStockXlsxBytes(options);
  return {
    blob: new Blob([bytes as unknown as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    rowCount,
  };
}

// ── Multi-Format File Parser (.xlsx, .xls SpreadsheetML, .csv) ───────────────
function detectDelimiter(sampleText: string): ',' | ';' | '\t' {
  const firstLine = sampleText.split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  if (tabs > commas && tabs > semis) return '\t';
  if (semis > commas) return ';';
  return ',';
}

export function parseCsvGrid(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const delim = detectDelimiter(clean);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}

let customRawInflater: ((bytes: Uint8Array) => Uint8Array) | null = null;

export function registerRawInflater(fn: ((bytes: Uint8Array) => Uint8Array) | null): void {
  customRawInflater = fn;
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([compressed as unknown as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('deflate-raw'));
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }
  if (customRawInflater) {
    return customRawInflater(compressed);
  }
  throw new Error('Deflate decompression is not supported in this runtime');
}

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function readZipCentralDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  const minOffset = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= minOffset; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Invalid .xlsx archive: ZIP End-of-Central-Directory not found');
  }

  const cdOffset = view.getUint32(eocdOffset + 16, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map<string, ZipEntry>();
  let ptr = cdOffset;

  for (let i = 0; i < entryCount && ptr + 46 <= bytes.length; i++) {
    if (view.getUint32(ptr, true) !== 0x02014b50) break;
    const method = view.getUint16(ptr + 10, true);
    const compressedSize = view.getUint32(ptr + 20, true);
    const nameLen = view.getUint16(ptr + 28, true);
    const extraLen = view.getUint16(ptr + 30, true);
    const commentLen = view.getUint16(ptr + 32, true);
    const localHeaderOffset = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
    entries.set(name, { name, method, compressedSize, localHeaderOffset });
    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entries;
}

async function readZipEntryText(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const off = entry.localHeaderOffset;
  const nameLen = view.getUint16(off + 26, true);
  const extraLen = view.getUint16(off + 28, true);
  const dataStart = off + 30 + nameLen + extraLen;
  const slice = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  const decoder = new TextDecoder('utf-8');

  if (entry.method === 0) {
    return decoder.decode(slice);
  }
  if (entry.method === 8) {
    const raw = await inflateRawBytes(slice);
    return decoder.decode(raw);
  }
  throw new Error(`Unsupported ZIP compression method ${entry.method} for ${entry.name}`);
}

function parseSharedStringsXml(xmlText: string): string[] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const sis = Array.from(doc.getElementsByTagName('si'));
  return sis.map((si) => {
    const ts = Array.from(si.getElementsByTagName('t'));
    return ts.map((t) => t.textContent ?? '').join('');
  });
}

function parseWorksheetXml(xmlText: string, sharedStrings: string[]): string[][] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const rowNodes = Array.from(doc.getElementsByTagName('row'));
  const grid: string[][] = [];

  for (const rowNode of rowNodes) {
    const cells = Array.from(rowNode.getElementsByTagName('c'));
    const rowArr: string[] = [];
    let fallbackCol = 0;

    for (const c of cells) {
      const ref = c.getAttribute('r') || '';
      const colMatch = ref.match(/^([A-Z]+)/i);
      const colIdx = colMatch ? colLettersToIndex(colMatch[1].toUpperCase()) : fallbackCol;
      fallbackCol = colIdx + 1;

      const t = c.getAttribute('t') || '';
      let val = '';
      if (t === 'inlineStr') {
        const ts = Array.from(c.getElementsByTagName('t'));
        val = ts.map((node) => node.textContent ?? '').join('');
      } else {
        const vNode = c.getElementsByTagName('v')[0];
        const rawVal = vNode?.textContent ?? '';
        if (t === 's') {
          const idx = Number(rawVal);
          val = Number.isFinite(idx) && sharedStrings[idx] !== undefined ? sharedStrings[idx] : '';
        } else {
          val = rawVal;
        }
      }
      while (rowArr.length <= colIdx) rowArr.push('');
      rowArr[colIdx] = val.trim();
    }

    if (rowArr.some((x) => x !== '')) {
      grid.push(rowArr);
    }
  }

  return grid;
}

function parseSpreadsheetMlGrid(xmlText: string): string[][] {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const rows = Array.from(doc.getElementsByTagName('Row'));
  const grid: string[][] = [];

  for (const rowNode of rows) {
    const cells = Array.from(rowNode.getElementsByTagName('Cell'));
    const rowArr: string[] = [];
    let colCursor = 0;
    for (const cell of cells) {
      const explicitIdx = cell.getAttribute('ss:Index') || cell.getAttribute('Index');
      if (explicitIdx) {
        colCursor = Math.max(0, Number(explicitIdx) - 1);
      }
      const dataNode = cell.getElementsByTagName('Data')[0];
      const val = (dataNode?.textContent ?? cell.textContent ?? '').trim();
      while (rowArr.length <= colCursor) rowArr.push('');
      rowArr[colCursor] = val;
      colCursor += 1;
    }
    if (rowArr.some((c) => c !== '')) grid.push(rowArr);
  }
  return grid;
}

export async function parseOpeningStockBytes(inputBytes: Uint8Array): Promise<string[][]> {
  // ZIP archive (.xlsx) starts with PK\x03\x04
  if (
    inputBytes.length >= 4 &&
    inputBytes[0] === 0x50 &&
    inputBytes[1] === 0x4b &&
    inputBytes[2] === 0x03 &&
    inputBytes[3] === 0x04
  ) {
    const entries = readZipCentralDirectory(inputBytes);
    const sharedEntry = entries.get('xl/sharedStrings.xml');
    const sharedStrings = sharedEntry
      ? parseSharedStringsXml(await readZipEntryText(inputBytes, sharedEntry))
      : [];

    // Prefer first sheet in xl/workbook.xml -> rels, fallback to xl/worksheets/sheet1.xml
    let sheetEntry = entries.get('xl/worksheets/sheet1.xml');
    const wbEntry = entries.get('xl/workbook.xml');
    const relsEntry = entries.get('xl/_rels/workbook.xml.rels');
    if (wbEntry && relsEntry) {
      const wbDoc = new DOMParser().parseFromString(
        await readZipEntryText(inputBytes, wbEntry),
        'application/xml',
      );
      const relDoc = new DOMParser().parseFromString(
        await readZipEntryText(inputBytes, relsEntry),
        'application/xml',
      );
      const sheets = Array.from(wbDoc.getElementsByTagName('sheet'));
      const preferred =
        sheets.find((s) => /opening/i.test(s.getAttribute('name') || '')) || sheets[0];
      const rId = preferred?.getAttribute('r:id') || preferred?.getAttribute('id');
      if (rId) {
        const rels = Array.from(relDoc.getElementsByTagName('Relationship'));
        const rel = rels.find((el) => el.getAttribute('Id') === rId);
        const target = rel?.getAttribute('Target')?.replace(/^\/+/, '');
        if (target) {
          const fullTarget = target.startsWith('xl/') ? target : `xl/${target}`;
          sheetEntry = entries.get(fullTarget) || sheetEntry;
        }
      }
    }

    if (!sheetEntry) {
      const fallbackSheetName = Array.from(entries.keys()).find((k) =>
        /^xl\/worksheets\/sheet\d+\.xml$/i.test(k),
      );
      if (fallbackSheetName) sheetEntry = entries.get(fallbackSheetName);
    }
    if (!sheetEntry) {
      throw new Error('Could not find worksheet XML inside .xlsx workbook');
    }

    const sheetXml = await readZipEntryText(inputBytes, sheetEntry);
    return parseWorksheetXml(sheetXml, sharedStrings);
  }

  const text = new TextDecoder('utf-8').decode(inputBytes);
  const trimmed = text.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<Workbook')) {
    return parseSpreadsheetMlGrid(text);
  }
  return parseCsvGrid(text);
}

export async function parseOpeningStockFile(file: File): Promise<string[][]> {
  const buf = await file.arrayBuffer();
  return parseOpeningStockBytes(new Uint8Array(buf));
}

function normHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findColumnIndices(headerRow: string[]) {
  const norm = headerRow.map(normHeader);
  const findCol = (aliases: string[]): number =>
    norm.findIndex((h) => aliases.some((a) => h === a || h.includes(a)));

  const codeIdx = findCol(['itemcode', 'sku', 'code']);
  const nameIdx = findCol(['itemname', 'description', 'name']);
  const categoryIdx = findCol(['categorytype', 'category', 'itemtype', 'type']);
  const uomIdx = findCol(['uom', 'uomcode', 'unit']);
  const curStockIdx = findCol(['currentstockreference', 'currentstock', 'inhand']);
  const qtyIdx = findCol(['openingquantity', 'openingqty', 'quantity', 'qty']);
  const costIdx = findCol(['unitcostpkr', 'unitcost', 'cost', 'rate', 'price']);
  const batchIdx = findCol(['batchnumber', 'batch']);
  const serialIdx = findCol(['serialnumber', 'serial']);
  const notesIdx = findCol(['notes', 'remark', 'remarks']);

  return {
    codeIdx,
    nameIdx,
    categoryIdx,
    uomIdx,
    curStockIdx,
    qtyIdx,
    costIdx,
    batchIdx,
    serialIdx,
    notesIdx,
  };
}

export function validateOpeningStockGrid(
  grid: string[][],
  context: ValidationContext,
): { rows: ValidatedOpeningStockRow[]; headerError?: string } {
  if (!grid || grid.length === 0) {
    return { rows: [], headerError: 'The uploaded file is empty.' };
  }

  let headerRowIdx = -1;
  let colMap = findColumnIndices(grid[0]);
  const limitScan = Math.min(grid.length, 15);
  for (let i = 0; i < limitScan; i++) {
    const candidate = findColumnIndices(grid[i]);
    if (candidate.codeIdx !== -1 && candidate.qtyIdx !== -1) {
      headerRowIdx = i;
      colMap = candidate;
      break;
    }
  }

  if (headerRowIdx === -1) {
    return {
      rows: [],
      headerError:
        'Missing required columns "ITEM CODE" and "OPENING QUANTITY". Download the template to see the exact columns.',
    };
  }

  const divItemByCode = new Map<string, TemplateItemRecord>();
  for (const it of context.divisionItems) {
    if (it.itemCode) divItemByCode.set(it.itemCode.trim().toUpperCase(), it);
  }
  const allItemByCode = new Map<string, TemplateItemRecord>();
  for (const it of context.allItems) {
    if (it.itemCode) allItemByCode.set(it.itemCode.trim().toUpperCase(), it);
  }
  const divNameById = new Map<string, string>();
  for (const d of context.divisions) {
    divNameById.set(d.id, d.name);
  }
  const uomByKey = new Map<string, TemplateUomRecord>();
  for (const u of context.uoms) {
    if (u.code) uomByKey.set(u.code.trim().toUpperCase(), u);
    if (u.name) uomByKey.set(u.name.trim().toUpperCase(), u);
  }

  const parsedRows: ValidatedOpeningStockRow[] = [];
  for (let i = headerRowIdx + 1; i < grid.length; i++) {
    const cells = grid[i];
    const getCell = (idx: number) => (idx >= 0 ? String(cells[idx] ?? '').trim() : '');

    const itemCode = getCell(colMap.codeIdx);
    const itemName = getCell(colMap.nameIdx);
    const categoryType = getCell(colMap.categoryIdx);
    const uomCode = getCell(colMap.uomIdx);
    const curStockCell = getCell(colMap.curStockIdx);
    const quantityCell = getCell(colMap.qtyIdx).replace(/,/g, '');
    const unitCostCell = getCell(colMap.costIdx).replace(/,/g, '');
    const batchNumber = getCell(colMap.batchIdx);
    const serialNumber = getCell(colMap.serialIdx);
    const notes = getCell(colMap.notesIdx);

    if (!itemCode && !quantityCell && !itemName && !unitCostCell && !batchNumber && !serialNumber) {
      continue;
    }

    const row: ValidatedOpeningStockRow = {
      key: `imp-row-${i + 1}`,
      rowNumber: i + 1,
      itemCode,
      itemName,
      categoryType,
      uomCode,
      currentStockRef: curStockCell !== '' && Number.isFinite(Number(curStockCell)) ? Number(curStockCell) : null,
      quantityCell,
      quantity: quantityCell !== '' && Number.isFinite(Number(quantityCell)) ? Number(quantityCell) : 0,
      unitCostCell,
      unitCost: unitCostCell !== '' && Number.isFinite(Number(unitCostCell)) ? Number(unitCostCell) : 0,
      batchNumber,
      serialNumber,
      notes,
      status: 'READY',
      errors: [],
    };
    parsedRows.push(row);
  }

  return { rows: revalidateAllRows(parsedRows, context, { divItemByCode, allItemByCode, divNameById, uomByKey }) };
}

export function revalidateAllRows(
  rows: ValidatedOpeningStockRow[],
  context: ValidationContext,
  prebuiltMaps?: {
    divItemByCode: Map<string, TemplateItemRecord>;
    allItemByCode: Map<string, TemplateItemRecord>;
    divNameById: Map<string, string>;
    uomByKey: Map<string, TemplateUomRecord>;
  },
): ValidatedOpeningStockRow[] {
  const divItemByCode = prebuiltMaps?.divItemByCode || new Map<string, TemplateItemRecord>();
  const allItemByCode = prebuiltMaps?.allItemByCode || new Map<string, TemplateItemRecord>();
  const divNameById = prebuiltMaps?.divNameById || new Map<string, string>();
  const uomByKey = prebuiltMaps?.uomByKey || new Map<string, TemplateUomRecord>();

  if (!prebuiltMaps) {
    for (const it of context.divisionItems) {
      if (it.itemCode) divItemByCode.set(it.itemCode.trim().toUpperCase(), it);
    }
    for (const it of context.allItems) {
      if (it.itemCode) allItemByCode.set(it.itemCode.trim().toUpperCase(), it);
    }
    for (const d of context.divisions) {
      divNameById.set(d.id, d.name);
    }
    for (const u of context.uoms) {
      if (u.code) uomByKey.set(u.code.trim().toUpperCase(), u);
      if (u.name) uomByKey.set(u.name.trim().toUpperCase(), u);
    }
  }

  const seenActiveKeys = new Map<string, number>();

  return rows.map((orig) => {
    const row: ValidatedOpeningStockRow = {
      ...orig,
      errors: [],
      skipReason: undefined,
    };

    const rawQty = String(row.quantityCell ?? '').trim().replace(/,/g, '');
    const qtyIsBlank = rawQty === '';
    const parsedQty = qtyIsBlank ? 0 : Number(rawQty);
    const qtyValidNumber = qtyIsBlank || Number.isFinite(parsedQty);

    const codeUpper = row.itemCode.trim().toUpperCase();
    const divMatch = codeUpper ? divItemByCode.get(codeUpper) : undefined;
    const anyMatch = codeUpper ? allItemByCode.get(codeUpper) : undefined;
    const matched = divMatch || (!context.selectedDivisionId ? anyMatch : undefined);

    if (matched) {
      row.matchedItemId = matched.id;
      if (!row.itemName) row.itemName = matched.name;
      if (!row.categoryType) row.categoryType = formatCategoryTypeLabel(matched);
      if (!row.uomCode && matched.uomCode) row.uomCode = matched.uomCode;
      if (row.currentStockRef === null) {
        row.currentStockRef = context.balances.get(matched.id) ?? 0;
      }
    } else {
      row.matchedItemId = undefined;
    }

    // Check explicit manual skip
    if (row.excludedByUser) {
      row.quantity = qtyValidNumber ? parsedQty : 0;
      row.status = 'SKIPPED';
      row.skipReason = 'Skipped manually by user';
      return row;
    }

    // Parse unit cost
    const rawCost = String(row.unitCostCell ?? '').trim().replace(/,/g, '');
    const costIsBlank = rawCost === '';
    const parsedCost = costIsBlank
      ? Number(matched?.costPrice ?? matched?.standardCost ?? 0)
      : Number(rawCost);
    if (!costIsBlank && !Number.isFinite(parsedCost)) {
      row.errors.push(`Invalid unit cost '${row.unitCostCell}'`);
    } else if (Number.isFinite(parsedCost) && parsedCost < 0) {
      row.errors.push('Unit cost cannot be negative');
    } else {
      row.unitCost = Math.max(0, parsedCost || 0);
    }

    // Validate quantity
    if (!qtyValidNumber) {
      row.errors.push(`Invalid opening quantity '${row.quantityCell}'`);
      row.quantity = 0;
    } else if (parsedQty < 0) {
      row.errors.push('Opening quantity cannot be negative');
      row.quantity = parsedQty;
    } else if (qtyIsBlank || parsedQty === 0) {
      row.quantity = 0;
      // If blank or 0 quantity and no negative cost error: automatically skip row cleanly
      if (row.errors.length === 0) {
        row.status = 'SKIPPED';
        row.skipReason = qtyIsBlank ? 'Empty quantity (auto-skipped)' : 'Zero quantity (auto-skipped)';
        return row;
      }
    } else {
      row.quantity = parsedQty;
    }

    // Validate item existence & division scope for rows with quantity > 0 or non-numeric errors
    if (!codeUpper) {
      row.errors.push('Missing Item Code');
    } else if (!matched) {
      if (anyMatch && context.selectedDivisionId && anyMatch.divisionId && anyMatch.divisionId !== context.selectedDivisionId) {
        const otherDiv = divNameById.get(anyMatch.divisionId) || anyMatch.divisionName || 'another division';
        const curDiv = context.selectedDivisionName || 'selected division';
        row.errors.push(`Wrong division: '${row.itemCode}' belongs to ${otherDiv}, not ${curDiv}`);
      } else {
        row.errors.push(`Unknown item code '${row.itemCode}'`);
      }
    }

    // Validate UOM
    const uomUpper = row.uomCode.trim().toUpperCase();
    if (uomUpper) {
      const u = uomByKey.get(uomUpper);
      if (!u) {
        row.errors.push(`Invalid UOM '${row.uomCode}'`);
        row.matchedUomId = undefined;
      } else {
        row.matchedUomId = u.id;
      }
    } else if (matched?.uomId) {
      row.matchedUomId = matched.uomId;
      if (matched.uomCode) row.uomCode = matched.uomCode;
    } else if (matched) {
      row.errors.push('Missing UOM');
    }

    // Duplicate check for active rows (same item + same batch + same serial)
    if (matched && row.quantity > 0) {
      const dupKey = `${matched.id}::${row.batchNumber.trim().toUpperCase()}::${row.serialNumber.trim().toUpperCase()}`;
      const firstRow = seenActiveKeys.get(dupKey);
      if (firstRow !== undefined) {
        row.errors.push(
          `Duplicate item '${row.itemCode}' (same Batch/Serial as Row #${firstRow})`,
        );
      } else {
        seenActiveKeys.set(dupKey, row.rowNumber);
      }
    }

    row.status = row.errors.length > 0 ? 'ERROR' : 'READY';
    return row;
  });
}

export function buildErrorRowsCsv(rows: ValidatedOpeningStockRow[]): string {
  const errRows = rows.filter((r) => r.status === 'ERROR');
  const headers = [
    'ROW #',
    'ITEM CODE',
    'ITEM NAME',
    'UOM',
    'OPENING QUANTITY',
    'UNIT COST (PKR)',
    'BATCH #',
    'SERIAL #',
    'NOTES',
    'VALIDATION ERRORS',
  ];
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...errRows.map((r) =>
      [
        r.rowNumber,
        escapeCsvCell(r.itemCode),
        escapeCsvCell(r.itemName),
        escapeCsvCell(r.uomCode),
        escapeCsvCell(r.quantityCell || rawNum(r.quantity)),
        escapeCsvCell(r.unitCostCell || rawNum(r.unitCost)),
        escapeCsvCell(r.batchNumber),
        escapeCsvCell(r.serialNumber),
        escapeCsvCell(r.notes),
        escapeCsvCell(r.errors.join('; ')),
      ].join(','),
    ),
  ];
  return '\uFEFF' + lines.join('\r\n');
}
