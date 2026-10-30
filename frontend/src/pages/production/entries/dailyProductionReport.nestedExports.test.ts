import {
  MULTI_ITEM_THRESHOLD,
  buildDailyProductionReport,
  buildDailyProductionCsv,
  buildPrintHtml,
  isMultiItemLine,
  nestedLinesOf,
  pdfSubRow,
  sectionItemTotals,
  type DailyProductionReport,
  type ReportOptions,
  type ReportRowSource,
} from './dailyProductionReport';

/* ------------------------------------------------------------------ *
 * Triple-platform export sync for MULTI-ITEM documents.
 *
 * The fixtures mirror live rows read off the API, including the two data
 * facts that decide how an export may legally be built:
 *
 *   1. a document's pieces are EXACTLY the sum of its children (8/8 live
 *      rows), and the parent names child #1 — so a flat export may replace
 *      the parent with its children WITHOUT double counting;
 *   2. SCRAP is recorded at ENTRY level and is NOT allocated to the children
 *      (a live entry holds 12.87 KG while all of its children report 0), so
 *      taking scrap from the children would delete real rejected stock.
 * ------------------------------------------------------------------ */

const NIGHT = { name: 'Shift C (Night)', shiftCode: 'SHIFT-C' };

const makeRow = (over: Partial<ReportRowSource> = {}): ReportRowSource => ({
  entryDate: '2026-10-02',
  division: { name: 'Rims Division', divisionCode: 'RIM' },
  department: { name: 'Spoke', departmentCode: 'SPK' },
  shift: { name: 'SHIFT-A', shiftCode: 'A' },
  machineNo: 'SPK-01',
  operatorName: 'OP-1',
  item: { name: 'Spoke 40T', itemCode: 'SP-40', weightPerPiece: 0.05 },
  uom: { code: 'PCS' },
  targetQuantity: 1000,
  actualQuantity: 1000,
  achievementPercentage: null,
  scrapQuantity: 0,
  ...over,
});

const opts = (over: Partial<ReportOptions> = {}): ReportOptions => ({
  divisionName: 'Rims Division',
  dateFrom: '2026-10-02',
  dateTo: '2026-10-02',
  generatedAt: '02 Oct 2026, 06:00',
  operatorName: (r) => r.operatorName || '—',
  status: () => 'COMPLETED',
  ...over,
});

/* ST-05 — a real 2-item straightener document. Parent = child #1. */
const TWO_ITEM = makeRow({
  department: { name: 'Straightener', departmentCode: 'ST' },
  machineNo: 'ST-05',
  item: { name: '250*17 Outer Straight', itemCode: 'WIP-ST-011', weightPerPiece: 0.01049 },
  targetQuantity: 30240,
  actualQuantity: 25400, // 15,000 + 10,400
  scrapQuantity: 0.4182, // entry-level, allocated to NO child
  nestedItems: [
    { lineNumber: 1, itemCode: 'WIP-ST-011', itemName: '250*17 Outer Straight', uomCode: 'PCS',
      actualQuantity: 15000, scrapQuantity: 0, weightPerPiece: 0.01049, weightPerMeter: null },
    { lineNumber: 2, itemCode: 'WIP-ST-001', itemName: 'CD-250*17 Butted', uomCode: 'PCS',
      actualQuantity: 10400, scrapQuantity: 0, weightPerPiece: 0.00967, weightPerMeter: null },
  ],
});

/* SPK-02 — a 3-item packing document, the shape the brief calls out. */
const THREE_ITEM = makeRow({
  machineNo: 'SPK-02',
  targetQuantity: 1000,
  actualQuantity: 600, // 300 + 200 + 100
  scrapQuantity: 12, // entry-level, allocated to NO child
  nestedItems: [
    { lineNumber: 1, itemCode: 'SP-40', itemName: 'Spoke 40T', uomCode: 'PCS',
      actualQuantity: 300, scrapQuantity: 0, weightPerPiece: 0.05, weightPerMeter: null },
    { lineNumber: 2, itemCode: 'SP-50', itemName: 'Spoke 50T', uomCode: 'PCS',
      actualQuantity: 200, scrapQuantity: 0, weightPerPiece: 0.06, weightPerMeter: null },
    { lineNumber: 3, itemCode: 'SP-60', itemName: 'Spoke 60T', uomCode: 'PCS',
      actualQuantity: 100, scrapQuantity: 0, weightPerPiece: 0.07, weightPerMeter: null },
  ],
});

