import {
  getCurrentFiscalYearInfo,
  getFiscalQuarterInfo,
  getPreviousFiscalQuarterInfo,
  getPreviousFiscalYearInfo,
  toIsoYmd,
} from '../../utils/fiscalYear';
import { resolvePackConfig } from './orderCommandFilters.util';
import { formatDecimal } from '../../utils/numberFormat';

export type DispatchMatrixPeriodPreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'allTime'
  | 'custom';

export type DispatchMatrixViewMode = 'customer_wise' | 'item_wise';

export interface MatrixDivisionOption {
  id: string;
  divisionCode: string;
  name: string;
}

export interface MatrixCell {
  key: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  packUnitLabel: string;
  packSize: number;
  orderedQty: number;
  dispatchedInPeriodQty: number;
  packCountInPeriod: number;
  dispatchedValuePkr: number;
  cumulativeDispatchedQty: number;
  pendingBalanceQty: number;
  deliveryCount: number;
  socNumbers: string[];
  sharePct?: number;
}

export interface CustomerWiseGroupRow {
  key: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  itemCount: number;
  uomCode: string;
  packUnitLabel: string;
  orderedQty: number;
  dispatchedInPeriodQty: number;
  packCountInPeriod: number;
  dispatchedValuePkr: number;
  cumulativeDispatchedQty: number;
  pendingBalanceQty: number;
  deliveryCount: number;
  items: MatrixCell[];
}

export interface ItemWiseGroupRow {
  key: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  customerCount: number;
  uomCode: string;
  packUnitLabel: string;
  orderedQty: number;
  dispatchedInPeriodQty: number;
  packCountInPeriod: number;
  dispatchedValuePkr: number;
  cumulativeDispatchedQty: number;
  pendingBalanceQty: number;
  deliveryCount: number;
  customers: MatrixCell[];
}

export interface DispatchMatrixKpis {
  activeCustomers: number;
  itemsDispatched: number;
  periodDispatchedQty: number;
  periodPackCount: number;
  periodDispatchedValuePkr: number;
  remainingPendingQty: number;
  primaryUom: string;
  primaryPackUnit: string;
}

export interface DispatchMatrixResult {
  customerGroups: CustomerWiseGroupRow[];
  itemGroups: ItemWiseGroupRow[];
  kpis: DispatchMatrixKpis;
  availableCustomers: Array<{ id: string; code: string; name: string }>;
  availableItems: Array<{ id: string; code: string; name: string }>;
  periodLabel: string;
}

const COMMITTED_STATUSES_EXCLUDED = new Set(['DRAFT', 'CANCELLED', 'VOID', 'REJECTED']);

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export function getMatrixPeriodPresetOptions(referenceDate?: Date): Array<{
  value: DispatchMatrixPeriodPreset;
  label: string;
  subtext?: string;
}> {
  const ref = referenceDate ?? new Date();
  const thisQ = getFiscalQuarterInfo(ref);
  const lastQ = getPreviousFiscalQuarterInfo(ref);
  const thisFy = getCurrentFiscalYearInfo(ref);
  const lastFy = getPreviousFiscalYearInfo(ref);

  return [
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisQuarter', label: 'This Quarter', subtext: `${thisQ.quarterLabel} · ${thisQ.shortRange}` },
    { value: 'lastQuarter', label: 'Last Quarter', subtext: `${lastQ.quarterLabel} · ${lastQ.shortRange}` },
    { value: 'thisYear', label: 'This Year (FY Jul–Jun)', subtext: thisFy.fullLabel },
    { value: 'lastYear', label: 'Last Year (FY Jul–Jun)', subtext: lastFy.fullLabel },
    { value: 'allTime', label: 'All Time' },
    { value: 'custom', label: 'Custom Range' },
  ];
}

