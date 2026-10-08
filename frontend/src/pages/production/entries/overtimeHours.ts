import { toNum } from '../../../utils/numberFormat';

/**
 * PHASE 3/4 — CANONICAL OVERTIME (OT) DEFINITION
 * ---------------------------------------------------------------------------
 * ONE definition, used by EVERY overtime surface:
 *   1. Overtime KPI card        (EntryList → serverSummary.overtime / kpiData)
 *   2. Table "OT (h)" column    (EntryList render + sorter)
 *   3. Entry Detail             (EntryDetail "Overtime Hours")
 *   4. Edit Entry form          (EditProductionEntry seed)
 *   5. Backend KPI aggregation  (production-entry.service.ts `totalOvertime` SQL)
 *
 *   overtime = production_entries.overtime_hours        (persisted, canonical)
 *            ; if that is 0/NULL → legacy remarks `OT: X h` (read fallback)
 *            ; otherwise 0
 *
 * PHASE 4 — HOW THAT COLUMN GETS FILLED (WRITE RULE — backend authoritative)
 * ---------------------------------------------------------------------------
 *   `ProductionEntryService.deriveOvertime(running, downtime, plannedHours)`
 *   (production-entry.service.ts, ~line 1919) is called from BOTH save paths —
 *   create (~line 1171) and update (~line 1331) — with this priority:
 *
 *     1. explicit `overtimeHours` from the form            → used as-is
 *     2. else remarks `OT: X h`                            → parsed value
 *     3. else the DUTY rule: ot = (running + downtime) - plannedHours
 *
 *   DUTY = total shift hours (running + downtime). Breakdown time is still
 *   duty time, so it must NEVER reduce overtime:
 *       12h duty (11h running + 1h breakdown) on an 8h shift → 4h OT
 *       (the old `running - planned` rule returned 11 - 8 = 3h and ate the 1h).
 *
 *   `plannedHours` is the shift master's `shifts.planned_hours` — 8h for
 *   GENERAL / SHIFT-A / SHIFT-B / SHIFT-C and 12h for GENERAL (Day),
 *   GENERAL (Night) / SHIFT-E2E12. It is read dynamically per entry: there is
 *   NO hardcoded 8. A shift without a plan has no standard → the rule derives 0.
 *
 *   Because `totalPlanned = plannedHours + ot`, a correctly derived OT also:
 *     - keeps the `effectiveRunning` clamp from rewriting the operator's hours
 *       (the old 3h OT made totalPlanned 11 and rewrote Run 11 → 10), so the
 *       saved row stays exactly Run 11 / Down 1 / OT 4; and
 *     - keeps the efficiency denominator (planned + OT) consistent with the
 *       same OT on create AND update.
 *
 *   The READ rule below is deliberately unchanged by Phase 4: it reports what
 *   was persisted and never re-derives it.
 *
 * WHY THIS AND NOT `runningHours - 8`:
 *   - `overtime_hours` is the persisted column (entity + KPI SUM source). Every
 *     write path already fills it: EntryForm / EditProductionEntry / HandPacking
 *     send `overtimeHours`, and the backend back-fills it on save from
 *     (a) remarks `OT: X h`, else (b) PHASE 4's duty rule
 *     `(runningHours + downtimeHours) - shift.plannedHours` — TOTAL duty
 *     minus the shift plan, because a breakdown hour is still duty time and
 *     must never eat overtime (12h duty on an 8h shift → 4h, not 11 - 8 = 3h).
 *   - `8` is NOT the universal shift length. The shifts master holds planned
 *     hours of 8 (GENERAL, SHIFT-A/B/C) AND 12 (GENERAL (Day), GENERAL (Night),
 *     E2E12). Re-deriving OT as `running - 8` on read invents overtime that was
 *     never worked (e.g. running 11h/12h planned → phantom 3h), which is exactly
 *     the KPI-vs-table disagreement Phase 3 removed.
 *   - A read rule must never re-derive what the write rule already persisted,
 *     otherwise the KPI (SUM of the column) and the table (per-row display)
 *     can never be proven equal.
 *
 * The remarks fallback mirrors the backend save rule (same regex, same
 * priority) so a legacy row whose OT exists only in remarks is reported in the
 * KPI *and* the table — never in one and not the other. The backend KPI
 * expression `OVERTIME_SUM_SQL` implements this identical rule in SQL.
 */

/** Matches `OT: 2h` / `OT: 2.5 h` (case-insensitive) in a remarks string. */
export const OT_FROM_REMARKS_REGEX = /OT:\s*(\d+(?:\.\d+)?)\s*h/i;

/** Minimal shape needed to read a production entry's overtime. */
export interface OvertimeSource {
  overtimeHours?: number | string | null;
  remarks?: string | null;
}

/**
 * Canonical overtime for a single production entry (hours).
 * Never negative, never derived from running/planned hours.
 */
export function entryOvertimeHours(row?: OvertimeSource | null): number {
  const persisted = toNum(row?.overtimeHours);
  if (persisted > 0) return persisted;

  const remarks = row?.remarks;
  const match = typeof remarks === 'string' ? remarks.match(OT_FROM_REMARKS_REGEX) : null;
  const legacy = match ? toNum(match[1]) : 0;
  return legacy > 0 ? legacy : 0;
}

/** Canonical overtime summed over a row set (KPI fallback + tests). */
export function sumOvertime(rows?: readonly OvertimeSource[] | null): number {
  return (rows ?? []).reduce((total, row) => total + entryOvertimeHours(row), 0);
}
