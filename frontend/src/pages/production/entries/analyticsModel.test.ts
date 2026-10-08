/* Unit tests for the pure aggregation model behind the two read-only analytical
   tabs ("Downtime Analytics" / "Rejection & Scrap Details").

   Everything here is framework-free on purpose: if the sums in these tests
   move, the charts on both sheets move with them, and none of it needs a DOM,
   a backend, or Recharts to prove. */

import {
  DEPARTMENT_TIERS,
  DOWNTIME_TREE_HEADERS,
  UNATTRIBUTED_REASON,
  breakdownPhrase,
  dailyDowntimeSeries,
  dailyScrapSeries,
  dateWeekday,
  departmentDowntimeBars,
  departmentScrapRollup,
  departmentTierIndex,
  downtimeBuckets,
  downtimeDepartmentGroups,
  downtimeEntries,
  downtimeTree,
  downtimeTreeOutline,
  entryDefectReason,
  entryOperationalRemarks,
  hoursFixed,
  machineDowntimeRanking,
  normalizeReason,
  remarksSummary,
  rowDowntimeLines,
  scrapMatrix,
  scrapTotals,
  sampleMonthLabel,
  unweightedEntryCount,
} from './analyticsModel';
import type { DowntimeLineLite } from './analyticsModel';
import type { ProductionEntryRow } from './EntryList';

const row = (over: Partial<ProductionEntryRow> & { id: string }): ProductionEntryRow => ({
  entryDate: '2026-10-01',
  divisionId: 'div-1',
  sectionId: 'sec-1',
  departmentId: 'dep-1',
  department: { id: 'dep-1', name: 'Flattening', departmentCode: 'CCD-DEPT001' },
  machineNo: 'FT-04',
  machine: { id: 'm-1', machineCode: 'FT-04', name: 'Flattening Machine FT-04' },
  operatorName: 'Muhammad Ali',
  supervisorName: null,
  coilSize: null,
  itemId: 'item-1',
  item: { id: 'item-1', name: 'Flat Wire', itemCode: 'FLAT-WIRE-001' },
  uomId: 'uom-1',
  uom: { id: 'uom-1', code: 'KG', symbol: 'kg' },
  targetQuantity: 60,
  actualQuantity: 48,
  achievementPercentage: 80,
  efficiencyPercentage: 75,
  runningHours: 8,
  overtimeHours: 0,
  downtimeHours: 0,
  downtimeReasonText: null,
  scrapQuantity: 0,
  remarks: null,
  isActive: true,
  ...over,
});

describe('field readers', () => {
  it('normalizeReason turns a blank into an explicit bucket label', () => {
    expect(normalizeReason('   ')).toBe(UNATTRIBUTED_REASON);
    expect(normalizeReason(null)).toBe(UNATTRIBUTED_REASON);
    expect(normalizeReason(' Power Off ')).toBe('Power Off');
  });

  it('hoursFixed keeps the trailing zero the spec prints (1.0h, not 1h)', () => {
    expect(hoursFixed(1)).toBe('1.0');
    expect(hoursFixed(8.5)).toBe('8.5');
    expect(hoursFixed(0)).toBe('0.0');
    expect(hoursFixed(Number.NaN)).toBe('0.0');
  });

  it('entryDefectReason reports an em dash instead of an empty cell', () => {
    expect(entryDefectReason(row({ id: 'a', remarks: '   ' }))).toBe('—');
    expect(entryDefectReason(row({ id: 'b', remarks: 'SCRATCH' }))).toBe('SCRATCH');
  });
});

describe('rowDowntimeLines — hydration is a refinement, never a re-sum', () => {
  const entry = row({ id: 'e1', downtimeHours: 2, downtimeReasonText: 'Machine Maintenance' });

  it('falls back to the entry-level reason when no detail has been hydrated', () => {
    expect(rowDowntimeLines(entry, new Map())).toEqual([
      { reason: 'Machine Maintenance', hours: 2 },
    ]);
    expect(rowDowntimeLines(entry, null)).toEqual([
      { reason: 'Machine Maintenance', hours: 2 },
    ]);
  });

  it('prefers the child lines when they carry hours', () => {
    const lines: DowntimeLineLite[] = [
      { reason: 'Machine Maintenance', hours: 1 },
      { reason: 'Manpower Unavailable', hours: 1 },
    ];
    expect(rowDowntimeLines(entry, new Map([['e1', lines]]))).toEqual(lines);
  });

  it('ignores hydrated lines that are all zero so the total still shows', () => {
    const lines: DowntimeLineLite[] = [
      { reason: 'Machine Maintenance', hours: 0 },
      { reason: 'Power Off', hours: 0 },
    ];
    expect(rowDowntimeLines(entry, new Map([['e1', lines]]))).toEqual([
      { reason: 'Machine Maintenance', hours: 2 },
    ]);
  });

  it('returns nothing for an entry that never stopped', () => {
    expect(rowDowntimeLines(row({ id: 'ok' }), new Map())).toEqual([]);
  });
});