export function resolveMatrixDateRange(
  preset: DispatchMatrixPeriodPreset,
  customRange?: [string, string] | null,
  referenceDate?: Date,
): { dateFrom?: string; dateTo?: string; label: string } {
  const ref = referenceDate ?? new Date();
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  switch (preset) {
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { dateFrom: toIsoYmd(start), dateTo: toIsoYmd(end), label: 'This Month' };
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: toIsoYmd(start), dateTo: toIsoYmd(end), label: 'Last Month' };
    }
    case 'thisQuarter': {
      const q = getFiscalQuarterInfo(today);
      return { dateFrom: q.startDate, dateTo: q.endDate, label: `This Quarter (${q.quarterLabel})` };
    }
    case 'lastQuarter': {
      const q = getPreviousFiscalQuarterInfo(today);
      return { dateFrom: q.startDate, dateTo: q.endDate, label: `Last Quarter (${q.quarterLabel})` };
    }
    case 'thisYear': {
      const fy = getCurrentFiscalYearInfo(today);
      return { dateFrom: fy.startDate, dateTo: fy.endDate, label: `This Year (${fy.fyLabel})` };
    }
    case 'lastYear': {
      const fy = getPreviousFiscalYearInfo(today);
      return { dateFrom: fy.startDate, dateTo: fy.endDate, label: `Last Year (${fy.fyLabel})` };
    }
    case 'custom': {
      if (customRange?.[0] && customRange?.[1]) {
        return {
          dateFrom: customRange[0],
          dateTo: customRange[1],
          label: `${customRange[0]} to ${customRange[1]}`,
        };
      }
      return { label: 'Custom Range' };
    }
    case 'allTime':
    default:
      return { label: 'All Time' };
  }
}

function isDateInRange(rawDate: any, dateFrom?: string, dateTo?: string): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!rawDate) return false;
  const iso = String(rawDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  if (dateFrom && iso < dateFrom) return false;
  if (dateTo && iso > dateTo) return false;
  return true;
}

function isInternalOrSafetyCustomer(name: string, code = ''): boolean {
  const n = String(name || '').trim().toLowerCase();
  const c = String(code || '').trim().toLowerCase();
  if (!n) return true;
  return (
    n.includes('safety stock') ||
    n.includes('pakistan wire industries') ||
    n.includes('demo ') ||
    c.startsWith('demo-') ||
    n === 'internal' ||
    n === 'self'
  );
}

function canonicalDivisionKey(codeOrName?: string | null, id?: string | null): string {
  const s = `${codeOrName || ''}`.trim().toUpperCase();
  const idLow = `${id || ''}`.trim().toLowerCase();
  if (!s && !idLow) return 'UNKNOWN';
  if (s === 'ALL' || idLow === 'all') return 'ALL';
  if (idLow.includes('0002') || s.includes('CCD') || s.includes('CONTROL CABLE')) return 'DIV-CCD';
  if (idLow.includes('0001') || s.includes('SPI') || s.includes('SPD') || s.includes('SPOKE')) return 'DIV-SPD';
  if (idLow.includes('0005') || s.includes('WRD') || s.includes('WIRE ROPE')) return 'DIV-WRD';
  return s || idLow.toUpperCase();
}

function stripDeliveryDescMeta(desc?: string | null): string {
  return String(desc || '')
    .replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:Cartons?|CTN|Coils?)\s*[×x*]\s*\d+(?:\.\d+)?\s*(?:GRS|M|KG)?\s*\)/gi, '')
    .replace(/\s*\[SOC:[^\]]+\]/gi, '')
    .trim();
}

function recordMatchesDivision(
  rec: any,
  selectedDivisionId: string,
  selectedDivMeta?: MatrixDivisionOption | null,
): boolean {
  if (!selectedDivisionId || selectedDivisionId === 'ALL') return true;
  const targetCanon = canonicalDivisionKey(
    `${selectedDivMeta?.divisionCode || ''} ${selectedDivMeta?.name || ''}`,
    selectedDivisionId,
  );
  const recDivId = String(rec?.divisionId || rec?.division_id || rec?.division?.id || '').trim();
  if (recDivId && recDivId.toLowerCase() === selectedDivisionId.toLowerCase()) return true;
  const recDivHint = `${rec?.division?.divisionCode || rec?.division?.code || rec?.divisionCode || ''} ${rec?.division?.name || rec?.divisionName || ''}`;
  const recCanon = canonicalDivisionKey(recDivHint, recDivId);
  if (recCanon !== 'UNKNOWN') return recCanon === targetCanon;

  // Fallback: infer division from line items / UOM / item code
  const lines = Array.isArray(rec?.lines)
    ? rec.lines
    : Array.isArray(rec?.items)
      ? rec.items
      : Array.isArray(rec?.orderItems)
        ? rec.orderItems
        : [];
  let hasCcd = false;
  let hasSpd = false;
  let hasWrd = false;
  for (const ln of lines) {
    const uom = String(ln?.uom?.code || ln?.uomCode || ln?.uom || ln?.item?.uom?.code || '').trim().toUpperCase();
    const code = String(ln?.item?.itemCode || ln?.itemCode || ln?.item_code || '').trim().toUpperCase();
    if (['M', 'MTR', 'METER', 'METERS', 'COIL', 'COILS'].includes(uom) || /^(?:CCD-|FG-CC|CC-|CAB-)/.test(code)) {
      hasCcd = true;
    } else if (['GRS', 'GROSS'].includes(uom) || /^(?:SPI-|SPK-|FG-SP)/.test(code)) {
      hasSpd = true;
    } else if (['KG', 'KGS'].includes(uom) || /^(?:WRD-|WR-)/.test(code)) {
      hasWrd = true;
    }
  }
  if (hasCcd && !hasSpd && !hasWrd) return targetCanon === 'DIV-CCD';
  if (hasSpd && !hasCcd && !hasWrd) return targetCanon === 'DIV-SPD';
  if (hasWrd && !hasCcd && !hasSpd) return targetCanon === 'DIV-WRD';
  return false;
}

