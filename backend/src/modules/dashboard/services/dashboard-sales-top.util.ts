export interface DashboardSalesOrderRow {
  order_id: string;
  order_number: string;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  division_id: string | null;
  order_date: string | Date | null;
  order_status: string | null;
  order_item_id: string | null;
  item_id: string | null;
  uom_code: string | null;
  ordered_qty: number | string | null;
  soi_shipped_qty: number | string | null;
}

export interface DashboardSalesDeliveryRow {
  delivery_id: string;
  delivery_number: string | null;
  delivery_date: string | Date | null;
  delivery_status: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_name: string | null;
  hdr_order_id: string | null;
  hdr_soc_number: string | null;
  hdr_division_id: string | null;
  item_id: string | null;
  item_division_id: string | null;
  uom_code: string | null;
  line_qty: number | string | null;
  line_description: string | null;
}

export interface DashboardTopCustomerEntry {
  id: string;
  code: string;
  name: string;
  salesGross: number;
  cartons: number;
  sharePct: number;
  rank: number;
  deliveryCount: number;
}

export interface DashboardOrderLoadSummary {
  priorOpenPendingGross: number;
  priorOpenOrdersCount: number;
  periodNewOrdersGross: number;
  periodNewOrdersCount: number;
  totalOrderLoadGross: number;
  totalSoldGross: number;
  totalSoldCartons: number;
  remainingBalanceGross: number;
  remainingPct: number;
  fulfillmentPct: number;
  committedOrdersCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  divisionId: string | null;
}

export interface DashboardTopCustomersResponse {
  summary: DashboardOrderLoadSummary;
  topCustomers: DashboardTopCustomerEntry[];
}

