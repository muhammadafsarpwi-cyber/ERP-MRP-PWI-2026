/**
 * Dynamic UOM conversion, packaging calculation, and division filtering utilities
 * for the Safety Stock Buffer Warehouse in CustomerAnalytics.
 *
 * Strictly derives UOMs (`baseUom`, `salesUom`, `packagingUnit`, `packagingSize`)
 * and active UOM conversion factors (`uom_conversions`) from Item Master metadata
 * rather than hardcoding /144 (Gross) or /10 (Carton) across divisions.
 */

export interface UomConversionRecord {
  id?: string;
  fromUomId?: string;
  toUomId?: string;
  fromUom?: { id?: string; code?: string; symbol?: string } | null;
  toUom?: { id?: string; code?: string; symbol?: string } | null;
  conversionFactor: number | string;
  status?: string;
}

export interface DivisionOptionRecord {
  id: string;
  divisionCode?: string;
  name: string;
  status?: string;
  isActive?: boolean;
}

export interface ItemMasterUomRecord {
  id?: string;
  itemCode: string;
  itemName: string;
  baseUomCode: string;
  salesUomCode: string;
  packagingType?: string;
  packagingUnit?: string;
  packagingSize: number;
  divisionId?: string;
  divisionCode?: string;
  divisionName?: string;
}

export interface BufferUomMetric {
  code: string;
  value: number;
  decimals: number;
  role: 'packaging' | 'sales' | 'base';
}

export interface SafetyItemDetail {
  itemCode: string;
  itemName: string;
  divisionId?: string;
  divisionCode?: string;
  divisionName?: string;
  baseUomCode: string;
  salesUomCode?: string;
  packagingType?: string;
  packagingUnit?: string;
  packagingUnitCode?: string;
  packagingSize?: number;
  baseQty: number;
  salesQty: number;
  packagingQty: number;
  cartons: number;
  gross: number;
  pcs: number;
  hasGrossUom: boolean;
  metrics: BufferUomMetric[];
}

export interface ResolvedBufferQuantities {
  divisionId?: string;
  divisionCode?: string;
  divisionName?: string;
  baseUomCode: string;
  salesUomCode: string;
  packagingType?: string;
  packagingUnit?: string;
  packagingUnitCode: string;
  packagingSize: number;
  baseQty: number;
  salesQty: number;
  packagingQty: number;
  cartons: number;
  gross: number;
  pcs: number;
  hasGrossUom: boolean;
}

export interface BufferSummaryTotals {
  label: string;
  value: number;
  unitCode: string;
  decimals: number;
}

export interface SafetyBufferDockSummary {
  items: SafetyItemDetail[];
  batchCount: number;
  volumeLabel: string;
  volumeTotals: BufferSummaryTotals[];
  packageLabel: string;
  packageTotals: BufferSummaryTotals[];
}

