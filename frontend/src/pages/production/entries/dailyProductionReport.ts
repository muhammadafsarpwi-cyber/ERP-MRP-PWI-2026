import dayjs from 'dayjs';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { calcActualKg, perUnitWeightLabel } from '../../../utils/productionWeight';
/* Both are pure (no React, no antd, no EntryList), so importing them keeps
 * this module unit-testable while guaranteeing the printed OT / running hours
 * are EXACTLY the figures the on-screen grid and its KPIs render. */
import { effectiveDowntime, effectiveRunning } from './downtimeHours';
import { entryOvertimeHours } from './overtimeHours';

/**
 * PHASE 7 — DAILY PRODUCTION REPORT model (Print / PDF / Excel-CSV).
 * ---------------------------------------------------------------------------
 * ONE model, consumed by the three export surfaces in `EntryList.tsx`:
 *   1. Print   → buildPrintHtml(model)  (hidden print window, A4 landscape)
 *   2. PDF     → exportPdf()            (jsPDF + autoTable, column order/widths)
 *   3. Excel   → buildDailyProductionCsv(model) (UTF-8 CSV, numeric columns)
 *
 * Business rules encoded here (identical for all three):
 *   HEADER      · Division: <selected division>          (filter, else the one
 *                 division present in the rows, else "All Divisions")
 *               · Daily Production Report                (title)
 *               · Date: <the date selected in the filter> — e.g. `Date:
 *                 2026-10-02`. Falls back to the rows' single date, else
 *                 `Date: All dates`. Never a hardcoded "today".
 *   DEPARTMENTS · fixed production sequence instead of A→Z:
 *                 1 Straightener → 2 Swagging → 3 Spoke → 4 Plating →
 *                 5 Packing (present only when entries exist). Any other
 *                 department keeps its name and follows those five (A→Z).
 *                 Matching is exact first, then the LONGEST keyword, so
 *                 "Spoke Plating" lands in Plating (not Spoke) and
 *                 "Spoke Packing"/"Nipple Packing" land in Packing.
 *   ROW ORDER   · inside a department: SHIFT first — Day Shift rows, then
 *                 Night Shift rows — and inside each shift the machine
 *                 number ascending (SPK-01, SPK-02, …, SPK-10; the numeric-
 *                 aware compare keeps SPK-10 after SPK-02). Ties break on
 *                 date, then shift name.
 *   SUB-TOTALS  · `DAY SHIFT TOTAL — <dept>` at the end of the Day rows,
 *                 `NIGHT SHIFT TOTAL — <dept>` at the end of the Night rows
 *                 (only when that shift has entries), then
 *                 `DEPARTMENT GRAND TOTAL — <dept>`, then a report
 *                 `GRAND TOTAL — N departments`. Each row sums Target /
 *                 Actual / Actual KG / Rejection / Rejection % and shows the
 *                 WEIGHTED achievement (ΣActual / ΣTarget), never a row mean.
 *   COLUMNS     · Sr. # | Shift | Machine | OT (H) | Operator | Item /
 *                 Product | Target | Actual | Achievement % | WEIGHT (KG) |
 *                 Breakdown Reason / Status | REJECTION / SCRAP
 *                 — `Date` is appended only when the result spans more than
 *                 one day. The widths always total 100 and are budgeted so
 *                 no cell needs a third line (see the comment on
 *                 BASE_COLUMNS): Machine 5 and the two 11/10-point merged
 *                 columns free up the space Item / Product needs to keep a
 *                 product name on ONE line.
 *   TWO-LINE    · HARD MAXIMUM — no printed or PDF row is taller than two
 *                 lines. FOUR columns are stacked, and all four are nowrap +
 *                 ellipsized in the print CSS and by autoTable in the PDF,
 *                 so a long value can never wrap onto a 3rd line:
 *                 · Item / Product: line 1 = product name (bold, dark),
 *                   line 2 = Item/WIP code (light gray) — never the bundled
 *                   `Name (CODE)` form;
 *                 · Shift: line 1 = shift name, line 2 = the shift timing
 *                   (`06:00 - 14:00`), `-` when the timing is unknown;
 *                 · WEIGHT (KG): line 1 = Per Unit Weight (small, muted),
 *                   line 2 = Actual KG (bold, prominent) — the two former
 *                   columns fused into one;
 *                 · REJECTION / SCRAP: line 1 = Rejection KG (flat count),
 *                   line 2 = Rejection % — likewise fused.
 *                 Operator / breakdown reason are clamped to 2 lines.
 *   PER UNIT WT · the bare number (`0.00967`): the trailing ` KG/PCS` suffix
 *                 would wrap the narrow column, and the UOM travels in its
 *                 own trailing column anyway.
 *   OT          · `OT (H)` reads the canonical overtime rule (`overtime_hours`
 *                 → legacy `OT: X h` in remarks) via `entryOvertimeHours`, so
 *                 the paper figure always equals the grid's OT column and the
 *                 OT KPI. `—` when the entry has none.
 *   REJECTION % · `Rejection KG / (Actual KG + Rejection KG) × 100`, always
 *                 `.toFixed(2)` + `%`. The denominator is the TOTAL produced
 *                 (good + rejected), which is the same formula
 *                 `aggregateProductionTotals` already uses for the on-screen
 *                 scrap KPI — the two surfaces can no longer disagree. Both
 *                 operands are hard-cast with `Number()` (a decimal string
 *                 from the driver can never compare as 0) and only a zero
 *                 TOTAL produces `0.00%` (100% rejected of a zero-good run
 *                 correctly reads `100.00%`).
 *   ACHIEVEMENT · >= 70% → green ▲ next to the percentage; < 70% → red ▼.
 *                 The 70% threshold drives ONLY the arrow colour.
 *   RUNTIME     · the status cell NEVER shows a static word ("COMPLETED").
 *                 It is always the live runtime summary —
 *                 `11.5 hrs Running (95.8%) / 0.5 hrs Breakdown`, or
 *                 `8 hrs Running (100%)` when the shift had no downtime —
 *                 with the operator's downtime remark appended (` - Wire
 *                 jam`) when one was logged. Running / downtime are resolved
 *                 against `Shift Planned + Overtime` through the SAME
 *                 `effectiveRunning` / `effectiveDowntime` helpers the grid
 *                 renders, so paper and screen always agree. A row carrying
 *                 no hour data at all (no shift plan, nothing stored, no
 *                 downtime) prints the operator's remark on its own, or `—`
 *                 when there is none, rather than inventing a 100%.
 *
 * GLYPH MODE   · 'display' (print HTML + Excel) keeps the ▲/▼ glyphs;
 *               · 'pdf'     drops them to ASCII, because jsPDF writes UTF-16
 *                 for characters outside WinAnsiEncoding while embedding
 *                 WinAnsi fonts — the PDF draws the arrows as vector
 *                 triangles instead (see EntryList.exportPdf).
 *
 * This module is deliberately pure (no React, no antd, no import from
 * EntryList) so it can be unit-tested — see dailyProductionReport.test.ts.
 */

/* ------------------------------------------------------------------ *
 * Input shape — `ProductionEntryRow` (EntryList.tsx) satisfies it
 * structurally, so rows can be passed straight in.
 * ------------------------------------------------------------------ */
export interface ReportRowSource {
  entryDate?: string;
  division?: { name?: string; divisionCode?: string } | null;
  department?: { name?: string; departmentCode?: string } | null;
  shift?: {
    name?: string;
    shiftCode?: string;
    startTime?: string | null;
    /** Shift master end time — line 2 of the Shift cell (`06:00 - 14:00`). */
    endTime?: string | null;
    /** Shift master planned hours — the base of the runtime column. */
    plannedHours?: number | string | null;
  } | null;
  machine?: { machineCode?: string; name?: string } | null;
  machineNo?: string;
  operatorName?: string;
  item?: {
    name?: string;
    itemCode?: string;
    weightPerPiece?: number | null;
    weightPerMeter?: number | null;
  } | null;
  uom?: { code?: string } | null;
  targetQuantity?: number | string;
  actualQuantity?: number | string;
  achievementPercentage?: number | string | null;
  scrapQuantity?: number | string;
  /** Downtime shown in the runtime column (hours + reason). */
  downtimeHours?: number | string;
  downtimeReasonText?: string | null;
  /** Persisted running hours — fallback when the row has no shift plan. */
  runningHours?: number | string;
  /** Persisted overtime hours (the `OT (H)` column). Read by the canonical
   *  `entryOvertimeHours` rule, so legacy remarks `OT: X h` are honoured too. */
  overtimeHours?: number | string | null;
  /** Entry remarks — the legacy home of `OT: X h`, read by that same rule. */
  remarks?: string | null;
}

