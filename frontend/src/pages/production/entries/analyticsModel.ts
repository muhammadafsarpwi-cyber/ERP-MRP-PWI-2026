/* ─────────────────────────────────────────────────────────────────────────────
 * analyticsModel.ts
 *
 * Pure, framework-free aggregation behind the two read-only analytical tabs on
 * the Daily Production Entry workspace:
 *
 *   Tab A · "Downtime Analytics & Details"      — why the machines stopped
 *   Tab B · "Rejection & Scrap Details"         — where the material went
 *
 * Nothing here renders, fetches or mutates. Every function takes the entries
 * the grid already loaded and returns plain data, so both sheets can be unit
 * tested without a DOM and the live log grids stay 100% untouched
 * (Zero-Disturbance Policy).
 *
 * WHY THE CHILD LINES ARE OPTIONAL
 * `ProductionEntryRow` (the list payload) carries ONE entry-level reason —
 * `downtimeReasonText` — plus the aggregate `downtimeHours`. The multi-reason
 * split the operator typed on the form lives on the child `downtimes` rows and
 * is only returned by `GET /production/entries/:id`. Every aggregator therefore
 * takes an OPTIONAL `linesById` map: when the detail hydration has resolved a
 * row it aggregates the real split (`1.0h A | 1.0h B`); until then — or for any
 * row that could not be hydrated — it falls back to attributing the whole
 * entry downtime to the entry-level reason. The total is identical either way,
 * so hydrating can only ever refine the split, never change a sum.
 *
 * WEIGHTS · Actual KG / Rejection KG use the SAME `calcActualKg` conversion the
 * grid's "Actual KG" and "Rejection %" columns print, so a scrap percentage
 * built here can never disagree with the one on the live log row.
 * ──────────────────────────────────────────────────────────────────────────── */

import { formatNumber, toNum } from '../../../utils/numberFormat';
import { calcActualKg } from '../../../utils/productionWeight';
import { round2 } from './downtimeHours';
import type { ProductionEntryRow } from './EntryList';

/* ══════════════════════════════════════════════════════════════════════════
 * Types
 * ══════════════════════════════════════════════════════════════════════════ */

/** One resolved downtime segment of a single entry. */
export interface DowntimeLineLite {
  /** Reason exactly as the operator recorded it (never blank — see normalizeReason). */
  reason: string;
  hours: number;
  /** Free-text floor note typed next to THIS segment on the Edit Entry Form. */
  remarks?: string;
}

/** Hours per reason across the whole sample, newest split included. */
export interface DowntimeBucket {
  reason: string;
  hours: number;
  /** Distinct entries that contributed to this reason. */
  entries: number;
}

/** A machine row of the downtime audit grid, already sorted worst-first. */
export interface MachineDowntimeRow {
  /** `department ␠ machine` — unique even when one machine ran in two tiers. */
  key: string;
  machine: string;
  department: string;
  downtimeHours: number;
  runningHours: number;
  entries: number;
  /** Highest-impact reason on this machine (by hours). */
  topReason: string;
  /** Distinct operator free-text remarks, in the order they were recorded. */
  remarks: string[];
  /** The individual logs behind `entries` — exactly what the drill-down lists. */
  logs: ProductionEntryRow[];
}

/** One department node of the hierarchy, rolled up across every date it ran. */
export interface DepartmentGroup {
  key: string;
  department: string;
  /** Index into DEPARTMENT_TIERS — the manufacturing flow the grid prints in. */
  tier: number;
  downtimeHours: number;
  runningHours: number;
  entries: number;
  /** Highest-impact reason anywhere under this banner (by hours). */
  topReason: string;
  /** Everything the floor typed under this banner, deduplicated. */
  remarks: string[];
  /** Machines allocated to this department, worst downtime first. */
  machines: MachineDowntimeRow[];
}

/** Hours one reason cost inside a roll-up node — powers every dominant-reason cell. */
export interface DowntimeReasonShare {
  reason: string;
  hours: number;
}

/** TIER 3 of the audit tree — one machine on one day, with its live floor notes. */
export interface MachineLogNode extends MachineDowntimeRow {
  /** The calendar day this run belongs to (the tree's top tier). */
  date: string;
  /** Every reason this machine lost time to that day, largest first. */
  reasons: DowntimeReasonShare[];
}

/** TIER 2 — a manufacturing department owned by a single date node. */
export interface TreeDepartmentNode extends DepartmentGroup {
  date: string;
  reasons: DowntimeReasonShare[];
  /** Machines allocated to this department ON THIS DATE, worst downtime first. */
  machines: MachineLogNode[];
}