const normCodeKey = (val: string): string => (val || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function normalizeUomCode(code?: string | null): string {
  const clean = String(code || '').trim().toUpperCase();
  if (!clean) return '';
  if (clean === 'MTR' || clean === 'METER' || clean === 'METERS' || clean === 'METRE') return 'M';
  if (clean === 'PIECES' || clean === 'PIECE' || clean === 'PC') return 'PCS';
  if (clean === 'GROSS' || clean === 'GR') return 'GRS';
  if (clean === 'CARTON' || clean === 'CARTONS') return 'CTN';
  if (clean === 'COILS') return 'COIL';
  if (clean === 'ROLLS') return 'ROLL';
  return clean;
}

export function toPackagingShortCode(packagingUnit?: string | null, packagingType?: string | null): string {
  const raw = String(packagingUnit || packagingType || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'CARTON' || raw === 'CARTONS' || raw === 'CTN') return 'CTN';
  if (raw === 'COIL' || raw === 'COILS') return 'COIL';
  if (raw === 'ROLL' || raw === 'ROLLS') return 'ROLL';
  if (raw === 'BOX' || raw === 'BOXES') return 'BOX';
  if (raw === 'BUNDLE' || raw === 'BUNDLES' || raw === 'BDL') return 'BDL';
  if (raw === 'BAG' || raw === 'BAGS') return 'BAG';
  if (raw === 'PACK' || raw === 'PACKS' || raw === 'PKT') return 'PACK';
  return raw;
}

export function inferDivisionFromItemCode(
  itemCode: string,
  divisions: DivisionOptionRecord[],
): { divisionId?: string; divisionCode?: string; divisionName?: string } {
  const upper = (itemCode || '').toUpperCase();
  let targetCodes: string[] = [];
  if (upper.startsWith('SPI-') || upper.startsWith('FG-NP-') || upper.startsWith('WIP-SP')) {
    targetCodes = ['DIV-001-SPI', 'DIV-SPD'];
  } else if (upper.startsWith('CCD-')) {
    targetCodes = ['DIV-002-CCD', 'DIV-CCD'];
  } else if (upper.startsWith('WRD-')) {
    targetCodes = ['DIV-005-WRD', 'DIV-WRD'];
  } else if (upper.startsWith('NB-')) {
    targetCodes = ['DIV-003-NB', 'DIV-NB'];
  }

  for (const code of targetCodes) {
    const matched = divisions.find(
      (d) => (d.divisionCode || '').toUpperCase() === code || (d.name || '').toUpperCase().includes(code.replace('DIV-', '')),
    );
    if (matched) {
      return {
        divisionId: matched.id,
        divisionCode: matched.divisionCode || code,
        divisionName: matched.name,
      };
    }
  }

  if (targetCodes[0] === 'DIV-001-SPI') {
    return { divisionCode: 'DIV-001-SPI', divisionName: 'Spoke Division' };
  }
  if (targetCodes[0] === 'DIV-002-CCD') {
    return { divisionCode: 'DIV-002-CCD', divisionName: 'Control Cable Division' };
  }
  if (targetCodes[0] === 'DIV-005-WRD') {
    return { divisionCode: 'DIV-005-WRD', divisionName: 'WRD Division' };
  }
  if (targetCodes[0] === 'DIV-003-NB') {
    return { divisionCode: 'DIV-003-NB', divisionName: 'NB Division' };
  }
  return {};
}

export function buildItemMasterIndex(
  prodItems: any[],
  divisions: DivisionOptionRecord[],
): Map<string, ItemMasterUomRecord> {
  const divById = new Map<string, DivisionOptionRecord>();
  const divByNameOrCode = new Map<string, DivisionOptionRecord>();
  for (const d of divisions || []) {
    if (d.id) divById.set(d.id, d);
    if (d.divisionCode) divByNameOrCode.set(normCodeKey(d.divisionCode), d);
    if (d.name) divByNameOrCode.set(normCodeKey(d.name), d);
  }

  const index = new Map<string, ItemMasterUomRecord>();
  for (const raw of prodItems || []) {
    const itemCode = String(raw.itemCode || '').trim();
    const itemName = String(raw.name || raw.itemName || '').trim();
    if (!itemCode && !itemName) continue;

    const divFromId = raw.divisionId ? divById.get(raw.divisionId) : undefined;
    const divFromCode = raw.divisionCode ? divByNameOrCode.get(normCodeKey(raw.divisionCode)) : undefined;
    const divFromName = raw.divisionName ? divByNameOrCode.get(normCodeKey(raw.divisionName)) : undefined;
    const resolvedDiv = divFromId || divFromCode || divFromName;
    const fallbackDiv = inferDivisionFromItemCode(itemCode, divisions || []);

    const baseUomCode = normalizeUomCode(raw.baseUom?.code || raw.baseUom?.symbol || raw.uomCode || 'PCS');
    const salesUomCode = normalizeUomCode(raw.salesUom?.code || raw.salesUom?.symbol || raw.salesUomCode || baseUomCode);
    const packagingUnit = raw.packagingUnit ? String(raw.packagingUnit).trim() : (raw.packagingUnitName ? String(raw.packagingUnitName).trim() : undefined);
    const packagingType = raw.packagingType ? String(raw.packagingType).trim() : undefined;
    const packagingSize = Number(raw.packagingSize) > 0 ? Number(raw.packagingSize) : 0;

    const record: ItemMasterUomRecord = {
      id: raw.id,
      itemCode,
      itemName,
      baseUomCode,
      salesUomCode,
      packagingType,
      packagingUnit,
      packagingSize,
      divisionId: resolvedDiv?.id || raw.divisionId || fallbackDiv.divisionId,
      divisionCode: resolvedDiv?.divisionCode || raw.divisionCode || fallbackDiv.divisionCode,
      divisionName: resolvedDiv?.name || raw.divisionName || fallbackDiv.divisionName,
    };

    const kCode = normCodeKey(itemCode);
    const kName = normCodeKey(itemName);
    if (kCode) index.set(kCode, record);
    if (kName && !index.has(kName)) index.set(kName, record);
  }

  return index;
}

/**
 * Converts a quantity between two UOM codes using active rows from `uom_conversions`.
 * Prefers exact inverse divisors when `reverseFactor >= 1` (e.g., GRS -> PCS = 144)
 * to avoid floating-point truncation drift from repeating decimals like 0.00694444.
 */
export function convertUomQuantity(
  qty: number,
  fromCodeRaw: string,
  toCodeRaw: string,
  conversions: UomConversionRecord[],
): number | null {
  if (!Number.isFinite(qty)) return null;
  const fromCode = normalizeUomCode(fromCodeRaw);
  const toCode = normalizeUomCode(toCodeRaw);
  if (!fromCode || !toCode) return null;
  if (fromCode === toCode) return qty;

  const active = (conversions || []).filter(
    (c) => !c.status || String(c.status).toUpperCase() === 'ACTIVE',
  );

  // Build normalized conversion edges
  const edges = new Map<string, Array<{ to: string; factor: number; exactRank: number }>>();
  const addEdge = (from: string, to: string, factor: number, exactRank: number) => {
    if (!edges.has(from)) edges.set(from, []);
    edges.get(from)!.push({ to, factor, exactRank });
  };

  for (const conv of active) {
    const fCode = normalizeUomCode(conv.fromUom?.code || conv.fromUom?.symbol);
    const tCode = normalizeUomCode(conv.toUom?.code || conv.toUom?.symbol);
    const factor = Number(conv.conversionFactor);
    if (!fCode || !tCode || !Number.isFinite(factor) || factor <= 0) continue;

    // Higher exactRank wins: integer/exact >= 1 factor or its exact inverse
    const isWholeForward = factor >= 1 && Math.abs(factor - Math.round(factor)) < 1e-6;
    addEdge(fCode, tCode, factor, isWholeForward ? 2 : 1);
    addEdge(tCode, fCode, 1 / factor, isWholeForward ? 3 : 1);
  }

  // Sort edges by exactRank descending so exact factors (e.g. / 144) win over rounded decimals (* 0.00694444)
  for (const [, list] of edges) {
    list.sort((a, b) => b.exactRank - a.exactRank);
  }

  // BFS shortest / highest-precision path (max depth 3)
  const queue: Array<{ code: string; factor: number; depth: number }> = [
    { code: fromCode, factor: 1, depth: 0 },
  ];
  const visited = new Set<string>([fromCode]);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (curr.code === toCode) {
      return snapFloat(qty * curr.factor);
    }
    if (curr.depth >= 3) continue;
    for (const next of edges.get(curr.code) || []) {
      if (!visited.has(next.to)) {
        visited.add(next.to);
        queue.push({ code: next.to, factor: curr.factor * next.factor, depth: curr.depth + 1 });
      }
    }
  }

  return null;
}