describe('breakdownPhrase — the exact multi-reason row the spec asks for', () => {
  it('prints `1.0h Machine Maintenance | 1.0h Manpower Unavailable`', () => {
    const entry = row({ id: 'e1', downtimeHours: 2, downtimeReasonText: 'Machine Maintenance' });
    const lines: DowntimeLineLite[] = [
      { reason: 'Machine Maintenance', hours: 1 },
      { reason: 'Manpower Unavailable', hours: 1 },
    ];
    expect(breakdownPhrase(entry, new Map([['e1', lines]]))).toBe(
      '1.0h Machine Maintenance | 1.0h Manpower Unavailable',
    );
  });

  it('never renders an empty cell', () => {
    expect(breakdownPhrase(row({ id: 'clean' }), new Map())).toBe('—');
  });
});

describe('downtimeBuckets', () => {
  const rows = [
    row({ id: 'e1', downtimeHours: 2, downtimeReasonText: 'Machine Maintenance' }),
    row({ id: 'e2', downtimeHours: 4, downtimeReasonText: 'Power Off' }),
    row({ id: 'e3', downtimeHours: 1, downtimeReasonText: 'Labor Shortage' }),
    row({ id: 'e4', downtimeHours: 0, downtimeReasonText: null }),
  ];

  it('attributes the whole entry to its entry-level reason when unresolved', () => {
    const buckets = downtimeBuckets(rows, new Map());
    expect(buckets.map((b) => [b.reason, b.hours])).toEqual([
      ['Power Off', 4],
      ['Machine Maintenance', 2],
      ['Labor Shortage', 1],
    ]);
    expect(buckets.reduce((s, b) => s + b.hours, 0)).toBe(7);
    expect(buckets.find((b) => b.reason === 'Power Off')?.entries).toBe(1);
  });

  it('splits a multi-reason entry across BOTH reasons without changing the total', () => {
    const lines: DowntimeLineLite[] = [
      { reason: 'Machine Maintenance', hours: 1 },
      { reason: 'Manpower Unavailable', hours: 1 },
    ];
    const buckets = downtimeBuckets(rows, new Map([['e1', lines]]));
    expect(buckets.reduce((s, b) => s + b.hours, 0)).toBe(7);
    expect(buckets.find((b) => b.reason === 'Manpower Unavailable')?.hours).toBe(1);
    expect(buckets.find((b) => b.reason === 'Machine Maintenance')?.hours).toBe(1);
  });

  it('drops entries with no downtime entirely (no zero-hour phantom slice)', () => {
    expect(downtimeBuckets([row({ id: 'clean' })], new Map())).toEqual([]);
  });
});

describe('downtimeEntries — worst first', () => {
  it('lists only the stopped entries, ordered by hours desc', () => {
    const entries = downtimeEntries(
      [
        row({ id: 'a', downtimeHours: 1, downtimeReasonText: 'Power Off' }),
        row({ id: 'b', downtimeHours: 3, downtimeReasonText: 'Wire jam' }),
        row({ id: 'c', downtimeHours: 0 }),
      ],
      new Map(),
    );
    expect(entries.map((e) => e.row.id)).toEqual(['b', 'a']);
    expect(entries[0].phrase).toBe('3.0h Wire jam');
  });
});

