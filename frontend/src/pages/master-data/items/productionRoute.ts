import type { ProductionFlowRouteStage, ProductionFlowStage } from './itemTypes';

// TASK 15: pure client-side helpers for the configured PRODUCTION ROUTE authoring
// model. Each route row = a PROCESS/DEPARTMENT + OUTPUT ITEM pair, exactly as the
// backend item.service builds it (buildConfiguredRouteStages). These helpers keep
// the form preview DRY and mirror the authoritative backend stage model so the
// modal preview and the saved View-card stage list never disagree.

export interface RouteRow {
  sequence: number;
  name: string;
  departmentId?: string | null;
  departmentName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  outputItemId?: string | null;
}

export interface RouteStageSource {
  id?: string | null;
  itemCode?: string | null;
  itemName?: string | null;
  name?: string | null;
  itemType?: string | null;
  wireSizeMm?: number | null;
  diameterMm?: number | null;
  thicknessMm?: number | null;
  widthMm?: number | null;
  lengthPerPiece?: number | null;
  baseUomName?: string | null;
  barcode?: string | null;
  sku?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  divisionId?: string | null;
  divisionName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  baseUom?: { id?: string; code?: string; name?: string } | null;
  department?: { id?: string; name?: string } | null;
  division?: { id?: string; name?: string } | null;
  section?: { id?: string; name?: string } | null;
}

export const cleanString = (v: unknown): string | null =>
  v == null || String(v).trim() === '' ? null : String(v).trim();

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Normalize a raw Form.List `processes` value into RouteRow[].
 * Mirrors backend `ensureRouteRows`: a row is kept only when it carries a
 * Department OR an Output Item (a bare operation name is NOT a stage), the
 * sequence is re-indexed 1..N, names are trimmed, and the relationship fields
 * (department + output item) are copied through.
 */
export function normalizeRouteRows(rows: unknown): RouteRow[] {
  if (!Array.isArray(rows)) return [];
  const out: RouteRow[] = [];
  (rows as unknown[]).forEach((r) => {
    const obj = r as Record<string, unknown> | null;
    const hasDept = Boolean(
      obj && typeof obj === 'object' && obj.departmentId && String(obj.departmentId).trim(),
    );
    const hasItem = Boolean(
      obj && typeof obj === 'object' && obj.outputItemId && String(obj.outputItemId).trim(),
    );
    if (!hasDept && !hasItem) return;
    const name = obj && typeof obj === 'object' ? (typeof obj.name === 'string' ? obj.name.trim() : '') : '';
    out.push({
      sequence: out.length + 1,
      name,
      departmentId: cleanString(obj?.departmentId),
      departmentName: cleanString(obj?.departmentName),
      divisionId: cleanString(obj?.divisionId),
      divisionName: cleanString(obj?.divisionName),
      sectionId: cleanString(obj?.sectionId),
      sectionName: cleanString(obj?.sectionName),
      outputItemId: cleanString(obj?.outputItemId),
    });
  });
  return out;
}

/**
 * Detect duplicate Output Items across configured route rows (A → B → A).
 * Returns the duplicated item IDs so callers can warn the user live. Mirrors the
 * backend's cycle guard in validateRouteRows.
 */
export function findRouteCycles(rows: RouteRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const row of rows) {
    if (!row.outputItemId) continue;
    if (seen.has(row.outputItemId)) duplicates.add(row.outputItemId);
    seen.add(row.outputItemId);
  }
  return Array.from(duplicates);
}

/**
 * Map an Item-like node to the stage item summary. Mirrors backend `mapStageItem`:
 * null item → all-null placeholder (renders as "—"), otherwise real fields from the
 * loaded Item Master record, preferring the populated relation sub-objects when the
 * scalar fields are missing.
 */
export function mapStageItem(it: RouteStageSource | null): {
  itemId: string | null;
  itemCode: string | null;
  itemName: string | null;
  itemType: string | null;
  wireSizeMm: number | null;
  diameterMm: number | null;
  thicknessMm: number | null;
  widthMm: number | null;
  lengthPerPiece: number | null;
  baseUomName: string | null;
  barcode: string | null;
  sku: string | null;
  departmentId: string | null;
  departmentName: string | null;
  divisionId: string | null;
  divisionName: string | null;
  sectionId: string | null;
  sectionName: string | null;
} {
  if (!it) {
    return {
      itemId: null,
      itemCode: null,
      itemName: null,
      itemType: null,
      wireSizeMm: null,
      diameterMm: null,
      thicknessMm: null,
      widthMm: null,
      lengthPerPiece: null,
      baseUomName: null,
      barcode: null,
      sku: null,
      departmentId: null,
      departmentName: null,
      divisionId: null,
      divisionName: null,
      sectionId: null,
      sectionName: null,
    };
  }
  return {
    itemId: it.id ?? null,
    itemCode: it.itemCode ?? null,
    itemName: it.itemName ?? it.name ?? null,
    itemType: it.itemType ?? null,
    wireSizeMm: it.wireSizeMm ?? null,
    diameterMm: it.diameterMm ?? null,
    thicknessMm: it.thicknessMm ?? null,
    widthMm: it.widthMm ?? null,
    lengthPerPiece: it.lengthPerPiece ?? null,
    baseUomName: it.baseUomName ?? it.baseUom?.name ?? null,
    barcode: it.barcode ?? null,
    sku: it.sku ?? null,
    departmentId: it.departmentId ?? it.department?.id ?? null,
    departmentName: it.departmentName ?? it.department?.name ?? null,
    divisionId: it.divisionId ?? it.division?.id ?? null,
    divisionName: it.divisionName ?? it.division?.name ?? null,
    sectionId: it.sectionId ?? it.section?.id ?? null,
    sectionName: it.sectionName ?? it.section?.name ?? null,
  };
}