export function buildCustomerItemDispatchMatrix(params: {
  orders: any[];
  deliveries: any[];
  divisions: MatrixDivisionOption[];
  divisionId: string;
  preset: DispatchMatrixPeriodPreset;
  customRange?: [string, string] | null;
  customerId?: string;
  itemId?: string;
  referenceDate?: Date;
}): DispatchMatrixResult {
  const {
    orders,
    deliveries,
    divisions,
    divisionId,
    preset,
    customRange,
    customerId,
    itemId,
    referenceDate,
  } = params;

  const selectedDivMeta = (divisions || []).find((d) => d.id === divisionId) || null;
  const divHint = selectedDivMeta ? `${selectedDivMeta.divisionCode} ${selectedDivMeta.name}` : '';
  const { dateFrom, dateTo, label: periodLabel } = resolveMatrixDateRange(preset, customRange, referenceDate);

  const isCommitted = (status: any): boolean => {
    const st = String(status || '').toUpperCase().trim();
    return !COMMITTED_STATUSES_EXCLUDED.has(st);
  };

  // Build unit price & order line lookup per (customerId, itemCode) and per (orderId, itemCode)
  const scopedOrders = (orders || []).filter(
    (o) =>
      isCommitted(o?.status) &&
      recordMatchesDivision(o, divisionId, selectedDivMeta) &&
      !isInternalOrSafetyCustomer(
        o?.customer?.companyName || o?.customer?.name || o?.customerName || '',
        o?.customer?.customerCode || o?.customerCode || '',
      ),
  );

  const scopedDeliveries = (deliveries || []).filter(
    (d) =>
      isCommitted(d?.status) &&
      recordMatchesDivision(d, divisionId, selectedDivMeta) &&
      !isInternalOrSafetyCustomer(
        d?.customer?.companyName || d?.customer?.name || d?.customerName || '',
        d?.customer?.customerCode || d?.customerCode || '',
      ),
  );

  interface CellBuilder {
    customerId: string;
    customerCode: string;
    customerName: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    uomCode: string;
    packUnitLabel: string;
    packSize: number;
    orderedQty: number;
    dispatchedInPeriodQty: number;
    packCountInPeriod: number;
    dispatchedValuePkr: number;
    cumulativeDispatchedQty: number;
    pendingBalanceQty: number;
    unitPriceHint: number;
    deliveryIds: Set<string>;
    socNumbers: Set<string>;
  }

  const cellsMap = new Map<string, CellBuilder>();
  const unitPriceByOrderItem = new Map<string, number>();
  const allCustomersMap = new Map<string, { id: string; code: string; name: string }>();
  const allItemsMap = new Map<string, { id: string; code: string; name: string }>();

  const ensureCell = (meta: {
    customerId: string;
    customerCode: string;
    customerName: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    uomCode?: string;
    packagingSize?: number | null;
    packagingUnit?: string | null;
  }): CellBuilder => {
    const normCustId = meta.customerId || meta.customerCode || meta.customerName;
    const normItemCode = String(meta.itemCode || 'ITEM').trim().toUpperCase();
    const normItemId = meta.itemId || normItemCode;
    const key = `${normCustId}::${normItemCode}`;

    if (!allCustomersMap.has(normCustId)) {
      allCustomersMap.set(normCustId, {
        id: normCustId,
        code: meta.customerCode || 'CUST',
        name: meta.customerName || 'Customer',
      });
    }
    if (!allItemsMap.has(normItemCode)) {
      allItemsMap.set(normItemCode, {
        id: normItemCode,
        code: normItemCode,
        name: meta.itemName || normItemCode,
      });
    }

    let cell = cellsMap.get(key);
    if (!cell) {
      const packCfg = resolvePackConfig(meta.uomCode, divHint, meta.packagingSize, meta.packagingUnit);
      cell = {
        customerId: normCustId,
        customerCode: meta.customerCode || 'CUST',
        customerName: meta.customerName || 'Customer',
        itemId: normItemId,
        itemCode: normItemCode,
        itemName: meta.itemName || 'Item',
        uomCode: packCfg.uomCode,
        packUnitLabel: packCfg.packUnitLabel,
        packSize: packCfg.defaultPackSize,
        orderedQty: 0,
        dispatchedInPeriodQty: 0,
        packCountInPeriod: 0,
        dispatchedValuePkr: 0,
        cumulativeDispatchedQty: 0,
        pendingBalanceQty: 0,
        unitPriceHint: 0,
        deliveryIds: new Set<string>(),
        socNumbers: new Set<string>(),
      };
      cellsMap.set(key, cell);
    }
    return cell;
  };

  // 1. Roll up Sales Orders (Ordered, Cumulative Dispatched, Pending Balance, Unit Prices, SOC #)
  for (const order of scopedOrders) {
    const orderId = String(order?.id || '').trim();
    const orderNumber = String(order?.orderNumber || order?.order_number || order?.socNumber || '').trim().toUpperCase();
    const custId = String(order?.customerId || order?.customer_id || order?.customer?.id || '').trim();
    const custCode = String(order?.customer?.customerCode || order?.customerCode || 'CUST').trim();
    const custName = String(
      order?.customer?.companyName || order?.customer?.name || order?.customerName || 'Customer',
    ).trim();
    const orderStatus = String(order?.status || '').toUpperCase().trim();
    const isClosedOrder = orderStatus === 'DELIVERED' || orderStatus === 'COMPLETED' || orderStatus === 'CLOSED';
    const orderInPeriod = isDateInRange(order?.orderDate || order?.order_date || order?.createdAt, dateFrom, dateTo);
    const items = Array.isArray(order?.items)
      ? order.items
      : Array.isArray(order?.orderItems)
        ? order.orderItems
        : [];

    for (const it of items) {
      const iId = String(it?.itemId || it?.item_id || it?.item?.id || '').trim();
      const iCode = String(it?.item?.itemCode || it?.itemCode || it?.item_code || 'ITEM').trim().toUpperCase();
      const iName = String(it?.item?.name || it?.itemName || stripDeliveryDescMeta(it?.description) || 'Product').trim();
      const uomCode = String(it?.uom?.code || it?.uomCode || it?.item?.uom?.code || '').trim();
      const pkgSize = Number(it?.item?.packagingSize ?? it?.packagingSize ?? 0) || null;
      const pkgUnit = String(it?.item?.packagingUnit || it?.packagingUnit || it?.packageUnit || '').trim() || null;

      const qty = Number(it?.quantity ?? it?.qty ?? 0) || 0;
      const shipped = Number(it?.shippedQuantity ?? it?.shipped_quantity ?? it?.deliveredQuantity ?? 0) || 0;
      const pending = isClosedOrder ? 0 : Math.max(0, round2(qty - shipped));
      const unitPrice = Number(it?.unitPrice ?? it?.unit_price ?? 0) || 0;

      if (orderId && iCode && unitPrice > 0) {
        unitPriceByOrderItem.set(`${orderId}::${iCode}`, unitPrice);
      }

      // Include open pending orders or orders placed in the selected period
      if (!orderInPeriod && pending <= 0.001) continue;

      const cell = ensureCell({
        customerId: custId,
        customerCode: custCode,
        customerName: custName,
        itemId: iId,
        itemCode: iCode,
        itemName: iName,
        uomCode,
        packagingSize: pkgSize,
        packagingUnit: pkgUnit,
      });

      cell.orderedQty = round2(cell.orderedQty + qty);
      cell.cumulativeDispatchedQty = round2(cell.cumulativeDispatchedQty + shipped);
      cell.pendingBalanceQty = round2(cell.pendingBalanceQty + pending);
      if (orderNumber) cell.socNumbers.add(orderNumber);
      if (unitPrice > 0 && cell.unitPriceHint <= 0) {
        cell.unitPriceHint = unitPrice;
      }
    }
  }

  // 2. Roll up Deliveries in the selected Period (exact Dispatched Qty, Pack Count, Dispatched Value PKR)
  for (const delivery of scopedDeliveries) {
    const delDate = delivery?.deliveryDate || delivery?.delivery_date || delivery?.dispatchDate || delivery?.createdAt;
    if (!isDateInRange(delDate, dateFrom, dateTo)) continue;

    const delId = String(delivery?.id || delivery?.deliveryNumber || '').trim();
    const linkedOrderId = String(delivery?.salesOrderId || delivery?.sales_order_id || delivery?.salesOrder?.id || '').trim();
    const headerSocNo = String(delivery?.salesOrder?.orderNumber || delivery?.salesOrder?.order_number || '').trim().toUpperCase();
    const custId = String(delivery?.customerId || delivery?.customer_id || delivery?.customer?.id || '').trim();
    const custCode = String(delivery?.customer?.customerCode || delivery?.customerCode || 'CUST').trim();
    const custName = String(
      delivery?.customer?.companyName || delivery?.customer?.name || delivery?.customerName || 'Customer',
    ).trim();
    const lines = Array.isArray(delivery?.lines)
      ? delivery.lines
      : Array.isArray(delivery?.items)
        ? delivery.items
        : [];

    for (const ln of lines) {
      const iId = String(ln?.itemId || ln?.item_id || ln?.item?.id || '').trim();
      const iCode = String(ln?.item?.itemCode || ln?.itemCode || ln?.item_code || 'ITEM').trim().toUpperCase();
      const iName = String(ln?.item?.name || ln?.itemName || stripDeliveryDescMeta(ln?.description) || 'Dispatched Item').trim();
      const uomCode = String(ln?.uom?.code || ln?.uomCode || ln?.item?.uom?.code || '').trim();
      const pkgSize = Number(ln?.item?.packagingSize ?? ln?.packagingSize ?? 0) || null;
      const pkgUnit = String(ln?.packageUnit || ln?.item?.packagingUnit || '').trim() || null;

      const qty = Number(ln?.quantity ?? ln?.qty ?? 0) || 0;
      if (qty <= 0) continue;

      const cell = ensureCell({
        customerId: custId,
        customerCode: custCode,
        customerName: custName,
        itemId: iId,
        itemCode: iCode,
        itemName: iName,
        uomCode,
        packagingSize: pkgSize,
        packagingUnit: pkgUnit,
      });

      const explicitPackQty = Number(ln?.packageQuantity ?? ln?.coils ?? 0);
      const linePacks =
        explicitPackQty > 0 && explicitPackQty < qty
          ? explicitPackQty
          : cell.packSize > 0 && cell.packUnitLabel
            ? qty / cell.packSize
            : 0;

      const lineUnitPrice =
        Number(ln?.unitPrice ?? ln?.unit_price ?? 0) ||
        (linkedOrderId ? unitPriceByOrderItem.get(`${linkedOrderId}::${iCode}`) || 0 : 0) ||
        cell.unitPriceHint;
      const lineValue =
        Number(ln?.lineTotal ?? ln?.line_total ?? 0) > 0
          ? Number(ln?.lineTotal ?? ln?.line_total)
          : qty * lineUnitPrice;

      cell.dispatchedInPeriodQty = round2(cell.dispatchedInPeriodQty + qty);
      cell.packCountInPeriod = round2(cell.packCountInPeriod + linePacks);
      cell.dispatchedValuePkr = round2(cell.dispatchedValuePkr + lineValue);
      if (cell.cumulativeDispatchedQty < cell.dispatchedInPeriodQty) {
        cell.cumulativeDispatchedQty = cell.dispatchedInPeriodQty;
      }
      if (delId) cell.deliveryIds.add(delId);
      const lineSocMatch = String(ln?.description || '').match(/\[SOC:\s*([^\]]+)\]/i);
      const resolvedSoc = (lineSocMatch?.[1] || headerSocNo || '').trim().toUpperCase();
      if (resolvedSoc) cell.socNumbers.add(resolvedSoc);
    }
  }

  // 3. Apply optional Customer & Item dropdown filters
  const filteredCells: MatrixCell[] = Array.from(cellsMap.values())
    .filter((c) => {
      if (customerId && customerId !== 'ALL' && c.customerId !== customerId) return false;
      if (itemId && itemId !== 'ALL' && c.itemCode !== itemId && c.itemId !== itemId) return false;
      return c.dispatchedInPeriodQty > 0 || c.orderedQty > 0 || c.pendingBalanceQty > 0;
    })
    .map((c) => ({
      key: `${c.customerId}::${c.itemCode}`,
      customerId: c.customerId,
      customerCode: c.customerCode,
      customerName: c.customerName,
      itemId: c.itemId,
      itemCode: c.itemCode,
      itemName: c.itemName,
      uomCode: c.uomCode,
      packUnitLabel: c.packUnitLabel,
      packSize: c.packSize,
      orderedQty: round2(c.orderedQty),
      dispatchedInPeriodQty: round2(c.dispatchedInPeriodQty),
      packCountInPeriod: Math.round(c.packCountInPeriod),
      dispatchedValuePkr: round2(c.dispatchedValuePkr),
      cumulativeDispatchedQty: round2(c.cumulativeDispatchedQty),
      pendingBalanceQty: round2(c.pendingBalanceQty),
      deliveryCount: c.deliveryIds.size,
      socNumbers: Array.from(c.socNumbers).sort(),
    }));

  // 4. Build Customer-Wise -> Items groups
  const custGroupMap = new Map<string, CustomerWiseGroupRow>();
  for (const cell of filteredCells) {
    let grp = custGroupMap.get(cell.customerId);
    if (!grp) {
      grp = {
        key: `cust-${cell.customerId}`,
        customerId: cell.customerId,
        customerCode: cell.customerCode,
        customerName: cell.customerName,
        itemCount: 0,
        uomCode: cell.uomCode,
        packUnitLabel: cell.packUnitLabel,
        orderedQty: 0,
        dispatchedInPeriodQty: 0,
        packCountInPeriod: 0,
        dispatchedValuePkr: 0,
        cumulativeDispatchedQty: 0,
        pendingBalanceQty: 0,
        deliveryCount: 0,
        items: [],
      };
      custGroupMap.set(cell.customerId, grp);
    }
    grp.items.push(cell);
    grp.itemCount += 1;
    grp.orderedQty = round2(grp.orderedQty + cell.orderedQty);
    grp.dispatchedInPeriodQty = round2(grp.dispatchedInPeriodQty + cell.dispatchedInPeriodQty);
    grp.packCountInPeriod += cell.packCountInPeriod;
    grp.dispatchedValuePkr = round2(grp.dispatchedValuePkr + cell.dispatchedValuePkr);
    grp.cumulativeDispatchedQty = round2(grp.cumulativeDispatchedQty + cell.cumulativeDispatchedQty);
    grp.pendingBalanceQty = round2(grp.pendingBalanceQty + cell.pendingBalanceQty);
    grp.deliveryCount += cell.deliveryCount;
  }

  const customerGroups = Array.from(custGroupMap.values())
    .map((g) => ({
      ...g,
      items: [...g.items].sort(
        (a, b) => b.dispatchedInPeriodQty - a.dispatchedInPeriodQty || b.orderedQty - a.orderedQty,
      ),
    }))
    .sort(
      (a, b) =>
        b.dispatchedInPeriodQty - a.dispatchedInPeriodQty ||
        b.pendingBalanceQty - a.pendingBalanceQty ||
        a.customerName.localeCompare(b.customerName),
    );

  // 5. Build Item-Wise -> Customers groups (with Share %)
  const itemGroupMap = new Map<string, ItemWiseGroupRow>();
  for (const cell of filteredCells) {
    let grp = itemGroupMap.get(cell.itemCode);
    if (!grp) {
      grp = {
        key: `item-${cell.itemCode}`,
        itemId: cell.itemId,
        itemCode: cell.itemCode,
        itemName: cell.itemName,
        customerCount: 0,
        uomCode: cell.uomCode,
        packUnitLabel: cell.packUnitLabel,
        orderedQty: 0,
        dispatchedInPeriodQty: 0,
        packCountInPeriod: 0,
        dispatchedValuePkr: 0,
        cumulativeDispatchedQty: 0,
        pendingBalanceQty: 0,
        deliveryCount: 0,
        customers: [],
      };
      itemGroupMap.set(cell.itemCode, grp);
    }
    grp.customers.push(cell);
    grp.customerCount += 1;
    grp.orderedQty = round2(grp.orderedQty + cell.orderedQty);
    grp.dispatchedInPeriodQty = round2(grp.dispatchedInPeriodQty + cell.dispatchedInPeriodQty);
    grp.packCountInPeriod += cell.packCountInPeriod;
    grp.dispatchedValuePkr = round2(grp.dispatchedValuePkr + cell.dispatchedValuePkr);
    grp.cumulativeDispatchedQty = round2(grp.cumulativeDispatchedQty + cell.cumulativeDispatchedQty);
    grp.pendingBalanceQty = round2(grp.pendingBalanceQty + cell.pendingBalanceQty);
    grp.deliveryCount += cell.deliveryCount;
  }

  const itemGroups = Array.from(itemGroupMap.values())
    .map((g) => ({
      ...g,
      customers: [...g.customers]
        .map((c) => ({
          ...c,
          sharePct:
            g.dispatchedInPeriodQty > 0
              ? Math.round((c.dispatchedInPeriodQty / g.dispatchedInPeriodQty) * 1000) / 10
              : 0,
        }))
        .sort((a, b) => b.dispatchedInPeriodQty - a.dispatchedInPeriodQty || b.orderedQty - a.orderedQty),
    }))
    .sort(
      (a, b) =>
        b.dispatchedInPeriodQty - a.dispatchedInPeriodQty ||
        b.pendingBalanceQty - a.pendingBalanceQty ||
        a.itemCode.localeCompare(b.itemCode),
    );

  // 6. Executive KPIs
  const defaultPackCfg = resolvePackConfig(undefined, divHint);
  const primaryUom = filteredCells[0]?.uomCode || defaultPackCfg.uomCode;
  const primaryPackUnit = filteredCells[0]?.packUnitLabel ?? defaultPackCfg.packUnitLabel;
  const activeCustomers = customerGroups.filter((c) => c.dispatchedInPeriodQty > 0 || c.pendingBalanceQty > 0).length;
  const itemsDispatched = itemGroups.filter((i) => i.dispatchedInPeriodQty > 0).length;
  const periodDispatchedQty = round2(filteredCells.reduce((s, c) => s + c.dispatchedInPeriodQty, 0));
  const periodPackCount = filteredCells.reduce((s, c) => s + c.packCountInPeriod, 0);
  const periodDispatchedValuePkr = round2(filteredCells.reduce((s, c) => s + c.dispatchedValuePkr, 0));
  const remainingPendingQty = round2(filteredCells.reduce((s, c) => s + c.pendingBalanceQty, 0));

  return {
    customerGroups,
    itemGroups,
    kpis: {
      activeCustomers,
      itemsDispatched,
      periodDispatchedQty,
      periodPackCount,
      periodDispatchedValuePkr,
      remainingPendingQty,
      primaryUom,
      primaryPackUnit,
    },
    availableCustomers: Array.from(allCustomersMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    availableItems: Array.from(allItemsMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
    periodLabel,
  };
}

export function buildMatrixExportRows(
  result: DispatchMatrixResult,
  viewMode: DispatchMatrixViewMode,
): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  if (viewMode === 'customer_wise') {
    for (const grp of result.customerGroups) {
      for (const it of grp.items) {
        rows.push({
          'Customer Code': grp.customerCode,
          'Customer Name': grp.customerName,
          'Item Code': it.itemCode,
          'Item Name': it.itemName,
          'SOC #': it.socNumbers.join(', ') || '-',
          UOM: it.uomCode,
          'Ordered Qty': it.orderedQty,
          'Dispatched (Period)': it.dispatchedInPeriodQty,
          'Pack Count': it.packUnitLabel ? `${it.packCountInPeriod} ${it.packUnitLabel}` : '-',
          'Dispatched Value (PKR)': it.dispatchedValuePkr,
          'Cumulative Dispatched': it.cumulativeDispatchedQty,
          'Pending Balance': it.pendingBalanceQty,
        });
      }
    }
  } else {
    for (const grp of result.itemGroups) {
      for (const cust of grp.customers) {
        rows.push({
          'Item Code': grp.itemCode,
          'Item Name': grp.itemName,
          'Customer Code': cust.customerCode,
          'Customer Name': cust.customerName,
          'SOC #': cust.socNumbers.join(', ') || '-',
          UOM: cust.uomCode,
          'Dispatched (Period)': cust.dispatchedInPeriodQty,
          'Share %': `${cust.sharePct ?? 0}%`,
          'Pack Count': cust.packUnitLabel ? `${cust.packCountInPeriod} ${cust.packUnitLabel}` : '-',
          'Dispatched Value (PKR)': cust.dispatchedValuePkr,
          'Ordered Qty': cust.orderedQty,
          'Pending Balance': cust.pendingBalanceQty,
        });
      }
    }
  }
  return rows;
}