describe('machineDowntimeRanking', () => {
  it('sorts machines by highest downtime and names the dominant reason', () => {
    const ranking = machineDowntimeRanking(
      [
        row({ id: 'a', machineNo: 'ST-01', machine: { id: 'm2', machineCode: 'ST-01', name: 'Straightener' } , downtimeHours: 1 }),
        row({ id: 'b', machineNo: 'SW-02', downtimeHours: 5, downtimeReasonText: 'Wire jam' }),
        row({ id: 'c', machineNo: 'SW-02', downtimeHours: 2, downtimeReasonText: 'Power Off' }),
        row({ id: 'd', downtimeHours: 0 }),
      ],
      new Map(),
    );
    expect(ranking.map((m) => m.machine)).toEqual(['SW-02', 'ST-01', 'FT-04']);
    expect(ranking[0].downtimeHours).toBe(7);
    expect(ranking[0].entries).toBe(2);
    expect(ranking[0].topReason).toBe('Wire jam');
    expect(ranking[0].runningHours).toBe(16);
    // machines with no downtime still appear — the audit wants the full fleet
    expect(ranking[2].downtimeHours).toBe(0);
  });
});

describe('scrapMatrix — Machine/Product · Produced KG · Scrap KG · reason', () => {
  it('converts through calcActualKg and uses actual KG as the wastage denominator', () => {
    const matrix = scrapMatrix([
      row({ id: 'a', actualQuantity: 48, scrapQuantity: 12, remarks: 'SCRATCH' }),
      row({ id: 'b', actualQuantity: 52, scrapQuantity: 3, remarks: 'EDGE CRACK' }),
    ]);
    expect(matrix).toHaveLength(1);
    expect(matrix[0].machineProduct).toBe('FT-04 · Flat Wire');
    expect(matrix[0].actualKg).toBe(100);
    expect(matrix[0].scrapKg).toBe(15);
    expect(matrix[0].wastagePct).toBeCloseTo(15, 6);
    // first non-empty remark wins as the defect reason code
    expect(matrix[0].defectReason).toBe('SCRATCH');
    expect(matrix[0].entries).toBe(2);
  });

  it('keeps machine/product pairs apart', () => {
    const matrix = scrapMatrix([
      row({ id: 'a', machineNo: 'SW-02', actualQuantity: 10, scrapQuantity: 1 }),
      row({
        id: 'b',
        machineNo: 'ST-01',
        item: { id: 'item-2', name: 'Round Wire', itemCode: 'RW-01' },
        actualQuantity: 20,
        scrapQuantity: 2,
      }),
    ]);
    expect(matrix).toHaveLength(2);
    expect(matrix.map((m) => m.machineProduct)).toEqual([
      'ST-01 · Round Wire',
      'SW-02 · Flat Wire',
    ]);
  });

  it('reports 0% (never Infinity) when nothing was produced', () => {
    const matrix = scrapMatrix([row({ id: 'a', actualQuantity: 0, scrapQuantity: 4 })]);
    expect(matrix[0].wastagePct).toBe(0);
    expect(matrix[0].scrapKg).toBe(4);
  });

  it('sorts worst waste first', () => {
    const matrix = scrapMatrix([
      row({ id: 'a', machineNo: 'AA', scrapQuantity: 1, actualQuantity: 100 }),
      row({ id: 'b', machineNo: 'BB', scrapQuantity: 9, actualQuantity: 100 }),
    ]);
    expect(matrix.map((m) => m.machine)).toEqual(['BB', 'AA']);
  });
});

describe('dailyScrapSeries', () => {
  it('groups by day, ascending, skipping empty days and blank dates', () => {
    const series = dailyScrapSeries([
      row({ id: 'a', entryDate: '2026-10-03', scrapQuantity: 2 }),
      row({ id: 'b', entryDate: '2026-10-01', scrapQuantity: 5 }),
      row({ id: 'c', entryDate: '2026-10-03', scrapQuantity: 3 }),
      row({ id: 'd', entryDate: '2026-10-01', scrapQuantity: 0 }),
      row({ id: 'e', entryDate: '', scrapQuantity: 9 }),
    ]);
    expect(series.map((p) => [p.date, p.scrapKg, p.entries])).toEqual([
      ['2026-10-01', 5, 2],
      ['2026-10-03', 5, 2],
    ]);
  });
});

