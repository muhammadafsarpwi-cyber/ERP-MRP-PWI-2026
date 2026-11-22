import type { OrderCommandOrder } from './OrderCommandFulfillment';
import {
  getCurrentFiscalYearInfo,
  getFiscalQuarterFromIso,
  getFiscalQuarterInfo,
  getFiscalYearFromIso,
  getPreviousFiscalQuarterInfo,
  getPreviousFiscalYearInfo,
  toIsoYmd,
} from '../../utils/fiscalYear';

export type OrderCommandDatePreset =
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'thisYear'
  | 'lastYear'
  | 'allOpen'
  | 'custom';

export const DEFAULT_ORDER_COMMAND_DATE_PRESET: OrderCommandDatePreset = 'thisMonth';

export const DEFAULT_ORDER_COMMAND_DIVISION_CODES = ['DIV-001-SPI', 'DIV-SPD'];
export const DEFAULT_ORDER_COMMAND_DIVISION_NAME = 'Spoke Division';

export function findDefaultOrderCommandDivision<T extends { id: string; divisionCode?: string; name?: string }>(
  divisions: T[],
): T | undefined {
  for (const code of DEFAULT_ORDER_COMMAND_DIVISION_CODES) {
    const match = divisions.find(
      (d) => String(d.divisionCode || '').trim().toUpperCase() === code,
    );
    if (match) return match;
  }
  return divisions.find(
    (d) => String(d.name || '').trim().toLowerCase() === DEFAULT_ORDER_COMMAND_DIVISION_NAME.toLowerCase(),
  );
}

export function getOrderCommandDatePresetOptions(
  referenceDate?: Date,
): Array<{
  value: OrderCommandDatePreset;
  label: string;
  subtext?: string;
}> {
  const ref = referenceDate ?? new Date();
  const thisQ = getFiscalQuarterInfo(ref);
  const lastQ = getPreviousFiscalQuarterInfo(ref);
  const thisFy = getCurrentFiscalYearInfo(ref);
  const lastFy = getPreviousFiscalYearInfo(ref);

  return [
    { value: 'thisMonth', label: 'This Month', subtext: 'Default view' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'thisQuarter', label: 'This Quarter', subtext: `${thisQ.quarterLabel} · ${thisQ.shortRange}` },
    { value: 'lastQuarter', label: 'Last Quarter', subtext: `${lastQ.quarterLabel} · ${lastQ.shortRange}` },
    { value: 'thisYear', label: 'This Year', subtext: thisFy.fullLabel },
    { value: 'lastYear', label: 'Last Year', subtext: lastFy.fullLabel },
    { value: 'allOpen', label: 'All Open Backlog', subtext: 'All pending months' },
    { value: 'custom', label: 'Custom' },
  ];
}

export const ORDER_COMMAND_DATE_PRESET_OPTIONS = getOrderCommandDatePresetOptions();

export interface TopCommandCustomerCard {
  customerId: string;
  customerCode: string;
  customerName: string;
  soldGrs: number;
  cartons: number;
  orderedGrs: number;
  pendingGrs: number;
  completionPct: number;
  deliveryCount: number;
  rank: number;
  color: string;
  accentBg: string;
  tag: string;
}

export interface ReconciledOrderCommandKpis {
  openingPendingGross: number;
  openingOrdersCount: number;
  newInPeriodGross: number;
  newOrdersCount: number;
  totalOrderLoad: number;
  dispatched: number;
  dispatchedPct: number;
  pendingOrderBalance: number;
  readyPacked: number;
  remainingToPack: number;
  oldestReadyAgeDays: number | null;
  readyOrderCount: number;
  openOrderCount: number;
  primaryUom: string;
  periodShortTag: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const TOP_5_RANK_STYLES = [
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', tag: '#1 Top Volume' },
  { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)', tag: '#2 Partner' },
  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', tag: '#3 Partner' },
  { color: '#6366f1', bg: 'rgba(99, 102, 241, 0.14)', tag: '#4 Partner' },
  { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.14)', tag: '#5 Partner' },
];

const COMMITTED_DELIVERY_STATUSES = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);
const CLOSED_ORDER_STATUSES = new Set(['CLOSED', 'COMPLETED', 'DELIVERED']);