/* SPK-03 — control: ONE child, which is a byte-for-byte copy of its parent. */
const SINGLE_ITEM = makeRow({
  machineNo: 'SPK-03',
  targetQuantity: 1000,
  actualQuantity: 1000,
  scrapQuantity: 5,
  nestedItems: [
    { lineNumber: 1, itemCode: 'SP-40', itemName: 'Spoke 40T', uomCode: 'PCS',
      actualQuantity: 1000, scrapQuantity: 5, weightPerPiece: 0.05, weightPerMeter: null },
  ],
});

const MIXED: ReportRowSource[] = [TWO_ITEM, THREE_ITEM, SINGLE_ITEM];
const report: DailyProductionReport = buildDailyProductionReport(MIXED, opts());

const lineOf = (machineNo: string) => {
  for (const section of report.sections) {
    for (const line of section.lines) if (line.machine === machineNo) return line;
  }
  throw new Error(`no report line for ${machineNo}`);
};

/* ------------------------------------------------------------------ *
 * 0. The shared gate
 * ------------------------------------------------------------------ */
describe('Multi-item exports — the shared gate', () => {
  it('lets ONE threshold drive the grid toggle and every export surface', () => {
    expect(MULTI_ITEM_THRESHOLD).toBe(2);
  });

  it('expands only documents holding 2 or more produced lines', () => {
    expect(isMultiItemLine(lineOf('ST-05'))).toBe(true);
    expect(isMultiItemLine(lineOf('SPK-02'))).toBe(true);
    // A single child is its parent verbatim — expanding it would duplicate.
    expect(isMultiItemLine(lineOf('SPK-03'))).toBe(false);
    expect(isMultiItemLine({} as ReportRowSource)).toBe(false);
    expect(isMultiItemLine(null)).toBe(false);
  });

  it('keeps every child line, in line order, with its own unit weight', () => {
    const subs = nestedLinesOf(lineOf('ST-05'));
    expect(subs.map((s) => s.itemCode)).toEqual(['WIP-ST-011', 'WIP-ST-001']);
    expect(subs[0]).toMatchObject({ lineNumber: 1, actual: 15000, actualKg: 157.35 });
    expect(subs[1]).toMatchObject({ lineNumber: 2, actual: 10400, actualKg: 100.568 });
  });
});

/* ------------------------------------------------------------------ *
 * 1. WEIGHT roll-up — the parent must equal the sum of its children
 * ------------------------------------------------------------------ */
