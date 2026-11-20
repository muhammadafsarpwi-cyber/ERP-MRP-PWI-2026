/* Authoritative UOM-aware production weight helpers.
   Mirrors the backend calcActualKg/calcScrapPct in
   backend/src/modules/production/services/production-entry.service.ts so every
   Production / Shift / Rejection table converts Actual → Actual KG with the
   SAME formula:
     · KG / weight UOM   → Actual (never re-multiplied)
     · length (M/MTR/…)  → Actual × weight_per_meter
     · count (PCS/EA/…)  → Actual × weight_per_piece
     · other UOM         → null (no invented conversion)
   All values come from Item Master weight fields supplied by the API. These
   are derived report/display values — never written back. */

export const KG_UOMS = new Set(['KG', 'KGS', 'KGM', 'KILOGRAM', 'KILOGRAMS']);
export const LENGTH_UOMS = new Set(['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES']);
export const COUNT_UOMS = new Set(['PCS', 'PC', 'PIECE', 'PIECES', 'EA', 'NOS', 'NO', 'UNIT']);

export function calcActualKg(
  uomCode: string,
  actualQuantity: number,
  weightPerPiece?: number | null,
  weightPerMeter?: number | null,
): number | null {
  const u = (uomCode || '').toUpperCase().trim();
  if (KG_UOMS.has(u)) return Math.round(actualQuantity * 10000) / 10000;
  if (LENGTH_UOMS.has(u)) return weightPerMeter == null ? null : Math.round(actualQuantity * weightPerMeter * 10000) / 10000;
  if (COUNT_UOMS.has(u)) return weightPerPiece == null ? null : Math.round(actualQuantity * weightPerPiece * 10000) / 10000;
  return null;
}

export function calcScrapPct(scrapQuantity: number, actualKg?: number | null): number | null {
  if (actualKg == null || actualKg <= 0) return null;
  return Math.round((scrapQuantity / actualKg) * 10000) / 100;
}

const trimNum = (v: number) => String(Number(Number(v).toFixed(6)));

export function perUnitWeightLabel(
  uom: string,
  weightPerPiece?: number | null,
  weightPerMeter?: number | null,
): string | null {
  const u = (uom || '').toUpperCase().trim();
  if (!u || KG_UOMS.has(u)) return null;
  if (LENGTH_UOMS.has(u)) return weightPerMeter == null || weightPerMeter === 0 ? null : `${trimNum(weightPerMeter)} KG/${uom}`;
  if (COUNT_UOMS.has(u)) return weightPerPiece == null || weightPerPiece === 0 ? null : `${trimNum(weightPerPiece)} KG/${uom}`;
  return null;
}

/** Extract explicit Part Rejection KG weight from remarks (e.g. "Part Rejection: 200 PCS (2.11 KG)"). */
export function parsePartRejectionKgFromRemarks(remarks?: string | null): number | null {
  if (!remarks) return null;
  const m =
    /(?:Part Rejection|Component Scrap|Packing Rejection|Plating Defect|Rejection|Scrap|Defect):\s*[\d,.]+\s*[A-Za-z]*\s*\(\s*([\d,.]+)\s*KG\s*\)/i.exec(
      String(remarks),
    ) || /Total:\s*([\d,.]+)\s*KG\s*\(\s*\d+\s*PCS\s*\)/i.exec(String(remarks));
  if (!m) return null;
  const val = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(val) ? val : null;
}

/** Extract explicit actual Weight KG from Hand Packing remarks (e.g. "Weight: 3118.2 KG"). */
export function parseWeightKgFromRemarks(remarks?: string | null): number | null {
  if (!remarks) return null;
  const m = /(?:^|\|\s*)Weight:\s*([\d,.]+)\s*KG/i.exec(String(remarks));
  if (!m) return null;
  const val = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(val) ? val : null;
}

/** Canonical unit-weight suffix ("kg/pc" for count UOMs, "kg/m" for length UOMs). */
function unitWeightSuffix(uom: string): string | null {
  const u = (uom || '').toUpperCase().trim();
  if (!u || KG_UOMS.has(u)) return null;
  if (LENGTH_UOMS.has(u)) return 'kg/m';
  if (COUNT_UOMS.has(u)) return 'kg/pc';
  return `kg/${u.toLowerCase()}`;
}

/**
 * Standardized per-unit weight label ("<value> kg/pc" or "<value> kg/m") for
 * cards and table rows: uses Item Master weightPerPiece/weightPerMeter when present,
 * falling back cleanly to derived weight (totalKg / actualQty) when missing.
 */
export function formatStandardUnitWeight(
  uom: string,
  actualQty: number,
  totalKg?: number | null,
  weightPerPiece?: number | null,
  weightPerMeter?: number | null,
): string | null {
  const u = (uom || '').toUpperCase().trim();
  const suffix = unitWeightSuffix(u);
  if (!suffix) return null;

  if (LENGTH_UOMS.has(u) && weightPerMeter != null && weightPerMeter > 0) {
    return `${trimNum(Number(weightPerMeter))} ${suffix}`;
  }
  if (COUNT_UOMS.has(u) && weightPerPiece != null && weightPerPiece > 0) {
    return `${trimNum(Number(weightPerPiece))} ${suffix}`;
  }
  if (totalKg != null && totalKg > 0 && actualQty > 0) {
    return `${Number((totalKg / actualQty).toFixed(5))} ${suffix}`;
  }
  return null;
}