export interface ReportOptions {
  /** Division selected in the filter (already resolved to a name). */
  divisionName?: string | null;
  /** Filter date range, both `YYYY-MM-DD`. */
  dateFrom?: string | null;
  dateTo?: string | null;
  /** Shift selected in the filter (already resolved to a name). */
  shiftName?: string | null;
  /** Timestamp shown in the header; defaults to now. */
  generatedAt?: string;
  /** Operator display name (lookup-aware) — supplied by EntryList. */
  operatorName?: (row: ReportRowSource) => string;
  /** Authoritative row status — `getEntryStatus` supplied by EntryList. */
  status?: (row: ReportRowSource) => string;
  /** Optional lookup-aware shift timing (EntryList resolves the shift master).
   *  Falls back to the row's own `shift.startTime/endTime`. */
  shiftTiming?: (row: ReportRowSource) => string | null;
}

/* ------------------------------------------------------------------ *
 * Columns
 * ------------------------------------------------------------------ */
export type ReportColumnKey =
  | 'sr' | 'shift' | 'machine' | 'ot' | 'operator' | 'item' | 'target' | 'actual'
  | 'achievement' | 'weight' | 'status' | 'rejectionScrap' | 'date';

export interface ReportColumn {
  key: ReportColumnKey;
  label: string;
  align: 'left' | 'center' | 'right';
  /** Percentage of the table width (columns always total 100). */
  width: number;
}

/* ------------------------------------------------------------------ *
 * FUSED (stacked) COLUMNS — the two-line cells.
 *
 * `weight` fuses the former `Per Unit Weight` + `Actual KG` columns and
 * `rejectionScrap` fuses `Rejection` + `Rejection %`. Each holds its pair as
 * line 1 / line 2 instead of two independent grid columns.
 *
 * This registry is the SINGLE source of truth for all three surfaces:
 *   · print  → `reportTwoLineHtml` maps main/sub onto the CSS classes;
 *   · PDF    → `STACKED_PDF` supplies the per-line colour + weight;
 *   · Excel  → `csvLineCell` joins the pair with a newline in one cell.
 *
 * Note the reversed emphasis: Item/Shift lead with the BOLD line and trail
 * with the muted one, while WEIGHT leads muted (the small per-unit figure)
 * and trails bold/prominent (Actual KG — the number people read).
 * ------------------------------------------------------------------ */
export type StackedCellKey = 'item' | 'shift' | 'weight' | 'rejectionScrap';

const STACKED_CELLS: Record<StackedCellKey, { main: string; sub: string }> = {
  item: { main: 'rp-item-name', sub: 'rp-item-code' },
  shift: { main: 'rp-shift-name', sub: 'rp-shift-time' },
  weight: { main: 'rp-wt-top', sub: 'rp-wt-bottom' },
  rejectionScrap: { main: 'rp-rj-top', sub: 'rp-rj-bottom' },
};

export const STACKED_KEYS = Object.keys(STACKED_CELLS) as StackedCellKey[];

export function isStackedColumn(key: ReportColumnKey): key is StackedCellKey {
  return Object.prototype.hasOwnProperty.call(STACKED_CELLS, key);
}

/** Phase 7 column order — Shift and Machine lead, OT audits the extra hours
 *  right beside the shift/machine parameters, achievement precedes the two
 *  fused columns, and the live runtime summary replaces the static status.
 *
 *  COMPACT 2-LINE RHYTHM — the width budget guarantees that no cell ever
 *  needs a third line (print CSS keeps every cell at ≤ 2 physical lines):
 *    · Machine 5 and OT 5 are the narrowest cells (short codes / `2.5h`);
 *    · Operator gives up 1% (7 → 6) and Item / Product 2% (22 → 20) to fund
 *      the new OT column, which is enough for `125-300*17 Inner Straight`
 *      to stay on ONE line above its Item/WIP code;
 *    · WEIGHT (KG) keeps the 5 + 6 the two fused columns used to own (11),
 *      REJECTION / SCRAP the 6 + 6 (12 → trimmed to 10, since one header
 *      now covers both words) — those savings also fund OT;
 *    · Shift 9 holds the shift name (`General Shift`) on line 1 and the
 *      timing (`06:00 - 14:00`) on line 2, neither one wrapping;
 *    · Status 10 is clamped to 2 lines and carries the runtime summary.
 *  The columns ALWAYS total 100 (asserted by dailyProductionReport.test.ts). */
const BASE_COLUMNS: ReportColumn[] = [
  { key: 'sr', label: 'Sr. #', align: 'center', width: 4 },
  { key: 'shift', label: 'Shift', align: 'left', width: 9 },
  { key: 'machine', label: 'Machine', align: 'left', width: 5 },
  { key: 'ot', label: 'OT (H)', align: 'right', width: 5 },
  { key: 'operator', label: 'Operator', align: 'left', width: 6 },
  { key: 'item', label: 'Item / Product', align: 'left', width: 20 },
  { key: 'target', label: 'Target', align: 'right', width: 6 },
  { key: 'actual', label: 'Actual', align: 'right', width: 6 },
  { key: 'achievement', label: 'Achievement %', align: 'right', width: 8 },
  { key: 'weight', label: 'WEIGHT (KG)', align: 'right', width: 11 },
  { key: 'status', label: 'Breakdown Reason / Status', align: 'left', width: 10 },
  { key: 'rejectionScrap', label: 'REJECTION / SCRAP', align: 'right', width: 10 },
];

const DATE_COLUMN: ReportColumn = { key: 'date', label: 'Date', align: 'center', width: 6 };

/** Columns available only when the export spans several days (item gives up
 *  5% and the operator 1% so the set still totals 100%). */
function buildColumns(showDate: boolean): ReportColumn[] {
  if (!showDate) return BASE_COLUMNS.map((c) => ({ ...c }));
  return [
    ...BASE_COLUMNS.map((c) =>
      c.key === 'item' ? { ...c, width: 15 } : c.key === 'operator' ? { ...c, width: 5 } : { ...c },
    ),
    { ...DATE_COLUMN },
  ];
}

/** Number of leading columns merged into the single summary/label cell
 *  (Sr. # + Shift + Machine + OT + Operator). */
export function reportLabelSpan(columns: ReportColumn[]): number {
  const idx = columns.findIndex((c) => c.key === 'item');
  return idx > 0 ? idx : 1;
}

/* ------------------------------------------------------------------ *
 * Rows / totals
 * ------------------------------------------------------------------ */
export type ShiftKind = 'DAY' | 'NIGHT';

export interface ReportLine {
  sr: number;
  machine: string;
  operator: string;
  /** Line 1 of the Item / Product cell — the product name (bold, dark). */
  item: string;
  /** Line 2 of the Item / Product cell — the Item/WIP code (light gray). */
  itemCode: string;
  target: number;
  actual: number;
  perUnitWeight: string;
  actualKg: number | null;
  achievement: number | null;
  /** Authoritative status from `getEntryStatus` — carried as data only; the
   *  rendered cell always shows `runtime`, never this word. */
  status: string;
  /** Line 1 of the Shift cell — the shift name. */
  shift: string;
  /** Line 2 of the Shift cell — `06:00 - 14:00`, or `-` when unknown. */
  shiftTime: string;
  shiftKind: ShiftKind;
  /** Overtime hours (canonical `overtime_hours` → legacy remarks fallback). */
  ot: number;
  rejection: number;
  rejectionKg: number | null;
  /** `Rejection KG / (Actual KG + Rejection KG) × 100`, 2 decimals — the same
   *  formula `aggregateProductionTotals` uses on screen. 0 only when the total
   *  produced KG is zero / unknown. */
  rejectionPct: number;
  /** Live runtime summary replacing the static status word —
   *  `11.5 hrs Running (95.8%) / 0.5 hrs Breakdown - Wire jam`. */
  runtime: string;
  uom: string;
  date: string;
}