describe('departmentScrapRollup', () => {
  it('groups by department tier and ranks worst waste first', () => {
    const rollup = departmentScrapRollup([
      row({ id: 'a', department: { id: 'd1', name: 'Straightening', departmentCode: 'S' }, scrapQuantity: 1, actualQuantity: 100 }),
      row({ id: 'b', department: { id: 'd2', name: 'Swaging', departmentCode: 'W' }, scrapQuantity: 7, actualQuantity: 100 }),
      row({ id: 'c', department: { id: 'd3', name: 'Plating', departmentCode: 'P' }, scrapQuantity: 2, actualQuantity: 100 }),
    ]);
    expect(rollup.map((d) => d.department)).toEqual(['Swaging', 'Plating', 'Straightening']);
    expect(rollup[0].scrapKg).toBe(7);
    expect(rollup[0].wastagePct).toBeCloseTo(7, 6);
    expect(rollup[0].entries).toBe(1);
  });

  it('reads 0% for a department that produced nothing', () => {
    const rollup = departmentScrapRollup([row({ id: 'a', actualQuantity: 0, scrapQuantity: 0 })]);
    expect(rollup[0].wastagePct).toBe(0);
  });
});

describe('sampleMonthLabel — scopes the "monthly" pie title', () => {
  it('names the single month a sample covers', () => {
    expect(sampleMonthLabel([row({ id: 'a', entryDate: '2026-10-04' })])).toBe('Oct 2026');
  });

  it('spans a range and ignores undated rows', () => {
    expect(
      sampleMonthLabel([
        row({ id: 'a', entryDate: '2026-09-30' }),
        row({ id: 'b', entryDate: '2026-10-01' }),
        row({ id: 'c', entryDate: '' }),
      ]),
    ).toBe('Sep 2026 – Oct 2026');
  });

  it('says so when nothing in the sample carries a date', () => {
    expect(sampleMonthLabel([row({ id: 'a', entryDate: '' })])).toBe('no dated entries');
    expect(sampleMonthLabel([])).toBe('no dated entries');
  });
});