export function buildMatrixWhatsAppText(
  result: DispatchMatrixResult,
  viewMode: DispatchMatrixViewMode,
  divisionLabel: string,
): string {
  const { kpis, periodLabel } = result;
  const packSuffix =
    kpis.primaryPackUnit && kpis.periodPackCount > 0
      ? ` (${formatDecimal(kpis.periodPackCount, 0)} ${kpis.primaryPackUnit})`
      : '';
  const lines: string[] = [
    `*PAKISTAN WIRE INDUSTRIES — CUSTOMER × ITEM DISPATCH MATRIX*`,
    `Division: *${divisionLabel}* | Period: *${periodLabel}*`,
    `View: *${viewMode === 'customer_wise' ? 'Customer-Wise → Items' : 'Item-Wise → Customers'}*`,
    '━━━━━━━━━━━━━━━━━━━━',
    `• Active Customers: *${kpis.activeCustomers}*`,
    `• Items Dispatched: *${kpis.itemsDispatched}*`,
    `• Period Dispatched: *${formatDecimal(kpis.periodDispatchedQty, 0)} ${kpis.primaryUom}*${packSuffix}`,
    `• Dispatched Value: *PKR ${formatDecimal(kpis.periodDispatchedValuePkr, 0)}*`,
    `• Remaining Pending: *${formatDecimal(kpis.remainingPendingQty, 0)} ${kpis.primaryUom}*`,
    '━━━━━━━━━━━━━━━━━━━━',
  ];

  if (viewMode === 'customer_wise') {
    result.customerGroups.slice(0, 12).forEach((grp, idx) => {
      const grpPack =
        grp.packUnitLabel && grp.packCountInPeriod > 0
          ? ` (${formatDecimal(grp.packCountInPeriod, 0)} ${grp.packUnitLabel})`
          : '';
      lines.push(
        `${idx + 1}. *${grp.customerName}* (${grp.customerCode}) — *${formatDecimal(grp.dispatchedInPeriodQty, 0)} ${grp.uomCode}*${grpPack} | Pend: ${formatDecimal(grp.pendingBalanceQty, 0)} ${grp.uomCode}`,
      );
      grp.items.slice(0, 5).forEach((it) => {
        lines.push(
          `   • ${it.itemCode}: ${formatDecimal(it.dispatchedInPeriodQty, 0)} ${it.uomCode} (Pend: ${formatDecimal(it.pendingBalanceQty, 0)} ${it.uomCode})`,
        );
      });
    });
  } else {
    result.itemGroups.slice(0, 12).forEach((grp, idx) => {
      const grpPack =
        grp.packUnitLabel && grp.packCountInPeriod > 0
          ? ` (${formatDecimal(grp.packCountInPeriod, 0)} ${grp.packUnitLabel})`
          : '';
      lines.push(
        `${idx + 1}. *${grp.itemCode}* — ${grp.itemName} | *${formatDecimal(grp.dispatchedInPeriodQty, 0)} ${grp.uomCode}*${grpPack}`,
      );
      grp.customers.slice(0, 5).forEach((c) => {
        lines.push(
          `   • ${c.customerName}: ${formatDecimal(c.dispatchedInPeriodQty, 0)} ${c.uomCode} (${c.sharePct ?? 0}%)`,
        );
      });
    });
  }

  return lines.join('\n');
}