export interface ReportTotals {
  departments: number;
  entries: number;
  machines: number;
  target: number;
  actual: number;
  actualKg: number;
  /** Σ overtime hours. */
  ot: number;
  rejection: number;
  rejectionKg: number;
  /** Σ Rejection KG / (Σ Actual KG + Σ Rejection KG) × 100. */
  rejectionPct: number;
  /** Weighted achievement: ΣActual / ΣTarget × 100 (null when no target). */
  achievement: number | null;
}

/** Day-shift rows + their total, night-shift rows + their total. */
export interface ReportShiftGroup {
  kind: ShiftKind;
  /** `Day Shift` / `Night Shift` — the total row reads `<label> Total`. */
  label: string;
  lines: ReportLine[];
  totals: ReportTotals;
}

export interface ReportSection {
  name: string;
  /** Every line of the department, already in report (shift → machine) order. */
  lines: ReportLine[];
  /** Only the shifts that actually have entries. */
  shiftGroups: ReportShiftGroup[];
  totals: ReportTotals;
}

/** One printable/exportable block: a shift group (or the department roll-up)
 *  followed by its total row. Shared by Print, PDF and Excel. */
export interface ReportBlock {
  kind: 'shift' | 'department';
  label: string;
  lines: ReportLine[];
  totals: ReportTotals;
}

export interface DailyProductionReport {
  title: string;
  divisionName: string;
  divisionLabel: string;
  dateLabel: string;
  shiftLabel: string | null;
  metaLine: string;
  generatedLabel: string;
  showDate: boolean;
  columns: ReportColumn[];
  sections: ReportSection[];
  grand: ReportTotals;
}

/* ------------------------------------------------------------------ *
 * Constants + helpers
 * ------------------------------------------------------------------ */

/**
 * Fixed production sequence (Phase 6). Departments not listed here are kept
 * after these five, sorted A→Z by name.
 */
export const DEPARTMENT_ORDER = ['Straightener', 'Swagging', 'Spoke', 'Plating', 'Packing'] as const;

/** Achievement at or above this percentage counts as "on target". */
export const ACHIEVEMENT_THRESHOLD = 70;

export type AchievementTone = 'up' | 'down';

export type ReportGlyphMode = 'display' | 'pdf';

/** `▲` / `▼` shown next to the achievement percentage (print + Excel). */
export const TONE_GLYPH: Record<AchievementTone, string> = { up: '▲', down: '▼' };

export const TONE_COLOR: Record<AchievementTone, [number, number, number]> = {
  up: [22, 163, 74],
  down: [220, 38, 38],
};

/** Natural (numeric-aware) compare: SPK-02 < SPK-10, SW-01 < SW-02. */
export function compareMachineNo(a?: string, b?: string): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Day vs Night classification for the shift master of this system:
 *   · explicit keyword first — "Shift C (Night)", "General Shift (Night)" are
 *     NIGHT; "Shift A (Morning)", "Shift B (Afternoon)", "General Shift (Day)"
 *     are DAY;
 *   · else the shift's start hour (18:00–04:59 = NIGHT, e.g. E2E 12h = 06:00
 *     → DAY);
 *   · else DAY (safe default — Day Shift is always printed first).
 */
export function classifyShift(
  shift?: { name?: string; shiftCode?: string; startTime?: string | null } | null,
): ShiftKind {
  const text = `${shift?.name ?? ''} ${shift?.shiftCode ?? ''}`.toUpperCase();
  if (/\b(NIGHT|GRAVEYARD|SWING)\b/.test(text)) return 'NIGHT';
  if (/\b(DAY|MORNING|AFTERNOON)\b/.test(text)) return 'DAY';
  const m = /^(\d{1,2}):(\d{2})/.exec((shift?.startTime ?? '').trim());
  if (m) {
    const hour = Number(m[1]);
    return hour >= 18 || hour < 5 ? 'NIGHT' : 'DAY';
  }
  return 'DAY';
}

/**
 * Rank of a department name in the fixed sequence (lower prints first).
 * Exact name wins; otherwise the LONGEST matching keyword wins so
 * "Spoke Plating" → Plating and "Spoke Packing" → Packing. Unlisted
 * departments get `DEPARTMENT_ORDER.length` and sort A→Z after the sequence.
 */
export function departmentRank(name: string): number {
  const lower = String(name ?? '').trim().toLowerCase();
  let best = -1;
  let bestLen = -1;
  let exact = false;
  DEPARTMENT_ORDER.forEach((key, index) => {
    const k = key.toLowerCase();
    if (k === lower) {
      best = index;
      exact = true; // an exact name beats any partial match
      return;
    }
    if (exact) return;
    if (lower.includes(k) && k.length > bestLen) {
      best = index;
      bestLen = k.length;
    }
  });
  return best >= 0 ? best : DEPARTMENT_ORDER.length;
}

/** ▲ when the achievement reaches the threshold, ▼ below it (null when the
 *  achievement cannot be computed). */
export function achievementTone(value: number | null | undefined): AchievementTone | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return value >= ACHIEVEMENT_THRESHOLD ? 'up' : 'down';
}

const blank = (v?: string | null): string => (v ?? '').trim();
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/**
 * Line 1/2 of the runtime column — ALWAYS the live operation summary, never a
 * static status word:
 *
 *   `11.5 hrs Running (95.8%) / 0.5 hrs Breakdown - Coil change`
 *   `8 hrs Running (100%)`
 *
 * The hours are formatted with `formatNumber(…, 1)`, which drops trailing
 * zeros — that is what renders `8 hrs` and `(100%)` without a spurious
 * `.0`, while `95.8` keeps its single decimal. The breakdown half is omitted
 * entirely when the shift had no downtime, and the operator's logged remark
 * is appended last so the cause is auditable on paper.
 *
 * `available` is `Shift Planned + Overtime` (0 when the row carries no shift
 * plan); `running`/`downtime` are the figures already resolved against it by
 * `effectiveRunning` / `effectiveDowntime`, so the printed percentage is the
 * share of the AVAILABLE hours the machine actually ran.
 */
export function runtimeText(
  running: number,
  downtime: number,
  available: number,
  reason: string,
): string {
  // No hour data at all on this row (no shift plan, nothing stored, no
  // downtime): the report must not fabricate a confident "100%" for a
  // machine it knows nothing about. A remark the operator DID log still
  // stands on its own as the reason text — never silently discarded.
  if (!(available > 0) && !(running > 0) && !(downtime > 0)) return reason || '—';
  // With a shift plan the share is against the AVAILABLE hours; without one
  // it can only be against the hours the row actually accounts for.
  const base = available > 0 ? available : running + downtime;
  const pct = base > 0 ? (running / base) * 100 : 0;
  const head = `${formatNumber(running, 1)} hrs Running (${formatNumber(pct, 1)}%)`;
  const body = downtime > 0 ? `${head} / ${formatNumber(downtime, 1)} hrs Breakdown` : head;
  return reason ? `${body} - ${reason}` : body;
}

/** Rejection % — `Rejection KG / (Actual KG + Rejection KG) × 100`, 2 decimals.
 *  The denominator is the TOTAL produced (good + rejected), which is exactly
 *  what `aggregateProductionTotals` uses for the on-screen scrap KPI, so the
 *  two surfaces can never disagree. Both operands are hard-cast to Number
 *  first so a decimal string coming back from the driver can never silently
 *  compare as 0. Only a zero / unknown TOTAL yields `0.00%` — a run that
 *  produced nothing but scrap correctly reads `100.00%`. */
function rejectionPercent(rejectionKg: number | null | undefined, actualKg: number | null | undefined): number {
  const actual = Number(toNum(actualKg));
  const rejected = Number(toNum(rejectionKg));
  const total = actual + rejected;
  if (!(total > 0)) return 0; // 0, null, '' or NaN total → 0.00%
  return round2((rejected / total) * 100);
}

/** `0.15%` — always exactly 2 decimals, so an empty weight reads `0.00%`. */
export function rejectionPctLabel(pct: number | null | undefined): string {
  return `${toNum(pct).toFixed(2)}%`;
}

/** Bare per-unit weight (`0.00967`) — `perUnitWeightLabel`'s trailing
 *  ` KG/<UOM>` suffix is dropped: in the narrow weight column it pushes the
 *  cell onto a third line. Empty when the item has no usable weight, so the
 *  caller can fall back to the UOM / `—`. */