export function resolveOrderCommandDateRange(
  preset: OrderCommandDatePreset,
  customRange?: [string, string],
  referenceDate?: Date,
): { dateFrom?: string; dateTo?: string } {
  const ref = referenceDate ?? new Date();
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());

  switch (preset) {
    case 'allOpen':
      return {};
    case 'thisMonth':
      return {
        dateFrom: toIsoYmd(new Date(today.getFullYear(), today.getMonth(), 1)),
        dateTo: toIsoYmd(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
      };
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { dateFrom: toIsoYmd(start), dateTo: toIsoYmd(end) };
    }
    case 'thisQuarter': {
      const q = getFiscalQuarterInfo(today);
      return { dateFrom: q.startDate, dateTo: q.endDate };
    }
    case 'lastQuarter': {
      const q = getPreviousFiscalQuarterInfo(today);
      return { dateFrom: q.startDate, dateTo: q.endDate };
    }
    case 'thisYear': {
      const fy = getCurrentFiscalYearInfo(today);
      return { dateFrom: fy.startDate, dateTo: fy.endDate };
    }
    case 'lastYear': {
      const fy = getPreviousFiscalYearInfo(today);
      return { dateFrom: fy.startDate, dateTo: fy.endDate };
    }
    case 'custom':
      if (customRange?.[0] && customRange?.[1]) {
        return { dateFrom: customRange[0], dateTo: customRange[1] };
      }
      return {};
    default:
      return {};
  }
}

function parseIsoParts(iso?: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  };
}

export function getOrderCommandDateBadge(
  preset: OrderCommandDatePreset,
  dateFrom?: string,
  dateTo?: string,
): string {
  switch (preset) {
    case 'allOpen':
      return 'All Open Backlog · All Prior & Current Months';
    case 'thisMonth': {
      const p = parseIsoParts(dateFrom || dateTo);
      return p ? `${MONTH_NAMES[p.month - 1]} ${p.year} Sales & Orders` : 'This Month Sales & Orders';
    }
    case 'lastMonth': {
      const p = parseIsoParts(dateFrom || dateTo);
      return p ? `Last Month Sales & Orders (${SHORT_MONTHS[p.month - 1]} ${p.year})` : 'Last Month Sales & Orders';
    }
    case 'thisQuarter': {
      const q = getFiscalQuarterFromIso(dateFrom || dateTo);
      return q ? `${q.quarterLabel} (${q.shortRange})` : 'This Quarter Sales & Orders';
    }
    case 'lastQuarter': {
      const q = getFiscalQuarterFromIso(dateFrom || dateTo);
      return q ? `Last Quarter · ${q.quarterLabel} (${q.shortRange})` : 'Last Quarter Sales & Orders';
    }
    case 'thisYear': {
      const fy = getFiscalYearFromIso(dateFrom || dateTo);
      return fy ? `${fy.fyLabel} · ${fy.shortRange}` : 'This Year Sales & Orders';
    }
    case 'lastYear': {
      const fy = getFiscalYearFromIso(dateFrom || dateTo);
      return fy ? `Last Year · ${fy.fyLabel} (${fy.shortRange})` : 'Last Year Sales & Orders';
    }
    case 'custom': {
      const f = parseIsoParts(dateFrom);
      const t = parseIsoParts(dateTo);
      if (f && t) {
        if (dateFrom === dateTo) return `${SHORT_MONTHS[f.month - 1]} ${f.day}, ${f.year} Sales & Orders`;
        if (f.year === t.year) {
          return `${SHORT_MONTHS[f.month - 1]} ${f.day} - ${SHORT_MONTHS[t.month - 1]} ${t.day}, ${f.year} Sales & Orders`;
        }
        return `${dateFrom} to ${dateTo} Sales & Orders`;
      }
      return 'Custom Period Sales & Orders';
    }
    default:
      return 'This Month';
  }
}