function snapFloat(val: number): number {
  if (!Number.isFinite(val)) return 0;
  const roundedInt = Math.round(val);
  if (Math.abs(val - roundedInt) < 0.002) {
    return roundedInt;
  }
  return Math.round(val * 10000) / 10000;
}

export function cleanDisplayNumber(val: number): { value: number; decimals: number } {
  if (!Number.isFinite(val) || val === 0) return { value: 0, decimals: 0 };
  const roundedInt = Math.round(val);
  if (Math.abs(val - roundedInt) < 0.002) {
    return { value: roundedInt, decimals: 0 };
  }
  const oneDec = Math.round(val * 10) / 10;
  if (Math.abs(val - oneDec) < 0.005) {
    return { value: oneDec, decimals: 1 };
  }
  const twoDec = Math.round(val * 100) / 100;
  return { value: twoDec, decimals: 2 };
}

/**
 * Resolves exact quantities & division attribution for a single safety buffer entry
 * using Item Master UOMs (`baseUom`, `salesUom`, `packagingUnit`, `packagingSize`)
 * and active `uom_conversions`. Never assumes GRS (/144) or CTN (/10) for non-GRS items.
 */
export function resolveBufferEntryMetrics(input: {
  itemCode: string;
  itemName: string;
  rawQuantity: number;
  entryUomCode?: string;
  entryDivisionId?: string;
  entryDivisionCode?: string;
  entryDivisionName?: string;
  legacyCartons?: number;
  legacyGross?: number;
  itemMasterMap: Map<string, ItemMasterUomRecord>;
  uomConversions: UomConversionRecord[];
  divisions: DivisionOptionRecord[];
}): ResolvedBufferQuantities {
  const master =
    input.itemMasterMap.get(normCodeKey(input.itemCode)) ||
    input.itemMasterMap.get(normCodeKey(input.itemName));

  const fallbackDiv = inferDivisionFromItemCode(input.itemCode, input.divisions);
  const matchedEntryDiv =
    (input.entryDivisionId ? input.divisions.find((d) => d.id === input.entryDivisionId) : undefined) ||
    (input.entryDivisionCode
      ? input.divisions.find((d) => normCodeKey(d.divisionCode || '') === normCodeKey(input.entryDivisionCode || ''))
      : undefined);

  const divisionId = master?.divisionId || matchedEntryDiv?.id || input.entryDivisionId || fallbackDiv.divisionId;
  const divisionCode = master?.divisionCode || matchedEntryDiv?.divisionCode || input.entryDivisionCode || fallbackDiv.divisionCode;
  const divisionName = master?.divisionName || matchedEntryDiv?.name || input.entryDivisionName || fallbackDiv.divisionName;

  const entryUom = normalizeUomCode(input.entryUomCode);
  const baseUomCode = master?.baseUomCode || entryUom || 'PCS';
  const salesUomCode = master?.salesUomCode || baseUomCode;

  // Convert rawQuantity into baseUomCode when entry UOM differs
  let baseQty = Number(input.rawQuantity) || 0;
  if (entryUom && entryUom !== baseUomCode && baseQty > 0) {
    const converted = convertUomQuantity(baseQty, entryUom, baseUomCode, input.uomConversions);
    if (converted !== null) {
      baseQty = converted;
    }
  }

  // Convert baseQty into salesUomCode strictly via uom_conversions
  let salesQty = baseQty;
  if (salesUomCode !== baseUomCode && baseQty > 0) {
    const converted = convertUomQuantity(baseQty, baseUomCode, salesUomCode, input.uomConversions);
    if (converted !== null) {
      salesQty = converted;
    } else if (salesUomCode === 'GRS' && baseUomCode === 'PCS') {
      salesQty = snapFloat(baseQty / 144);
    } else if (salesUomCode === 'GRS' && input.legacyGross && input.legacyGross > 0) {
      salesQty = input.legacyGross;
    }
  }

  const hasGrossUom = salesUomCode === 'GRS' || baseUomCode === 'GRS';
  const packagingUnit = master?.packagingUnit || (hasGrossUom ? 'Carton' : master?.packagingType || '');
  const packagingType = master?.packagingType;
  const packagingUnitCode = toPackagingShortCode(packagingUnit, packagingType) || (hasGrossUom ? 'CTN' : '');
  const packagingSize = master?.packagingSize || (hasGrossUom ? 10 : 0);

  let packagingQty = 0;
  if (hasGrossUom && baseUomCode === 'PCS' && packagingSize > 0 && baseQty > 0) {
    const exactPcsPerCarton = resolveExactPcsPerCarton(packagingSize, input.itemCode, input.itemName);
    packagingQty = exactPcsPerCarton > 0 ? snapFloat(baseQty / exactPcsPerCarton) : snapFloat(salesQty / packagingSize);
  } else if (packagingSize > 0 && salesQty > 0) {
    packagingQty = snapFloat(salesQty / packagingSize);
  } else if (hasGrossUom && input.legacyCartons && input.legacyCartons > 0) {
    packagingQty = input.legacyCartons;
  }

  return {
    divisionId,
    divisionCode,
    divisionName,
    baseUomCode,
    salesUomCode,
    packagingType,
    packagingUnit,
    packagingUnitCode,
    packagingSize,
    baseQty,
    salesQty,
    packagingQty,
    cartons: packagingQty,
    gross: hasGrossUom ? salesQty : 0,
    pcs: baseUomCode === 'PCS' ? baseQty : 0,
    hasGrossUom,
  };
}