export function perUnitWeightValue(
  uom: string,
  weightPerPiece?: number | null,
  weightPerMeter?: number | null,
): string {
  const label = perUnitWeightLabel(uom, weightPerPiece, weightPerMeter);
  return label ? label.split(' ')[0] : '';
}

/** `HH:MM` from a `HH:MM:SS` shift timestamp (empty when unknown). */
function hhmm(value?: string | null): string {
  const m = /^(\d{1,2}:\d{2})/.exec(blank(value));
  return m ? m[1] : '';
}

/**
 * Line 2 of the Shift cell — the shift timing from the shift master / the
 * row's own logged times. `06:00 - 14:00` when both ends are known, a bare
 * `HH:MM` when only one is, `-` when no timing exists at all.
 */
function rowShiftTiming(shift?: ReportRowSource['shift']): string {
  const start = hhmm(shift?.startTime);
  const end = hhmm(shift?.endTime);
  if (start && end) return `${start} - ${end}`;
  if (start || end) return start || end;
  return '-';
}

function addLine(acc: { totals: ReportTotals; machines: Set<string> }, line: ReportLine): void {
  acc.totals.entries += 1;
  acc.totals.target += line.target;
  acc.totals.actual += line.actual;
  acc.totals.actualKg += line.actualKg ?? 0;
  acc.totals.ot += line.ot;
  acc.totals.rejection += line.rejection;
  acc.totals.rejectionKg += line.rejectionKg ?? 0;
  if (line.machine) acc.machines.add(line.machine);
  acc.totals.machines = acc.machines.size;
}

function finishTotals(totals: ReportTotals): ReportTotals {
  totals.actualKg = round4(totals.actualKg);
  totals.ot = round2(totals.ot);
  totals.rejection = round4(totals.rejection);
  totals.rejectionKg = round4(totals.rejectionKg);
  totals.rejectionPct = rejectionPercent(totals.rejectionKg, totals.actualKg);
  totals.achievement = totals.target > 0 ? round2((totals.actual / totals.target) * 100) : null;
  return totals;
}

function emptyTotals(departments: number): ReportTotals {
  return {
    departments, entries: 0, machines: 0, target: 0, actual: 0, actualKg: 0, ot: 0,
    rejection: 0, rejectionKg: 0, rejectionPct: 0, achievement: null,
  };
}

/* ------------------------------------------------------------------ *
 * Model builder
 * ------------------------------------------------------------------ */
export function buildDailyProductionReport(
  rows: readonly ReportRowSource[],
  opts: ReportOptions = {},
): DailyProductionReport {
  const operatorName = opts.operatorName ?? ((r: ReportRowSource) => r.operatorName || '—');
  const statusOf = opts.status ?? (() => '—');
  const shiftTiming = opts.shiftTiming ?? ((r: ReportRowSource) => rowShiftTiming(r.shift));

  /* --- map + group by department ---------------------------------- */
  const groups = new Map<string, ReportLine[]>();
  for (const row of rows) {
    const departmentName = blank(row.department?.name) || blank(row.department?.departmentCode) || 'Unassigned Department';
    const machine = blank(row.machine?.machineCode) || blank(row.machineNo) || '—';
    const uom = blank(row.uom?.code);
    const target = toNum(row.targetQuantity);
    const actual = toNum(row.actualQuantity);
    const actualKg = calcActualKg(uom, actual, row.item?.weightPerPiece, row.item?.weightPerMeter);
    const rejection = toNum(row.scrapQuantity);
    const rejectionKg = calcActualKg(uom, rejection, row.item?.weightPerPiece, row.item?.weightPerMeter);
    const itemCode = blank(row.item?.itemCode);
    const itemName = blank(row.item?.name);
    const actualKgRounded = actualKg == null ? null : round4(actualKg);
    const rejectionKgRounded = rejectionKg == null ? null : round4(rejectionKg);
    const achievement =
      row.achievementPercentage === null || row.achievementPercentage === undefined || row.achievementPercentage === ''
        ? target > 0 ? round2((actual / target) * 100) : null
        : round2(toNum(row.achievementPercentage));

    /* --- OT (H) + the live runtime summary -------------------- */
    const ot = entryOvertimeHours(row);
    const planned = toNum(row.shift?.plannedHours);
    const storedRunning = round2(Math.max(0, toNum(row.runningHours)));
    const downtime = round2(Math.max(0, toNum(row.downtimeHours)));
    // Same resolution the grid renders: running = Planned + OT − Downtime,
    // falling back to the stored column when the row carries no shift plan.
    const running = effectiveRunning(storedRunning, downtime, planned, ot);
    const downShown = effectiveDowntime(storedRunning, downtime, planned, ot);
    const available = planned > 0 ? round2(planned + Math.max(0, ot)) : 0;

    const line: ReportLine = {
      sr: 0,
      machine,
      operator: blank(operatorName(row)) || '—',
      /* two clean lines: product name, then the Item/WIP code (never
       * bundled as `Name (CODE)`). A code equal to the name is dropped. */
      item: itemName || itemCode || '—',
      itemCode: itemCode && itemCode !== (itemName || itemCode) ? itemCode : '',
      target,
      actual,
      perUnitWeight: perUnitWeightValue(uom, row.item?.weightPerPiece, row.item?.weightPerMeter) || uom || '—',
      actualKg: actualKgRounded,
      achievement,
      status: blank(statusOf(row)) || '—',
      ot,
      shift: blank(row.shift?.name) || blank(row.shift?.shiftCode) || '—',
      shiftTime: blank(shiftTiming(row)) || '-',
      shiftKind: classifyShift(row.shift),
      rejection,
      rejectionKg: rejectionKgRounded,
      rejectionPct: rejectionPercent(rejectionKgRounded, actualKgRounded),
      runtime: runtimeText(running, downShown, available, blank(row.downtimeReasonText)),
      uom,
      date: row.entryDate ? dayjs(row.entryDate).format('YYYY-MM-DD') : '',
    };

    const bucket = groups.get(departmentName);
    if (bucket) bucket.push(line);
    else groups.set(departmentName, [line]);
  }

  /* --- fixed department sequence, then shift (Day → Night), then
   *    machine number ascending inside each shift ------------------ */
  const departmentNames = [...groups.keys()].sort(
    (a, b) => departmentRank(a) - departmentRank(b) || compareMachineNo(a, b),
  );

  let sr = 0;
  const sections: ReportSection[] = departmentNames.map((name) => {
    const lines = [...(groups.get(name) ?? [])].sort(
      (a, b) =>
        (a.shiftKind === b.shiftKind ? 0 : a.shiftKind === 'DAY' ? -1 : 1) ||
        compareMachineNo(a.machine, b.machine) ||
        compareMachineNo(a.date, b.date) ||
        compareMachineNo(a.shift, b.shift),
    );

    const shiftGroups: ReportShiftGroup[] = [];
    for (const kind of ['DAY', 'NIGHT'] as ShiftKind[]) {
      const groupLines = lines.filter((l) => l.shiftKind === kind);
      if (groupLines.length === 0) continue;
      const acc = { totals: emptyTotals(1), machines: new Set<string>() };
      for (const line of groupLines) {
        line.sr = ++sr;
        addLine(acc, line);
      }
      shiftGroups.push({
        kind,
        label: kind === 'DAY' ? 'Day Shift' : 'Night Shift',
        lines: groupLines,
        totals: finishTotals(acc.totals),
      });
    }

    const acc = { totals: emptyTotals(1), machines: new Set<string>() };
    for (const line of lines) addLine(acc, line);
    return { name, lines, shiftGroups, totals: finishTotals(acc.totals) };
  });

  /* --- grand totals ----------------------------------------------- */
  const grandAcc = { totals: emptyTotals(sections.length), machines: new Set<string>() };
  for (const section of sections) {
    for (const line of section.lines) addLine(grandAcc, line);
  }
  const grand = finishTotals(grandAcc.totals);

  /* --- header ------------------------------------------------------ */
  const dates = [...new Set(sections.flatMap((s) => s.lines.map((l) => l.date)).filter(Boolean))].sort(compareMachineNo);
  const shifts = [...new Set(sections.flatMap((s) => s.lines.map((l) => l.shift)).filter((v) => v && v !== '—'))].sort(
    compareMachineNo,
  );
  const showDate = dates.length > 1;

  return {
    title: 'Daily Production Report',
    divisionName: resolveDivisionName(rows, opts.divisionName),
    divisionLabel: `Division: ${resolveDivisionName(rows, opts.divisionName)}`,
    dateLabel: resolveDateLabel(opts, dates),
    shiftLabel: opts.shiftName ? `Shift: ${opts.shiftName}` : shifts.length === 1 ? `Shift: ${shifts[0]}` : null,
    metaLine: `${grand.entries} entr${grand.entries === 1 ? 'y' : 'ies'} · ${sections.length} department${sections.length === 1 ? '' : 's'}`,
    generatedLabel: `Generated: ${opts.generatedAt ?? dayjs().format('DD MMM YYYY, HH:mm')}`,
    showDate,
    columns: buildColumns(showDate),
    sections,
    grand,
  };
}

