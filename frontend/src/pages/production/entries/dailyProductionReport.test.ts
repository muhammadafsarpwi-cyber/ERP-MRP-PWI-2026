import {
  ACHIEVEMENT_THRESHOLD,
  DEPARTMENT_ORDER,
  EXECUTIVE_TITLE,
  TONE_GLYPH,
  achievementTone,
  buildDailyProductionReport,
  buildDailyProductionCsv,
  buildPrintHtml,
  classifyShift,
  compareMachineNo,
  departmentRank,
  executiveKpis,
  executiveSummaryHtml,
  grandTotalLabel,
  pdfLineRow,
  pdfSummaryRow,
  PDF_MAIN_TEXT,
  PDF_MUTED_TEXT,
  PDF_SUB_TEXT,
  reportCellSubText,
  reportCellText,
  reportLabelSpan,
  reportTotalSubText,
  reportTwoLineHtml,
  reportTotalText,
  sectionBlocks,
  TONE_COLOR,
  type DailyProductionReport,
  type ReportOptions,
  type ReportRowSource,
} from './dailyProductionReport';

/* ------------------------------------------------------------------ *
 * Fixtures — deliberately shuffled so the builder has to group + sort.
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
  achievementPercentage: null, // derived from target/actual
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

const rows: ReportRowSource[] = [
  makeRow({ department: { name: 'Swagging', departmentCode: 'SW' }, machineNo: 'SW-01', targetQuantity: 3000, actualQuantity: 1500 }),
  makeRow({ machineNo: 'SPK-10', targetQuantity: 1000, actualQuantity: 1200, scrapQuantity: 10, downtimeHours: 2, downtimeReasonText: 'Coil change' }),
  makeRow({ machineNo: 'SPK-02', targetQuantity: 500, actualQuantity: 250 }),
  makeRow({ department: { name: 'Straightener', departmentCode: 'ST' }, machineNo: 'ST-01', targetQuantity: 4000, actualQuantity: 4400, scrapQuantity: 5 }),
  makeRow({ machineNo: 'SPK-01', targetQuantity: 2000, actualQuantity: 2000, scrapQuantity: 20 }),
  // Night shift rows for the same department (same machine as a day row).
  makeRow({ shift: NIGHT, machineNo: 'SPK-01', targetQuantity: 1000, actualQuantity: 900 }),
  makeRow({ shift: NIGHT, machineNo: 'SPK-03', targetQuantity: 1000, actualQuantity: 100 }),
  // Real department names of this system — must map onto the fixed sequence.
  makeRow({ department: { name: 'Spoke Plating', departmentCode: 'SPD-DEPT006' }, machineNo: 'PL-01' }),
  makeRow({ department: { name: 'Spoke Packing', departmentCode: 'SPD-DEPT008' }, machineNo: 'PK-01' }),
  // A department outside the fixed sequence + a long breakdown on a missed target.
  makeRow({ department: { name: 'Flattening', departmentCode: 'CCD-DEPT001' }, machineNo: 'FL-01', targetQuantity: 1000, actualQuantity: 500, downtimeHours: 8, downtimeReasonText: 'Wire jam' }),
];

const model = () => buildDailyProductionReport(rows, opts());

/* ------------------------------------------------------------------ *
 * 1. Column structure (Phase 6 order)
 * ------------------------------------------------------------------ */
describe('Daily Production Report — columns', () => {
  it('uses the specified order: Shift + Machine + OT lead, REJECTION / SCRAP last', () => {
    expect(model().columns.map((c) => c.label)).toEqual([
      'Sr. #', 'Shift', 'Machine', 'OT (H)', 'Operator', 'Item / Product',
      'Target', 'Actual', 'Achievement %', 'WEIGHT (KG)',
      'Breakdown Reason / Status', 'REJECTION / SCRAP',
    ]);
  });

  it('keeps Shift 2nd, OT beside the machine params, and Achievement before the fused columns', () => {
    const keys = model().columns.map((c) => c.key);
    expect(keys[1]).toBe('shift');
    expect(keys[2]).toBe('machine');
    expect(keys[3]).toBe('ot'); // OT (H) audits the extra hours right after Machine
    expect(keys.indexOf('achievement')).toBeLessThan(keys.indexOf('weight'));
    expect(keys.indexOf('weight')).toBeLessThan(keys.indexOf('status'));
    expect(keys.indexOf('status')).toBeLessThan(keys.indexOf('rejectionScrap'));
  });

  it('always totals 100% width and merges the first 5 columns for totals', () => {
    const m = model();
    expect(m.columns.reduce((s, c) => s + c.width, 0)).toBe(100);
    // Sr. # + Shift + Machine + OT + Operator
    expect(reportLabelSpan(m.columns)).toBe(5);
  });

  it('adds a Date column only when the export spans more than one day', () => {
    expect(model().showDate).toBe(false);
    const multi = buildDailyProductionReport(
      [rows[0], makeRow({ entryDate: '2026-10-03' })],
      opts({ dateFrom: null, dateTo: null }),
    );
    expect(multi.showDate).toBe(true);
    expect(multi.columns.map((c) => c.label)).toContain('Date');
    expect(multi.columns.reduce((s, c) => s + c.width, 0)).toBe(100);
    expect(reportLabelSpan(multi.columns)).toBe(5);
  });
});

/* ------------------------------------------------------------------ *
 * 1b. PHASE 7 — two-line Item / Shift cells + Rejection %
 * ------------------------------------------------------------------ */