const UNCOMMITTED_ORDER_STATUSES = new Set(['DRAFT', 'CANCELLED', 'VOID']);
const CLOSED_ORDER_STATUSES = new Set(['CLOSED', 'COMPLETED', 'DELIVERED']);
const COMMITTED_DELIVERY_STATUSES = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function toIsoDate(val: string | Date | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

/**
 * Converts order/delivery line quantity into uniform Gross (GRS).
 */
export function convertDashboardQtyToGrs(qty: number | string | null | undefined, uomCode?: string | null): number {
  const n = Number(qty || 0);
  if (!n || Number.isNaN(n)) return 0;
  const code = String(uomCode || 'GRS').toUpperCase().trim();
  if (code === 'GRS' || code === 'GROSS') return n;
  if (code === 'PCS' || code === 'PC' || code === 'EA') return n / 144;
  if (code === 'DOZ' || code === 'DZ') return n / 12;
  if (code === 'PAIR' || code === 'PRS') return n / 72;
  return n;
}

/**
 * Extracts explicit/embedded SOC tokens from a delivery line description
 * so multi-SOC delivery notes credit each SOC and its division accurately.
 */
export function extractDashboardSocTokens(text?: string | null): string[] {
  if (!text) return [];
  const raw = String(text);
  const tokens: string[] = [];
  const explicitSoc = raw.match(/\bSOC:\s*(SOC-[A-Za-z0-9-]+|SO-[A-Za-z0-9-]+)/i);
  if (explicitSoc?.[1]) tokens.push(explicitSoc[1].trim().toUpperCase());
  const bracketSoc = raw.match(/\[SOC:\s*(SOC-[A-Za-z0-9-]+|SO-[A-Za-z0-9-]+)\]/i);
  if (bracketSoc?.[1]) tokens.push(bracketSoc[1].trim().toUpperCase());
  const allMatches = raw.match(/SOC-[A-Za-z0-9-]+/gi) || [];
  for (const m of allMatches) {
    tokens.push(m.trim().toUpperCase());
  }
  return Array.from(new Set(tokens));
}

function addSocLookupAliases(map: Map<string, string>, socUpper: string, orderId: string): void {
  if (!socUpper) return;
  map.set(socUpper, orderId);
  const m = socUpper.match(/^(SOC-\d{4}-)0*(\d+)$/);
  if (m) {
    map.set(`${m[1]}${m[2].padStart(5, '0')}`, orderId);
    map.set(`${m[1]}${m[2]}`, orderId);
  }
}

function resolveLinkedOrderId(
  tokens: string[],
  hdrOrderId: string | null,
  hdrSocUpper: string,
  orderIdBySocUpper: Map<string, string>,
): string | null {
  for (const t of tokens) {
    const found = orderIdBySocUpper.get(t);
    if (found) return found;
  }
  if (hdrSocUpper) {
    const found = orderIdBySocUpper.get(hdrSocUpper);
    if (found) return found;
  }
  return hdrOrderId || null;
}

function matchesDivisionScope(
  targetDivisionId: string | null | undefined,
  filterDivisionId?: string,
  allowedDivisionIds?: string[],
): boolean {
  if (Array.isArray(allowedDivisionIds)) {
    if (allowedDivisionIds.length === 0) return false;
    if (filterDivisionId) {
      return allowedDivisionIds.includes(filterDivisionId) && targetDivisionId === filterDivisionId;
    }
    return Boolean(targetDivisionId && allowedDivisionIds.includes(targetDivisionId));
  }
  if (filterDivisionId) {
    return targetDivisionId === filterDivisionId;
  }
  return true;
}

function isSafetyStockCustomer(name?: string | null): boolean {
  return String(name || '').toUpperCase().includes('SAFETY STOCK');
}

function computeTopCustomerShares(
  sorted: Array<{ id: string; code: string; name: string; salesGross: number; deliveryCount: number }>,
): DashboardTopCustomerEntry[] {
  const totalTop = sorted.reduce((s, c) => s + c.salesGross, 0);
  if (sorted.length === 0 || totalTop <= 0) return [];

  let remainingPct = 100;
  return sorted.map((c, idx) => {
    const isLast = idx === sorted.length - 1;
    const rawPct = Math.round((c.salesGross / totalTop) * 100);
    const sharePct =
      sorted.length === 1
        ? 100
        : isLast
          ? Math.max(0, remainingPct)
          : Math.min(remainingPct, Math.max(1, rawPct));
    remainingPct = Math.max(0, remainingPct - sharePct);

    return {
      id: c.id,
      code: c.code || `CUS-${String(idx + 1).padStart(3, '0')}`,
      name: c.name,
      salesGross: round2(c.salesGross),
      cartons: Math.round(c.salesGross / 10),
      sharePct: Math.min(100, Math.max(0, sharePct)),
      rank: idx + 1,
      deliveryCount: c.deliveryCount,
    };
  });
}

/**
 * Computes period- & division-scoped Total Order Load
 * (`priorOpenPendingGross + periodNewOrdersGross`) vs Dispatched/Sold,
 * Remaining Balance % (shown inside Card 1 ring), and Top 3 Customers.
 */
export function buildDashboardOrderLoadAndTopCustomers(params: {
  orderRows: DashboardSalesOrderRow[];
  deliveryRows: DashboardSalesDeliveryRow[];
  dateFrom?: string;
  dateTo?: string;
  divisionId?: string;
  allowedDivisionIds?: string[];
}): DashboardTopCustomersResponse {
  const dateFrom = params.dateFrom ? String(params.dateFrom).slice(0, 10) : null;
  const dateTo = params.dateTo ? String(params.dateTo).slice(0, 10) : null;
  const divisionId = params.divisionId || null;

  if (Array.isArray(params.allowedDivisionIds) && params.allowedDivisionIds.length === 0) {
    return {
      summary: {
        priorOpenPendingGross: 0,
        priorOpenOrdersCount: 0,
        periodNewOrdersGross: 0,
        periodNewOrdersCount: 0,
        totalOrderLoadGross: 0,
        totalSoldGross: 0,
        totalSoldCartons: 0,
        remainingBalanceGross: 0,
        remainingPct: 0,
        fulfillmentPct: 0,
        committedOrdersCount: 0,
        dateFrom,
        dateTo,
        divisionId,
      },
      topCustomers: [],
    };
  }

  // 1. Aggregate committed Sales Orders first so delivery lines can resolve exact division/SOC
  const ordersById = new Map<
    string,
    {
      orderId: string;
      socUpper: string;
      divisionId: string | null;
      customerName: string;
      orderDate: string | null;
      statusUpper: string;
      orderedGrs: number;
    }
  >();
  const orderIdBySocUpper = new Map<string, string>();
  const seenOrderItemIds = new Set<string>();

  for (const r of params.orderRows) {
    if (!r.order_id) continue;
    const statusUpper = String(r.order_status || 'DRAFT').toUpperCase().trim();
    if (UNCOMMITTED_ORDER_STATUSES.has(statusUpper)) continue;

    let order = ordersById.get(r.order_id);
    if (!order) {
      const socUpper = String(r.order_number || '').trim().toUpperCase();
      order = {
        orderId: r.order_id,
        socUpper,
        divisionId: r.division_id ?? null,
        customerName: String(r.customer_name || '').trim(),
        orderDate: toIsoDate(r.order_date),
        statusUpper,
        orderedGrs: 0,
      };
      ordersById.set(r.order_id, order);
      addSocLookupAliases(orderIdBySocUpper, socUpper, r.order_id);
    }

    if (r.order_item_id && !seenOrderItemIds.has(r.order_item_id)) {
      seenOrderItemIds.add(r.order_item_id);
      order.orderedGrs += convertDashboardQtyToGrs(r.ordered_qty, r.uom_code);
    }
  }

  // 2. Process committed delivery lines:
  //    - pre-period dispatches (`delivDate < dateFrom`) reduce prior open balance at period start
  //    - in-period dispatches (`dateFrom <= delivDate <= dateTo`) accumulate period Sold & Top 3 Customers
  const dispatchedBeforeDateFromByOrder = new Map<string, number>();
  const dispatchedFromDateOnwardByOrder = new Map<string, number>();
  let totalPeriodSoldGrs = 0;

  const customerMap = new Map<
    string,
    {
      id: string;
      code: string;
      name: string;
      salesGross: number;
      deliveryIds: Set<string>;
    }
  >();

  for (const d of params.deliveryRows) {
    const delivStatus = String(d.delivery_status || '').toUpperCase().trim();
    if (!COMMITTED_DELIVERY_STATUSES.has(delivStatus)) continue;
    if (isSafetyStockCustomer(d.customer_name)) continue;

    const descTokens = extractDashboardSocTokens(d.line_description);
    const hdrSocUpper = String(d.hdr_soc_number || '').trim().toUpperCase();
    const linkedOrderId = resolveLinkedOrderId(
      descTokens,
      d.hdr_order_id ?? null,
      hdrSocUpper,
      orderIdBySocUpper,
    );
    const linkedOrder = linkedOrderId ? ordersById.get(linkedOrderId) : undefined;
    const effectiveDivisionId = linkedOrder?.divisionId ?? d.hdr_division_id ?? d.item_division_id ?? null;

    if (!matchesDivisionScope(effectiveDivisionId, divisionId ?? undefined, params.allowedDivisionIds)) {
      continue;
    }

    const qtyGrs = convertDashboardQtyToGrs(d.line_qty, d.uom_code);
    if (qtyGrs <= 0) continue;

    const delivDate = toIsoDate(d.delivery_date);

    if (linkedOrderId && dateFrom && delivDate && delivDate < dateFrom) {
      dispatchedBeforeDateFromByOrder.set(
        linkedOrderId,
        (dispatchedBeforeDateFromByOrder.get(linkedOrderId) || 0) + qtyGrs,
      );
    }

    if (linkedOrderId && (!dateFrom || (delivDate && delivDate >= dateFrom))) {
      dispatchedFromDateOnwardByOrder.set(
        linkedOrderId,
        (dispatchedFromDateOnwardByOrder.get(linkedOrderId) || 0) + qtyGrs,
      );
    }

    const inPeriod =
      (!dateFrom || (delivDate !== null && delivDate >= dateFrom)) &&
      (!dateTo || (delivDate !== null && delivDate <= dateTo));

    if (inPeriod) {
      totalPeriodSoldGrs += qtyGrs;

      const custName = String(d.customer_name || '').trim() || 'Customer';
      const custCode = String(d.customer_code || '').trim();
      const custKey = d.customer_id || custCode || custName;

      let agg = customerMap.get(custKey);
      if (!agg) {
        agg = {
          id: d.customer_id || custKey,
          code: custCode,
          name: custName,
          salesGross: 0,
          deliveryIds: new Set<string>(),
        };
        customerMap.set(custKey, agg);
      }
      agg.salesGross += qtyGrs;
      if (d.delivery_id) agg.deliveryIds.add(d.delivery_id);
    }
  }

  // 3. Accumulate Prior Open Pending Balance (< dateFrom) + Selected Period New Orders
  let priorOpenPendingGross = 0;
  let priorOpenOrdersCount = 0;
  let periodNewOrdersGross = 0;
  let periodNewOrdersCount = 0;

  for (const order of ordersById.values()) {
    if (isSafetyStockCustomer(order.customerName)) continue;
    if (!matchesDivisionScope(order.divisionId, divisionId ?? undefined, params.allowedDivisionIds)) {
      continue;
    }

    const od = order.orderDate;
    const isPrior = Boolean(dateFrom && od && od < dateFrom);
    const inPeriod =
      (!dateFrom || (od !== null && od >= dateFrom)) &&
      (!dateTo || (od !== null && od <= dateTo));

    if (isPrior) {
      const dnBefore = dispatchedBeforeDateFromByOrder.get(order.orderId) || 0;
      const dnFromOnward = dispatchedFromDateOnwardByOrder.get(order.orderId) || 0;
      const rawPriorPending = Math.max(0, round2(order.orderedGrs - dnBefore));
      const isClosedPriorWithoutActivity =
        CLOSED_ORDER_STATUSES.has(order.statusUpper) && dnFromOnward <= 0.01;
      const effectivePriorPending = isClosedPriorWithoutActivity ? 0 : rawPriorPending;

      if (effectivePriorPending > 0.01) {
        priorOpenPendingGross += effectivePriorPending;
        priorOpenOrdersCount += 1;
      }
    } else if (inPeriod) {
      periodNewOrdersGross += order.orderedGrs;
      periodNewOrdersCount += 1;
    }
  }

  const priorRounded = round2(priorOpenPendingGross);
  const newRounded = round2(periodNewOrdersGross);
  const totalOrderLoadGross = round2(priorRounded + newRounded);
  const totalSoldGross = round2(totalPeriodSoldGrs);
  const remainingBalanceGross = round2(Math.max(0, totalOrderLoadGross - totalSoldGross));

  const remainingPct =
    totalOrderLoadGross > 0
      ? Math.min(100, Math.max(0, Math.round((remainingBalanceGross / totalOrderLoadGross) * 100)))
      : 0;
  const fulfillmentPct =
    totalOrderLoadGross > 0
      ? Math.min(100, Math.max(0, Math.round((totalSoldGross / totalOrderLoadGross) * 100)))
      : 0;

  // 4. Rank Top 3 Customers strictly for the selected range + division
  const topSorted = Array.from(customerMap.values())
    .filter((c) => c.salesGross > 0)
    .sort((a, b) => b.salesGross - a.salesGross)
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      salesGross: c.salesGross,
      deliveryCount: c.deliveryIds.size,
    }));

  return {
    summary: {
      priorOpenPendingGross: priorRounded,
      priorOpenOrdersCount,
      periodNewOrdersGross: newRounded,
      periodNewOrdersCount,
      totalOrderLoadGross,
      totalSoldGross,
      totalSoldCartons: Math.round(totalSoldGross / 10),
      remainingBalanceGross,
      remainingPct,
      fulfillmentPct,
      committedOrdersCount: priorOpenOrdersCount + periodNewOrdersCount,
      dateFrom,
      dateTo,
      divisionId,
    },
    topCustomers: computeTopCustomerShares(topSorted),
  };
}