function resolveDivisionName(rows: readonly ReportRowSource[], filterName?: string | null): string {
  const filtered = blank(filterName);
  if (filtered) return filtered;
  const names = new Set(rows.map((r) => blank(r.division?.name) || blank(r.division?.divisionCode)).filter(Boolean));
  if (names.size === 1) return [...names][0];
  return 'All Divisions';
}

function resolveDateLabel(opts: ReportOptions, dates: string[]): string {
  const from = blank(opts.dateFrom);
  const to = blank(opts.dateTo);
  if (from && to) return from === to ? `Date: ${from}` : `Date: ${from} to ${to}`;
  if (from) return `Date: ${from} onwards`;
  if (to) return `Date: up to ${to}`;
  if (dates.length === 1) return `Date: ${dates[0]}`;
  return 'Date: All dates';
}

/* ------------------------------------------------------------------ *
 * Summary labels + blocks (identical wording on print / PDF / Excel)
 * ------------------------------------------------------------------ */
export function shiftTotalLabel(kind: ShiftKind, department: string): string {
  return `${kind === 'DAY' ? 'DAY' : 'NIGHT'} SHIFT TOTAL — ${department}`;
}

export function departmentTotalLabel(department: string): string {
  return `DEPARTMENT GRAND TOTAL — ${department}`;
}

export function grandTotalLabel(sectionCount: number): string {
  return `GRAND TOTAL — ${sectionCount} department${sectionCount === 1 ? '' : 's'}`;
}

/**
 * Ordered blocks of a department: Day rows + `Day Shift Total`, Night rows +
 * `Night Shift Total`, then the `Department Grand Total`. A shift without
 * entries is omitted (no empty subtotal row).
 */
export function sectionBlocks(section: ReportSection): ReportBlock[] {
  return [
    ...section.shiftGroups.map((group) => ({
      kind: 'shift' as const,
      label: shiftTotalLabel(group.kind, section.name),
      lines: group.lines,
      totals: group.totals,
    })),
    {
      kind: 'department' as const,
      label: departmentTotalLabel(section.name),
      lines: [],
      totals: section.totals,
    },
  ];
}

/* ------------------------------------------------------------------ *
 * Cell renderers (Print + PDF share these; CSV has its own numeric ones)
 *
 * A column is either single-line (`reportCellText`) or FUSED/stacked, in
 * which case `reportCellText` returns line 1 and `reportCellSubText` returns
 * line 2 (see STACKED_CELLS). All three surfaces read the same two functions,
 * so the printed page, the PDF and the spreadsheet cannot drift apart.
 * ------------------------------------------------------------------ */
export function reportCellText(line: ReportLine, key: ReportColumnKey, mode: ReportGlyphMode = 'display'): string {
  switch (key) {
    case 'sr': return String(line.sr);
    case 'machine': return line.machine;
    case 'operator': return line.operator;
    case 'item': return line.item;
    case 'target': return formatNumber(line.target, 2);
    case 'actual': return formatNumber(line.actual, 2);
    /* Line 1 of WEIGHT (KG) — the small, muted per-unit figure. */
    case 'weight': return line.perUnitWeight;
    case 'ot': return line.ot > 0 ? `${formatNumber(line.ot, 2)}h` : '—';
    case 'achievement': {
      if (line.achievement == null) return '—';
      const base = `${line.achievement.toFixed(1)}%`;
      if (mode === 'pdf') return base;
      const tone = achievementTone(line.achievement);
      return tone ? `${base} ${TONE_GLYPH[tone]}` : base;
    }
    /* NEVER the static status word — always the live runtime summary. */
    case 'status': return line.runtime;
    case 'shift': return line.shift;
    /* Line 1 of REJECTION / SCRAP — the flat Rejection KG count. */
    case 'rejectionScrap': return formatNumber(line.rejectionKg ?? 0, 2);
    case 'date': return line.date || '—';
    default: return '';
  }
}

/** Line 2 of the fused cells: the Item/WIP code, the shift timing, the bold
 *  Actual KG under the per-unit weight, and the Rejection % under the
 *  Rejection KG. Empty for every single-line column. */
export function reportCellSubText(line: ReportLine, key: ReportColumnKey): string {
  if (key === 'item') return line.itemCode;
  if (key === 'shift') return line.shiftTime;
  if (key === 'weight') return line.actualKg == null ? '—' : formatNumber(line.actualKg, 2);
  if (key === 'rejectionScrap') return rejectionPctLabel(line.rejectionPct);
  return '';
}

/** Fused-cell print/PDF-HTML: line 1 then line 2, each `display:block` so
 *  they are real lines. Class pairs come from the single STACKED_CELLS
 *  registry, which is why every fused column keeps the same rhythm. */
export function reportTwoLineHtml(line: ReportLine, key: StackedCellKey): string {
  const classes = STACKED_CELLS[key];
  const main = reportCellText(line, key);
  const subText = reportCellSubText(line, key);
  const second = subText ? `<span class="${classes.sub}">${escapeHtml(subText)}</span>` : '';
  return `<span class="${classes.main}">${escapeHtml(main)}</span>${second}`;
}

/** Display value for line 1 of a shift / department / grand total cell. */
export function reportTotalText(
  totals: ReportTotals,
  key: ReportColumnKey,
  mode: ReportGlyphMode = 'display',
): string {
  switch (key) {
    case 'target': return formatNumber(totals.target, 2);
    case 'actual': return formatNumber(totals.actual, 2);
    case 'ot': return totals.ot > 0 ? `${formatNumber(totals.ot, 2)}h` : '—';
    case 'achievement': {
      if (totals.achievement == null) return '—';
      const base = `${totals.achievement.toFixed(1)}%`;
      if (mode === 'pdf') return base;
      const tone = achievementTone(totals.achievement);
      return tone ? `${base} ${TONE_GLYPH[tone]}` : base;
    }
    /* Line 1 of the fused totals — a per-unit weight is never summable, so
     * WEIGHT (KG) shows `—` above Σ Actual KG, while REJECTION / SCRAP leads
     * with Σ Rejection KG above the pooled Rejection %. */
    case 'weight': return '—';
    case 'rejectionScrap': return formatNumber(totals.rejectionKg, 2);
    case 'item': return '';
    case 'status': return '';
    case 'shift': return '';
    case 'date': return '';
    case 'sr': return '';
    case 'machine': return '';
    case 'operator': return '';
    default: return '';
  }
}

/** Line 2 of the fused total cells (Σ Actual KG / pooled Rejection %). */
export function reportTotalSubText(totals: ReportTotals, key: ReportColumnKey): string {
  if (key === 'weight') return formatNumber(totals.actualKg, 2);
  if (key === 'rejectionScrap') return rejectionPctLabel(totals.rejectionPct);
  return '';
}

/* ------------------------------------------------------------------ *
 * PDF (jsPDF + autoTable) row builders — shared with EntryList.exportPdf
 * and exercised by the node smoke test, so the Print/PDF/Excel layout
 * cannot drift apart.
 * ------------------------------------------------------------------ */

export type PdfRowKind = 'shift' | 'department' | 'grand';

/** PDF colours for the two-line cells — mirrors the print CSS. */
export const PDF_MAIN_TEXT: [number, number, number] = [15, 23, 42];     /* #0f172a */
export const PDF_SUB_TEXT: [number, number, number] = [148, 163, 184];   /* #94a3b8 */
export const PDF_MUTED_TEXT: [number, number, number] = [100, 116, 139]; /* #64748b */