/**
 * Builds the ordered display metrics array for a single Safety Stock card
 * with zero hardcoded GRS/PCS fabrication.
 */
export function buildSafetyItemMetrics(item: {
  baseUomCode: string;
  salesUomCode?: string;
  packagingUnitCode?: string;
  baseQty: number;
  salesQty: number;
  packagingQty: number;
  hasGrossUom: boolean;
}): BufferUomMetric[] {
  const metrics: BufferUomMetric[] = [];
  const baseCode = normalizeUomCode(item.baseUomCode);
  const salesCode = normalizeUomCode(item.salesUomCode || item.baseUomCode);
  const pkgCode = normalizeUomCode(item.packagingUnitCode);

  if (pkgCode && item.packagingQty > 0) {
    const clean = cleanDisplayNumber(item.packagingQty);
    metrics.push({ code: pkgCode, value: clean.value, decimals: clean.decimals, role: 'packaging' });
  }

  if (salesCode && salesCode !== baseCode && salesCode !== pkgCode && item.salesQty > 0) {
    const clean = cleanDisplayNumber(item.salesQty);
    metrics.push({ code: salesCode, value: clean.value, decimals: clean.decimals, role: 'sales' });
  }

  if (baseCode && baseCode !== pkgCode) {
    const clean = cleanDisplayNumber(item.baseQty);
    metrics.push({ code: baseCode, value: clean.value, decimals: clean.decimals, role: 'base' });
  }

  return metrics;
}

