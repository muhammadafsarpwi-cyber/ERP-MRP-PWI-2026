import { buildZipUint8Array } from './openingStockSpreadsheet';

export interface StoreIssueExportLine {
  lineNumber?: number;
  itemCode?: string;
  itemName?: string;
  quantity?: number;
  uomCode?: string;
  oldItemReturnedQty?: number;
  unitCost?: number | null;
  totalCost?: number | null;
  remarks?: string | null;
}

export interface StoreIssueExportRow {
  issueNumber: string;
  issueDate: string;
  status: string;
  divisionName?: string;
  storeName?: string;
  sectionName?: string;
  departmentName?: string;
  machineAllocation?: string;
  operatorName?: string;
  shiftInchargeName?: string;
  storeInchargeName?: string;
  totalOldReturnedQty?: number;
  purpose?: string;
  remarks?: string;
  lineCount?: number;
  itemSummary?: string;
  lines?: StoreIssueExportLine[];
}

function escXml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
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

function inlineCell(ref: string, text: string, styleIdx: number): string {
  return `<c r="${ref}" t="inlineStr" s="${styleIdx}"><is><t>${escXml(text)}</t></is></c>`;
}

function numberCell(ref: string, num: number, styleIdx: number): string {
  return `<c r="${ref}" s="${styleIdx}"><v>${Number.isFinite(num) ? num : 0}</v></c>`;
}