/** Per-line colour + weight for every fused column — the PDF twin of the
 *  print CSS classes in STACKED_CELLS. WEIGHT (KG) is the one column that
 *  leads muted/light (the small per-unit figure) and trails bold + dark
 *  (Actual KG, the value people actually read); the other three lead dark
 *  and trail light gray. */
const STACKED_PDF: Record<StackedCellKey, {
  mainColor: [number, number, number];
  mainBold: boolean;
  subColor: [number, number, number];
  subBold: boolean;
}> = {
  item: { mainColor: PDF_MAIN_TEXT, mainBold: true, subColor: PDF_SUB_TEXT, subBold: false },
  shift: { mainColor: PDF_MAIN_TEXT, mainBold: false, subColor: PDF_SUB_TEXT, subBold: false },
  weight: { mainColor: PDF_MUTED_TEXT, mainBold: false, subColor: PDF_MAIN_TEXT, subBold: true },
  rejectionScrap: { mainColor: PDF_MAIN_TEXT, mainBold: false, subColor: PDF_SUB_TEXT, subBold: false },
};

/** AutoTable object for a fused cell: line 1 is drawn by autoTable itself
 *  (styled by `styles`) and line 2 is left for EntryList's `didDrawCell`
 *  (`drawSubLine`) to paint, which is the only way jsPDF can give one cell
 *  two different colours and weights. `subBold` tells that handler to switch
 *  to the bold font for line 2 — WEIGHT (KG) needs it for Actual KG. */
function pdfStackedCell(
  key: StackedCellKey,
  main: string,
  sub: string,
  align: ReportColumn['align'],
  baseStyles: Record<string, unknown> = {},
): any {
  const style = STACKED_PDF[key];
  return {
    content: sub ? `${main}\n\u00A0` : main,
    sub,
    subColor: style.subColor,
    subBold: style.subBold,
    styles: {
      ...baseStyles,
      halign: align,
      textColor: style.mainColor,
      ...(style.mainBold ? { fontStyle: 'bold' as const } : {}),
    },
  };
}

/** One PDF data row: plain strings, except the achievement cell which carries
 *  the ▲/▼ colour (the arrow itself is drawn in `didDrawCell` as a vector
 *  triangle — jsPDF cannot embed those glyphs in its WinAnsi fonts) and the
 *  FOUR fused cells (Item / Shift / WEIGHT / REJECTION-SCRAP) which are two
 *  lines each: autoTable draws line 1 and leaves a non-breaking space on
 *  line 2, keeping the row tall enough for `sub` to be painted over it. */
export function pdfLineRow(columns: ReportColumn[], line: ReportLine): any[] {
  const tone = achievementTone(line.achievement);
  return columns.map((c) => {
    if (isStackedColumn(c.key)) {
      return pdfStackedCell(c.key, reportCellText(line, c.key, 'pdf'), reportCellSubText(line, c.key), c.align);
    }
    const text = reportCellText(line, c.key, 'pdf');
    if (c.key !== 'achievement') return text;
    const styles: any = { halign: c.align };
    if (tone) {
      styles.fontStyle = 'bold';
      styles.textColor = TONE_COLOR[tone];
    }
    return { content: text, styles };
  });
}

/** One PDF summary row: label merged over the leading columns (Sr. # / Shift
 *  / Machine / OT / Operator), then Σ Target, Σ Actual, weighted Achievement
 *  %, WEIGHT (KG) (— / Σ Actual KG), Σ OT, and REJECTION / SCRAP (Σ KG /
 *  pooled %). Shift sub-totals use a lighter fill than the department /
 *  grand totals, and the fused columns keep BOTH of their lines here too. */
export function pdfSummaryRow(
  model: DailyProductionReport,
  totals: ReportTotals,
  label: string,
  kind: PdfRowKind,
): any[] {
  const span = reportLabelSpan(model.columns);
  const tone = achievementTone(totals.achievement);
  const totalStyle = {
    fontStyle: 'bold' as const,
    fillColor: (kind === 'shift' ? [232, 237, 243] : [226, 232, 240]) as number[],
    textColor: [15, 23, 42] as number[],
  };
  return [
    { content: label, colSpan: span, styles: { ...totalStyle, halign: 'left' as const } },
    ...model.columns.slice(span).map((c) => {
      if (isStackedColumn(c.key)) {
        return pdfStackedCell(c.key, reportTotalText(totals, c.key, 'pdf'), reportTotalSubText(totals, c.key), c.align, totalStyle);
      }
      const styles: any = { ...totalStyle, halign: c.align };
      if (c.key === 'achievement' && tone) styles.textColor = TONE_COLOR[tone];
      return { content: reportTotalText(totals, c.key, 'pdf'), styles };
    }),
  ];
}

/* ------------------------------------------------------------------ *
 * Print / PDF HTML
 * ------------------------------------------------------------------ */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const PRINT_CSS = `
  @page { size: A4 landscape; margin: 8mm; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
         font-size: 11px; color: #0f172a; margin: 0; padding: 12px; background: #fff; }
  .rp-header { border-bottom: 2px solid #0f172a; padding-bottom: 6px; margin-bottom: 10px;
               break-inside: avoid; page-break-inside: avoid; }
  .rp-title { font-size: 17px; font-weight: 700; letter-spacing: .02em; margin: 0; }
  .rp-division { font-size: 13px; font-weight: 700; color: #1d4ed8; margin: 3px 0 0; }
  .rp-meta { font-size: 11px; color: #475569; margin-top: 4px; display: flex; gap: 16px; flex-wrap: wrap; }
  .rp-meta span { white-space: nowrap; }
  .rp-dept { break-inside: avoid; page-break-inside: avoid; margin-bottom: 12px; }
  .rp-dept-head { display: flex; justify-content: space-between; gap: 12px;
                  background: #0f172a; color: #fff; font-size: 11px; font-weight: 700;
                  letter-spacing: .04em; padding: 4px 8px;
                  break-after: avoid; page-break-after: avoid; }
  table.rp-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }
  .rp-table th, .rp-table td { border: 1px solid #94a3b8; padding: 3px 4px; line-height: 1.2;
                               vertical-align: middle; overflow-wrap: anywhere; word-break: break-word;
                               white-space: normal; }
  .rp-table thead { display: table-header-group; }
  .rp-table tfoot { display: table-footer-group; }
  .rp-table tr { break-inside: avoid; page-break-inside: avoid; }
  /* Header: 10px + normal word breaking - a narrow label wraps BETWEEN words
     ("Per Unit" / "Weight") and never through the middle of one. */
  .rp-table th { background: #e2e8f0; color: #1e293b; font-weight: 700; font-size: 10px;
                 word-break: normal; overflow-wrap: break-word; line-height: 1.2; }
  .rp-table tbody tr:nth-child(even) td { background: #f8fafc; }
  .rp-subtotal td { background: #e8edf3 !important; font-weight: 700; color: #1e293b; }
  .rp-total td { background: #e2e8f0 !important; font-weight: 700; }
  .a-left { text-align: left; } .a-center { text-align: center; } .a-right { text-align: right; }
  .muted { color: #64748b; } .strong { font-weight: 700; }
  /* ---- FUSED (stacked) CELLS: line 1 on top, line 2 underneath -------
     Item / Shift lead with the informative line and trail with the muted
     one. WEIGHT (KG) is inverted on purpose — the small per-unit figure sits
     on top and the Actual KG is the bold, prominent line underneath, which
     is the number the reader is actually looking for. */
  .rp-item-name { display: block; font-weight: 700; color: #0f172a; }
  .rp-item-code { display: block; font-weight: 400; color: #94a3b8; }
  .rp-shift-name { display: block; font-weight: 400; color: #0f172a; }
  .rp-shift-time { display: block; font-weight: 400; color: #94a3b8; }
  .rp-wt-top { display: block; font-weight: 400; color: #64748b; }
  .rp-wt-bottom { display: block; font-weight: 700; color: #0f172a; }
  .rp-rj-top { display: block; font-weight: 400; color: #0f172a; }
  .rp-rj-bottom { display: block; font-weight: 400; color: #64748b; }
  /* ---- 2-LINE MAXIMUM -------------------------------------------------
     Each of those eight lines is ONE physical line: nowrap + ellipsis, so
     "General Shift" / "06:00 - 14:00", the product name and the fused
     WEIGHT / REJECTION values can never push a row onto a 3rd or 4th line.
     Shift sits at 10px / 9px to fit its 9%; the two fused columns sit at
     11px / 10px so the bold line always outweighs the muted one. */
  .rp-item-name, .rp-item-code, .rp-shift-name, .rp-shift-time,
  .rp-wt-top, .rp-wt-bottom, .rp-rj-top, .rp-rj-bottom {
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .rp-item-name { font-size: 11px; line-height: 1.2; }
  .rp-item-code { font-size: 10px; line-height: 1.2; }
  .rp-shift-name { font-size: 10px; line-height: 1.2; }
  .rp-shift-time { font-size: 9px; line-height: 1.2; }
  .rp-wt-top { font-size: 10px; line-height: 1.2; }
  .rp-wt-bottom { font-size: 11px; line-height: 1.2; }
  .rp-rj-top { font-size: 11px; line-height: 1.2; }
  .rp-rj-bottom { font-size: 10px; line-height: 1.2; }
  /* Long free text (operator, breakdown reason) may use AT MOST 2 lines. */
  .rp-clamp2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tone-up { color: #15803d !important; font-weight: 700; }
  .tone-down { color: #b91c1c !important; font-weight: 700; }
  /* ---- EXEC KPI CARDS — the standalone LAST page of the report ---------
     The page break lives on .rp-exec, so the KPI cards always start a fresh
     sheet right after the final department's grand total row. The grid is
     responsive: minmax(300px, 1fr) gives 3 cards per A4 landscape row and 2
     on a narrower sheet, never more. (Keep this comment free of the printed
     heading text — the styles ship with EVERY report, including empty ones.) */
  .rp-exec { break-before: page; page-break-before: always; padding-top: 2px; }
  .rp-exec-title { text-align: center; font-weight: 700; font-size: 18px;
                   letter-spacing: .06em; color: #0f172a; margin: 0 0 14px;
                   break-after: avoid; page-break-after: avoid; }
  .rp-kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                 gap: 12px; }
  .rp-kpi-card { border: 1px solid #cbd5e1; background: #f8fafc; padding: 10px 12px;
                 break-inside: avoid; page-break-inside: avoid; }
  .rp-kpi-name { font-weight: 700; font-size: 12px; letter-spacing: .05em; color: #0f172a;
                 padding-bottom: 5px; margin-bottom: 6px; border-bottom: 1px solid #cbd5e1; }
  .rp-kpi-row { display: flex; justify-content: space-between; gap: 10px;
                font-size: 11.5px; line-height: 1.55; font-variant-numeric: tabular-nums; }
  .rp-kpi-row span { color: #64748b; }
  .rp-kpi-row b { font-weight: 700; color: #0f172a; }
  /* Row 4 — the highlighted achievement line (green ▲ / red ▼). */
  .rp-kpi-ach { margin-top: 6px; padding-top: 5px; border-top: 1px dashed #cbd5e1;
                font-size: 12.5px; }
  @media print {
    body { margin: 0; padding: 0; }
    .rp-dept { break-inside: avoid; page-break-inside: avoid; }
    .rp-table thead { display: table-header-group; }
  }
`;