/**
 * Filters safety items & batches by selected division and recalculates
 * unit-accurate header KPIs for Safety Stock Buffer Warehouse.
 */
export function buildSafetyBufferDockSummary(
  allItems: SafetyItemDetail[],
  batches: Array<{ divisionId?: string; divisionCode?: string }>,
  selectedDivisionId: string,
): SafetyBufferDockSummary {
  const isAll = !selectedDivisionId || selectedDivisionId === 'ALL';

  const filteredItems = isAll
    ? allItems
    : allItems.filter(
        (it) => it.divisionId === selectedDivisionId || it.divisionCode === selectedDivisionId,
      );

  const filteredBatchCount = isAll
    ? batches.length
    : batches.filter(
        (b) => b.divisionId === selectedDivisionId || b.divisionCode === selectedDivisionId,
      ).length;

  // Group volume by primary display/sales UOM (`GRS` for Spoke, `M` for CCD, etc.)
  const volumeMap = new Map<string, number>();
  const packageMap = new Map<string, number>();

  for (const it of filteredItems) {
    const volUnit = normalizeUomCode(it.hasGrossUom ? 'GRS' : it.salesUomCode || it.baseUomCode);
    const volQty = it.hasGrossUom ? it.gross : it.salesQty || it.baseQty;
    if (volUnit && volQty > 0) {
      volumeMap.set(volUnit, (volumeMap.get(volUnit) || 0) + volQty);
    }

    const pkgUnit = normalizeUomCode(it.packagingUnitCode);
    const pkgQty = it.packagingQty || 0;
    if (pkgUnit && pkgQty > 0) {
      packageMap.set(pkgUnit, (packageMap.get(pkgUnit) || 0) + pkgQty);
    }
  }

  const volumeTotals: BufferSummaryTotals[] = Array.from(volumeMap.entries()).map(([unitCode, total]) => {
    const clean = cleanDisplayNumber(total);
    return { label: 'Buffer Volume', value: clean.value, unitCode, decimals: clean.decimals };
  });

  const packageTotals: BufferSummaryTotals[] = Array.from(packageMap.entries()).map(([unitCode, total]) => {
    const clean = cleanDisplayNumber(total);
    return { label: packageUnitHeading(unitCode), value: clean.value, unitCode, decimals: clean.decimals };
  });

  const volumeLabel = volumeTotals.length > 0 ? 'Buffer Volume' : 'Buffer Volume';
  let packageLabel = 'Packages';
  if (packageTotals.length === 1) {
    packageLabel = packageUnitHeading(packageTotals[0].unitCode);
  }

  return {
    items: filteredItems,
    batchCount: filteredBatchCount,
    volumeLabel,
    volumeTotals,
    packageLabel,
    packageTotals,
  };
}

function packageUnitHeading(unitCode: string): string {
  switch (unitCode) {
    case 'CTN':
      return 'Cartons';
    case 'COIL':
      return 'Coils';
    case 'ROLL':
      return 'Rolls';
    case 'BOX':
      return 'Boxes';
    case 'BDL':
      return 'Bundles';
    default:
      return 'Packages';
  }
}

/**
 * Resolves exact integer PCS per carton from Item Master packagingSize (GRS/CTN).
 * For (CS) items (packagingSize = 10.556 GRS -> 10.556 * 144 = 1,520.064), snaps to exact 1,520 PCS/CTN.
 * For regular spoke items (packagingSize = 10 GRS), returns exact 1,440 PCS/CTN.
 */
export function resolveExactPcsPerCarton(
  packagingSize?: number | null,
  itemCode?: string,
  itemName?: string,
): number {
  const codeUpper = String(itemCode || '').toUpperCase();
  const nameUpper = String(itemName || '').toUpperCase();
  const isCS =
    codeUpper.includes('SPK-011') ||
    codeUpper.includes('SPK-012') ||
    codeUpper.includes('SPK-013') ||
    nameUpper.includes('(CS)');
  const grossPerCarton = Number(packagingSize) > 0 ? Number(packagingSize) : isCS ? 10.556 : 10;
  const rawPcs = grossPerCarton * 144;
  if (Math.abs(rawPcs - Math.round(rawPcs)) <= 0.15) {
    return Math.round(rawPcs);
  }
  return rawPcs;
}

