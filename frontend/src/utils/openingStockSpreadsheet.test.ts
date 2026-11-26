import * as zlib from 'zlib';
import {
  buildOpeningStockCsvContent,
  buildOpeningStockXlsxBytes,
  buildZipUint8Array,
  buildErrorRowsCsv,
  parseOpeningStockBytes,
  registerRawInflater,
  revalidateAllRows,
  validateOpeningStockGrid,
  type TemplateItemRecord,
  type ValidationContext,
} from './openingStockSpreadsheet';

beforeAll(() => {
  registerRawInflater((b) => new Uint8Array(zlib.inflateRawSync(b)));
});

afterAll(() => {
  registerRawInflater(null);
});

const DIV_CCD = 'div-ccd';
const DIV_SPOKE = 'div-spoke';

const sampleItems: TemplateItemRecord[] = [
  {
    id: 'i-1',
    itemCode: 'RM-WIRE-001',
    name: 'Copper Wire 1.20mm',
    categoryName: 'Raw Wire',
    itemType: 'RAW_MATERIAL',
    uomId: 'u-kg',
    uomCode: 'KG',
    divisionId: DIV_CCD,
    costPrice: 2450,
  },
  {
    id: 'i-2',
    itemCode: 'WIP-CORE-002',
    name: 'Spiral Core 5.75mm',
    categoryName: 'Spiral Core',
    itemType: 'WORK_IN_PROGRESS',
    uomId: 'u-m',
    uomCode: 'M',
    divisionId: DIV_CCD,
    costPrice: 0,
  },
  {
    id: 'i-3',
    itemCode: 'SPI-SPOKE-009',
    name: 'Front Spoke 10G',
    categoryName: 'Spokes',
    itemType: 'FINISHED_GOOD',
    uomId: 'u-pcs',
    uomCode: 'PCS',
    divisionId: DIV_SPOKE,
    costPrice: 12.5,
  },
];

const context: ValidationContext = {
  selectedDivisionId: DIV_CCD,
  selectedDivisionName: 'Control Cable Division',
  divisionItems: sampleItems.filter((i) => i.divisionId === DIV_CCD),
  allItems: sampleItems,
  divisions: [
    { id: DIV_CCD, name: 'Control Cable Division' },
    { id: DIV_SPOKE, name: 'Spoke Division' },
  ],
  uoms: [
    { id: 'u-kg', code: 'KG', name: 'Kilogram' },
    { id: 'u-m', code: 'M', name: 'Meter' },
    { id: 'u-pcs', code: 'PCS', name: 'Pieces' },
  ],
  balances: new Map<string, number>([
    ['i-1', 150],
    ['i-2', 0],
  ]),
};