function tableHtml(model: DailyProductionReport, withHead: boolean, bodyHtml: string): string {
  const colgroup = `<colgroup>${model.columns.map((c) => `<col style="width:${c.width}%">`).join('')}</colgroup>`;
  const head = withHead
    ? `<thead><tr>${model.columns
        .map(
          (c) =>
            `<th class="a-${c.align}" style="width:${c.width}%"><span class="rp-clamp2">${escapeHtml(c.label)}</span></th>`,
        )
        .join('')}</tr></thead>`
    : '';
  return `<table class="rp-table">${colgroup}${head}<tbody>${bodyHtml}</tbody></table>`;
}

function lineRowHtml(model: DailyProductionReport, line: ReportLine): string {
  const tone = achievementTone(line.achievement);
  return `<tr>${model.columns
    .map((c) => {
      const cls = [
        `a-${c.align}`,
        c.key === 'actual' || c.key === 'achievement' ? 'strong' : '',
        c.key === 'achievement' && tone ? `tone-${tone}` : '',
      ].filter(Boolean).join(' ');
      let text: string;
      if (isStackedColumn(c.key)) {
        // Item / Shift / WEIGHT (KG) / REJECTION (SCRAP) — two real lines,
        // each nowrap + ellipsized by the CSS above.
        text = reportTwoLineHtml(line, c.key);
      } else {
        const value = escapeHtml(reportCellText(line, c.key));
        // Long free text (operator name, runtime/breakdown reason) is
        // hard-capped at 2 lines, so no data row can ever outgrow the rhythm
        // of the fused cells. Numeric cells stay plain — they never need a
        // 3rd line.
        text = c.key === 'operator' || c.key === 'status' ? `<span class="rp-clamp2">${value}</span>` : value;
      }
      return `<td class="${cls}">${text}</td>`;
    })
    .join('')}</tr>`;
}

function totalRowHtml(
  model: DailyProductionReport,
  totals: ReportTotals,
  label: string,
  kind: 'shift' | 'department' | 'grand',
): string {
  const span = reportLabelSpan(model.columns);
  const tone = achievementTone(totals.achievement);
  let cells = `<td class="a-left" colspan="${span}">${escapeHtml(label)}</td>`;
  cells += model.columns
    .slice(span)
    .map((c) => {
      const toneCls = c.key === 'achievement' && tone ? ` tone-${tone}` : '';
      // The fused columns keep BOTH lines in their total row too, so Σ Actual
      // KG still sits under the `—` of WEIGHT (KG) and the pooled Rejection %
      // under Σ Rejection KG. Item / Shift have no total value at all, so
      // they stay a plain empty cell rather than emitting stray spans.
      if (isStackedColumn(c.key)) {
        const classes = STACKED_CELLS[c.key];
        const main = reportTotalText(totals, c.key);
        const sub = reportTotalSubText(totals, c.key);
        if (!main && !sub) return `<td class="a-${c.align}${toneCls}"></td>`;
        const second = sub ? `<span class="${classes.sub}">${escapeHtml(sub)}</span>` : '';
        return `<td class="a-${c.align}${toneCls}"><span class="${classes.main}">${escapeHtml(
          main,
        )}</span>${second}</td>`;
      }
      return `<td class="a-${c.align}${toneCls}">${escapeHtml(reportTotalText(totals, c.key))}</td>`;
    })
    .join('');
  const rowClass = kind === 'shift' ? 'rp-subtotal' : 'rp-total';
  return `<tr class="${rowClass}">${cells}</tr>`;
}

/* ------------------------------------------------------------------ *
 * EXECUTIVE DEPARTMENT SUMMARY — the standalone LAST page of the report.
 * The data below is shared by the print cards (executiveSummaryHtml) and
 * the jsPDF card grid in EntryList.exportPdf, so both surfaces always show
 * the very same totals as the table above them.
 * ------------------------------------------------------------------ */

/** Heading of that last page — an `<h2>` in print, a centred PDF title. */
export const EXECUTIVE_TITLE = 'EXECUTIVE DEPARTMENT SUMMARY';

/** One boxed KPI card: a department's grand totals, formatted exactly like
 *  the report's own total rows, plus the Phase 7 achievement tone. */
export interface ExecutiveKpi {
  /** Uppercased department name — the card's header row. */
  name: string;
  /** `4,000` — the value the Target total cell prints. */
  target: string;
  /** `4,400` — the value the Actual total cell prints. */
  actual: string;
  /** `110.0% ▲` — the print form (glyph included). */
  achievement: string;
  /** `110.0%` — the PDF form: jsPDF embeds WinAnsi fonts, so ▲ / ▼ cannot be
   *  embedded and are drawn as vector triangles beside this value instead. */
  achievementText: string;
  /** Green ▲ / red ▼ by the >= 70% rule (null when there is no target). */
  tone: AchievementTone | null;
  /** The weighted achievement itself, for callers that need the number. */
  achievementValue: number | null;
}