/**
 * Converts a Sales Order / Delivery GRS quantity into exact integer PCS and CTN
 * without 10.556 * 144 = 1,520.064 floating-point drift on (CS) items.
 */
export function convertGrossToExactPcsAndCartons(
  grossQty: number,
  packagingSize?: number | null,
  itemCode?: string,
  itemName?: string,
): { pcs: number; cartons: number; exactGross: number; pcsPerCarton: number; grossPerCarton: number } {
  const safeGross = Number(grossQty) || 0;
  const pcsPerCarton = resolveExactPcsPerCarton(packagingSize, itemCode, itemName);
  const grossPerCarton = Number(packagingSize) > 0 ? Number(packagingSize) : pcsPerCarton === 1520 ? 10.556 : 10;

  if (safeGross <= 0) {
    return { pcs: 0, cartons: 0, exactGross: 0, pcsPerCarton, grossPerCarton };
  }

  let pcs: number;
  let cartons: number;
  if (grossPerCarton > 0) {
    const approxCartons = safeGross / grossPerCarton;
    const nearestCartons = Math.round(approxCartons);
    if (nearestCartons > 0 && Math.abs(approxCartons - nearestCartons) < 0.01) {
      cartons = nearestCartons;
      pcs = nearestCartons * pcsPerCarton;
    } else {
      pcs = Math.round(safeGross * 144);
      cartons = snapFloat(pcs / pcsPerCarton);
    }
  } else {
    pcs = Math.round(safeGross * 144);
    cartons = snapFloat(pcs / pcsPerCarton);
  }

  const exactGross = Math.round((pcs / 144) * 100) / 100;
  return { pcs, cartons, exactGross, pcsPerCarton, grossPerCarton };
}

/**
 * Splits an item name containing `__` (e.g. "Spoke Spec (CS)__Nipple Spec")
 * into clean primary and secondary lines for UI display.
 */
export function splitItemDisplayName(itemName?: string | null): { primary: string; secondary?: string } {
  const raw = String(itemName || '').trim();
  if (!raw) return { primary: 'Finished Goods Item' };
  const parts = raw
    .split(/__+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return { primary: parts[0] || raw };
  }
  return {
    primary: parts[0],
    secondary: parts.slice(1).join(' • '),
  };
}

export interface ReconcilableSocItemInput {
  key: string;
  itemCode: string;
  itemName: string;
  orderedPcs: number;
  packedPcs: number;
  dispatchedPcs: number;
  pcsPerCarton: number;
  grossPerCarton: number;
  isOrderItem?: boolean;
}

export interface ReconciledSocItemOutput {
  key: string;
  itemCode: string;
  itemName: string;
  orderedQty: number;
  orderedPcs: number;
  orderedCartons: number;
  packedQty: number;
  packedPcs: number;
  packedCartons: number;
  dispatchedQty: number;
  dispatchedPcs: number;
  dispatchedCartons: number;
  readyToDispatchQty: number;
  readyToDispatchPcs: number;
  readyToDispatchCartons: number;
  remainingPendingQty: number;
  remainingPendingPcs: number;
  remainingPendingCartons: number;
  toPackQty: number;
  toPackPcs: number;
  toPackCartons: number;
  pcsPerCarton: number;
  grossPerCarton: number;
  fulfillmentPct: number;
  isOrderItem?: boolean;
}

export interface ReconcilableSocInput {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
  isOfficialOrder?: boolean;
  items: ReconcilableSocItemInput[];
}

export interface ReconciledSocOutput {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
  isOfficialOrder?: boolean;
  totalOrderedQty: number;
  totalOrderedPcs: number;
  totalOrderedCartons: number;
  totalPackedQty: number;
  totalPackedPcs: number;
  totalPackedCartons: number;
  totalDispatchedQty: number;
  totalDispatchedPcs: number;
  totalDispatchedCartons: number;
  totalReadyToDispatchQty: number;
  totalReadyToDispatchPcs: number;
  totalReadyToDispatchCartons: number;
  totalPendingQty: number;
  totalPendingPcs: number;
  totalPendingCartons: number;
  totalToPackQty: number;
  totalToPackPcs: number;
  totalToPackCartons: number;
  fulfillmentPct: number;
  items: ReconciledSocItemOutput[];
}

