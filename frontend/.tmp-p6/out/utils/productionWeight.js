"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.COUNT_UOMS = exports.LENGTH_UOMS = exports.KG_UOMS = void 0;
exports.calcActualKg = calcActualKg;
exports.calcScrapPct = calcScrapPct;
exports.perUnitWeightLabel = perUnitWeightLabel;
exports.KG_UOMS = new Set(['KG', 'KGS', 'KGM', 'KILOGRAM', 'KILOGRAMS']);
exports.LENGTH_UOMS = new Set(['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES']);
exports.COUNT_UOMS = new Set(['PCS', 'PC', 'PIECE', 'PIECES', 'EA', 'NOS', 'NO', 'UNIT']);
function calcActualKg(uomCode, actualQuantity, weightPerPiece, weightPerMeter) {
    const u = (uomCode || '').toUpperCase().trim();
    if (exports.KG_UOMS.has(u))
        return Math.round(actualQuantity * 10000) / 10000;
    if (exports.LENGTH_UOMS.has(u))
        return weightPerMeter == null ? null : Math.round(actualQuantity * weightPerMeter * 10000) / 10000;
    if (exports.COUNT_UOMS.has(u))
        return weightPerPiece == null ? null : Math.round(actualQuantity * weightPerPiece * 10000) / 10000;
    return null;
}
function calcScrapPct(scrapQuantity, actualKg) {
    if (actualKg == null || actualKg <= 0)
        return null;
    return Math.round((scrapQuantity / actualKg) * 10000) / 100;
}
const trimNum = (v) => String(Number(Number(v).toFixed(6)));
function perUnitWeightLabel(uom, weightPerPiece, weightPerMeter) {
    const u = (uom || '').toUpperCase().trim();
    if (!u || exports.KG_UOMS.has(u))
        return null;
    if (exports.LENGTH_UOMS.has(u))
        return weightPerMeter == null || weightPerMeter === 0 ? null : `${trimNum(weightPerMeter)} KG/${uom}`;
    if (exports.COUNT_UOMS.has(u))
        return weightPerPiece == null || weightPerPiece === 0 ? null : `${trimNum(weightPerPiece)} KG/${uom}`;
    return null;
}
