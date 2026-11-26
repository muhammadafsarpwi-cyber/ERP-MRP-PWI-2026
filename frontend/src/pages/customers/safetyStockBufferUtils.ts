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

export const SPOKE_DIVISION_DEFAULT_ID = 'd1000000-0000-0000-0000-000000000001';
export const SPOKE_DIVISION_DEFAULT_CODE = 'DIV-001-SPI';

const normCodeKey = (val: string): string => (val || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function isSpokeDivisionRecord(
  division?: { id?: string | null; divisionCode?: string | null; name?: string | null } | null,
): boolean {
  if (!division) return false;
  const code = String(division.divisionCode || '').trim().toUpperCase();
  const name = String(division.name || '').trim().toLowerCase();
  return (
    division.id === SPOKE_DIVISION_DEFAULT_ID ||
    code === 'DIV-001-SPI' ||
    code === 'DIV-SPD' ||
    code.includes('SPI') ||
    name.includes('spoke')
  );
}

export function resolveDefaultAnalyticsDivision(
  divisions: DivisionOptionRecord[],
): DivisionOptionRecord | null {
  const list = divisions || [];
  if (list.length === 0) return null;
  return (
    list.find((d) => String(d.divisionCode || '').trim().toUpperCase() === SPOKE_DIVISION_DEFAULT_CODE) ||
    list.find((d) => d.id === SPOKE_DIVISION_DEFAULT_ID) ||
    list.find((d) => isSpokeDivisionRecord(d)) ||
    list[0] ||
    null
  );
}

export function resolveDivisionPrimaryUom(
  division?: { id?: string | null; divisionCode?: string | null; name?: string | null } | null,
): string {
  if (!division) return '';
  const code = String(division.divisionCode || '').trim().toUpperCase();
  const name = String(division.name || '').trim().toLowerCase();
  if (isSpokeDivisionRecord(division)) return 'GRS';
  if (code.includes('CCD') || name.includes('control cable') || name.includes('cable')) return 'M';
  if (code.includes('WRD') || name.includes('wrd') || name.includes('wire')) return 'KG';
  return '';
}

export function resolveDivisionDefaultPackagingUnit(
  division?: { id?: string | null; divisionCode?: string | null; name?: string | null } | null,
): string {
  const uom = resolveDivisionPrimaryUom(division);
  if (uom === 'GRS') return 'CTN';
  if (uom === 'M') return 'COIL';
  if (uom === 'KG') return 'ROLL';
  return 'PKG';
}

export function matchesDivisionFilter(
  recordDivision: { divisionId?: string | null; divisionCode?: string | null; divisionName?: string | null },
  selectedDivisionId: string,
  divisions: DivisionOptionRecord[] = [],
): boolean {
  if (!selectedDivisionId || selectedDivisionId === 'ALL') return true;
  if (recordDivision.divisionId && recordDivision.divisionId === selectedDivisionId) return true;
  if (recordDivision.divisionCode && recordDivision.divisionCode === selectedDivisionId) return true;

  const selectedDiv = divisions.find(
    (d) => d.id === selectedDivisionId || d.divisionCode === selectedDivisionId,
  );
  if (!selectedDiv) return false;

  if (
    selectedDiv.divisionCode &&
    recordDivision.divisionCode &&
    normCodeKey(selectedDiv.divisionCode) === normCodeKey(recordDivision.divisionCode)
  ) {
    return true;
  }
  if (
    selectedDiv.name &&
    recordDivision.divisionName &&
    normCodeKey(selectedDiv.name) === normCodeKey(recordDivision.divisionName)
  ) {
    return true;
  }
  if (isSpokeDivisionRecord(selectedDiv) && isSpokeDivisionRecord(recordDivision)) {
    return true;
  }
  return false;
}

export interface AnalyticsUomBucket {
  unitCode: string;
  value: number;
  decimals: number;
}

export function summarizeUomBuckets(
  entries: Array<{ unitCode?: string | null; qty: number }>,
): AnalyticsUomBucket[] {
  const totals = new Map<string, number>();
  for (const e of entries || []) {
    const qty = Number(e.qty) || 0;
    const unit = normalizeUomCode(e.unitCode);
    if (!unit || qty <= 0) continue;
    totals.set(unit, (totals.get(unit) || 0) + qty);
  }
  const priority = ['GRS', 'M', 'KG', 'PCS', 'FT'];
  return Array.from(totals.entries())
    .sort((a, b) => {
      const ia = priority.indexOf(a[0]);
      const ib = priority.indexOf(b[0]);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a[0].localeCompare(b[0]);
    })
    .map(([unitCode, total]) => {
      const clean = cleanDisplayNumber(total);
      return { unitCode, value: clean.value, decimals: clean.decimals };
    });
}

export function formatUomBreakdownDisplay(
  buckets: AnalyticsUomBucket[],
  fmt: (val: number, decimals?: number) => string,
  fallbackUnit = '',
): { text: string; suffix?: string } {
  const nonEmpty = (buckets || []).filter((b) => b.value > 0);
  if (nonEmpty.length === 0) {
    return { text: '0', suffix: fallbackUnit || undefined };
  }
  if (nonEmpty.length === 1) {
    return {
      text: fmt(nonEmpty[0].value, nonEmpty[0].decimals),
      suffix: nonEmpty[0].unitCode,
    };
  }
  return {
    text: nonEmpty.map((b) => `${fmt(b.value, b.decimals)} ${b.unitCode}`).join(' · '),
    suffix: undefined,
  };
}

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

/**
 * Canonicalizes Sales Order Contract numbers so legacy 4-digit references
 * (`SOC-2026-5810`, `soc20265810`) match 5-digit padded contracts (`SOC-2026-05810`).
 */
export function canonicalizeSocKey(raw?: string | null): string {
  const trimmed = String(raw || '').trim().toUpperCase();
  if (!trimmed || trimmed === '—' || trimmed === 'NULL' || trimmed === 'UNDEFINED') return '';
  const m = trimmed.match(/SOC[-_\s]*(\d{2,4})[-_\s]*0*(\d+)/i);
  if (m) return `SOC-${m[1]}-${m[2]}`;
  return trimmed.replace(/[^A-Z0-9]/g, '');
}

/**
 * Returns true when `raw` names a concrete Sales Order / SOC identifier rather than
 * empty/placeholder/Safety Stock buffer markers (`SAFETY_STOCK`, `—`, etc.).
 */
export function isExplicitRealSocToken(raw?: string | null): boolean {
  const trimmed = String(raw || '').trim();
  if (!trimmed || trimmed === '—') return false;
  const upper = trimmed.toUpperCase();
  if (
    upper.includes('SAFETY') ||
    upper.includes('BUFFER') ||
    upper.includes('UNALLOCATED') ||
    upper === 'GENERAL' ||
    upper === 'NONE' ||
    upper === 'N/A'
  ) {
    return false;
  }
  return /SOC[-_\s]*\d{2,4}[-_\s]*\d+/i.test(trimmed) || /^SOC[-_\s]*[A-Z0-9-]+/i.test(trimmed);
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
  primaryUom?: string;
  packagingUnitCode?: string;
  isGrossUnit?: boolean;
  orderedQtyRaw?: number;
  packedQtyRaw?: number;
  dispatchedQtyRaw?: number;
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
  primaryUom?: string;
  packagingUnitCode?: string;
  isGrossUnit?: boolean;
}

export interface ReconcilableSocInput {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
  isOfficialOrder?: boolean;
  primaryUom?: string;
  packagingUnitCode?: string;
  items: ReconcilableSocItemInput[];
}

export interface ReconciledSocOutput {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
  isOfficialOrder?: boolean;
  primaryUom?: string;
  packagingUnitCode?: string;
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
 * Guarantees: Packed - Dispatched == physical Ready to Dispatch FG stock.
 * Supports both GRS/PCS/CTN items and non-GRS metric/weight units (e.g. M/COIL, KG/ROLL).
 */
export function reconcileCustomerSocContracts(rawSocs: ReconcilableSocInput[]): ReconciledSocOutput[] {
  // Deep-clone working state so input is not mutated.
  // For non-GRS items (M, KG, etc.), convert native units to integer centi-units (* 100) for exact transfer math.
  const working = rawSocs.map((soc) => {
    const isDelivered =
      String(soc.status || '').toUpperCase() === 'DELIVERED' ||
      String(soc.status || '').toUpperCase() === 'CLOSED';
    const filteredItems = soc.isOfficialOrder
      ? soc.items.filter(
          (it) =>
            it.isOrderItem ||
            it.orderedPcs > 0 ||
            Number(it.orderedQtyRaw || 0) > 0,
        )
      : soc.items.filter(
          (it) =>
            it.orderedPcs > 0 ||
            it.dispatchedPcs > 0 ||
            it.packedPcs > 0 ||
            Number(it.orderedQtyRaw || 0) > 0 ||
            Number(it.dispatchedQtyRaw || 0) > 0 ||
            Number(it.packedQtyRaw || 0) > 0,
        );
    return {
      ...soc,
      isDelivered,
      items: filteredItems.map((it) => {
        const uomUpper = normalizeUomCode(it.primaryUom || soc.primaryUom);
        const isGross =
          it.isGrossUnit !== undefined
            ? it.isGrossUnit
            : !uomUpper || uomUpper === 'GRS' || uomUpper === 'PCS';

        if (isGross) {
          const orderedUnits = Math.round(it.orderedPcs || 0);
          const packedUnits = Math.round(it.packedPcs || 0);
          const dispatchedUnits = isDelivered
            ? Math.max(Math.round(it.dispatchedPcs || 0), orderedUnits)
            : Math.round(it.dispatchedPcs || 0);
          return {
            ...it,
            isGrossUnit: true,
            primaryUom: uomUpper || 'GRS',
            packagingUnitCode: normalizeUomCode(it.packagingUnitCode) || 'CTN',
            orderedUnits,
            packedUnits,
            dispatchedUnits,
            pcsPerCarton: it.pcsPerCarton > 0 ? it.pcsPerCarton : resolveExactPcsPerCarton(it.grossPerCarton, it.itemCode, it.itemName),
            grossPerCarton: it.grossPerCarton > 0 ? it.grossPerCarton : 10,
          };
        }

        const orderedUnits = Math.round(Number(it.orderedQtyRaw || 0) * 100);
        const packedUnits = Math.round(Number(it.packedQtyRaw || 0) * 100);
        const rawDispatchedUnits = Math.round(Number(it.dispatchedQtyRaw || 0) * 100);
        const dispatchedUnits = isDelivered
          ? Math.max(rawDispatchedUnits, orderedUnits)
          : rawDispatchedUnits;
        return {
          ...it,
          isGrossUnit: false,
          primaryUom: uomUpper || 'UNIT',
          packagingUnitCode: normalizeUomCode(it.packagingUnitCode) || 'PKG',
          orderedUnits,
          packedUnits,
          dispatchedUnits,
          pcsPerCarton: 0,
          grossPerCarton: it.grossPerCarton > 0 ? it.grossPerCarton : 0,
        };
      }),
    };
  });

  // Cross-SOC shortfall reallocation per item code
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

    const needers = entries
      .filter((e) => e.item.dispatchedUnits > e.item.packedUnits)
      .sort((a, b) => Number(b.soc.isDelivered) - Number(a.soc.isDelivered));

    for (const needer of needers) {
      let deficit = needer.item.dispatchedUnits - needer.item.packedUnits;
      if (deficit <= 0) continue;

      for (const donor of entries) {
        if (donor === needer || deficit <= 0) continue;
        const surplus = Math.max(0, donor.item.packedUnits - donor.item.dispatchedUnits);
        if (surplus <= 0) continue;
        const take = Math.min(deficit, surplus);
        donor.item.packedUnits -= take;
        needer.item.packedUnits += take;
        deficit -= take;
      }
    }
  }

  // Finalize exact quantities, packaging counts, Ready to Dispatch, and Remaining Order Balance
  const finalized: ReconciledSocOutput[] = working.map((soc) => {
    const items: ReconciledSocItemOutput[] = soc.items.map((it) => {
      const orderedUnits = Math.max(0, Math.round(it.orderedUnits));
      const dispatchedUnits = Math.max(0, Math.round(it.dispatchedUnits));
      let packedUnits = Math.max(0, Math.round(it.packedUnits));
      if (soc.isDelivered) {
        packedUnits = Math.max(packedUnits, dispatchedUnits, orderedUnits);
      } else if (packedUnits < dispatchedUnits) {
        packedUnits = dispatchedUnits;
      }

      const readyUnits = soc.isDelivered ? 0 : Math.max(0, packedUnits - dispatchedUnits);
      const remainingUnits = soc.isDelivered ? 0 : Math.max(0, orderedUnits - dispatchedUnits);
      const toPackUnits = soc.isDelivered ? 0 : Math.max(0, orderedUnits - packedUnits);

      const itemPct =
        orderedUnits > 0
          ? Math.min(100, Math.round((dispatchedUnits / orderedUnits) * 100))
          : dispatchedUnits > 0
          ? 100
          : 0;

      if (it.isGrossUnit) {
        const pcsPerCarton = it.pcsPerCarton > 0 ? it.pcsPerCarton : 1440;
        const toGrs = (pcs: number) => Math.round((pcs / 144) * 100) / 100;
        const round2 = (n: number) => Math.round(n * 100) / 100;
        const toCtn = (pcs: number) => snapFloat(pcs / pcsPerCarton);

        const hasRawOrdered = it.orderedQtyRaw !== undefined && Number(it.orderedQtyRaw) > 0;
        const hasRawDispatched =
          it.dispatchedQtyRaw !== undefined &&
          (hasRawOrdered || Number(it.dispatchedQtyRaw) > 0);

        const orderedQty = hasRawOrdered ? round2(Number(it.orderedQtyRaw)) : toGrs(orderedUnits);
        const rawDispQty = hasRawDispatched
          ? round2(Number(it.dispatchedQtyRaw || 0))
          : toGrs(dispatchedUnits);
        const dispatchedQty = soc.isDelivered ? Math.max(rawDispQty, orderedQty) : rawDispQty;
        const readyToDispatchQty = toGrs(readyUnits);
        const rawPackedGrs = toGrs(packedUnits);
        const packedQty = soc.isDelivered
          ? Math.max(rawPackedGrs, dispatchedQty, orderedQty)
          : Math.max(rawPackedGrs, dispatchedQty);
        const remainingPendingQty = soc.isDelivered
          ? 0
          : Math.max(0, round2(orderedQty - dispatchedQty));
        const toPackQty = soc.isDelivered
          ? 0
          : hasRawOrdered
          ? Math.max(0, round2(remainingPendingQty - readyToDispatchQty))
          : toGrs(toPackUnits);

        return {
          key: it.key,
          itemCode: it.itemCode,
          itemName: it.itemName,
          orderedQty,
          orderedPcs: orderedUnits,
          orderedCartons: toCtn(orderedUnits),
          packedQty,
          packedPcs: packedUnits,
          packedCartons: toCtn(packedUnits),
          dispatchedQty,
          dispatchedPcs: dispatchedUnits,
          dispatchedCartons: toCtn(dispatchedUnits),
          readyToDispatchQty,
          readyToDispatchPcs: readyUnits,
          readyToDispatchCartons: toCtn(readyUnits),
          remainingPendingQty,
          remainingPendingPcs: remainingUnits,
          remainingPendingCartons: toCtn(remainingUnits),
          toPackQty,
          toPackPcs: toPackUnits,
          toPackCartons: toCtn(toPackUnits),
          pcsPerCarton,
          grossPerCarton: it.grossPerCarton,
          fulfillmentPct: soc.isDelivered ? 100 : itemPct,
          isOrderItem: it.isOrderItem,
          primaryUom: it.primaryUom || 'GRS',
          packagingUnitCode: it.packagingUnitCode || 'CTN',
          isGrossUnit: true,
        };
      }

      const toNative = (centi: number) => Math.round(centi) / 100;
      const pkgSize = it.grossPerCarton > 0 ? it.grossPerCarton : 0;
      const toPkg = (centi: number) => (pkgSize > 0 ? snapFloat((centi / 100) / pkgSize) : 0);

      return {
        key: it.key,
        itemCode: it.itemCode,
        itemName: it.itemName,
        orderedQty: toNative(orderedUnits),
        orderedPcs: 0,
        orderedCartons: toPkg(orderedUnits),
        packedQty: toNative(packedUnits),
        packedPcs: 0,
        packedCartons: toPkg(packedUnits),
        dispatchedQty: toNative(dispatchedUnits),
        dispatchedPcs: 0,
        dispatchedCartons: toPkg(dispatchedUnits),
        readyToDispatchQty: toNative(readyUnits),
        readyToDispatchPcs: 0,
        readyToDispatchCartons: toPkg(readyUnits),
        remainingPendingQty: toNative(remainingUnits),
        remainingPendingPcs: 0,
        remainingPendingCartons: toPkg(remainingUnits),
        toPackQty: toNative(toPackUnits),
        toPackPcs: 0,
        toPackCartons: toPkg(toPackUnits),
        pcsPerCarton: 0,
        grossPerCarton: pkgSize,
        fulfillmentPct: soc.isDelivered ? 100 : itemPct,
        isOrderItem: it.isOrderItem,
        primaryUom: it.primaryUom,
        packagingUnitCode: it.packagingUnitCode,
        isGrossUnit: false,
      };
    });

    const socUom = soc.primaryUom || items[0]?.primaryUom || 'GRS';
    const socPkgUom = soc.packagingUnitCode || items[0]?.packagingUnitCode || 'CTN';

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

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Sum reconciled item quantities directly so SOC totals, customer totals, item totals,
    // and top KPIs match down to the exact unit across CS (10.556), regular (10), and non-GRS items.
    const totalOrderedQty = round2(items.reduce((s, i) => s + i.orderedQty, 0));
    const totalPackedQty = round2(items.reduce((s, i) => s + i.packedQty, 0));
    const totalDispatchedQty = round2(items.reduce((s, i) => s + i.dispatchedQty, 0));
    const totalReadyToDispatchQty = round2(items.reduce((s, i) => s + i.readyToDispatchQty, 0));
    const totalPendingQty = soc.isDelivered
      ? 0
      : round2(items.reduce((s, i) => s + i.remainingPendingQty, 0));
    const totalToPackQty = soc.isDelivered
      ? 0
      : round2(items.reduce((s, i) => s + i.toPackQty, 0));

    const socPct = soc.isDelivered
      ? 100
      : totalOrderedQty > 0
      ? Math.min(100, Math.round((totalDispatchedQty / totalOrderedQty) * 100))
      : totalDispatchedQty > 0
      ? 100
      : 0;

    return {
      orderId: soc.orderId,
      socNumber: soc.socNumber,
      orderDate: soc.orderDate,
      status: soc.status,
      isOfficialOrder: soc.isOfficialOrder,
      primaryUom: socUom,
      packagingUnitCode: socPkgUom,
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

export interface UnifiedItemCustomerRef {
  customerId: string;
  customerName: string;
  customerCode: string;
}

export interface UnifiedItemRollupRecord {
  itemCode: string;
  itemName: string;
  totalGross: number;
  totalPieces: number;
  totalCartons: number;
  totalOrderedKgs: number;
  readyFgrGross: number;
  readyFgrPieces: number;
  readyFgrCartons: number;
  readyFgrKgs: number;
  balancePendingGross: number;
  balancePendingPieces: number;
  balancePendingCartons: number;
  balancePendingKgs: number;
  totalPackedGross: number;
  totalPackedCartons: number;
  totalDispatchedGross: number;
  totalDispatchedCartons: number;
  undispatchedGross: number;
  undispatchedPieces: number;
  undispatchedCartons: number;
  undispatchedKgs: number;
  weightPerPiece: number;
  grossPerCarton: number;
  customerCount: number;
  customerNames: string[];
  customers: UnifiedItemCustomerRef[];
  primaryUom: string;
  packagingUnitCode: string;
  isGrossUnit: boolean;
  warehouseFgrGross?: number;
}

/**
 * Single Unified Item Rollup derived strictly from reconciled regular customer SOC items.
 * Guarantees 100% mathematical parity across Top KPI Cards, Top Customers/Items Charts,
 * Customer Cards, Item Cards, and SOC Modals.
 */
export function buildUnifiedItemRollupFromCustomers(params: {
  regularCustomers: Array<{
    id: string;
    customerCode: string;
    name: string;
    socContracts?: ReconciledSocOutput[];
  }>;
  preSeedCatalog?: Array<{ itemCode: string; name: string; packagingSize?: number }>;
  resolveStandardCode?: (code: string, name: string) => { code: string; name: string; packagingSize?: number };
  resolveMeta?: (code: string, name: string) => {
    weightPerPiece?: number;
    packagingSize?: number;
    matrixFgrGross?: number;
    matrixFgrNative?: number;
  } | undefined;
  inferDefaultWpp?: (code: string, name: string) => number;
}): UnifiedItemRollupRecord[] {
  const {
    regularCustomers,
    preSeedCatalog = [],
    resolveStandardCode,
    resolveMeta,
    inferDefaultWpp,
  } = params;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const round1 = (n: number) => Math.round(n * 10) / 10;

  const map = new Map<string, UnifiedItemRollupRecord & { _custIds: Set<string>; _dispatchedPieces: number }>();

  const ensureEntry = (
    itemCode: string,
    itemName: string,
    grossPerCarton: number,
    primaryUom: string,
    packagingUnitCode: string,
    isGrossUnit: boolean,
  ) => {
    const res = resolveStandardCode ? resolveStandardCode(itemCode, itemName) : { code: itemCode, name: itemName };
    const key = res.code || itemCode || itemName;
    if (!map.has(key)) {
      const meta = resolveMeta ? resolveMeta(key, res.name || itemName) : undefined;
      const wpp =
        Number(meta?.weightPerPiece) > 0
          ? Number(meta?.weightPerPiece)
          : isGrossUnit && inferDefaultWpp
          ? inferDefaultWpp(key, res.name || itemName)
          : 0;
      const pkg =
        grossPerCarton > 0
          ? grossPerCarton
          : Number(res.packagingSize) > 0
          ? Number(res.packagingSize)
          : Number(meta?.packagingSize) > 0
          ? Number(meta?.packagingSize)
          : isGrossUnit
          ? 10
          : 0;
      const whFgr = isGrossUnit
        ? round2(Number(meta?.matrixFgrGross || 0))
        : round2(Number(meta?.matrixFgrNative || 0));

      map.set(key, {
        itemCode: key,
        itemName: res.name || itemName,
        totalGross: 0,
        totalPieces: 0,
        totalCartons: 0,
        totalOrderedKgs: 0,
        readyFgrGross: 0,
        readyFgrPieces: 0,
        readyFgrCartons: 0,
        readyFgrKgs: 0,
        balancePendingGross: 0,
        balancePendingPieces: 0,
        balancePendingCartons: 0,
        balancePendingKgs: 0,
        totalPackedGross: 0,
        totalPackedCartons: 0,
        totalDispatchedGross: 0,
        totalDispatchedCartons: 0,
        undispatchedGross: 0,
        undispatchedPieces: 0,
        undispatchedCartons: 0,
        undispatchedKgs: 0,
        weightPerPiece: wpp,
        grossPerCarton: pkg,
        customerCount: 0,
        customerNames: [],
        customers: [],
        primaryUom: primaryUom || (isGrossUnit ? 'GRS' : 'UNIT'),
        packagingUnitCode: packagingUnitCode || (isGrossUnit ? 'CTN' : 'PKG'),
        isGrossUnit,
        warehouseFgrGross: whFgr,
        _custIds: new Set<string>(),
        _dispatchedPieces: 0,
      });
    }
    return map.get(key)!;
  };

  for (const std of preSeedCatalog) {
    ensureEntry(std.itemCode, std.name, std.packagingSize || 10, 'GRS', 'CTN', true);
  }

  for (const cust of regularCustomers) {
    for (const soc of cust.socContracts || []) {
      for (const sIt of soc.items || []) {
        const isGross = sIt.isGrossUnit !== false;
        const entry = ensureEntry(
          sIt.itemCode,
          sIt.itemName,
          sIt.grossPerCarton,
          sIt.primaryUom || soc.primaryUom || (isGross ? 'GRS' : 'UNIT'),
          sIt.packagingUnitCode || soc.packagingUnitCode || (isGross ? 'CTN' : 'PKG'),
          isGross,
        );
        if (sIt.grossPerCarton > 0 && entry.grossPerCarton <= 0) {
          entry.grossPerCarton = sIt.grossPerCarton;
        }

        entry.totalGross += Number(sIt.orderedQty || 0);
        entry.totalPieces += Number(sIt.orderedPcs || 0);
        entry.totalCartons += Number(sIt.orderedCartons || 0);

        entry.totalPackedGross += Number(sIt.packedQty || 0);
        entry.totalPackedCartons += Number(sIt.packedCartons || 0);

        entry.totalDispatchedGross += Number(sIt.dispatchedQty || 0);
        entry._dispatchedPieces += Number(sIt.dispatchedPcs || 0);
        entry.totalDispatchedCartons += Number(sIt.dispatchedCartons || 0);

        entry.readyFgrGross += Number(sIt.readyToDispatchQty || 0);
        entry.readyFgrPieces += Number(sIt.readyToDispatchPcs || 0);
        entry.readyFgrCartons += Number(sIt.readyToDispatchCartons || 0);

        entry.undispatchedGross += Number(sIt.remainingPendingQty || 0);
        entry.undispatchedPieces += Number(sIt.remainingPendingPcs || 0);
        entry.undispatchedCartons += Number(sIt.remainingPendingCartons || 0);

        entry.balancePendingGross += Number(sIt.toPackQty || 0);
        entry.balancePendingPieces += Number(sIt.toPackPcs || 0);
        entry.balancePendingCartons += Number(sIt.toPackCartons || 0);

        const cid = cust.id || cust.name;
        if (cid && !entry._custIds.has(cid)) {
          entry._custIds.add(cid);
          entry.customerCount += 1;
          if (cust.name && !entry.customerNames.includes(cust.name)) {
            entry.customerNames.push(cust.name);
          }
          entry.customers.push({
            customerId: cid,
            customerName: cust.name,
            customerCode: cust.customerCode,
          });
        }
      }
    }
  }

  return Array.from(map.values())
    .map(({ _custIds, _dispatchedPieces, ...entry }) => {
      const wpp = entry.weightPerPiece || 0;
      const totalGross = round2(entry.totalGross);
      const totalDispatchedGross = round2(entry.totalDispatchedGross);
      const totalPackedGross = round2(entry.totalPackedGross);
      const readyFgrGross = round2(entry.readyFgrGross);
      const undispatchedGross = round2(entry.undispatchedGross);
      const balancePendingGross = round2(entry.balancePendingGross);

      return {
        ...entry,
        totalGross,
        totalCartons: snapFloat(entry.totalCartons),
        totalOrderedKgs: entry.isGrossUnit
          ? round1(entry.totalPieces * wpp)
          : entry.primaryUom === 'KG'
          ? totalGross
          : 0,
        totalPackedGross,
        totalPackedCartons: snapFloat(entry.totalPackedCartons),
        totalDispatchedGross,
        totalDispatchedCartons: snapFloat(entry.totalDispatchedCartons),
        readyFgrGross,
        readyFgrCartons: snapFloat(entry.readyFgrCartons),
        readyFgrKgs: entry.isGrossUnit
          ? round1(entry.readyFgrPieces * wpp)
          : entry.primaryUom === 'KG'
          ? readyFgrGross
          : 0,
        undispatchedGross,
        undispatchedCartons: snapFloat(entry.undispatchedCartons),
        undispatchedKgs: entry.isGrossUnit
          ? round1(entry.undispatchedPieces * wpp)
          : entry.primaryUom === 'KG'
          ? undispatchedGross
          : 0,
        balancePendingGross,
        balancePendingCartons: snapFloat(entry.balancePendingCartons),
        balancePendingKgs: entry.isGrossUnit
          ? round1(entry.balancePendingPieces * wpp)
          : entry.primaryUom === 'KG'
          ? balancePendingGross
          : 0,
      };
    })
    .sort((a, b) => a.itemCode.localeCompare(b.itemCode, undefined, { numeric: true }));
}