/**
 * Build a single ProductionFlowStage from a configured route row + its resolved
 * output-Item summary. Mirrors backend `buildConfiguredRouteStages`:
 * - title = UPPERCASED operation name → dept name → STEP NN (never fabricated)
 * - department/division/section from the ROW (authoritative), fallback to item
 * - operationName = row.name or department name (auto-derived)
 * - barcode/sku from the resolved item
 */
export function nodeToStage(
  _sequence: number,
  row: RouteRow,
  itemInfo: ReturnType<typeof mapStageItem>,
  operationName: string,
  isCurrent: boolean,
  configured: boolean,
  departmentName: string | null,
  divisionId: string | null,
  divisionName: string | null,
  sectionId: string | null,
  sectionName: string | null,
): ProductionFlowStage {
  const stepNum = `STEP ${String(row.sequence).padStart(2, '0')}`;
  return {
    sequence: row.sequence,
    itemNumber: row.sequence,
    kind: 'process',
    stageKey: `route-${row.sequence}`,
    title: operationName?.toUpperCase() || departmentName?.toUpperCase() || stepNum,
    departmentId: row.departmentId ?? itemInfo.departmentId ?? null,
    departmentName: departmentName ?? itemInfo.departmentName ?? null,
    divisionId: divisionId ?? itemInfo.divisionId ?? null,
    divisionName: divisionName ?? itemInfo.divisionName ?? null,
    sectionId: sectionId ?? itemInfo.sectionId ?? null,
    sectionName: sectionName ?? itemInfo.sectionName ?? null,
    operationCode: itemInfo.departmentId ?? null,
    operationName,
    barcode: itemInfo.barcode ?? null,
    sku: itemInfo.sku ?? null,
    itemId: itemInfo.itemId,
    itemCode: itemInfo.itemCode,
    itemName: itemInfo.itemName,
    itemType: itemInfo.itemType,
    wireSizeMm: itemInfo.wireSizeMm,
    diameterMm: itemInfo.diameterMm,
    thicknessMm: itemInfo.thicknessMm,
    widthMm: itemInfo.widthMm,
    lengthPerPiece: itemInfo.lengthPerPiece,
    baseUomName: itemInfo.baseUomName,
    isCurrent,
    configured,
  };
}

export interface RouteFlowBuild {
  fullRoute: ProductionFlowRouteStage[];
  stages: ProductionFlowStage[];
}

/**
 * Build the configured-route flow (fullRoute + stages) from normalized rows and an
 * Item lookup map. A row renders as "configured" only with a real process department
 * AND a resolved output item (legacy rows without either stay read-only — never
 * fabricated). No RAW_NODE prefix / NEXT_STEP / FINAL_PRODUCT tail stages — the
 * configured route is already authoritative.
 */
export function buildRouteFlow(
  rows: RouteRow[],
  currentItemId: string | null,
  itemLookup: Map<string, RouteStageSource | null>,
): RouteFlowBuild {
  const fullRoute: ProductionFlowRouteStage[] = [];
  const stages: ProductionFlowStage[] = [];

  rows.forEach((row) => {
    const outItem = row.outputItemId ? (itemLookup.get(row.outputItemId) ?? null) : null;
    const resolved = mapStageItem(outItem);
    const configured = Boolean(row.departmentId && resolved.itemCode);

    // Row's department is authoritative; fallback to item's own org (rare)
    const departmentId   = row.departmentId   ?? resolved.departmentId   ?? null;
    const departmentName = row.departmentName ?? resolved.departmentName ?? null;
    const divisionId     = row.divisionId     ?? resolved.divisionId     ?? null;
    const divisionName   = row.divisionName   ?? resolved.divisionName   ?? null;
    const sectionId      = row.sectionId      ?? resolved.sectionId      ?? null;
    const sectionName    = row.sectionName    ?? resolved.sectionName    ?? null;

    // operationName auto-derived: row name → dept name → empty (backend rule)
    const operationName = row.name?.trim() || departmentName || '';
    const isCurrent = Boolean(currentItemId && row.outputItemId === currentItemId);
    const stepNum = `STEP ${String(row.sequence).padStart(2, '0')}`;
    const stageName = operationName || stepNum;

    fullRoute.push({
      stageOrder: row.sequence,
      stageName,
      itemId: resolved.itemId,
      itemCode: resolved.itemCode,
      itemName: resolved.itemName,
      itemType: resolved.itemType,
      departmentId,
      departmentName,
      divisionId,
      divisionName,
      sectionId,
      sectionName,
      wireSizeMm: resolved.wireSizeMm,
      diameterMm: resolved.diameterMm,
      thicknessMm: resolved.thicknessMm,
      widthMm: resolved.widthMm,
      lengthPerPiece: resolved.lengthPerPiece,
      baseUomName: resolved.baseUomName,
      operationCode: resolved.departmentId ?? null,
      operationName,
      barcode: resolved.barcode ?? null,
      sku: resolved.sku ?? null,
      isCurrent,
    });

    stages.push(
      nodeToStage(
        row.sequence,
        row,
        resolved,
        operationName,
        isCurrent,
        configured,
        departmentName,
        divisionId,
        divisionName,
        sectionId,
        sectionName,
      ),
    );
  });

  return { fullRoute, stages };
}