/**
 * Shared Production Entry downtime calculations.
 *
 * AUTO mode: the operator enters RUNNING hours; downtime is derived from the
 * shift plan (downtime = planned − running).
 *
 * MANUAL mode: the operator enters DOWNTIME hours; running is derived
 * (running = planned − downtime).
 *
 * Both modes preserve the invariant: running + downtime = planned (whenever a
 * shift plan is configured). All helpers round to 2 decimals and clamp to the
 * valid [0, planned] range so the form can never persist an impossible state.
 */

export type DowntimeMode = 'auto' | 'manual';

export const round2 = (v: number): number => Math.round(v * 100) / 100;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/**
 * AUTO: derive downtime from a running-hours input.
 * Returns the (running, downtime) pair. When no shift plan is configured the
 * downtime input is left untouched (legacy free-form behaviour).
 */
export function deriveFromRunning(
  runningInput: number | null | undefined,
  plannedHours: number,
  currentDowntime: number,
): { runningHours: number; downtimeHours: number } {
  if (runningInput === null || runningInput === undefined || Number.isNaN(runningInput)) {
    return { runningHours: currentDowntime === 0 ? 0 : Number.NaN, downtimeHours: currentDowntime };
  }
  const r = round2(clamp(runningInput, 0, plannedHours > 0 ? plannedHours : 24));
  return {
    runningHours: r,
    downtimeHours: plannedHours > 0 ? round2(Math.max(0, plannedHours - r)) : currentDowntime,
  };
}

/**
 * MANUAL: derive running hours from a downtime-hours input.
 * Returns the (running, downtime) pair. When no shift plan is configured only
 * the downtime field is written (legacy free-form behaviour).
 */
export function deriveFromDowntime(
  downtimeInput: number | null | undefined,
  plannedHours: number,
): { runningHours: number; downtimeHours: number } {
  if (downtimeInput === null || downtimeInput === undefined || Number.isNaN(downtimeInput)) {
    return { runningHours: Number.NaN, downtimeHours: 0 };
  }
  const d = round2(clamp(downtimeInput, 0, plannedHours > 0 ? plannedHours : 24));
  return {
    downtimeHours: d,
    runningHours: plannedHours > 0 ? round2(Math.max(0, plannedHours - d)) : Number.NaN,
  };
}

/** Rebalance the pair around the plan when switching AUTO ↔ MANUAL. */
export function rebalancePair(
  runningHours: number,
  downtimeHours: number,
  plannedHours: number,
  mode: DowntimeMode,
): { runningHours: number; downtimeHours: number } {
  if (!(plannedHours > 0)) return { runningHours, downtimeHours };
  if (mode === 'manual') {
    const d = round2(clamp(downtimeHours, 0, plannedHours));
    return { runningHours: round2(plannedHours - d), downtimeHours: d };
  }
  const r = round2(clamp(runningHours, 0, plannedHours));
  return { runningHours: r, downtimeHours: round2(plannedHours - r) };
}

/** Derived running used for KPIs (respects the plan; falls back to stored value). */
export function effectiveRunning(runningHours: number, downtimeHours: number, plannedHours: number): number {
  if (plannedHours > 0) return round2(Math.max(0, Math.min(plannedHours, plannedHours - downtimeHours)));
  return runningHours;
}

/** Derived downtime used for KPIs/display. */
export function effectiveDowntime(runningHours: number, downtimeHours: number, plannedHours: number): number {
  if (plannedHours > 0) return round2(Math.max(0, plannedHours - effectiveRunning(runningHours, downtimeHours, plannedHours)));
  return downtimeHours;
}

export interface DowntimeLine {
  downtimeHours?: number | string | null;
}

/** Total downtime = sum of all downtime row hours (0 rows → 0). */
export function sumDowntimeLines(lines: DowntimeLine[] | null | undefined): number {
  return round2((lines ?? []).reduce((s, l) => s + toNum2(l.downtimeHours), 0));
}

/** Sum of production item quantities (0 rows → 0). */
export function sumProductionLines(lines: Array<{ quantity?: number | string | null; actualQuantity?: number | string | null }> | null | undefined): number {
  return round2((lines ?? []).reduce((s, l) => s + toNum2(l.quantity ?? l.actualQuantity), 0));
}

/** Group production quantities by UOM so incompatible units are never added. */
export function productionTotalsByUom(
  lines: Array<{ quantity?: number | string | null; uomId?: string | null }> | null | undefined,
): Array<{ uomId: string | null; total: number; count: number }> {
  const map = new Map<string, { uomId: string | null; total: number; count: number }>();
  for (const l of lines ?? []) {
    const key = l.uomId ?? '';
    const entry = map.get(key) ?? { uomId: l.uomId ?? null, total: 0, count: 0 };
    entry.total = round2(entry.total + toNum2(l.quantity));
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()];
}

function toNum2(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