export function buildStoreIssuesXlsxBlob(rows: StoreIssueExportRow[]): Blob {
  const summaryHeaders = [
    'SIN Number',
    'Issue Date',
    'Status',
    'Division',
    'Source Store',
    'Destination Section',
    'Destination Department',
    'Machine / Allocation',
    'Operator',
    'Shift Incharge',
    'Store Incharge',
    'Lines',
    'Items Summary',
    'Old Returned Scrap Qty',
    'Purpose / Part Use',
    'Remarks',
  ];

  const summaryHeaderCells = summaryHeaders
    .map((h, i) => inlineCell(`${colIndexToLetters(i)}1`, h, 1))
    .join('');

  const summaryRowsXml = rows
    .map((r, idx) => {
      const rowNum = idx + 2;
      const lineCount = r.lineCount ?? r.lines?.length ?? 0;
      const oldRet = Number(
        r.totalOldReturnedQty ??
          (r.lines || []).reduce((acc, l) => acc + Number(l.oldItemReturnedQty || 0), 0),
      );
      return (
        `<row r="${rowNum}">` +
        inlineCell(`A${rowNum}`, r.issueNumber || '', 2) +
        inlineCell(`B${rowNum}`, r.issueDate || '', 3) +
        inlineCell(`C${rowNum}`, r.status || '', 3) +
        inlineCell(`D${rowNum}`, r.divisionName || '—', 2) +
        inlineCell(`E${rowNum}`, r.storeName || '—', 2) +
        inlineCell(`F${rowNum}`, r.sectionName || '—', 2) +
        inlineCell(`G${rowNum}`, r.departmentName || '—', 2) +
        inlineCell(`H${rowNum}`, r.machineAllocation || '—', 2) +
        inlineCell(`I${rowNum}`, r.operatorName || '—', 2) +
        inlineCell(`J${rowNum}`, r.shiftInchargeName || '—', 2) +
        inlineCell(`K${rowNum}`, r.storeInchargeName || '—', 2) +
        numberCell(`L${rowNum}`, lineCount, 4) +
        inlineCell(`M${rowNum}`, r.itemSummary || '—', 2) +
        numberCell(`N${rowNum}`, oldRet, 4) +
        inlineCell(`O${rowNum}`, r.purpose || '—', 2) +
        inlineCell(`P${rowNum}`, r.remarks || '—', 2) +
        '</row>'
      );
    })
    .join('');

  const lastSummaryRow = Math.max(2, rows.length + 1);
  const sheet1Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="18" customWidth="1"/>
    <col min="5" max="5" width="20" customWidth="1"/>
    <col min="6" max="6" width="20" customWidth="1"/>
    <col min="7" max="7" width="20" customWidth="1"/>
    <col min="8" max="8" width="28" customWidth="1"/>
    <col min="9" max="9" width="18" customWidth="1"/>
    <col min="10" max="10" width="18" customWidth="1"/>
    <col min="11" max="11" width="18" customWidth="1"/>
    <col min="12" max="12" width="9" customWidth="1"/>
    <col min="13" max="13" width="38" customWidth="1"/>
    <col min="14" max="14" width="16" customWidth="1"/>
    <col min="15" max="15" width="26" customWidth="1"/>
    <col min="16" max="16" width="28" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${summaryHeaderCells}</row>
    ${summaryRowsXml}
  </sheetData>
  <autoFilter ref="A1:P${lastSummaryRow}"/>
</worksheet>`;

  const lineHeaders = [
    'SIN Number',
    'Issue Date',
    'Status',
    'Line #',
    'Item Code',
    'Item Description',
    'Qty Issued',
    'UOM',
    'Old Returned Scrap',
    'Unit Cost (PKR)',
    'Total Cost (PKR)',
    'Machine / Allocation',
    'Operator',
    'Shift Incharge',
    'Line Remarks',
  ];

  const flattenedLines: Array<{ hdr: StoreIssueExportRow; line: StoreIssueExportLine; idx: number }> = [];
  rows.forEach((hdr) => {
    (hdr.lines || []).forEach((line, idx) => {
      flattenedLines.push({ hdr, line, idx: idx + 1 });
    });
  });

  const lineHeaderCells = lineHeaders
    .map((h, i) => inlineCell(`${colIndexToLetters(i)}1`, h, 1))
    .join('');

  const lineRowsXml = flattenedLines
    .map(({ hdr, line, idx }, rIdx) => {
      const rowNum = rIdx + 2;
      return (
        `<row r="${rowNum}">` +
        inlineCell(`A${rowNum}`, hdr.issueNumber || '', 2) +
        inlineCell(`B${rowNum}`, hdr.issueDate || '', 3) +
        inlineCell(`C${rowNum}`, hdr.status || '', 3) +
        numberCell(`D${rowNum}`, line.lineNumber ?? idx, 4) +
        inlineCell(`E${rowNum}`, line.itemCode || '', 2) +
        inlineCell(`F${rowNum}`, line.itemName || '', 2) +
        numberCell(`G${rowNum}`, Number(line.quantity || 0), 4) +
        inlineCell(`H${rowNum}`, line.uomCode || '', 3) +
        numberCell(`I${rowNum}`, Number(line.oldItemReturnedQty || 0), 4) +
        numberCell(`J${rowNum}`, Number(line.unitCost || 0), 4) +
        numberCell(`K${rowNum}`, Number(line.totalCost || 0), 4) +
        inlineCell(`L${rowNum}`, hdr.machineAllocation || '—', 2) +
        inlineCell(`M${rowNum}`, hdr.operatorName || '—', 2) +
        inlineCell(`N${rowNum}`, hdr.shiftInchargeName || '—', 2) +
        inlineCell(`O${rowNum}`, line.remarks || '—', 2) +
        '</row>'
      );
    })
    .join('');

  const lastLineRow = Math.max(2, flattenedLines.length + 1);
  const sheet2Xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <cols>
    <col min="1" max="1" width="22" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="9" customWidth="1"/>
    <col min="5" max="5" width="16" customWidth="1"/>
    <col min="6" max="6" width="38" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
    <col min="8" max="8" width="10" customWidth="1"/>
    <col min="9" max="9" width="16" customWidth="1"/>
    <col min="10" max="10" width="15" customWidth="1"/>
    <col min="11" max="11" width="15" customWidth="1"/>
    <col min="12" max="12" width="28" customWidth="1"/>
    <col min="13" max="13" width="18" customWidth="1"/>
    <col min="14" max="14" width="18" customWidth="1"/>
    <col min="15" max="15" width="30" customWidth="1"/>
  </cols>
  <sheetData>
    <row r="1" ht="24" customHeight="1">${lineHeaderCells}</row>
    ${lineRowsXml}
  </sheetData>
  <autoFilter ref="A1:O${lastLineRow}"/>
</worksheet>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="#,##0.####"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><name val="Calibri"/><color rgb="FF0F172A"/></font>
    <font><b/><sz val="10"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1E3A8A"/></patternFill></fill>
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
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Store Issue Notes" sheetId="1" r:id="rId1"/>
    <sheet name="Line Item Details" sheetId="2" r:id="rId2"/>
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
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.relationships+xml"/>
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

  return new Blob([bytes as unknown as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function csvCell(val: unknown): string {
  const s = String(val ?? '');
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildStoreIssuesCsv(rows: StoreIssueExportRow[]): string {
  const headers = [
    'SIN Number',
    'Issue Date',
    'Status',
    'Division',
    'Source Store',
    'Destination Section',
    'Destination Department',
    'Machine / Allocation',
    'Operator',
    'Shift Incharge',
    'Store Incharge',
    'Lines',
    'Items Summary',
    'Old Returned Scrap Qty',
    'Purpose / Part Use',
    'Remarks',
  ];
  const lines = [
    headers.map(csvCell).join(','),
    ...rows.map((r) => {
      const oldRet = Number(
        r.totalOldReturnedQty ??
          (r.lines || []).reduce((acc, l) => acc + Number(l.oldItemReturnedQty || 0), 0),
      );
      return [
        r.issueNumber,
        r.issueDate,
        r.status,
        r.divisionName || '',
        r.storeName || '',
        r.sectionName || '',
        r.departmentName || '',
        r.machineAllocation || '',
        r.operatorName || '',
        r.shiftInchargeName || '',
        r.storeInchargeName || '',
        r.lineCount ?? r.lines?.length ?? 0,
        r.itemSummary || '',
        oldRet,
        r.purpose || '',
        r.remarks || '',
      ]
        .map(csvCell)
        .join(',');
    }),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function triggerDownloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