describe('scrapTotals / unweightedEntryCount', () => {
  it('totals both columns over the whole sample', () => {
    const totals = scrapTotals([
      row({ id: 'a', actualQuantity: 40, scrapQuantity: 5 }),
      row({ id: 'b', actualQuantity: 60, scrapQuantity: 5 }),
    ]);
    expect(totals).toEqual({ entries: 2, actualKg: 100, scrapKg: 10, wastagePct: 10 });
  });

  it('counts rows whose UOM cannot become KG', () => {
    const rows = [
      row({ id: 'a', uom: { id: 'u2', code: 'PCS', symbol: 'pcs' } }),
      row({ id: 'b', uom: { id: 'u3', code: 'BOGUS', symbol: '?' } }),
      row({ id: 'c' }),
    ];
    // PCS without a weightPerPiece, an unknown UOM, and a clean KG row
    expect(unweightedEntryCount(rows)).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * Tab A · collapsible department hierarchy
 * ══════════════════════════════════════════════════════════════════════════ */

const dept = (name: string) => ({ id: `dep-${name}`, name, departmentCode: name.slice(0, 3).toUpperCase() });
const machineOf = (code: string) => ({ id: `m-${code}`, machineCode: code, name: `${code} Machine` });

/** A four-tier sample: two tiers, four machines, four stopped entries. */
const hierarchySample = (): ProductionEntryRow[] => [
  row({
    id: 'a',
    department: dept('Plating'),
    machineNo: 'PL-01',
    machine: machineOf('PL-01'),
    downtimeHours: 3,
    downtimeReasonText: 'Bath change',
  }),
  row({
    id: 'b',
    department: dept('Raw Material'),
    machineNo: 'RM-01',
    machine: machineOf('RM-01'),
    downtimeHours: 1,
    downtimeReasonText: 'No Order / Waiting',
  }),
  row({
    id: 'c',
    department: dept('Swaging'),
    machineNo: 'SW-02',
    machine: machineOf('SW-02'),
    downtimeHours: 5,
    downtimeReasonText: 'Wire jam',
    remarks: 'Changed spindle bearing',
  }),
  row({
    id: 'd',
    department: dept('Swaging'),
    machineNo: 'ST-01',
    machine: machineOf('ST-01'),
    downtimeHours: 2,
    downtimeReasonText: 'Power Off',
  }),
];

describe('departmentTierIndex — the flow the grouped grid walks in', () => {
  it('places every canonical tier in manufacturing order', () => {
    expect(DEPARTMENT_TIERS).toEqual([
      'Raw Material',
      'Straightening',
      'Swaging',
      'Spoke',
      'Plating',
      'Hand Packing',
      'Dispatch',
    ]);
    expect(DEPARTMENT_TIERS.map((tier) => departmentTierIndex(tier))).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('matches a tier whatever spacing or case the plant used', () => {
    expect(departmentTierIndex('handpacking')).toBe(5);
    expect(departmentTierIndex('  PLATING  ')).toBe(4);
  });

  it('recognises a tier inside a longer department name', () => {
    expect(departmentTierIndex('Raw Material Store')).toBe(0);
    expect(departmentTierIndex('Spoke Cutting')).toBe(3);
  });

  it('appends unknown departments after every known tier, never hides them', () => {
    expect(departmentTierIndex('Flattening')).toBe(DEPARTMENT_TIERS.length);
    expect(departmentTierIndex('')).toBe(DEPARTMENT_TIERS.length);
  });
});

describe('downtimeDepartmentGroups — department ▸ machine accordion', () => {
  it('orders banners by manufacturing flow and nests only their own machines', () => {
    const groups = downtimeDepartmentGroups(hierarchySample(), new Map());
    expect(groups.map((g) => g.department)).toEqual(['Raw Material', 'Swaging', 'Plating']);
    expect(groups.map((g) => g.tier)).toEqual([0, 2, 4]);
    // machines inside a banner are still ranked worst downtime first
    expect(groups[1].machines.map((m) => m.machine)).toEqual(['SW-02', 'ST-01']);
  });

  it('keeps a banner exactly equal to the machine lines beneath it', () => {
    for (const group of downtimeDepartmentGroups(hierarchySample(), new Map())) {
      expect(group.entries).toBe(group.machines.reduce((sum, m) => sum + m.entries, 0));
      expect(group.downtimeHours).toBeCloseTo(
        group.machines.reduce((sum, m) => sum + m.downtimeHours, 0),
        6,
      );
    }
  });

  it('carries the floor remarks up from its machine lines', () => {
    const groups = downtimeDepartmentGroups(hierarchySample(), new Map());
    const swaging = groups.find((g) => g.department === 'Swaging');
    // The banner is the union of its machine lines, worst machine first.
    expect(swaging?.remarks).toEqual(['Changed spindle bearing', 'Power Off']);
    expect(swaging?.machines.find((m) => m.machine === 'SW-02')?.remarks).toEqual(['Changed spindle bearing']);
    expect(swaging?.machines.find((m) => m.machine === 'ST-01')?.remarks).toEqual(['Power Off']);
  });

  it('keeps every log so the drill-down can list the exact entries', () => {
    const groups = downtimeDepartmentGroups(
      [
        row({ id: 'a', machineNo: 'ST-04', machine: machineOf('ST-04'), downtimeHours: 2 }),
        row({ id: 'b', machineNo: 'ST-04', machine: machineOf('ST-04'), downtimeHours: 4 }),
      ],
      new Map(),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].machines).toHaveLength(1);
    expect(groups[0].machines[0].entries).toBe(2);
    expect(groups[0].machines[0].logs.map((log) => log.id)).toEqual(['a', 'b']);
  });

  it('never loses a machine that recorded no downtime at all', () => {
    const groups = downtimeDepartmentGroups([row({ id: 'clean' })], new Map());
    expect(groups[0].machines[0].machine).toBe('FT-04');
    expect(groups[0].machines[0].downtimeHours).toBe(0);
  });
});

describe('entryOperationalRemarks — the OPERATIONAL REMARKS column', () => {
  it('prefers the note typed beside the downtime segment', () => {
    const entry = row({ id: 'e1', downtimeHours: 2, downtimeReasonText: 'Machine Maintenance' });
    const lines: DowntimeLineLite[] = [
      { reason: 'Machine Maintenance', hours: 2, remarks: 'Changed spindle bearing' },
    ];
    expect(entryOperationalRemarks(entry, new Map([['e1', lines]]))).toEqual(['Changed spindle bearing']);
  });

  it('falls back to the remark written on the Edit Entry Form', () => {
    const entry = row({ id: 'e1', downtimeHours: 1, downtimeReasonText: 'Other', remarks: 'Waiting for wire lot 44' });
    expect(entryOperationalRemarks(entry, new Map())).toEqual(['Waiting for wire lot 44']);
  });

  it('shows the bare category only when nothing free was typed', () => {
    const entry = row({ id: 'e1', downtimeHours: 2, downtimeReasonText: 'Machine Maintenance' });
    expect(entryOperationalRemarks(entry, new Map())).toEqual(['Machine Maintenance']);
  });

  it('de-duplicates the same wording across segments', () => {
    const entry = row({ id: 'e1', downtimeHours: 4, remarks: 'Wire jam at spool' });
    const lines: DowntimeLineLite[] = [
      { reason: 'Wire jam', hours: 2, remarks: 'Wire jam at spool' },
      { reason: 'Power Off', hours: 2, remarks: 'Wire jam at spool' },
    ];
    expect(entryOperationalRemarks(entry, new Map([['e1', lines]]))).toEqual(['Wire jam at spool']);
  });

  it('reports nothing for a clean entry that carried no note', () => {
    expect(entryOperationalRemarks(row({ id: 'e1' }), new Map())).toEqual([]);
  });
});

describe('remarksSummary — one dense line for the cell', () => {
  it('never renders an empty cell', () => {
    expect(remarksSummary([])).toBe('—');
  });

  it('prints everything that fits', () => {
    expect(remarksSummary(['changed bearing', 'waiting for wire'])).toBe('changed bearing · waiting for wire');
  });

  it('truncates and counts what it held back', () => {
    expect(remarksSummary(['a', 'b', 'c', 'd', 'e'])).toBe('a · b · c · +2 more');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * THE 3-TIER AUDIT TREE — DATE ▸ DEPARTMENT ▸ MACHINE
 * ══════════════════════════════════════════════════════════════════════════ */

describe('downtimeTree — tier 1 = date, tier 2 = department, tier 3 = machine', () => {
  it('sums the whole plant on the date row and nests its departments under it', () => {
    const tree = downtimeTree(hierarchySample(), new Map());
    expect(tree).toHaveLength(1);
    expect(tree[0].date).toBe('2026-10-01');
    expect(tree[0].weekday).toBe('Thu');
    expect(tree[0].entries).toBe(4);
    expect(tree[0].downtimeHours).toBe(11);
    expect(tree[0].runningHours).toBe(32);
    expect(tree[0].topReason).toBe('Wire jam');
    expect(tree[0].departments.map((d) => d.department)).toEqual(['Raw Material', 'Swaging', 'Plating']);
  });

  it('keeps a date node exactly equal to the departments beneath it', () => {
    for (const day of downtimeTree(hierarchySample(), new Map())) {
      expect(day.entries).toBe(day.departments.reduce((sum, d) => sum + d.entries, 0));
      expect(day.downtimeHours).toBeCloseTo(
        day.departments.reduce((sum, d) => sum + d.downtimeHours, 0),
        6,
      );
      expect(day.departments.every((d) => d.date === day.date)).toBe(true);
    }
  });

  it('nests each department under its own date, machines worst-first', () => {
    const tree = downtimeTree(hierarchySample(), new Map());
    const swaging = tree[0].departments.find((d) => d.department === 'Swaging');
    expect(swaging?.machines.map((m) => m.machine)).toEqual(['SW-02', 'ST-01']);
    expect(swaging?.machines[0].downtimeHours).toBe(5);
    expect(swaging?.machines[0].date).toBe('2026-10-01');
  });

  it('walks dates ascending and keeps their entries apart', () => {
    const tree = downtimeTree(
      [
        row({ id: 'a', entryDate: '2026-10-03', machineNo: 'AA', machine: machineOf('AA'), downtimeHours: 1 }),
        row({ id: 'b', entryDate: '2026-10-01', machineNo: 'BB', machine: machineOf('BB'), downtimeHours: 4 }),
        row({ id: 'c', entryDate: '2026-10-03', machineNo: 'AA', machine: machineOf('AA'), downtimeHours: 2 }),
      ],
      new Map(),
    );
    expect(tree.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-03']);
    expect(tree[0].downtimeHours).toBe(4);
    expect(tree[1].downtimeHours).toBe(3);
    expect(tree[1].entries).toBe(2);
    expect(tree[1].departments[0].machines[0].logs.map((l) => l.id)).toEqual(['a', 'c']);
  });

  it('never drops a clean machine or an undated row', () => {
    const tree = downtimeTree([row({ id: 'clean' }), row({ id: 'x', entryDate: '' })], new Map());
    expect(tree.map((d) => d.date)).toEqual(['2026-10-01', 'Undated']);
    expect(tree[0].departments[0].machines[0].machine).toBe('FT-04');
    expect(tree[0].departments[0].machines[0].downtimeHours).toBe(0);
    expect(tree[1].weekday).toBe('—');
  });

  it('carries the floor remarks up from machine to department to date', () => {
    const day = downtimeTree(hierarchySample(), new Map())[0];
    const swaging = day.departments.find((d) => d.department === 'Swaging');
    expect(swaging?.machines.find((m) => m.machine === 'SW-02')?.remarks).toEqual(['Changed spindle bearing']);
    expect(swaging?.remarks).toEqual(['Changed spindle bearing', 'Power Off']);
    expect(day.remarks).toEqual([
      'No Order / Waiting',
      'Changed spindle bearing',
      'Power Off',
      'Bath change',
    ]);
  });
});

describe('departmentDowntimeBars — CHART 1 input', () => {
  it('ranks departments by downtime for the horizontal bar chart', () => {
    const bars = departmentDowntimeBars(hierarchySample(), new Map());
    expect(bars.map((b) => b.department)).toEqual(['Swaging', 'Plating', 'Raw Material']);
    expect(bars.map((b) => b.hours)).toEqual([7, 3, 1]);
    expect(bars[0].tier).toBe(2);
    expect(bars[0].entries).toBe(2);
  });

  it('is empty when the sample holds nothing', () => {
    expect(departmentDowntimeBars([], new Map())).toEqual([]);
  });
});

describe('dailyDowntimeSeries — CHART 3 input', () => {
  it('plots every produced day ascending, clean days included', () => {
    const series = dailyDowntimeSeries([
      row({ id: 'a', entryDate: '2026-10-05', downtimeHours: 4 }),
      row({ id: 'b', entryDate: '2026-10-03', downtimeHours: 0 }),
      row({ id: 'c', entryDate: '2026-10-05', downtimeHours: 1 }),
      row({ id: 'd', entryDate: '', downtimeHours: 9 }),
    ]);
    expect(series.map((p) => [p.date, p.hours, p.entries])).toEqual([
      ['2026-10-03', 0, 1],
      ['2026-10-05', 5, 2],
    ]);
  });
});

describe('dateWeekday — ISO date → shift label', () => {
  it('names the weekday without a timezone drift', () => {
    expect(dateWeekday('2026-10-01')).toBe('Thu');
    expect(dateWeekday('2026-10-04')).toBe('Sun');
    expect(dateWeekday('2026-10-05')).toBe('Mon');
  });

  it('says so for anything that is not an ISO date', () => {
    expect(dateWeekday('')).toBe('—');
    expect(dateWeekday('Undated')).toBe('—');
  });
});

describe('downtimeTreeOutline — the print / PDF projection', () => {
  it('emits a date band, then its departments, then their machines', () => {
    const outline = downtimeTreeOutline(downtimeTree(hierarchySample(), new Map()));
    expect(outline.map((r) => r.level)).toEqual([
      'date',
      'department',
      'machine',
      'department',
      'machine',
      'machine',
      'department',
      'machine',
    ]);
    expect(outline[0].label).toBe('2026-10-01');
    expect(outline[0].entries).toBe('4');
    expect(outline[0].downtime).toBe('11.0h');
    expect(outline[0].running).toBe('32.0h');
    expect(outline[1].label).toBe('   Raw Material');
    expect(outline[1].downtime).toBe('1.0h');
    expect(outline[1].remarks).toBe('No Order / Waiting');
    expect(outline[2].label.startsWith('      ')).toBe(true);
  });

  it('shares its header row with the on-screen grid', () => {
    expect(DOWNTIME_TREE_HEADERS).toHaveLength(6);
    expect(DOWNTIME_TREE_HEADERS[0]).toBe('Date / Department / Machine');
    expect(DOWNTIME_TREE_HEADERS[5]).toBe('OPERATIONAL REMARKS');
  });

  it('projects an empty sample as an empty outline', () => {
    expect(downtimeTreeOutline([])).toEqual([]);
  });
});