describe('Daily Production Report — Phase 7 cell cleanup', () => {
  const line = (machine: string) =>
    model().sections.flatMap((s) => s.lines).find((l) => l.machine === machine)!;

  it('splits the Item cell into name (line 1) and code (line 2), never Name (CODE)', () => {
    const spokeLine = line('SPK-10');
    expect(spokeLine.item).toBe('Spoke 40T');
    expect(spokeLine.itemCode).toBe('SP-40');
    expect(reportCellText(spokeLine, 'item')).toBe('Spoke 40T');
    expect(reportCellSubText(spokeLine, 'item')).toBe('SP-40');
    expect(reportTwoLineHtml(spokeLine, 'item')).toBe(
      '<span class="rp-item-name">Spoke 40T</span><span class="rp-item-code">SP-40</span>',
    );
    expect(buildPrintHtml(model())).not.toContain('Spoke 40T (SP-40)');
  });

  it('shows the shift name on line 1 and the shift timing (or -) on line 2', () => {
    const sp = line('SPK-10');
    expect(sp.shift).toBe('SHIFT-A');
    expect(sp.shiftTime).toBe('-'); // the fixture rows carry no shift window
    expect(reportCellSubText(sp, 'shift')).toBe('-');
    expect(reportTwoLineHtml(sp, 'shift')).toBe(
      '<span class="rp-shift-name">SHIFT-A</span><span class="rp-shift-time">-</span>',
    );

    const timed = buildDailyProductionReport(
      [makeRow({ shift: { name: 'Day Shift', shiftCode: 'DAY', startTime: '06:00:00', endTime: '14:00:00' } })],
      opts(),
    ).sections[0].lines[0];
    expect(timed.shiftTime).toBe('06:00 - 14:00');
    expect(reportTwoLineHtml(timed, 'shift')).toContain('>06:00 - 14:00<');

    // EntryList resolves the timing from the shift master when asked to.
    const resolved = buildDailyProductionReport(
      [makeRow({ shift: { name: 'Night Shift', shiftCode: 'NIGHT' } })],
      opts({ shiftTiming: () => '22:00 - 06:00' }),
    ).sections[0].lines[0];
    expect(resolved.shiftTime).toBe('22:00 - 06:00');
  });

  it('fuses Rejection KG + Rejection % into ONE stacked column', () => {
    const spoke10 = line('SPK-10');
    // 0.5 KG rejected out of 60.5 KG produced (60 good + 0.5 scrap) → 0.83%
    expect(spoke10.rejectionPct).toBe(0.83);
    expect(reportCellText(spoke10, 'rejectionScrap')).toBe('0.5'); // line 1 — flat KG
    expect(reportCellSubText(spoke10, 'rejectionScrap')).toBe('0.83%'); // line 2 — the fixed %
    expect(reportTwoLineHtml(spoke10, 'rejectionScrap')).toBe(
      '<span class="rp-rj-top">0.5</span><span class="rp-rj-bottom">0.83%</span>',
    );
    // SPK-01: 1 KG out of 101 KG produced → 0.99%. The retired
    // `/ Actual KG` maths reported 1.00% here, which is the bug being fixed.
    expect(reportCellSubText(line('SPK-01'), 'rejectionScrap')).toBe('0.99%');
    expect(reportCellSubText(line('SPK-02'), 'rejectionScrap')).toBe('0.00%');
    // Totals pool both KG figures BEFORE dividing: 1.75 / (642.5 + 1.75).
    expect(reportTotalText(model().grand, 'rejectionScrap')).toBe('1.75');
    expect(reportTotalSubText(model().grand, 'rejectionScrap')).toBe('0.27%');
    // The two standalone columns are gone.
    expect(model().columns.some((c) => c.label === 'Rejection (KG)')).toBe(false);
    expect(model().columns.some((c) => c.label === 'Rejection %')).toBe(false);
    expect(model().columns.some((c) => c.label === 'REJECTION / SCRAP')).toBe(true);
  });

  it('reads a zero-good run as 100.00% and a zero TOTAL as 0.00%', () => {
    const zero = buildDailyProductionReport(
      [makeRow({ actualQuantity: 0, scrapQuantity: 20 })],
      opts(),
    );
    // 1 KG rejected out of 1 KG produced (nothing good) — all scrap → 100.00%
    expect(zero.sections[0].lines[0].rejectionPct).toBe(100);
    expect(reportCellSubText(zero.sections[0].lines[0], 'rejectionScrap')).toBe('100.00%');
    expect(reportTotalSubText(zero.grand, 'rejectionScrap')).toBe('100.00%');
    // …and when NEITHER operand exists the divide-by-zero guard still holds.
    const nothing = buildDailyProductionReport(
      [makeRow({ actualQuantity: 0, scrapQuantity: 0 })],
      opts(),
    );
    expect(nothing.grand.rejectionPct).toBe(0);
    expect(reportTotalSubText(nothing.grand, 'rejectionScrap')).toBe('0.00%');
  });
});

/* ------------------------------------------------------------------ *
 * 1c. COMPACT 2-LINE RHYTHM — width budget, bare per-unit weight
 * ------------------------------------------------------------------ */
describe('Daily Production Report — compact 2-line layout', () => {
  const width = (key: string) => model().columns.find((c) => c.key === key)!.width;

  it('funds the new OT (H) column from Operator + Item and still totals 100', () => {
    expect(width('item')).toBe(20); // 22 → 20; a product name still fits one line
    expect(width('shift')).toBe(9); // name on line 1, timing on line 2
    expect(width('machine')).toBe(5);
    expect(width('ot')).toBe(5); // the injected column
    expect(width('operator')).toBe(6); // gave up 1% to OT
    // The two fused columns keep the space their halves used to own.
    expect(width('weight')).toBe(11); // 5 (per unit) + 6 (actual KG)
    expect(width('rejectionScrap')).toBe(10);
    // and the budget still adds up to exactly 100
    expect(model().columns.reduce((s, c) => s + c.width, 0)).toBe(100);
  });

  it('prints the bare per-unit weight — no KG/PCS suffix on any surface', () => {
    const spoke = model().sections.flatMap((s) => s.lines).find((l) => l.machine === 'SPK-01')!;
    expect(reportCellText(spoke, 'weight')).toBe('0.05');
    expect(buildPrintHtml(model())).not.toContain('KG/PCS');
    expect(buildDailyProductionCsv(model())).not.toContain('KG/PCS');
  });

  it('caps every printed cell at 2 lines (nowrap two-line cells + clamp)', () => {
    const html = buildPrintHtml(model());
    // line 1 / line 2 of the FOUR fused cells can never wrap …
    expect(html).toContain(
      '.rp-item-name, .rp-item-code, .rp-shift-name, .rp-shift-time,\n  .rp-wt-top, .rp-wt-bottom, .rp-rj-top, .rp-rj-bottom {',
    );
    expect(html).toContain('white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');
    // … long free text (operator, runtime reason) is hard-clamped to 2 …
    expect(html).toContain('.rp-clamp2 { display: -webkit-box; -webkit-line-clamp: 2;');
    expect(html).toContain('<span class="rp-clamp2">');
    // … and a narrow header breaks BETWEEN words, never through one.
    expect(html).toContain('word-break: normal; overflow-wrap: break-word;');
  });
});

