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

const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/** Item conversion master data needed to express a production line in KG. */
export interface KgConversionItem {
  uomType?: string | null;
  weightPerMeter?: number | string | null;
  weightPerPiece?: number | string | null;
  piecesPerKg?: number | string | null;
}

/**
 * Convert a production quantity line to its KG equivalent using the item's own
 * conversion master data AND the production line's UOM family. Family-aware so
 * M and KG are never mixed (STEP 5/6):
 *   LENGTH → kg = qty × weightPerMeter   (kg per meter)
 *   WEIGHT → kg = qty                    (already KG — NO conversion)
 *   COUNT  → kg = qty × weightPerPiece   (or qty ÷ piecesPerKg)
 * Returns null when no valid conversion path exists — no fabricated value.
 */
export function lineToKg(quantity: number | string | null | undefined, item: KgConversionItem | null | undefined): number | null {
  const q = toNum2(quantity);
  const family = (item?.uomType || '').toUpperCase();
  const wpm = toNum2(item?.weightPerMeter);
  const wpp = toNum2(item?.weightPerPiece);
  const ppk = toNum2(item?.piecesPerKg);
  if (family === 'WEIGHT') return round6(q);
  if (family === 'LENGTH') return wpm > 0 ? round6(q * wpm) : null;
  if (family === 'COUNT') {
    if (wpp > 0) return round6(q * wpp);
    if (ppk > 0) return round6(q / ppk);
    return null;
  }
  return null;
}

/** One production line, already paired with its KG-conversion facts. */
export interface ProductionLineForAgg {
  actualQuantity?: number | string | null;
  scrapQuantity?: number | string | null;
  item?: KgConversionItem | null;
}

export interface ProductionAggregate {
  totalActual: number;
  totalScrap: number;
  totalKg: number;
  totalRejectionKg: number;
  rejectionPct: number;
}

/**
 * Aggregate multi-item production KPI totals, and the rejection %, in the
 * COMPARABLE unit (KG). Raw quantities are summed only for the per-line actual/
 * scrap breakdown; the rejection % uses KG equivalents so KG, METER and PCS
 * lines are never mixed (a line is only included once its KG equivalent
 * exists, keeping numerator and denominator on the same subset).
 */
export function aggregateProductionTotals(
  lines: ProductionLineForAgg[] | null | undefined,
): ProductionAggregate {
  let totalActual = 0;
  let totalScrap = 0;
  let totalKg = 0;
  let totalRejectionKg = 0;
  for (const line of lines ?? []) {
    const act = Math.max(0, toNum2(line.actualQuantity));
    const rej = Math.max(0, toNum2(line.scrapQuantity));
    totalActual += act;
    totalScrap += rej;
    const actKg = line.item ? lineToKg(act, line.item) : null;
    const rejKg = line.item ? lineToKg(rej, line.item) : null;
    if (actKg !== null) totalKg += actKg;
    if (rejKg !== null) totalRejectionKg += rejKg;
  }
  const totalProducedKg = totalKg + totalRejectionKg;
  const rejectionPct = totalProducedKg > 0 ? round2((totalRejectionKg / totalProducedKg) * 100) : 0;
  return { totalActual, totalScrap, totalKg, totalRejectionKg, rejectionPct };
}

/**
 * Normalise the raw antd Form.List downtime lines into the backend's canonical
 * `downtimes` payload array. This is the SAME mapping EntryForm's onFinish used
 * to build inline — extracted so the contract (lineNumber / downtimeReasonId /
 * downtimeReason / downtimeHours / remarks) is covered by a unit test and
 * cannot drift from the DTO.
 */
export interface DowntimeLineDraft {
  lineNumber?: number | null;
  downtimeReasonId?: string | null;
  downtimeReason?: string | null;
  downtimeHours?: number | string | null;
  remarks?: string | null;
}

export function buildDowntimePayload(lines: DowntimeLineDraft[] | null | undefined) {
  return (lines ?? [])
    .filter((l) => l.downtimeReasonId || toNum2(l.downtimeHours) > 0 || l.downtimeReason)
    .map((l, idx) => ({
      lineNumber: l.lineNumber ?? idx + 1,
      downtimeReasonId: l.downtimeReasonId ?? undefined,
      downtimeReason: l.downtimeReason ?? undefined,
      downtimeHours: Number(l.downtimeHours ?? 0),
      remarks: l.remarks ?? undefined,
    }));
}

/** Normalise raw production-item Form.List lines into the backend `items` payload. */
export interface ProductionItemDraft {
  lineNumber?: number | null;
  itemId?: string | null;
  uomId?: string | null;
  targetQuantity?: number | string | null;
  actualQuantity?: number | string | null;
  scrapQuantity?: number | string | null;
  runningHours?: number | string | null;
  routingCode?: string | null;
  remarks?: string | null;
}

export function buildProductionItemsPayload(lines: ProductionItemDraft[] | null | undefined, fallbackUomId?: string | null) {
  return (lines ?? [])
    .filter((l) => l.itemId)
    .map((l, idx) => ({
      lineNumber: l.lineNumber ?? idx + 1,
      itemId: l.itemId,
      uomId: l.uomId ?? fallbackUomId ?? undefined,
      targetQuantity: Number(l.targetQuantity ?? 0),
      actualQuantity: Number(l.actualQuantity ?? 0),
      scrapQuantity: Number(l.scrapQuantity ?? 0),
      runningHours: Number(l.runningHours ?? 0),
      routingCode: l.routingCode ?? undefined,
      remarks: l.remarks ?? undefined,
    }));
}

