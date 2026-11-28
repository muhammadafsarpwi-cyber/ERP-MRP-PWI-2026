import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Alert, Descriptions, Table, Button, Form, Input, Select, App, Modal,
  Row, Col, Tooltip, Tag, Badge, Popover, Progress, Spin, theme,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined,
  CarOutlined, InboxOutlined, StopOutlined, ReloadOutlined, FileExcelOutlined,
  PrinterOutlined, FilterOutlined, CloseCircleOutlined, UserOutlined,
  CalendarOutlined, NumberOutlined, ShopOutlined, FileTextOutlined,
  BranchesOutlined, SafetyCertificateOutlined, ApartmentOutlined, WarningFilled,
  CloseOutlined, ClearOutlined, DeleteOutlined, CheckCircleOutlined,
  LoadingOutlined, RollbackOutlined, WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal, formatSmartCurrency } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine, DraggableResizableModal, PreConfirmVerificationCard, TableColumnSelector, useColumnVisibility } from '../../components/shared';
import { resolveEffectiveTaxPercent, summarizeLinesTaxVerification } from '../../utils/salesTaxVerification';
import { matchesTabRefresh, TAB_REFRESH_EVENT, tabSessionCache, triggerTabRefresh } from '../../services/tabSessionCache';
import {
  getLookupsSnapshot,
  prefetchAllLookups,
  fetchCachedCustomers,
} from '../../services/lookupsCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { usePermission } from '../../hooks/usePermission';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import './SalesInvoiceManagement.css';
import { printDeliveryNoteDocument, printTableList, printGatePassDocument } from '../../utils/printTemplates';
import {
  DEFAULT_COMPANY_NAME,
  openWhatsAppWithTemplate,
} from '../../utils/whatsappTemplateRenderer';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);

interface SalesDelivery {
  id: string;
  deliveryNumber: string;
  salesOrderId: string;
  salesOrderNumber?: string;
  customerPo?: string | null;
  salesOrder?: {
    id?: string;
    orderNumber?: string;
    customerPo?: string | null;
    divisionId?: string;
    division?: { id?: string; name?: string; divisionCode?: string };
    section?: { id?: string; name?: string; sectionCode?: string };
    items?: any[];
  };
  divisionId?: string;
  divisionCode?: string | null;
  divisionName?: string;
  sectionName?: string;
  customerId: string;
  companyName?: string;
  deliveryDate: string;
  expectedDate: string;
  warehouseId: string;
  shipToAddress?: string;
  carrier: string;
  trackingNumber: string;
  gatePassNumber?: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  lines?: any[];
  primaryUom?: string;
  primaryPackagingUnit?: string;
  totalDispatchQuantity?: number;
  totalDispatchCartons?: number;
  totalOrderQuantity?: number;
  totalOrderCartons?: number;
  totalPreviousQuantity?: number;
  totalPreviousCartons?: number;
  totalDeliveredQuantity?: number;
  totalDeliveredCartons?: number;
  totalBalanceQuantity?: number;
  totalBalanceCartons?: number;
  completionPercent?: number;
  isCompleted?: boolean;
  salesOrderNumbers?: string[];
  salesOrdersSummary?: any[];
  itemsSummary?: Array<{
    itemId?: string;
    itemCode?: string;
    itemName?: string;
    socNumber?: string;
    orderedQuantity: number;
    orderedCartons: number;
    previousDispatchedQuantity?: number;
    previousDispatchedCartons?: number;
    dispatchedQuantity: number;
    dispatchedCartons: number;
    totalShippedQuantity: number;
    totalShippedCartons: number;
    balanceQuantity: number;
    balanceCartons: number;
    completionPercent?: number;
    isCompleted: boolean;
    uom?: string;
    packagingUnit?: string;
    packagingSize?: number;
  }>;
  relatedInvoices?: Array<{
    id: string;
    invoiceNumber?: string;
    invoiceNo?: string;
    invoiceDate: string;
    status: string;
    totalAmount: number;
    paidAmount?: number;
  }>;
  invoicedInvoice?: {
    id: string;
    invoiceNo: string;
    status: string;
    totalAmount: number;
    balance: number;
  } | null;
  invoicedInvoiceNo?: string | null;
  isInvoiced?: boolean;
}

interface DeliveryActionConfirmState {
  visible: boolean;
  actionKey: 'view' | 'print_challan' | 'gate_pass' | 'edit' | 'ship' | 'deliver' | 'confirm' | 'invoice' | 'cancel' | 'restore' | 'delete' | string;
  title: string;
  actionBadge: string;
  badgeBg: string;
  badgeColor: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  record: SalesDelivery | null;
  question: string;
  description: string;
  impactDetails: string[];
  confirmBtnText: string;
  confirmBtnColor: string;
  isDanger?: boolean;
  loading: boolean;
  loadingStep?: string;
  completed?: boolean;
  successMessage?: string;
  errorMessage?: string | null;
}

const initialConfirmModalState: DeliveryActionConfirmState = {
  visible: false,
  actionKey: 'view',
  title: '',
  actionBadge: '',
  badgeBg: '',
  badgeColor: '',
  icon: null,
  iconBg: '',
  iconColor: '',
  record: null,
  question: '',
  description: '',
  impactDetails: [],
  confirmBtnText: 'Confirm',
  confirmBtnColor: '#2563eb',
  isDanger: false,
  loading: false,
  loadingStep: '',
  completed: false,
  successMessage: '',
  errorMessage: null,
};

const LEGACY_DELIVERIES_CACHE_KEY = '/sales/deliveries';
const LEGACY_ORDERS_MODAL_CACHE_KEY = '/sales/deliveries:sales-orders';
const SALES_DELIVERIES_CACHE_KEY = '/sales/deliveries:v2';
const SALES_ORDERS_MODAL_CACHE_KEY = '/sales/deliveries:sales-orders:v2';

const STATUS_OPTIONS = ['All statuses', 'DRAFT', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'CANCELLED'];

const normalizeSalesUomCode = (raw?: string | null): string => {
  const upper = String(raw || '').toUpperCase().trim();
  if (!upper) return '';
  if (['M', 'MTR', 'METER', 'METRE', 'METERS', 'METRES'].includes(upper)) return 'M';
  if (['GRS', 'GROSS'].includes(upper)) return 'GRS';
  if (['KG', 'KGS', 'KILOGRAM', 'KILOGRAMS'].includes(upper)) return 'KG';
  if (['PC', 'PCS', 'PIECE', 'PIECES'].includes(upper)) return 'PCS';
  if (['COIL', 'COILS'].includes(upper)) return 'COILS';
  if (['CTN', 'CARTON', 'CARTONS'].includes(upper)) return 'CTN';
  if (['SET', 'SETS'].includes(upper)) return 'SET';
  if (['ROLL', 'ROLLS'].includes(upper)) return 'ROLL';
  return upper;
};

const isMeterUomCode = (uom?: string | null): boolean => normalizeSalesUomCode(uom) === 'M';

const resolveDivisionDefaultUom = (divisionCode?: string | null, divisionName?: string | null): string => {
  const divHint = `${divisionCode || ''} ${divisionName || ''}`.trim();
  if (/DIV-002|CCD|CABLE/i.test(divHint)) return 'M';
  if (/DIV-003|WRD|WIRE/i.test(divHint)) return 'KG';
  return 'GRS';
};

const formatPkgUnitLabel = (rawPkgUnit?: string | null, uomCode?: string, singular?: boolean): string => {
  const raw = String(rawPkgUnit || '').trim();
  if (/^(ctn|carton|cartons)$/i.test(raw)) return singular ? 'Carton' : 'CTN';
  if (/^(coil|coils)$/i.test(raw)) return singular ? 'Coil' : 'Coils';
  if (/^(roll|rolls)$/i.test(raw)) return singular ? 'Roll' : 'Rolls';
  if (/^(bag|bags)$/i.test(raw)) return singular ? 'Bag' : 'Bags';
  if (/^(bundle|bundles)$/i.test(raw)) return singular ? 'Bundle' : 'Bundles';
  if (raw) return raw;
  const normUom = normalizeSalesUomCode(uomCode);
  if (normUom === 'M' || normUom === 'KG') return singular ? 'Coil' : 'Coils';
  return singular ? 'Carton' : 'CTN';
};

const formatQtyClean = (val?: number | null): string => {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n - Math.round(n)) < 0.005) {
    return Math.round(n).toLocaleString('en-US');
  }
  return Number(n.toFixed(2)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const resolveDeliveryUnits = (
  record: Partial<SalesDelivery> | null | undefined,
  divisionsList: Array<{ id: string; divisionCode: string; name: string }>,
  singularPkg = false,
): { uom: string; pkgUnit: string; defaultPkgSize: number } => {
  const divId = record?.divisionId || record?.salesOrder?.divisionId || record?.salesOrder?.division?.id;
  const matchedDiv = divId ? divisionsList.find((d) => d.id === divId) : undefined;
  const divCode = record?.divisionCode || record?.salesOrder?.division?.divisionCode || matchedDiv?.divisionCode;
  const divName = record?.divisionName || record?.salesOrder?.division?.name || matchedDiv?.name;

  const firstSummary = (record?.itemsSummary || []).find((i) => Boolean(i?.uom || i?.packagingUnit));
  const firstLine = (record?.lines || []).find((l: any) => Boolean(l));

  const resolvedUom =
    normalizeSalesUomCode(record?.primaryUom) ||
    normalizeSalesUomCode(firstSummary?.uom) ||
    normalizeSalesUomCode(
      firstLine?.uom?.code ||
        firstLine?.uomCode ||
        firstLine?.item?.salesUom?.code ||
        firstLine?.item?.baseUom?.code,
    ) ||
    resolveDivisionDefaultUom(divCode, divName);

  const rawPkg =
    record?.primaryPackagingUnit ||
    firstSummary?.packagingUnit ||
    firstLine?.packagingUnit ||
    firstLine?.item?.packagingUnit ||
    null;

  const pkgUnit = formatPkgUnitLabel(rawPkg, resolvedUom, singularPkg);
  const explicitSize = Number(firstSummary?.packagingSize || firstLine?.packagingSize || firstLine?.item?.packagingSize) || 0;
  const defaultPkgSize =
    explicitSize > 1
      ? explicitSize
      : resolvedUom === 'M'
        ? 250
        : resolvedUom === 'KG'
          ? 1
          : 10;

  return { uom: resolvedUom, pkgUnit, defaultPkgSize };
};

const computeDeliveryQuantities = (
  record: SalesDelivery,
  divisionsList: Array<{ id: string; divisionCode: string; name: string }>,
) => {
  const units = resolveDeliveryUnits(record, divisionsList);
  const scaleCtn = (qty: number, explicitCtn?: number | null): number => {
    if (explicitCtn !== undefined && explicitCtn !== null && Number.isFinite(Number(explicitCtn))) {
      return Number(explicitCtn);
    }
    if (units.defaultPkgSize > 1) {
      return Number((qty / units.defaultPkgSize).toFixed(2));
    }
    return Number(qty.toFixed(2));
  };

  const dispQty = Number(record.totalDispatchQuantity ?? 0);
  const dispCtn = scaleCtn(dispQty, record.totalDispatchCartons);
  const orderQty = Number(record.totalOrderQuantity ?? 0);
  const orderCtn = scaleCtn(orderQty, record.totalOrderCartons);
  const balQty = Number(record.totalBalanceQuantity ?? (orderQty > 0 ? Math.max(0, orderQty - dispQty) : 0));
  const balCtn = scaleCtn(balQty, record.totalBalanceCartons);
  const cumQty = Number(
    record.totalDeliveredQuantity ?? (orderQty > 0 ? Math.max(0, orderQty - balQty) : dispQty),
  );
  const cumCtn = scaleCtn(cumQty, record.totalDeliveredCartons);
  const prevQty = Number(record.totalPreviousQuantity ?? Math.max(0, cumQty - dispQty));
  const prevCtn = scaleCtn(prevQty, record.totalPreviousCartons);
  const isDone = Boolean(record.isCompleted) || (orderQty > 0 && balQty <= 0.001);
  const pct =
    record.completionPercent != null
      ? Number(record.completionPercent)
      : orderQty > 0
        ? Math.min(100, Math.round((cumQty / orderQty) * 100))
        : 100;

  return {
    ...units,
    orderQty,
    orderCtn,
    prevQty,
    prevCtn,
    dispQty,
    dispCtn,
    cumQty,
    cumCtn,
    balQty,
    balCtn,
    isDone,
    pct,
  };
};

interface NormalizedSocOrderItem {
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  quantity: number;
  uomCode: string;
  packagingSize: number;
  packagingUnit: string;
  packageQuantity: number;
}

interface NormalizedSocOrderMeta {
  id?: string;
  orderNumber?: string;
  customerPo?: string | null;
  divisionCode?: string | null;
  divisionName?: string | null;
  items: NormalizedSocOrderItem[];
}

const roundDelivery2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const inferCleanPackagingSize = (
  rawSize: any,
  uomCode: string,
  itemName?: string | null,
  qty?: number,
  explicitPkgCount?: any,
): number => {
  const numericSize = Number(rawSize);
  if (Number.isFinite(numericSize) && numericSize > 1) return numericSize;
  const q = Number(qty) || 0;
  const exp = Number(explicitPkgCount);
  if (q > 0 && Number.isFinite(exp) && exp > 0) {
    // Guard against legacy /10 carton bug on meter cable items
    const looksLikeLegacyDiv10 = uomCode === 'M' && q >= 50 && Math.abs(exp - q / 10) < 0.02;
    if (!looksLikeLegacyDiv10) {
      const ratio = q / exp;
      if (ratio > 1.01) return Math.round(ratio * 1000) / 1000;
    }
  }
  if (uomCode === 'M') {
    const lower = String(itemName || '').toLowerCase();
    return lower.includes('5 mm') || lower.includes('6 mm') ? 500 : 250;
  }
  if (uomCode === 'KG') return 1;
  return 10;
};

const calcCleanPackageCount = (
  qty: number,
  pkgSize: number,
  uomCode: string,
  explicitPkg?: any,
): number => {
  const q = Number(qty) || 0;
  if (q <= 0) return 0;
  if (pkgSize > 1) return roundDelivery2(q / pkgSize);
  const exp = Number(explicitPkg);
  if (Number.isFinite(exp) && exp > 0) {
    const looksLikeLegacyDiv10 = uomCode === 'M' && q >= 50 && Math.abs(exp - q / 10) < 0.02;
    if (!looksLikeLegacyDiv10) return roundDelivery2(exp);
  }
  if (uomCode === 'GRS') return roundDelivery2(q / 10);
  return roundDelivery2(q);
};

const extractSocTokenFromText = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  const bracketMatch = String(raw).match(/\[SOC:\s*([^\]]+)\]/i);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  const inlineMatch = String(raw).match(/\bSOC[:\s]+(SOC-[A-Za-z0-9-]+|[A-Za-z0-9-]+)\b/i);
  if (inlineMatch?.[1]) return inlineMatch[1].trim();
  return undefined;
};

/**
 * Computes strict chronological point-in-time cumulative progress per SOC and per item
 * across all non-cancelled deliveries (sorted ascending by deliveryDate, then deliveryNumber),
 * never relying on retroactive final order balances.
 */
const reconcileDeliveriesPointInTime = (
  rawDeliveries: SalesDelivery[],
  salesOrdersList: any[],
  divisionsList: Array<{ id: string; divisionCode: string; name: string }>,
): SalesDelivery[] => {
  if (!Array.isArray(rawDeliveries) || rawDeliveries.length === 0) return [];

  const socOrderByNum = new Map<string, NormalizedSocOrderMeta>();
  const socOrderById = new Map<string, NormalizedSocOrderMeta>();

  const registerSocOrder = (so: any, fallbackDiv?: { divisionCode?: string | null; name?: string | null }) => {
    if (!so) return;
    const orderNum = so.orderNumber ? String(so.orderNumber).trim() : '';
    const soId = so.id ? String(so.id).trim() : '';
    if (!orderNum && !soId) return;

    const existing = (orderNum ? socOrderByNum.get(orderNum.toUpperCase()) : undefined) || (soId ? socOrderById.get(soId) : undefined);
    const rawItems = Array.isArray(so.items) ? so.items : [];
    if (existing && existing.items.length > 0 && rawItems.length === 0) return;

    const soDivId = so.divisionId || so.division_id || so.division?.id;
    const matchedDiv = soDivId ? divisionsList.find((d) => d.id === soDivId) : undefined;
    const divCode = so.division?.divisionCode || matchedDiv?.divisionCode || fallbackDiv?.divisionCode || null;
    const divName = so.division?.name || matchedDiv?.name || fallbackDiv?.name || null;
    const defaultDivUom = resolveDivisionDefaultUom(divCode, divName);

    const normalizedItems: NormalizedSocOrderItem[] = rawItems.map((oi: any) => {
      const itemObj = oi.item || {};
      const itemName = oi.itemName || itemObj.name || oi.description || 'Item';
      const uomCode =
        normalizeSalesUomCode(
          oi.uomCode || oi.uom?.code || itemObj.salesUom?.code || itemObj.baseUom?.code,
        ) || defaultDivUom;
      const qty = roundDelivery2(Number(oi.quantity ?? oi.order_qty ?? 0));
      const pkgSize = inferCleanPackagingSize(
        oi.packagingSize ?? itemObj.packagingSize ?? itemObj.packaging_size,
        uomCode,
        itemName,
        qty,
        oi.packageQuantity,
      );
      const pkgUnit = formatPkgUnitLabel(
        oi.packagingUnit ?? itemObj.packagingUnit ?? itemObj.packaging_unit,
        uomCode,
      );
      const pkgQty = calcCleanPackageCount(qty, pkgSize, uomCode, oi.packageQuantity);
      return {
        itemId: oi.itemId || oi.item_id || itemObj.id || undefined,
        itemCode: oi.itemCode || itemObj.itemCode || itemObj.item_code || undefined,
        itemName,
        quantity: qty,
        uomCode,
        packagingSize: pkgSize,
        packagingUnit: pkgUnit,
        packageQuantity: pkgQty,
      };
    });

    const meta: NormalizedSocOrderMeta = {
      id: soId || existing?.id,
      orderNumber: orderNum || existing?.orderNumber,
      customerPo: so.customerPo ?? existing?.customerPo ?? null,
      divisionCode: divCode,
      divisionName: divName,
      items: normalizedItems.length > 0 ? normalizedItems : (existing?.items || []),
    };

    if (orderNum) socOrderByNum.set(orderNum.toUpperCase(), meta);
    if (soId) socOrderById.set(soId, meta);
  };

  (salesOrdersList || []).forEach((so) => registerSocOrder(so));
  rawDeliveries.forEach((d) => {
    if (d.salesOrder) {
      registerSocOrder(d.salesOrder, { divisionCode: d.divisionCode, name: d.divisionName });
    }
  });

  interface PreparedLine {
    lineIdx: number;
    socKey: string;
    socDisplay: string;
    itemId?: string;
    itemCode?: string;
    itemName: string;
    uomCode: string;
    packagingSize: number;
    packagingUnit: string;
    dispatchedQty: number;
    dispatchedPkg: number;
    fallbackOrderedQty: number;
    fallbackOrderedPkg: number;
    fallbackPrevQty?: number;
  }

  const preparedLinesByDelivery = new Map<string, PreparedLine[]>();
  const headerSocKeyByDelivery = new Map<string, { socKey: string; socDisplay: string }>();

  for (const d of rawDeliveries) {
    const units = resolveDeliveryUnits(d, divisionsList);
    const soFromId = d.salesOrderId ? socOrderById.get(d.salesOrderId) : undefined;
    const rawHeaderSoc =
      d.salesOrder?.orderNumber ||
      soFromId?.orderNumber ||
      (Array.isArray(d.salesOrderNumbers) && d.salesOrderNumbers.length > 0 ? d.salesOrderNumbers[0] : undefined) ||
      (d.salesOrderNumber ? String(d.salesOrderNumber).split(',')[0].trim() : undefined);

    const headerSocDisplay = rawHeaderSoc ? String(rawHeaderSoc).trim() : '';
    const headerSocKey = headerSocDisplay
      ? headerSocDisplay.toUpperCase()
      : (d.salesOrderId ? `ID:${d.salesOrderId}` : '');

    if (headerSocKey) {
      headerSocKeyByDelivery.set(d.id, {
        socKey: headerSocKey,
        socDisplay: headerSocDisplay || headerSocKey,
      });
    }

    const rawLines = Array.isArray(d.lines) ? d.lines : [];
    const rawSummary = Array.isArray(d.itemsSummary) ? d.itemsSummary : [];
    const count = Math.max(rawLines.length, rawSummary.length);
    const prepared: PreparedLine[] = [];

    for (let idx = 0; idx < count; idx++) {
      const ln: any = rawLines[idx];
      const sm: any =
        rawSummary[idx] ||
        (ln
          ? rawSummary.find(
              (s) =>
                (ln.itemId && s.itemId === ln.itemId) ||
                (ln.item?.itemCode && s.itemCode === ln.item.itemCode),
            )
          : undefined);

      const lineSocRaw =
        sm?.socNumber ||
        ln?.socNumber ||
        ln?.salesOrderNumber ||
        extractSocTokenFromText(ln?.description) ||
        headerSocDisplay;
      const socDisplay = lineSocRaw ? String(lineSocRaw).trim() : '';
      const socKey = socDisplay ? socDisplay.toUpperCase() : headerSocKey;

      const rawName = sm?.itemName || ln?.item?.name || ln?.itemName || ln?.description || `Item ${idx + 1}`;
      const cleanName = String(rawName)
        .replace(/\s*\[SOC:\s*[^\]]+\]/gi, '')
        .replace(/\s*\(\d+(?:\.\d+)?\s*(?:CTN|Carton|Coil|Coils)[^)]*\)/gi, '')
        .trim();

      const itemId = sm?.itemId || ln?.itemId || ln?.item?.id || undefined;
      const itemCode = sm?.itemCode || ln?.item?.itemCode || ln?.itemCode || undefined;
      const uomCode =
        normalizeSalesUomCode(
          sm?.uom || ln?.uom?.code || ln?.uomCode || ln?.item?.salesUom?.code || ln?.item?.baseUom?.code,
        ) || units.uom;
      const dispatchedQty = roundDelivery2(Number(ln?.quantity ?? sm?.dispatchedQuantity ?? 0));
      const explicitDispPkg = sm?.dispatchedCartons ?? ln?.cartons ?? ln?.packageQuantity;
      const pkgSize = inferCleanPackagingSize(
        sm?.packagingSize ?? ln?.packagingSize ?? ln?.item?.packagingSize,
        uomCode,
        cleanName,
        dispatchedQty,
        explicitDispPkg,
      );
      const pkgUnit = formatPkgUnitLabel(
        sm?.packagingUnit || ln?.packagingUnit || ln?.item?.packagingUnit,
        uomCode,
      );
      const dispatchedPkg = calcCleanPackageCount(dispatchedQty, pkgSize, uomCode, explicitDispPkg);
      const fallbackOrderedQty = roundDelivery2(Number(sm?.orderedQuantity ?? ln?.orderQuantity ?? 0));
      const fallbackOrderedPkg =
        fallbackOrderedQty > 0
          ? calcCleanPackageCount(fallbackOrderedQty, pkgSize, uomCode, sm?.orderedCartons ?? ln?.orderCartons)
          : 0;

      prepared.push({
        lineIdx: idx,
        socKey,
        socDisplay,
        itemId,
        itemCode,
        itemName: cleanName || 'Item',
        uomCode,
        packagingSize: pkgSize,
        packagingUnit: pkgUnit,
        dispatchedQty,
        dispatchedPkg,
        fallbackOrderedQty,
        fallbackOrderedPkg,
        fallbackPrevQty:
          sm?.previousDispatchedQuantity !== undefined
            ? Number(sm.previousDispatchedQuantity)
            : undefined,
      });
    }

    preparedLinesByDelivery.set(d.id, prepared);
  }

  // Group non-cancelled deliveries per SOC and sort chronologically (deliveryDate ASC, deliveryNumber ASC)
  const deliveriesBySoc = new Map<string, SalesDelivery[]>();
  const seenDelivPerSoc = new Map<string, Set<string>>();

  for (const d of rawDeliveries) {
    if (String(d.status || '').toUpperCase() === 'CANCELLED') continue;
    const pLines = preparedLinesByDelivery.get(d.id) || [];
    const headerMeta = headerSocKeyByDelivery.get(d.id);
    const socKeys = new Set<string>();
    pLines.forEach((pl) => {
      if (pl.socKey) socKeys.add(pl.socKey);
    });
    if (socKeys.size === 0 && headerMeta?.socKey) {
      socKeys.add(headerMeta.socKey);
    }
    socKeys.forEach((socKey) => {
      let seen = seenDelivPerSoc.get(socKey);
      if (!seen) {
        seen = new Set();
        seenDelivPerSoc.set(socKey, seen);
      }
      if (!seen.has(d.id)) {
        seen.add(d.id);
        const list = deliveriesBySoc.get(socKey) || [];
        list.push(d);
        deliveriesBySoc.set(socKey, list);
      }
    });
  }

  for (const [socKey, list] of deliveriesBySoc.entries()) {
    list.sort((a, b) => {
      const da = String(a.deliveryDate || '').slice(0, 10);
      const db = String(b.deliveryDate || '').slice(0, 10);
      if (da !== db) return da.localeCompare(db);
      const na = String(a.deliveryNumber || '');
      const nb = String(b.deliveryNumber || '');
      if (na !== nb) return na.localeCompare(nb, undefined, { numeric: true, sensitivity: 'base' });
      const ca = String((a as any).createdAt || a.id || '');
      const cb = String((b as any).createdAt || b.id || '');
      return ca.localeCompare(cb);
    });
    deliveriesBySoc.set(socKey, list);
  }

  // Per-(deliveryId, lineIdx) and per-(deliveryId, socKey) point-in-time results
  const computedItemByDelivLine = new Map<string, NonNullable<SalesDelivery['itemsSummary']>[number]>();
  const computedSocByDeliv = new Map<string, any[]>();

  for (const [socKey, sortedDelivs] of deliveriesBySoc.entries()) {
    const firstDeliv = sortedDelivs[0];
    const socOrder =
      socOrderByNum.get(socKey) ||
      (firstDeliv?.salesOrderId ? socOrderById.get(firstDeliv.salesOrderId) : undefined);

    const firstUnits = resolveDeliveryUnits(firstDeliv, divisionsList);
    const origFirstSocSummary = (firstDeliv?.salesOrdersSummary || []).find(
      (s: any) => String(s?.socNumber || '').trim().toUpperCase() === socKey,
    );

    let socOrderQty = 0;
    let socOrderPkg = 0;
    if (socOrder && socOrder.items.length > 0) {
      socOrderQty = roundDelivery2(socOrder.items.reduce((acc, oi) => acc + oi.quantity, 0));
      socOrderPkg = roundDelivery2(socOrder.items.reduce((acc, oi) => acc + oi.packageQuantity, 0));
    } else {
      socOrderQty = roundDelivery2(
        Number(origFirstSocSummary?.totalOrderQuantity ?? firstDeliv?.totalOrderQuantity ?? 0),
      );
      const rawOrderPkg = origFirstSocSummary?.totalOrderCartons ?? firstDeliv?.totalOrderCartons;
      socOrderPkg = calcCleanPackageCount(
        socOrderQty,
        firstUnits.defaultPkgSize,
        firstUnits.uom,
        rawOrderPkg,
      );
    }

    // Seed baseline prior dispatch ONLY if the earliest loaded delivery in window explicitly carries prior history
    let runningSocQty =
      firstDeliv?.totalPreviousQuantity != null && Number(firstDeliv.totalPreviousQuantity) > 0
        ? roundDelivery2(Number(firstDeliv.totalPreviousQuantity))
        : 0;
    let runningSocPkg =
      firstDeliv?.totalPreviousCartons != null && Number(firstDeliv.totalPreviousCartons) > 0
        ? roundDelivery2(Number(firstDeliv.totalPreviousCartons))
        : 0;

    const runningItemQty = new Map<string, number>();
    const runningItemPkg = new Map<string, number>();

    sortedDelivs.forEach((deliv, seqIdx) => {
      const pLines = (preparedLinesByDelivery.get(deliv.id) || []).filter((pl) => pl.socKey === socKey);
      const socPrevQty = roundDelivery2(runningSocQty);
      const socPrevPkg = roundDelivery2(runningSocPkg);

      let thisSocQty = 0;
      let thisSocPkg = 0;
      let primarySocUom = firstUnits.uom;
      let primarySocPkgUnit = firstUnits.pkgUnit;

      pLines.forEach((pl, idxInSoc) => {
        const matchedSoi = socOrder?.items.find(
          (oi) =>
            (oi.itemId && pl.itemId && oi.itemId === pl.itemId) ||
            (oi.itemCode && pl.itemCode && oi.itemCode.toUpperCase() === pl.itemCode.toUpperCase()),
        );

        const resolvedUom = matchedSoi?.uomCode || pl.uomCode || firstUnits.uom;
        const resolvedPkgSize = matchedSoi?.packagingSize || pl.packagingSize || firstUnits.defaultPkgSize;
        const resolvedPkgUnit = matchedSoi?.packagingUnit || pl.packagingUnit || firstUnits.pkgUnit;

        if (idxInSoc === 0) {
          primarySocUom = resolvedUom;
          primarySocPkgUnit = resolvedPkgUnit;
        }

        const itemTrackKey =
          matchedSoi?.itemId ||
          pl.itemId ||
          (matchedSoi?.itemCode || pl.itemCode
            ? `CODE:${String(matchedSoi?.itemCode || pl.itemCode).toUpperCase()}`
            : `NAME:${pl.itemName.toUpperCase()}`);

        if (seqIdx === 0 && !runningItemQty.has(itemTrackKey) && pl.fallbackPrevQty && pl.fallbackPrevQty > 0) {
          runningItemQty.set(itemTrackKey, roundDelivery2(pl.fallbackPrevQty));
          runningItemPkg.set(
            itemTrackKey,
            calcCleanPackageCount(pl.fallbackPrevQty, resolvedPkgSize, resolvedUom),
          );
        }

        const prevQty = roundDelivery2(runningItemQty.get(itemTrackKey) || 0);
        const prevPkg = roundDelivery2(runningItemPkg.get(itemTrackKey) || 0);
        const dispQty = pl.dispatchedQty;
        const dispPkg = calcCleanPackageCount(dispQty, resolvedPkgSize, resolvedUom, pl.dispatchedPkg);
        const cumQty = roundDelivery2(prevQty + dispQty);
        const cumPkg = roundDelivery2(prevPkg + dispPkg);

        runningItemQty.set(itemTrackKey, cumQty);
        runningItemPkg.set(itemTrackKey, cumPkg);

        thisSocQty = roundDelivery2(thisSocQty + dispQty);
        thisSocPkg = roundDelivery2(thisSocPkg + dispPkg);

        const ordQty = matchedSoi ? matchedSoi.quantity : pl.fallbackOrderedQty;
        const ordPkg = matchedSoi ? matchedSoi.packageQuantity : pl.fallbackOrderedPkg;
        const balQty = ordQty > 0 ? Math.max(0, roundDelivery2(ordQty - cumQty)) : 0;
        const balPkg = ordPkg > 0 ? Math.max(0, roundDelivery2(ordPkg - cumPkg)) : 0;
        const pct =
          ordQty > 0
            ? Math.min(100, Math.round((cumQty / ordQty) * 100))
            : dispQty > 0
              ? 100
              : 0;
        const isDone = ordQty > 0 && balQty <= 0.001;

        computedItemByDelivLine.set(`${deliv.id}:${pl.lineIdx}`, {
          itemId: pl.itemId || matchedSoi?.itemId,
          itemCode: pl.itemCode || matchedSoi?.itemCode,
          itemName: pl.itemName || matchedSoi?.itemName || 'Item',
          socNumber: pl.socDisplay || socOrder?.orderNumber || undefined,
          orderedQuantity: ordQty,
          orderedCartons: ordPkg,
          previousDispatchedQuantity: prevQty,
          previousDispatchedCartons: prevPkg,
          dispatchedQuantity: dispQty,
          dispatchedCartons: dispPkg,
          totalShippedQuantity: cumQty,
          totalShippedCartons: cumPkg,
          balanceQuantity: balQty,
          balanceCartons: balPkg,
          completionPercent: pct,
          isCompleted: isDone,
          uom: resolvedUom,
          packagingUnit: resolvedPkgUnit,
          packagingSize: resolvedPkgSize,
        });
      });

      if (pLines.length === 0) {
        const delivUnits = resolveDeliveryUnits(deliv, divisionsList);
        thisSocQty = roundDelivery2(Number(deliv.totalDispatchQuantity ?? 0));
        thisSocPkg = calcCleanPackageCount(
          thisSocQty,
          delivUnits.defaultPkgSize,
          delivUnits.uom,
          deliv.totalDispatchCartons,
        );
      }

      const socCumQty = roundDelivery2(socPrevQty + thisSocQty);
      const socCumPkg = roundDelivery2(socPrevPkg + thisSocPkg);
      runningSocQty = socCumQty;
      runningSocPkg = socCumPkg;

      const socBalQty = socOrderQty > 0 ? Math.max(0, roundDelivery2(socOrderQty - socCumQty)) : 0;
      const socBalPkg = socOrderPkg > 0 ? Math.max(0, roundDelivery2(socOrderPkg - socCumPkg)) : 0;
      const socPct =
        socOrderQty > 0
          ? Math.min(100, Math.round((socCumQty / socOrderQty) * 100))
          : socOrderPkg > 0
            ? Math.min(100, Math.round((socCumPkg / socOrderPkg) * 100))
            : 100;
      const socDone =
        (socOrderQty > 0 && socBalQty <= 0.001) ||
        (socOrderQty === 0 && socOrderPkg > 0 && socBalPkg <= 0.001);

      const socDisplayLabel =
        socOrder?.orderNumber ||
        pLines[0]?.socDisplay ||
        headerSocKeyByDelivery.get(deliv.id)?.socDisplay ||
        socKey;

      const listForDeliv = computedSocByDeliv.get(deliv.id) || [];
      listForDeliv.push({
        socNumber: socDisplayLabel,
        salesOrderId: socOrder?.id || deliv.salesOrderId || null,
        uom: primarySocUom,
        packagingUnit: primarySocPkgUnit,
        dispatchOrdinal: seqIdx + 1,
        totalSocDispatches: sortedDelivs.length,
        isFinalDispatch: socDone,
        previousQuantity: socPrevQty,
        previousCartons: socPrevPkg,
        previousDispatchedQuantity: socPrevQty,
        previousDispatchedCartons: socPrevPkg,
        thisDeliveryQuantity: thisSocQty,
        thisDeliveryCartons: thisSocPkg,
        totalOrderQuantity: socOrderQty,
        totalOrderCartons: socOrderPkg,
        totalShippedQuantity: socCumQty,
        totalShippedCartons: socCumPkg,
        balanceQuantity: socBalQty,
        balanceCartons: socBalPkg,
        completionPercent: socPct,
        isCompleted: socDone,
      });
      computedSocByDeliv.set(deliv.id, listForDeliv);
    });
  }

  // Assemble reconciled delivery records
  return rawDeliveries.map((d) => {
    const units = resolveDeliveryUnits(d, divisionsList);
    const isCancelled = String(d.status || '').toUpperCase() === 'CANCELLED';
    const pLines = preparedLinesByDelivery.get(d.id) || [];
    const itemsSummary = pLines.map((pl) => {
      const fromTimeline = computedItemByDelivLine.get(`${d.id}:${pl.lineIdx}`);
      if (fromTimeline) return fromTimeline;
      return {
        itemId: pl.itemId,
        itemCode: pl.itemCode,
        itemName: pl.itemName,
        socNumber: pl.socDisplay || undefined,
        orderedQuantity: pl.fallbackOrderedQty,
        orderedCartons: pl.fallbackOrderedPkg,
        previousDispatchedQuantity: 0,
        previousDispatchedCartons: 0,
        dispatchedQuantity: pl.dispatchedQty,
        dispatchedCartons: pl.dispatchedPkg,
        totalShippedQuantity: isCancelled ? 0 : pl.dispatchedQty,
        totalShippedCartons: isCancelled ? 0 : pl.dispatchedPkg,
        balanceQuantity:
          pl.fallbackOrderedQty > 0
            ? Math.max(0, roundDelivery2(pl.fallbackOrderedQty - (isCancelled ? 0 : pl.dispatchedQty)))
            : 0,
        balanceCartons:
          pl.fallbackOrderedPkg > 0
            ? Math.max(0, roundDelivery2(pl.fallbackOrderedPkg - (isCancelled ? 0 : pl.dispatchedPkg)))
            : 0,
        completionPercent:
          pl.fallbackOrderedQty > 0
            ? Math.min(100, Math.round(((isCancelled ? 0 : pl.dispatchedQty) / pl.fallbackOrderedQty) * 100))
            : 100,
        isCompleted: false,
        uom: pl.uomCode,
        packagingUnit: pl.packagingUnit,
        packagingSize: pl.packagingSize,
      };
    });

    const socSummaries = computedSocByDeliv.get(d.id);
    if (!socSummaries || socSummaries.length === 0) {
      const dispQty =
        itemsSummary.length > 0
          ? roundDelivery2(itemsSummary.reduce((acc, it) => acc + it.dispatchedQuantity, 0))
          : roundDelivery2(Number(d.totalDispatchQuantity ?? 0));
      const dispPkg =
        itemsSummary.length > 0
          ? roundDelivery2(itemsSummary.reduce((acc, it) => acc + it.dispatchedCartons, 0))
          : calcCleanPackageCount(dispQty, units.defaultPkgSize, units.uom, d.totalDispatchCartons);
      return {
        ...d,
        primaryUom: itemsSummary[0]?.uom || units.uom,
        primaryPackagingUnit: itemsSummary[0]?.packagingUnit || units.pkgUnit,
        totalDispatchQuantity: dispQty,
        totalDispatchCartons: dispPkg,
        itemsSummary: itemsSummary.length > 0 ? itemsSummary : d.itemsSummary,
      };
    }

    const totalOrderQuantity = roundDelivery2(socSummaries.reduce((s, x) => s + x.totalOrderQuantity, 0));
    const totalOrderCartons = roundDelivery2(socSummaries.reduce((s, x) => s + x.totalOrderCartons, 0));
    const totalPreviousQuantity = roundDelivery2(socSummaries.reduce((s, x) => s + x.previousQuantity, 0));
    const totalPreviousCartons = roundDelivery2(socSummaries.reduce((s, x) => s + x.previousCartons, 0));
    const totalDispatchQuantity = roundDelivery2(socSummaries.reduce((s, x) => s + x.thisDeliveryQuantity, 0));
    const totalDispatchCartons = roundDelivery2(socSummaries.reduce((s, x) => s + x.thisDeliveryCartons, 0));
    const totalDeliveredQuantity = roundDelivery2(socSummaries.reduce((s, x) => s + x.totalShippedQuantity, 0));
    const totalDeliveredCartons = roundDelivery2(socSummaries.reduce((s, x) => s + x.totalShippedCartons, 0));
    const totalBalanceQuantity = roundDelivery2(socSummaries.reduce((s, x) => s + x.balanceQuantity, 0));
    const totalBalanceCartons = roundDelivery2(socSummaries.reduce((s, x) => s + x.balanceCartons, 0));
    const completionPercent =
      totalOrderQuantity > 0
        ? Math.min(100, Math.round((totalDeliveredQuantity / totalOrderQuantity) * 100))
        : totalOrderCartons > 0
          ? Math.min(100, Math.round((totalDeliveredCartons / totalOrderCartons) * 100))
          : 100;
    const isCompleted =
      (totalOrderQuantity > 0 && totalBalanceQuantity <= 0.001) ||
      (totalOrderQuantity === 0 && totalOrderCartons > 0 && totalBalanceCartons <= 0.001);

    return {
      ...d,
      primaryUom: itemsSummary[0]?.uom || socSummaries[0]?.uom || units.uom,
      primaryPackagingUnit: itemsSummary[0]?.packagingUnit || socSummaries[0]?.packagingUnit || units.pkgUnit,
      salesOrdersSummary: socSummaries,
      itemsSummary,
      totalOrderQuantity,
      totalOrderCartons,
      totalPreviousQuantity,
      totalPreviousCartons,
      totalDispatchQuantity,
      totalDispatchCartons,
      totalDeliveredQuantity,
      totalDeliveredCartons,
      totalBalanceQuantity,
      totalBalanceCartons,
      completionPercent,
      isCompleted,
    };
  });
};