/** One KPI card per department, in report order (one per section). */
export function executiveKpis(model: DailyProductionReport): ExecutiveKpi[] {
  return model.sections.map((section) => {
    const totals = section.totals;
    const achievementValue = totals.achievement;
    return {
      name: section.name.toUpperCase(),
      target: reportTotalText(totals, 'target'),
      actual: reportTotalText(totals, 'actual'),
      achievement: reportTotalText(totals, 'achievement'),
      achievementText: reportTotalText(totals, 'achievement', 'pdf'),
      tone: achievementTone(achievementValue),
      achievementValue,
    } as ExecutiveKpi;
  });
}

/** The last-page block: centred heading over a responsive grid of cards.
 *  Empty when the report has no department, so nothing is ever printed for
 *  an empty export. */
export function executiveSummaryHtml(model: DailyProductionReport): string {
  const cards = executiveKpis(model);
  if (cards.length === 0) return '';
  const grid = cards
    .map((card) => {
      const toneClass = card.tone ? ` class="tone-${card.tone}"` : '';
      return `      <div class="rp-kpi-card">
        <div class="rp-kpi-name">${escapeHtml(card.name)}</div>
        <div class="rp-kpi-row"><span>Target:</span><b>${escapeHtml(card.target)}</b></div>
        <div class="rp-kpi-row"><span>Actual:</span><b>${escapeHtml(card.actual)}</b></div>
        <div class="rp-kpi-row rp-kpi-ach"><span>Achievement %:</span><b${toneClass}>${escapeHtml(card.achievement)}</b></div>
      </div>`;
    })
    .join('\n');
  return `  <section class="rp-exec">
    <h2 class="rp-exec-title">${EXECUTIVE_TITLE}</h2>
    <div class="rp-kpi-grid">
${grid}
    </div>
  </section>`;
}

/** Full print document — opened in a new window and printed on load. */
export function buildPrintHtml(model: DailyProductionReport): string {
  const sections = model.sections
    .map((sec) => {
      const body = sectionBlocks(sec)
        .map((block) =>
          block.lines.map((line) => lineRowHtml(model, line)).join('') +
          totalRowHtml(model, block.totals, block.label, block.kind),
        )
        .join('');
      return `  <section class="rp-dept">
    <div class="rp-dept-head">
      <span>DEPARTMENT — ${escapeHtml(sec.name)}</span>
      <span>${sec.totals.machines} machine${sec.totals.machines === 1 ? '' : 's'} · ${sec.totals.entries} entr${sec.totals.entries === 1 ? 'y' : 'ies'}</span>
    </div>
    ${tableHtml(model, true, body)}
  </section>`;
    })
    .join('\n');

  const grand = model.sections.length
    ? `  <section class="rp-dept">
    ${tableHtml(model, false, totalRowHtml(model, model.grand, grandTotalLabel(model.sections.length), 'grand'))}
  </section>`
    : '';

  // The KPI summary ALWAYS comes last — after the grand total row — and its
  // own page break (.rp-exec) puts it on a fresh, standalone final page.
  const execBody = executiveSummaryHtml(model);
  const exec = execBody ? `\n${execBody}` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(model.title)} — ${escapeHtml(model.divisionName)}</title>
<style>${PRINT_CSS}</style>
</head>
<body>
  <header class="rp-header">
    <div class="rp-title">${escapeHtml(model.title)}</div>
    <div class="rp-division">${escapeHtml(model.divisionLabel)}</div>
    <div class="rp-meta">
      <span>${escapeHtml(model.dateLabel)}</span>
      ${model.shiftLabel ? `<span>${escapeHtml(model.shiftLabel)}</span>` : ''}
      <span>${escapeHtml(model.metaLine)}</span>
      <span>${escapeHtml(model.generatedLabel)}</span>
    </div>
  </header>
${sections}
${grand}${exec}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Excel (UTF-8 CSV) — mirrors the print layout column-for-column
 * ------------------------------------------------------------------ */
const csvQuote = (value: unknown): string => {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
/** Numeric cell left UNQUOTED so Excel keeps it a number (SUM/AVERAGE work). */
const csvNum = (value: number | null | undefined): string =>
  value == null ? '' : String(round4(value));

/** Numeric half of a FUSED cell. It rides inside a quoted (multi-line) cell,
 *  so it cannot stay a bare Excel number — the raw `round4` form is used
 *  instead of `formatNumber` to keep thousands separators out of the value
 *  (Excel can still re-parse it as a number). */
const csvStackNum = (value: number | null | undefined): string =>
  value == null ? '—' : String(round4(value));

/** Two stacked values in ONE CSV cell, mirroring the printed cell exactly. */
const csvStacked = (top: string, bottom: string): string => csvQuote(`${top}\n${bottom}`);

function csvLineCell(line: ReportLine, key: ReportColumnKey): string {
  switch (key) {
    case 'sr': return String(line.sr);
    case 'machine': return csvQuote(line.machine);
    case 'operator': return csvQuote(line.operator);
    case 'item': return csvQuote(line.itemCode ? `${line.item}\n${line.itemCode}` : line.item);
    case 'target': return csvNum(line.target);
    case 'actual': return csvNum(line.actual);
    case 'ot': return csvNum(line.ot);
    /* WEIGHT (KG) — per-unit weight on line 1, Actual KG on line 2. */
    case 'weight': return csvStacked(line.perUnitWeight, csvStackNum(line.actualKg));
    case 'achievement': {
      if (line.achievement == null) return '';
      const tone = achievementTone(line.achievement);
      // Arrow synced with print/PDF — Excel shows it as a text cell.
      return `${round2(line.achievement)}${tone ? ` ${TONE_GLYPH[tone]}` : ''}`;
    }
    /* Live runtime summary — never the static status word. */
    case 'status': return csvQuote(line.runtime);
    case 'shift': return csvQuote(`${line.shift}\n${line.shiftTime}`);
    /* REJECTION / SCRAP — flat Rejection KG on line 1, Rejection % on line 2. */
    case 'rejectionScrap': return csvStacked(csvStackNum(line.rejectionKg), rejectionPctLabel(line.rejectionPct));
    case 'date': return csvQuote(line.date);
    default: return '';
  }
}

function csvTotalCell(totals: ReportTotals, key: ReportColumnKey): string {
  switch (key) {
    case 'target': return csvNum(totals.target);
    case 'actual': return csvNum(totals.actual);
    case 'ot': return csvNum(totals.ot);
    case 'achievement': {
      if (totals.achievement == null) return '';
      const tone = achievementTone(totals.achievement);
      return `${round2(totals.achievement)}${tone ? ` ${TONE_GLYPH[tone]}` : ''}`;
    }
    /* A per-unit weight is never summable → `—` above Σ Actual KG. */
    case 'weight': return csvStacked('—', csvStackNum(totals.actualKg));
    case 'rejectionScrap': return csvStacked(csvStackNum(totals.rejectionKg), rejectionPctLabel(totals.rejectionPct));
    default: return '';
  }
}

/** Structured CSV: report header block, department sections, shift grouping
 *  with Day/Night sub-totals, machine order, department grand total and a
 *  report grand total. Opens straight in Excel. */
export function buildDailyProductionCsv(model: DailyProductionReport): string {
  const out: string[] = [];
  const span = reportLabelSpan(model.columns);

  out.push(model.title);
  out.push(model.divisionLabel);
  out.push(model.dateLabel);
  if (model.shiftLabel) out.push(model.shiftLabel);
  out.push(`${model.metaLine} · ${model.generatedLabel}`);
  out.push('');
  out.push([...model.columns.map((c) => csvQuote(c.label)), 'UOM'].join(','));
  out.push('');

  const totalRow = (label: string, totals: ReportTotals): string =>
    [
      ...model.columns.map((c, i) =>
        i < span ? (i === 0 ? csvQuote(label) : '') : csvTotalCell(totals, c.key),
      ),
      '',
    ].join(',');

  for (const section of model.sections) {
    out.push(csvQuote(`DEPARTMENT — ${section.name}`));
    for (const block of sectionBlocks(section)) {
      for (const line of block.lines) {
        out.push([...model.columns.map((c) => csvLineCell(line, c.key)), csvQuote(line.uom)].join(','));
      }
      out.push(totalRow(block.label, block.totals));
    }
    out.push('');
  }

  out.push(totalRow(grandTotalLabel(model.sections.length), model.grand));
  out.push('');

  // BOM so Excel reads UTF-8 (and the em-dash) correctly.
  return `\uFEFF${out.join('\r\n')}`;
}