/**
 * Reconciles a customer's SOC contracts across shared FG items so that when an earlier
 * Delivered/dispatched SOC consumed stock from Opening Stock or another SOC of the same
 * customer+item, that shortfall is transferred cleanly rather than double-counted.
 * Guarantees: Packed - Dispatched == physical Ready to Dispatch FG stock with exact integer PCS & CTN.
 */
export function reconcileCustomerSocContracts(rawSocs: ReconcilableSocInput[]): ReconciledSocOutput[] {
  // Deep-clone working state so input is not mutated
  const working = rawSocs.map((soc) => {
    const isDelivered =
      String(soc.status || '').toUpperCase() === 'DELIVERED' ||
      String(soc.status || '').toUpperCase() === 'CLOSED';
    const filteredItems = soc.isOfficialOrder
      ? soc.items.filter((it) => it.isOrderItem || it.orderedPcs > 0)
      : soc.items.filter((it) => it.orderedPcs > 0 || it.dispatchedPcs > 0 || it.packedPcs > 0);
    return {
      ...soc,
      isDelivered,
      items: filteredItems.map((it) => ({
        ...it,
        orderedPcs: Math.round(it.orderedPcs || 0),
        packedPcs: Math.round(it.packedPcs || 0),
        dispatchedPcs: isDelivered
          ? Math.max(Math.round(it.dispatchedPcs || 0), Math.round(it.orderedPcs || 0))
          : Math.round(it.dispatchedPcs || 0),
        pcsPerCarton: it.pcsPerCarton > 0 ? it.pcsPerCarton : resolveExactPcsPerCarton(it.grossPerCarton, it.itemCode, it.itemName),
        grossPerCarton: it.grossPerCarton > 0 ? it.grossPerCarton : 10,
      })),
    };
  });

  // Cross-SOC shortfall reallocation per item code:
  // If an earlier Delivered or dispatched SOC has dispatchedPcs > packedPcs (e.g. stock shipped from Opening Stock tagged to another SOC),
  // draw that shortfall from other SOCs of the same customer+item that have undispatched packed surplus.
  const itemCodes = new Set<string>();
  for (const soc of working) {
    for (const it of soc.items) {
      itemCodes.add(normCodeKey(it.itemCode));
    }
  }

  for (const itemKey of itemCodes) {
    const entries: Array<{ soc: (typeof working)[number]; item: (typeof working)[number]['items'][number] }> = [];
    for (const soc of working) {
      for (const it of soc.items) {
        if (normCodeKey(it.itemCode) === itemKey) {
          entries.push({ soc, item: it });
        }
      }
    }
    if (entries.length < 2) continue;

    // Process Delivered / older SOCs needing packed stock first
    const needers = entries
      .filter((e) => e.item.dispatchedPcs > e.item.packedPcs)
      .sort((a, b) => Number(b.soc.isDelivered) - Number(a.soc.isDelivered));

    for (const needer of needers) {
      let deficit = needer.item.dispatchedPcs - needer.item.packedPcs;
      if (deficit <= 0) continue;

      for (const donor of entries) {
        if (donor === needer || deficit <= 0) continue;
        const surplus = Math.max(0, donor.item.packedPcs - donor.item.dispatchedPcs);
        if (surplus <= 0) continue;
        const take = Math.min(deficit, surplus);
        donor.item.packedPcs -= take;
        needer.item.packedPcs += take;
        deficit -= take;
      }
    }
  }

  // Finalize exact GRS, CTN, PCS, Ready to Dispatch, and Remaining Order Balance
  const finalized: ReconciledSocOutput[] = working.map((soc) => {
    const items: ReconciledSocItemOutput[] = soc.items.map((it) => {
      const orderedPcs = Math.max(0, Math.round(it.orderedPcs));
      const dispatchedPcs = Math.max(0, Math.round(it.dispatchedPcs));
      let packedPcs = Math.max(0, Math.round(it.packedPcs));
      if (soc.isDelivered) {
        packedPcs = Math.max(packedPcs, dispatchedPcs, orderedPcs);
      } else if (packedPcs < dispatchedPcs) {
        // Physically dispatched goods must have been packed first
        packedPcs = dispatchedPcs;
      }

      const readyToDispatchPcs = soc.isDelivered ? 0 : Math.max(0, packedPcs - dispatchedPcs);
      const remainingPendingPcs = soc.isDelivered ? 0 : Math.max(0, orderedPcs - dispatchedPcs);
      const toPackPcs = soc.isDelivered ? 0 : Math.max(0, orderedPcs - packedPcs);

      const pcsPerCarton = it.pcsPerCarton > 0 ? it.pcsPerCarton : 1440;
      const toGrs = (pcs: number) => Math.round((pcs / 144) * 100) / 100;
      const toCtn = (pcs: number) => snapFloat(pcs / pcsPerCarton);

      const itemPct =
        orderedPcs > 0
          ? Math.min(100, Math.round((dispatchedPcs / orderedPcs) * 100))
          : dispatchedPcs > 0
          ? 100
          : 0;

      return {
        key: it.key,
        itemCode: it.itemCode,
        itemName: it.itemName,
        orderedQty: toGrs(orderedPcs),
        orderedPcs,
        orderedCartons: toCtn(orderedPcs),
        packedQty: toGrs(packedPcs),
        packedPcs,
        packedCartons: toCtn(packedPcs),
        dispatchedQty: toGrs(dispatchedPcs),
        dispatchedPcs,
        dispatchedCartons: toCtn(dispatchedPcs),
        readyToDispatchQty: toGrs(readyToDispatchPcs),
        readyToDispatchPcs,
        readyToDispatchCartons: toCtn(readyToDispatchPcs),
        remainingPendingQty: toGrs(remainingPendingPcs),
        remainingPendingPcs,
        remainingPendingCartons: toCtn(remainingPendingPcs),
        toPackQty: toGrs(toPackPcs),
        toPackPcs,
        toPackCartons: toCtn(toPackPcs),
        pcsPerCarton,
        grossPerCarton: it.grossPerCarton,
        fulfillmentPct: soc.isDelivered ? 100 : itemPct,
        isOrderItem: it.isOrderItem,
      };
    });

    const totalOrderedPcs = items.reduce((s, i) => s + i.orderedPcs, 0);
    const totalPackedPcs = items.reduce((s, i) => s + i.packedPcs, 0);
    const totalDispatchedPcs = items.reduce((s, i) => s + i.dispatchedPcs, 0);
    const totalReadyToDispatchPcs = items.reduce((s, i) => s + i.readyToDispatchPcs, 0);
    const totalPendingPcs = items.reduce((s, i) => s + i.remainingPendingPcs, 0);
    const totalToPackPcs = items.reduce((s, i) => s + i.toPackPcs, 0);

    const totalOrderedCartons = snapFloat(items.reduce((s, i) => s + i.orderedCartons, 0));
    const totalPackedCartons = snapFloat(items.reduce((s, i) => s + i.packedCartons, 0));
    const totalDispatchedCartons = snapFloat(items.reduce((s, i) => s + i.dispatchedCartons, 0));
    const totalReadyToDispatchCartons = snapFloat(items.reduce((s, i) => s + i.readyToDispatchCartons, 0));
    const totalPendingCartons = snapFloat(items.reduce((s, i) => s + i.remainingPendingCartons, 0));
    const totalToPackCartons = snapFloat(items.reduce((s, i) => s + i.toPackCartons, 0));

    const toGrs = (pcs: number) => Math.round((pcs / 144) * 100) / 100;
    const totalOrderedQty = toGrs(totalOrderedPcs);
    const totalPackedQty = toGrs(totalPackedPcs);
    const totalDispatchedQty = toGrs(totalDispatchedPcs);
    const totalReadyToDispatchQty = toGrs(totalReadyToDispatchPcs);
    const totalPendingQty = soc.isDelivered ? 0 : toGrs(totalPendingPcs);
    const totalToPackQty = soc.isDelivered ? 0 : toGrs(totalToPackPcs);

    const socPct = soc.isDelivered
      ? 100
      : totalOrderedPcs > 0
      ? Math.min(100, Math.round((totalDispatchedPcs / totalOrderedPcs) * 100))
      : totalDispatchedPcs > 0
      ? 100
      : 0;

    return {
      orderId: soc.orderId,
      socNumber: soc.socNumber,
      orderDate: soc.orderDate,
      status: soc.status,
      isOfficialOrder: soc.isOfficialOrder,
      totalOrderedQty,
      totalOrderedPcs,
      totalOrderedCartons,
      totalPackedQty,
      totalPackedPcs,
      totalPackedCartons,
      totalDispatchedQty,
      totalDispatchedPcs,
      totalDispatchedCartons,
      totalReadyToDispatchQty,
      totalReadyToDispatchPcs,
      totalReadyToDispatchCartons,
      totalPendingQty,
      totalPendingPcs,
      totalPendingCartons,
      totalToPackQty,
      totalToPackPcs,
      totalToPackCartons,
      fulfillmentPct: socPct,
      items,
    };
  });

  finalized.sort((a, b) => b.totalPendingQty - a.totalPendingQty);
  return finalized;
}