const SalesDeliveryManagement: React.FC = () => {
  const { message, notification } = App.useApp();
  const { token } = theme.useToken();
  const location = useLocation();
  const { can, isAdmin } = usePermission();
  const canCreate = can('sales.deliveries.create');
  const canUpdate = can('sales.deliveries.update');
  const canConfirm = can('sales.deliveries.confirm');
  const canDelete = can('sales.deliveries.delete');
  const canExport = can('sales.deliveries.export');
  const canPrint = can('sales.deliveries.print');
  const canCreateInvoice = can('sales.invoices.create');
  const routeTabId = location.pathname || '/sales/deliveries';

  useEffect(() => {
    const store = useHeaderActions.getState();
    store.claimActionsSlot(routeTabId);
    return () => store.releaseActionsSlot(routeTabId);
  }, [routeTabId]);

  const initialDeliveriesCache = useMemo(
    () => tabSessionCache.get<{ data: SalesDelivery[]; total: number; nextGatePassNumber?: string }>(SALES_DELIVERIES_CACHE_KEY),
    [],
  );

  const [data, setData] = useState<SalesDelivery[]>(() => initialDeliveriesCache?.data || []);
  const [nextGatePassSuggestion, setNextGatePassSuggestion] = useState<string>(
    () => initialDeliveriesCache?.nextGatePassNumber || 'GP-0001',
  );
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(() => initialDeliveriesCache?.total || 0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Chevron Process filter state
  const [activeChevron, setActiveChevron] = useState<string>('ALL');

  // Filter States
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [divisions, setDivisions] = useState<Array<{ id: string; divisionCode: string; name: string }>>([]);
  const [filterCarrier, setFilterCarrier] = useState<string | undefined>(undefined);
  const [filterCustomer, setFilterCustomer] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterDateFrom, setFilterDateFrom] = useState<string | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');

  // Active filter count for badge
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterDivision) count++;
    if (filterCarrier) count++;
    if (filterCustomer) count++;
    if (filterStatus && filterStatus !== 'All statuses') count++;
    if (filterDateFrom) count++;
    if (filterDateTo) count++;
    return count;
  }, [filterDivision, filterCarrier, filterCustomer, filterStatus, filterDateFrom, filterDateTo]);

  // Modals
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesDelivery | null>(null);
  const [editingItem, setEditingItem] = useState<SalesDelivery | null>(null);
  const [warningModalVisible, setWarningModalVisible] = useState(false);
  const [preSaveConfirmVisible, setPreSaveConfirmVisible] = useState(false);
  const [pendingFormValues, setPendingFormValues] = useState<any>(null);
  const [pendingExcessWarnings, setPendingExcessWarnings] = useState<any[]>([]);
  const [pendingSavePayload, setPendingSavePayload] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmModal, setConfirmModal] = useState<DeliveryActionConfirmState>(initialConfirmModalState);
  const [applyingConfirmTax, setApplyingConfirmTax] = useState(false);
  const [customerCreditStatus, setCustomerCreditStatus] = useState<any>(null);
  const [creditOverrideModal, setCreditOverrideModal] = useState<{
    open: boolean;
    mode: 'save' | 'confirm';
    recordId?: string;
    message?: string;
    policy?: any;
    payload?: any;
  } | null>(null);
  const [creditOverrideReason, setCreditOverrideReason] = useState('');
  const [form] = Form.useForm();
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; name?: string; companyName?: string; customerCode?: string; divisionId?: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string; divisionId?: string }>>([]);

  // Modal Division Filter state
  const [modalDivisionId, setModalDivisionId] = useState<string | undefined>(undefined);

  // Sales Orders & PO Cascade state (lazy-loaded on modal open instead of page mount)
  const [allSalesOrders, setAllSalesOrders] = useState<any[]>(
    () => tabSessionCache.get<any[]>(SALES_ORDERS_MODAL_CACHE_KEY) || [],
  );
  const [customerSalesOrders, setCustomerSalesOrders] = useState<any[]>([]);
  const [customerPos, setCustomerPos] = useState<string[]>([]);
  const [selectedSoInfo, setSelectedSoInfo] = useState<{ orderNumber: string; customerPo?: string; pendingCount: number } | null>(null);

  const hydratedSocIdsRef = React.useRef<Set<string>>(new Set());

  const ensureSalesOrdersLoaded = useCallback(async (forceRefresh = false): Promise<any[]> => {
    if (!forceRefresh) {
      if (allSalesOrders.length > 0) return allSalesOrders;
      const cached = tabSessionCache.get<any[]>(SALES_ORDERS_MODAL_CACHE_KEY);
      if (Array.isArray(cached) && cached.length > 0) {
        setAllSalesOrders(cached);
        return cached;
      }
    }
    try {
      const soRes = await apiService.get<any>('/sales/orders', { limit: 300 }, { useEtag: !forceRefresh });
      const list = Array.isArray(soRes) ? soRes : (soRes?.data || []);
      setAllSalesOrders(list);
      tabSessionCache.set(SALES_ORDERS_MODAL_CACHE_KEY, list);
      return list;
    } catch {
      return allSalesOrders;
    }
  }, [allSalesOrders]);

  useEffect(() => {
    // Evict legacy v1 session cache keys so stale un-enriched payloads never persist
    tabSessionCache.remove(LEGACY_DELIVERIES_CACHE_KEY);
    tabSessionCache.remove(LEGACY_ORDERS_MODAL_CACHE_KEY);
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }

    // Seed divisions, customers, and warehouses synchronously from global lookupsCache
    const snap = getLookupsSnapshot();
    if (snap.divisions.length > 0) {
      setDivisions(snap.divisions as any[]);
    }
    if (snap.warehouses.length > 0) {
      setWarehouses(snap.warehouses.map((wh) => ({
        id: wh.id,
        warehouseCode: wh.warehouseCode,
        name: wh.name,
        divisionId: wh.divisionId || undefined,
      })));
    }
    if (Array.isArray(snap.customers) && snap.customers.length > 0) {
      setCustomers(snap.customers.map((cust) => ({
        id: cust.id,
        name: cust.name || cust.companyName || cust.legalName || 'Unnamed Customer',
        companyName: cust.companyName || cust.name,
        customerCode: cust.customerCode,
        divisionId: cust.divisionId || undefined,
      })));
    }

    (async () => {
      try {
        const refreshedSnap = await prefetchAllLookups();
        if (refreshedSnap.divisions.length > 0) {
          setDivisions(refreshedSnap.divisions as any[]);
        }
        if (refreshedSnap.warehouses.length > 0) {
          setWarehouses(refreshedSnap.warehouses.map((wh) => ({
            id: wh.id,
            warehouseCode: wh.warehouseCode,
            name: wh.name,
            divisionId: wh.divisionId || undefined,
          })));
        }
      } catch { /* ignore */ }
      try {
        const combinedMap = new Map<string, any>();
        try {
          const sc = await apiService.get<any>('/sales/orders/meta/customers', undefined, { useEtag: true });
          const scList = Array.isArray(sc) ? sc : (sc?.data || []);
          scList.forEach((cust: any) => {
            if (cust?.id) {
              combinedMap.set(cust.id, {
                id: cust.id,
                name: cust.companyName || cust.name || cust.legalName || 'Customer',
                companyName: cust.companyName || cust.name,
                customerCode: cust.customerCode,
                divisionId: cust.divisionId || cust.division_id || cust.division?.id,
              });
            }
          });
        } catch { /* ignore */ }

        try {
          const cachedCusts = await fetchCachedCustomers();
          cachedCusts.forEach((cust: any) => {
            if (cust?.id && !combinedMap.has(cust.id)) {
              combinedMap.set(cust.id, {
                id: cust.id,
                name: cust.name || cust.companyName || cust.legalName || 'Unnamed Customer',
                companyName: cust.companyName || cust.name,
                customerCode: cust.customerCode,
                divisionId: cust.divisionId || cust.division_id || cust.division?.id,
              });
            }
          });
        } catch { /* ignore */ }

        setCustomers(Array.from(combinedMap.values()));
      } catch { /* ignore */ }
    })();
  }, []);

  // Filter customers by selected division in modal
  const modalCustomers = useMemo(() => {
    if (!modalDivisionId) return customers;
    return customers.filter(c => {
      if (c.divisionId && c.divisionId === modalDivisionId) return true;
      return allSalesOrders.some((so: any) => so.customerId === c.id && (so.divisionId === modalDivisionId || so.division?.id === modalDivisionId));
    });
  }, [customers, modalDivisionId, allSalesOrders]);

  // Filter warehouses by selected division in modal
  const modalWarehouses = useMemo(() => {
    if (!modalDivisionId) return warehouses;
    return warehouses.filter((w: any) => w.divisionId === modalDivisionId);
  }, [warehouses, modalDivisionId]);

  const getCustomerDisplayName = useCallback((record: any): string => {
    if (!record) return '-';
    const c = record.customer;
    if (c) {
      const code = c.customerCode ? `[${c.customerCode}] ` : '';
      const name = c.companyName || c.name || c.legalName;
      if (name) return `${code}${name}`;
    }
    if (record.companyName) return record.companyName;
    if (record.customerName) return record.customerName;
    const targetId = record.customerId || (typeof record.customer === 'string' ? record.customer : record.customer?.id);
    if (targetId) {
      const found = customers.find(item => item.id === targetId);
      if (found) {
        const code = found.customerCode ? `[${found.customerCode}] ` : '';
        const name = found.companyName || found.name;
        if (name) return `${code}${name}`;
      }
    }
    return record.customerId || 'Customer';
  }, [customers]);

  const fetchData = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    const forceRefresh = Boolean(opts?.forceRefresh);
    if (!forceRefresh && tabSessionCache.has(SALES_DELIVERIES_CACHE_KEY)) {
      const cached = tabSessionCache.get<{ data: SalesDelivery[]; total: number; nextGatePassNumber?: string }>(SALES_DELIVERIES_CACHE_KEY);
      if (cached) {
        setData(cached.data || []);
        setTotal(cached.total || (cached.data || []).length);
        if (cached.nextGatePassNumber) {
          setNextGatePassSuggestion(cached.nextGatePassNumber);
        }
        return;
      }
    }
    if (forceRefresh) {
      tabSessionCache.remove(SALES_DELIVERIES_CACHE_KEY);
    }
    setLoading(true);
    try {
      const params: any = { page: 1, limit: 300 };
      const response = await apiService.get<{ data: SalesDelivery[]; total: number; nextGatePassNumber?: string }>(
        '/sales/deliveries',
        params,
        { useEtag: !forceRefresh },
      );
      const items = response.data || [];
      const resolvedTotal = response.total || items.length;
      setData(items);
      setTotal(resolvedTotal);
      if (response.nextGatePassNumber) {
        setNextGatePassSuggestion(response.nextGatePassNumber);
      }
      tabSessionCache.set(SALES_DELIVERIES_CACHE_KEY, {
        data: items,
        total: resolvedTotal,
        nextGatePassNumber: response.nextGatePassNumber,
      });
    } catch {
      message.error('Failed to fetch deliveries');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    void fetchData({ forceRefresh: false });
  }, [fetchData]);

  // Global header tab refresh
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      if (matchesTabRefresh(e, '/sales/deliveries')) {
        void fetchData({ forceRefresh: true });
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [fetchData]);

  // Auto-hydrate linked SOC items if backend/gateway list omitted `salesOrder.items` / item-level `orderedQuantity`
  useEffect(() => {
    if (data.length === 0) return;
    const missingDeliveries = data.filter((d) => {
      if (String(d.status || '').toUpperCase() === 'CANCELLED') return false;
      const hasLinkedSoc = Boolean(d.salesOrderId || d.salesOrderNumber || d.salesOrder?.orderNumber);
      if (!hasLinkedSoc) return false;
      const hasEmbeddedOrderItems = Array.isArray(d.salesOrder?.items) && d.salesOrder!.items!.length > 0;
      const hasItemOrderedQtys =
        Array.isArray(d.itemsSummary) &&
        d.itemsSummary.length > 0 &&
        d.itemsSummary.every((it) => Number(it.orderedQuantity) > 0);
      if (hasEmbeddedOrderItems || hasItemOrderedQtys) return false;
      const key = d.salesOrderId || d.salesOrder?.orderNumber || d.salesOrderNumber || '';
      if (!key || hydratedSocIdsRef.current.has(key)) return false;
      const alreadyInState = allSalesOrders.some(
        (so: any) =>
          (d.salesOrderId && so.id === d.salesOrderId) ||
          (d.salesOrder?.orderNumber && so.orderNumber === d.salesOrder.orderNumber) ||
          (d.salesOrderNumber && so.orderNumber === d.salesOrderNumber),
      );
      return !alreadyInState;
    });

    if (missingDeliveries.length === 0) return;
    missingDeliveries.forEach((d) => {
      const key = d.salesOrderId || d.salesOrder?.orderNumber || d.salesOrderNumber || '';
      if (key) hydratedSocIdsRef.current.add(key);
    });

    void (async () => {
      const loadedList = await ensureSalesOrdersLoaded(false);
      const loadedIds = new Set((loadedList || []).map((so: any) => so.id).filter(Boolean));
      const stillMissingIds = Array.from(
        new Set(
          missingDeliveries
            .map((d) => d.salesOrderId)
            .filter((id): id is string => Boolean(id && !loadedIds.has(id))),
        ),
      ).slice(0, 5);

      if (stillMissingIds.length > 0) {
        const fetched = await Promise.all(
          stillMissingIds.map((id) =>
            apiService.get<any>(`/sales/orders/${id}`).then((r) => r?.data || r).catch(() => null),
          ),
        );
        const validExtras = fetched.filter((so) => so && so.id);
        if (validExtras.length > 0) {
          setAllSalesOrders((prev) => {
            const byId = new Map(prev.map((o: any) => [o.id, o]));
            validExtras.forEach((o: any) => byId.set(o.id, o));
            const merged = Array.from(byId.values());
            tabSessionCache.set(SALES_ORDERS_MODAL_CACHE_KEY, merged);
            return merged;
          });
        }
      }
    })();
  }, [data, allSalesOrders, ensureSalesOrdersLoaded]);

  // Strict point-in-time chronological cumulative reconciliation across all loaded deliveries
  const reconciledData = useMemo(
    () => reconcileDeliveriesPointInTime(data, allSalesOrders, divisions),
    [data, allSalesOrders, divisions],
  );

  // Chevron status counts
  const chevronCounts = useMemo(() => {
    return {
      all: reconciledData.length,
      draft: reconciledData.filter(d => (d.status || '').toUpperCase() === 'DRAFT').length,
      shipped: reconciledData.filter(d => (d.status || '').toUpperCase() === 'SHIPPED').length,
      delivered: reconciledData.filter(d => ['DELIVERED', 'CONFIRMED'].includes((d.status || '').toUpperCase())).length,
      cancelled: reconciledData.filter(d => (d.status || '').toUpperCase() === 'CANCELLED').length,
    };
  }, [reconciledData]);

  // Available carriers from data
  const availableCarriers = useMemo(() => {
    const set = new Set<string>();
    reconciledData.forEach(d => { if (d.carrier) set.add(d.carrier); });
    return Array.from(set);
  }, [reconciledData]);

  // Instantaneous 0ms client-side filtering (no keystroke server refetches)
  const displayedDeliveries = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    return reconciledData.filter(d => {
      const status = (d.status || '').toUpperCase();
      // Chevron filter
      if (activeChevron === 'DRAFT' && status !== 'DRAFT') return false;
      if (activeChevron === 'SHIPPED' && status !== 'SHIPPED') return false;
      if (activeChevron === 'DELIVERED' && !['DELIVERED', 'CONFIRMED'].includes(status)) return false;
      if (activeChevron === 'CANCELLED' && status !== 'CANCELLED') return false;

      // Division filter
      if (filterDivision) {
        const divId = d.divisionId || (d as any).salesOrder?.divisionId || d.salesOrder?.division?.id;
        if (divId !== filterDivision && d.divisionName !== filterDivision && d.divisionCode !== filterDivision) {
          return false;
        }
      }

      // Carrier filter
      if (filterCarrier && d.carrier?.toLowerCase() !== filterCarrier.toLowerCase()) return false;

      // Customer filter
      if (filterCustomer && d.customerId !== filterCustomer) return false;

      // Status filter
      if (filterStatus && filterStatus !== 'All statuses' && status !== filterStatus.toUpperCase()) return false;

      // Date Range filter
      if (filterDateFrom && d.deliveryDate && dayjs(d.deliveryDate).isBefore(dayjs(filterDateFrom), 'day')) return false;
      if (filterDateTo && d.deliveryDate && dayjs(d.deliveryDate).isAfter(dayjs(filterDateTo), 'day')) return false;

      // Free-text instant search across DN#, GP#, SOC#, PO#, customer, carrier, tracking, SKU
      if (searchTerm) {
        const socTokens = Array.isArray(d.salesOrderNumbers) ? d.salesOrderNumbers.join(' ') : '';
        const itemTokens = (d.itemsSummary || [])
          .map((it) => `${it.itemCode || ''} ${it.itemName || ''} ${it.socNumber || ''}`)
          .join(' ');
        const haystack = [
          d.deliveryNumber,
          d.gatePassNumber,
          d.salesOrderNumber,
          d.salesOrder?.orderNumber,
          socTokens,
          d.customerPo,
          d.salesOrder?.customerPo,
          d.companyName,
          getCustomerDisplayName(d),
          d.carrier,
          d.trackingNumber,
          itemTokens,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }

      return true;
    });
  }, [reconciledData, activeChevron, filterDivision, filterCarrier, filterCustomer, filterStatus, filterDateFrom, filterDateTo, search, getCustomerDisplayName]);

  // Clear all filters handler (zero network traffic)
  const handleClearAll = () => {
    setActiveChevron('ALL');
    setFilterDivision(undefined);
    setFilterCarrier(undefined);
    setFilterCustomer(undefined);
    setFilterStatus(undefined);
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setSearch('');
    setPage(1);
    message.info('All filters reset');
  };

  // CSV Export
  const handleExportCsv = useCallback(() => {
    if (displayedDeliveries.length === 0) {
      message.warning('No delivery records to export');
      return;
    }
    const headers = ['Delivery #', 'Gate Pass #', 'Customer', 'Delivery Date', 'Expected Date', 'Carrier', 'Tracking #', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedDeliveries.map(d => {
      const cust = customers.find(c => c.id === d.customerId);
      const custName = cust?.companyName || cust?.name || d.companyName || d.customerId;
      return [
        `"${d.deliveryNumber}"`,
        `"${d.gatePassNumber || ''}"`,
        `"${custName}"`,
        `"${d.deliveryDate || ''}"`,
        `"${d.expectedDate || ''}"`,
        `"${d.carrier || ''}"`,
        `"${d.trackingNumber || ''}"`,
        d.subtotal || 0,
        d.taxAmount || 0,
        d.totalAmount || 0,
        `"${d.status}"`,
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `deliveries_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    message.success('Deliveries exported to CSV');
  }, [displayedDeliveries, customers, message]);

  // Print
  const handlePrint = useCallback(() => {
    const headers = ['Delivery #', 'Customer', 'Date', 'Expected Date', 'Subtotal', 'Tax', 'Total Amount', 'Status'];
    const rows = displayedDeliveries.map(del => [
      del.deliveryNumber,
      getCustomerDisplayName(del),
      del.deliveryDate || '-',
      del.expectedDate || '-',
      `Rs ${formatDecimal(del.subtotal || 0)}`,
      `Rs ${formatDecimal(del.taxAmount || 0)}`,
      `Rs ${formatDecimal(del.totalAmount || 0)}`,
      del.status,
    ]);
    printTableList('Sales Delivery Notes Report', headers, rows);
  }, [displayedDeliveries, getCustomerDisplayName]);

  // Outward Gate Pass Document Print
  const handlePrintOutwardGatePass = useCallback((record: any) => {
    const lines = record.lines || [];

    const dedupeCsvTokens = (values: Array<string | null | undefined>): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      values.forEach((val) => {
        if (!val) return;
        String(val)
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && s !== '-')
          .forEach((tok) => {
            const key = tok.toUpperCase();
            if (!seen.has(key)) {
              seen.add(key);
              out.push(tok);
            }
          });
      });
      return out;
    };

    const extractLineSoc = (l: any): string | undefined => {
      const descMatch = String(l.description || l.itemName || '').match(/\[SOC:\s*([^\]]+)\]/i);
      const raw = l.socNumber || l.salesOrderNumber || l.salesOrder?.orderNumber || descMatch?.[1];
      return raw ? String(raw).trim() : undefined;
    };

    // Calculate unique SOC numbers across line items and delivery header
    const lineSocs = lines.map(extractLineSoc).filter(Boolean) as string[];
    const uniqueSocs = dedupeCsvTokens([
      ...lineSocs,
      record.salesOrderNumber,
      record.salesOrder?.orderNumber,
    ]);
    const socDisplay = uniqueSocs.length > 0
      ? uniqueSocs.join(', ')
      : (record.salesOrderId ? `SOC-${record.salesOrderId.slice(0, 8)}` : '-');

    // Calculate unique customer POs
    const uniquePos = dedupeCsvTokens([
      ...lines.map((l: any) => l.customerPo),
      record.customerPo,
      record.salesOrder?.customerPo,
      record.poNumber,
    ]);
    const poDisplay = uniquePos.length > 0 ? uniquePos.join(', ') : '-';

    // Calculate dispatch frequency (1st time, 2nd time, etc.)
    const soId = record.salesOrderId;
    const sameSoDeliveries = soId ? data.filter((d: any) => d.salesOrderId === soId) : [];
    const dispatchIdx = sameSoDeliveries.findIndex((d: any) => d.id === record.id);
    const dispatchSeqNum = dispatchIdx >= 0 ? dispatchIdx + 1 : (sameSoDeliveries.length > 0 ? sameSoDeliveries.length + 1 : 1);
    const dispatchSequenceText = `${dispatchSeqNum === 1 ? '1st Dispatch (First Time)' : dispatchSeqNum === 2 ? '2nd Dispatch' : dispatchSeqNum === 3 ? '3rd Dispatch' : `${dispatchSeqNum}th Dispatch`}`;

    const matchedCustomer = customers.find((c) => c.id === record.customerId) || record.customer;
    const matchedOrder = allSalesOrders.find((o: any) => o.id === record.salesOrderId) || record.salesOrder;
    const resolvedDivId = record.divisionId || matchedOrder?.divisionId || matchedOrder?.division?.id || matchedCustomer?.divisionId || modalDivisionId;
    const matchedDiv = divisions.find((d) => d.id === resolvedDivId);
    const cleanDivisionName = String(matchedDiv?.name || record.divisionName || 'Spoke Division')
      .replace(/\s*\(DIV-[^)]+\)$/i, '')
      .trim() || 'Spoke Division';

    const formatDispatchOrdinal = (n: number): string => {
      const safe = Math.max(1, Math.round(n));
      const mod100 = safe % 100;
      if (mod100 >= 11 && mod100 <= 13) return `${safe}th Dispatch`;
      switch (safe % 10) {
        case 1: return `${safe}st Dispatch`;
        case 2: return `${safe}nd Dispatch`;
        case 3: return `${safe}rd Dispatch`;
        default: return `${safe}th Dispatch`;
      }
    };

    const shippedStatuses = new Set(['CONFIRMED', 'DELIVERED', 'SHIPPED']);

    // Build accurate per-SOC chronological dispatch sequences from backend summary & delivery register
    const summaryBySoc = new Map<string, any>();
    (Array.isArray(record.salesOrdersSummary) ? record.salesOrdersSummary : []).forEach((s: any) => {
      if (s?.socNumber) summaryBySoc.set(String(s.socNumber).trim().toUpperCase(), s);
    });

    const getDelivSocs = (del: any): string[] => {
      const dLines = Array.isArray(del?.lines) ? del.lines : [];
      return dedupeCsvTokens([
        del?.salesOrderNumber,
        del?.salesOrder?.orderNumber,
        ...dLines.map((dl: any) => extractLineSoc(dl)),
      ]);
    };

    // Sort all known non-cancelled deliveries chronologically: deliveryDate ASC, createdAt ASC, deliveryNumber ASC
    const allChronoDeliveries = [...data]
      .filter((d: any) => {
        const st = String(d?.status || 'DRAFT').toUpperCase();
        if (st === 'CANCELLED') return false;
        return shippedStatuses.has(st) || (record.id && d.id === record.id);
      })
      .sort((a: any, b: any) => {
        const da = String(a?.deliveryDate || '').slice(0, 10);
        const db = String(b?.deliveryDate || '').slice(0, 10);
        if (da !== db) return da.localeCompare(db);
        const ca = String(a?.createdAt || '');
        const cb = String(b?.createdAt || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a?.deliveryNumber || '').localeCompare(String(b?.deliveryNumber || ''));
      });

    if (record.id && !allChronoDeliveries.some((d: any) => d.id === record.id)) {
      allChronoDeliveries.push(record);
    }

    const socSeqLookup = new Map<string, { dispatchOrdinal: number; dispatchLabel: string; totalSocDispatches: number; isFinalDispatch?: boolean }>();
    uniqueSocs.forEach((soc) => {
      const key = soc.toUpperCase();
      const fromBackend = summaryBySoc.get(key);
      if (fromBackend?.dispatchOrdinal) {
        socSeqLookup.set(key, {
          dispatchOrdinal: Number(fromBackend.dispatchOrdinal),
          dispatchLabel: fromBackend.dispatchLabel || formatDispatchOrdinal(Number(fromBackend.dispatchOrdinal)),
          totalSocDispatches: Number(fromBackend.totalSocDispatches || fromBackend.dispatchOrdinal),
          isFinalDispatch: Boolean(fromBackend.isFinalDispatch),
        });
        return;
      }

      const matchingDelivs = allChronoDeliveries.filter((d: any) =>
        getDelivSocs(d).some((ds) => ds.toUpperCase() === key),
      );
      if (matchingDelivs.length > 0) {
        const idx = record.id ? matchingDelivs.findIndex((d: any) => d.id === record.id) : matchingDelivs.length - 1;
        const ord = idx >= 0 ? idx + 1 : matchingDelivs.length + 1;
        const tot = idx >= 0 ? matchingDelivs.length : matchingDelivs.length + 1;
        socSeqLookup.set(key, {
          dispatchOrdinal: ord,
          dispatchLabel: formatDispatchOrdinal(ord),
          totalSocDispatches: tot,
          isFinalDispatch: Boolean(fromBackend?.isCompleted),
        });
      } else {
        const ord = Number(dispatchSeqNum) || 1;
        socSeqLookup.set(key, {
          dispatchOrdinal: ord,
          dispatchLabel: formatDispatchOrdinal(ord),
          totalSocDispatches: ord,
        });
      }
    });

    // Helper: prior shipped qty across other confirmed/shipped/delivered DNs strictly matching (soc, itemId/itemCode)
    const getPriorShippedForSocItem = (soc: string | undefined, itemId: string | undefined, itemCode: string | undefined): number => {
      if (!soc) return 0;
      const socKey = soc.toUpperCase();
      let sum = 0;
      allChronoDeliveries.forEach((d: any) => {
        if (record.id && d.id === record.id) return;
        const st = String(d?.status || '').toUpperCase();
        if (!shippedStatuses.has(st)) return;
        (d.lines || []).forEach((dl: any) => {
          const dlSoc = extractLineSoc(dl) || (d.salesOrder?.orderNumber ? String(d.salesOrder.orderNumber).trim() : undefined);
          if (!dlSoc || dlSoc.toUpperCase() !== socKey) return;
          const matchesItem =
            (itemId && (dl.itemId === itemId || dl.item?.id === itemId)) ||
            (itemCode && (dl.itemCode === itemCode || dl.item?.itemCode === itemCode));
          if (matchesItem) {
            sum += Number(dl.quantity || 0);
          }
        });
      });
      return sum;
    };

    const computedItems = lines.map((it: any, idx: number) => {
      const lineSoc = extractLineSoc(it) || (uniqueSocs.length === 1 ? uniqueSocs[0] : undefined);
      const linkedOrder = (lineSoc ? allSalesOrders.find((o: any) => o.orderNumber === lineSoc) : undefined) || matchedOrder;
      const linkedOrderItem = linkedOrder?.items?.find((oi: any) =>
        (it.itemId && oi.itemId === it.itemId) || (it.itemCode && (oi.item?.itemCode === it.itemCode || oi.itemCode === it.itemCode))
      );

      const orderQty = it.orderQuantity != null
        ? Number(it.orderQuantity)
        : (it.orderedQuantity != null
          ? Number(it.orderedQuantity)
          : (linkedOrderItem?.quantity != null ? Number(linkedOrderItem.quantity) : undefined));
      const currentQty = Number(it.quantity) || 1;

      const isRecordAlreadyShipped = shippedStatuses.has(String(record.status || '').toUpperCase());
      let bal: number | undefined;
      if (it.balanceQuantity != null && isRecordAlreadyShipped) {
        bal = Number(it.balanceQuantity);
      } else if (it.orderBalance != null) {
        bal = Number(it.orderBalance) - currentQty;
      } else if (orderQty != null) {
        const priorConfirmedOther = getPriorShippedForSocItem(lineSoc, it.itemId, it.itemCode || it.item?.itemCode);
        const soShipped = Number(linkedOrderItem?.shippedQuantity ?? 0);
        const priorShipped = isRecordAlreadyShipped
          ? Math.max(soShipped, priorConfirmedOther + currentQty)
          : Math.max(soShipped, priorConfirmedOther) + currentQty;
        bal = Math.max(0, orderQty - priorShipped);
      }

      const recUnits = resolveDeliveryUnits(record, divisions, true);
      const uom =
        normalizeSalesUomCode(it.uom?.code || it.uomCode || it.uom || it.item?.salesUom?.code || it.item?.baseUom?.code) ||
        recUnits.uom;
      const isMeter = isMeterUomCode(uom);
      const pkgUnit = formatPkgUnitLabel(it.packagingUnit || it.item?.packagingUnit, uom, true);
      const pkgSize = Number(it.packagingSize || it.item?.packagingSize) || (isMeter ? 250 : uom === 'KG' ? 1 : 10);
      const pkgQty = it.packageQuantity != null
        ? Number(it.packageQuantity)
        : (pkgSize > 1 ? Number((currentQty / pkgSize).toFixed(2)) : undefined);
      const finWpm = it.finishedWeightPerMeter ?? it.item?.finishedWeightPerMeter;
      const rawWpm = it.weightPerMeter ?? it.item?.weightPerMeter;
      const effectiveWpm = isMeter
        ? ((finWpm != null && Number(finWpm) > 0) ? Number(finWpm) : ((rawWpm != null && Number(rawWpm) > 0) ? Number(rawWpm) : 0))
        : 0;
      const meterWeightKg = isMeter && effectiveWpm > 0
        ? Number((currentQty * effectiveWpm).toFixed(3))
        : (isMeter && it.totalWeightKg != null ? Number(it.totalWeightKg) : undefined);

      const rawItemName = it.item?.name || it.itemName || it.description || `Delivered Product ${idx + 1}`;
      const cleanItemName = String(rawItemName)
        .replace(/\s*\[SOC:\s*[^\]]+\]/gi, '')
        .replace(/\s*\(\d+(?:\.\d+)?\s*(?:CTN|Carton|Coil|Coils)[^)]*\)/gi, '')
        .trim();

      const seqMeta = lineSoc ? socSeqLookup.get(lineSoc.toUpperCase()) : undefined;
      const rowOrdinal = it.dispatchOrdinal != null ? Number(it.dispatchOrdinal) : seqMeta?.dispatchOrdinal;
      const rowTotalDispatches = it.totalSocDispatches != null ? Number(it.totalSocDispatches) : seqMeta?.totalSocDispatches;
      const rowLabel = it.dispatchLabel || seqMeta?.dispatchLabel || (rowOrdinal ? formatDispatchOrdinal(rowOrdinal) : undefined);
      const safeBal = bal != null ? Math.max(0, Math.round(bal * 100) / 100) : undefined;
      const rowIsFinal = it.isFinalDispatch !== undefined
        ? Boolean(it.isFinalDispatch)
        : (orderQty != null && safeBal != null && safeBal <= 0.001);

      return {
        itemCode: it.itemCode || it.item?.itemCode || `SKU-00${idx + 1}`,
        itemName: cleanItemName,
        socNumber: lineSoc,
        customerPo: it.customerPo || linkedOrder?.customerPo || (uniquePos.length === 1 ? uniquePos[0] : undefined),
        orderQuantity: orderQty,
        quantity: currentQty,
        balanceQuantity: safeBal,
        dispatchOrdinal: rowOrdinal,
        dispatchLabel: rowLabel,
        totalSocDispatches: rowTotalDispatches,
        isFinalDispatch: rowIsFinal,
        uom,
        packageQuantity: pkgQty,
        packagingUnit: pkgUnit,
        packagingSize: pkgSize > 0 ? pkgSize : undefined,
        packaging: pkgQty != null && pkgQty > 0 ? `${formatQtyClean(pkgQty)} ${pkgUnit}` : (it.packaging || `${formatQtyClean(currentQty)} ${uom}`),
        weightKg: meterWeightKg,
        weightPerMeter: effectiveWpm > 0 ? effectiveWpm : undefined,
        remarks: it.remarks || it.notes || '-',
      };
    });

    const dispatchSequences = uniqueSocs.map((soc) => {
      const meta = socSeqLookup.get(soc.toUpperCase());
      const matchingItems = computedItems.filter((ci: any) => ci.socNumber && ci.socNumber.toUpperCase() === soc.toUpperCase());
      const allSocLinesFinal = meta?.isFinalDispatch !== undefined
        ? meta.isFinalDispatch
        : (matchingItems.length > 0 && matchingItems.every((ci: any) => ci.balanceQuantity != null && ci.balanceQuantity <= 0.001));
      const ord = meta?.dispatchOrdinal || 1;
      return {
        socNumber: soc,
        dispatchOrdinal: ord,
        dispatchLabel: meta?.dispatchLabel || formatDispatchOrdinal(ord),
        totalSocDispatches: meta?.totalSocDispatches || ord,
        isFinalDispatch: allSocLinesFinal,
      };
    });

    const dispatchSequenceSummary = dispatchSequences.length > 0
      ? dispatchSequences.map((s) => `${s.socNumber}: ${s.dispatchLabel}`).join(' · ')
      : dispatchSequenceText;

    printGatePassDocument({
      passType: 'OUTWARD',
      gatePassNo: record.gatePassNumber?.trim() || `GP-OUT-${record.deliveryNumber?.replace(/[^a-zA-Z0-9]/g, '') || Date.now().toString().slice(-6)}`,
      referenceNo: record.deliveryNumber,
      customerPo: poDisplay,
      socNumber: socDisplay,
      divisionName: cleanDivisionName,
      dispatchSequence: dispatchSequenceSummary,
      dispatchSequences,
      date: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      time: dayjs().format('hh:mm A'),
      partyName: record.companyName || matchedCustomer?.companyName || matchedCustomer?.name || getCustomerDisplayName(record.customerId) || 'Valued Customer',
      vehicleNumber: record.vehicleNo || record.vehicleNumber || record.trackingNumber || 'Company Vehicle Fleet',
      driverName: record.driverName || record.driver || 'Driver on Duty',
      driverCnic: record.driverCnic || record.cnic,
      transporter: record.carrier || record.transporter || 'PWI Logistics Dispatch',
      remarks: record.notes || 'Outward customer delivery dispatch under security authorization',
      items: computedItems,
    });
  }, [allSalesOrders, customers, data, divisions, getCustomerDisplayName, modalDivisionId]);

  const handleCreate = useCallback(async () => {
    setEditingItem(null);
    setSelectedSoInfo(null);
    setCustomerCreditStatus(null);
    setCustomerSalesOrders([]);
    setCustomerPos([]);
    setModalDivisionId(filterDivision || undefined);
    form.resetFields();
    form.setFieldsValue({
      divisionId: filterDivision || undefined,
      subtotal: 0, taxAmount: 0, totalAmount: 0,
      deliveryDate: dayjs().format('YYYY-MM-DD'),
      expectedDate: dayjs().add(3, 'day').format('YYYY-MM-DD'),
      gatePassNumber: nextGatePassSuggestion || 'GP-0001',
    });
    setLineItems([]);
    setModalVisible(true);
    try {
      const [, gpRes] = await Promise.all([
        ensureSalesOrdersLoaded(false),
        apiService.get<any>('/sales/deliveries/next-gate-pass').catch(() => null),
      ]);
      const suggestedGp = gpRes?.data?.nextGatePassNumber || gpRes?.nextGatePassNumber;
      if (suggestedGp) {
        setNextGatePassSuggestion(suggestedGp);
        const currentVal = form.getFieldValue('gatePassNumber');
        if (!currentVal || currentVal === nextGatePassSuggestion || currentVal === 'GP-0001') {
          form.setFieldValue('gatePassNumber', suggestedGp);
        }
      }
    } catch { /* ignore */ }
  }, [ensureSalesOrdersLoaded, form, filterDivision, nextGatePassSuggestion]);

  // Register action buttons into Main Header (Top Application Header)
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'new-delivery',
        node: canCreate ? (
          <Button
            className="btn-new-invoice"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            + New Delivery
          </Button>
        ) : null,
      },
      {
        key: 'refresh',
        node: (
          <Button
            className="btn-inv-white"
            icon={<ReloadOutlined />}
            onClick={() => void fetchData({ forceRefresh: true })}
          >
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv',
        node: canExport ? (
          <Button
            className="btn-inv-white"
            icon={<FileExcelOutlined />}
            onClick={handleExportCsv}
          >
            CSV
          </Button>
        ) : null,
      },
      {
        key: 'print',
        node: canPrint ? (
          <Button
            className="btn-inv-white"
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            Print
          </Button>
        ) : null,
      },
    ], routeTabId);

    return () => {
      clearHeaderActions(routeTabId);
    };
  }, [routeTabId, canCreate, canExport, canPrint, handleCreate, handleExportCsv, handlePrint, fetchData]);

  const handleModalDivisionChange = (divisionId?: string) => {
    setModalDivisionId(divisionId);
    form.setFieldsValue({
      divisionId,
      customerId: undefined,
      warehouseId: undefined,
      salesOrderId: undefined,
      salesOrderIds: [],
      customerPo: undefined,
    });
    setSelectedSoInfo(null);
    setLineItems([]);
    setCustomerSalesOrders([]);
    setCustomerPos([]);
  };

  const handleCustomerChange = (customerId: string) => {
    form.setFieldsValue({ customerId, salesOrderId: undefined, salesOrderIds: [], customerPo: undefined });
    setSelectedSoInfo(null);
    setLineItems([]);
    if (customerId) {
      apiService
        .get<any>(`/sales/receipts/customer/${customerId}/credit-status`)
        .then((res) => setCustomerCreditStatus(res?.data || res))
        .catch(() => setCustomerCreditStatus(null));
    } else {
      setCustomerCreditStatus(null);
    }

    const currentDivId = modalDivisionId || form.getFieldValue('divisionId');

    // Filter active orders for this customer (not cancelled, has balance or status != DELIVERED)
    // AND matching division if division is selected
    const matchingOrders = allSalesOrders.filter((so: any) => {
      if (so.customerId !== customerId) return false;
      if (currentDivId) {
        const soDiv = so.divisionId || so.division_id || so.division?.id;
        if (soDiv && soDiv !== currentDivId) return false;
      }
      const status = (so.status || '').toUpperCase();
      if (status === 'CANCELLED') return false;
      if (so.items && Array.isArray(so.items) && so.items.length > 0) {
        const remaining = so.items.reduce((acc: number, it: any) => {
          const qty = Number(it.quantity) || 0;
          const shipped = Number(it.shippedQuantity ?? it.shipped_quantity) || 0;
          return acc + Math.max(0, qty - shipped);
        }, 0);
        return remaining > 0;
      }
      return status !== 'DELIVERED';
    });

    setCustomerSalesOrders(matchingOrders);

    // Extract unique non-empty PO numbers
    const pos = Array.from(new Set(matchingOrders.map((o: any) => o.customerPo).filter((p: any) => Boolean(p && String(p).trim())))) as string[];
    setCustomerPos(pos);
  };

  const handleSalesOrdersChange = (soIds: string | string[], preMatchedOrder?: any) => {
    const ids = Array.isArray(soIds) ? soIds : (soIds ? [soIds] : []);
    if (ids.length === 0) {
      form.setFieldsValue({ salesOrderIds: [], salesOrderId: undefined });
      setSelectedSoInfo(null);
      setLineItems([]);
      return;
    }

    const selectedOrders = ids
      .map(id => preMatchedOrder?.id === id ? preMatchedOrder : allSalesOrders.find((o: any) => o.id === id) || customerSalesOrders.find((o: any) => o.id === id))
      .filter(Boolean);

    if (selectedOrders.length === 0) {
      setSelectedSoInfo(null);
      return;
    }

    const linkedOrderNumbers = selectedOrders.map((o: any) => o.orderNumber).filter(Boolean);
    const linkedPos = Array.from(new Set(selectedOrders.map((o: any) => o.customerPo).filter(Boolean))) as string[];

    form.setFieldsValue({
      salesOrderIds: ids,
      salesOrderId: ids[0],
      customerPo: linkedPos.length > 0 ? linkedPos.join(', ') : form.getFieldValue('customerPo'),
      expectedDate: selectedOrders[0]?.deliveryDate ? dayjs(selectedOrders[0].deliveryDate).format('YYYY-MM-DD') : form.getFieldValue('expectedDate'),
    });

    // Populate balance lines from ALL selected SOCs, strictly accounting for prior dispatches
    const allPendingLines: ERPLine[] = [];
    selectedOrders.forEach((order: any) => {
      // Map already dispatched quantities per item from prior deliveries strictly for THIS specific SOC
      // Accounting for multi-SOC deliveries where each line carries its own SOC in [SOC: ...]
      const itemDispatchedMap: Record<string, number> = {};
      data.forEach((del: any) => {
        if ((del.status || '').toUpperCase() === 'CANCELLED') return;
        if (editingItem && del.id === editingItem.id) return;

        (del.lines || []).forEach((l: any) => {
          const lSoc = l.socNumber || l.salesOrderNumber || (l.description?.match(/\[SOC:\s*([^\]]+)\]/i)?.[1]?.trim()) || (l.description?.match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i)?.[1]?.trim());
          const matchesThisOrder = lSoc ? (lSoc === order.orderNumber) : (del.salesOrderId === order.id || del.salesOrderNumber === order.orderNumber);
          if (!matchesThisOrder) return;

          const keyById = String(l.itemId || l.item_id || '');
          const keyByCode = String(l.itemCode || '');
          const qty = Number(l.quantity) || 0;
          if (keyById) itemDispatchedMap[keyById] = (itemDispatchedMap[keyById] || 0) + qty;
          if (keyByCode && keyByCode !== keyById) itemDispatchedMap[keyByCode] = (itemDispatchedMap[keyByCode] || 0) + qty;
        });
      });

      const orderLines: ERPLine[] = (order.items || [])
        .map((it: any, idx: number) => {
          const qty = Number(it.quantity) || 0;
          const dbShipped = Number(it.shippedQuantity ?? it.shipped_quantity) || 0;
          const keyById = String(it.itemId || it.item_id || '');
          const keyByCode = String(it.item?.itemCode || it.itemCode || '');
          const priorShipped = (keyById ? itemDispatchedMap[keyById] : 0) || (keyByCode ? itemDispatchedMap[keyByCode] : 0) || 0;
          const totalAlreadyShipped = Math.max(dbShipped, priorShipped);
          const balance = Math.max(0, qty - totalAlreadyShipped);

          const itemObj = it.item || {};
          const itemName = itemObj.name || it.description || 'Product';
          const itemCodeStr = String(itemObj.itemCode ?? itemObj.item_code ?? it.itemCode ?? '');
          const matchedOrderDiv = divisions.find((d) => d.id === (order.divisionId || order.division?.id || modalDivisionId));
          const fallbackDivUom = resolveDivisionDefaultUom(
            matchedOrderDiv?.divisionCode || order.division?.divisionCode,
            matchedOrderDiv?.name || order.division?.name,
          );
          const uomCodeStr =
            normalizeSalesUomCode(it.uom?.code ?? it.uom?.name ?? itemObj.salesUom?.code ?? itemObj.baseUom?.code) ||
            fallbackDivUom;
          const isMeter = isMeterUomCode(uomCodeStr);
          const isCsItem = /\(cs\)/i.test(itemName) || /spk-011|spk-012/i.test(itemCodeStr);
          const defaultPkgGross = isMeter ? 250 : uomCodeStr === 'KG' ? 1 : (isCsItem ? 10.556 : 10);
          let pkgSize = Number(itemObj.packagingSize ?? itemObj.packaging_size) || defaultPkgGross;
          if (pkgSize <= 1 && isMeter) {
            const lower = itemName.toLowerCase();
            if (lower.includes('5 mm') || lower.includes('6 mm')) pkgSize = 500;
            else if (lower.includes('7 mm') || lower.includes('8 mm')) pkgSize = 250;
          }
          const pkgUnit = formatPkgUnitLabel(itemObj.packagingUnit ?? itemObj.packaging_unit, uomCodeStr);
          const pkgQty = pkgSize > 1 ? Number((balance / pkgSize).toFixed(2)) : balance;
          const unitPrice = Number(it.unitPrice ?? it.unit_price) || 0;
          const rawTaxRate = it.taxRate ?? it.tax_rate;
          const taxRate = rawTaxRate !== undefined && rawTaxRate !== null ? Number(rawTaxRate) : 18;
          const weightPerMeter = itemObj.weightPerMeter ?? itemObj.weight_per_meter ?? null;
          const finishedWeightPerMeter = itemObj.finishedWeightPerMeter ?? itemObj.finished_weight_per_meter ?? null;

          return {
            id: `so-line-${order.id}-${idx}-${Date.now()}`,
            itemId: it.itemId || it.item_id,
            itemCode: itemObj.itemCode ?? itemObj.item_code ?? it.itemCode,
            itemName,
            uomId: it.uomId ?? it.uom_id,
            uomCode: uomCodeStr,
            packagingSize: pkgSize,
            packagingUnit: pkgUnit,
            packageQuantity: pkgQty,
            weightPerMeter,
            finishedWeightPerMeter,
            quantity: balance,
            rate: unitPrice,
            taxPercent: taxRate,
            discountPercent: 0,
            lineTotal: Math.round(balance * unitPrice * (1 + taxRate / 100) * 100) / 100,
            salesOrderId: order.id,
            salesOrderNumber: order.orderNumber,
            customerPo: order.customerPo,
            orderQuantity: qty,
            pastReceived: totalAlreadyShipped,
            orderBalance: balance,
          };
        })
        .filter((line: ERPLine) => Number(line.quantity || 0) > 0);

      allPendingLines.push(...orderLines);
    });

    setLineItems(allPendingLines);
    setSelectedSoInfo({
      orderNumber: linkedOrderNumbers.join(', '),
      customerPo: linkedPos.join(', '),
      pendingCount: allPendingLines.length,
    });
    if (allPendingLines.length === 0 && selectedOrders.length > 0) {
      Modal.info({
        title: 'SOC 100% Fulfilled',
        content: `All items for the selected Sales Order Confirmation (${linkedOrderNumbers.join(', ')}) have already been completely dispatched in prior deliveries! No pending balance remains to dispatch.`,
      });
    } else {
      message.success(`${selectedOrders.length} SOC(s) linked: ${allPendingLines.length} pending balance item(s) loaded`);
    }
  };

  const handleSalesOrderChange = handleSalesOrdersChange;

  const handleCustomerPoChange = (po: string) => {
    form.setFieldValue('customerPo', po);
    const matchedOrders = customerSalesOrders.filter((o: any) => o.customerPo === po);
    if (matchedOrders.length > 0) {
      handleSalesOrdersChange(matchedOrders.map((o: any) => o.id));
    }
  };

  const buildCurrentDeliveryDraft = () => {
    const values = form.getFieldsValue();
    const matchedCustomer = customers.find(c => c.id === values.customerId);
    const custName = matchedCustomer ? (matchedCustomer.companyName || matchedCustomer.name) : 'Customer';
    const soIds = Array.isArray(values.salesOrderIds) ? values.salesOrderIds : (values.salesOrderId ? [values.salesOrderId] : []);
    const matchedOrders = allSalesOrders.filter(o => soIds.includes(o.id));
    const uniqueOrderNumbers = Array.from(
      new Set([
        ...matchedOrders.map(o => o.orderNumber),
        ...lineItems.map(l => l.salesOrderNumber),
      ].filter(Boolean))
    );
    const orderNumbers = uniqueOrderNumbers.join(', ');
    const uniquePoNumbers = Array.from(new Set(matchedOrders.map(o => o.customerPo).filter(Boolean)));
    const warehouse = warehouses.find(w => w.id === values.warehouseId);
    const matchedDivision = divisions.find(d => d.id === (values.divisionId || modalDivisionId || matchedCustomer?.divisionId));
    const draftSummary = summarizeLinesTaxVerification(lineItems, 18);

    return {
      id: editingItem?.id || 'draft-preview',
      deliveryNumber: editingItem?.deliveryNumber || 'DRAFT-DN',
      salesOrderId: soIds[0] || values.salesOrderId,
      salesOrderNumber: orderNumbers || (values.salesOrderId ? `SO-${values.salesOrderId.slice(0, 8)}` : undefined),
      salesOrder: matchedOrders[0],
      customerPo: values.customerPo || uniquePoNumbers.join(', '),
      customerId: values.customerId,
      companyName: custName,
      customer: matchedCustomer,
      divisionId: values.divisionId || modalDivisionId,
      divisionName: matchedDivision?.name,
      deliveryDate: values.deliveryDate || dayjs().format('YYYY-MM-DD'),
      expectedDate: values.expectedDate,
      warehouseId: values.warehouseId,
      warehouseName: warehouse?.name,
      carrier: values.carrier || 'PWI Logistics Dispatch',
      trackingNumber: values.trackingNumber || '-',
      gatePassNumber: values.gatePassNumber?.trim() || editingItem?.gatePassNumber || null,
      notes: values.notes,
      subtotal: draftSummary.subtotal,
      taxAmount: draftSummary.taxAmount,
      totalAmount: draftSummary.grandTotal,
      status: editingItem?.status || 'DRAFT',
      lines: lineItems.map((l, idx) => {
        const uom = l.uomCode || 'M';
        const qty = Number(l.quantity) || 1;
        const rate = Number(l.rate) || 0;
        const taxPct = l.taxPercent !== undefined && l.taxPercent !== null ? Number(l.taxPercent) : 18;
        const lineSub = Math.round(qty * rate * 100) / 100;
        const lineTax = Math.round(lineSub * (taxPct / 100) * 100) / 100;
        const lineTot = Math.round((lineSub + lineTax) * 100) / 100;
        const isMeter = isMeterUomCode(uom);
        const effWpm = isMeter
          ? ((l.finishedWeightPerMeter != null && Number(l.finishedWeightPerMeter) > 0)
            ? Number(l.finishedWeightPerMeter)
            : ((l.weightPerMeter != null && Number(l.weightPerMeter) > 0) ? Number(l.weightPerMeter) : 0))
          : 0;
        const totalWeightKg = isMeter && effWpm > 0 ? Number((qty * effWpm).toFixed(3)) : undefined;
        return {
          id: l.id || `line-${idx}`,
          itemId: l.itemId,
          itemCode: l.itemCode,
          description: (l.itemName || (l as any).description || 'Item') + (l.salesOrderNumber ? ` [SOC: ${l.salesOrderNumber}]` : ''),
          itemName: l.itemName || 'Item',
          salesOrderNumber: l.salesOrderNumber,
          socNumber: l.salesOrderNumber,
          customerPo: l.customerPo,
          orderQuantity: l.orderQuantity,
          orderBalance: l.orderBalance,
          quantity: qty,
          packageQuantity: l.packageQuantity,
          packagingUnit: l.packagingUnit,
          packagingSize: l.packagingSize,
          uomCode: uom,
          weightPerMeter: l.weightPerMeter ?? null,
          finishedWeightPerMeter: l.finishedWeightPerMeter ?? null,
          ...(totalWeightKg != null ? { totalWeightKg } : {}),
          unitPrice: rate,
          taxAmount: lineTax,
          lineTotal: lineTot,
        };
      }),
    };
  };

  const handleModalPreviewGatePass = () => {
    const draft = buildCurrentDeliveryDraft();
    if (draft.lines.length === 0) {
      message.warning('Please add at least one line item to preview the gate pass');
      return;
    }
    handlePrintOutwardGatePass(draft as any);
  };

  const handleModalPrintChallan = () => {
    const draft = buildCurrentDeliveryDraft();
    if (draft.lines.length === 0) {
      message.warning('Please add at least one line item to print the delivery challan');
      return;
    }
    printDeliveryNoteDocument(draft as any);
  };

  const handleEdit = async (record: SalesDelivery) => {
    setEditingItem(record);
    let fullDelivery = record;
    let loadedOrders = allSalesOrders;
    try {
      const [response, soList] = await Promise.all([
        apiService.get<any>(`/sales/deliveries/${record.id}`),
        ensureSalesOrdersLoaded(false),
      ]);
      fullDelivery = (response as any)?.data || response;
      if (Array.isArray(soList) && soList.length > 0) loadedOrders = soList;
    } catch {
      // fallback to record
    }

    const matchedCustomer = customers.find(c => c.id === fullDelivery.customerId);
    const matchedWh = warehouses.find(w => w.id === fullDelivery.warehouseId);
    const matchedOrder = loadedOrders.find((o: any) => o.id === fullDelivery.salesOrderId);
    const resolvedDivId = (fullDelivery as any).divisionId || matchedCustomer?.divisionId || (matchedOrder?.divisionId || matchedOrder?.division?.id) || matchedWh?.divisionId;
    setModalDivisionId(resolvedDivId || undefined);

    if (fullDelivery.customerId) {
      const orders = loadedOrders.filter((o: any) => {
        if (o.customerId !== fullDelivery.customerId) return false;
        if (resolvedDivId) {
          const soDiv = o.divisionId || o.division_id || o.division?.id;
          if (soDiv && soDiv !== resolvedDivId) return false;
        }
        return true;
      });
      setCustomerSalesOrders(orders);
      const pos = Array.from(new Set(orders.map((o: any) => o.customerPo).filter((p: any) => Boolean(p && String(p).trim())))) as string[];
      setCustomerPos(pos);
    }
    if (fullDelivery.salesOrderId) {
      if (matchedOrder) {
        setSelectedSoInfo({
          orderNumber: matchedOrder.orderNumber,
          customerPo: (fullDelivery as any).customerPo || matchedOrder.customerPo,
          pendingCount: fullDelivery.lines?.length || 0,
        });
      }
    } else {
      setSelectedSoInfo(null);
    }

    form.setFieldsValue({
      divisionId: resolvedDivId,
      salesOrderId: fullDelivery.salesOrderId,
      salesOrderIds: fullDelivery.salesOrderId ? [fullDelivery.salesOrderId] : [],
      customerPo: (fullDelivery as any).customerPo || (fullDelivery as any).salesOrder?.customerPo,
      customerId: fullDelivery.customerId,
      deliveryDate: fullDelivery.deliveryDate ? dayjs(fullDelivery.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
      expectedDate: fullDelivery.expectedDate ? dayjs(fullDelivery.expectedDate).format('YYYY-MM-DD') : undefined,
      warehouseId: fullDelivery.warehouseId,
      carrier: fullDelivery.carrier,
      trackingNumber: fullDelivery.trackingNumber,
      gatePassNumber: fullDelivery.gatePassNumber || '',
      notes: fullDelivery.notes,
    });
    if (fullDelivery.lines && Array.isArray(fullDelivery.lines) && fullDelivery.lines.length > 0) {
      const editUnits = resolveDeliveryUnits(fullDelivery, divisions);
      setLineItems(fullDelivery.lines.map((l: any, idx: number) => {
        const descSocMatch = String(l.description || '').match(/\[SOC:\s*([^\]]+)\]/i);
        const lineSocNo = l.salesOrderNumber || l.salesOrder?.orderNumber || descSocMatch?.[1]?.trim() || matchedOrder?.orderNumber;
        const lineOrder = (lineSocNo ? loadedOrders.find((o: any) => o.orderNumber === lineSocNo) : undefined) || matchedOrder;
        const lineOrderItem = lineOrder?.items?.find((oi: any) =>
          (l.itemId && oi.itemId === l.itemId) || (l.item?.itemCode && oi.item?.itemCode === l.item.itemCode)
        );
        const rawItemName = l.item?.name || l.description || 'Item';
        const cleanItemName = String(rawItemName)
          .replace(/\s*\[SOC:\s*[^\]]+\]/gi, '')
          .replace(/\s*\(\d+(?:\.\d+)?\s*(?:CTN|Carton|Coil|Coils)[^)]*\)/gi, '')
          .trim();
        const resolvedUom =
          normalizeSalesUomCode(l.uom?.code || l.uomCode || l.item?.salesUom?.code || l.item?.baseUom?.code) ||
          editUnits.uom;
        const resolvedQty = Number(l.quantity) || 1;
        const pkgSize = Number(l.item?.packagingSize || l.packagingSize) || (isMeterUomCode(resolvedUom) ? 250 : resolvedUom === 'KG' ? 1 : 10);
        const pkgUnit = formatPkgUnitLabel(l.item?.packagingUnit || l.packagingUnit, resolvedUom, true);
        const pkgQty = pkgSize > 1 ? Number((resolvedQty / pkgSize).toFixed(2)) : undefined;
        const lineOrderQty = l.orderQuantity != null
          ? Number(l.orderQuantity)
          : (lineOrderItem?.quantity != null ? Number(lineOrderItem.quantity) : undefined);

        // Sum already-shipped qty across other confirmed/shipped/delivered deliveries strictly for this SOC & item
        let priorOtherShipped = 0;
        if (lineSocNo) {
          data.forEach((del: any) => {
            if (del.id === fullDelivery.id) return;
            const st = String(del?.status || '').toUpperCase();
            if (!['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(st)) return;
            (del.lines || []).forEach((dl: any) => {
              const dlSoc = dl.socNumber || dl.salesOrderNumber || dl.description?.match(/\[SOC:\s*([^\]]+)\]/i)?.[1]?.trim() || del.salesOrder?.orderNumber;
              if (!dlSoc || dlSoc.toUpperCase() !== lineSocNo.toUpperCase()) return;
              const matches = (l.itemId && (dl.itemId === l.itemId || dl.item?.id === l.itemId)) ||
                (l.item?.itemCode && (dl.itemCode === l.item.itemCode || dl.item?.itemCode === l.item.itemCode));
              if (matches) priorOtherShipped += Number(dl.quantity || 0);
            });
          });
        }
        const soDbShipped = Number(lineOrderItem?.shippedQuantity ?? 0);
        const isCurrentShipped = ['CONFIRMED', 'SHIPPED', 'DELIVERED'].includes(String(fullDelivery.status || '').toUpperCase());
        const pastShipped = Math.max(priorOtherShipped, isCurrentShipped ? Math.max(0, soDbShipped - resolvedQty) : soDbShipped);
        const preDispatchBalance = lineOrderQty != null ? Math.max(0, lineOrderQty - pastShipped) : undefined;

        return {
          id: l.id || `line-${idx}`,
          itemId: l.itemId,
          itemCode: l.item?.itemCode || l.itemCode,
          itemName: cleanItemName,
          uomId: l.uomId || l.item?.uomId,
          uomCode: resolvedUom,
          packagingSize: pkgSize || undefined,
          packagingUnit: pkgUnit,
          packageQuantity: pkgQty,
          salesOrderId: lineOrder?.id || fullDelivery.salesOrderId,
          salesOrderNumber: lineSocNo,
          customerPo: lineOrder?.customerPo || (fullDelivery as any).customerPo,
          orderQuantity: lineOrderQty,
          pastReceived: lineOrderQty != null ? pastShipped : undefined,
          orderBalance: preDispatchBalance,
          warehouseId: l.warehouseId || fullDelivery.warehouseId,
          quantity: resolvedQty,
          rate: Number(l.unitPrice ?? l.rate) || 0,
          taxPercent: resolveEffectiveTaxPercent(l, 18),
          discountPercent: Number(l.discountPercent) || 0,
          lineTotal: Number(l.lineTotal) || ((Number(l.quantity) || 1) * (Number(l.unitPrice ?? l.rate) || 0)),
        };
      }));
    } else {
      setLineItems([]);
    }
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesDelivery) => {
    try {
      const response = await apiService.get<any>(`/sales/deliveries/${record.id}`);
      const data = (response as any)?.data || response;
      setDetailItem(data);
      setDetailVisible(true);
    } catch {
      setDetailItem(record);
      setDetailVisible(true);
    }
  };

  const executeSave = async (payloadOverride?: any) => {
    if (isSubmitting) return;
    const payload = payloadOverride || pendingSavePayload;
    if (!payload) return;
    setIsSubmitting(true);
    try {
      let res: any;
      if (editingItem) {
        res = await apiService.patch(`/sales/deliveries/${editingItem.id}`, payload);
      } else {
        res = await apiService.post('/sales/deliveries', payload);
      }
      const saved = (res as any)?.data || res || {};
      const dnNumber = saved.deliveryNumber || editingItem?.deliveryNumber || 'DN-2026-NEW';
      const gpNumber =
        saved.gatePassNumber ||
        payload.gatePassNumber ||
        editingItem?.gatePassNumber ||
        nextGatePassSuggestion ||
        'Auto-Assigned';
      const custObj = customers.find(
        (c) => c.id === (payload.customerId || editingItem?.customerId),
      );
      const custName =
        custObj?.companyName ||
        custObj?.name ||
        editingItem?.companyName ||
        (editingItem as any)?.customerName ||
        'Customer';

      notification.success({
        message: editingItem ? 'Sales Delivery Updated' : 'Sales Delivery Created',
        description: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
            <div>
              <strong>Delivery Note:</strong> {dnNumber} &nbsp;|&nbsp; <strong>Gate Pass:</strong> {gpNumber}
            </div>
            <div>
              <strong>Customer:</strong> {custName}
              {custObj?.customerCode ? ` (${custObj.customerCode})` : ''}
            </div>
          </div>
        ),
        placement: 'topRight',
        duration: 5,
      });

      setPreSaveConfirmVisible(false);
      setWarningModalVisible(false);
      setPendingSavePayload(null);
      setPendingFormValues(null);
      setPendingExcessWarnings([]);
      setModalVisible(false);
      tabSessionCache.remove(SALES_ORDERS_MODAL_CACHE_KEY);
      await fetchData({ forceRefresh: true });
    } catch (error: any) {
      const resp = error?.response?.data;
      if (resp?.code === 'CREDIT_POLICY_VIOLATION') {
        setPreSaveConfirmVisible(false);
        setWarningModalVisible(false);
        setCreditOverrideReason('');
        setCreditOverrideModal({
          open: true,
          mode: 'save',
          message: Array.isArray(resp.message) ? resp.message[0] : resp.message,
          policy: resp.policy,
          payload,
        });
        return;
      }
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to save delivery'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }

      const soIds = Array.isArray(values.salesOrderIds) ? values.salesOrderIds : (values.salesOrderId ? [values.salesOrderId] : []);
      const primarySoId = soIds[0] || values.salesOrderId || null;

      // Check for excess lines over SOC balance
      const excessLines: Array<{
        itemCode: string;
        itemName: string;
        orderNumber?: string;
        orderBalance: number;
        enteredQty: number;
        excessQty: number;
        uom: string;
      }> = [];

      lineItems.forEach((l) => {
        if (l.orderBalance !== undefined && l.orderBalance !== null) {
          const qty = Number(l.quantity || 0);
          const bal = Number(l.orderBalance || 0);
          if (qty > bal) {
            excessLines.push({
              itemCode: l.itemCode || '-',
              itemName: l.itemName || 'Item',
              orderNumber: l.salesOrderNumber,
              orderBalance: bal,
              enteredQty: qty,
              excessQty: qty - bal,
              uom: l.uomCode || 'M',
            });
          }
        }
      });

      const { divisionId, salesOrderIds, ...cleanValues } = values;

      const payload = {
        ...cleanValues,
        salesOrderId: primarySoId,
        customerPo: values.customerPo || null,
        deliveryDate: values.deliveryDate ? dayjs(values.deliveryDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        expectedDate: values.expectedDate ? dayjs(values.expectedDate).format('YYYY-MM-DD') : null,
        carrier: values.carrier || null,
        trackingNumber: values.trackingNumber || null,
        gatePassNumber: values.gatePassNumber ? String(values.gatePassNumber).trim() : null,
        notes: values.notes || null,
        lines: lineItems.map((l) => {
          const pkgNote = l.packageQuantity && l.packagingSize ? ` (${l.packageQuantity} ${l.packagingUnit || 'Coils'} × ${l.packagingSize} ${l.uomCode || 'M'})` : '';
          const socNote = l.salesOrderNumber ? ` [SOC: ${l.salesOrderNumber}]` : '';
          const qty = Number(l.quantity) || 0;
          const rate = Number(l.rate) || 0;
          const taxPct = l.taxPercent !== undefined && l.taxPercent !== null ? Number(l.taxPercent) : 18;
          const lineSub = Math.round(qty * rate * 100) / 100;
          const lineTax = Math.round(lineSub * (taxPct / 100) * 100) / 100;
          const lineTot = Math.round((lineSub + lineTax) * 100) / 100;
          return {
            itemId: l.itemId,
            description: (l.itemName || (l as any).description || 'Item') + pkgNote + socNote,
            quantity: qty,
            uomId: l.uomId,
            warehouseId: l.warehouseId || values.warehouseId,
            unitPrice: rate,
            taxAmount: lineTax,
            lineTotal: lineTot,
          };
        }),
      };

      setPendingSavePayload(payload);
      setPendingFormValues(values);

      if (excessLines.length > 0) {
        setPendingExcessWarnings(excessLines);
        setWarningModalVisible(true);
        return;
      }

      setPreSaveConfirmVisible(true);
    } catch (error: any) {
      const resp = error?.response?.data;
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Failed to save delivery'));
    }
  };

  const requestActionConfirmation = (
    record: SalesDelivery,
    actionKey: 'view' | 'print_challan' | 'gate_pass' | 'edit' | 'ship' | 'deliver' | 'confirm' | 'invoice' | 'cancel' | 'restore' | 'delete'
  ) => {
    const custName = getCustomerDisplayName(record) || record.companyName || 'Valued Customer';
    const dnNo = record.deliveryNumber || 'DN-XXXX';
    const soNo = record.salesOrderNumber || record.salesOrder?.orderNumber || (record.salesOrderId ? `SO-${record.salesOrderId.slice(0, 8).toUpperCase()}` : 'Direct Dispatch');
    const carrierInfo = `${record.carrier || 'Standard Transport'}${record.trackingNumber ? ` (${record.trackingNumber})` : ''}`;

    if (
      ['ship', 'deliver', 'confirm', 'invoice'].includes(actionKey) &&
      record.id &&
      (!record.lines || record.lines.length === 0)
    ) {
      apiService
        .get<any>(`/sales/deliveries/${record.id}`)
        .then((res) => {
          const full = res?.data || res;
          if (full?.id === record.id) {
            setConfirmModal((prev) =>
              prev.visible && prev.record?.id === record.id ? { ...prev, record: full } : prev,
            );
          }
        })
        .catch(() => { /* fallback to partial record */ });
    }

    switch (actionKey) {
      case 'view':
        setConfirmModal({
          visible: true,
          actionKey: 'view',
          title: 'Review & Inspect Delivery Note',
          actionBadge: 'INSPECTION & DETAILS',
          badgeBg: 'rgba(59, 130, 246, 0.15)',
          badgeColor: '#3b82f6',
          icon: <EyeOutlined />,
          iconBg: 'rgba(59, 130, 246, 0.15)',
          iconColor: '#3b82f6',
          record,
          question: `Do you want to open and review Delivery Note ${dnNo}?`,
          description: `This will fetch all dispatch items, customer specifications, carrier notes, and linked sales order allocations in the inspection viewer.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Linked Order: ${soNo}`,
            `Current Status: ${(record.status || 'DRAFT').toUpperCase()}`,
          ],
          confirmBtnText: 'Open Delivery Details',
          confirmBtnColor: '#2563eb',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'print_challan':
        setConfirmModal({
          visible: true,
          actionKey: 'print_challan',
          title: 'Print Delivery Challan Document',
          actionBadge: 'DOCUMENT PRINTING',
          badgeBg: 'rgba(14, 165, 233, 0.15)',
          badgeColor: '#0284c7',
          icon: <PrinterOutlined />,
          iconBg: 'rgba(14, 165, 233, 0.15)',
          iconColor: '#0284c7',
          record,
          question: `Do you want to compile and print the Delivery Challan for ${dnNo}?`,
          description: `This will compile the official Delivery Challan document with corporate branding, item list, driver details, and signature authorization boxes for physical transport.`,
          impactDetails: [
            `Document: Official Delivery Challan`,
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Carrier: ${carrierInfo}`,
          ],
          confirmBtnText: 'Compile & Print Challan',
          confirmBtnColor: '#0284c7',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'gate_pass':
        setConfirmModal({
          visible: true,
          actionKey: 'gate_pass',
          title: 'Generate Outward Gate Pass',
          actionBadge: 'SECURITY CLEARANCE',
          badgeBg: 'rgba(217, 119, 6, 0.15)',
          badgeColor: '#d97706',
          icon: <SafetyCertificateOutlined />,
          iconBg: 'rgba(217, 119, 6, 0.15)',
          iconColor: '#b45309',
          record,
          question: `Do you want to generate the Outward Gate Pass for ${dnNo}?`,
          description: `This will generate the official Outward Gate Pass document required for factory exit checkpoint clearance, vehicle inspection, and transport verification.`,
          impactDetails: [
            `Gate Pass For: ${dnNo}`,
            `Customer: ${custName}`,
            `Carrier / Driver: ${record.carrier || 'N/A'}`,
            `Vehicle / Tracking: ${record.trackingNumber || 'N/A'}`,
          ],
          confirmBtnText: 'Generate Outward Gate Pass',
          confirmBtnColor: '#b45309',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'edit':
        setConfirmModal({
          visible: true,
          actionKey: 'edit',
          title: String(record.status || 'DRAFT').toUpperCase() !== 'DRAFT' ? 'Admin Override Edit Delivery Note' : 'Edit Delivery Note Draft',
          actionBadge: String(record.status || 'DRAFT').toUpperCase() !== 'DRAFT' ? 'ADMIN OVERRIDE' : 'MODIFY DRAFT',
          badgeBg: 'rgba(245, 158, 11, 0.15)',
          badgeColor: '#f59e0b',
          icon: <EditOutlined />,
          iconBg: 'rgba(245, 158, 11, 0.15)',
          iconColor: '#d97706',
          record,
          question: `Do you want to open Delivery Note ${dnNo} for editing?`,
          description: `This will open the delivery draft editor allowing you to modify dispatched quantities, transport carrier details, vehicle numbers, and notes.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Current Status: DRAFT`,
            `Only draft delivery notes can be edited.`,
          ],
          confirmBtnText: 'Open Delivery Editor',
          confirmBtnColor: '#d97706',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'ship':
        setConfirmModal({
          visible: true,
          actionKey: 'ship',
          title: 'Confirm Shipment Dispatch',
          actionBadge: 'STATUS UPDATE: SHIPPED',
          badgeBg: 'rgba(37, 99, 235, 0.15)',
          badgeColor: '#2563eb',
          icon: <CarOutlined />,
          iconBg: 'rgba(37, 99, 235, 0.15)',
          iconColor: '#2563eb',
          record,
          question: `Are you sure you want to mark ${dnNo} as SHIPPED?`,
          description: `This action will advance the delivery status to SHIPPED. It officially verifies that the carrier has collected the goods and the dispatch is currently in transit.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Carrier / Transport: ${record.carrier || 'N/A'}`,
            `Vehicle / Tracking: ${record.trackingNumber || 'N/A'}`,
            `Status will advance from DRAFT to SHIPPED.`,
          ],
          confirmBtnText: 'Confirm & Mark as Shipped',
          confirmBtnColor: '#2563eb',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'deliver':
        setConfirmModal({
          visible: true,
          actionKey: 'deliver',
          title: 'Confirm Destination Delivery',
          actionBadge: 'STATUS UPDATE: DELIVERED',
          badgeBg: 'rgba(16, 185, 129, 0.15)',
          badgeColor: '#10b981',
          icon: <InboxOutlined />,
          iconBg: 'rgba(16, 185, 129, 0.15)',
          iconColor: '#059669',
          record,
          question: `Are you sure you want to mark ${dnNo} as DELIVERED?`,
          description: `This action updates the delivery status to DELIVERED, confirming that goods have been physically received and accepted at the customer destination.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer Destination: ${custName}`,
            `Destination Address: ${record.shipToAddress || 'Customer Warehouse'}`,
            `Status will advance from SHIPPED to DELIVERED.`,
          ],
          confirmBtnText: 'Confirm Delivery Arrival',
          confirmBtnColor: '#10b981',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'confirm':
        setConfirmModal({
          visible: true,
          actionKey: 'confirm',
          title: 'Post Delivery & Deduct Inventory Stock',
          actionBadge: 'INVENTORY STOCK-OUT',
          badgeBg: 'rgba(22, 163, 74, 0.15)',
          badgeColor: '#16a34a',
          icon: <CheckOutlined />,
          iconBg: 'rgba(22, 163, 74, 0.15)',
          iconColor: '#16a34a',
          record,
          question: `Are you sure you want to officially post ${dnNo} and deduct inventory stock?`,
          description: `This action will finalize the delivery note and execute official stock-out transactions in the inventory ledger, reducing warehouse inventory quantities.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Inventory Warehouse: SPI FG Dispatch Warehouse`,
            `Ledger Effect: Deducts finished goods inventory balance`,
            `Status will become CONFIRMED.`,
          ],
          confirmBtnText: 'Post Delivery & Deduct Stock',
          confirmBtnColor: '#16a34a',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'invoice':
        if (record.isInvoiced || record.invoicedInvoiceNo || record.invoicedInvoice?.invoiceNo) {
          const existingInvNo = record.invoicedInvoiceNo || record.invoicedInvoice?.invoiceNo || 'existing invoice';
          message.warning(`Delivery Note ${dnNo} is already converted to Sales Invoice ${existingInvNo}.`);
          return;
        }
        setConfirmModal({
          visible: true,
          actionKey: 'invoice',
          title: 'Generate Official Sales Invoice',
          actionBadge: 'ACCOUNTS BILLING',
          badgeBg: 'rgba(234, 88, 12, 0.15)',
          badgeColor: '#ea580c',
          icon: <FileTextOutlined />,
          iconBg: 'rgba(234, 88, 12, 0.15)',
          iconColor: '#ea580c',
          record,
          question: `Do you want to convert Delivery Note ${dnNo} into a Sales Invoice?`,
          description: `This will create an official Sales Invoice in Sales -> Invoices carrying over all dispatched items, quantities, unit rates, 18% Sales Tax, Gate Pass #, Originating SOC #, Division, and Customer credit terms.`,
          impactDetails: [
            `Delivery Note: ${dnNo}${record.gatePassNumber ? ` | Gate Pass: ${record.gatePassNumber}` : ''}`,
            `Customer: ${custName}`,
            `Subtotal: Rs ${formatDecimal(record.subtotal || 0)} | Tax: Rs ${formatDecimal(record.taxAmount || 0)}`,
            `Grand Total: Rs ${formatDecimal(record.totalAmount || 0)}`,
          ],
          confirmBtnText: 'Convert to Sales Invoice',
          confirmBtnColor: '#ea580c',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'cancel':
        setConfirmModal({
          visible: true,
          actionKey: 'cancel',
          title: 'Cancel Delivery Note',
          actionBadge: 'STATUS: CANCELLED',
          badgeBg: 'rgba(220, 38, 38, 0.15)',
          badgeColor: '#dc2626',
          icon: <StopOutlined />,
          iconBg: 'rgba(220, 38, 38, 0.15)',
          iconColor: '#dc2626',
          record,
          question: `Are you sure you want to CANCEL Delivery Note ${dnNo}?`,
          description: `This will mark the delivery order as CANCELLED and void any pending dispatch operations. Please confirm if you wish to proceed.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Status will change to CANCELLED.`,
            `Dispatch operations for this note will be voided.`,
          ],
          confirmBtnText: 'Yes, Cancel Delivery Note',
          confirmBtnColor: '#dc2626',
          isDanger: true,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'restore':
        setConfirmModal({
          visible: true,
          actionKey: 'restore',
          title: 'Restore Delivery Note to Draft',
          actionBadge: 'RESTORE TO DRAFT',
          badgeBg: 'rgba(22, 163, 74, 0.15)',
          badgeColor: '#16a34a',
          icon: <RollbackOutlined />,
          iconBg: 'rgba(22, 163, 74, 0.15)',
          iconColor: '#16a34a',
          record,
          question: `Restore cancelled Delivery Note ${dnNo} back to DRAFT?`,
          description: `This will re-open ${dnNo} in DRAFT status so you can edit, ship, deliver, and confirm dispatch cleanly.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Status will change from CANCELLED back to DRAFT.`,
            `No stock deduction occurs until the delivery is confirmed.`,
          ],
          confirmBtnText: 'Yes, Restore to Draft',
          confirmBtnColor: '#16a34a',
          isDanger: false,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      case 'delete':
        setConfirmModal({
          visible: true,
          actionKey: 'delete',
          title: 'Permanently Delete Delivery Note',
          actionBadge: 'PERMANENT DELETION',
          badgeBg: 'rgba(239, 68, 68, 0.15)',
          badgeColor: '#ef4444',
          icon: <DeleteOutlined />,
          iconBg: 'rgba(239, 68, 68, 0.15)',
          iconColor: '#ef4444',
          record,
          question: `Are you sure you want to permanently DELETE Delivery Note ${dnNo}?`,
          description: `This will permanently remove this delivery note and its associated item records from the database. This action CANNOT be undone.`,
          impactDetails: [
            `Delivery Note: ${dnNo}`,
            `Customer: ${custName}`,
            `Warning: Record will be permanently removed from system.`,
            `Linked sales order allocations will be freed.`,
          ],
          confirmBtnText: 'Yes, Permanently Delete',
          confirmBtnColor: '#ef4444',
          isDanger: true,
          loading: false,
          loadingStep: '',
          completed: false,
          successMessage: '',
          errorMessage: null,
        });
        break;

      default:
        break;
    }
  };

  const executeConfirmedAction = async (overrideOptions?: { creditOverride?: boolean; creditOverrideReason?: string }) => {
    if (!confirmModal.record || !confirmModal.actionKey) return;
    const { actionKey, record } = confirmModal;

    setConfirmModal(prev => ({
      ...prev,
      loading: true,
      loadingStep: 'Executing action on server... Please wait.',
      errorMessage: null,
    }));

    try {
      if (actionKey === 'view') {
        await handleViewDetail(record);
        setConfirmModal(prev => ({ ...prev, visible: false, loading: false }));
      } else if (actionKey === 'edit') {
        await handleEdit(record);
        setConfirmModal(prev => ({ ...prev, visible: false, loading: false }));
      } else if (actionKey === 'print_challan') {
        printDeliveryNoteDocument(record);
        setConfirmModal(prev => ({ ...prev, visible: false, loading: false }));
      } else if (actionKey === 'gate_pass') {
        handlePrintOutwardGatePass(record);
        setConfirmModal(prev => ({ ...prev, visible: false, loading: false }));
      } else if (['ship', 'deliver', 'confirm', 'cancel', 'restore'].includes(actionKey)) {
        const targetLabel = actionKey === 'restore' ? 'DRAFT' : actionKey.toUpperCase();
        setConfirmModal(prev => ({
          ...prev,
          loadingStep: actionKey === 'restore'
            ? `Restoring ${record.deliveryNumber} back to DRAFT...`
            : `Updating delivery note status to ${targetLabel}...`,
        }));
        const patchBody = actionKey === 'confirm' && overrideOptions?.creditOverride === true
          ? { creditOverride: true, creditOverrideReason: overrideOptions.creditOverrideReason }
          : undefined;
        await apiService.patch(`/sales/deliveries/${record.id}/${actionKey}`, patchBody);
        tabSessionCache.remove(SALES_ORDERS_MODAL_CACHE_KEY);
        await fetchData({ forceRefresh: true });
        if (detailVisible && detailItem?.id === record.id) {
          handleViewDetail(record);
        }
        setConfirmModal(prev => ({
          ...prev,
          loading: false,
          completed: true,
          successMessage: actionKey === 'restore'
            ? `Delivery Note ${record.deliveryNumber} restored to DRAFT successfully!`
            : `Delivery Note ${record.deliveryNumber} successfully updated to ${targetLabel}!`,
        }));
        setTimeout(() => {
          setConfirmModal(prev => ({ ...prev, visible: false, completed: false }));
        }, 1200);
      } else if (actionKey === 'invoice') {
        setConfirmModal(prev => ({
          ...prev,
          loadingStep: 'Generating Sales Invoice in accounts ledger...',
        }));
        const res = await apiService.post<any>(`/sales/deliveries/${record.id}/convert-to-invoice`, {
          invoiceDate: dayjs().format('YYYY-MM-DD'),
          notes: `Generated from Delivery Note ${record.deliveryNumber}${record.gatePassNumber ? ` (Gate Pass: ${record.gatePassNumber})` : ''}`,
        });
        const createdInvoice = res?.data || res;
        const createdInvoiceNo = createdInvoice?.invoiceNo || 'created';
        triggerTabRefresh('/sales/invoices');
        triggerTabRefresh('/dashboard');
        tabSessionCache.remove(SALES_ORDERS_MODAL_CACHE_KEY);
        await fetchData({ forceRefresh: true });
        if (detailVisible && detailItem?.id === record.id) {
          handleViewDetail(record);
        }
        setConfirmModal(prev => ({
          ...prev,
          loading: false,
          completed: true,
          successMessage: `Sales Invoice ${createdInvoiceNo} generated successfully from ${record.deliveryNumber}!`,
        }));
        setTimeout(() => {
          setConfirmModal(prev => ({ ...prev, visible: false, completed: false }));
        }, 1400);
      } else if (actionKey === 'delete') {
        setConfirmModal(prev => ({
          ...prev,
          loadingStep: `Deleting Delivery Note ${record.deliveryNumber}...`,
        }));
        await apiService.delete(`/sales/deliveries/${record.id}`);
        tabSessionCache.remove(SALES_ORDERS_MODAL_CACHE_KEY);
        await fetchData({ forceRefresh: true });
        if (detailVisible && detailItem?.id === record.id) {
          setDetailVisible(false);
        }
        setConfirmModal(prev => ({
          ...prev,
          loading: false,
          completed: true,
          successMessage: `Delivery Note ${record.deliveryNumber} has been permanently deleted.`,
        }));
        setTimeout(() => {
          setConfirmModal(prev => ({ ...prev, visible: false, completed: false }));
        }, 1200);
      }
    } catch (error: any) {
      const resp = error?.response?.data;
      if (resp?.code === 'CREDIT_POLICY_VIOLATION' && actionKey === 'confirm') {
        setConfirmModal(prev => ({ ...prev, loading: false, completed: false }));
        setCreditOverrideReason('');
        setCreditOverrideModal({
          open: true,
          mode: 'confirm',
          recordId: record.id,
          message: Array.isArray(resp.message) ? resp.message[0] : resp.message,
          policy: resp.policy,
        });
        return;
      }
      const msg = resp?.message || error?.message || 'Failed to complete action.';
      const displayMsg = Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : 'Operation failed');
      setConfirmModal(prev => ({
        ...prev,
        loading: false,
        completed: false,
        errorMessage: displayMsg,
      }));
    }
  };

  const handleApplyConfirmTax18 = async () => {
    const rec = confirmModal.record;
    if (!rec?.id) return;
    setApplyingConfirmTax(true);
    try {
      const res = await apiService.patch<any>(`/sales/deliveries/${rec.id}/apply-tax`, { taxPercent: 18 });
      const updated = res?.data || res;
      if (updated?.id) {
        setConfirmModal(prev => ({ ...prev, record: updated, errorMessage: null }));
        if (detailVisible && detailItem?.id === updated.id) {
          setDetailItem(updated);
        }
      }
      await fetchData({ forceRefresh: true });
      message.success(`Standard 18% Tax applied to ${rec.deliveryNumber}`);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to apply 18% tax';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setApplyingConfirmTax(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    const targetRec = data.find(d => d.id === id) || (detailItem?.id === id ? detailItem : null);
    if (targetRec) {
      requestActionConfirmation(targetRec, action as any);
      return;
    }
    try {
      await apiService.patch(`/sales/deliveries/${id}/${action}`);
      tabSessionCache.remove(SALES_ORDERS_MODAL_CACHE_KEY);
      await fetchData({ forceRefresh: true });
    } catch (error: any) {
      const resp = error?.response?.data;
      const msg = resp?.message || error?.message;
      message.error(Array.isArray(msg) ? msg[0] : (typeof msg === 'string' ? msg : `Failed to ${action} delivery`));
    }
  };

  const handleConvertToInvoice = async (record: SalesDelivery) => {
    requestActionConfirmation(record, 'invoice');
  };

  // Pixel-Perfect Multi-line Columns mirroring Invoices Design
  const columns: ColumnsType<SalesDelivery> = [
    {
      title: 'Delivery',
      key: 'delivery',
      width: 230,
      render: (_, record) => {
        const cust = customers.find(c => c.id === record.customerId);
        const custName = cust?.companyName || cust?.name || record.companyName || 'Customer';
        const linkedInvoiceNo = record.invoicedInvoiceNo || record.invoicedInvoice?.invoiceNo;
        return (
          <div className="inv-doc-cell">
            <div className="inv-doc-code">{record.deliveryNumber}</div>
            {linkedInvoiceNo && (
              <div className="inv-sub-row">
                <Tag
                  color="success"
                  icon={<CheckCircleOutlined />}
                  style={{ margin: 0, fontWeight: 700, fontSize: 11, fontFamily: 'monospace' }}
                >
                  Invoiced: {linkedInvoiceNo}
                </Tag>
              </div>
            )}
            <div className="inv-sub-row">
              <span className="badge-inv-type">
                <CarOutlined style={{ marginRight: 3 }} /> Delivery
              </span>
              <span className="inv-sub-val" style={{ textTransform: 'uppercase' }}>
                {record.status}
              </span>
            </div>
            <div className="inv-sub-row">
              <span className="badge-inv-customer">
                <UserOutlined style={{ marginRight: 3 }} /> Customer
              </span>
              <span className="inv-sub-val" style={{ color: '#2563eb', fontWeight: 600 }}>
                {custName}
              </span>
            </div>
            {(() => {
              const socList: string[] = (record as any).salesOrderNumbers && (record as any).salesOrderNumbers.length > 0
                ? (record as any).salesOrderNumbers
                : [record.salesOrderNumber || record.salesOrder?.orderNumber].filter(Boolean);
              const soSummaryList: any[] = (record as any).salesOrdersSummary || [];

              if (socList.length === 0 && !(record as any).customerPo) return null;

              return (
                <div className="inv-sub-row" style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', marginTop: 4 }}>
                  {socList.map((soc: string, sIdx: number) => {
                    const summary = soSummaryList.find((s: any) => s.socNumber === soc);
                    const isMulti = socList.length > 1;
                    const recUnits = resolveDeliveryUnits(record, divisions);
                    const socPkgLabel = formatPkgUnitLabel(summary?.packagingUnit, recUnits.uom);
                    return (
                      <span
                        key={sIdx}
                        className="badge-inv-type"
                        style={{
                          background: sIdx === 0 ? 'rgba(56, 189, 248, 0.12)' : 'rgba(192, 132, 252, 0.14)',
                          color: sIdx === 0 ? '#0284c7' : '#9333ea',
                          borderColor: sIdx === 0 ? 'rgba(56, 189, 248, 0.35)' : 'rgba(192, 132, 252, 0.35)',
                          fontWeight: 700,
                          fontSize: 11,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '1px 6px',
                          borderRadius: 4,
                        }}
                      >
                        <BranchesOutlined style={{ marginRight: 2 }} /> {soc}
                        {summary && isMulti && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: sIdx === 0 ? '#0369a1' : '#7c3aed', marginLeft: 2 }}>
                            ({formatQtyClean(summary.thisDeliveryCartons)} {socPkgLabel})
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {(record as any).customerPo && (
                    <span className="inv-sub-val" style={{ color: '#fbbf24', fontSize: 11, fontWeight: 600 }}>
                      PO: {(record as any).customerPo}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        );
      },
    },
    {
      title: 'Dates',
      key: 'dates',
      width: 235,
      render: (_, record) => {
        const isDarkSurface = (() => {
          const bg = String(token.colorBgContainer || '#ffffff').toLowerCase().trim();
          if (bg.startsWith('#')) {
            const hex = bg.length === 4 ? bg.slice(1).split('').map((c) => c + c).join('') : bg.slice(1, 7);
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
              return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
            }
          }
          return false;
        })();

        return (
          <div className="inv-dates-cell" style={{ gap: 5 }}>
            {record.divisionName && (
              <div className="inv-date-row">
                <span
                  className="badge-inv-type"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: isDarkSurface ? '#93C5FD' : '#2563EB',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    fontWeight: 700,
                    fontSize: 11,
                    lineHeight: 1.4,
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <ApartmentOutlined />
                  <span>{record.divisionName}</span>
                </span>
              </div>
            )}
            {record.gatePassNumber && (
              <div className="inv-date-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 8px',
                    borderRadius: 4,
                    background: isDarkSurface ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
                    color: isDarkSurface ? '#C7D2FE' : '#3730A3',
                    border: isDarkSurface ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid #C7D2FE',
                    fontWeight: 700,
                    fontSize: 11,
                    lineHeight: 1.4,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <SafetyCertificateOutlined />
                  <span>Gate Pass</span>
                </span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 800,
                    fontSize: 12.5,
                    color: token.colorText,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {record.gatePassNumber}
                </span>
              </div>
            )}
            <div className="inv-date-row">
              <span className="badge-inv-date" style={{ whiteSpace: 'nowrap' }}>
                <CalendarOutlined style={{ marginRight: 3 }} /> Delivery Date
              </span>
              <span className="inv-date-val" style={{ whiteSpace: 'nowrap' }}>
                {record.deliveryDate ? dayjs(record.deliveryDate).format('MMM DD, YYYY') : '-'}
              </span>
            </div>
            {record.expectedDate && (
              <div className="inv-date-row">
                <span className="badge-inv-due" style={{ whiteSpace: 'nowrap' }}>
                  <CalendarOutlined style={{ marginRight: 3 }} /> Expected
                </span>
                <span className="inv-date-val" style={{ whiteSpace: 'nowrap' }}>
                  {dayjs(record.expectedDate).format('MMM DD, YYYY')}
                </span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span>
          Quantities & Balance
          <div style={{ fontSize: 10, fontWeight: 'normal', color: '#64748b' }}>Ordered / Dispatched / Balance</div>
        </span>
      ),
      key: 'quantities',
      width: 265,
      render: (_, record) => {
        const soSummaryList: any[] = (record as any).salesOrdersSummary || [];
        const q = computeDeliveryQuantities(record, divisions);

        const popoverContent = (
          <div style={{ maxWidth: 420, padding: 4 }}>
            {soSummaryList.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 6, color: token.colorPrimary }}>
                  {soSummaryList.length > 1
                    ? `Per-SOC Breakdown (${soSummaryList.length} Orders in this Delivery)`
                    : 'Cumulative Dispatch Progress (As of This Delivery)'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {soSummaryList.map((soc: any, sIdx: number) => {
                    const socUom = normalizeSalesUomCode(soc.uom) || q.uom;
                    const socPkg = formatPkgUnitLabel(soc.packagingUnit, socUom);
                    const sOrdCtn = Number(soc.totalOrderCartons ?? 0);
                    const sOrdQty = Number(soc.totalOrderQuantity ?? 0);
                    const sPrevCtn = Number(soc.previousCartons ?? Math.max(0, Number(soc.totalShippedCartons ?? 0) - Number(soc.thisDeliveryCartons ?? 0)));
                    const sDispCtn = Number(soc.thisDeliveryCartons ?? 0);
                    const sDispQty = Number(soc.thisDeliveryQuantity ?? 0);
                    const sCumCtn = Number(soc.totalShippedCartons ?? sDispCtn);
                    const sCumQty = Number(soc.totalShippedQuantity ?? sDispQty);
                    const sBalCtn = Number(soc.balanceCartons ?? Math.max(0, sOrdCtn - sCumCtn));
                    const sBalQty = Number(soc.balanceQuantity ?? Math.max(0, sOrdQty - sCumQty));
                    const sPct = soc.completionPercent ?? (sOrdQty > 0 ? Math.min(100, Math.round((sCumQty / sOrdQty) * 100)) : 100);
                    const sDone = Boolean(soc.isCompleted) || (sOrdQty > 0 && sBalQty <= 0.001);
                    return (
                      <div
                        key={sIdx}
                        style={{
                          padding: '6px 8px',
                          background: token.colorFillAlter,
                          borderRadius: 6,
                          border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 12, color: token.colorPrimary }}>
                            <BranchesOutlined style={{ marginRight: 3 }} /> {soc.socNumber}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 11, color: sDone ? token.colorSuccess : token.colorWarning }}>
                            {sDone ? (
                              <span>
                                <CheckCircleOutlined style={{ marginRight: 3 }} /> 0 {socPkg} (0 {socUom}) · Complete
                              </span>
                            ) : (
                              `Bal After: ${formatQtyClean(sBalCtn)} ${socPkg} (${formatQtyClean(sBalQty)} ${socUom})`
                            )}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: token.colorTextSecondary, gap: 6, flexWrap: 'wrap' }}>
                          <span>Ord: <b style={{ color: token.colorText }}>{formatQtyClean(sOrdCtn)} {socPkg}</b> ({formatQtyClean(sOrdQty)} {socUom})</span>
                          <span>Prev: <b>{formatQtyClean(sPrevCtn)} {socPkg}</b></span>
                          <span style={{ color: token.colorPrimary }}>This Disp: <b>{formatQtyClean(sDispCtn)} {socPkg}</b></span>
                          <span style={{ color: token.colorSuccess }}>
                            Cumulative: <b>{formatQtyClean(sCumCtn)} / {formatQtyClean(sOrdCtn)} {socPkg} ({sDone ? '100% Complete' : `${sPct}%`})</b>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, color: token.colorText }}>
              Itemized Delivery Breakdown
            </div>
            {record.itemsSummary && record.itemsSummary.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {record.itemsSummary.map((item, idx) => {
                  const iUom = normalizeSalesUomCode(item.uom) || q.uom;
                  const iPkgUnit = formatPkgUnitLabel(item.packagingUnit, iUom);
                  const iPkgSize = Number(item.packagingSize) > 0
                    ? Number(item.packagingSize)
                    : (iUom === 'M' ? 250 : iUom === 'KG' ? 1 : 10);
                  const scaleItemPkg = (qtyVal: number, explicitPkg?: number | null) =>
                    explicitPkg != null && Number.isFinite(Number(explicitPkg))
                      ? Number(explicitPkg)
                      : (iPkgSize > 1 ? Number((qtyVal / iPkgSize).toFixed(2)) : Number(qtyVal.toFixed(2)));
                  const iOrdQty = Number(item.orderedQuantity ?? 0);
                  const iOrdCtn = scaleItemPkg(iOrdQty, item.orderedCartons);
                  const iDispQty = Number(item.dispatchedQuantity ?? 0);
                  const iDispCtn = scaleItemPkg(iDispQty, item.dispatchedCartons);
                  const iCumQty = Number(item.totalShippedQuantity ?? iDispQty);
                  const iCumCtn = scaleItemPkg(iCumQty, item.totalShippedCartons);
                  const iPrevQty = Number(item.previousDispatchedQuantity ?? Math.max(0, iCumQty - iDispQty));
                  const iPrevCtn = scaleItemPkg(iPrevQty, item.previousDispatchedCartons);
                  const iBalQty = Number(item.balanceQuantity ?? Math.max(0, iOrdQty - iCumQty));
                  const iBalCtn = scaleItemPkg(iBalQty, item.balanceCartons);
                  const iPct = item.completionPercent ?? (iOrdQty > 0 ? Math.min(100, Math.round((iCumQty / iOrdQty) * 100)) : 100);
                  const iDone = Boolean(item.isCompleted) || (iOrdQty > 0 && iBalQty <= 0.001);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '6px 8px',
                        background: token.colorFillAlter,
                        borderRadius: 6,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: 12, color: token.colorText, display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <span>{item.itemCode ? `[${item.itemCode}] ` : ''}{item.itemName || 'Item'}</span>
                        {item.socNumber && (
                          <Tag color="purple" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                            {item.socNumber}
                          </Tag>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4, color: token.colorTextSecondary, gap: 8 }}>
                        <span>
                          Ordered: <b style={{ color: token.colorText }}>{iOrdQty > 0 ? `${formatQtyClean(iOrdCtn)} ${iPkgUnit}` : '—'}</b>
                          {iOrdQty > 0 ? ` (${formatQtyClean(iOrdQty)} ${iUom})` : ''}
                        </span>
                        <span style={{ color: token.colorPrimary }}>
                          This Disp: <b>{formatQtyClean(iDispCtn)} {iPkgUnit}</b> ({formatQtyClean(iDispQty)} {iUom})
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 2, gap: 8, color: token.colorTextSecondary }}>
                        <span>
                          Prev: <b>{formatQtyClean(iPrevCtn)} {iPkgUnit}</b> · Cum:{' '}
                          <b style={{ color: token.colorSuccess }}>
                            {formatQtyClean(iCumCtn)}{iOrdCtn > 0 ? ` / ${formatQtyClean(iOrdCtn)}` : ''} {iPkgUnit} ({iPct}%)
                          </b>
                        </span>
                        <span style={{ fontWeight: 700, color: iDone ? token.colorSuccess : token.colorWarning }}>
                          {iDone ? (
                            <span>
                              <CheckCircleOutlined style={{ marginRight: 3 }} /> Bal: 0 {iPkgUnit} (0 {iUom})
                            </span>
                          ) : (
                            `Bal: ${formatQtyClean(iBalCtn)} ${iPkgUnit} (${formatQtyClean(iBalQty)} ${iUom})`
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: token.colorTextSecondary }}>
                Dispatch: {formatQtyClean(q.dispCtn)} {q.pkgUnit} ({formatQtyClean(q.dispQty)} {q.uom})
              </div>
            )}
          </div>
        );

        return (
          <Popover content={popoverContent} title={null} trigger="hover">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: token.colorTextSecondary, fontWeight: 500 }}>Ordered:</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: token.colorText }}>
                  {q.orderCtn > 0 ? `${formatQtyClean(q.orderCtn)} ${q.pkgUnit}` : '-'}{' '}
                  <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 'normal' }}>
                    ({formatQtyClean(q.orderQty)} {q.uom})
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: token.colorPrimary, fontWeight: 600 }}>Dispatched:</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: token.colorPrimary }}>
                  {formatQtyClean(q.dispCtn)} {q.pkgUnit}{' '}
                  <span style={{ fontSize: 10, color: token.colorPrimary, fontWeight: 'normal', opacity: 0.85 }}>
                    ({formatQtyClean(q.dispQty)} {q.uom})
                  </span>
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: q.isDone ? token.colorSuccess : token.colorWarning, fontWeight: 600 }}>
                  Balance After:
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: q.isDone ? token.colorSuccess : token.colorWarning }}>
                  {q.isDone ? (
                    <Tag color="success" style={{ margin: 0, fontWeight: 700 }}>
                      <CheckCircleOutlined style={{ marginRight: 3 }} /> 0 {q.pkgUnit} (0 {q.uom})
                    </Tag>
                  ) : (
                    `${formatQtyClean(q.balCtn)} ${q.pkgUnit} (${formatQtyClean(q.balQty)} ${q.uom})`
                  )}
                </span>
              </div>
              {q.orderQty > 0 && (
                <div style={{ fontSize: 10.5, color: token.colorTextSecondary, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Cumulative:</span>
                  <span style={{ fontWeight: 700, color: q.isDone ? token.colorSuccess : token.colorText }}>
                    {formatQtyClean(q.cumCtn)} / {formatQtyClean(q.orderCtn)} {q.pkgUnit} ({q.isDone ? '100% Complete' : `${q.pct}%`})
                  </span>
                </div>
              )}
              {soSummaryList.length > 1 && (
                <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {soSummaryList.map((soc: any, sIdx: number) => {
                    const socUom = normalizeSalesUomCode(soc.uom) || q.uom;
                    const socPkg = formatPkgUnitLabel(soc.packagingUnit, socUom);
                    return (
                      <div
                        key={sIdx}
                        style={{
                          fontSize: 10,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          color: token.colorText,
                          background: sIdx === 0 ? 'rgba(56, 189, 248, 0.08)' : 'rgba(192, 132, 252, 0.1)',
                          border: `1px solid ${sIdx === 0 ? 'rgba(56, 189, 248, 0.25)' : 'rgba(192, 132, 252, 0.25)'}`,
                          padding: '1px 5px',
                          borderRadius: 4,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: sIdx === 0 ? token.colorPrimary : '#7c3aed' }}>
                          {soc.socNumber}:
                        </span>
                        <span>
                          Disp: <b>{formatQtyClean(soc.thisDeliveryCartons)}</b> | Bal:{' '}
                          <b style={{ color: soc.isCompleted ? token.colorSuccess : token.colorWarning }}>
                            {formatQtyClean(soc.balanceCartons)}
                          </b>{' '}
                          {socPkg}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {q.orderQty > 0 && (
                <Progress
                  percent={q.pct}
                  size="small"
                  status={q.isDone ? 'success' : 'active'}
                  strokeColor={q.isDone ? token.colorSuccess : token.colorPrimary}
                  style={{ margin: 0 }}
                />
              )}
            </div>
          </Popover>
        );
      },
    },
    {
      title: 'Logistics',
      key: 'logistics',
      width: 200,
      render: (_, record) => {
        const wh = warehouses.find(w => w.id === record.warehouseId);
        return (
          <div className="inv-dates-cell">
            <div className="inv-date-row">
              <span className="badge-inv-terms">
                <CarOutlined style={{ marginRight: 3 }} /> Carrier
              </span>
              <span className="inv-date-val" style={{ fontWeight: 600 }}>
                {record.carrier || 'Standard Transport'}
              </span>
            </div>
            {record.trackingNumber && (
              <div className="inv-date-row">
                <span className="badge-inv-date">
                  <NumberOutlined style={{ marginRight: 3 }} /> Track #
                </span>
                <span className="inv-date-val" style={{ fontFamily: 'monospace' }}>
                  {record.trackingNumber}
                </span>
              </div>
            )}
            {wh && (
              <div className="inv-date-row">
                <span className="badge-inv-subtotal">
                  <ShopOutlined style={{ marginRight: 3 }} /> Warehouse
                </span>
                <span className="inv-date-val">{wh.name}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Amounts',
      key: 'amounts',
      width: 190,
      render: (_, record) => (
        <div className="inv-amounts-cell">
          <div className="inv-amt-row">
            <span className="badge-inv-subtotal">Subtotal</span>
            <span className="inv-amt-val">Rs {formatDecimal(record.subtotal || 0)}</span>
          </div>
          <div className="inv-amt-row">
            <span className="badge-inv-tax">% Tax</span>
            <span className="inv-amt-val">Rs {formatDecimal(record.taxAmount || 0)}</span>
          </div>
          <div className="inv-amt-row amt-total-row">
            <span className="badge-inv-total">Total</span>
            <span className="inv-amt-val inv-amt-bold">Rs {formatDecimal(record.totalAmount || 0)}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 130,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toUpperCase();
        let cls = 'status-pending';
        if (s === 'DELIVERED' || s === 'CONFIRMED') cls = 'status-paid';
        else if (s === 'SHIPPED') cls = 'status-partial';
        else if (s === 'CANCELLED') cls = 'status-cancelled';

        return (
          <span className={`inv-status-pill ${cls}`}>
            {record.status}
          </span>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      align: 'center',
      render: (_, record) => {
        const s = (record.status || '').toUpperCase();
        return (
          <div className="inv-actions-wrapper">
            <Tooltip title="View Details">
              <button
                className="inv-action-btn inv-btn-view"
                onClick={() => requestActionConfirmation(record, 'view')}
              >
                <EyeOutlined />
              </button>
            </Tooltip>
            {canPrint && (
              <Tooltip title="Print Delivery Challan">
                <button
                  className="inv-action-btn inv-btn-print"
                  onClick={() => requestActionConfirmation(record, 'print_challan')}
                >
                  <PrinterOutlined />
                </button>
              </Tooltip>
            )}
            {canPrint && (
              <Tooltip title="Print Outward Gate Pass">
                <button
                  className="inv-action-btn"
                  style={{ backgroundColor: '#b45309', color: '#fff' }}
                  onClick={() => requestActionConfirmation(record, 'gate_pass')}
                >
                  <SafetyCertificateOutlined />
                </button>
              </Tooltip>
            )}
            <Tooltip title="Share Delivery / Gate Pass via WhatsApp">
              <button
                className="inv-action-btn inv-btn-wa"
                onClick={() => {
                  const cust = customers.find((c) => c.id === record.customerId);
                  const custName =
                    record.companyName ||
                    (cust as any)?.name ||
                    (cust as any)?.companyName ||
                    'Customer';
                  const q = computeDeliveryQuantities(record, divisions);
                  const itemLines = Array.isArray(record.itemsSummary) && record.itemsSummary.length > 0
                    ? record.itemsSummary
                        .slice(0, 8)
                        .map(
                          (it, idx) =>
                            `${idx + 1}. *${it.itemCode || ''} ${it.itemName || 'Item'}*: ${formatQtyClean(Number(it.dispatchedQuantity || 0))} ${normalizeSalesUomCode(it.uom) || q.uom}`,
                        )
                        .join('\n')
                    : Array.isArray(record.lines) && record.lines.length > 0
                      ? record.lines
                          .slice(0, 8)
                          .map(
                            (ln: any, idx: number) =>
                              `${idx + 1}. *${ln.description || ln.item?.name || 'Item'}*: ${formatQtyClean(Number(ln.quantity || 0))} ${normalizeSalesUomCode(ln.uom?.code || ln.uomCode) || q.uom}`,
                          )
                          .join('\n')
                      : 'See Delivery Challan details.';
                  openWhatsAppWithTemplate(
                    '[DN-GP]',
                    {
                      company: DEFAULT_COMPANY_NAME,
                      customer: custName,
                      doc_no: record.deliveryNumber || '',
                      gate_pass_no: record.gatePassNumber || '—',
                      soc_no: record.salesOrderNumber || record.salesOrder?.orderNumber || '—',
                      customer_po: record.customerPo || record.salesOrder?.customerPo || '—',
                      date: record.deliveryDate || '—',
                      division: record.divisionName || record.salesOrder?.division?.name || '—',
                      carrier: record.carrier || '—',
                      vehicle_no: record.trackingNumber || '—',
                      total_qty: `${formatQtyClean(q.dispQty)} ${q.uom}`,
                      total_cartons: q.dispCtn > 0 ? `${formatQtyClean(q.dispCtn)} ${q.pkgUnit}` : '—',
                      items: itemLines,
                    },
                    (cust as any)?.phone,
                  );
                }}
              >
                <WhatsAppOutlined />
              </button>
            </Tooltip>
            {canUpdate && (
              <Tooltip title={s !== 'DRAFT' && isAdmin ? 'Admin Override Edit' : 'Edit Delivery'}>
                <button
                  className="inv-action-btn inv-btn-edit"
                  onClick={() => requestActionConfirmation(record, 'edit')}
                  disabled={s !== 'DRAFT' && !(isAdmin && s !== 'CANCELLED')}
                >
                  <EditOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'DRAFT' && canUpdate && (
              <Tooltip title="Ship Delivery">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#3b82f6', color: '#fff' }}
                  onClick={() => requestActionConfirmation(record, 'ship')}
                >
                  <CarOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'SHIPPED' && canUpdate && (
              <Tooltip title="Mark Delivered">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#10b981', color: '#fff' }}
                  onClick={() => requestActionConfirmation(record, 'deliver')}
                >
                  <InboxOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'DELIVERED' && canConfirm && (
              <Tooltip title="Confirm Delivery (Post Stock OUT)">
                <button
                  className="inv-action-btn inv-btn-pay"
                  style={{ backgroundColor: '#16a34a', color: '#fff' }}
                  onClick={() => requestActionConfirmation(record, 'confirm')}
                >
                  <CheckOutlined />
                </button>
              </Tooltip>
            )}
            {['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes(s) && (
              (record.isInvoiced || record.invoicedInvoiceNo || record.invoicedInvoice?.invoiceNo) ? (
                <Tooltip title={`Already Invoiced (${record.invoicedInvoiceNo || record.invoicedInvoice?.invoiceNo})`}>
                  <button
                    className="inv-action-btn"
                    style={{
                      backgroundColor: token.colorSuccessBg,
                      color: token.colorSuccess,
                      border: `1px solid ${token.colorSuccessBorder}`,
                      cursor: 'not-allowed',
                    }}
                    disabled
                  >
                    <CheckCircleOutlined />
                  </button>
                </Tooltip>
              ) : canCreateInvoice ? (
                <Tooltip title="Generate Sales Invoice">
                  <button
                    className="inv-action-btn"
                    style={{ backgroundColor: '#ea580c', color: '#fff' }}
                    onClick={() => requestActionConfirmation(record, 'invoice')}
                  >
                    <FileTextOutlined />
                  </button>
                </Tooltip>
              ) : null
            )}
            {s !== 'CANCELLED' && s !== 'CONFIRMED' && (canUpdate || canDelete) && (
              <Tooltip title="Cancel Delivery">
                <button
                  className="inv-action-btn inv-btn-cancel"
                  onClick={() => requestActionConfirmation(record, 'cancel')}
                >
                  <StopOutlined />
                </button>
              </Tooltip>
            )}
            {s === 'CANCELLED' && canUpdate && (
              <Tooltip title="Restore Cancelled Delivery Back to Draft">
                <button
                  className="inv-action-btn"
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    width: 'auto',
                    padding: '0 9px',
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => requestActionConfirmation(record, 'restore')}
                >
                  <RollbackOutlined />
                  <span>Restore to Draft</span>
                </button>
              </Tooltip>
            )}
            {(s === 'DRAFT' || s === 'CANCELLED') && canDelete && (
              <Tooltip title="Delete Delivery">
                <button
                  className="inv-action-btn inv-btn-cancel"
                  style={{ color: '#ef4444' }}
                  onClick={() => requestActionConfirmation(record, 'delete')}
                >
                  <DeleteOutlined />
                </button>
              </Tooltip>
            )}
          </div>
        );
      },
    },
  ];

  const { visibleColumns, selectorProps } = useColumnVisibility('pwi_cols_sales_deliveries', columns);

  // Pagination calculation
  const totalEntries = displayedDeliveries.length;
  const startEntry = totalEntries === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, totalEntries);
  const totalPages = Math.ceil(totalEntries / pageSize) || 1;

  const paginatedDeliveries = useMemo(() => {
    const start = (page - 1) * pageSize;
    return displayedDeliveries.slice(start, start + pageSize);
  }, [displayedDeliveries, page, pageSize]);

  // Active Sheet KPI Summary Metrics (Division / UOM Aware)
  const activeSheetMetrics = useMemo(() => {
    let totalGross = 0;
    let totalCartons = 0;
    let totalValue = 0;
    let totalOrderGross = 0;
    const itemSet = new Set<string>();
    const carrierSet = new Set<string>();
    const customerSet = new Set<string>();
    const uomBuckets = new Map<string, number>();
    const pkgBuckets = new Map<string, number>();

    displayedDeliveries.forEach(del => {
      const q = computeDeliveryQuantities(del, divisions);

      totalGross += q.dispQty;
      totalCartons += q.dispCtn;
      totalValue += Number(del.totalAmount) || 0;
      totalOrderGross += q.orderQty || q.dispQty;

      uomBuckets.set(q.uom, (uomBuckets.get(q.uom) || 0) + q.dispQty);
      pkgBuckets.set(q.pkgUnit, (pkgBuckets.get(q.pkgUnit) || 0) + q.dispCtn);

      if (del.carrier) carrierSet.add(del.carrier);
      if (del.customerId) customerSet.add(del.customerId);

      if (del.itemsSummary && del.itemsSummary.length > 0) {
        del.itemsSummary.forEach(i => {
          const key = i.itemId || i.itemCode || i.itemName;
          if (key) itemSet.add(key);
        });
      } else if (del.lines && del.lines.length > 0) {
        del.lines.forEach(l => {
          const key = l.itemId || l.itemCode || l.itemName;
          if (key) itemSet.add(key);
        });
      }
    });

    const totalNotes = displayedDeliveries.length;
    const distinctItemsCount = itemSet.size > 0 ? itemSet.size : totalNotes;
    const distinctCarriersCount = carrierSet.size;
    const distinctCustomersCount = customerSet.size;

    const uomKeys = Array.from(uomBuckets.keys());
    const pkgKeys = Array.from(pkgBuckets.keys());
    const primaryUomLabel = uomKeys.length === 1 ? uomKeys[0] : (uomKeys.length > 1 ? 'Mixed Units' : 'GRS');
    const primaryPkgLabel = pkgKeys.length === 1 ? pkgKeys[0] : (pkgKeys.length > 1 ? pkgKeys.join(' / ') : 'CTN');
    const pkgNoun = pkgKeys.length === 1 ? (pkgKeys[0] === 'CTN' ? 'Cartons' : pkgKeys[0]) : 'Packages';
    const uomBreakdownSub =
      uomKeys.length > 1
        ? Array.from(uomBuckets.entries())
            .map(([u, qty]) => `${formatQtyClean(qty)} ${u}`)
            .join(' · ')
        : undefined;
    const pkgBreakdownSub =
      pkgKeys.length > 1
        ? Array.from(pkgBuckets.entries())
            .map(([p, qty]) => `${formatQtyClean(qty)} ${p}`)
            .join(' · ')
        : undefined;

    return {
      totalNotes,
      totalGross,
      totalCartons,
      totalValue,
      totalOrderGross,
      distinctItemsCount,
      distinctCarriersCount,
      distinctCustomersCount,
      primaryUomLabel,
      primaryPkgLabel,
      pkgNoun,
      uomBreakdownSub,
      pkgBreakdownSub,
    };
  }, [displayedDeliveries, divisions]);

  const currentSheetConfig = useMemo(() => {
    const qtyValStr = formatQtyClean(activeSheetMetrics.totalGross);
    const pkgValStr = formatQtyClean(activeSheetMetrics.totalCartons);
    const uomUnit = activeSheetMetrics.primaryUomLabel;
    const pkgUnit = activeSheetMetrics.primaryPkgLabel;
    const pkgNoun = activeSheetMetrics.pkgNoun;

    switch (activeChevron) {
      case 'DRAFT':
        return {
          title: 'Draft Deliveries Sheet',
          stageBadge: 'STAGE 1: DRAFT & PREPARATION',
          badgeBg: '#e89a24',
          description: 'Deliveries prepared in warehouse, awaiting vehicle dispatch clearance and gate pass generation.',
          card1: {
            title: 'Draft Deliveries',
            value: `${activeSheetMetrics.totalNotes}`,
            unit: 'Notes',
            sub: `${activeSheetMetrics.distinctCustomersCount} Customers assigned`,
            bg: 'linear-gradient(135deg, rgba(232, 154, 36, 0.22) 0%, rgba(180, 83, 9, 0.32) 100%)',
            glow: '#e89a24',
            icon: <EditOutlined />,
          },
          card2: {
            title: `Draft Dispatched Qty (${uomUnit})`,
            value: qtyValStr,
            unit: uomUnit,
            sub: activeSheetMetrics.uomBreakdownSub || 'Packaged quantity ready in store',
            bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 95, 70, 0.32) 100%)',
            glow: '#10b981',
            icon: <InboxOutlined />,
          },
          card3: {
            title: `Draft ${pkgNoun} & SKUs`,
            value: pkgValStr,
            unit: pkgUnit,
            sub: activeSheetMetrics.pkgBreakdownSub
              ? `${activeSheetMetrics.pkgBreakdownSub} | ${activeSheetMetrics.distinctItemsCount} SKUs`
              : `${activeSheetMetrics.distinctItemsCount} Product lines queued`,
            bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(30, 58, 138, 0.32) 100%)',
            glow: '#3b82f6',
            icon: <ShopOutlined />,
          },
          card4: {
            title: 'Draft Financial Value',
            value: `Rs ${formatDecimal(activeSheetMetrics.totalValue)}`,
            unit: 'PKR',
            sub: 'Pending dispatch balance',
            bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(91, 33, 182, 0.32) 100%)',
            glow: '#8b5cf6',
            icon: <SafetyCertificateOutlined />,
          },
        };

      case 'SHIPPED':
        return {
          title: 'In-Transit Shipments Sheet',
          stageBadge: 'STAGE 2: DISPATCHED & IN-TRANSIT',
          badgeBg: '#3b8fd9',
          description: 'Shipments that departed factory with assigned transport carriers and are en route to destination.',
          card1: {
            title: 'In-Transit Shipments',
            value: `${activeSheetMetrics.totalNotes}`,
            unit: 'Active Consignments',
            sub: `${activeSheetMetrics.distinctCarriersCount} Logistics carriers moving`,
            bg: 'linear-gradient(135deg, rgba(59, 143, 217, 0.22) 0%, rgba(29, 78, 216, 0.32) 100%)',
            glow: '#3b8fd9',
            icon: <CarOutlined />,
          },
          card2: {
            title: `Dispatched Qty en Route (${uomUnit})`,
            value: qtyValStr,
            unit: uomUnit,
            sub: activeSheetMetrics.uomBreakdownSub || 'Consignments currently in transit',
            bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 95, 70, 0.32) 100%)',
            glow: '#10b981',
            icon: <InboxOutlined />,
          },
          card3: {
            title: `En-Route ${pkgNoun} & SKUs`,
            value: pkgValStr,
            unit: pkgUnit,
            sub: activeSheetMetrics.pkgBreakdownSub
              ? `${activeSheetMetrics.pkgBreakdownSub} | ${activeSheetMetrics.distinctItemsCount} SKUs`
              : `${activeSheetMetrics.distinctItemsCount} Product lines in vehicle`,
            bg: 'linear-gradient(135deg, rgba(232, 154, 36, 0.2) 0%, rgba(180, 83, 9, 0.32) 100%)',
            glow: '#e89a24',
            icon: <ShopOutlined />,
          },
          card4: {
            title: 'In-Transit Valuation',
            value: `Rs ${formatDecimal(activeSheetMetrics.totalValue)}`,
            unit: 'PKR',
            sub: 'Active cargo goods valuation',
            bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(91, 33, 182, 0.32) 100%)',
            glow: '#8b5cf6',
            icon: <SafetyCertificateOutlined />,
          },
        };

      case 'DELIVERED':
        return {
          title: 'Delivered Consignments Sheet',
          stageBadge: 'STAGE 3: DELIVERED & RECEIVED',
          badgeBg: '#2ecc71',
          description: 'Shipments successfully received and acknowledged at customer destination warehouses.',
          card1: {
            title: 'Delivered Consignments',
            value: `${activeSheetMetrics.totalNotes}`,
            unit: 'Confirmed Notes',
            sub: `${activeSheetMetrics.distinctCustomersCount} Satisfied customer accounts`,
            bg: 'linear-gradient(135deg, rgba(46, 204, 113, 0.22) 0%, rgba(4, 120, 87, 0.32) 100%)',
            glow: '#2ecc71',
            icon: <CheckCircleOutlined />,
          },
          card2: {
            title: `Delivered Volume (${uomUnit})`,
            value: qtyValStr,
            unit: uomUnit,
            sub: activeSheetMetrics.uomBreakdownSub || 'Physical volume delivered to clients',
            bg: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(3, 105, 161, 0.32) 100%)',
            glow: '#0ea5e9',
            icon: <InboxOutlined />,
          },
          card3: {
            title: `Delivered ${pkgNoun} & SKUs`,
            value: pkgValStr,
            unit: pkgUnit,
            sub: activeSheetMetrics.pkgBreakdownSub
              ? `${activeSheetMetrics.pkgBreakdownSub} | ${activeSheetMetrics.distinctItemsCount} SKUs`
              : `${activeSheetMetrics.distinctItemsCount} Product SKUs delivered`,
            bg: 'linear-gradient(135deg, rgba(232, 154, 36, 0.2) 0%, rgba(180, 83, 9, 0.32) 100%)',
            glow: '#e89a24',
            icon: <ShopOutlined />,
          },
          card4: {
            title: 'Delivered Net Value',
            value: `Rs ${formatDecimal(activeSheetMetrics.totalValue)}`,
            unit: 'PKR',
            sub: 'Ready for official sales billing',
            bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(91, 33, 182, 0.32) 100%)',
            glow: '#8b5cf6',
            icon: <SafetyCertificateOutlined />,
          },
        };

      case 'CANCELLED':
        return {
          title: 'Cancelled Dispatches Sheet',
          stageBadge: 'STAGE: CANCELLED & VOIDED',
          badgeBg: '#d96b6b',
          description: 'Voided delivery orders; inventory allocations restored to available finished goods stock.',
          card1: {
            title: 'Cancelled Deliveries',
            value: `${activeSheetMetrics.totalNotes}`,
            unit: 'Voided Notes',
            sub: 'Removed from active shipping pipeline',
            bg: 'linear-gradient(135deg, rgba(217, 107, 107, 0.22) 0%, rgba(153, 27, 27, 0.32) 100%)',
            glow: '#d96b6b',
            icon: <StopOutlined />,
          },
          card2: {
            title: `Cancelled Volume (${uomUnit})`,
            value: qtyValStr,
            unit: uomUnit,
            sub: activeSheetMetrics.uomBreakdownSub || 'Restored back to finished stock',
            bg: 'linear-gradient(135deg, rgba(232, 154, 36, 0.2) 0%, rgba(180, 83, 9, 0.32) 100%)',
            glow: '#e89a24',
            icon: <InboxOutlined />,
          },
          card3: {
            title: `Cancelled ${pkgNoun}`,
            value: pkgValStr,
            unit: pkgUnit,
            sub: `${activeSheetMetrics.distinctItemsCount} Product lines unassigned`,
            bg: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(30, 58, 138, 0.32) 100%)',
            glow: '#3b82f6',
            icon: <ShopOutlined />,
          },
          card4: {
            title: 'Cancelled Value Amount',
            value: `Rs ${formatDecimal(activeSheetMetrics.totalValue)}`,
            unit: 'PKR',
            sub: 'Voided transaction amount',
            bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(91, 33, 182, 0.32) 100%)',
            glow: '#8b5cf6',
            icon: <SafetyCertificateOutlined />,
          },
        };

      default: // 'ALL'
        return {
          title: 'All Sales Deliveries Sheet',
          stageBadge: 'GLOBAL PIPELINE REPOSITORY',
          badgeBg: '#344558',
          description: 'Master sheet displaying total sales deliveries across all logistics dispatch stages.',
          card1: {
            title: 'Total Deliveries',
            value: `${activeSheetMetrics.totalNotes}`,
            unit: 'Total Notes',
            sub: `${activeSheetMetrics.distinctCustomersCount} Customers across pipeline`,
            bg: 'linear-gradient(135deg, rgba(37, 99, 235, 0.22) 0%, rgba(30, 58, 138, 0.32) 100%)',
            glow: '#3b82f6',
            icon: <CarOutlined />,
          },
          card2: {
            title: `Dispatched Quantity (${uomUnit})`,
            value: qtyValStr,
            unit: uomUnit,
            sub: activeSheetMetrics.uomBreakdownSub || 'Total quantity dispatched in pipeline',
            bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(6, 95, 70, 0.32) 100%)',
            glow: '#10b981',
            icon: <InboxOutlined />,
          },
          card3: {
            title: `Total ${pkgNoun} & SKUs`,
            value: pkgValStr,
            unit: pkgUnit,
            sub: activeSheetMetrics.pkgBreakdownSub
              ? `${activeSheetMetrics.pkgBreakdownSub} | ${activeSheetMetrics.distinctItemsCount} Items`
              : `${activeSheetMetrics.distinctItemsCount} Items | ${activeSheetMetrics.distinctCarriersCount} Carriers`,
            bg: 'linear-gradient(135deg, rgba(232, 154, 36, 0.2) 0%, rgba(180, 83, 9, 0.32) 100%)',
            glow: '#e89a24',
            icon: <ShopOutlined />,
          },
          card4: {
            title: 'Stage Financial Value',
            value: `Rs ${formatDecimal(activeSheetMetrics.totalValue)}`,
            unit: 'PKR',
            sub: 'Total pipeline dispatch value',
            bg: 'linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(91, 33, 182, 0.32) 100%)',
            glow: '#8b5cf6',
            icon: <SafetyCertificateOutlined />,
          },
        };
    }
  }, [activeChevron, activeSheetMetrics]);

  return (
    <div className="inv-page-container">
      {/* Main Card */}
      <div className="inv-main-card">
        {/* Card Header Title */}
        <div className="inv-card-header">
          <CarOutlined className="inv-card-header-icon" />
          <h2 className="inv-card-header-title">Deliveries</h2>
        </div>

        {/* Process Chevron Ribbon (True Interlocking Arrow Pipeline) */}
        <div className="inv-chevron-ribbon">
          <div
            className={`inv-chevron-item chev-all ${activeChevron === 'ALL' ? 'active' : ''}`}
            onClick={() => { setActiveChevron('ALL'); setPage(1); }}
          >
            ALL ({chevronCounts.all})
          </div>
          <div
            className={`inv-chevron-item chev-pending ${activeChevron === 'DRAFT' ? 'active' : ''}`}
            onClick={() => { setActiveChevron('DRAFT'); setPage(1); }}
          >
            DRAFT ({chevronCounts.draft})
          </div>
          <div
            className={`inv-chevron-item chev-partial ${activeChevron === 'SHIPPED' ? 'active' : ''}`}
            onClick={() => { setActiveChevron('SHIPPED'); setPage(1); }}
          >
            SHIPPED ({chevronCounts.shipped})
          </div>
          <div
            className={`inv-chevron-item chev-paid ${activeChevron === 'DELIVERED' ? 'active' : ''}`}
            onClick={() => { setActiveChevron('DELIVERED'); setPage(1); }}
          >
            DELIVERED ({chevronCounts.delivered})
          </div>
          <div
            className={`inv-chevron-item chev-cancelled ${activeChevron === 'CANCELLED' ? 'active' : ''}`}
            onClick={() => { setActiveChevron('CANCELLED'); setPage(1); }}
          >
            CANCELLED ({chevronCounts.cancelled})
          </div>
        </div>

        {/* Distinctive Mint Green Accent Line */}
        <div className="inv-mint-accent-line" style={{ marginBottom: 16 }} />

        {/* Active Sheet Banner */}
        <div className="delivery-sheet-header-banner">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span className="delivery-sheet-badge" style={{ backgroundColor: currentSheetConfig.badgeBg }}>
                {currentSheetConfig.stageBadge}
              </span>
              <h3 className="delivery-sheet-title">{currentSheetConfig.title}</h3>
              <Tag color="blue" style={{ fontWeight: 700, borderRadius: 10, margin: 0 }}>
                {displayedDeliveries.length} Records
              </Tag>
            </div>
            <div className="delivery-sheet-subtitle">{currentSheetConfig.description}</div>
          </div>
        </div>

        {/* 4 Interactive KPI Cards for the Active Sheet */}
        <div className="delivery-kpi-grid">
          {/* Card 1 */}
          <div className="delivery-kpi-card" style={{ background: currentSheetConfig.card1.bg, borderLeft: `3px solid ${currentSheetConfig.card1.glow}` }}>
            <div className="delivery-kpi-watermark-icon" style={{ color: currentSheetConfig.card1.glow }}>
              {currentSheetConfig.card1.icon}
            </div>
            <div className="delivery-kpi-header">
              <div className="delivery-kpi-pill" style={{ background: currentSheetConfig.card1.glow }} />
              <div className="delivery-kpi-title">{currentSheetConfig.card1.title}</div>
            </div>
            <div className="delivery-kpi-value-row">
              <span className="delivery-kpi-value">{currentSheetConfig.card1.value}</span>
              <span className="delivery-kpi-unit">{currentSheetConfig.card1.unit}</span>
            </div>
            <div className="delivery-kpi-sub">{currentSheetConfig.card1.sub}</div>
          </div>

          {/* Card 2 */}
          <div className="delivery-kpi-card" style={{ background: currentSheetConfig.card2.bg, borderLeft: `3px solid ${currentSheetConfig.card2.glow}` }}>
            <div className="delivery-kpi-watermark-icon" style={{ color: currentSheetConfig.card2.glow }}>
              {currentSheetConfig.card2.icon}
            </div>
            <div className="delivery-kpi-header">
              <div className="delivery-kpi-pill" style={{ background: currentSheetConfig.card2.glow }} />
              <div className="delivery-kpi-title">{currentSheetConfig.card2.title}</div>
            </div>
            <div className="delivery-kpi-value-row">
              <span className="delivery-kpi-value">{currentSheetConfig.card2.value}</span>
              <span className="delivery-kpi-unit">{currentSheetConfig.card2.unit}</span>
            </div>
            <div className="delivery-kpi-sub">{currentSheetConfig.card2.sub}</div>
          </div>

          {/* Card 3 */}
          <div className="delivery-kpi-card" style={{ background: currentSheetConfig.card3.bg, borderLeft: `3px solid ${currentSheetConfig.card3.glow}` }}>
            <div className="delivery-kpi-watermark-icon" style={{ color: currentSheetConfig.card3.glow }}>
              {currentSheetConfig.card3.icon}
            </div>
            <div className="delivery-kpi-header">
              <div className="delivery-kpi-pill" style={{ background: currentSheetConfig.card3.glow }} />
              <div className="delivery-kpi-title">{currentSheetConfig.card3.title}</div>
            </div>
            <div className="delivery-kpi-value-row">
              <span className="delivery-kpi-value">{currentSheetConfig.card3.value}</span>
              <span className="delivery-kpi-unit">{currentSheetConfig.card3.unit}</span>
            </div>
            <div className="delivery-kpi-sub">{currentSheetConfig.card3.sub}</div>
          </div>

          {/* Card 4 */}
          <div className="delivery-kpi-card" style={{ background: currentSheetConfig.card4.bg, borderLeft: `3px solid ${currentSheetConfig.card4.glow}` }}>
            <div className="delivery-kpi-watermark-icon" style={{ color: currentSheetConfig.card4.glow }}>
              {currentSheetConfig.card4.icon}
            </div>
            <div className="delivery-kpi-header">
              <div className="delivery-kpi-pill" style={{ background: currentSheetConfig.card4.glow }} />
              <div className="delivery-kpi-title">{currentSheetConfig.card4.title}</div>
            </div>
            <div className="delivery-kpi-value-row">
              <span className="delivery-kpi-value">{currentSheetConfig.card4.value}</span>
              <span className="delivery-kpi-unit">{currentSheetConfig.card4.unit}</span>
            </div>
            <div className="delivery-kpi-sub">{currentSheetConfig.card4.sub}</div>
          </div>
        </div>

        {/* Enterprise Professional Toolbar */}
        <div className="delivery-enterprise-toolbar">
          {/* Left: Modern Search Bar & Filters */}
          <div className="delivery-toolbar-left">
            <div className="delivery-search-wrapper">
              <Input
                className="delivery-search-input"
                placeholder="Search by DN#, Gate Pass#, SOC#, Customer, Carrier or Tracking..."
                prefix={<SearchOutlined className="delivery-search-icon" />}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                onPressEnter={() => setPage(1)}
                allowClear
              />
            </div>

            <Button
              className={`delivery-filter-btn ${!filtersCollapsed ? 'active' : ''}`}
              icon={<FilterOutlined />}
              onClick={() => setFiltersCollapsed((prev) => !prev)}
            >
              Filters
              {activeFilterCount > 0 && (
                <span className="delivery-filter-pill">{activeFilterCount}</span>
              )}
            </Button>

            {(activeFilterCount > 0 || search) && (
              <Button
                type="text"
                size="small"
                icon={<ClearOutlined />}
                onClick={handleClearAll}
                className="delivery-reset-btn"
              >
                Reset
              </Button>
            )}
          </div>

          {/* Right: Page Size Selector & Quick Actions */}
          <div className="delivery-toolbar-right">
            <div className="delivery-entries-pill">
              <span className="delivery-entries-label">Show:</span>
              <Select
                className="delivery-pagesize-select"
                value={pageSize}
                onChange={(val) => { setPageSize(val); setPage(1); }}
                size="small"
                popupMatchSelectWidth={false}
              >
                <Select.Option value={10}>10</Select.Option>
                <Select.Option value={25}>25</Select.Option>
                <Select.Option value={50}>50</Select.Option>
                <Select.Option value={100}>100</Select.Option>
              </Select>
              <span className="delivery-entries-label">entries</span>
            </div>

            <div className="delivery-toolbar-divider" />

            <TableColumnSelector {...selectorProps} size="small" />

            {canExport && (
              <Button
                icon={<FileExcelOutlined />}
                onClick={handleExportCsv}
                className="delivery-tool-action-btn"
                title="Export to CSV"
              >
                CSV
              </Button>
            )}
            {canPrint && (
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                className="delivery-tool-action-btn"
                title="Print Table View"
              >
                Print
              </Button>
            )}
            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={() => void fetchData({ forceRefresh: true })}
              className="delivery-tool-action-btn"
              title="Refresh Data"
            />
          </div>
        </div>

        {/* Collapsible Panel with ALL Filters */}
        {!filtersCollapsed && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            {/* Header: Title + Active Count + Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Deliveries
                </span>
                {activeFilterCount > 0 && (
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {activeFilterCount} Active
                  </Tag>
                )}
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setFiltersCollapsed(true)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of the 6 Filter Boxes */}
            <div className="inv-filter-boxes-grid">
              {/* Box 1: DIVISION */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <ApartmentOutlined /> DIVISION
                </div>
                <Select
                  placeholder="All divisions"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterDivision}
                  onChange={(val) => setFilterDivision(val)}
                >
                  {divisions.map(d => (
                    <Select.Option key={d.id} value={d.id}>{d.name} ({d.divisionCode})</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 2: CARRIER */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CarOutlined /> CARRIER
                </div>
                <Select
                  placeholder="All carriers"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterCarrier}
                  onChange={(val) => setFilterCarrier(val)}
                >
                  {availableCarriers.map(c => (
                    <Select.Option key={c} value={c}>{c}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 3: CUSTOMER */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <UserOutlined /> CUSTOMER
                </div>
                <Select
                  placeholder="All customers"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                  className="inv-filter-box-select"
                  value={filterCustomer}
                  onChange={(val) => setFilterCustomer(val)}
                >
                  {customers.map(c => (
                    <Select.Option key={c.id} value={c.id}>
                      {c.customerCode ? `[${c.customerCode}] ` : ''}{c.companyName || c.name}
                    </Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 4: STATUS */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CheckOutlined /> STATUS
                </div>
                <Select
                  placeholder="All statuses"
                  allowClear
                  className="inv-filter-box-select"
                  value={filterStatus}
                  onChange={(val) => setFilterStatus(val)}
                >
                  {STATUS_OPTIONS.map(s => (
                    <Select.Option key={s} value={s}>{s}</Select.Option>
                  ))}
                </Select>
              </div>

              {/* Box 5: DATE FROM */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE FROM
                </div>
                <Input
                  type="date"
                  className="inv-filter-date"
                  value={filterDateFrom || ''}
                  onChange={(e) => setFilterDateFrom(e.target.value || undefined)}
                />
              </div>

              {/* Box 6: DATE TO */}
              <div className="inv-filter-box-item">
                <div className="inv-filter-box-label">
                  <CalendarOutlined /> DATE TO
                </div>
                <Input
                  type="date"
                  className="inv-filter-date"
                  value={filterDateTo || ''}
                  onChange={(e) => setFilterDateTo(e.target.value || undefined)}
                />
              </div>
            </div>

            {/* Footer with Clear Filters and Apply Filters inside */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <Button
                icon={<ClearOutlined />}
                onClick={handleClearAll}
                danger={activeFilterCount > 0}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setFiltersCollapsed(true)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    setPage(1);
                    setFiltersCollapsed(true);
                  }}
                  loading={loading}
                  style={{ fontWeight: 600 }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Custom ERP Table */}
        <Table
          columns={visibleColumns}
          dataSource={paginatedDeliveries}
          rowKey="id"
          loading={loading}
          pagination={false}
          size="small"
          className="inv-custom-table dn-compact-table"
          scroll={{ x: 'max-content' }}
        />

        {/* Custom Pagination Footer */}
        <div className="inv-pagination-footer">
          <div className="inv-pagination-info">
            Showing {startEntry} to {endEntry} of {totalEntries} entries
          </div>
          <div className="inv-pagination-buttons">
            <button
              className="inv-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(prev => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <span className="inv-page-indicator">
              Page {page} of {totalPages}
            </span>
            <button
              className="inv-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Create / Edit Delivery Modal — Daily Production Entry Wizard Style with 7px Outer Translucent Frame */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingRight: 8 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(234, 88, 12, 0.38)',
                color: '#ffffff',
                fontSize: 20,
                flexShrink: 0,
              }}
            >
              <CarOutlined />
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 10.5,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '1.1px',
                  color: '#ea580c',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>SALES &amp; DISPATCH · DELIVERY CHALLAN &amp; GATE PASS</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: token.colorTextSecondary,
                    backgroundColor: token.colorFillAlter,
                    padding: '1px 8px',
                    borderRadius: 6,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    letterSpacing: 'normal',
                    textTransform: 'none',
                  }}
                >
                  Drag to Move
                </span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 900, color: token.colorText, marginTop: 1 }}>
                {editingItem ? `Edit Delivery Note — ${editingItem.deliveryNumber || ''}` : 'Create Sales Delivery'}
              </div>
            </div>
          </div>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        minimizedTitle={editingItem ? `Edit Delivery Note — ${editingItem.deliveryNumber || ''}` : 'Create Sales Delivery'}
        width={1100}
        styles={{
          content: {
            padding: 7,
            borderRadius: 22,
            background: 'color-mix(in srgb, var(--theme-primary, #ea580c) 8%, rgba(148, 163, 184, 0.22))',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
          },
          header: {
            backgroundColor: token.colorBgContainer,
            borderRadius: '16px 16px 0 0',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            padding: '14px 20px',
            marginBottom: 0,
          },
          body: {
            backgroundColor: token.colorBgLayout,
            padding: '16px 20px',
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
          },
          footer: {
            backgroundColor: token.colorBgContainer,
            borderRadius: '0 0 16px 16px',
            borderTop: `1px solid ${token.colorBorderSecondary}`,
            padding: '12px 20px',
            marginTop: 0,
          },
        }}
        footer={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Button
                key="preview-gp"
                size="large"
                icon={<SafetyCertificateOutlined />}
                style={{
                  backgroundColor: '#0284c7',
                  borderColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 600,
                  borderRadius: 10,
                }}
                onClick={handleModalPreviewGatePass}
              >
                Preview Gate Pass
              </Button>
              {canPrint && (
                <Button
                  key="preview-dc"
                  size="large"
                  icon={<PrinterOutlined />}
                  style={{
                    backgroundColor: '#475569',
                    borderColor: '#475569',
                    color: '#ffffff',
                    fontWeight: 600,
                    borderRadius: 10,
                  }}
                  onClick={handleModalPrintChallan}
                >
                  Print Delivery Challan
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                key="cancel"
                size="large"
                onClick={() => setModalVisible(false)}
                style={{ minWidth: 100, borderRadius: 10, fontWeight: 600 }}
              >
                Cancel
              </Button>
              <Button
                key="submit"
                type="primary"
                size="large"
                loading={isSubmitting}
                disabled={isSubmitting}
                onClick={handleSubmitForm}
                style={{
                  minWidth: 180,
                  borderRadius: 10,
                  fontWeight: 700,
                  border: 'none',
                  background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                  boxShadow: '0 4px 14px rgba(234, 88, 12, 0.35)',
                }}
              >
                {editingItem ? 'Update Delivery' : 'Save & Create Delivery'}
              </Button>
            </div>
          </div>
        }
      >
        {editingItem && String(editingItem.status || 'DRAFT').toUpperCase() !== 'DRAFT' && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 14 }}
            message="Admin Override Mode"
            description="Editing a confirmed document will recalculate delivery totals and fulfillment balances. This override is recorded in the audit log."
          />
        )}
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="divisionId" label="Division" rules={[{ required: true, message: 'Please select division' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Select division"
                  onChange={handleModalDivisionChange}
                  options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ? `[${d.divisionCode}] ` : ''}${d.name}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="customerId" label="Customer" rules={[{ required: true, message: 'Please select customer' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={modalDivisionId ? "Select customer" : "Select Division first"}
                  onChange={handleCustomerChange}
                  options={modalCustomers.map((c) => ({ value: c.id, label: `${c.customerCode ? `[${c.customerCode}] ` : ''}${c.companyName || c.name}` }))}
                />
              </Form.Item>
              {customerCreditStatus && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: -12, marginBottom: 8 }}>
                  <Tag color={customerCreditStatus.creditHold ? 'red' : customerCreditStatus.exceedsCreditLimit ? 'orange' : 'blue'} style={{ margin: 0 }}>
                    Limit: {customerCreditStatus.creditLimit > 0 ? `Rs ${formatDecimal(customerCreditStatus.creditLimit)}` : 'Unlimited'}
                  </Tag>
                  <Tag color={customerCreditStatus.currentBalance > 0 ? 'volcano' : 'green'} style={{ margin: 0 }}>
                    Bal: Rs {formatDecimal(Math.abs(customerCreditStatus.currentBalance || 0))} {customerCreditStatus.currentBalance > 0 ? 'DR' : ''}
                  </Tag>
                  <Tag style={{ margin: 0 }}>{customerCreditStatus.paymentTerms || 'Cash / Immediate'}</Tag>
                  {customerCreditStatus.creditHold && <Tag color="error" style={{ margin: 0 }}>CREDIT HOLD</Tag>}
                </div>
              )}
            </Col>
            <Col span={8}>
              <Form.Item name="warehouseId" label="Warehouse">
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={modalDivisionId ? "Select warehouse" : "Select Division first"}
                  options={modalWarehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerPo" label="Customer PO #">
                <Select
                  allowClear
                  showSearch
                  placeholder={customerPos.length > 0 ? "Select Customer PO" : "Select Customer first (or type PO)"}
                  onChange={handleCustomerPoChange}
                  options={customerPos.map(po => ({ value: po, label: po }))}
                  notFoundContent={customerPos.length === 0 ? "No active POs found for customer" : undefined}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="salesOrderIds" label="Sales Order Confirmation(s) (SOC #) — Multi-Select Allowed">
                <Select
                  mode="multiple"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder={customerSalesOrders.length > 0 ? "Select one or more SOCs..." : "Select Customer first"}
                  onChange={(val) => handleSalesOrdersChange(val)}
                  options={customerSalesOrders.map((so) => ({
                    value: so.id,
                    label: `${so.orderNumber}${so.customerPo ? ` (PO: ${so.customerPo})` : ''} — ${so.items?.length || 0} items`,
                  }))}
                  notFoundContent={customerSalesOrders.length === 0 ? "No pending sales orders for customer" : undefined}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Active Order Banner */}
          {selectedSoInfo && (
            <div style={{
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(37, 99, 235, 0.12)',
              border: '1px solid rgba(59, 130, 246, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <BranchesOutlined style={{ color: '#38bdf8', fontSize: 16 }} />
                <span>
                  Linked SOC: <strong style={{ color: '#38bdf8' }}>{selectedSoInfo.orderNumber}</strong>
                  {selectedSoInfo.customerPo ? <span> (Customer PO: <strong style={{ color: '#fbbf24' }}>{selectedSoInfo.customerPo}</strong>)</span> : null}
                </span>
              </div>
              <Tag color="cyan" style={{ fontWeight: 700, margin: 0 }}>
                {selectedSoInfo.pendingCount} Balance Item(s) Auto-Loaded
              </Tag>
            </div>
          )}

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deliveryDate" label="Delivery Date (Dispatch Date)" rules={[{ required: true, message: 'Please specify delivery date' }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expectedDate" label="Expected Date (from Order / Agreement)">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>

          {/* Dynamic Early / On-Time / Delayed Dispatch Tag */}
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.deliveryDate !== currentValues.deliveryDate ||
              prevValues.expectedDate !== currentValues.expectedDate
            }
          >
            {({ getFieldValue }) => {
              const dDate = getFieldValue('deliveryDate');
              const eDate = getFieldValue('expectedDate');
              if (!dDate || !eDate) return null;
              const diffDays = dayjs(eDate).diff(dayjs(dDate), 'day');
              return (
                <div style={{
                  marginBottom: 16,
                  padding: '8px 14px',
                  borderRadius: 6,
                  background: 'rgba(15, 23, 42, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}>
                  <span style={{ fontSize: 12, color: 'var(--inv-text-muted, #94a3b8)', fontWeight: 600 }}>
                    DISPATCH TIMELINE:
                  </span>
                  {diffDays > 0 ? (
                    <Tag color="cyan" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      🎉 {diffDays} {diffDays === 1 ? 'Day' : 'Days'} Early Dispatch (Ahead of Schedule)
                    </Tag>
                  ) : diffDays === 0 ? (
                    <Tag color="green" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      ⏱️ On-Time Dispatch (Matches Expected Delivery Date)
                    </Tag>
                  ) : (
                    <Tag color="volcano" style={{ fontSize: 13, padding: '4px 12px', borderRadius: 4, fontWeight: 700 }}>
                      ⚠️ Delayed Dispatch by {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? 'Day' : 'Days'}
                    </Tag>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--inv-text-muted, #94a3b8)', marginLeft: 'auto' }}>
                    Delivery: {dayjs(dDate).format('DD/MM/YYYY')} vs Expected: {dayjs(eDate).format('DD/MM/YYYY')}
                  </span>
                </div>
              );
            }}
          </Form.Item>

          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item
                name="gatePassNumber"
                label="Gate Pass # (Book Serial)"
                tooltip="Auto-filled with the next sequential Gate Pass Book serial number. You may edit or enter any custom book serial anytime."
              >
                <Input
                  prefix={<SafetyCertificateOutlined style={{ color: token.colorPrimary }} />}
                  placeholder="e.g. GP-1046 or 1046"
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="carrier" label="Carrier / Transport">
                <Input placeholder="e.g. TCS / Cargo / Pakistan Railway / PWI Fleet" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="trackingNumber" label="Tracking Number / Bilty #">
                <Input placeholder="e.g. TRK-892147 / BL-4412" />
              </Form.Item>
            </Col>
          </Row>

          <ERPLineItems
            companyId={companyId}
            value={lineItems}
            onChange={setLineItems}
            showWarehouse={false}
            label="Delivery Items"
            currency="PKR"
            context="delivery"
            customerId={form.getFieldValue('customerId')}
            orderId={form.getFieldValue('salesOrderId')}
            warehouseId={form.getFieldValue('warehouseId')}
          />
          <Form.Item name="notes" label="Dispatch & Delivery Notes">
            <Input.TextArea rows={3} placeholder="Add any special handling or delivery instructions..." />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* ── PROMINENT CONFIRMATION & WARNING MODAL ── */}
      <Modal
        open={warningModalVisible}
        onCancel={() => setWarningModalVisible(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ef4444' }}>
            <WarningFilled style={{ fontSize: 24, color: '#ef4444' }} />
            <span style={{ fontSize: 17, fontWeight: 800 }}>⚠️ DISPATCH QUANTITY EXCEEDS ORDER CONFIRMATION (SOC)</span>
          </div>
        }
        width={740}
        centered
        footer={[
          <Button
            key="cancel"
            size="large"
            onClick={() => setWarningModalVisible(false)}
            style={{ fontWeight: 600, height: 42, padding: '0 20px' }}
          >
            Cancel & Adjust Quantities
          </Button>,
          <Button
            key="confirm"
            type="primary"
            danger
            size="large"
            loading={isSubmitting}
            disabled={isSubmitting}
            onClick={() => {
              setWarningModalVisible(false);
              setPreSaveConfirmVisible(true);
            }}
            style={{ fontWeight: 700, height: 42, padding: '0 20px', backgroundColor: '#dc2626', borderColor: '#dc2626' }}
          >
            Proceed to Delivery Verification
          </Button>,
        ]}
      >
        <div style={{ padding: '12px 0' }}>
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1.5px solid #ef4444',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
              ⚠️ Dispatch quantity exceeds the approved order balance! (Order Excess Detected)
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--inv-text-primary, #cbd5e1)', lineHeight: 1.5 }}>
              The following items have quantities exceeding their approved Sales Order (SOC) balance. If you proceed with this dispatch, the order will be over-dispatched.
            </div>
          </div>

          <Table
            size="small"
            dataSource={pendingExcessWarnings}
            rowKey={(r) => `${r.itemCode}-${r.orderNumber || ''}`}
            pagination={false}
            columns={[
              {
                title: 'Item',
                key: 'item',
                render: (_, r) => (
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.itemName}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.itemCode}</div>
                  </div>
                ),
              },
              {
                title: 'Linked SOC #',
                dataIndex: 'orderNumber',
                key: 'orderNumber',
                render: (val) => <Tag color="geekblue" style={{ fontWeight: 700 }}>{val || 'Direct'}</Tag>,
              },
              {
                title: 'Max Order Bal',
                key: 'orderBalance',
                align: 'right',
                render: (_, r) => (
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>
                    {r.orderBalance.toLocaleString()} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Entered Qty',
                key: 'enteredQty',
                align: 'right',
                render: (_, r) => (
                  <span style={{ fontWeight: 700, color: '#f87171' }}>
                    {r.enteredQty.toLocaleString()} {r.uom}
                  </span>
                ),
              },
              {
                title: 'Excess Quantity',
                key: 'excessQty',
                align: 'right',
                render: (_, r) => (
                  <Tag color="error" style={{ fontSize: 12, fontWeight: 800, padding: '2px 8px' }}>
                    +{r.excessQty.toLocaleString()} {r.uom}
                  </Tag>
                ),
              },
            ]}
          />

          <div style={{ marginTop: 14, fontSize: 12.5, color: 'var(--inv-text-muted, #94a3b8)', textAlign: 'center' }}>
            Do you really want to confirm the delivery and gate pass with this excess quantity?
          </div>
        </div>
      </Modal>

      {/* ── MANDATORY PRE-SAVE DELIVERY VERIFICATION MODAL ── */}
      <Modal
        open={preSaveConfirmVisible}
        onCancel={() => setPreSaveConfirmVisible(false)}
        width={820}
        centered
        zIndex={2500}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontSize: 20,
                boxShadow: '0 4px 12px rgba(234, 88, 12, 0.35)',
                flexShrink: 0,
              }}
            >
              <SafetyCertificateOutlined />
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 800, color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Pre-Save Delivery Verification
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: token.colorText }}>
                {editingItem
                  ? `Confirm & Update Sales Delivery (${editingItem.deliveryNumber})`
                  : 'Confirm & Save Sales Delivery / Gate Pass'}
              </div>
            </div>
          </div>
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 4 }}>
            <Button
              size="large"
              onClick={() => setPreSaveConfirmVisible(false)}
              disabled={isSubmitting}
              style={{ fontWeight: 700, borderRadius: 8, height: 42, padding: '0 20px' }}
            >
              Back to Edit
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<CheckCircleOutlined />}
              loading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => void executeSave()}
              style={{
                fontWeight: 800,
                borderRadius: 8,
                height: 44,
                padding: '0 26px',
                background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
                borderColor: '#059669',
                boxShadow: '0 4px 14px rgba(5, 150, 105, 0.35)',
              }}
            >
              {editingItem ? 'Confirm & Update Delivery' : 'Confirm & Save Delivery'}
            </Button>
          </div>
        }
      >
        {(() => {
          const vals = pendingFormValues || form.getFieldsValue();
          const selCustomer = customers.find((c) => c.id === vals?.customerId);
          const custName =
            selCustomer?.companyName ||
            selCustomer?.name ||
            editingItem?.companyName ||
            (editingItem as any)?.customerName ||
            'Selected Customer';
          const custCode = selCustomer?.customerCode || (editingItem as any)?.customer?.customerCode;

          const selDivision = divisions.find(
            (d) => d.id === (vals?.divisionId || modalDivisionId || selCustomer?.divisionId),
          );
          const selWarehouse = warehouses.find((w) => w.id === vals?.warehouseId);

          const rawSoIds: string[] = Array.isArray(vals?.salesOrderIds)
            ? vals.salesOrderIds
            : vals?.salesOrderId
              ? [vals.salesOrderId]
              : [];
          const matchedOrders = rawSoIds
            .map(
              (id) =>
                customerSalesOrders.find((o) => o.id === id) ||
                allSalesOrders.find((o) => o.id === id),
            )
            .filter(Boolean);
          const socNumbers = Array.from(
            new Set([
              ...matchedOrders.map((o: any) => o.orderNumber).filter(Boolean),
              ...lineItems.map((l) => l.salesOrderNumber).filter(Boolean),
              ...(selectedSoInfo?.orderNumber ? [selectedSoInfo.orderNumber] : []),
            ]),
          );
          const resolvedCustomerPo =
            vals?.customerPo ||
            matchedOrders.find((o: any) => o?.customerPo)?.customerPo ||
            selectedSoInfo?.customerPo ||
            null;

          const validLines = lineItems.filter((l) => l.itemId && String(l.itemId).trim() !== '');
          const verificationSummary = summarizeLinesTaxVerification(validLines, 18);
          const gatePassDisplay =
            (vals?.gatePassNumber && String(vals.gatePassNumber).trim()) ||
            editingItem?.gatePassNumber ||
            nextGatePassSuggestion ||
            'Auto-Assigned';
          const deliveryDateDisplay = vals?.deliveryDate
            ? dayjs(vals.deliveryDate).format('DD-MMM-YYYY')
            : dayjs().format('DD-MMM-YYYY');

          return (
            <div style={{ padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <PreConfirmVerificationCard
                summary={verificationSummary}
                currency="Rs"
                showSocColumn={true}
                onApplyStandardTax={() => {
                  const updatedLines = lineItems.map((l) => {
                    const q = Number(l.quantity || 0);
                    const r = Number(l.rate || 0);
                    const d = Number(l.discountPercent || 0);
                    const afterDisc = q * r * (1 - d / 100);
                    return {
                      ...l,
                      taxPercent: 18,
                      lineTotal: Math.round(afterDisc * 1.18 * 100) / 100,
                    };
                  });
                  setLineItems(updatedLines);
                  if (pendingSavePayload && Array.isArray(pendingSavePayload.lines)) {
                    setPendingSavePayload({
                      ...pendingSavePayload,
                      lines: pendingSavePayload.lines.map((pl: any) => {
                        const qty = Number(pl.quantity || 0);
                        const rate = Number(pl.unitPrice || 0);
                        const lineSub = Math.round(qty * rate * 100) / 100;
                        const lineTax = Math.round(lineSub * 0.18 * 100) / 100;
                        return {
                          ...pl,
                          taxAmount: lineTax,
                          lineTotal: Math.round((lineSub + lineTax) * 100) / 100,
                        };
                      }),
                    });
                  }
                  message.success('Standard 18% Tax applied to all delivery lines');
                }}
                headerItems={[
                  {
                    label: 'Customer',
                    value: (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                        <span style={{ fontWeight: 800, color: token.colorText, lineHeight: 1.3 }}>
                          {custName}
                        </span>
                        {custCode && (
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              padding: '1px 6px',
                              borderRadius: 4,
                              backgroundColor: token.colorFillAlter,
                              border: `1px solid ${token.colorBorder}`,
                              color: token.colorPrimary,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {custCode}
                          </span>
                        )}
                      </div>
                    ),
                  },
                  {
                    label: 'Division & Warehouse',
                    value: selDivision ? `${selDivision.divisionCode} — ${selDivision.name}` : 'General Division',
                    subtext: selWarehouse
                      ? `WH: ${selWarehouse.warehouseCode} — ${selWarehouse.name}`
                      : undefined,
                  },
                  {
                    label: 'Sales Order(s) (SOC #)',
                    value: socNumbers.length > 0 ? socNumbers.join(', ') : 'Direct Dispatch',
                    subtext: `Customer PO #: ${resolvedCustomerPo || 'Not Provided'}`,
                  },
                  {
                    label: 'Delivery Date & Gate Pass #',
                    value: deliveryDateDisplay,
                    subtext: (
                      <span
                        style={{
                          display: 'inline-block',
                          marginTop: 2,
                          fontSize: 11,
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          padding: '1px 7px',
                          borderRadius: 4,
                          backgroundColor: 'rgba(16, 185, 129, 0.14)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          color: '#059669',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Gate Pass: {gatePassDisplay}
                      </span>
                    ),
                  },
                ]}
              />

              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  backgroundColor: token.colorFillAlter,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  fontSize: 13,
                  fontWeight: 600,
                  color: token.colorTextSecondary,
                  textAlign: 'center',
                }}
              >
                Please verify that the <strong style={{ color: token.colorText }}>Customer</strong>,{' '}
                <strong style={{ color: token.colorText }}>SOC #</strong>,{' '}
                <strong style={{ color: token.colorText }}>Gate Pass #</strong>,{' '}
                <strong style={{ color: token.colorText }}>Quantities</strong>,{' '}
                <strong style={{ color: token.colorText }}>Rates</strong>, and{' '}
                <strong style={{ color: token.colorText }}>Tax</strong> above are accurate before saving.
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Detail Modal - Reference 2-Column Split Design */}
      <DraggableResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CarOutlined style={{ color: '#2563eb' }} />
            <span style={{ fontWeight: 800 }}>Delivery Note Details: {detailItem?.deliveryNumber}</span>
            {detailItem?.status && (
              <Tag color={['DELIVERED', 'CONFIRMED'].includes(detailItem.status.toUpperCase()) ? 'green' : 'orange'} style={{ fontWeight: 700, marginLeft: 6 }}>
                {detailItem.status}
              </Tag>
            )}
            {detailItem?.divisionName && (
              <Tag color="geekblue" style={{ fontWeight: 700 }}>
                {detailItem.divisionName}
              </Tag>
            )}
          </div>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={[
          canPrint && (
            <Button key="print" icon={<PrinterOutlined />} onClick={() => detailItem && requestActionConfirmation(detailItem, 'print_challan')}>
              Print Delivery Challan
            </Button>
          ),
          canPrint && (
            <Button
              key="gatepass"
              style={{ backgroundColor: '#b45309', borderColor: '#b45309', color: '#fff' }}
              icon={<SafetyCertificateOutlined />}
              onClick={() => detailItem && requestActionConfirmation(detailItem, 'gate_pass')}
            >
              Print Outward Gate Pass
            </Button>
          ),
          detailItem && canConfirm && ['DRAFT', 'SHIPPED', 'DELIVERED'].includes((detailItem.status || '').toUpperCase()) && (
            <Button
              key="confirm"
              type="primary"
              icon={<CheckOutlined />}
              style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => {
                requestActionConfirmation(detailItem, 'confirm');
              }}
            >
              Post & Deduct Inventory
            </Button>
          ),
          detailItem && canCreateInvoice && ['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes((detailItem.status || '').toUpperCase()) && (
            <Button
              key="invoice"
              type="primary"
              icon={<FileTextOutlined />}
              style={{ backgroundColor: '#ea580c', borderColor: '#ea580c' }}
              onClick={() => {
                requestActionConfirmation(detailItem, 'invoice');
              }}
            >
              Generate Sales Invoice
            </Button>
          ),
          <Button key="close" onClick={() => setDetailVisible(false)}>
            Close
          </Button>,
        ]}
        width={1120}
      >
        {detailItem && (() => {
          const allDetailSocs: string[] = (detailItem as any).salesOrderNumbers && (detailItem as any).salesOrderNumbers.length > 0
            ? (detailItem as any).salesOrderNumbers
            : [detailItem.salesOrderNumber || detailItem.salesOrder?.orderNumber].filter(Boolean);
          const salesOrderDisplay = allDetailSocs.length > 0 ? allDetailSocs.join(', ') : (detailItem.salesOrderId ? `SO-${detailItem.salesOrderId.slice(0, 8).toUpperCase()}` : 'Direct Delivery');
          const effectiveDivision = detailItem.divisionName || detailItem.salesOrder?.division?.name || 'Control Cable Division';

          return (
            <div className="doc-split-layout">
              {/* LEFT SIDEBAR (~320px) */}
              <div className="doc-split-sidebar">
                {/* Brand & Division */}
                <div className="doc-sidebar-brand">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ApartmentOutlined style={{ color: '#2563eb', fontSize: 16 }} />
                    <div className="doc-sidebar-company-title">Pakistan Wire Industries (Pvt.) LTD</div>
                  </div>
                  <Tag color="geekblue" style={{ fontWeight: 700, marginTop: 4, width: 'fit-content', padding: '2px 8px' }}>
                    {effectiveDivision}
                  </Tag>
                </div>

                {/* Total Box */}
                <div className="doc-sidebar-total-card">
                  <div className="doc-sidebar-total-label">TOTAL DISPATCH VALUE</div>
                  <div className="doc-sidebar-total-val">Rs {formatDecimal(detailItem.totalAmount || 0)}</div>
                  <div className="doc-sidebar-total-sub">
                    Status: <span style={{ fontWeight: 700, color: ['DELIVERED', 'CONFIRMED'].includes((detailItem.status || '').toUpperCase()) ? '#10b981' : '#f59e0b' }}>{detailItem.status}</span>
                  </div>
                </div>

                {/* Quick Actions in Left Sidebar */}
                <div className="doc-sidebar-actions">
                  {canPrint && (
                    <Button
                      type="primary"
                      icon={<PrinterOutlined />}
                      block
                      onClick={() => requestActionConfirmation(detailItem, 'print_challan')}
                    >
                      Print Delivery Challan
                    </Button>
                  )}
                  {canPrint && (
                    <Button
                      icon={<SafetyCertificateOutlined />}
                      block
                      style={{ backgroundColor: '#b45309', borderColor: '#b45309', color: '#fff' }}
                      onClick={() => requestActionConfirmation(detailItem, 'gate_pass')}
                    >
                      Print Outward Gate Pass
                    </Button>
                  )}
                  {['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes((detailItem.status || '').toUpperCase()) && (
                    (detailItem.isInvoiced || detailItem.invoicedInvoiceNo || detailItem.invoicedInvoice?.invoiceNo) ? (
                      <Button
                        icon={<CheckCircleOutlined />}
                        block
                        disabled
                        style={{
                          fontWeight: 700,
                          color: token.colorSuccess,
                          backgroundColor: token.colorSuccessBg,
                          borderColor: token.colorSuccessBorder,
                        }}
                      >
                        Invoiced: {detailItem.invoicedInvoiceNo || detailItem.invoicedInvoice?.invoiceNo}
                      </Button>
                    ) : canCreateInvoice ? (
                      <Button
                        type="primary"
                        icon={<FileTextOutlined />}
                        block
                        style={{ backgroundColor: '#ea580c', borderColor: '#ea580c' }}
                        onClick={() => requestActionConfirmation(detailItem, 'invoice')}
                      >
                        Generate Sales Invoice
                      </Button>
                    ) : null
                  )}
                </div>

                {/* From Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <ShopOutlined style={{ color: '#2563eb' }} /> FROM (DISPATCH ORIGIN)
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--inv-text-primary)' }}>
                    {effectiveDivision}
                  </div>
                  <div style={{ color: 'var(--inv-text-muted)' }}>
                    {warehouses.find(w => w.id === detailItem.warehouseId)?.name || 'Main Factory Dispatch / Store'}
                  </div>
                </div>

                {/* Bill To Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <UserOutlined style={{ color: '#16a34a' }} /> BILL TO / CUSTOMER
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--inv-text-primary)' }}>
                    {getCustomerDisplayName(detailItem)}
                  </div>
                  <div style={{ color: 'var(--inv-text-muted)' }}>
                    {detailItem.shipToAddress || 'Factory Gate Dispatch'}
                  </div>
                </div>

                {/* Document Metadata Section */}
                <div className="doc-sidebar-section">
                  <div className="doc-sidebar-section-title">
                    <FileTextOutlined style={{ color: '#f59e0b' }} /> DOCUMENT
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k"># Number:</span>
                    <span className="doc-sidebar-v">{detailItem.deliveryNumber}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Gate Pass #:</span>
                    <span className="doc-sidebar-v" style={{ fontFamily: 'monospace', fontWeight: 800, color: '#38bdf8' }}>
                      {detailItem.gatePassNumber || '-'}
                    </span>
                  </div>
                  <div className="doc-sidebar-kv" style={{ alignItems: 'flex-start' }}>
                    <span className="doc-sidebar-k">Sales Order #:</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {allDetailSocs.length > 0 ? (
                        allDetailSocs.map((soc: string, idx: number) => (
                          <span key={idx} className="doc-sidebar-v" style={{ color: idx === 0 ? '#38bdf8' : '#c084fc', fontWeight: 700 }}>
                            {soc}
                          </span>
                        ))
                      ) : (
                        <span className="doc-sidebar-v" style={{ color: '#38bdf8' }}>{salesOrderDisplay}</span>
                      )}
                    </div>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Customer PO #:</span>
                    <span className="doc-sidebar-v" style={{ color: '#fbbf24', fontWeight: 700 }}>
                      {detailItem.customerPo || (detailItem as any).salesOrder?.customerPo || '-'}
                    </span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Delivery Date:</span>
                    <span className="doc-sidebar-v">{detailItem.deliveryDate ? dayjs(detailItem.deliveryDate).format('MMM DD, YYYY') : '-'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Expected Date:</span>
                    <span className="doc-sidebar-v">{detailItem.expectedDate ? dayjs(detailItem.expectedDate).format('MMM DD, YYYY') : '-'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Carrier / Fleet:</span>
                    <span className="doc-sidebar-v">{detailItem.carrier || 'Standard Fleet'}</span>
                  </div>
                  <div className="doc-sidebar-kv">
                    <span className="doc-sidebar-k">Tracking #:</span>
                    <span className="doc-sidebar-v">{detailItem.trackingNumber || '-'}</span>
                  </div>
                </div>
              </div>

              {/* RIGHT MAIN PANEL */}
              <div className="doc-split-main">
                {/* Traceability Flow */}
                <div className="doc-traceability-banner" style={{ margin: 0 }}>
                  <div className="doc-traceability-title">
                    <BranchesOutlined style={{ color: '#2563eb' }} />
                    <span>Document Traceability</span>
                  </div>
                  <Row gutter={12}>
                    <Col span={8}>
                      <div className="doc-traceability-step">
                        <div className="doc-step-label">ORIGINATING SALES ORDER</div>
                        <div className="doc-step-val" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {allDetailSocs.length > 0 ? (
                            allDetailSocs.map((soc: string, idx: number) => (
                              <div key={idx} style={{ color: idx === 0 ? '#38bdf8' : '#c084fc', fontWeight: 700, fontSize: 13 }}>
                                {soc}
                              </div>
                            ))
                          ) : (
                            <div style={{ color: '#38bdf8' }}>{salesOrderDisplay}</div>
                          )}
                        </div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div className="doc-traceability-step active-step">
                        <div className="doc-step-label" style={{ color: '#38bdf8' }}>DELIVERY NOTE (THIS)</div>
                        <div className="doc-step-val" style={{ color: '#60a5fa' }}>{detailItem.deliveryNumber} [{detailItem.status}]</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div className="doc-traceability-step">
                        <div className="doc-step-label">GENERATED SALES INVOICE</div>
                        {detailItem.relatedInvoices && detailItem.relatedInvoices.length > 0 ? (
                          detailItem.relatedInvoices.map(inv => (
                            <div key={inv.id} className="doc-step-val" style={{ color: '#fb923c', fontSize: 12 }}>
                              {inv.invoiceNumber || inv.invoiceNo} [{inv.status}]
                            </div>
                          ))
                        ) : (
                          <div className="doc-step-sub" style={{ color: 'var(--inv-text-muted, #94a3b8)' }}>Pending Invoicing</div>
                        )}
                      </div>
                    </Col>
                  </Row>
                </div>

                {/* Items Table matching reference image */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>Dispatched Items</span>
                    <Tag color="blue">{detailItem.lines?.length || 0} ITEMS</Tag>
                  </div>
                  <Table
                    className="doc-reference-table"
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={detailItem.lines || []}
                    columns={[
                      { title: '#', key: 'idx', width: 45, align: 'center', render: (_: any, __: any, index: number) => index + 1 },
                      {
                        title: 'PRODUCT / DESCRIPTION',
                        dataIndex: 'description',
                        key: 'description',
                        render: (text: string, row: any) => {
                          const socMatch = text?.match(/\[SOC:\s*([^\]]+)\]/i);
                          const cleanText = socMatch ? text.replace(socMatch[0], '').trim() : text;
                          const lineSoc = socMatch ? socMatch[1].trim() : row.socNumber;
                          return (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontWeight: 600 }}>{cleanText}</span>
                              {lineSoc && (
                                <Tag color="purple" style={{ margin: 0, fontWeight: 700, fontSize: 11 }}>
                                  SOC: {lineSoc}
                                </Tag>
                              )}
                            </div>
                          );
                        },
                      },
                      {
                        title: 'QTY',
                        dataIndex: 'quantity',
                        key: 'quantity',
                        width: 120,
                        align: 'right',
                        render: (v: any, row: any) => {
                          const rowUom =
                            normalizeSalesUomCode(row?.uom?.code || row?.uomCode || row?.item?.salesUom?.code || row?.item?.baseUom?.code) ||
                            resolveDeliveryUnits(detailItem, divisions).uom;
                          return `${formatQtyClean(v)} ${rowUom}`;
                        },
                      },
                      { title: 'RATE', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, align: 'right', render: (v: any) => `Rs ${formatDecimal(v)}` },
                      { title: 'TAX', dataIndex: 'taxAmount', key: 'taxAmount', width: 110, align: 'right', render: (v: any) => `Rs ${formatDecimal(v || 0)}` },
                      { title: 'AMOUNT', dataIndex: 'lineTotal', key: 'lineTotal', width: 130, align: 'right', render: (v: any) => <strong>Rs ${formatDecimal(v)}</strong> },
                    ]}
                  />
                </div>

                {/* Bottom Financial Summary Box */}
                <div className="doc-summary-box">
                  <div className="doc-summary-row">
                    <span>Subtotal</span>
                    <span>Rs {formatDecimal(detailItem.subtotal)}</span>
                  </div>
                  <div className="doc-summary-row">
                    <span>Tax / GST</span>
                    <span>Rs {formatDecimal(detailItem.taxAmount)}</span>
                  </div>
                  <div className="doc-summary-row grand-total">
                    <span>Grand Total</span>
                    <span>Rs {formatDecimal(detailItem.totalAmount)}</span>
                  </div>
                </div>

                {detailItem.notes && (
                  <div style={{ padding: '10px 14px', borderRadius: 6, background: 'var(--inv-filter-card-bg)', border: '1px solid var(--inv-card-border)', fontSize: 12 }}>
                    <strong>Notes:</strong> {detailItem.notes}
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </DraggableResizableModal>

      {/* 2-Step Action Confirmation Modal */}
      <Modal
        open={confirmModal.visible}
        onCancel={() => {
          if (!confirmModal.loading) {
            setConfirmModal(prev => ({ ...prev, visible: false, errorMessage: null }));
          }
        }}
        footer={null}
        closable={!confirmModal.loading}
        centered
        width={
          ['ship', 'deliver', 'confirm', 'invoice'].includes(confirmModal.actionKey || '') &&
            !confirmModal.loading &&
            !confirmModal.completed
            ? 860
            : 580
        }
        maskClosable={!confirmModal.loading}
        className="delivery-action-confirm-modal"
      >
        <div style={{ padding: '8px 4px' }}>
          {confirmModal.completed ? (
            /* Completed Success State */
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 38,
                  margin: '0 auto 20px',
                  border: '2px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <CheckCircleOutlined />
              </div>
              <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 10px', color: 'var(--inv-text-primary, #0f172a)' }}>
                Action Completed Successfully
              </h3>
              <p style={{ fontSize: 14, color: 'var(--inv-text-secondary, #475569)', margin: 0 }}>
                {confirmModal.successMessage}
              </p>
            </div>
          ) : confirmModal.loading ? (
            /* Loading Spinner State */
            <div style={{ textAlign: 'center', padding: '40px 16px' }}>
              <Spin
                indicator={
                  <LoadingOutlined
                    style={{ fontSize: 48, color: confirmModal.confirmBtnColor || '#2563eb' }}
                    spin
                  />
                }
              />
              <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 24, marginBottom: 8, color: 'var(--inv-text-primary, #0f172a)' }}>
                Processing Request
              </h3>
              <p style={{ fontSize: 14, color: 'var(--inv-text-secondary, #475569)', margin: '0 0 4px' }}>
                {confirmModal.loadingStep || 'Executing action on server... Please wait.'}
              </p>
              <span style={{ fontSize: 12, color: 'var(--inv-text-muted, #94a3b8)' }}>
                Please do not close this window or navigate away.
              </span>
            </div>
          ) : (
            /* Confirmation Inquiry State */
            <div>
              {/* Header Hero */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 12,
                    background: confirmModal.iconBg,
                    color: confirmModal.iconColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 26,
                    flexShrink: 0,
                    border: `1px solid ${confirmModal.badgeColor}33`,
                  }}
                >
                  {confirmModal.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: confirmModal.badgeBg,
                        color: confirmModal.badgeColor,
                        letterSpacing: 0.5,
                      }}
                    >
                      {confirmModal.actionBadge}
                    </span>
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: token.colorText }}>
                    {confirmModal.title}
                  </h2>
                </div>
              </div>

              {/* Pre-Confirmation Verification Card (Line Items, Quantities, Rates, 18% / 0% Tax Check, & Totals) */}
              {confirmModal.record && ['ship', 'deliver', 'confirm', 'invoice'].includes(confirmModal.actionKey || '') ? (
                (() => {
                  const rec = confirmModal.record!;
                  const verificationSummary = summarizeLinesTaxVerification(rec.lines, 0);
                  const statusUpper = String(rec.status || '').toUpperCase();
                  const statusColor =
                    statusUpper === 'DELIVERED' || statusUpper === 'CONFIRMED'
                      ? 'green'
                      : statusUpper === 'SHIPPED'
                        ? 'blue'
                        : statusUpper === 'CANCELLED'
                          ? 'red'
                          : 'orange';
                  const carrierDisplay = [rec.carrier || 'Standard Transport', rec.trackingNumber]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <div style={{ marginBottom: 16 }}>
                      <PreConfirmVerificationCard
                        summary={verificationSummary}
                        currency="Rs"
                        showSocColumn={true}
                        applyingTax={applyingConfirmTax}
                        onApplyStandardTax={
                          statusUpper !== 'CANCELLED' ? handleApplyConfirmTax18 : undefined
                        }
                        headerItems={[
                          {
                            label: 'Delivery Note #',
                            value: (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span>{rec.deliveryNumber}</span>
                                <Tag color={statusColor} style={{ margin: 0, fontWeight: 700, fontSize: 11 }}>
                                  {rec.status}
                                </Tag>
                              </span>
                            ),
                          },
                          {
                            label: 'Gate Pass #',
                            value: rec.gatePassNumber || 'Not Assigned',
                          },
                          ...(rec.salesOrderNumber || rec.salesOrder?.orderNumber
                            ? [
                              {
                                label: 'Originating SOC #',
                                value: rec.salesOrderNumber || rec.salesOrder?.orderNumber || '-',
                              },
                            ]
                            : []),
                          ...(rec.divisionName || rec.salesOrder?.division?.name
                            ? [
                              {
                                label: 'Division',
                                value: rec.divisionName || rec.salesOrder?.division?.name || '-',
                              },
                            ]
                            : []),
                          {
                            label: 'Customer Name',
                            value: getCustomerDisplayName(rec) || rec.companyName || 'N/A',
                          },
                          {
                            label: 'Delivery Date',
                            value: rec.deliveryDate ? dayjs(rec.deliveryDate).format('DD-MMM-YYYY') : '-',
                          },
                          {
                            label: 'Carrier / Vehicle',
                            value: carrierDisplay,
                          },
                        ]}
                      />

                      <div
                        style={{
                          marginTop: 12,
                          padding: '9px 12px',
                          borderRadius: 8,
                          backgroundColor: token.colorFillAlter,
                          border: `1px solid ${token.colorBorderSecondary}`,
                          fontSize: 12.5,
                          color: token.colorTextSecondary,
                        }}
                      >
                        {confirmModal.description}
                      </div>
                    </div>
                  );
                })()
              ) : (
                <>
                  {/* Delivery Details Card */}
                  {confirmModal.record && (
                    <div
                      style={{
                        backgroundColor: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        marginBottom: 18,
                      }}
                    >
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', fontSize: 13 }}>
                        <div>
                          <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                            Delivery Note #
                          </span>
                          <strong style={{ color: token.colorText, fontSize: 14 }}>
                            {confirmModal.record.deliveryNumber}
                          </strong>
                        </div>
                        <div>
                          <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                            Current Status
                          </span>
                          <Tag color={
                            confirmModal.record.status === 'DELIVERED' ? 'green' :
                              confirmModal.record.status === 'SHIPPED' ? 'blue' :
                                confirmModal.record.status === 'CANCELLED' ? 'red' : 'orange'
                          }>
                            {confirmModal.record.status}
                          </Tag>
                        </div>
                        <div>
                          <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                            Customer
                          </span>
                          <span style={{ color: token.colorText, fontWeight: 600 }}>
                            {getCustomerDisplayName(confirmModal.record) || confirmModal.record.companyName || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
                            Carrier / Transport
                          </span>
                          <span style={{ color: token.colorTextSecondary }}>
                            {confirmModal.record.carrier || 'Standard Transport'} {confirmModal.record.trackingNumber ? `(${confirmModal.record.trackingNumber})` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Prompt & Impact Notice */}
                  <div
                    style={{
                      background: confirmModal.isDanger ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                      border: `1px solid ${confirmModal.isDanger ? 'rgba(239, 68, 68, 0.25)' : 'rgba(59, 130, 246, 0.25)'}`,
                      borderRadius: 10,
                      padding: '14px 16px',
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <WarningFilled
                        style={{
                          color: confirmModal.isDanger ? '#ef4444' : '#3b82f6',
                          fontSize: 18,
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: token.colorText, marginBottom: 4 }}>
                          {confirmModal.question}
                        </div>
                        <div style={{ fontSize: 13, color: token.colorTextSecondary, lineHeight: 1.5, marginBottom: 8 }}>
                          {confirmModal.description}
                        </div>

                        {/* Impact Details List */}
                        {confirmModal.impactDetails && confirmModal.impactDetails.length > 0 && (
                          <div style={{ backgroundColor: token.colorFillAlter, borderRadius: 6, padding: '8px 12px', marginTop: 8 }}>
                            {confirmModal.impactDetails.map((detail, idx) => (
                              <div key={idx} style={{ fontSize: 12, color: token.colorTextSecondary, display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
                                <span style={{ width: 4, height: 4, borderRadius: '50%', background: confirmModal.badgeColor, display: 'inline-block' }} />
                                <span>{detail}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ fontSize: 12, color: token.colorTextTertiary, marginTop: 8, fontStyle: 'italic' }}>
                          If this action was triggered accidentally, click Cancel to exit without making changes.
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Error banner if previous attempt failed */}
              {confirmModal.errorMessage && (
                <div
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginBottom: 16,
                    color: '#ef4444',
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <CloseCircleOutlined style={{ fontSize: 16 }} />
                  <span>{confirmModal.errorMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button
                    size="large"
                    onClick={() => setConfirmModal(prev => ({ ...prev, visible: false, errorMessage: null }))}
                    style={{ minWidth: 100, fontWeight: 600 }}
                  >
                    Cancel
                  </Button>
                  {confirmModal.record?.status?.toUpperCase() === 'DRAFT' &&
                    ['ship', 'deliver', 'confirm'].includes(confirmModal.actionKey || '') && (
                      <Button
                        size="large"
                        icon={<EditOutlined />}
                        onClick={() => {
                          const targetRecord = confirmModal.record;
                          setConfirmModal(prev => ({ ...prev, visible: false, errorMessage: null }));
                          if (targetRecord) {
                            void handleEdit(targetRecord);
                          }
                        }}
                        style={{ fontWeight: 600 }}
                      >
                        Back to Edit
                      </Button>
                    )}
                </div>
                <Button
                  size="large"
                  type="primary"
                  danger={confirmModal.isDanger}
                  style={{
                    backgroundColor: confirmModal.isDanger ? undefined : confirmModal.confirmBtnColor,
                    borderColor: confirmModal.isDanger ? undefined : confirmModal.confirmBtnColor,
                    minWidth: 180,
                    fontWeight: 700,
                  }}
                  icon={confirmModal.icon}
                  onClick={() => void executeConfirmedAction()}
                >
                  {confirmModal.confirmBtnText}
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="Credit Policy Override Authorization"
        open={Boolean(creditOverrideModal?.open)}
        width={680}
        onCancel={() => setCreditOverrideModal(null)}
        okText="Authorize Override & Proceed"
        okButtonProps={{ danger: true }}
        onOk={() => {
          if (!creditOverrideReason.trim() || creditOverrideReason.trim().length < 3) {
            message.error('Please enter a brief authorization reason (minimum 3 characters)');
            return;
          }
          const ctx = creditOverrideModal;
          setCreditOverrideModal(null);
          if (ctx?.mode === 'save' && ctx.payload) {
            void executeSave({
              ...ctx.payload,
              creditOverride: true,
              creditOverrideReason: creditOverrideReason.trim(),
            });
          } else if (ctx?.mode === 'confirm' && ctx.recordId) {
            void executeConfirmedAction({
              creditOverride: true,
              creditOverrideReason: creditOverrideReason.trim(),
            });
          }
        }}
      >
        {creditOverrideModal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Alert type="error" showIcon message={creditOverrideModal.message || 'Credit Policy Violation'} />
            {creditOverrideModal.policy && (
              <Descriptions size="small" bordered column={2} labelStyle={{ whiteSpace: 'nowrap' }}>
                <Descriptions.Item label="Customer">{creditOverrideModal.policy.customerName}</Descriptions.Item>
                <Descriptions.Item label="Payment Terms">
                  <span style={{ whiteSpace: 'nowrap' }}>{creditOverrideModal.policy.paymentTerms}</span>
                </Descriptions.Item>
                <Descriptions.Item label="Credit Limit">
                  <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    Rs {formatSmartCurrency(creditOverrideModal.policy.creditLimit || 0)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Current Receivable">
                  <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    Rs {formatSmartCurrency(creditOverrideModal.policy.currentBalance || 0)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Delivery Amount">
                  <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    Rs {formatSmartCurrency(creditOverrideModal.policy.proposedAmount || 0)}
                  </span>
                </Descriptions.Item>
                <Descriptions.Item label="Projected Balance">
                  <strong style={{ color: '#dc2626', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    Rs {formatSmartCurrency(creditOverrideModal.policy.projectedBalance || 0)}
                  </strong>
                </Descriptions.Item>
              </Descriptions>
            )}
            <Input.TextArea
              rows={3}
              placeholder="Enter management authorization reason to override credit block..."
              value={creditOverrideReason}
              onChange={(e) => setCreditOverrideReason(e.target.value)}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SalesDeliveryManagement;