/** TIER 1 — one calendar day and the plant-wide hours it lost. */
export interface DateNode {
  /** `YYYY-MM-DD` — the React key and the accordion's collapse key. */
  key: string;
  date: string;
  /** `Thu` — printed beside the date so a manager can see the shift pattern. */
  weekday: string;
  entries: number;
  downtimeHours: number;
  runningHours: number;
  /** Highest-impact reason anywhere in the plant that day (by hours). */
  topReason: string;
  /** Everything the floor typed that day, deduplicated, worst machine first. */
  remarks: string[];
  reasons: DowntimeReasonShare[];
  /** Departments in manufacturing-flow order. */
  departments: TreeDepartmentNode[];
}

/** One `Machine/Product` row of the wastage data matrix. */
export interface ScrapMatrixRow {
  key: string;
  machineProduct: string;
  machine: string;
  product: string;
  actualKg: number;
  scrapKg: number;
  /** (Rejected KG / Actual KG) × 100 — the grid's Rejection % denominator. */
  wastagePct: number;
  defectReason: string;
  entries: number;
}

/** One day of the wastage trend timeline (ascending by date). */
export interface ScrapDayPoint {
  date: string;
  actualKg: number;
  scrapKg: number;
  entries: number;
}

/** One department tier of the rejection roll-up. */
export interface DepartmentScrapRow {
  department: string;
  actualKg: number;
  scrapKg: number;
  wastagePct: number;
  entries: number;
  downtimeHours: number;
}