export function isOrderDateInRange(dateVal?: string | null, dateFrom?: string, dateTo?: string): boolean {
  if (!dateFrom && !dateTo) return true;
  if (!dateVal) return false;
  const d = String(dateVal).slice(0, 10);
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

function getPeriodShortTag(preset: OrderCommandDatePreset, dateFrom?: string): string {
  if (preset === 'thisQuarter' || preset === 'lastQuarter') {
    const q = getFiscalQuarterFromIso(dateFrom);
    return q ? `Q${q.quarter}` : 'Quarter';
  }
  if (preset === 'thisYear' || preset === 'lastYear') {
    const fy = getFiscalYearFromIso(dateFrom);
    return fy ? fy.fyLabel : 'FY';
  }
  if (preset === 'thisMonth' || preset === 'lastMonth') {
    const p = parseIsoParts(dateFrom);
    return p ? SHORT_MONTHS[p.month - 1] : 'Month';
  }
  return 'Period';
}

export function orderMatchesNonDateFilters(
  o: OrderCommandOrder,
  opts: {
    divisionId?: string;
    customerId?: string;
    searchText?: string;
    readyOnly?: boolean;
  },
): boolean {
  if (opts.divisionId && o.divisionId !== opts.divisionId) return false;
  if (opts.customerId && o.customerId !== opts.customerId) return false;
  if (opts.readyOnly && o.readyPackedQty <= 0) return false;
  const q = String(opts.searchText || '').trim().toLowerCase();
  if (q) {
    const matchesHeader =
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerCode.toLowerCase().includes(q) ||
      String(o.customerPo || '').toLowerCase().includes(q) ||
      String(o.divisionName || '').toLowerCase().includes(q);
    const matchesItem = (o.items || []).some(
      (it) => it.itemCode.toLowerCase().includes(q) || it.itemName.toLowerCase().includes(q),
    );
    if (!matchesHeader && !matchesItem) return false;
  }
  return true;
}

/**
 * Computes reconciled 5-metric KPI figures so that:
 * Total Order Load (= Opening Prior Pending + New Orders in Period) − Dispatched === Pending Order Balance
 */
export function computeOrderCommandKpis(
  allOrders: OrderCommandOrder[],
  opts: {
    preset: OrderCommandDatePreset;
    dateFrom?: string;
    dateTo?: string;
    divisionId?: string;
    customerId?: string;
    searchText?: string;
    readyOnly?: boolean;
  },
): ReconciledOrderCommandKpis {
  const { preset, dateFrom, dateTo } = opts;
  const scopedOrders = (allOrders || []).filter(
    (o) =>
      o.category !== 'CANCELLED' &&
      !String(o.customerName || '').toUpperCase().includes('SAFETY STOCK') &&
      orderMatchesNonDateFilters(o, opts),
  );

  const primaryUom = scopedOrders.find((o) => o.category === 'PENDING')?.uomCode || scopedOrders[0]?.uomCode || 'GRS';
  const periodShortTag = getPeriodShortTag(preset, dateFrom || dateTo);

  if (preset === 'allOpen' || (!dateFrom && !dateTo)) {
    let totalOrdered = 0;
    let dispatched = 0;
    let readyPacked = 0;
    let oldestReadyAgeDays: number | null = null;
    let readyOrderCount = 0;
    let openOrderCount = 0;

    for (const o of scopedOrders) {
      if (o.category !== 'PENDING') continue;
      openOrderCount += 1;
      totalOrdered += Number(o.orderedQty || 0);
      dispatched += Number(o.dispatchedQty || 0);
      readyPacked += Number(o.readyPackedQty || 0);
      if (o.readyPackedQty > 0) {
        readyOrderCount += 1;
        if (o.readyAgeDays !== null && (oldestReadyAgeDays === null || o.readyAgeDays > oldestReadyAgeDays)) {
          oldestReadyAgeDays = o.readyAgeDays;
        }
      }
    }

    const totalOrderLoad = round2(totalOrdered);
    const dispR = round2(dispatched);
    const pendingOrderBalance = Math.max(0, round2(totalOrderLoad - dispR));
    const readyR = round2(readyPacked);
    const remainingToPack = Math.max(0, round2(pendingOrderBalance - readyR));

    return {
      openingPendingGross: 0,
      openingOrdersCount: 0,
      newInPeriodGross: totalOrderLoad,
      newOrdersCount: openOrderCount,
      totalOrderLoad,
      dispatched: dispR,
      dispatchedPct: totalOrderLoad > 0 ? Math.min(100, Math.round((dispR / totalOrderLoad) * 100)) : 0,
      pendingOrderBalance,
      readyPacked: readyR,
      remainingToPack,
      oldestReadyAgeDays,
      readyOrderCount,
      openOrderCount,
      primaryUom,
      periodShortTag: 'Open Backlog',
    };
  }

  let openingPendingGross = 0;
  let openingOrdersCount = 0;
  let newInPeriodGross = 0;
  let newOrdersCount = 0;
  let dispatched = 0;
  let readyPacked = 0;
  let oldestReadyAgeDays: number | null = null;
  let readyOrderCount = 0;
  let openOrderCount = 0;

  for (const o of scopedOrders) {
    const od = o.orderDate ? String(o.orderDate).slice(0, 10) : null;
    const isPrior = Boolean(dateFrom && od && od < dateFrom);
    const inPeriod = isOrderDateInRange(od, dateFrom, dateTo);
    const upToDateTo = !dateTo || (od !== null && od <= dateTo);

    const linked = Array.isArray(o.linkedDeliveries) ? o.linkedDeliveries : [];
    let prePeriodDisp = 0;
    let inPeriodDisp = 0;
    let inOrAfterDisp = 0;

    if (linked.length > 0) {
      for (const ld of linked) {
        if (!COMMITTED_DELIVERY_STATUSES.has(String(ld.status || '').toUpperCase())) continue;
        const dd = ld.deliveryDate ? String(ld.deliveryDate).slice(0, 10) : null;
        const qty = Number(ld.dispatchedQty || 0);
        if (qty <= 0) continue;
        if (dateFrom && dd && dd < dateFrom) prePeriodDisp += qty;
        if (!dateFrom || (dd && dd >= dateFrom)) inOrAfterDisp += qty;
        if (isOrderDateInRange(dd, dateFrom, dateTo)) inPeriodDisp += qty;
      }
    } else if (Number(o.dispatchedQty || 0) > 0) {
      if (isPrior) prePeriodDisp = Number(o.dispatchedQty || 0);
      else if (inPeriod) {
        inPeriodDisp = Number(o.dispatchedQty || 0);
        inOrAfterDisp = inPeriodDisp;
      }
    }

    let contributesPriorOpen = false;
    if (isPrior) {
      const rawPriorPending = Math.max(0, round2(Number(o.orderedQty || 0) - prePeriodDisp));
      const isClosedNoPostActivity =
        (o.category === 'COMPLETED' || CLOSED_ORDER_STATUSES.has(String(o.status || '').toUpperCase())) &&
        inOrAfterDisp <= 0.01;
      const effectivePriorPending = isClosedNoPostActivity ? 0 : rawPriorPending;
      if (effectivePriorPending > 0.01) {
        openingPendingGross += effectivePriorPending;
        openingOrdersCount += 1;
        contributesPriorOpen = true;
      }
    } else if (inPeriod) {
      newInPeriodGross += Number(o.orderedQty || 0);
      newOrdersCount += 1;
    }

    dispatched += inPeriodDisp;

    if (o.category === 'PENDING' && upToDateTo && (contributesPriorOpen || inPeriod || inPeriodDisp > 0)) {
      openOrderCount += 1;
      if (o.readyPackedQty > 0) {
        readyPacked += Number(o.readyPackedQty || 0);
        readyOrderCount += 1;
        if (o.readyAgeDays !== null && (oldestReadyAgeDays === null || o.readyAgeDays > oldestReadyAgeDays)) {
          oldestReadyAgeDays = o.readyAgeDays;
        }
      }
    }
  }

  const openingR = round2(openingPendingGross);
  const newR = round2(newInPeriodGross);
  const totalOrderLoad = round2(openingR + newR);
  const dispR = round2(dispatched);
  const pendingOrderBalance = Math.max(0, round2(totalOrderLoad - dispR));
  const readyR = round2(readyPacked);
  const remainingToPack = Math.max(0, round2(pendingOrderBalance - readyR));

  return {
    openingPendingGross: openingR,
    openingOrdersCount,
    newInPeriodGross: newR,
    newOrdersCount,
    totalOrderLoad,
    dispatched: dispR,
    dispatchedPct: totalOrderLoad > 0 ? Math.min(100, Math.round((dispR / totalOrderLoad) * 100)) : 0,
    pendingOrderBalance,
    readyPacked: readyR,
    remainingToPack,
    oldestReadyAgeDays,
    readyOrderCount,
    openOrderCount,
    primaryUom,
    periodShortTag,
  };
}

/**
 * Ranks the Top 5 Customers dynamically by Dispatched / Order Volume for the active
 * DATE RANGE and Division while surfacing Pending Balance & completion %.
 */
export function buildTopCustomersForCommand(
  orders: OrderCommandOrder[],
  opts: {
    preset: OrderCommandDatePreset;
    dateFrom?: string;
    dateTo?: string;
    divisionId?: string;
    limit?: number;
  },
): TopCommandCustomerCard[] {
  const { preset, dateFrom, dateTo, divisionId, limit = 5 } = opts;
  const isAllOpen = preset === 'allOpen' || (!dateFrom && !dateTo);

  const byCustomer = new Map<
    string,
    {
      customerId: string;
      customerCode: string;
      customerName: string;
      soldGrs: number;
      orderedGrs: number;
      pendingGrs: number;
      deliveryIds: Set<string>;
    }
  >();

  for (const o of orders || []) {
    if (o.category === 'CANCELLED') continue;
    if (divisionId && o.divisionId !== divisionId) continue;
    if (String(o.customerName || '').toUpperCase().includes('SAFETY STOCK')) continue;

    const custId = o.customerId || o.customerCode || o.customerName;
    let bucket = byCustomer.get(custId);
    if (!bucket) {
      bucket = {
        customerId: custId,
        customerCode: o.customerCode || 'CUST',
        customerName: String(o.customerName || 'Customer').trim(),
        soldGrs: 0,
        orderedGrs: 0,
        pendingGrs: 0,
        deliveryIds: new Set<string>(),
      };
      byCustomer.set(custId, bucket);
    }

    if (o.category === 'PENDING') {
      bucket.pendingGrs += Number(o.pendingQty || 0);
    }

    const inOrderPeriod = isAllOpen || isOrderDateInRange(o.orderDate, dateFrom, dateTo);
    if (inOrderPeriod) {
      bucket.orderedGrs += Number(o.orderedQty || 0);
    }

    const linked = Array.isArray(o.linkedDeliveries) ? o.linkedDeliveries : [];
    if (isAllOpen) {
      bucket.soldGrs += Number(o.dispatchedQty || 0);
      for (const ld of linked) {
        if (COMMITTED_DELIVERY_STATUSES.has(String(ld.status || '').toUpperCase())) {
          bucket.deliveryIds.add(ld.deliveryId);
        }
      }
    } else if (linked.length > 0) {
      for (const ld of linked) {
        if (!COMMITTED_DELIVERY_STATUSES.has(String(ld.status || '').toUpperCase())) continue;
        if (!isOrderDateInRange(ld.deliveryDate, dateFrom, dateTo)) continue;
        const qty = Number(ld.dispatchedQty || 0);
        if (qty > 0) {
          bucket.soldGrs += qty;
          bucket.deliveryIds.add(ld.deliveryId);
        }
      }
    } else if (inOrderPeriod && Number(o.dispatchedQty || 0) > 0) {
      bucket.soldGrs += Number(o.dispatchedQty || 0);
    }
  }

  const ranked = Array.from(byCustomer.values())
    .filter((c) => {
      if (isAllOpen) return c.soldGrs > 0 || c.orderedGrs > 0 || c.pendingGrs > 0;
      return c.soldGrs > 0 || c.orderedGrs > 0;
    })
    .sort((a, b) => {
      const soldDiff = b.soldGrs - a.soldGrs;
      if (Math.abs(soldDiff) > 0.01) return soldDiff;
      const ordDiff = b.orderedGrs - a.orderedGrs;
      if (Math.abs(ordDiff) > 0.01) return ordDiff;
      return b.pendingGrs - a.pendingGrs || a.customerName.localeCompare(b.customerName);
    })
    .slice(0, limit);

  return ranked.map((c, idx) => {
    const soldGrs = round2(c.soldGrs);
    const pendingGrs = round2(c.pendingGrs);
    const orderedGrs = round2(c.orderedGrs);
    const totalBasis = isAllOpen ? Math.max(orderedGrs, soldGrs + pendingGrs) : soldGrs + pendingGrs;
    const completionPct =
      totalBasis > 0 ? Math.min(100, Math.max(0, Math.round((soldGrs / totalBasis) * 100))) : 0;
    const style = TOP_5_RANK_STYLES[idx] || TOP_5_RANK_STYLES[4];

    return {
      customerId: c.customerId,
      customerCode: c.customerCode,
      customerName: c.customerName,
      soldGrs,
      cartons: Math.round(soldGrs / 10),
      orderedGrs,
      pendingGrs,
      completionPct,
      deliveryCount: c.deliveryIds.size,
      rank: idx + 1,
      color: style.color,
      accentBg: style.bg,
      tag: style.tag,
    };
  });
}