describe('Multi-item exports — parent weight roll-up', () => {
  it('sums the children instead of applying child #1 weight to every piece', () => {
    const line = lineOf('ST-05');
    // Naive (old) figure: 25,400 × 0.01049 — child #1's rate on child #2's pieces.
    const naive = 25400 * 0.01049;
    expect(line.actualKg).toBeCloseTo(257.918, 3); // 15,000×.01049 + 10,400×.00967
    expect(line.actualKg).not.toBeCloseTo(naive, 2);
  });

  it('still reports the DOCUMENT total for pieces', () => {
    expect(lineOf('ST-05').actual).toBe(25400);
  });

  it('does NOT roll scrap up from the children — it would delete stock', () => {
    const line = lineOf('ST-05');
    // Children report 0 scrap; the entry holds 0.4182 PCS. The parent keeps it.
    expect(line.rejection).toBe(0.4182);
    expect(line.rejectionKg).toBeCloseTo(0.0044, 4);
  });

  it('leaves a single-item document untouched (no roll-up, no sub-rows)', () => {
    const line = lineOf('SPK-03');
    expect(line.actualKg).toBeCloseTo(50, 6); // 1,000 × 0.05
    expect(nestedLinesOf(line).length).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * 2. WINDOW PRINT — sub-rows baked into the printed document
 * ------------------------------------------------------------------ */
describe('Multi-item exports — window print', () => {
  const html = buildPrintHtml(report);

  it('emits one sub-row per nested item, with none for single-item rows', () => {
    expect(html.match(/<tr class="rp-sub">/g) || []).toHaveLength(5); // 2 + 3 + 0
    expect(html.match(/class="[^"]*rp-sub-ind"/g) || []).toHaveLength(5);
    expect(html).toContain('WIP-ST-001');
    expect(html).toContain('SP-50');
    expect(html).toContain('SP-60');
  });

  it('shows each part directly beneath its parent entry', () => {
    const blocks = html.match(/<tr class="rp-sub">[\s\S]*?<\/tr>/g) || [];
    expect(blocks).toHaveLength(5);
    // The two sub-rows of ST-05 sit together, under a parent naming WIP-ST-011.
    expect(blocks[0]).toContain('WIP-ST-011');
    expect(blocks[1]).toContain('WIP-ST-001');
    expect(html.indexOf('class="rp-sub"')).toBeGreaterThan(html.indexOf('ST-05'));
  });

  it('never repeats the parent TARGET or /h baseline on a sub-row', () => {
    const blocks = (html.match(/<tr class="rp-sub">[\s\S]*?<\/tr>/g) || []).join('');
    expect(blocks).not.toContain('30,240');
    expect(blocks).not.toContain('/h');
  });

  it('carries the per-item pieces, weight and scrap into the sub-row', () => {
    const blocks = html.match(/<tr class="rp-sub">[\s\S]*?<\/tr>/g) || [];
    expect(blocks[1]).toContain('10,400'); // good pieces
    expect(blocks[1]).toContain('0.00967'); // per-unit weight
    expect(blocks[1]).toContain('100.57'); // Actual KG
  });

  it('forces the sub-rows visible in the print stylesheet, on a hairline', () => {
    expect(html).toContain('display: table-row !important; visibility: visible !important;');
    expect(html).toContain('height: auto !important;');
    expect(html).toContain('border-bottom: 1px solid #e2e8f0 !important;');
    expect(html).toContain('break-inside: avoid; page-break-inside: avoid;');
  });

  it('keeps the parent on screen too, so paper stays hierarchical', () => {
    // Parent row still shows the document total; sub-rows are the breakdown.
    expect(html).toContain('25,400');
  });
});

/* ------------------------------------------------------------------ *
 * 3. jsPDF AUTOTABLE — sub-rows with an indented item cell
 * ------------------------------------------------------------------ */
describe('Multi-item exports — PDF autoTable sub-rows', () => {
  const idx = (key: string) => report.columns.findIndex((c) => c.key === key);

  it('indents the sub-row item name with non-breaking spaces', () => {
    const sub = nestedLinesOf(lineOf('ST-05'))[1];
    const row = pdfSubRow(report.columns, sub);
    const cell = row[idx('item')] as { content: string; sub: string };
    expect(String(cell.content)).toContain('\u00A0\u00A0');
    expect(String(cell.content)).toContain('CD-250*17 Butted');
    expect(cell.sub).toBe('WIP-ST-001');
  });

  it('maps the sub-row pieces, weight and scrap down the grid columns', () => {
    const sub = nestedLinesOf(lineOf('ST-05'))[1];
    const row = pdfSubRow(report.columns, sub) as any[];
    expect(row[idx('actual')]).toBe('10,400');
    expect(row[idx('weight')].sub).toBe('100.57');
    expect(row[idx('rejectionScrap')].sub).toBeDefined();
  });

  it('leaves TARGET and Achievement blank so the parent stays authoritative', () => {
    const sub = nestedLinesOf(lineOf('ST-05'))[1];
    const row = pdfSubRow(report.columns, sub);
    expect(row[idx('target')]).toBe('');
    expect(row[idx('achievement')]).toBe('');
    expect(row[idx('machine')]).toBe('');
    expect(row[idx('operator')]).toBe('');
  });

  it('emits exactly one sub-row per child — three parts, three sub-rows', () => {
    const subs = nestedLinesOf(lineOf('SPK-02'));
    expect(subs).toHaveLength(3);
    expect(subs.map((s) => pdfSubRow(report.columns, s))).toHaveLength(3);
  });
});

/* ------------------------------------------------------------------ *
 * 4. EXCEL / CSV — flat, normalized, one row per part
 * ------------------------------------------------------------------ */
describe('Multi-item exports — Excel (CSV) flat rows', () => {
  const lines = buildDailyProductionCsv(report).replace(/^\uFEFF/, '').split('\r\n');
  const dataRows = lines.filter((l) => /^\d+,/.test(l));
  const cell = (row: string, i: number) => row.split(',')[i];

  // ST-05 → 2 rows, SPK-02 → 3 rows, SPK-03 → 1 row. The parent row is
  // REPLACED, never emitted alongside its children.
  it('turns one 3-item entry into 3 independent consecutive rows', () => {
    expect(dataRows).toHaveLength(6);
    expect(dataRows.slice(2, 5).map((r) => cell(r, 4).replace(/\n/g, ' ')))
      .toEqual(['"Spoke 40T SP-40"', '"Spoke 50T SP-50"', '"Spoke 60T SP-60"']);
  });

  it('duplicates machine, operator and runtime across every row', () => {
    const block = dataRows.slice(2, 5);
    expect(block.map((r) => cell(r, 1))).toEqual(['SPK-02', 'SPK-02', 'SPK-02']);
    expect(block.map((r) => cell(r, 3))).toEqual(['OP-1', 'OP-1', 'OP-1']);
    expect(block.map((r) => cell(r, 9))).toEqual(block.map(() => cell(block[0], 9)));
  });

  it('swaps the per-part pieces, weight and UOM row by row', () => {
    const block = dataRows.slice(2, 5);
    expect(block.map((r) => cell(r, 6))).toEqual(['300', '200', '100']);
    expect(block.map((r) => cell(r, 8))).toEqual([
      '"0.05\n15"', '"0.06\n12"', '"0.07\n7"',
    ]);
    expect(block.map((r) => cell(r, 12))).toEqual(['PCS', 'PCS', 'PCS']);
  });

  it('keeps TARGET on the first row only, so the column still sums correctly', () => {
    const block = dataRows.slice(2, 5);
    expect(block.map((r) => cell(r, 5))).toEqual(['1000', '', '']);
    expect(block.reduce((sum, r) => sum + Number(cell(r, 5) || 0), 0)).toBe(1000);
  });

  it('carries the ENTRY scrap on the lead row so no rejected stock is lost', () => {
    const lead = dataRows[2];
    expect(cell(lead, 10)).toContain('0.6'); // 12 PCS × 0.05
    const twoItemLead = dataRows[0];
    expect(cell(twoItemLead, 10)).toContain('0.0044'); // 0.4182 × 0.01049
  });

  it('sums back to the document totals (no double counting, nothing dropped)', () => {
    const sumActual = dataRows.reduce((s, r) => s + Number(cell(r, 6)), 0);
    const sumTarget = dataRows.reduce((s, r) => s + Number(cell(r, 5) || 0), 0);
    expect(sumActual).toBe(25400 + 600 + 1000);
    expect(sumTarget).toBe(30240 + 1000 + 1000);
  });

  it('emits exactly ONE row for a single-item document', () => {
    const single = dataRows.filter((r) => cell(r, 1) === 'SPK-03');
    expect(single).toHaveLength(1);
    expect(cell(single[0], 6)).toBe('1000');
  });

  it('keeps the department total rows unchanged by the expansion', () => {
    // One shift total + one department grand total per department — the
    // expansion adds DATA rows, never extra totals.
    expect(lines.filter((l) => l.includes('TOTAL') && l.includes('Straightener'))).toHaveLength(2);
    expect(lines.filter((l) => l.includes('TOTAL') && l.includes('Spoke'))).toHaveLength(2);

    // …and each total still counts the document ONCE, not once per part.
    const dayTotal = lines.find((l) => l.startsWith('DAY SHIFT TOTAL') && l.includes('Straightener'))!;
    expect(cell(dayTotal, 5)).toBe('30240'); // Σ Target, not 2 × 30,240
    expect(cell(dayTotal, 6)).toBe('25400'); // Σ Actual, not 2 rows summed
    expect(cell(dayTotal, 8)).toContain('257.918'); // the rolled-up KG
  });
});

/* ------------------------------------------------------------------ *
 * 5. KPI card item footer — was silently truncated to child #1
 * ------------------------------------------------------------------ */
describe('Multi-item exports — executive KPI item footer', () => {
  it('lists EVERY produced part of a multi-item document', () => {
    const spoke = report.sections.find((s) => s.name === 'Spoke');
    expect(spoke).toBeDefined();
    const items = sectionItemTotals(spoke!);
    expect(items.map((i) => i.code)).toEqual(['SP-40', 'SP-50', 'SP-60']);
  });

  it('pools the parts without double counting the document total', () => {
    const spoke = report.sections.find((s) => s.name === 'Spoke')!;
    const items = sectionItemTotals(spoke);
    // SP-40 = SPK-02's child #1 (300) + SPK-03's single-item parent (1,000).
    expect(items[0]).toMatchObject({
      name: 'Spoke 40T',
      actualPcs: '1,300',
      actualKg: '65', // 15 + 50
    });
    expect(items[1]).toMatchObject({ actualPcs: '200', actualKg: '12' });
    expect(items[2]).toMatchObject({ actualPcs: '100', actualKg: '7' });
  });

  it('attributes the entry-level scrap remainder instead of dropping it', () => {
    const spoke = report.sections.find((s) => s.name === 'Spoke')!;
    const items = sectionItemTotals(spoke);
    // 12 KG unallocated on SPK-02 lands on its lead part; SPK-03 adds 5/0.25.
    expect(items[0].scrapPcs).toBe('17');
    expect(items[0].scrapKg).toBe('0.85');
    expect(items[0].hasScrap).toBe(true);
  });

  it('does not list a part twice for a single-item document', () => {
    const singleOnly = buildDailyProductionReport([SINGLE_ITEM], opts());
    const items = sectionItemTotals(singleOnly.sections[0]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: 'SP-40', actualPcs: '1,000', actualKg: '50' });
  });
});

/* ------------------------------------------------------------------ *
 * 6. Cross-surface reconciliation
 * ------------------------------------------------------------------ */
describe('Multi-item exports — the three surfaces agree', () => {
  it('gives print and Excel the same Σ Actual KG for a multi-item doc', () => {
    const line = lineOf('ST-05');
    const printKg = line.actualKg ?? 0;
    const excelKg = nestedLinesOf(line).reduce((s, sub) => s + (sub.actualKg ?? 0), 0);
    expect(excelKg).toBeCloseTo(printKg, 3);
  });

  it('keeps a night-shift multi-item document expandable too', () => {
    const night = makeRow({
      shift: NIGHT,
      machineNo: 'SPK-04',
      actualQuantity: 300,
      nestedItems: THREE_ITEM.nestedItems,
    });
    const m = buildDailyProductionReport([night], opts());
    expect(isMultiItemLine(m.sections[0].lines[0])).toBe(true);
    expect(buildPrintHtml(m).match(/<tr class="rp-sub">/g) || []).toHaveLength(3);
  });
});