/** Header metrics shared by both sheets. */
export interface AnalyticsTotals {
  entries: number;
  actualKg: number;
  scrapKg: number;
  wastagePct: number;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Field readers — one place that knows how a row names its world
 * ══════════════════════════════════════════════════════════════════════════ */

/** Reason shown for an empty/blank label — never an empty pie slice. */
export const UNATTRIBUTED_REASON = 'Unspecified Downtime';

/** `Machine Maintenance` (trimmed) or `Unspecified Downtime` for blank. */
export function normalizeReason(value: string | null | undefined): string {
  const s = (value ?? '').trim();
  return s || UNATTRIBUTED_REASON;
}

/** Machine code first (it is what the floor shouts), then name, then a label. */
export function entryMachineLabel(row: ProductionEntryRow): string {
  const v = row.machineNo || row.machine?.machineCode || row.machine?.name || '';
  return v.trim() || 'Unassigned Machine';
}

export function entryProductName(row: ProductionEntryRow): string {
  const v = row.item?.name || row.item?.itemCode || '';
  return v.trim() || 'Unnamed Product';
}

export function entryDepartmentLabel(row: ProductionEntryRow): string {
  const v = row.department?.name || row.department?.departmentCode || '';
  return v.trim() || 'Unassigned Department';
}

/** Wastage reason code: the operator's remark, else an explicit dash. */
export function entryDefectReason(row: ProductionEntryRow): string {
  const v = (row.remarks ?? '').trim();
  return v || '—';
}

/**
 * `1.0` / `8.5` — fixed decimals for hour cells.
 * Deliberately NOT `formatNumber`, which drops trailing zeros (`1`) and would
 * print the spec's `1.0h Machine Maintenance` as `1h …`.
 */
export function hoursFixed(value: number, decimals = 1): string {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toFixed(decimals);
}

/** `8.50` for weight cells (KG always carries two decimals). */
export function kgFixed(value: number): string {
  const n = Number(value);
  return formatNumber(Number.isFinite(n) ? n : 0, 2);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Manufacturing flow — the order the grouped grid walks in
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The canonical shop-floor tiers, in flow order. The audit grid walks them
 * top-to-bottom so Raw Material always opens the sheet and Dispatch always
 * closes it — a manager reads the plant in the direction material travels
 * instead of an alphabetised dump of department names.
 *
 * Tiers that carry no entry in the sample are simply not rendered: an empty
 * banner would claim work the data does not show. Departments outside the
 * list (a new tier, a typo, a plant-specific alias) are appended AFTER every
 * known tier, alphabetical, so they are still visible but never displace the
 * canonical flow.
 */
export const DEPARTMENT_TIERS = [
  'Raw Material',
  'Straightening',
  'Swaging',
  'Spoke',
  'Plating',
  'Hand Packing',
  'Dispatch',
] as const;

/** `Raw Material Store` → `rawmaterialstore`, so spacing/case never split a tier. */
function normalizeTierName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Position of `name` inside the manufacturing flow.
 *
 * Resolution order (most confident first):
 *   1. exact match, case/punctuation/space insensitive (`Handpacking` = `Hand Packing`)
 *   2. containment either way (`Raw Material Store` contains `Raw Material`)
 *   3. unknown → one past the last tier, so nothing ever hides off-list
 */
export function departmentTierIndex(name: string): number {
  const raw = (name ?? '').trim().toLowerCase();
  const key = normalizeTierName(raw);
  if (!key) return DEPARTMENT_TIERS.length;

  const exact = DEPARTMENT_TIERS.findIndex((tier) => normalizeTierName(tier) === key);
  if (exact >= 0) return exact;

  const containing = DEPARTMENT_TIERS.findIndex((tier) => {
    const normTier = normalizeTierName(tier);
    return key.includes(normTier) || normTier.includes(key);
  });
  return containing >= 0 ? containing : DEPARTMENT_TIERS.length;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Downtime (Tab A)
 * ══════════════════════════════════════════════════════════════════════════ */

/**
 * The split of ONE entry's downtime.
 *
 * Child lines win whenever hydration produced usable hours; otherwise the
 * whole entry total is attributed to the entry-level reason. An entry with no
 * logged downtime returns `[]` (never a zero-hour phantom bucket).
 */
export function rowDowntimeLines(
  row: ProductionEntryRow,
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): DowntimeLineLite[] {
  const total = toNum(row.downtimeHours);
  if (!(total > 0)) return [];
  const hydrated = (linesById?.get(row.id) ?? []).filter((l) => Number(l.hours) > 0);
  if (hydrated.length) {
    // `remarks` is carried through only when it exists, so a hydrated line is
    // still byte-equal to the line the detail payload returned.
    return hydrated.map((l) => ({
      reason: normalizeReason(l.reason),
      hours: round2(l.hours),
      ...(l.remarks ? { remarks: l.remarks } : {}),
    }));
  }
  return [{ reason: normalizeReason(row.downtimeReasonText), hours: round2(total) }];
}

/**
 * Reason → hours for the pie chart, worst reason first.
 * Multi-reason entries contribute one slice PER line, so a row split
 * `1.0h Machine Maintenance | 1.0h Manpower Unavailable` lands 1.0h on each.
 */
export function downtimeBuckets(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): DowntimeBucket[] {
  const byReason = new Map<string, { hours: number; rows: Set<string> }>();
  for (const row of rows) {
    for (const line of rowDowntimeLines(row, linesById)) {
      const key = normalizeReason(line.reason);
      const cur = byReason.get(key) ?? { hours: 0, rows: new Set<string>() };
      cur.hours = round2(cur.hours + line.hours);
      cur.rows.add(row.id);
      byReason.set(key, cur);
    }
  }
  return [...byReason.entries()]
    .map(([reason, v]) => ({ reason, hours: v.hours, entries: v.rows.size }))
    .sort((a, b) => b.hours - a.hours || a.reason.localeCompare(b.reason));
}

/**
 * The multi-reason breakdown row, exactly as the spec renders it:
 *
 *     1.0h Machine Maintenance | 1.0h Manpower Unavailable
 *
 * `—` when the entry logged no downtime, so the column never renders blank.
 */
export function breakdownPhrase(
  row: ProductionEntryRow,
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): string {
  const lines = rowDowntimeLines(row, linesById);
  if (!lines.length) return '—';
  return lines.map((l) => `${hoursFixed(l.hours)}h ${normalizeReason(l.reason)}`).join(' | ');
}

/** Entries that actually stopped a machine, worst downtime first. */
export function downtimeEntries(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): Array<{ row: ProductionEntryRow; phrase: string; hours: number }> {
  return rows
    .map((row) => ({ row, phrase: breakdownPhrase(row, linesById), hours: toNum(row.downtimeHours) }))
    .filter((e) => e.hours > 0)
    .sort((a, b) => b.hours - a.hours || a.row.entryDate.localeCompare(b.row.entryDate));
}

/**
 * The free-text floor remarks for ONE entry, in the order an auditor wants them:
 *
 *   1. each downtime segment's own `remarks` — the note typed beside the reason
 *   2. the entry-level `remarks` written on the Edit Entry Form
 *   3. the CATEGORY (`downtimeReasonText`) — only when nothing free was typed
 *
 * Step 3 is what keeps `Machine Maintenance` / `Other` rows from showing a bare
 * template word when the operator DID leave a note, while guaranteeing the
 * OPERATIONAL REMARKS column is never an empty cell. Returns `[]` only for an
 * entry that neither stopped nor carried a note.
 */
export function entryOperationalRemarks(
  row: ProductionEntryRow,
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): string[] {
  const out: string[] = [];
  const push = (value: string | null | undefined) => {
    const text = (value ?? '').trim();
    if (text && !out.includes(text)) out.push(text);
  };
  for (const line of rowDowntimeLines(row, linesById)) push(line.remarks);
  push(row.remarks);
  if (out.length) return out;
  if (toNum(row.downtimeHours) > 0) push(normalizeReason(row.downtimeReasonText));
  return out;
}

/** Merges several entries' remark lists, de-duplicated, first-seen order. */
export function mergeRemarks(groups: ReadonlyArray<readonly string[]>): string[] {
  const out: string[] = [];
  for (const group of groups) {
    for (const text of group) {
      const value = text.trim();
      if (value && !out.includes(value)) out.push(value);
    }
  }
  return out;
}

/** How many remarks a single grid cell prints before it truncates. */
export const REMARKS_DISPLAY_LIMIT = 3;

/**
 * `changed bearing · waiting for wire · +2 more` — one dense line for the cell,
 * with the full list still available in the cell's tooltip.
 */
export function remarksSummary(
  remarks: readonly string[],
  limit: number = REMARKS_DISPLAY_LIMIT,
): string {
  if (!remarks.length) return '—';
  const shown = remarks.slice(0, limit).join(' · ');
  const hidden = remarks.length - limit;
  return hidden > 0 ? `${shown} · +${hidden} more` : shown;
}

/* ── shared reason-hour accumulators ─────────────────────────────────────── */

function addReasonHours(acc: Map<string, number>, reason: string, hours: number): void {
  acc.set(reason, round2((acc.get(reason) ?? 0) + hours));
}

/** Hours first, then alphabetically, so a tie still renders deterministically. */
function toReasonShares(acc: Map<string, number>): DowntimeReasonShare[] {
  return [...acc.entries()]
    .map(([reason, hours]) => ({ reason, hours }))
    .sort((a, b) => b.hours - a.hours || a.reason.localeCompare(b.reason));
}

/** Highest-impact reason of an hours accumulator; `—` when it never stopped. */
function topReasonOf(shares: readonly DowntimeReasonShare[]): string {
  return shares.length ? shares[0].reason : '—';
}

const byMachineDowntime = (a: MachineDowntimeRow, b: MachineDowntimeRow): number =>
  b.downtimeHours - a.downtimeHours || a.machine.localeCompare(b.machine);

/** Manufacturing flow first, then worst downtime — the order the sheet prints. */
const byDepartmentFlow = (a: { tier: number; downtimeHours: number; department: string }, b: typeof a): number =>
  a.tier - b.tier || b.downtimeHours - a.downtimeHours || a.department.localeCompare(b.department);

/* Plain code-unit order, so a `Undated` bucket can never leapfrog a real date
   because of locale collation rules. */
const byDateKey = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : 0;

/** Rows the list payload somehow left undated still belong on the audit. */
const UNDATED_DATE = 'Undated';

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/**
 * `2026-10-01` → `Thu`. Built from UTC components so the ISO date can never be
 * shifted a day by the browser's local timezone (a date parsed as local
 * midnight reads the previous day for anyone west of Greenwich).
 */
export function dateWeekday(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((date ?? '').slice(0, 10));
  if (!m) return '—';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? '—' : WEEKDAY_NAMES[d.getUTCDay()];
}

/**
 * THE HIERARCHY behind Tab A — the 3-tier audit tree:
 *
 *     TIER 1  2026-10-01 · Thu          the plant's total loss that day
 *       TIER 2  Straightening           one department inside that date
 *         TIER 3  SPK-02                the machine, its hours, its floor notes
 *
 * Totals are accumulated per date, per department AND per machine from the
 * SAME pass, so a parent's figures are always the exact sum of the rows beneath
 * it — the accordion can never disagree with itself.
 *
 * Zero-downtime entries are kept on purpose: this is an audit tree, not a
 * "problems only" list, and `downtimeDepartmentGroups` (below) flattens exactly
 * this structure so a machine that ran clean is never silently dropped.
 */
export function downtimeTree(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): DateNode[] {
  interface MachineAcc {
    machine: string;
    department: string;
    date: string;
    downtimeHours: number;
    runningHours: number;
    entries: number;
    reasonHours: Map<string, number>;
    logs: ProductionEntryRow[];
  }
  interface DeptAcc {
    department: string;
    tier: number;
    date: string;
    downtimeHours: number;
    runningHours: number;
    entries: number;
    reasonHours: Map<string, number>;
    machines: Map<string, MachineAcc>;
  }
  interface DayAcc {
    date: string;
    entries: number;
    downtimeHours: number;
    runningHours: number;
    reasonHours: Map<string, number>;
    departments: Map<string, DeptAcc>;
  }

  const days = new Map<string, DayAcc>();

  for (const row of rows) {
    const date = (row.entryDate ?? '').slice(0, 10) || UNDATED_DATE;
    const department = entryDepartmentLabel(row);

    let day = days.get(date);
    if (!day) {
      day = {
        date,
        entries: 0,
        downtimeHours: 0,
        runningHours: 0,
        reasonHours: new Map<string, number>(),
        departments: new Map<string, DeptAcc>(),
      };
      days.set(date, day);
    }

    let dept = day.departments.get(department);
    if (!dept) {
      dept = {
        department,
        tier: departmentTierIndex(department),
        date,
        entries: 0,
        downtimeHours: 0,
        runningHours: 0,
        reasonHours: new Map<string, number>(),
        machines: new Map<string, MachineAcc>(),
      };
      day.departments.set(department, dept);
    }

    const machine = entryMachineLabel(row);
    let acc = dept.machines.get(machine);
    if (!acc) {
      acc = {
        machine,
        department,
        date,
        entries: 0,
        downtimeHours: 0,
        runningHours: 0,
        reasonHours: new Map<string, number>(),
        logs: [],
      };
      dept.machines.set(machine, acc);
    }

    const downtime = toNum(row.downtimeHours);
    const running = toNum(row.runningHours);

    day.entries += 1;
    day.downtimeHours = round2(day.downtimeHours + downtime);
    day.runningHours = round2(day.runningHours + running);

    dept.entries += 1;
    dept.downtimeHours = round2(dept.downtimeHours + downtime);
    dept.runningHours = round2(dept.runningHours + running);

    acc.entries += 1;
    acc.downtimeHours = round2(acc.downtimeHours + downtime);
    acc.runningHours = round2(acc.runningHours + running);
    acc.logs.push(row);

    for (const line of rowDowntimeLines(row, linesById)) {
      addReasonHours(day.reasonHours, line.reason, line.hours);
      addReasonHours(dept.reasonHours, line.reason, line.hours);
      addReasonHours(acc.reasonHours, line.reason, line.hours);
    }
  }

  return [...days.values()]
    .map<DateNode>((day) => {
      // Tier 2 first: a date's remarks and dominant reason are the union of its
      // departments, so the header can never disagree with its children.
      const deptNodes: TreeDepartmentNode[] = [...day.departments.values()]
        .map<TreeDepartmentNode>((d) => {
          const machineNodes: MachineLogNode[] = [...d.machines.values()]
            .map<MachineLogNode>((m) => {
              const shares = toReasonShares(m.reasonHours);
              return {
                key: `${m.date}\u0000${m.department}\u0000${m.machine}`,
                machine: m.machine,
                department: m.department,
                date: m.date,
                downtimeHours: m.downtimeHours,
                runningHours: m.runningHours,
                entries: m.entries,
                topReason: topReasonOf(shares),
                remarks: mergeRemarks(m.logs.map((log) => entryOperationalRemarks(log, linesById))),
                reasons: shares,
                logs: m.logs,
              };
            })
            .sort(byMachineDowntime);

          const shares = toReasonShares(d.reasonHours);
          return {
            key: d.department,
            department: d.department,
            tier: d.tier,
            date: d.date,
            downtimeHours: d.downtimeHours,
            runningHours: d.runningHours,
            entries: d.entries,
            topReason: topReasonOf(shares),
            // The banner is the union of its machine lines, worst machine first.
            remarks: mergeRemarks(machineNodes.map((n) => n.remarks)),
            reasons: shares,
            machines: machineNodes,
          };
        })
        .sort(byDepartmentFlow);

      const dayShares = toReasonShares(day.reasonHours);
      return {
        key: day.date,
        date: day.date,
        weekday: dateWeekday(day.date),
        entries: day.entries,
        downtimeHours: day.downtimeHours,
        runningHours: day.runningHours,
        topReason: topReasonOf(dayShares),
        remarks: mergeRemarks(deptNodes.map((n) => n.remarks)),
        reasons: dayShares,
        departments: deptNodes,
      };
    })
    .sort(byDateKey);
}

/**
 * Department ▸ machine roll-up ACROSS every date — the flat view the KPI tiles
 * and the department bar chart read. Derived by flattening `downtimeTree`
 * rather than re-accumulating the rows, so the two views can never compute a
 * machine's hours twice and drift apart. A machine that ran in two departments
 * still appears once per department (it IS two production runs).
 */
export function downtimeDepartmentGroups(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): DepartmentGroup[] {
  interface MachineAcc {
    key: string;
    machine: string;
    department: string;
    downtimeHours: number;
    runningHours: number;
    entries: number;
    reasonHours: Map<string, number>;
    logs: ProductionEntryRow[];
  }
  interface DeptAcc {
    department: string;
    tier: number;
    downtimeHours: number;
    runningHours: number;
    entries: number;
    reasonHours: Map<string, number>;
    machines: Map<string, MachineAcc>;
  }

  const byDept = new Map<string, DeptAcc>();

  for (const day of downtimeTree(rows, linesById)) {
    for (const deptNode of day.departments) {
      let dept = byDept.get(deptNode.department);
      if (!dept) {
        dept = {
          department: deptNode.department,
          tier: deptNode.tier,
          downtimeHours: 0,
          runningHours: 0,
          entries: 0,
          reasonHours: new Map<string, number>(),
          machines: new Map<string, MachineAcc>(),
        };
        byDept.set(deptNode.department, dept);
      }
      dept.entries += deptNode.entries;
      dept.downtimeHours = round2(dept.downtimeHours + deptNode.downtimeHours);
      dept.runningHours = round2(dept.runningHours + deptNode.runningHours);
      for (const share of deptNode.reasons) addReasonHours(dept.reasonHours, share.reason, share.hours);

      for (const machineNode of deptNode.machines) {
        let acc = dept.machines.get(machineNode.machine);
        if (!acc) {
          acc = {
            key: `${dept.department}\u0000${machineNode.machine}`,
            machine: machineNode.machine,
            department: dept.department,
            downtimeHours: 0,
            runningHours: 0,
            entries: 0,
            reasonHours: new Map<string, number>(),
            logs: [],
          };
          dept.machines.set(machineNode.machine, acc);
        }
        acc.entries += machineNode.entries;
        acc.downtimeHours = round2(acc.downtimeHours + machineNode.downtimeHours);
        acc.runningHours = round2(acc.runningHours + machineNode.runningHours);
        // Dates were walked ascending, so the merged log list stays chronological.
        acc.logs.push(...machineNode.logs);
        for (const share of machineNode.reasons) addReasonHours(acc.reasonHours, share.reason, share.hours);
      }
    }
  }

  return [...byDept.values()]
    .map<DepartmentGroup>((dept) => {
      const machines = [...dept.machines.values()]
        .map<MachineDowntimeRow>((m) => {
          const shares = toReasonShares(m.reasonHours);
          return {
            key: m.key,
            machine: m.machine,
            department: m.department,
            downtimeHours: m.downtimeHours,
            runningHours: m.runningHours,
            entries: m.entries,
            topReason: topReasonOf(shares),
            remarks: mergeRemarks(m.logs.map((log) => entryOperationalRemarks(log, linesById))),
            logs: m.logs,
          };
        })
        .sort(byMachineDowntime);

      const shares = toReasonShares(dept.reasonHours);
      return {
        key: dept.department,
        department: dept.department,
        tier: dept.tier,
        downtimeHours: dept.downtimeHours,
        runningHours: dept.runningHours,
        entries: dept.entries,
        topReason: topReasonOf(shares),
        remarks: mergeRemarks(machines.map((m) => m.remarks)),
        machines,
      };
    })
    .sort(byDepartmentFlow);
}

/**
 * Flat worst-machine-first view used by the KPI tiles. Derived from the
 * hierarchy rather than re-accumulated, so a machine's figures can never be
 * computed twice and drift apart. A machine that ran in two departments still
 * appears once per department (it IS two production runs).
 */
export function machineDowntimeRanking(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): MachineDowntimeRow[] {
  return downtimeDepartmentGroups(rows, linesById)
    .flatMap((group) => group.machines)
    .sort(byMachineDowntime);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Chart 1 & chart 3 — the horizontal analytics matrix above the tree
 * ══════════════════════════════════════════════════════════════════════════ */

/** One horizontal bar of the department-wise downtime comparison. */
export interface DepartmentBar {
  department: string;
  tier: number;
  hours: number;
  entries: number;
}

/**
 * CHART 1 — one bar PER department, longest loss first so the worst stoppage
 * sits at the top of a `layout="vertical"` bar chart. Rolled up from the
 * hierarchy rather than re-summed, so a bar can never disagree with the banner
 * it came from. Departments that never stopped still print (they cost 0 h).
 */
export function departmentDowntimeBars(
  rows: readonly ProductionEntryRow[],
  linesById?: ReadonlyMap<string, DowntimeLineLite[]> | null,
): DepartmentBar[] {
  return downtimeDepartmentGroups(rows, linesById)
    .map((group) => ({
      department: group.department,
      tier: group.tier,
      hours: group.downtimeHours,
      entries: group.entries,
    }))
    .sort(
      (a, b) => b.hours - a.hours || a.tier - b.tier || a.department.localeCompare(b.department),
    );
}

/** One point of the daily downtime trend line (ascending by date). */
export interface DowntimeDayPoint {
  date: string;
  hours: number;
  entries: number;
}

/**
 * CHART 3 — the daily spike-and-drop trajectory of machine delays. Ascending by
 * `entryDate`, one point per day that produced anything. Days that ran clean
 * stay in the series (their 0 h point IS the recovery); days with no entries at
 * all are NOT injected, so a closed Sunday cannot drag the baseline down.
 */
export function dailyDowntimeSeries(rows: readonly ProductionEntryRow[]): DowntimeDayPoint[] {
  const byDay = new Map<string, DowntimeDayPoint>();
  for (const row of rows) {
    const date = (row.entryDate ?? '').slice(0, 10);
    if (!date) continue;
    let cur = byDay.get(date);
    if (!cur) {
      cur = { date, hours: 0, entries: 0 };
      byDay.set(date, cur);
    }
    cur.entries += 1;
    cur.hours = round2(cur.hours + toNum(row.downtimeHours));
  }
  return [...byDay.values()].sort(byDateKey);
}

/* ══════════════════════════════════════════════════════════════════════════
 * Print / PDF projection of the 3-tier tree
 * ══════════════════════════════════════════════════════════════════════════ */

/** Column headers shared by the PDF table and the sheet's own grid. */
export const DOWNTIME_TREE_HEADERS = [
  'Date / Department / Machine',
  'Entries',
  'Downtime (H)',
  'Running (H)',
  'Dominant Reason',
  'OPERATIONAL REMARKS',
] as const;

/** One line of the exported table: a date node, a department or a machine. */
export interface DowntimeOutlineRow {
  level: 'date' | 'department' | 'machine';
  label: string;
  entries: string;
  downtime: string;
  running: string;
  reason: string;
  remarks: string;
}

/**
 * Flattens the tree into the exact row order a PDF/print table needs: every
 * date node, immediately followed by its departments, each immediately followed
 * by the machines it owns — so `autoTable` can tint the levels and indent the
 * children without ever losing the nesting across a page break.
 *
 * Indentation is plain ASCII spaces (the PDF core fonts have no box-drawing
 * characters) — 0 / 3 / 6.
 */
export function downtimeTreeOutline(tree: readonly DateNode[]): DowntimeOutlineRow[] {
  const cells = (node: {
    entries: number;
    downtimeHours: number;
    runningHours: number;
    topReason: string;
    remarks: readonly string[];
  }): Omit<DowntimeOutlineRow, 'level' | 'label'> => ({
    entries: formatNumber(node.entries, 0),
    downtime: `${hoursFixed(node.downtimeHours)}h`,
    running: `${hoursFixed(node.runningHours)}h`,
    reason: node.topReason,
    remarks: remarksSummary(node.remarks),
  });

  const out: DowntimeOutlineRow[] = [];
  for (const day of tree) {
    out.push({ level: 'date', label: day.date, ...cells(day) });
    for (const dept of day.departments) {
      out.push({ level: 'department', label: `   ${dept.department}`, ...cells(dept) });
      for (const machine of dept.machines) {
        out.push({ level: 'machine', label: `      ${machine.machine}`, ...cells(machine) });
      }
    }
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
 * Rejection & Scrap (Tab B)
 * ══════════════════════════════════════════════════════════════════════════ */

/** Actual → KG with the grid's exact conversion; unknown UOM contributes 0. */
function kgOf(row: ProductionEntryRow, quantity: number): number {
  const kg = calcActualKg(
    row.uom?.code || '',
    quantity,
    row.item?.weightPerPiece,
    row.item?.weightPerMeter,
  );
  return kg == null ? 0 : kg;
}

/** The four-column data matrix: Machine/Product | KG produced | KG rejected | reason. */
export function scrapMatrix(rows: readonly ProductionEntryRow[]): ScrapMatrixRow[] {
  interface Acc extends ScrapMatrixRow {
    seenDefect: string | null;
  }
  const byKey = new Map<string, Acc>();
  for (const row of rows) {
    const machine = entryMachineLabel(row);
    const product = entryProductName(row);
    const key = `${machine}\u0000${product}`;
    let cur = byKey.get(key);
    if (!cur) {
      cur = {
        key,
        machineProduct: `${machine} · ${product}`,
        machine,
        product,
        actualKg: 0,
        scrapKg: 0,
        wastagePct: 0,
        defectReason: '—',
        entries: 0,
        seenDefect: null,
      };
      byKey.set(key, cur);
    }
    cur.entries += 1;
    cur.actualKg = round2(cur.actualKg + kgOf(row, toNum(row.actualQuantity)));
    cur.scrapKg = round2(cur.scrapKg + kgOf(row, toNum(row.scrapQuantity)));
    if (cur.seenDefect == null) {
      const defect = (row.remarks ?? '').trim();
      if (defect) {
        cur.seenDefect = defect;
        cur.defectReason = defect;
      }
    }
  }
  return [...byKey.values()]
    .map((r) => ({
      key: r.key,
      machineProduct: r.machineProduct,
      machine: r.machine,
      product: r.product,
      actualKg: r.actualKg,
      scrapKg: r.scrapKg,
      // Same denominator as the grid's Rejection % : a zero / unknown Actual KG
      // must read 0, never Infinity or a phantom 100%.
      wastagePct: r.actualKg > 0 ? (r.scrapKg / r.actualKg) * 100 : 0,
      defectReason: r.defectReason,
      entries: r.entries,
    }))
    .sort((a, b) => b.scrapKg - a.scrapKg || b.actualKg - a.actualKg || a.machineProduct.localeCompare(b.machineProduct));
}

/**
 * Daily scrap generation timeline across the selected date range — ascending by
 * `entryDate`, one point per day that produced anything (empty days are NOT
 * injected, so a closed Sunday cannot drag the chart baseline to zero).
 */
export function dailyScrapSeries(rows: readonly ProductionEntryRow[]): ScrapDayPoint[] {
  const byDate = new Map<string, ScrapDayPoint>();
  for (const row of rows) {
    const date = (row.entryDate ?? '').slice(0, 10);
    if (!date) continue;
    let cur = byDate.get(date);
    if (!cur) {
      cur = { date, actualKg: 0, scrapKg: 0, entries: 0 };
      byDate.set(date, cur);
    }
    cur.entries += 1;
    cur.actualKg = round2(cur.actualKg + kgOf(row, toNum(row.actualQuantity)));
    cur.scrapKg = round2(cur.scrapKg + kgOf(row, toNum(row.scrapQuantity)));
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Department tier roll-up (Straightening · Swaging · Plating), worst waste first. */
export function departmentScrapRollup(rows: readonly ProductionEntryRow[]): DepartmentScrapRow[] {
  const byDept = new Map<string, DepartmentScrapRow>();
  for (const row of rows) {
    const department = entryDepartmentLabel(row);
    let cur = byDept.get(department);
    if (!cur) {
      cur = { department, actualKg: 0, scrapKg: 0, wastagePct: 0, entries: 0, downtimeHours: 0 };
      byDept.set(department, cur);
    }
    cur.entries += 1;
    cur.actualKg = round2(cur.actualKg + kgOf(row, toNum(row.actualQuantity)));
    cur.scrapKg = round2(cur.scrapKg + kgOf(row, toNum(row.scrapQuantity)));
    cur.downtimeHours = round2(cur.downtimeHours + toNum(row.downtimeHours));
  }
  return [...byDept.values()]
    .map((d) => ({
      ...d,
      wastagePct: d.actualKg > 0 ? (d.scrapKg / d.actualKg) * 100 : 0,
    }))
    .sort((a, b) => b.scrapKg - a.scrapKg || b.actualKg - a.actualKg || a.department.localeCompare(b.department));
}

/**
 * `Oct 2026` · `Sep – Oct 2026` · `All time` — scopes a "monthly" chart to the
 * period the grid's date filter actually selected, so the pie title never
 * claims a month the data does not cover.
 */
export function sampleMonthLabel(rows: readonly ProductionEntryRow[]): string {
  const months = new Set<string>();
  for (const row of rows) {
    const m = (row.entryDate ?? '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m)) months.add(m);
  }
  if (months.size === 0) return 'no dated entries';
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = (m: string) => {
    const [year, mm] = m.split('-');
    return `${names[Number(mm) - 1] ?? mm} ${year}`;
  };
  const sorted = [...months].sort();
  if (sorted.length === 1) return label(sorted[0]);
  return `${label(sorted[0])} – ${label(sorted[sorted.length - 1])}`;
}

/** Header tile numbers for Tab B. */
export function scrapTotals(rows: readonly ProductionEntryRow[]): AnalyticsTotals {
  let actualKg = 0;
  let scrapKg = 0;
  for (const row of rows) {
    actualKg = round2(actualKg + kgOf(row, toNum(row.actualQuantity)));
    scrapKg = round2(scrapKg + kgOf(row, toNum(row.scrapQuantity)));
  }
  return {
    entries: rows.length,
    actualKg,
    scrapKg,
    wastagePct: actualKg > 0 ? (scrapKg / actualKg) * 100 : 0,
  };
}

/** Rows whose UOM could not be converted to KG — surfaced in the caption so a
 *  `0 KG` tile is never mistaken for "nothing was produced". */
export function unweightedEntryCount(rows: readonly ProductionEntryRow[]): number {
  return rows.filter((row) => calcActualKg(row.uom?.code || '', toNum(row.actualQuantity), row.item?.weightPerPiece, row.item?.weightPerMeter) == null).length;
}