describe('openingStockSpreadsheet — Template Generation, XLSX/CSV Parsing & Row Validation', () => {
  it('generates pre-filled .csv template with ALL, ZERO_STOCK, and CATEGORY scopes', () => {
    const allRes = buildOpeningStockCsvContent({
      divisionName: 'Control Cable Division',
      warehouseName: 'CCD Main Store',
      filterMode: 'ALL',
      items: context.divisionItems,
      balances: context.balances,
    });
    expect(allRes.rowCount).toBe(2);
    expect(allRes.content).toContain('ITEM CODE');
    expect(allRes.content).toContain('RM-WIRE-001');
    expect(allRes.content).toContain('WIP-CORE-002');
    expect(allRes.content).toContain('2450');

    const zeroRes = buildOpeningStockCsvContent({
      divisionName: 'Control Cable Division',
      warehouseName: 'CCD Main Store',
      filterMode: 'ZERO_STOCK',
      items: context.divisionItems,
      balances: context.balances,
    });
    expect(zeroRes.rowCount).toBe(1);
    expect(zeroRes.content).toContain('WIP-CORE-002');
    expect(zeroRes.content).not.toContain('RM-WIRE-001');

    const catRes = buildOpeningStockCsvContent({
      divisionName: 'Control Cable Division',
      warehouseName: 'CCD Main Store',
      filterMode: 'CATEGORY',
      selectedCategory: 'Raw Wire',
      items: context.divisionItems,
      balances: context.balances,
    });
    expect(catRes.rowCount).toBe(1);
    expect(catRes.content).toContain('RM-WIRE-001');
  });

  it('builds a valid OOXML .xlsx workbook and round-trip parses it back', async () => {
    const { bytes, rowCount } = buildOpeningStockXlsxBytes({
      divisionName: 'Control Cable Division',
      warehouseName: 'CCD Main Store',
      filterMode: 'ALL',
      items: context.divisionItems,
      balances: context.balances,
      generatedAt: '2026-11-27T01:00:00Z',
    });

    expect(rowCount).toBe(2);
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K

    const grid = await parseOpeningStockBytes(bytes);
    expect(grid[0]).toEqual([
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
    ]);
    expect(grid[1][0]).toBe('RM-WIRE-001');
    expect(grid[1][1]).toBe('Copper Wire 1.20mm');
    expect(grid[1][4]).toBe('150');
    expect(grid[2][0]).toBe('WIP-CORE-002');
  });

  it('parses deflate-compressed .xlsx files with sharedStrings.xml as saved by Microsoft Excel', async () => {
    const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">
        <si><t>ITEM CODE</t></si>
        <si><t>OPENING QUANTITY</t></si>
        <si><t>RM-WIRE-001</t></si>
        <si><t>KG</t></si>
      </sst>`;
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <sheetData>
          <row r="1"><c r="A1" t="s"><v>0</v></c><c r="D1" t="s"><v>3</v></c><c r="F1" t="s"><v>1</v></c></row>
          <row r="2"><c r="A2" t="s"><v>2</v></c><c r="F2"><v>75.5</v></c></row>
        </sheetData>
      </worksheet>`;

    // Build STORED zip first, or construct deflate entry directly to exercise method 8 path
    const sharedDef = zlib.deflateRawSync(Buffer.from(sharedXml));
    const sheetDef = zlib.deflateRawSync(Buffer.from(sheetXml));
    const wbXml = `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Opening Stock" sheetId="1" r:id="rId1"/></sheets></workbook>`;
    const relsXml = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

    // Build custom zip with DEFLATE method 8 to verify decompression works in Node/Jest
    const enc = new TextEncoder();
    const parts = [
      { name: 'xl/workbook.xml', method: 0, data: enc.encode(wbXml) },
      { name: 'xl/_rels/workbook.xml.rels', method: 0, data: enc.encode(relsXml) },
      { name: 'xl/sharedStrings.xml', method: 8, data: new Uint8Array(sharedDef) },
      { name: 'xl/worksheets/sheet1.xml', method: 8, data: new Uint8Array(sheetDef) },
    ];
    const localChunks: Uint8Array[] = [];
    const cdChunks: Uint8Array[] = [];
    let offset = 0;
    for (const p of parts) {
      const nb = enc.encode(p.name);
      const lh = new Uint8Array(30 + nb.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(8, p.method, true);
      lv.setUint32(18, p.data.length, true);
      lv.setUint32(22, p.data.length, true);
      lv.setUint16(26, nb.length, true);
      lh.set(nb, 30);
      localChunks.push(lh, p.data);

      const ch = new Uint8Array(46 + nb.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(10, p.method, true);
      cv.setUint32(20, p.data.length, true);
      cv.setUint32(24, p.data.length, true);
      cv.setUint16(28, nb.length, true);
      cv.setUint32(42, offset, true);
      ch.set(nb, 46);
      cdChunks.push(ch);
      offset += lh.length + p.data.length;
    }
    const cdSize = cdChunks.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, parts.length, true);
    ev.setUint16(10, parts.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    const full = new Uint8Array(offset + cdSize + 22);
    let pos = 0;
    for (const x of [...localChunks, ...cdChunks, eocd]) {
      full.set(x, pos);
      pos += x.length;
    }

    const parsed = await parseOpeningStockBytes(full);
    expect(parsed[1][0]).toBe('RM-WIRE-001');
    expect(parsed[1][5]).toBe('75.5');

    // Also verify buildZipUint8Array produces clean PK headers
    const storedZip = buildZipUint8Array([{ name: 'test.txt', content: 'hello' }]);
    expect(storedZip[0]).toBe(0x50);
  });

  it('validates READY, auto-SKIPPED empty/zero rows, unknown code, invalid UOM, negative qty, wrong division & generates Error CSV', () => {
    const grid: string[][] = [
      ['ITEM CODE', 'ITEM NAME', 'CATEGORY / TYPE', 'UOM', 'CURRENT STOCK (REFERENCE)', 'OPENING QUANTITY', 'UNIT COST (PKR)', 'BATCH #', 'SERIAL #', 'NOTES'],
      ['RM-WIRE-001', 'Copper Wire 1.20mm', 'Raw Wire', 'KG', '150', '120', '2500', 'B-01', '', 'Valid row'],
      ['WIP-CORE-002', 'Spiral Core 5.75mm', 'Spiral Core', 'M', '0', '', '', '', '', 'Blank auto skipped'],
      ['WIP-CORE-002', 'Spiral Core 5.75mm', 'Spiral Core', 'M', '0', '0', '', '', '', 'Zero auto skipped'],
      ['UNKNOWN-999', 'Ghost Item', '', 'KG', '0', '10', '', '', '', ''],
      ['RM-WIRE-001', 'Copper Wire 1.20mm', '', 'BAD_UOM', '0', '5', '', '', '', ''],
      ['RM-WIRE-001', 'Copper Wire 1.20mm', '', 'KG', '0', '-4', '', '', '', ''],
      ['SPI-SPOKE-009', 'Front Spoke 10G', 'Spokes', 'PCS', '0', '200', '', '', '', ''],
    ];

    const { rows, headerError } = validateOpeningStockGrid(grid, context);
    expect(headerError).toBeUndefined();
    expect(rows).toHaveLength(7);

    expect(rows[0].status).toBe('READY');
    expect(rows[0].matchedItemId).toBe('i-1');
    expect(rows[0].quantity).toBe(120);

    expect(rows[1].status).toBe('SKIPPED');
    expect(rows[2].status).toBe('SKIPPED');

    expect(rows[3].status).toBe('ERROR');
    expect(rows[3].errors[0]).toContain("Unknown item code 'UNKNOWN-999'");

    expect(rows[4].status).toBe('ERROR');
    expect(rows[4].errors.some((e) => e.includes("Invalid UOM 'BAD_UOM'"))).toBe(true);

    expect(rows[5].status).toBe('ERROR');
    expect(rows[5].errors.some((e) => e.includes('cannot be negative'))).toBe(true);

    expect(rows[6].status).toBe('ERROR');
    expect(rows[6].errors[0]).toContain('Wrong division');

    const errorCsv = buildErrorRowsCsv(rows);
    expect(errorCsv).toContain('UNKNOWN-999');
    expect(errorCsv).toContain('Wrong division');

    // Inline edit row #6 from -4 to 30 with Batch # B-02 and re-validate -> turns READY
    const edited = rows.map((r, idx) =>
      idx === 5 ? { ...r, quantityCell: '30', batchNumber: 'B-02' } : r,
    );
    const revalidated = revalidateAllRows(edited, context);
    expect(revalidated[5].status).toBe('READY');
    expect(revalidated[5].quantity).toBe(30);
  });
});