/* ------------------------------------------------------------------ *
 * 1d. FUSED WEIGHT (KG) COLUMN + the injected OT (H) column
 * ------------------------------------------------------------------ */
describe('Daily Production Report — WEIGHT (KG) fusion & OT (H)', () => {
  const line = (machine: string) =>
    model().sections.flatMap((s) => s.lines).find((l) => l.machine === machine)!;

  it('stacks Per Unit Weight on top (small) and Actual KG below (bold)', () => {
    const spoke = line('SPK-01'); // 2,000 pcs × 0.05 KG/PCS = 100 KG
    expect(reportCellText(spoke, 'weight')).toBe('0.05'); // line 1 — per unit
    expect(reportCellSubText(spoke, 'weight')).toBe('100'); // line 2 — actual KG
    expect(reportTwoLineHtml(spoke, 'weight')).toBe(
      '<span class="rp-wt-top">0.05</span><span class="rp-wt-bottom">100</span>',
    );
    // …and the print CSS carries the reversed emphasis (muted top / bold bottom).
    const html = buildPrintHtml(model());
    expect(html).toContain('.rp-wt-top { display: block; font-weight: 400; color: #64748b; }');
    expect(html).toContain('.rp-wt-bottom { display: block; font-weight: 700; color: #0f172a; }');
    expect(html).toContain('<span class="rp-wt-top">0.05</span><span class="rp-wt-bottom">100</span>');
  });

  it('shows `—` over Σ Actual KG in the total rows (a per-unit weight is not summable)', () => {
    expect(reportTotalText(model().grand, 'weight')).toBe('—');
    expect(reportTotalSubText(model().grand, 'weight')).toBe('642.5');
    const html = buildPrintHtml(model());
    expect(html).toContain('<span class="rp-wt-top">—</span><span class="rp-wt-bottom">642.5</span>');
  });

  it('reads OT (H) from the canonical overtime rule, never from running hours', () => {
    expect(reportCellText(line('SPK-01'), 'ot')).toBe('—'); // no OT on the fixture rows
    const ot = buildDailyProductionReport([makeRow({ overtimeHours: 2.5 })], opts()).sections[0].lines[0];
    expect(ot.ot).toBe(2.5);
    expect(reportCellText(ot, 'ot')).toBe('2.5h');
    // A legacy row whose OT survives only in remarks still audits it.
    const legacy = buildDailyProductionReport([makeRow({ remarks: 'OT: 3 h' })], opts()).sections[0].lines[0];
    expect(reportCellText(legacy, 'ot')).toBe('3h');
    expect(reportTotalText(model().grand, 'ot')).toBe('—');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Fixed department sequence
 * ------------------------------------------------------------------ */
describe('Daily Production Report — department order', () => {
  it('ranks Straightener → Swagging → Spoke → Plating → Packing', () => {
    expect([...DEPARTMENT_ORDER]).toEqual(['Straightener', 'Swagging', 'Spoke', 'Plating', 'Packing']);
    expect(departmentRank('Straightener')).toBe(0);
    expect(departmentRank('Swagging')).toBe(1);
    expect(departmentRank('Spoke')).toBe(2);
    expect(departmentRank('Plating')).toBe(3);
    expect(departmentRank('Packing')).toBe(4);
  });

  it('maps real department names with the LONGEST keyword (Spoke Plating → Plating)', () => {
    expect(departmentRank('Spoke Plating')).toBe(3);
    expect(departmentRank('Nipple Plating')).toBe(3);
    expect(departmentRank('Spoke Packing')).toBe(4);
    expect(departmentRank('Nipple Packing')).toBe(4);
    expect(departmentRank('Cutting & Packing')).toBe(4);
    expect(departmentRank('Flattening')).toBe(DEPARTMENT_ORDER.length); // keeps its name, prints last
  });

  it('prints the sections in the production sequence, not A→Z', () => {
    expect(model().sections.map((s) => s.name)).toEqual([
      'Straightener', 'Swagging', 'Spoke', 'Spoke Plating', 'Spoke Packing', 'Flattening',
    ]);
    // A→Z would have been: Flattening, Spoke, Spoke Packing, Spoke Plating, Straightener, Swagging
    expect(model().sections[0].lines).toHaveLength(1);
    expect(model().sections[2].lines).toHaveLength(5);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Two-level sort: shift (Day → Night), then machine ascending
 * ------------------------------------------------------------------ */
describe('Daily Production Report — shift grouping & machine order', () => {
  const spoke = model().sections.find((s) => s.name === 'Spoke')!;

  it('classifies this system’s shifts (keywords first, then start hour)', () => {
    expect(classifyShift({ name: 'Shift C (Night)' })).toBe('NIGHT');
    expect(classifyShift({ name: 'General Shift   (Night)' })).toBe('NIGHT');
    expect(classifyShift({ name: 'Shift A (Morning)' })).toBe('DAY');
    expect(classifyShift({ name: 'Shift B (Afternoon)' })).toBe('DAY');
    expect(classifyShift({ name: 'General Shift (Day)' })).toBe('DAY');
    expect(classifyShift({ name: 'E2E 12h Shift', startTime: '06:00:00' })).toBe('DAY');
    expect(classifyShift({ name: 'General Shift', startTime: '20:30:00' })).toBe('NIGHT');
    expect(classifyShift(undefined)).toBe('DAY'); // Day Shift always prints first
  });

  it('splits the department into a Day group and a Night group, Day first', () => {
    expect(spoke.shiftGroups.map((g) => g.kind)).toEqual(['DAY', 'NIGHT']);
    expect(spoke.shiftGroups.map((g) => g.label)).toEqual(['Day Shift', 'Night Shift']);
    expect(spoke.shiftGroups[0].lines.map((l) => l.machine)).toEqual(['SPK-01', 'SPK-02', 'SPK-10']);
    expect(spoke.shiftGroups[1].lines.map((l) => l.machine)).toEqual(['SPK-01', 'SPK-03']);
    expect(spoke.lines.map((l) => l.machine)).toEqual([
      'SPK-01', 'SPK-02', 'SPK-10', 'SPK-01', 'SPK-03',
    ]);
  });

  it('omits a shift group that has no entries', () => {
    const flat = model().sections.find((s) => s.name === 'Flattening')!;
    expect(flat.shiftGroups.map((g) => g.kind)).toEqual(['DAY']);
  });

  it('numbers rows sequentially across departments after sorting', () => {
    expect(model().sections.flatMap((s) => s.lines.map((l) => l.sr))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('keeps the natural machine compare (SPK-02 before SPK-10)', () => {
    expect(compareMachineNo('SPK-02', 'SPK-10')).toBeLessThan(0);
    expect(compareMachineNo('SW-10', 'SW-9')).toBeGreaterThan(0);
  });

  it('exposes Day / Night / Department blocks for the three export surfaces', () => {
    expect(sectionBlocks(spoke).map((b) => b.label)).toEqual([
      'DAY SHIFT TOTAL — Spoke',
      'NIGHT SHIFT TOTAL — Spoke',
      'DEPARTMENT GRAND TOTAL — Spoke',
    ]);
    expect(sectionBlocks(spoke)[0].kind).toBe('shift');
    expect(sectionBlocks(spoke)[2].lines).toHaveLength(0);
    expect(sectionBlocks(model().sections[5]).map((b) => b.label)).toEqual([
      'DAY SHIFT TOTAL — Flattening',
      'DEPARTMENT GRAND TOTAL — Flattening',
    ]);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Totals: per shift, per department, grand (all weighted)
 * ------------------------------------------------------------------ */
describe('Daily Production Report — shift & department totals', () => {
  const spoke = model().sections.find((s) => s.name === 'Spoke')!;

  it('sums each shift separately', () => {
    const [day, night] = spoke.shiftGroups;
    expect(day.totals).toMatchObject({ entries: 3, machines: 3, target: 3500, actual: 3450, rejection: 30 });
    expect(day.totals.actualKg).toBe(172.5); // 3450 × 0.05 KG/PCS
    expect(day.totals.rejectionKg).toBe(1.5);
    expect(day.totals.achievement).toBe(98.57); // ΣActual / ΣTarget

    expect(night.totals).toMatchObject({ entries: 2, machines: 2, target: 2000, actual: 1000, achievement: 50 });
    expect(night.totals.actualKg).toBe(50);
  });

  it('rolls the shifts into the department total with a weighted achievement', () => {
    expect(spoke.totals).toMatchObject({ entries: 5, machines: 4, target: 5500, actual: 4450, actualKg: 222.5, rejection: 30, rejectionKg: 1.5 });
    expect(spoke.totals.achievement).toBe(80.91); // 4450 / 5500 — not a mean of 98.57 and 50
  });

  it('accumulates everything into the grand total', () => {
    expect(model().grand).toMatchObject({
      departments: 6, entries: 10, machines: 9,
      target: 15500, actual: 12850, actualKg: 642.5,
      rejection: 35, rejectionKg: 1.75, achievement: 82.9,
    });
    expect(grandTotalLabel(model().sections.length)).toBe('GRAND TOTAL — 6 departments');
  });
});

/* ------------------------------------------------------------------ *
 * 5. Achievement indicators + breakdown / status column
 * ------------------------------------------------------------------ */
describe('Daily Production Report — achievement arrows & breakdown column', () => {
  const line = (machine: string) =>
    model().sections.flatMap((s) => s.lines).find((l) => l.machine === machine)!;

  it('tones the achievement at 70% (>= 70 up, < 70 down)', () => {
    expect(ACHIEVEMENT_THRESHOLD).toBe(70);
    expect(achievementTone(70)).toBe('up');
    expect(achievementTone(69.99)).toBe('down');
    expect(achievementTone(null)).toBeNull();
    expect(TONE_GLYPH).toEqual({ up: '▲', down: '▼' });
    expect(line('SPK-10').achievement).toBe(120);
    expect(line('SPK-02').achievement).toBe(50);
  });

  it('appends the green ▲ / red ▼ glyph to the printed percentage', () => {
    expect(reportCellText(line('SPK-10'), 'achievement')).toBe('120.0% ▲');
    expect(reportCellText(line('SPK-02'), 'achievement')).toBe('50.0% ▼');
    expect(reportTotalText(model().sections[0].totals, 'achievement')).toBe('110.0% ▲');
  });

  it('renders the live runtime summary, never the static status word', () => {
    // These fixture rows carry no shift plan, so the share falls back to the
    // hours the row itself accounts for.
    expect(reportCellText(line('FL-01'), 'status')).toBe('0 hrs Running (0%) / 8 hrs Breakdown - Wire jam');
    expect(reportCellText(line('SPK-10'), 'status')).toBe('0 hrs Running (0%) / 2 hrs Breakdown - Coil change');
    // A row with no hour data at all must not invent a confident "100%".
    expect(reportCellText(line('SPK-03'), 'status')).toBe('—');
    // The raw status survives as DATA but is never rendered.
    expect(line('SPK-01').status).toBe('COMPLETED');
    expect(reportCellText(line('SPK-01'), 'status')).not.toContain('COMPLETED');
  });

  it('computes the runtime % against Planned + Overtime (the spec examples)', () => {
    // 0.5h breakdown on a 12h available cycle → 11.5 hrs Running (95.8%).
    const cycle = buildDailyProductionReport(
      [
        makeRow({
          shift: { name: 'Day Shift', shiftCode: 'DAY', plannedHours: 12 },
          downtimeHours: 0.5,
          downtimeReasonText: 'Coil change',
        }),
      ],
      opts(),
    ).sections[0].lines[0];
    expect(reportCellText(cycle, 'status')).toBe(
      '11.5 hrs Running (95.8%) / 0.5 hrs Breakdown - Coil change',
    );

    // Zero downtime on an 8h plan → the breakdown half disappears entirely.
    const clean = buildDailyProductionReport(
      [makeRow({ shift: { name: 'Day Shift', shiftCode: 'DAY', plannedHours: 8 } })],
      opts(),
    ).sections[0].lines[0];
    expect(reportCellText(clean, 'status')).toBe('8 hrs Running (100%)');
  });

  it('widens the available cycle by the OT hours (8h plan + 2h OT − 2h down)', () => {
    const ot = buildDailyProductionReport(
      [
        makeRow({
          shift: { name: 'Day Shift', shiftCode: 'DAY', plannedHours: 8 },
          overtimeHours: 2,
          downtimeHours: 2,
        }),
      ],
      opts(),
    ).sections[0].lines[0];
    expect(ot.ot).toBe(2);
    expect(reportCellText(ot, 'status')).toBe('8 hrs Running (80%) / 2 hrs Breakdown');
  });

  it('keeps a logged remark even when the row carries no hour data at all', () => {
    const noted = buildDailyProductionReport(
      [makeRow({ downtimeReasonText: 'Coil jam cleared' })],
      opts(),
    ).sections[0].lines[0];
    // An operator's remark is real information — it is never discarded just
    // because no hours were logged alongside it.
    expect(reportCellText(noted, 'status')).toBe('Coil jam cleared');
  });

  it('drops the warning comment and the "No reason logged" placeholder', () => {
    expect(line('FL-01').achievement).toBe(50); // still below the 70% threshold…
    expect(reportCellText(line('FL-01'), 'status')).not.toContain('Below 70% target');
    expect(reportCellText(line('FL-01'), 'status')).not.toContain('⚠');
    const noReason = buildDailyProductionReport(
      [makeRow({ downtimeHours: 8, downtimeReasonText: null })],
      opts(),
    );
    expect(reportCellText(noReason.sections[0].lines[0], 'status')).toBe('0 hrs Running (0%) / 8 hrs Breakdown');
  });

  it('keeps the PDF variant ASCII (jsPDF embeds WinAnsi fonts)', () => {
    const pdfCells = model().sections.flatMap((s) =>
      s.lines.flatMap((l) => model().columns.map((c) => reportCellText(l, c.key, 'pdf'))),
    );
    expect(pdfCells.join('')).not.toMatch(/[▲▼⚠]/);
    expect(reportCellText(line('FL-01'), 'achievement', 'pdf')).toBe('50.0%');
    expect(reportCellText(line('FL-01'), 'status', 'pdf')).toBe('0 hrs Running (0%) / 8 hrs Breakdown - Wire jam');
    expect(reportTotalText(model().sections[2].totals, 'achievement', 'pdf')).toBe('80.9%');
    expect(reportTotalText(model().sections[2].totals, 'achievement')).toBe('80.9% ▲');
  });
});

/* ------------------------------------------------------------------ *
 * 6. Dynamic header (division + the exact selected date)
 * ------------------------------------------------------------------ */
describe('Daily Production Report — header', () => {
  it('shows the selected division, the report title and the selected date', () => {
    const m = model();
    expect(m.title).toBe('Daily Production Report');
    expect(m.divisionLabel).toBe('Division: Rims Division');
    expect(m.dateLabel).toBe('Date: 2026-10-02');
    expect(m.generatedLabel).toBe('Generated: 02 Oct 2026, 06:00');
    expect(m.metaLine).toBe('10 entries · 6 departments');
  });

  it('changes the date label with the filter selection', () => {
    expect(buildDailyProductionReport(rows, opts({ dateFrom: '2026-10-05', dateTo: '2026-10-05' })).dateLabel)
      .toBe('Date: 2026-10-05');
    expect(buildDailyProductionReport(rows, opts({ dateFrom: '2026-10-01', dateTo: '2026-10-07' })).dateLabel)
      .toBe('Date: 2026-10-01 to 2026-10-07');
    expect(buildDailyProductionReport(rows, opts({ dateFrom: null, dateTo: null })).dateLabel).toBe('Date: 2026-10-02');
  });

  it('uses the division filter name, else the single division in the rows, else "All Divisions"', () => {
    expect(buildDailyProductionReport(rows, opts({ divisionName: 'Spokes Division' })).divisionName).toBe('Spokes Division');
    expect(buildDailyProductionReport(rows, opts({ divisionName: null })).divisionName).toBe('Rims Division');
    const two = buildDailyProductionReport(
      [rows[0], makeRow({ division: { name: 'Spokes Division', divisionCode: 'SPK' } })],
      opts({ divisionName: null }),
    );
    expect(two.divisionName).toBe('All Divisions');
  });
});

/* ------------------------------------------------------------------ *
 * 7. Print layout (HTML → @media print)
 * ------------------------------------------------------------------ */
describe('Daily Production Report — print layout', () => {
  const html = buildPrintHtml(model());
  const machineOrder = [...html.matchAll(/<td class="a-left">(SPK-\d+|SW-\d+|ST-\d+|PL-\d+|PK-\d+|FL-\d+)<\/td>/g)]
    .map((m) => m[1]);

  it('renders the dynamic header (division, title, selected date)', () => {
    expect(html).toContain('<title>Daily Production Report — Rims Division</title>');
    expect(html).toContain('Division: Rims Division');
    expect(html).toContain('Date: 2026-10-02');
    expect(html).toContain('10 entries · 6 departments');
  });

  it('emits one boxed section per department in the fixed sequence', () => {
    const order = [
      'DEPARTMENT — Straightener', 'DEPARTMENT — Swagging', 'DEPARTMENT — Spoke</span>',
      'DEPARTMENT — Spoke Plating', 'DEPARTMENT — Spoke Packing', 'DEPARTMENT — Flattening',
    ];
    const at = order.map((label) => html.indexOf(label));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html.match(/<section class="rp-dept">/g)).toHaveLength(7); // 6 + grand total
  });

  it('orders rows by department → shift (Day first) → machine ascending', () => {
    expect(machineOrder).toEqual([
      'ST-01',
      'SW-01',
      'SPK-01', 'SPK-02', 'SPK-10', // Day
      'SPK-01', 'SPK-03',          // Night
      'PL-01', 'PK-01', 'FL-01',
    ]);
  });

  it('adds Day Shift / Night Shift sub-totals and a department grand total', () => {
    expect(html).toContain('DAY SHIFT TOTAL — Spoke');
    expect(html).toContain('NIGHT SHIFT TOTAL — Spoke');
    expect(html).toContain('DEPARTMENT GRAND TOTAL — Spoke');
    expect(html).toContain('GRAND TOTAL — 6 departments');
    expect(html).not.toContain('NIGHT SHIFT TOTAL — Flattening'); // no night entries
    const at = [
      html.indexOf('SPK-10'),
      html.indexOf('DAY SHIFT TOTAL — Spoke'),
      html.indexOf('NIGHT SHIFT TOTAL — Spoke'),
      html.indexOf('DEPARTMENT GRAND TOTAL — Spoke'),
      html.indexOf('GRAND TOTAL — 6 departments'),
    ];
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(html).toContain('class="rp-subtotal"');
    expect(html).toContain('class="rp-total"');
    expect(html).toContain('3,450'); // Σ Actual (Spoke day)
    expect(html).toContain('98.6% ▲'); // weighted day achievement
    expect(html).toContain('15,500'); // Σ Target (grand)
  });

  it('prints the achievement arrows and the live runtime summary', () => {
    expect(html).toContain('120.0% ▲');
    expect(html).toContain('50.0% ▼');
    expect(html).toContain('tone-up');
    expect(html).toContain('tone-down');
    expect(html).toContain('0 hrs Running (0%) / 8 hrs Breakdown - Wire jam');
    expect(html).toContain('0 hrs Running (0%) / 2 hrs Breakdown - Coil change');
    expect(html).toContain('Breakdown Reason / Status');
    expect(html).not.toContain('⚠');
    expect(html).not.toContain('No reason logged');
    expect(html).not.toContain('Below 70% target');
    // The static status word is gone from every rendered cell.
    expect(html).not.toContain('>COMPLETED<');
  });

  it('prints Item, Shift, WEIGHT (KG) and REJECTION / SCRAP as stacked pairs', () => {
    expect(html).toContain('<span class="rp-item-name">Spoke 40T</span><span class="rp-item-code">SP-40</span>');
    expect(html).toContain('<span class="rp-shift-name">SHIFT-A</span><span class="rp-shift-time">-</span>');
    expect(html).toContain('.rp-item-name { display: block; font-weight: 700;');
    expect(html).toContain('.rp-item-code { display: block; font-weight: 400; color: #94a3b8; }');
    expect(html).toContain('.rp-shift-time { display: block; font-weight: 400; color: #94a3b8; }');
    // WEIGHT (KG) — per unit on top, the bold Actual KG underneath.
    expect(html).toContain('<span class="rp-wt-top">0.05</span><span class="rp-wt-bottom">100</span>');
    // REJECTION / SCRAP — flat KG on top, the fixed % underneath.
    expect(html).toContain('<span class="rp-rj-top">1</span><span class="rp-rj-bottom">0.99%</span>');
    expect(html).toContain('WEIGHT (KG)');
    expect(html).toContain('REJECTION / SCRAP');
    expect(html).toContain('OT (H)');
    expect(html).not.toContain('Rejection (KG)');
    expect(html).not.toContain('Per Unit Weight');
    expect(html).toContain('0.83%');
    expect(html).toContain('0.00%');
  });

  it('has print-safe CSS: 11px data, boxed borders, repeating header, no section splitting', () => {
    expect(html).toContain('@media print');
    expect(html).toContain('font-size: 11px');
    expect(html).toContain('border: 1px solid #94a3b8');
    expect(html).toContain('display: table-header-group');
    expect(html).toContain('table-layout: fixed');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('.rp-dept { break-inside: avoid; page-break-inside: avoid; }');
    expect(html).toContain('break-after: avoid; page-break-after: avoid;');
    expect(html).toContain('.rp-subtotal td { background: #e8edf3 !important;');
  });

  it('escapes row content so injected markup cannot break the layout', () => {
    const injected = buildDailyProductionReport(
      [makeRow({ operatorName: '<script>alert("x")</script>', downtimeReasonText: '<b>down</b>' })],
      opts(),
    );
    const unsafe = buildPrintHtml(injected);
    expect(unsafe).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(unsafe).toContain('&lt;b&gt;down&lt;/b&gt;');
    expect(unsafe).not.toContain('<script>alert');
  });
});

/* ------------------------------------------------------------------ *
 * 8. PDF row builders (jsPDF / autoTable shapes, ASCII-safe content)
 * ------------------------------------------------------------------ */
describe('Daily Production Report — PDF rows', () => {
  const m = model();
  const spoke = m.sections.find((s) => s.name === 'Spoke')!;
  const achIdx = m.columns.findIndex((c) => c.key === 'achievement');

  it('builds a data row with the achievement colour and an ASCII-only cell', () => {
    const low = spoke.lines.find((l) => l.machine === 'SPK-02')!;
    const row = pdfLineRow(m.columns, low);
    expect(row).toHaveLength(m.columns.length);
    expect(row[2]).toBe('SPK-02'); // Machine is the 3rd column
    expect(row[m.columns.findIndex((c) => c.key === 'ot')]).toBe('—');
    expect(row[achIdx]).toEqual({
      content: '50.0%',
      styles: { halign: 'right', fontStyle: 'bold', textColor: TONE_COLOR.down },
    });
    // No hour data on this row → the runtime cell is the neutral dash,
    // never the retired "COMPLETED" word.
    expect(row[m.columns.findIndex((c) => c.key === 'status')]).toBe('—');
  });

  it('emits the four fused cells as two-line cells for didDrawCell', () => {
    const low = spoke.lines.find((l) => l.machine === 'SPK-02')!;
    const row = pdfLineRow(m.columns, low);
    const shift = row[1];
    const item = row[m.columns.findIndex((c) => c.key === 'item')];
    const weight = row[m.columns.findIndex((c) => c.key === 'weight')];
    const scrap = row[m.columns.findIndex((c) => c.key === 'rejectionScrap')];
    // line 1 is drawn by autoTable, line 2 by EntryList's didDrawCell
    expect(shift.content).toBe('SHIFT-A\n\u00A0');
    expect(shift.sub).toBe('-');
    expect(shift.subColor).toEqual(PDF_SUB_TEXT);
    expect(shift.styles).toEqual({ halign: 'left', textColor: PDF_MAIN_TEXT });
    expect(item.content).toBe('Spoke 40T\n\u00A0');
    expect(item.sub).toBe('SP-40');
    expect(item.styles.fontStyle).toBe('bold');
    expect(reportCellSubText(low, 'item')).toBe('SP-40');

    // WEIGHT (KG) is the reversed one: muted per-unit on line 1, the Actual
    // KG painted underneath in BOLD dark — subBold switches the font.
    expect(weight).toEqual({
      content: '0.05\n\u00A0',
      sub: '12.5',
      subColor: PDF_MAIN_TEXT,
      subBold: true,
      styles: { halign: 'right', textColor: PDF_MUTED_TEXT },
    });
    // REJECTION / SCRAP — flat KG over the muted %, normal weight.
    expect(scrap).toEqual({
      content: '0\n\u00A0',
      sub: '0.00%',
      subColor: PDF_SUB_TEXT,
      subBold: false,
      styles: { halign: 'right', textColor: PDF_MAIN_TEXT },
    });
  });

  it('spans the label over 5 columns and shades shift totals lighter', () => {
    const day = pdfSummaryRow(m, spoke.shiftGroups[0].totals, 'DAY SHIFT TOTAL — Spoke', 'shift');
    expect(day[0]).toEqual(
      expect.objectContaining({ content: 'DAY SHIFT TOTAL — Spoke', colSpan: 5 }),
    );
    expect(day[0].styles.fillColor).toEqual([232, 237, 243]);
    // columns 5..n start at array index 1 → achievement sits at 1 + (achIdx - 5)
    expect(day[1 + (achIdx - 5)]).toEqual(
      expect.objectContaining({
        content: '98.6%', // totals show one decimal, like the print output
        styles: expect.objectContaining({ textColor: TONE_COLOR.up }),
      }),
    );
    const dept = pdfSummaryRow(m, spoke.totals, 'DEPARTMENT GRAND TOTAL — Spoke', 'department');
    expect(dept[0].styles.fillColor).toEqual([226, 232, 240]);
    expect(dept[1 + (achIdx - 5)]).toEqual(
      expect.objectContaining({ content: '80.9%', styles: expect.objectContaining({ textColor: TONE_COLOR.up }) }),
    );
  });

  it('keeps BOTH lines of the fused columns in the total rows too', () => {
    const day = pdfSummaryRow(m, spoke.shiftGroups[0].totals, 'DAY SHIFT TOTAL — Spoke', 'shift');
    const weight = day[1 + (m.columns.findIndex((c) => c.key === 'weight') - 5)];
    const scrap = day[1 + (m.columns.findIndex((c) => c.key === 'rejectionScrap') - 5)];
    // Σ Actual KG rides under a `—`, because a per-unit weight is not summable.
    expect(weight).toEqual(expect.objectContaining({
      content: '—\n\u00A0',
      sub: '172.5',
      subBold: true,
    }));
    // Σ Rejection KG over the POOLED percentage (1.5 / 174 = 0.86%).
    expect(scrap).toEqual(expect.objectContaining({
      content: '1.5\n\u00A0',
      sub: '0.86%',
    }));
    // Both stay legible on the shaded total background.
    expect(weight.styles.fillColor).toEqual([232, 237, 243]);
    expect(scrap.styles.fillColor).toEqual([232, 237, 243]);
  });
});

/* ------------------------------------------------------------------ *
 * 9. Excel (CSV) mirror
 * ------------------------------------------------------------------ */
describe('Daily Production Report — Excel (CSV) export', () => {
  const csv = buildDailyProductionCsv(model());
  const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
  const headerIdx = lines.findIndex((l) => l.startsWith('Sr. #'));

  it('is BOM-prefixed and opens with the report header block', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('Daily Production Report');
    expect(lines[1]).toBe('Division: Rims Division');
    expect(lines[2]).toBe('Date: 2026-10-02');
    expect(lines[3]).toBe('10 entries · 6 departments · Generated: 02 Oct 2026, 06:00');
  });

  it('uses the same column labels as print/PDF, plus UOM', () => {
    expect(lines[headerIdx]).toBe(
      'Sr. #,Shift,Machine,OT (H),Operator,Item / Product,Target,Actual,Achievement %,WEIGHT (KG),Breakdown Reason / Status,REJECTION / SCRAP,UOM',
    );
  });

  it('writes the sections in sequence with Day rows before Night rows', () => {
    const sections = lines.filter((l) => l.startsWith('DEPARTMENT — '));
    expect(sections).toEqual([
      'DEPARTMENT — Straightener', 'DEPARTMENT — Swagging', 'DEPARTMENT — Spoke',
      'DEPARTMENT — Spoke Plating', 'DEPARTMENT — Spoke Packing', 'DEPARTMENT — Flattening',
    ]);
    const spokeIdx = lines.indexOf('DEPARTMENT — Spoke');
    const cells = (i: number) => lines[i].split(',');
    expect(cells(spokeIdx + 1)[2]).toBe('SPK-01');
    expect(cells(spokeIdx + 2)[2]).toBe('SPK-02');
    expect(cells(spokeIdx + 3)[2]).toBe('SPK-10');
    expect(cells(spokeIdx + 4)[0]).toBe('DAY SHIFT TOTAL — Spoke');
    expect(cells(spokeIdx + 5)[1]).toContain('Night');
    expect(cells(spokeIdx + 5)[2]).toBe('SPK-01');
    expect(cells(spokeIdx + 6)[2]).toBe('SPK-03');
    expect(cells(spokeIdx + 7)[0]).toBe('NIGHT SHIFT TOTAL — Spoke');
    expect(cells(spokeIdx + 8)[0]).toBe('DEPARTMENT GRAND TOTAL — Spoke');
  });

  it('writes Day / Night / department totals as numeric cells with the arrow', () => {
    const spokeIdx = lines.indexOf('DEPARTMENT — Spoke');
    const day = lines[spokeIdx + 4].split(',');
    expect(day[0]).toBe('DAY SHIFT TOTAL — Spoke');
    expect(day[6]).toBe('3500'); // Σ Target — unquoted number for Excel
    expect(day[7]).toBe('3450'); // Σ Actual
    expect(day[8]).toBe('98.57 ▲'); // weighted achievement + indicator
    expect(day[3]).toBe(''); // OT — nothing to sum on these fixtures
    // WEIGHT (KG): `—` (per-unit is not summable) over Σ Actual KG.
    expect(day[9]).toBe('"—\n172.5"');
    // REJECTION / SCRAP: Σ Rejection KG over the POOLED percentage.
    expect(day[11]).toBe('"1.5\n0.86%"');

    const night = lines[spokeIdx + 7].split(',');
    expect(night[6]).toBe('2000');
    expect(night[7]).toBe('1000');
    expect(night[8]).toBe('50 ▼');

    const dept = lines[spokeIdx + 8].split(',');
    expect(dept[6]).toBe('5500');
    expect(dept[7]).toBe('4450');
    expect(dept[8]).toBe('80.91 ▲');
    expect(dept[9]).toBe('"—\n222.5"');

    const grand = lines.find((l) => l.startsWith('GRAND TOTAL'))!.split(',');
    expect(grand[6]).toBe('15500');
    expect(grand[7]).toBe('12850');
    expect(grand[8]).toBe('82.9 ▲');
    expect(grand[9]).toBe('"—\n642.5"');
    expect(grand[11]).toBe('"1.75\n0.27%"'); // 1.75 / (642.5 + 1.75)
  });

  it('keeps quantity cells numeric and carries the runtime reason', () => {
    const first = lines[headerIdx + 3]; // DEPARTMENT — Straightener is +2
    const cells = first.split(',');
    expect(Number.isFinite(Number(cells[6]))).toBe(true); // Target
    expect(Number.isFinite(Number(cells[7]))).toBe(true); // Actual
    expect(cells[8]).toBe('110 ▲');
    expect(first.endsWith(',PCS')).toBe(true); // UOM column last

    const flatIdx = lines.indexOf('DEPARTMENT — Flattening');
    const flat = lines[flatIdx + 1].split(',');
    expect(flat[10]).toBe('0 hrs Running (0%) / 8 hrs Breakdown - Wire jam');
    expect(flat[8]).toBe('50 ▼');
    expect(flat[3]).toBe('0'); // OT (H) — still a plain numeric cell
  });

  it('writes Item, Shift and the two fused columns as stacked pairs', () => {
    const first = lines[headerIdx + 3].split(',');
    expect(first[5]).toBe('"Spoke 40T\nSP-40"'); // name, then code — no "Name (CODE)"
    expect(first[1]).toBe('"SHIFT-A\n-"'); // shift name, then its timing
    // ST-01: 0.25 KG rejected of 220.25 KG produced → 0.11%
    expect(first[11]).toBe('"0.25\n0.11%"');
    // ST-01: per-unit 0.05 over Σ 220 KG actual.
    expect(first[9]).toBe('"0.05\n220"');
    expect(lines.join('\r\n')).not.toContain('Rejection (KG)');
  });
});

/* ------------------------------------------------------------------ *
 * 12. EXECUTIVE DEPARTMENT SUMMARY — the standalone last page
 * ------------------------------------------------------------------ */
describe('Daily Production Report — Executive KPI summary', () => {
  const html = buildPrintHtml(model());
  const cards = executiveKpis(model());

  it('is placed after the grand total and forced onto its own page', () => {
    const grandAt = html.indexOf('GRAND TOTAL — 6 departments');
    const finalDeptAt = html.indexOf('DEPARTMENT GRAND TOTAL — Flattening');
    const execAt = html.indexOf('<section class="rp-exec">');
    expect(finalDeptAt).toBeGreaterThan(-1);
    expect(grandAt).toBeGreaterThan(finalDeptAt);
    expect(execAt).toBeGreaterThan(grandAt); // strictly LAST
    expect(html).toContain('break-before: page; page-break-before: always;');
    expect(html).toContain(`<h2 class="rp-exec-title">${EXECUTIVE_TITLE}</h2>`);
    expect(html.indexOf(EXECUTIVE_TITLE)).toBeGreaterThan(execAt); // heading is ON that page
    expect(html.slice(execAt)).not.toContain('<section class="rp-dept">'); // nothing after it
  });

  it('builds one card per department with its printed grand totals', () => {
    expect(cards.map((c) => c.name)).toEqual([
      'STRAIGHTENER', 'SWAGGING', 'SPOKE', 'SPOKE PLATING', 'SPOKE PACKING', 'FLATTENING',
    ]);
    expect(cards[0]).toMatchObject({
      target: '4,000',
      actual: '4,400',
      achievement: '110.0% ▲',   // print form
      achievementText: '110.0%', // PDF form — no glyph (WinAnsi)
      tone: 'up',
      achievementValue: 110,
    });
    expect(cards[1]).toMatchObject({ target: '3,000', actual: '1,500', tone: 'down', achievement: '50.0% ▼' });
    expect(cards[2].achievementValue).toBeCloseTo(80.91, 1); // weighted ΣActual / ΣTarget
    expect(cards[5].tone).toBe('down');
    // Same numbers the table above them prints (no second source of truth).
    expect(cards[0].target).toBe(reportTotalText(model().sections[0].totals, 'target'));
    expect(cards[0].actual).toBe(reportTotalText(model().sections[0].totals, 'actual'));
  });

  it('renders the responsive card grid with the green/red highlight row', () => {
    expect(html.match(/class="rp-kpi-card"/g)).toHaveLength(6);
    expect(html).toContain('grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))');
    expect(html).toContain('border: 1px solid #cbd5e1');
    expect(html).toContain('background: #f8fafc');
    expect(html).toContain('<div class="rp-kpi-name">STRAIGHTENER</div>');
    expect(html).toContain('<span>Target:</span><b>4,000</b>');
    expect(html).toContain('<span>Actual:</span><b>4,400</b>');
    expect(html).toContain('<span>Achievement %:</span><b class="tone-up">110.0% ▲</b>');
    expect(html).toContain('<span>Achievement %:</span><b class="tone-down">50.0% ▼</b>');
    expect(html).toContain('.rp-kpi-ach { margin-top: 6px; padding-top: 5px; border-top: 1px dashed #cbd5e1;');
  });

  it('keeps the PDF value free of the glyphs jsPDF cannot embed', () => {
    expect(cards.every((c) => !/[\u25B2\u25BC]/.test(c.achievementText))).toBe(true);
    expect(cards.every((c) => /^[\x20-\x7E\u2014]+$/.test(c.achievementText))).toBe(true);
    expect(cards.filter((c) => c.tone).every((c) => /\d/.test(c.achievementText))).toBe(true);
  });

  it('disappears when the report has no department', () => {
    const empty: DailyProductionReport = { ...model(), sections: [] };
    expect(executiveKpis(empty)).toEqual([]);
    expect(executiveSummaryHtml(empty)).toBe('');
    const emptyHtml = buildPrintHtml(empty);
    expect(emptyHtml).not.toContain(EXECUTIVE_TITLE);
    // The stylesheet always ships with the report — assert on the MARKUP instead.
    expect(emptyHtml).not.toContain('<section class="rp-exec">');
    expect(emptyHtml).not.toContain('<div class="rp-kpi-grid">');
    expect(emptyHtml).not.toContain('<div class="rp-kpi-card">');
  });
});
