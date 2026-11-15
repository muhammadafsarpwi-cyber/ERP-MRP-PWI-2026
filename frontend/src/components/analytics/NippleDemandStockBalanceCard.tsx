import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Grid,
  Space,
  Table,
  Tag,
  Button,
  Tooltip,
  Popover,
  Progress,
  Segmented,
  InputNumber,
  DatePicker,
  Switch,
  Drawer,
  Modal,
  Form,
  Input,
  Select,
  Radio,
  message,
  theme,
} from 'antd';
import {
  BuildOutlined,
  ReloadOutlined,
  PrinterOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  EditOutlined,
  PlusCircleOutlined,
  TableOutlined,
  AppstoreOutlined,
  WarningOutlined,
  DownOutlined,
  SlidersOutlined,
  InboxOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ContainerOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { updateNipplePlanningConfig } from '../../services/nippleAlertsService';
import { formatDecimal } from '../../utils/numberFormat';
import {
  exportNippleMrpExcel,
  exportNippleMrpPdf,
  printNippleMrpReport,
} from '../../utils/nippleMrpExport';

export interface NippleDemandStockBalanceCardProps {
  /** Pre-computed rows (used by SalesAnalyticsDashboard). When omitted, fetches live from /sales/analytics/dashboard. */
  dataSource?: any[];
  /** Optional external loading flag when dataSource is provided. */
  loading?: boolean;
  /** Optional top margin override. */
  marginTop?: number;
  /**
   * 'sales' keeps the compact 6-column Sales Intelligence layout.
   * 'inventory' enables PDF/Excel/Print View actions, Linked Purchase Orders (POs),
   * Import Requirement / Unordered Balance tracking, and the Time-Phased Shipment Plan Matrix.
   */
  mode?: 'sales' | 'inventory';
}

const FALLBACK_STOCK_MAP: Record<string, { code: string; name: string; stockGrs: number; stockPcs: number }> = {
  '225x17': { code: 'FG-NP-001', name: '225X17 Front Wheel Nipple', stockGrs: 500, stockPcs: 72000 },
  cd250: { code: 'FG-NP-002', name: 'CD-250X17 Nipple', stockGrs: 7000, stockPcs: 1008000 },
  '125300': { code: 'FG-NP-003', name: '125-300X17 Nipple', stockGrs: 15020, stockPcs: 2162880 },
  rm250: { code: 'FG-NP-004', name: 'RM-250*17 Nipple', stockGrs: 9336, stockPcs: 1344352 },
  '125s9': { code: 'FG-NP-005', name: '125-S9 Nipple', stockGrs: 8961, stockPcs: 1290320 },
};

const IMPORT_STAGE_OPTIONS = [
  { value: 'ORDER_PLACED', label: 'Order Placed' },
  { value: 'UNDER_PRODUCTION', label: 'Under Production' },
  { value: 'READY_TO_SHIP', label: 'Ready to Ship' },
  { value: 'ON_VESSEL', label: 'On Vessel (Sailing)' },
  { value: 'AT_PORT', label: 'Arrived at Port' },
  { value: 'CUSTOMS_CLEARANCE', label: 'Customs Clearance' },
  { value: 'CLEARED', label: 'Cleared / In Transit to Factory' },
];

/**
 * Helper to convert PCS to GRS if a PO line was entered in PCS.
 */
function toGrs(qty: number, uomCode?: string): number {
  const n = Number(qty || 0);
  if (!n) return 0;
  const u = String(uomCode || 'GRS').toUpperCase().trim();
  if (u === 'PCS' || u === 'PC' || u === 'EA') {
    return Math.round((n / 144) * 100) / 100;
  }
  return Math.round(n * 100) / 100;
}

function toIsoDate(val: any, fallbackIso: string): string {
  if (!val) return fallbackIso;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function daysBetweenDates(startIso: string, endIso: string): number {
  const d1 = new Date(`${startIso.slice(0, 10)}T00:00:00Z`).getTime();
  const d2 = new Date(`${endIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (isNaN(d1) || isNaN(d2)) return 0;
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)));
}

/**
 * Shared Nipple Demand & Stock Balance calculation used by both
 * Sales Intelligence and Inventory Nipple Demand & Balance.
 */
export function computeNippleDemandRows(
  nippleAnalytics: any[],
  topItems: any[] = [],
  poByItemCode?: Record<string, any[]>,
): any[] {
  let rawList: any[] = [];
  if (nippleAnalytics && nippleAnalytics.length > 0) {
    rawList = nippleAnalytics;
  } else {
    const results: Record<string, any> = {};

    Object.entries(FALLBACK_STOCK_MAP).forEach(([key, info]) => {
      results[key] = {
        itemCode: info.code,
        itemName: info.name,
        uom: 'GRS',
        fgStock: info.stockGrs,
        baseQuantity: info.stockPcs,
        baseUom: 'PCS',
        totalDemand: 0,
        totalPackedInSpokes: 0,
        netPendingDemand: 0,
        linkedSpokeSets: [],
      };
    });

    (topItems || []).forEach((item: any) => {
      const name = item.itemName || '';
      if (!name.includes('_')) return;
      const [spokePart, ...rest] = name.split('_');
      const spec = rest.join('_').toLowerCase();

      let matchedKey: string | null = null;
      if (spec.includes('125s9') || spec.includes('125-s9')) matchedKey = '125s9';
      else if (spec.includes('rm250') || spec.includes('rm-250')) matchedKey = 'rm250';
      else if (spec.includes('225x17')) matchedKey = '225x17';
      else if (spec.includes('cd250') || spec.includes('cd-250')) matchedKey = 'cd250';
      else if (spec.includes('125-300') || spec.includes('300x17')) matchedKey = '125300';

      if (matchedKey && results[matchedKey]) {
        const ordQty = Math.max(0, Number(item.orderedQuantity) || 0);
        const dispatchedQty = Math.max(
          0,
          Number(item.dispatchedQuantity ?? item.deliveredQuantity) || 0,
        );
        const pendingOrderQty = Math.max(0, Math.round((ordQty - dispatchedQty) * 100) / 100);
        const packedQty = Math.max(
          0,
          Number(item.withNippleFgrAvailable ?? item.finishedGoodsAvailable) || 0,
        );
        const withoutNippleQty = Math.max(0, Number(item.withoutNippleFgrGrs) || 0);
        const balanceToPackQty = Math.max(0, Math.round((pendingOrderQty - packedQty) * 100) / 100);

        results[matchedKey].totalDemand += ordQty;
        results[matchedKey].totalDispatched = (results[matchedKey].totalDispatched || 0) + dispatchedQty;
        results[matchedKey].netPendingOrder = (results[matchedKey].netPendingOrder || 0) + pendingOrderQty;
        results[matchedKey].totalPackedInSpokes += packedQty;
        results[matchedKey].netPendingDemand += balanceToPackQty;
        results[matchedKey].linkedSpokeSets.push({
          spokeName: spokePart.trim(),
          orderedQuantity: ordQty,
          dispatchedQuantity: dispatchedQty,
          pendingOrderQuantity: pendingOrderQty,
          packedQuantity: packedQty,
          withoutNippleQuantity: withoutNippleQty,
          balanceToPackQuantity: balanceToPackQty,
          pendingQuantity: balanceToPackQty,
          uom: item.uom || 'GRS',
        });
      }
    });

    rawList = Object.values(results);
  }

  return rawList
    .map((r: any) => {
      const normalizedSpokeSets = Array.isArray(r.linkedSpokeSets)
        ? r.linkedSpokeSets.map((s: any) => {
            const ordQty = Math.max(0, Number(s.orderedQuantity) || 0);
            const matchItem = (topItems || []).find((ti: any) =>
              (ti.itemName || '').includes(s.spokeName),
            );
            const dispatchedQty = Math.max(
              0,
              Math.round(
                (Number(s.dispatchedQuantity ?? matchItem?.dispatchedQuantity ?? matchItem?.deliveredQuantity) || 0) *
                  100,
              ) / 100,
            );
            const pendingOrderQty =
              s.pendingOrderQuantity !== undefined
                ? Math.max(0, Math.round(Number(s.pendingOrderQuantity) * 100) / 100)
                : Math.max(0, Math.round((ordQty - dispatchedQty) * 100) / 100);

            let rawPacked = s.packedQuantity;
            if (rawPacked === undefined) {
              rawPacked = matchItem?.withNippleFgrAvailable ?? matchItem?.finishedGoodsAvailable ?? 0;
            }
            const packedQty = Math.max(0, Math.round((Number(rawPacked) || 0) * 100) / 100);
            const withoutNippleQty = Math.max(
              0,
              Math.round(
                (Number(s.withoutNippleQuantity ?? matchItem?.withoutNippleFgrGrs) || 0) * 100,
              ) / 100,
            );
            const balanceToPackQty =
              s.balanceToPackQuantity !== undefined
                ? Math.max(0, Math.round(Number(s.balanceToPackQuantity) * 100) / 100)
                : Math.max(0, Math.round((pendingOrderQty - packedQty) * 100) / 100);

            return {
              ...s,
              orderedQuantity: ordQty,
              dispatchedQuantity: dispatchedQty,
              pendingOrderQuantity: pendingOrderQty,
              packedQuantity: packedQty,
              withoutNippleQuantity: withoutNippleQty,
              balanceToPackQuantity: balanceToPackQty,
              pendingQuantity: balanceToPackQty,
            };
          })
        : [];

      const grossDemand =
        normalizedSpokeSets.length > 0
          ? Math.round(
              normalizedSpokeSets.reduce((sum: number, s: any) => sum + Number(s.orderedQuantity || 0), 0) *
                100,
            ) / 100
          : Math.max(0, Number(r.totalDemand ?? 0));

      const totalDispatched =
        normalizedSpokeSets.length > 0
          ? Math.max(
              0,
              Math.round(
                normalizedSpokeSets.reduce(
                  (sum: number, s: any) => sum + Number(s.dispatchedQuantity || 0),
                  0,
                ) * 100,
              ) / 100,
            )
          : Math.max(0, Math.round(Number(r.totalDispatched ?? 0) * 100) / 100);

      const netPendingOrder =
        normalizedSpokeSets.length > 0
          ? Math.max(
              0,
              Math.round(
                normalizedSpokeSets.reduce(
                  (sum: number, s: any) => sum + Number(s.pendingOrderQuantity || 0),
                  0,
                ) * 100,
              ) / 100,
            )
          : Math.max(0, Math.round((grossDemand - totalDispatched) * 100) / 100);

      const packed =
        normalizedSpokeSets.length > 0
          ? Math.max(
              0,
              Math.round(
                normalizedSpokeSets.reduce((sum: number, s: any) => sum + Number(s.packedQuantity || 0), 0) *
                  100,
              ) / 100,
            )
          : Math.max(
              0,
              Math.round(
                Number(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0) * 100,
              ) / 100,
            );

      const withoutNippleCartonsFgr =
        normalizedSpokeSets.length > 0
          ? Math.max(
              0,
              Math.round(
                normalizedSpokeSets.reduce(
                  (sum: number, s: any) => sum + Number(s.withoutNippleQuantity || 0),
                  0,
                ) * 100,
              ) / 100,
            )
          : Math.max(0, Math.round(Number(r.withoutNippleCartonsFgr ?? 0) * 100) / 100);

      const remainingToPack =
        normalizedSpokeSets.length > 0
          ? Math.max(
              0,
              Math.round(
                normalizedSpokeSets.reduce(
                  (sum: number, s: any) =>
                    sum + Number(s.balanceToPackQuantity ?? s.pendingQuantity ?? 0),
                  0,
                ) * 100,
              ) / 100,
            )
          : Math.max(
              0,
              Math.round(
                Number(
                  r.remainingToPack ?? r.netPendingDemand ?? Math.max(0, netPendingOrder - packed),
                ) * 100,
              ) / 100,
            );

      const netPending = remainingToPack;

      const fgStock = Math.max(
        0,
        Math.round(Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0) * 100) / 100,
      );

      // Total Combined Stock = [Packed with Nipple (FGR)] + [Current Unpacked Nipple Stock (WH-002)]
      const totalAvailableStock = Math.round((packed + fgStock) * 100) / 100;

      // Exact Packable Balance & Net Shortage (compare Unpacked Nipple Stock directly against Remaining to Pack without double-adding Packed FGR)
      const packableFromStockGrs = Math.min(fgStock, remainingToPack);
      const finalBalanceShortage = Math.round((remainingToPack - fgStock) * 100) / 100;
      const netDeficitRequired = Math.max(0, finalBalanceShortage);
      const stockSurplus = Math.max(0, Math.round((fgStock - remainingToPack) * 100) / 100);

      // Step 3 (Advanced 3-Month Sales Forecasting & Safety Stock Buffer)
      const rolling3MonthVolume = Number(r.rolling3MonthVolume ?? Math.max(grossDemand, fgStock));
      const monthlyAvgConsumption = Number(r.monthlyAvgConsumption ?? Math.round((rolling3MonthVolume / 3) * 100) / 100);
      const trendMinMonthly = Number(r.trendMinMonthly ?? Math.round(monthlyAvgConsumption * 0.85));
      const trendMaxMonthly = Number(r.trendMaxMonthly ?? Math.round(monthlyAvgConsumption * 1.15));
      const threeMonthForecast = Math.round(Math.max(rolling3MonthVolume * 1.1, remainingToPack + monthlyAvgConsumption));
      const safetyStockBuffer = Math.round(
        Math.max(monthlyAvgConsumption * 0.75, threeMonthForecast * 0.25, rolling3MonthVolume > 0 ? 500 : 0),
      );
      const recommendedOrderQty = Math.round(netDeficitRequired + safetyStockBuffer);

      // Step 4 (Linked Purchase Orders & Import Requirement Balance — only active/open POs with pendingQuantity > 0)
      const codeKey = String(r.itemCode || '').trim().toUpperCase();
      const externalPos = poByItemCode && poByItemCode[codeKey] ? poByItemCode[codeKey] : null;
      const rawLinkedPos: any[] =
        externalPos !== null
          ? externalPos
          : Array.isArray(r.linkedPurchaseOrders)
          ? r.linkedPurchaseOrders
          : [];

      const CLOSED_PO_STATUSES = ['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID'];
      const linkedPurchaseOrders: any[] = rawLinkedPos.filter((p: any) => {
        const st = String(p.status || 'DRAFT').toUpperCase();
        if (CLOSED_PO_STATUSES.includes(st)) return false;
        const ord = Number(p.orderedQuantity || 0);
        const rcv = Number(p.receivedQuantity || 0);
        const openQty = p.pendingQuantity !== undefined ? Number(p.pendingQuantity) : Math.max(0, ord - rcv);
        return openQty > 0;
      });

      const totalPoOrdered = Math.round(
        linkedPurchaseOrders.reduce((s: number, p: any) => s + Number(p.orderedQuantity || 0), 0) * 100,
      ) / 100;
      const totalPoReceived = Math.round(
        linkedPurchaseOrders.reduce((s: number, p: any) => s + Number(p.receivedQuantity || 0), 0) * 100,
      ) / 100;
      const openPoPendingQty = Math.round(
        linkedPurchaseOrders.reduce((s: number, p: any) => s + Number(p.pendingQuantity || 0), 0) * 100,
      ) / 100;

      // Net remaining import requirement after deducting open/in-transit POs
      const remainingImportRequirement = Math.max(0, Math.round((netDeficitRequired - openPoPendingQty) * 100) / 100);
      const remainingTargetImportReq = Math.max(0, Math.round((recommendedOrderQty - openPoPendingQty) * 100) / 100);
      const poSurplusAfterDeficit = Math.max(0, Math.round((openPoPendingQty - netDeficitRequired) * 100) / 100);

      let importStatus: 'STOCK_SUFFICIENT' | 'PO_COVERED' | 'PARTIAL_PO_PLACED' | 'IMPORT_REQUIRED_NO_PO' =
        'STOCK_SUFFICIENT';
      if (netDeficitRequired <= 0) {
        importStatus = 'STOCK_SUFFICIENT';
      } else if (openPoPendingQty >= netDeficitRequired) {
        importStatus = 'PO_COVERED';
      } else if (openPoPendingQty > 0) {
        importStatus = 'PARTIAL_PO_PLACED';
      } else {
        importStatus = 'IMPORT_REQUIRED_NO_PO';
      }

      return {
        ...r,
        linkedSpokeSets: normalizedSpokeSets,
        totalDemand: grossDemand,
        totalOrderDemand: grossDemand,
        totalDispatched,
        netPendingOrder,
        totalPackedInSpokes: packed,
        packedWithNipplesFgr: packed,
        packedInCartonsFgr: packed,
        withoutNippleCartonsFgr,
        remainingToPack,
        netPendingDemand: remainingToPack,
        fgStock,
        currentFgStock: fgStock,
        currentUnpackedNippleStock: fgStock,
        packableFromStockGrs,
        totalAvailableStock,
        balance: finalBalanceShortage,
        finalBalanceShortage,
        netDeficitRequired,
        stockSurplus,
        rolling3MonthVolume,
        monthlyAvgConsumption,
        trendMinMonthly,
        trendMaxMonthly,
        threeMonthForecast,
        safetyStockBuffer,
        recommendedOrderQty,
        linkedPurchaseOrders,
        totalPoOrdered,
        totalPoReceived,
        openPoPendingQty,
        remainingImportRequirement,
        remainingTargetImportReq,
        poSurplusAfterDeficit,
        importStatus,
        status: finalBalanceShortage > 0 ? 'SHORTAGE' : finalBalanceShortage === 0 && remainingToPack > 0 ? 'EXACT' : 'SUFFICIENT',
      };
    })
    .filter((r: any) => r.totalDemand > 0 || r.fgStock > 0)
    .sort((a: any, b: any) => String(a.itemCode || '').localeCompare(String(b.itemCode || '')));
}

export const NippleDemandStockBalanceCard: React.FC<NippleDemandStockBalanceCardProps> = ({
  dataSource,
  loading: externalLoading = false,
  marginTop = 16,
  mode,
}) => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isControlled = dataSource !== undefined;
  const resolvedMode: 'sales' | 'inventory' = mode || (isControlled ? 'sales' : 'inventory');
  const isInventoryMode = resolvedMode === 'inventory';

  // View Mode: 'summary' (Demand & Stock Summary) vs 'matrix' (Time-Phased Shipment Plan Excel Matrix)
  const [viewMode, setViewMode] = useState<'summary' | 'matrix'>('summary');
  const [safetyMonths, setSafetyMonths] = useState<number>(4);
  const [targetArrivalMonth, setTargetArrivalMonth] = useState<dayjs.Dayjs>(() => dayjs().add(4, 'month'));
  const [includeFgrStock, setIncludeFgrStock] = useState<boolean>(false);

  const [internalLoading, setInternalLoading] = useState(false);
  const [nippleAnalytics, setNippleAnalytics] = useState<any[]>([]);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [poByItemCode, setPoByItemCode] = useState<Record<string, any[]>>({});
  const [serverShipmentPlan, setServerShipmentPlan] = useState<any | null>(null);

  // Manage Import Shipments Drawer state
  const [shipmentDrawerOpen, setShipmentDrawerOpen] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any | null>(null);
  const [savingShipmentUpdate, setSavingShipmentUpdate] = useState(false);
  const [shipmentForm] = Form.useForm();

  // 1-Click Generate Import PR / PO Modal state
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [creatingReorder, setCreatingReorder] = useState(false);
  const [reorderDocType, setReorderDocType] = useState<'PR' | 'PO'>('PR');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [reorderLines, setReorderLines] = useState<any[]>([]);
  const [reorderForm] = Form.useForm();

  // Report Remarks (English / Urdu) for PDF, Excel & Print exports
  const [reportRemarks, setReportRemarks] = useState<string>(() => {
    try {
      return localStorage.getItem('pwi_nipple_report_remarks') || '';
    } catch {
      return '';
    }
  });
  const [remarksPopoverOpen, setRemarksPopoverOpen] = useState(false);

  // Hybrid 4-Month Advance Lead-Time Planning Modal state
  const [planningDrawerOpen, setPlanningDrawerOpen] = useState(false);
  const [savingPlanningId, setSavingPlanningId] = useState<string | null>(null);
  const [savingAllPlanning, setSavingAllPlanning] = useState(false);
  const [planningEdits, setPlanningEdits] = useState<
    Record<
      string,
      {
        manualMonthlyUsageGrs: number | null;
        importLeadTimeMonths: number;
        safetyBufferMonths: number;
      }
    >
  >({});

  const horizonIso = useMemo(
    () => targetArrivalMonth.endOf('month').format('YYYY-MM-DD'),
    [targetArrivalMonth],
  );

  const fetchLive = useCallback(async () => {
    setInternalLoading(true);
    try {
      const [salesRes, poRes, planRes] = await Promise.all([
        apiService.get<any>('/sales/analytics/dashboard', { period: 'all' }).catch(() => null),
        apiService.get<any>('/procurement/orders', { page: 1, limit: 100 }).catch(() => null),
        apiService
          .get<any>('/sales/analytics/nipple-shipment-plan', {
            safetyMonths,
            horizonDate: horizonIso,
            includeFgrStock: includeFgrStock ? 'true' : 'false',
          })
          .catch(() => null),
      ]);

      const d = salesRes?.data;
      if (d) {
        if (d.itemSection?.topSellingFinishedGoods) setTopItems(d.itemSection.topSellingFinishedGoods);
        if (d.nippleAnalytics || d.itemSection?.nippleAnalytics) {
          setNippleAnalytics(d.nippleAnalytics || d.itemSection?.nippleAnalytics || []);
        }
      }

      if (planRes?.data) {
        setServerShipmentPlan(planRes.data);
      }

      // Extract Nipple PO lines from /procurement/orders if available
      const poList: any[] = Array.isArray(poRes?.data)
        ? poRes.data
        : Array.isArray(poRes?.data?.data)
        ? poRes.data.data
        : [];

      if (poList.length > 0) {
        const map: Record<string, any[]> = {};
        const CLOSED_STATUSES = ['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID'];
        for (const po of poList) {
          const statusUpper = String(po.status || 'DRAFT').toUpperCase();
          if (CLOSED_STATUSES.includes(statusUpper)) continue;
          const lines: any[] = Array.isArray(po.lines) ? po.lines : [];
          for (const ln of lines) {
            const code = String(ln.item?.itemCode || ln.itemCode || '').trim().toUpperCase();
            const name = String(ln.item?.name || ln.itemName || '');
            if (!code.startsWith('FG-NP-') && !name.toLowerCase().includes('nipple')) continue;
            const uomCode = ln.uom?.code || ln.uomCode || 'GRS';
            const ordQty = toGrs(Number(ln.quantity || 0), uomCode);
            const recQty = toGrs(Number(ln.receivedQuantity || 0), uomCode);
            const pendingQty = Math.max(0, Math.round((ordQty - recQty) * 100) / 100);
            if (pendingQty <= 0) continue;
            if (!map[code]) map[code] = [];
            map[code].push({
              poId: po.id,
              poCode: po.poCode,
              fileNumber: po.lcTtNumber || po.poCode,
              lcTtNumber: po.lcTtNumber || null,
              orderDate: po.orderDate,
              expectedDeliveryDate: po.expectedDeliveryDate,
              etaDate: po.etaDate || po.expectedDeliveryDate,
              etdDate: po.etdDate || null,
              status: po.status || 'DRAFT',
              purchaseOrigin: po.purchaseOrigin || 'IMPORT',
              importStage: po.importStage || null,
              supplierName: po.supplier?.name || po.supplierName || 'Overseas Supplier',
              orderedQuantity: ordQty,
              receivedQuantity: recQty,
              pendingQuantity: pendingQty,
              uom: 'GRS',
            });
          }
        }
        setPoByItemCode(map);
      }
    } catch {
      // keep existing state on transient error
    } finally {
      setInternalLoading(false);
    }
  }, [safetyMonths, horizonIso, includeFgrStock]);

  useEffect(() => {
    if (!isControlled) {
      fetchLive();
    }
  }, [isControlled, fetchLive]);

  const computedInternal = useMemo(
    () => (isControlled ? [] : computeNippleDemandRows(nippleAnalytics, topItems, poByItemCode)),
    [isControlled, nippleAnalytics, topItems, poByItemCode],
  );

  const rows = useMemo(() => {
    const base = isControlled ? dataSource || [] : computedInternal;
    return [...base]
      .map((r: any) => {
        const editKey = String(r.itemId || r.itemCode || '');
        const edit = planningEdits[editKey];
        const autoMonthly = Number(r.monthlyAvgConsumption || Number(r.rolling3MonthVolume || 0) / 3 || 0);
        const manualMonthlyUsageGrs = edit
          ? edit.manualMonthlyUsageGrs
          : r.manualMonthlyUsageGrs !== undefined && r.manualMonthlyUsageGrs !== null
          ? Number(r.manualMonthlyUsageGrs)
          : null;
        const importLeadTimeMonths = edit
          ? edit.importLeadTimeMonths
          : Number(r.importLeadTimeMonths ?? 4);
        const safetyBufferMonths = edit
          ? edit.safetyBufferMonths
          : Number(r.safetyBufferMonths ?? 1);

        const effectiveMonthlyUsage =
          manualMonthlyUsageGrs !== null && manualMonthlyUsageGrs > 0
            ? Math.round(manualMonthlyUsageGrs * 100) / 100
            : Math.round(autoMonthly * 100) / 100;
        const usageSource: 'MANUAL' | 'AUTO' =
          manualMonthlyUsageGrs !== null && manualMonthlyUsageGrs > 0 ? 'MANUAL' : 'AUTO';

        const unpackedStock = Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0);
        const openPo = Number(r.openPoPendingQty || 0);
        const remToPack = Number(r.remainingToPack ?? r.netPendingDemand ?? 0);
        const totalPipelineSupply = Math.round((unpackedStock + openPo) * 100) / 100;
        const netAvailableAfterPendingOrders = Math.round((totalPipelineSupply - remToPack) * 100) / 100;
        const coverageMonths =
          effectiveMonthlyUsage > 0
            ? Number((netAvailableAfterPendingOrders / effectiveMonthlyUsage).toFixed(1))
            : 999;
        const projectedStockoutDate =
          effectiveMonthlyUsage > 0 && coverageMonths < 999
            ? dayjs().add(Math.max(0, Math.round(coverageMonths * 30)), 'day').format('YYYY-MM-DD')
            : null;
        const targetCoverageMonths = Math.round((importLeadTimeMonths + safetyBufferMonths) * 100) / 100;
        const targetStockNeeded = Math.round(effectiveMonthlyUsage * targetCoverageMonths);
        const orderTodayQty = Math.max(0, Math.round(targetStockNeeded - netAvailableAfterPendingOrders));
        const reorderAlertStatus: 'ORDER_TODAY' | 'COVERED' =
          coverageMonths < importLeadTimeMonths || orderTodayQty > 0 ? 'ORDER_TODAY' : 'COVERED';

        return {
          ...r,
          manualMonthlyUsageGrs,
          importLeadTimeMonths,
          safetyBufferMonths,
          effectiveMonthlyUsage,
          usageSource,
          totalPipelineSupply,
          netAvailableAfterPendingOrders,
          coverageMonths,
          projectedStockoutDate,
          targetCoverageMonths,
          targetStockNeeded,
          orderTodayQty,
          reorderAlertStatus,
        };
      })
      .sort((a: any, b: any) => String(a.itemCode || '').localeCompare(String(b.itemCode || '')));
  }, [isControlled, dataSource, computedInternal, planningEdits]);

  const isLoading = isControlled ? externalLoading : internalLoading;

  // Compute Time-Phased Shipment Plan dynamically (reactive to safetyMonths, targetArrivalMonth, includeFgrStock, and live POs)
  const timePhasedPlan = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const shipmentMap = new Map<
      string,
      {
        poId: string;
        poNumber: string;
        fileNumber: string;
        lcTtNumber: string | null;
        vendorName: string;
        etaDate: string;
        importStage: string;
        status: string;
        purchaseOrigin: string;
        totalShipmentQtyGrs: number;
        itemQuantities: Record<string, number>;
      }
    >();

    // Merge open shipments from rows (which already merge /procurement/orders and /sales/analytics/dashboard)
    for (const r of rows) {
      const code = String(r.itemCode || '').trim().toUpperCase();
      const pos: any[] = Array.isArray(r.linkedPurchaseOrders) ? r.linkedPurchaseOrders : [];
      for (const po of pos) {
        const pendingGrs = Number(po.pendingQuantity || 0);
        if (pendingGrs <= 0) continue;
        const poKey = String(po.poId || po.poCode);
        const etaIso = toIsoDate(po.etaDate || po.expectedDeliveryDate || po.orderDate, todayIso);
        let entry = shipmentMap.get(poKey);
        if (!entry) {
          entry = {
            poId: po.poId,
            poNumber: po.poCode,
            fileNumber: po.lcTtNumber || po.fileNumber || po.poCode,
            lcTtNumber: po.lcTtNumber || null,
            vendorName: po.supplierName || 'Overseas Supplier',
            etaDate: etaIso,
            importStage: po.importStage || 'READY_TO_SHIP',
            status: po.status || 'DRAFT',
            purchaseOrigin: po.purchaseOrigin || 'IMPORT',
            totalShipmentQtyGrs: 0,
            itemQuantities: {},
          };
          shipmentMap.set(poKey, entry);
        }
        entry.itemQuantities[code] = Math.round(((entry.itemQuantities[code] || 0) + pendingGrs) * 100) / 100;
        entry.totalShipmentQtyGrs = Math.round((entry.totalShipmentQtyGrs + pendingGrs) * 100) / 100;
      }
    }

    // Fallback to serverShipmentPlan milestones if shipmentMap is empty
    const shipmentMilestones =
      shipmentMap.size > 0
        ? Array.from(shipmentMap.values()).sort((a, b) => {
            const cmp = a.etaDate.localeCompare(b.etaDate);
            return cmp !== 0 ? cmp : a.poNumber.localeCompare(b.poNumber);
          })
        : Array.isArray(serverShipmentPlan?.shipmentMilestones)
        ? serverShipmentPlan.shipmentMilestones
        : [];

    const matrixRows = rows.map((r: any, idx: number) => {
      const code = String(r.itemCode || '').trim().toUpperCase();
      const last3MonthSales = Math.round(Number(r.rolling3MonthVolume ?? r.totalDemand ?? 0) * 100) / 100;
      const monthlyAverage = Math.round((last3MonthSales / 3) * 100) / 100;
      const dailyConsumptionRate = Math.round((monthlyAverage / 30) * 10000) / 10000;
      const forecastSafetyStock = Math.round(monthlyAverage * safetyMonths);

      const unpackedFgStock = Math.round(Number(r.currentFgStock ?? r.fgStock ?? 0) * 100) / 100;
      const packedInCartonsFgr = Math.round(Number(r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0) * 100) / 100;
      const totalAvailableStock = Math.round((unpackedFgStock + packedInCartonsFgr) * 100) / 100;
      const stockInHand = includeFgrStock ? totalAvailableStock : unpackedFgStock;

      let runningStock = stockInHand;
      let prevDate = todayIso;
      let hasStockoutAlert = false;

      const milestoneProjections: Record<string, any> = {};
      const milestoneList = shipmentMilestones.map((ms: any, msIdx: number) => {
        const shipmentQtyGrs = Number(ms.itemQuantities?.[code] || 0);
        const daysElapsed =
          msIdx === 0
            ? daysBetweenDates(todayIso, ms.etaDate)
            : daysBetweenDates(prevDate, ms.etaDate);
        const materialConsumedTillEta = Math.round(daysElapsed * dailyConsumptionRate);
        const stockBeforeShipment = Math.round(runningStock - materialConsumedTillEta);
        const isStockoutBeforeArrival = stockBeforeShipment < 0;
        if (isStockoutBeforeArrival) hasStockoutAlert = true;

        const stockAfterShipment = Math.round(stockBeforeShipment + shipmentQtyGrs);

        const nextEta =
          msIdx + 1 < shipmentMilestones.length
            ? shipmentMilestones[msIdx + 1].etaDate
            : horizonIso;
        const daysTillNextEta = daysBetweenDates(ms.etaDate, nextEta);
        const materialConsumedTillNextEta = Math.round(daysTillNextEta * dailyConsumptionRate);

        runningStock = stockAfterShipment;
        prevDate = ms.etaDate;

        const proj = {
          poId: ms.poId,
          poNumber: ms.poNumber,
          fileNumber: ms.fileNumber,
          vendorName: ms.vendorName,
          etaDate: ms.etaDate,
          daysElapsed,
          materialConsumedTillEta,
          stockBeforeShipment,
          isStockoutBeforeArrival,
          shipmentQtyGrs,
          daysTillNextEta,
          materialConsumedTillNextEta,
          stockAfterShipment,
        };
        milestoneProjections[ms.poId || ms.poNumber] = proj;
        return proj;
      });

      const endingProjectedStock = Math.round(runningStock);
      const safeInMonths =
        monthlyAverage > 0 ? Number((endingProjectedStock / monthlyAverage).toFixed(2)) : 999;
      const recommendedOrderQty = Math.max(0, Math.round(forecastSafetyStock - endingProjectedStock));

      return {
        ...r,
        sNo: idx + 1,
        last3MonthSales,
        monthlyAverage,
        dailyConsumptionRate,
        forecastSafetyStock,
        unpackedFgStock,
        packedInCartonsFgr,
        stockInHand,
        milestoneProjections,
        milestoneList,
        endingProjectedStock,
        safeInMonths,
        matrixRecommendedOrderQty: recommendedOrderQty,
        hasStockoutAlert,
      };
    });

    return {
      asOfDate: todayIso,
      horizonDate: horizonIso,
      safetyMonths,
      shipmentMilestones,
      matrixRows,
    };
  }, [rows, safetyMonths, horizonIso, includeFgrStock, serverShipmentPlan]);

  // Summary totals for Inventory header strip & print/export
  const totals = useMemo(() => {
    return timePhasedPlan.matrixRows.reduce(
      (acc: any, r: any) => {
        acc.totalDemand += Number(r.totalDemand || 0);
        acc.totalDispatched += Number(r.totalDispatched || 0);
        acc.netPendingOrder += Number(r.netPendingOrder || 0);
        acc.remainingToPack += Number(r.remainingToPack ?? r.netPendingDemand ?? 0);
        acc.netPendingDemand += Number(r.remainingToPack ?? r.netPendingDemand ?? 0);
        acc.packedFgr += Number(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0);
        acc.withoutNippleCartonsFgr += Number(r.withoutNippleCartonsFgr || 0);
        acc.currentFg += Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0);
        acc.packableFromStockGrs += Number(r.packableFromStockGrs || 0);
        acc.totalAvailableStock += Number(r.totalAvailableStock || 0);
        acc.netDeficitRequired += Number(r.netDeficitRequired || 0);
        acc.stockSurplus += Number(r.stockSurplus || 0);
        acc.recommendedOrderQty += Number(r.recommendedOrderQty || 0);
        acc.openPoPendingQty += Number(r.openPoPendingQty || 0);
        acc.totalPoOrdered += Number(r.totalPoOrdered || 0);
        acc.totalPoReceived += Number(r.totalPoReceived || 0);
        acc.remainingImportRequirement += Number(r.remainingImportRequirement || 0);
        acc.remainingTargetImportReq += Number(r.remainingTargetImportReq || 0);
        acc.last3MonthSales += Number(r.last3MonthSales || 0);
        acc.monthlyAverage += Number(r.monthlyAverage || 0);
        acc.forecastSafetyStock += Number(r.forecastSafetyStock || 0);
        acc.stockInHand += Number(r.stockInHand || 0);
        acc.endingProjectedStock += Number(r.endingProjectedStock || 0);
        acc.matrixRecommendedOrderQty += Number(r.matrixRecommendedOrderQty || 0);
        acc.orderTodayQty += Number(r.orderTodayQty || 0);
        acc.effectiveMonthlyUsage += Number(r.effectiveMonthlyUsage || 0);
        return acc;
      },
      {
        totalDemand: 0,
        totalDispatched: 0,
        netPendingOrder: 0,
        remainingToPack: 0,
        netPendingDemand: 0,
        packedFgr: 0,
        withoutNippleCartonsFgr: 0,
        currentFg: 0,
        packableFromStockGrs: 0,
        totalAvailableStock: 0,
        netDeficitRequired: 0,
        stockSurplus: 0,
        recommendedOrderQty: 0,
        openPoPendingQty: 0,
        totalPoOrdered: 0,
        totalPoReceived: 0,
        remainingImportRequirement: 0,
        remainingTargetImportReq: 0,
        last3MonthSales: 0,
        monthlyAverage: 0,
        forecastSafetyStock: 0,
        stockInHand: 0,
        endingProjectedStock: 0,
        matrixRecommendedOrderQty: 0,
        orderTodayQty: 0,
        effectiveMonthlyUsage: 0,
      },
    );
  }, [timePhasedPlan]);

  // Open Manage Import Shipments Drawer
  const openEditShipmentDrawer = useCallback(
    (milestone?: any) => {
      const target = milestone || timePhasedPlan.shipmentMilestones[0] || null;
      setEditingMilestone(target);
      if (target) {
        shipmentForm.setFieldsValue({
          poId: target.poId,
          fileNumber: target.lcTtNumber || target.fileNumber || target.poNumber,
          etaDate: target.etaDate ? dayjs(target.etaDate) : dayjs(),
          stage: target.importStage || 'READY_TO_SHIP',
          remarks: `Updated ETA / File # from Nipple Time-Phased MRP Matrix`,
        });
      }
      setShipmentDrawerOpen(true);
    },
    [timePhasedPlan.shipmentMilestones, shipmentForm],
  );

  const handleSaveShipmentMilestone = async () => {
    try {
      const values = await shipmentForm.validateFields();
      if (!values.poId) {
        message.warning('Please select a Purchase Order shipment to update.');
        return;
      }
      setSavingShipmentUpdate(true);
      const newEta = values.etaDate ? dayjs(values.etaDate).format('YYYY-MM-DD') : undefined;
      await apiService.post(`/procurement/orders/${values.poId}/import-updates`, {
        milestoneType: 'ETA',
        stage: values.stage || 'READY_TO_SHIP',
        newDate: newEta,
        lcTtNumber: values.fileNumber,
        fileNumber: values.fileNumber,
        remarks: values.remarks || 'Updated from Nipple Time-Phased Shipment Plan',
      });
      message.success('Import Shipment ETA & File # updated successfully');
      setShipmentDrawerOpen(false);
      fetchLive();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to update shipment milestone');
    } finally {
      setSavingShipmentUpdate(false);
    }
  };

  // Open 1-Click Generate Import PR / PO Modal (supports all items or a single row quick-order)
  const handleOpenReorderModal = useCallback(
    async (singleRow?: any) => {
      const hasSingleItem = singleRow && typeof singleRow === 'object' && singleRow.itemCode;
      const sourceList = hasSingleItem
        ? rows.filter((r: any) => r.itemCode === singleRow.itemCode)
        : rows.filter(
            (r: any) =>
              Number(
                r.orderTodayQty ||
                  r.remainingImportRequirement ||
                  r.recommendedOrderQty ||
                  0,
              ) > 0,
          );

      const candidateRows = (sourceList.length > 0 ? sourceList : hasSingleItem ? [singleRow] : []).map(
        (r: any) => {
          const recQty = Math.max(
            0,
            Math.round(
              Number(
                r.orderTodayQty > 0
                  ? r.orderTodayQty
                  : r.remainingImportRequirement ||
                      r.recommendedOrderQty ||
                      1000,
              ),
            ),
          );
          return {
            itemId: r.itemId,
            itemCode: r.itemCode,
            itemName: r.itemName,
            uom: 'GRS',
            recommendedQty: recQty,
            orderQty: recQty,
            unitPrice: r.itemCode === 'FG-NP-005' ? 550 : r.itemCode === 'FG-NP-004' ? 400 : 350,
          };
        },
      );

      if (candidateRows.length === 0) {
        message.info('All Nipple items meet the target safety stock coverage.');
        return;
      }

      setReorderLines(candidateRows);
      setReorderModalOpen(true);

      try {
        const [supRes, whRes] = await Promise.all([
          apiService.get<any>('/procurement/suppliers', { limit: 100 }).catch(() => null),
          apiService.get<any>('/organization/warehouses').catch(() => null),
        ]);
        const supList = Array.isArray(supRes?.data)
          ? supRes.data
          : Array.isArray(supRes?.data?.data)
          ? supRes.data.data
          : [];
        const whList = Array.isArray(whRes?.data)
          ? whRes.data
          : Array.isArray(whRes?.data?.data)
          ? whRes.data.data
          : [];
        setSuppliers(supList);
        setWarehouses(whList);

        const defaultWh =
          whList.find((w: any) => String(w.name || '').toLowerCase().includes('nipple')) || whList[0];
        const defaultSup =
          supList.find(
            (s: any) =>
              String(s.name || '').toLowerCase().includes('tianjin') ||
              String(s.name || '').toLowerCase().includes('chongqing'),
          ) || supList[0];

        reorderForm.setFieldsValue({
          docType: 'PR',
          title: hasSingleItem
            ? `Import Replenishment — ${singleRow.itemName} (${singleRow.itemCode})`
            : `Nipple Import Replenishment (${safetyMonths}M Safety Target)`,
          warehouseId: defaultWh?.id,
          supplierId: defaultSup?.id,
          requiredDate: targetArrivalMonth.endOf('month'),
          fileNumber: `FILE-${dayjs().format('MM/YY')}`,
        });
      } catch {
        // ignore lookup error
      }
    },
    [timePhasedPlan.matrixRows, safetyMonths, targetArrivalMonth, reorderForm],
  );

  const handleConfirmGenerateReorder = async () => {
    try {
      const values = await reorderForm.validateFields();
      const activeLines = reorderLines.filter((l) => Number(l.orderQty) > 0 && l.itemId);
      if (activeLines.length === 0) {
        message.warning('At least one Nipple item with quantity > 0 is required.');
        return;
      }
      setCreatingReorder(true);

      // Resolve companyId from existing auth user or warehouses
      let companyId = warehouses[0]?.companyId || suppliers[0]?.companyId;
      if (!companyId) {
        const compRes = await apiService.get<any>('/organization/companies').catch(() => null);
        const compList = Array.isArray(compRes?.data) ? compRes.data : compRes?.data?.data || [];
        companyId = compList[0]?.id;
      }

      const reqDateIso = values.requiredDate
        ? dayjs(values.requiredDate).format('YYYY-MM-DD')
        : horizonIso;

      if (values.docType === 'PO') {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const poCode = `PO-${new Date().getFullYear()}-${randomSuffix}`;
        await apiService.post('/procurement/orders', {
          companyId,
          poCode,
          supplierId: values.supplierId,
          warehouseId: values.warehouseId || null,
          orderDate: new Date().toISOString().slice(0, 10),
          expectedDeliveryDate: reqDateIso,
          etaDate: reqDateIso,
          purchaseOrigin: 'IMPORT',
          importStage: 'ORDER_PLACED',
          lcTtNumber: values.fileNumber || null,
          notes: `${values.title || 'Nipple Import Order'} — Auto-generated from Time-Phased Nipple MRP Matrix`,
          lines: activeLines.map((l, idx) => ({
            lineNumber: idx + 1,
            itemId: l.itemId,
            quantity: Number(l.orderQty),
            unitPrice: Number(l.unitPrice || 350),
            requiredDate: reqDateIso,
          })),
        });
        message.success(`Draft Import Purchase Order ${poCode} created successfully!`);
      } else {
        const randomSuffix = Math.floor(1000 + Math.random() * 9000);
        const prCode = `PR-${new Date().getFullYear()}-${randomSuffix}`;
        await apiService.post('/procurement/requisitions', {
          companyId,
          requisitionCode: prCode,
          title: values.title || `Nipple Import Replenishment (${safetyMonths}M Safety Target)`,
          description: `Auto-generated from Nipple Time-Phased Shipment Plan (${safetyMonths}M Safety Target)`,
          purchaseOrigin: 'IMPORT',
          warehouseId: values.warehouseId || null,
          requiredDate: reqDateIso,
          priority: 'HIGH',
          lines: activeLines.map((l, idx) => ({
            lineNumber: idx + 1,
            itemId: l.itemId,
            quantity: Number(l.orderQty),
            estimatedUnitPrice: Number(l.unitPrice || 350),
            requiredDate: reqDateIso,
            notes: `Recommended by ${safetyMonths}M Time-Phased Shipment Matrix`,
          })),
        });
        message.success(`Import Purchase Requisition ${prCode} created successfully!`);
      }

      setReorderModalOpen(false);
      fetchLive();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to generate Import PR / PO');
    } finally {
      setCreatingReorder(false);
    }
  };

  const getExportOptions = useCallback(
    () => ({
      rows,
      totals,
      timePhasedPlan: {
        ...timePhasedPlan,
        baseDateIso: timePhasedPlan.asOfDate,
        horizonIso: timePhasedPlan.horizonDate,
      },
      viewMode,
      safetyMonths,
      horizonIso,
      includeFgrStock,
      isInventoryMode,
      remarks: reportRemarks,
    }),
    [rows, totals, timePhasedPlan, viewMode, safetyMonths, horizonIso, includeFgrStock, isInventoryMode, reportRemarks],
  );

  // Formatted Multi-Sheet .xlsx Excel Export Handler
  const handleExportExcel = useCallback(() => {
    exportNippleMrpExcel(getExportOptions());
  }, [getExportOptions]);

  // Executive A4 Landscape PDF Export Handler
  const handleExportPdf = useCallback(() => {
    exportNippleMrpPdf(getExportOptions());
  }, [getExportOptions]);

  // Clean A4 Landscape Print View Handler
  const handlePrintView = useCallback(() => {
    printNippleMrpReport(getExportOptions());
  }, [getExportOptions]);

  // Compact Executive Summary Table Columns (all 5 Nipple items fit on a single screen)
  const baseColumns: any[] = [
    {
      title: 'Nipple Product',
      key: 'itemName',
      width: 240,
      fixed: 'left',
      render: (_: any, r: any) => {
        const spokeSets: any[] = Array.isArray(r.linkedSpokeSets) ? r.linkedSpokeSets : [];
        const withoutNippleFgr = Math.max(0, Number(r.withoutNippleCartonsFgr || 0));
        const uom = r.uom || 'GRS';

        const spokePopoverContent = (
          <div style={{ minWidth: 420, maxWidth: 520 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 12.5, color: token.colorText }}>
                {r.itemName} ({r.itemCode}) — Spoke Set Breakdown
              </span>
              <Tag color="purple" style={{ margin: 0, fontWeight: 700, fontSize: 10.5 }}>
                {spokeSets.length} {spokeSets.length === 1 ? 'Spoke Set' : 'Spoke Sets'}
              </Tag>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {spokeSets.map((s: any, idx: number) => {
                const ord = Math.max(0, Number(s.orderedQuantity || 0));
                const disp = Math.max(0, Number(s.dispatchedQuantity || 0));
                const pendOrder =
                  s.pendingOrderQuantity !== undefined
                    ? Math.max(0, Number(s.pendingOrderQuantity))
                    : Math.max(0, ord - disp);
                const packed = Math.max(0, Number(s.packedQuantity || 0));
                const withoutNipple = Math.max(0, Number(s.withoutNippleQuantity || 0));
                const balToPack =
                  s.balanceToPackQuantity !== undefined
                    ? Math.max(0, Number(s.balanceToPackQuantity))
                    : Math.max(0, pendOrder - packed);
                const sUom = s.uom || uom;

                return (
                  <div
                    key={idx}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 6,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      background: token.colorFillAlter,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: 12, color: token.colorText }}>
                        {s.spokeName}
                      </span>
                      <Tag
                        color={balToPack > 0 ? 'error' : 'success'}
                        style={{ margin: 0, fontWeight: 700, fontSize: 10.5 }}
                      >
                        Bal to Pack: {formatDecimal(balToPack, 0)} {sUom}
                      </Tag>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: 6,
                        marginTop: 5,
                        paddingTop: 4,
                        borderTop: `1px dashed ${token.colorBorderSecondary}`,
                        fontSize: 11,
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 10, color: token.colorTextTertiary }}>Total Order</div>
                        <div style={{ fontWeight: 700, color: '#3b82f6' }}>
                          {formatDecimal(ord, 0)} {sUom}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: token.colorTextTertiary }}>Dispatched</div>
                        <div style={{ fontWeight: 700, color: '#16a34a' }}>
                          -{formatDecimal(disp, 0)} {sUom}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: token.colorTextTertiary }}>Pending Order</div>
                        <div style={{ fontWeight: 700, color: token.colorText }}>
                          {formatDecimal(pendOrder, 0)} {sUom}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: token.colorTextTertiary }}>Packed (w/ Nipple)</div>
                        <div style={{ fontWeight: 700, color: '#06b6d4' }}>
                          {formatDecimal(packed, 0)} {sUom}
                        </div>
                      </div>
                    </div>
                    {withoutNipple > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <Tag
                          color="warning"
                          style={{ margin: 0, fontSize: 10, fontWeight: 600, padding: '0 6px' }}
                        >
                          Without Nipple Safety Stock: {formatDecimal(withoutNipple, 0)} {sUom} (excluded from packed FGR)
                        </Tag>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div
              style={{
                fontWeight: 700,
                color: token.colorText,
                fontSize: 13,
                lineHeight: 1.25,
                whiteSpace: 'nowrap',
              }}
            >
              {r.itemName}
            </div>
            <Space size={4} wrap>
              <Tag
                color="cyan"
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  margin: 0,
                  padding: '0 6px',
                  borderRadius: 4,
                  lineHeight: '18px',
                }}
              >
                {r.itemCode}
              </Tag>
              {spokeSets.length > 0 ? (
                <Popover
                  content={spokePopoverContent}
                  trigger={['click', 'hover']}
                  placement="bottomLeft"
                >
                  <Tag
                    color="purple"
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      margin: 0,
                      padding: '0 7px',
                      borderRadius: 10,
                      lineHeight: '18px',
                      cursor: 'pointer',
                      border: '1px solid rgba(168, 85, 247, 0.45)',
                    }}
                  >
                    {spokeSets.length} {spokeSets.length === 1 ? 'Spoke Set' : 'Spoke Sets'}{' '}
                    <DownOutlined style={{ fontSize: 8, marginLeft: 2 }} />
                  </Tag>
                </Popover>
              ) : (
                <span style={{ fontSize: 10.5, color: token.colorTextTertiary }}>0 Spoke Sets</span>
              )}
              {withoutNippleFgr > 0 && (
                <Tooltip title="Un-nippled safety stock cartons packed WITHOUT nipples (excluded from nipple-packed FGR)">
                  <Tag
                    color="warning"
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      margin: 0,
                      padding: '0 6px',
                      borderRadius: 10,
                      lineHeight: '18px',
                    }}
                  >
                    {formatDecimal(withoutNippleFgr, 0)} No-Nipple
                  </Tag>
                </Tooltip>
              )}
            </Space>
          </div>
        );
      },
    },
    {
      title: 'Pending Order',
      key: 'pendingOrderCol',
      width: 150,
      align: 'right',
      render: (_: any, r: any) => {
        const totalOrd = Math.max(0, Number(r.totalDemand || 0));
        const totalDisp = Math.max(0, Number(r.totalDispatched || 0));
        const netPendOrder = Math.max(
          0,
          Number(r.netPendingOrder !== undefined ? r.netPendingOrder : Math.max(0, totalOrd - totalDisp)),
        );
        const uom = r.uom || 'GRS';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: token.colorText }}>
              {formatDecimal(netPendOrder, 0)} {uom}
            </span>
            <span style={{ fontSize: 10.5, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
              Ord: <strong>{formatDecimal(totalOrd, 0)}</strong> · Disp:{' '}
              <strong style={{ color: '#16a34a' }}>{formatDecimal(totalDisp, 0)}</strong>
            </span>
          </div>
        );
      },
    },
    {
      title: 'Packed (w/ Nipple)',
      key: 'packedWithNippleCol',
      width: 145,
      align: 'right',
      render: (_: any, r: any) => {
        const packedFgr = Math.max(
          0,
          Number(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0),
        );
        const withoutNippleFgr = Math.max(0, Number(r.withoutNippleCartonsFgr || 0));
        const uom = r.uom || 'GRS';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: '#06b6d4' }}>
              {formatDecimal(packedFgr, 0)} {uom}
            </span>
            {withoutNippleFgr > 0 ? (
              <Tooltip title="Cartons packed WITHOUT nipples (Un-nippled Safety Stock waiting for nipples)">
                <Tag
                  color="warning"
                  style={{ margin: 0, fontSize: 10, padding: '0 5px', lineHeight: '16px', fontWeight: 700 }}
                >
                  +{formatDecimal(withoutNippleFgr, 0)} No-Nipple
                </Tag>
              </Tooltip>
            ) : (
              <span style={{ fontSize: 10.5, color: token.colorTextTertiary }}>Physical w/ Nipple</span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Balance to Pack',
      key: 'balanceToPackCol',
      width: 155,
      align: 'right',
      render: (_: any, r: any) => {
        const totalOrd = Math.max(0, Number(r.totalDemand || 0));
        const totalDisp = Math.max(0, Number(r.totalDispatched || 0));
        const netPendOrder = Math.max(
          0,
          Number(r.netPendingOrder !== undefined ? r.netPendingOrder : Math.max(0, totalOrd - totalDisp)),
        );
        const packedFgr = Math.max(
          0,
          Number(r.packedWithNipplesFgr ?? r.packedInCartonsFgr ?? r.totalPackedInSpokes ?? 0),
        );
        const remToPack = Math.max(
          0,
          Number(
            r.remainingToPack !== undefined
              ? r.remainingToPack
              : r.netPendingDemand !== undefined
              ? r.netPendingDemand
              : Math.max(0, netPendOrder - packedFgr),
          ),
        );
        const pctPacked =
          netPendOrder > 0
            ? Math.min(100, Math.round((packedFgr / netPendOrder) * 100))
            : 100;
        const uom = r.uom || 'GRS';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <span
              style={{
                fontWeight: 800,
                fontSize: 13.5,
                color: remToPack > 0 ? '#ef4444' : '#16a34a',
              }}
            >
              {formatDecimal(remToPack, 0)} {uom}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: 115 }}>
              <Progress
                percent={pctPacked}
                size="small"
                showInfo={false}
                strokeColor={pctPacked >= 100 ? '#22c55e' : '#06b6d4'}
                style={{ margin: 0, flex: 1 }}
              />
              <span style={{ fontSize: 10, color: token.colorTextSecondary, fontWeight: 600 }}>
                {pctPacked}%
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: (
        <>
          Unpacked Stock
          <br />
          (WH-002)
        </>
      ),
      key: 'unpackedStockCol',
      width: 155,
      align: 'right',
      render: (_: any, r: any) => {
        const currentFg = Math.max(
          0,
          Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0),
        );
        const remToPack = Math.max(0, Number(r.remainingToPack ?? r.netPendingDemand ?? 0));
        const packableNow = Math.max(
          0,
          Number(r.packableFromStockGrs ?? Math.min(currentFg, remToPack)),
        );
        const uom = r.uom || 'GRS';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontWeight: 800, fontSize: 13.5, color: '#22c55e' }}>
              {formatDecimal(currentFg, 0)} {uom}
            </span>
            <span style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
              Packable: <strong style={{ color: token.colorText }}>{formatDecimal(packableNow, 0)} {uom}</strong>
            </span>
          </div>
        );
      },
    },
    {
      title: (
        <>
          Net Position
          <br />
          &amp; Status
        </>
      ),
      dataIndex: 'balance',
      key: 'balance',
      width: 170,
      align: 'center',
      render: (_: any, r: any) => {
        const currentFg = Math.max(
          0,
          Number(r.currentUnpackedNippleStock ?? r.currentFgStock ?? r.fgStock ?? 0),
        );
        const remToPack = Math.max(0, Number(r.remainingToPack ?? r.netPendingDemand ?? 0));
        const finalShortage = Number(
          r.finalBalanceShortage !== undefined ? r.finalBalanceShortage : remToPack - currentFg,
        );
        const isShortage = finalShortage > 0;
        const surplusGrs = Math.max(0, Number(r.stockSurplus ?? currentFg - remToPack));
        const uom = r.uom || 'GRS';
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <Tag
              color={isShortage ? 'error' : 'success'}
              icon={isShortage ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
              style={{
                margin: 0,
                fontWeight: 800,
                fontSize: 12,
                padding: '2px 9px',
                borderRadius: 12,
                whiteSpace: 'nowrap',
              }}
            >
              {isShortage
                ? `${formatDecimal(finalShortage, 0)} ${uom} Deficit`
                : `+${formatDecimal(surplusGrs, 0)} ${uom} Surplus`}
            </Tag>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: isShortage ? '#ef4444' : '#16a34a',
              }}
            >
              {isShortage
                ? isInventoryMode
                  ? 'Import Required'
                  : 'Shortage'
                : 'Stock Sufficient'}
            </span>
          </div>
        );
      },
    },
    {
      title: (
        <>
          3M Forecast
          <br />
          &amp; Target
        </>
      ),
      key: 'forecastAndSafetyStock',
      width: 165,
      align: 'right',
      render: (_: any, r: any) => {
        const uom = r.uom || 'GRS';
        const forecast3M = Number(r.threeMonthForecast || 0);
        const safetyBuffer = Number(r.safetyStockBuffer || 0);
        const recOrder = Number(r.recommendedOrderQty || 0);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: '#0284c7' }}>
              Target: {formatDecimal(recOrder, 0)} {uom}
            </span>
            <span style={{ fontSize: 10.5, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
              3M: <strong style={{ color: '#a855f7' }}>{formatDecimal(forecast3M, 0)}</strong> · Buf:{' '}
              <strong style={{ color: '#f59e0b' }}>{formatDecimal(safetyBuffer, 0)}</strong>
            </span>
          </div>
        );
      },
    },
  ];

  const inventoryExtraColumns: any[] = isInventoryMode
    ? [
        {
          title: (
            <>
              4M Lead-Time
              <br />
              &amp; Order Today
            </>
          ),
          key: 'leadTimeCoverage',
          width: 195,
          align: 'right',
          render: (_: any, r: any) => {
            const effUsage = Number(r.effectiveMonthlyUsage || 0);
            const isManual = r.usageSource === 'MANUAL';
            const cov = Number(r.coverageMonths ?? 999);
            const leadM = Number(r.importLeadTimeMonths ?? 4);
            const orderToday = Number(r.orderTodayQty || 0);
            const isOrderToday = cov < leadM || orderToday > 0;
            const stockoutStr = r.projectedStockoutDate
              ? dayjs(r.projectedStockoutDate).format('DD MMM YYYY')
              : '—';
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                <Space size={4}>
                  <span style={{ fontSize: 11, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
                    {formatDecimal(effUsage, 0)}/mo
                  </span>
                  <Tag
                    color={isManual ? 'purple' : 'default'}
                    style={{ margin: 0, fontSize: 9.5, lineHeight: '14px', padding: '0 4px', cursor: 'pointer' }}
                    onClick={() => setPlanningDrawerOpen(true)}
                  >
                    {isManual ? 'Manual' : 'Auto'}
                  </Tag>
                </Space>
                <Tag
                  color={isOrderToday ? (cov < 2 ? 'red' : 'orange') : 'green'}
                  style={{ margin: 0, fontWeight: 700, fontSize: 10.5, borderRadius: 6 }}
                >
                  {isOrderToday
                    ? `ORDER TODAY (${leadM}M Lead)`
                    : `Covered ${cov >= 999 ? '999' : cov.toFixed(1)}M`}
                </Tag>
                <span style={{ fontSize: 10, color: isOrderToday ? '#ef4444' : token.colorTextTertiary, fontWeight: isOrderToday ? 700 : 400, fontVariantNumeric: 'tabular-nums' }}>
                  {isOrderToday
                    ? `Order: ${formatDecimal(orderToday, 0)} GRS · Out: ${stockoutStr}`
                    : `Stockout: ${stockoutStr}`}
                </span>
              </div>
            );
          },
        },
        {
          title: (
            <>
              Open POs
              <br />
              &amp; Action
            </>
          ),
          key: 'linkedPurchaseOrders',
          width: 215,
          align: 'right',
          fixed: 'right',
          render: (_: any, r: any) => {
            const CLOSED_PO_STATUSES = ['FULLY_RECEIVED', 'RECEIVED', 'CLOSED', 'CANCELLED', 'VOID'];
            const pos: any[] = (r.linkedPurchaseOrders || []).filter((p: any) => {
              const st = String(p.status || 'DRAFT').toUpperCase();
              if (CLOSED_PO_STATUSES.includes(st)) return false;
              const openQty =
                p.pendingQuantity !== undefined
                  ? Number(p.pendingQuantity)
                  : Math.max(0, Number(p.orderedQuantity || 0) - Number(p.receivedQuantity || 0));
              return openQty > 0;
            });
            const uom = r.uom || 'GRS';
            const openPoTotal = Math.max(0, Number(r.openPoPendingQty || 0));
            const netUnordered = Math.max(0, Number(r.remainingImportRequirement || 0));
            const grossDeficit = Math.max(0, Number(r.netDeficitRequired || 0));

            const poPopoverContent = (
              <div style={{ minWidth: 360, maxWidth: 440 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: 6,
                    marginBottom: 8,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: token.colorText }}>
                    {r.itemName} — Open Import POs
                  </span>
                  <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>
                    In-Transit: {formatDecimal(openPoTotal, 0)} {uom}
                  </Tag>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pos.map((p: any, idx: number) => {
                    const openQty = Number(p.pendingQuantity || 0);
                    const rcvdQty = Number(p.receivedQuantity || 0);
                    const stageLabel = p.importStage
                      ? String(p.importStage).replace(/_/g, ' ')
                      : String(p.status || 'DRAFT').replace(/_/g, ' ');
                    return (
                      <div
                        key={idx}
                        style={{
                          padding: '6px 9px',
                          borderRadius: 6,
                          border: '1px solid rgba(59, 130, 246, 0.35)',
                          background: token.colorFillAlter,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <Space size={4}>
                            <ShoppingCartOutlined style={{ color: '#3b82f6', fontSize: 12 }} />
                            <span style={{ fontWeight: 800, fontSize: 12, color: token.colorText }}>
                              {p.poCode}
                            </span>
                            <Tag
                              color={p.purchaseOrigin === 'IMPORT' ? 'blue' : 'cyan'}
                              style={{ fontSize: 9.5, fontWeight: 700, margin: 0, padding: '0 5px', lineHeight: '16px' }}
                            >
                              {p.purchaseOrigin || 'IMPORT'}
                            </Tag>
                          </Space>
                          <Tag
                            color="processing"
                            style={{ fontSize: 9.5, fontWeight: 700, margin: 0, padding: '0 5px', lineHeight: '16px' }}
                          >
                            {stageLabel}
                          </Tag>
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: token.colorTextSecondary,
                            marginTop: 2,
                          }}
                        >
                          {p.supplierName}
                          {p.expectedDeliveryDate ? ` · ETA: ${String(p.expectedDeliveryDate).slice(0, 10)}` : ''}
                        </div>
                        <div style={{ fontSize: 11, marginTop: 3, display: 'flex', gap: 8 }}>
                          <span style={{ color: token.colorTextSecondary }}>
                            Ord: <strong style={{ color: token.colorText }}>{formatDecimal(p.orderedQuantity, 0)}</strong>
                          </span>
                          {rcvdQty > 0 && (
                            <span style={{ color: '#16a34a' }}>
                              · Rcvd: <strong>{formatDecimal(rcvdQty, 0)}</strong>
                            </span>
                          )}
                          <span style={{ color: '#2563eb', fontWeight: 700 }}>
                            · Open: <strong>{formatDecimal(openQty, 0)} {uom}</strong>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );

            return (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 4,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Space size={4} wrap style={{ justifyContent: 'flex-end' }}>
                  {pos.length > 0 ? (
                    <Popover content={poPopoverContent} trigger={['click', 'hover']} placement="bottomRight">
                      <Tag
                        color="blue"
                        icon={<ShoppingCartOutlined />}
                        style={{
                          margin: 0,
                          fontWeight: 700,
                          fontSize: 11,
                          padding: '1px 7px',
                          borderRadius: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {pos.length} {pos.length === 1 ? 'Open PO' : 'Open POs'} · {formatDecimal(openPoTotal, 0)} {uom}{' '}
                        <DownOutlined style={{ fontSize: 8, marginLeft: 2 }} />
                      </Tag>
                    </Popover>
                  ) : (
                    <Tag
                      color="default"
                      style={{
                        margin: 0,
                        fontWeight: 600,
                        fontSize: 10.5,
                        padding: '0 7px',
                        borderRadius: 10,
                        color: token.colorTextTertiary,
                      }}
                    >
                      No Open PO
                    </Tag>
                  )}
                  {(Number(r.orderTodayQty || 0) > 0 || netUnordered > 0 || grossDeficit > 0) && (
                    <Button
                      size="small"
                      type="primary"
                      danger={Number(r.orderTodayQty || 0) > 0 || netUnordered > 0}
                      icon={<PlusCircleOutlined />}
                      style={{ height: 22, fontSize: 11, padding: '0 8px', fontWeight: 700 }}
                      onClick={() => handleOpenReorderModal(r)}
                    >
                      Order
                    </Button>
                  )}
                </Space>
                <span style={{ fontSize: 10, color: token.colorTextSecondary }}>
                  {grossDeficit <= 0 ? (
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>Covered by Stock</span>
                  ) : netUnordered > 0 ? (
                    <span style={{ color: '#ef4444', fontWeight: 700 }}>
                      Still to Order: {formatDecimal(netUnordered, 0)} {uom}
                    </span>
                  ) : (
                    <span style={{ color: '#0284c7', fontWeight: 700 }}>Covered by Open PO</span>
                  )}
                </span>
              </div>
            );
          },
        },
      ]
    : [];

  const headerCellProps = useCallback(
    () => ({
      style: {
        whiteSpace: 'normal' as const,
        wordBreak: 'normal' as const,
        lineHeight: 1.25,
        padding: '10px 8px',
        background: 'var(--theme-surface-elevated, var(--theme-surface-alt))',
        borderBottom: `1.5px solid var(--theme-border-strong, ${token.colorBorder})`,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
      },
    }),
    [token.colorBorder],
  );

  const summaryColumns = useMemo(
    () =>
      [...baseColumns, ...inventoryExtraColumns].map((col) => ({
        ...col,
        onHeaderCell: headerCellProps,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseColumns, inventoryExtraColumns, headerCellProps],
  );

  // Excel-Style Time-Phased Shipment Projection Columns
  const matrixColumns: any[] = useMemo(() => {
    const leftSticky: any[] = [
      {
        title: 'S.No',
        dataIndex: 'sNo',
        key: 'sNo',
        width: 60,
        align: 'center',
        fixed: 'left',
        render: (val: number) => <span style={{ fontWeight: 700, color: token.colorTextSecondary }}>{val}</span>,
      },
      {
        title: 'Product (Nipple)',
        key: 'productNipple',
        width: 210,
        fixed: 'left',
        render: (_: any, r: any) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 700, color: token.colorText, fontSize: 13 }}>{r.itemName}</div>
            <Space size={4}>
              <Tag color="cyan" style={{ fontSize: 10, fontWeight: 700, margin: 0, padding: '0 6px' }}>
                {r.itemCode}
              </Tag>
              {r.hasStockoutAlert && (
                <Tag color="error" icon={<WarningOutlined />} style={{ fontSize: 10, fontWeight: 700, margin: 0 }}>
                  Stockout Alert
                </Tag>
              )}
            </Space>
          </div>
        ),
      },
      {
        title: 'Last 3M Sales',
        key: 'last3MonthSales',
        width: 125,
        align: 'right',
        render: (_: any, r: any) => (
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#3b82f6' }}>
              {formatDecimal(r.last3MonthSales, 0)} GRS
            </div>
            <div style={{ fontSize: 10.5, color: token.colorTextTertiary }}>Rolling 90d</div>
          </div>
        ),
      },
      {
        title: 'Monthly Avg',
        key: 'monthlyAverage',
        width: 125,
        align: 'right',
        render: (_: any, r: any) => (
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: token.colorText }}>
              {formatDecimal(r.monthlyAverage, 0)} GRS
            </div>
            <div style={{ fontSize: 10.5, color: token.colorTextTertiary }}>
              ~{formatDecimal(r.dailyConsumptionRate, 1)} GRS/day
            </div>
          </div>
        ),
      },
      {
        title: `${safetyMonths}M Safety Target`,
        key: 'forecastSafetyStock',
        width: 135,
        align: 'right',
        render: (_: any, r: any) => (
          <div>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#a855f7' }}>
              {formatDecimal(r.forecastSafetyStock, 0)} GRS
            </div>
            <div style={{ fontSize: 10.5, color: token.colorTextTertiary }}>
              {safetyMonths} × Monthly Avg
            </div>
          </div>
        ),
      },
      {
        title: 'Stock in Hand',
        key: 'stockInHand',
        width: 130,
        align: 'right',
        render: (_: any, r: any) => (
          <div>
            <div style={{ fontWeight: 800, fontSize: 13.5, color: '#06b6d4' }}>
              {formatDecimal(r.stockInHand, 0)} GRS
            </div>
            <div style={{ fontSize: 10, color: token.colorTextTertiary }}>
              {includeFgrStock ? 'FG + FGR Packed' : 'Unpacked FG'}
            </div>
          </div>
        ),
      },
    ];

    const dynamicShipmentGroups: any[] = timePhasedPlan.shipmentMilestones.map((ms: any, idx: number) => {
      const msKey = ms.poId || ms.poNumber;
      return {
        title: (
          <div
            onClick={() => openEditShipmentDrawer(ms)}
            style={{
              cursor: 'pointer',
              padding: '2px 6px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
            }}
            title="Click to edit ETA Date or File #"
          >
            <Space size={6}>
              <Tag color="blue" style={{ margin: 0, fontWeight: 800, fontSize: 10.5 }}>
                SHIPMENT #{idx + 1}
              </Tag>
              <span style={{ fontWeight: 800, fontSize: 12, color: token.colorText }}>{ms.vendorName}</span>
              <EditOutlined style={{ fontSize: 11, color: '#3b82f6' }} />
            </Space>
            <Space size={6} style={{ fontSize: 11 }}>
              <Tag color="purple" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                File: {ms.fileNumber}
              </Tag>
              <Tag color="cyan" icon={<CalendarOutlined />} style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                ETA: {ms.etaDate}
              </Tag>
            </Space>
          </div>
        ),
        key: `shipment_group_${msKey}`,
        children: [
          {
            title: 'Stock Before',
            key: `before_${msKey}`,
            width: 115,
            align: 'right',
            render: (_: any, r: any) => {
              const p = r.milestoneProjections?.[msKey];
              const val = Number(p?.stockBeforeShipment ?? r.stockInHand ?? 0);
              const isNeg = val < 0;
              return (
                <div
                  style={{
                    padding: '3px 6px',
                    borderRadius: 4,
                    background: isNeg ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
                    border: isNeg ? '1px solid rgba(239, 68, 68, 0.4)' : 'none',
                  }}
                >
                  <div style={{ fontWeight: 800, fontSize: 12.5, color: isNeg ? '#ef4444' : token.colorText }}>
                    {formatDecimal(val, 0)}
                  </div>
                  <div style={{ fontSize: 9.5, color: isNeg ? '#ef4444' : token.colorTextTertiary }}>
                    {isNeg ? 'Stockout!' : `${p?.daysElapsed || 0}d burn`}
                  </div>
                </div>
              );
            },
          },
          {
            title: 'Shipment Qty (+)',
            key: `ship_qty_${msKey}`,
            width: 125,
            align: 'right',
            render: (_: any, r: any) => {
              const p = r.milestoneProjections?.[msKey];
              const qty = Number(p?.shipmentQtyGrs || 0);
              return (
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: qty > 0 ? '#3b82f6' : token.colorTextTertiary,
                    }}
                  >
                    {qty > 0 ? `+${formatDecimal(qty, 0)}` : '0'} GRS
                  </div>
                  <div style={{ fontSize: 9.5, color: token.colorTextTertiary }}>{ms.poNumber}</div>
                </div>
              );
            },
          },
          {
            title: 'Consumed (-)',
            key: `consumed_${msKey}`,
            width: 120,
            align: 'right',
            render: (_: any, r: any) => {
              const p = r.milestoneProjections?.[msKey];
              const consumed = Number(p?.materialConsumedTillEta || 0);
              const nextConsumed = Number(p?.materialConsumedTillNextEta || 0);
              return (
                <Tooltip
                  title={`Consumed before arrival (${p?.daysElapsed || 0}d): ${formatDecimal(consumed, 0)} GRS | Next window (${p?.daysTillNextEta || 0}d): ${formatDecimal(nextConsumed, 0)} GRS`}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: '#f59e0b' }}>
                      -{formatDecimal(consumed, 0)} GRS
                    </div>
                    <div style={{ fontSize: 9.5, color: token.colorTextTertiary }}>
                      Next: -{formatDecimal(nextConsumed, 0)}
                    </div>
                  </div>
                </Tooltip>
              );
            },
          },
          {
            title: 'Stock After',
            key: `after_${msKey}`,
            width: 120,
            align: 'right',
            render: (_: any, r: any) => {
              const p = r.milestoneProjections?.[msKey];
              const after = Number(p?.stockAfterShipment ?? r.stockInHand ?? 0);
              const isNeg = after < 0;
              return (
                <div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: 13,
                      color: isNeg ? '#ef4444' : '#22c55e',
                    }}
                  >
                    {formatDecimal(after, 0)} GRS
                  </div>
                  <div style={{ fontSize: 9.5, color: token.colorTextTertiary }}>Post-Arrival</div>
                </div>
              );
            },
          },
        ],
      };
    });

    const rightSticky: any[] = [
      {
        title: 'Safe in Months',
        key: 'safeInMonths',
        width: 135,
        align: 'center',
        fixed: 'right',
        render: (_: any, r: any) => {
          const m = Number(r.safeInMonths || 0);
          const color = m < 1.5 ? 'error' : m < 3.5 ? 'warning' : 'success';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <Tag color={color} style={{ fontWeight: 800, fontSize: 12.5, padding: '2px 8px', margin: 0 }}>
                {m >= 99 ? '99+ Months' : `${m.toFixed(2)} Months`}
              </Tag>
              <span style={{ fontSize: 10, color: token.colorTextTertiary }}>
                End: {formatDecimal(r.endingProjectedStock, 0)} GRS
              </span>
            </div>
          );
        },
      },
      {
        title: 'Recommended Order to Vendor',
        key: 'matrixRecommendedOrderQty',
        width: 185,
        align: 'right',
        fixed: 'right',
        render: (_: any, r: any) => {
          const rec = Number(r.matrixRecommendedOrderQty || 0);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
              {rec > 0 ? (
                <Tag
                  color="success"
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    padding: '3px 10px',
                    margin: 0,
                    border: '1px solid rgba(34, 197, 94, 0.45)',
                  }}
                >
                  {formatDecimal(rec, 0)} GRS
                </Tag>
              ) : (
                <Tag color="default" style={{ fontWeight: 700, fontSize: 11.5, margin: 0 }}>
                  0 GRS (Covered)
                </Tag>
              )}
              <span style={{ fontSize: 10, color: token.colorTextSecondary }}>
                To reach {safetyMonths}M Target
              </span>
            </div>
          );
        },
      },
    ];

    return [...leftSticky, ...dynamicShipmentGroups, ...rightSticky];
  }, [token, safetyMonths, includeFgrStock, timePhasedPlan.shipmentMilestones, openEditShipmentDrawer]);

  return (
    <>
      <Card
        style={{ marginTop }}
        title={
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              width: '100%',
            }}
          >
              {/* Left Zone: Primary Workflow & View Switcher */}
              <Space size={8} wrap>
                <Space size={6} style={{ marginRight: 4 }}>
                  <BuildOutlined style={{ color: token.colorPrimary, fontSize: 18 }} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: token.colorText }}>
                    Nipple Demand &amp; Stock Balance
                  </span>
                  <Tag color="cyan" style={{ fontWeight: 700, borderRadius: 12, margin: 0 }}>
                    All in GRS
                  </Tag>
                </Space>
                {isInventoryMode && (
                  <Segmented
                    size="middle"
                    value={viewMode}
                    onChange={(val) => setViewMode(val as 'summary' | 'matrix')}
                    options={[
                      {
                        label: (
                          <Space size={4}>
                            <AppstoreOutlined />
                            <span>Demand &amp; Stock Balance</span>
                          </Space>
                        ),
                        value: 'summary',
                      },
                      {
                        label: (
                          <Space size={4}>
                            <TableOutlined />
                            <span>Time-Phased Shipment Plan</span>
                          </Space>
                        ),
                        value: 'matrix',
                      },
                    ]}
                  />
                )}
                {isInventoryMode && (
                  <>
                    <Button
                      size="middle"
                      type="primary"
                      icon={<PlusCircleOutlined />}
                      onClick={() => handleOpenReorderModal()}
                      style={{ fontWeight: 600 }}
                    >
                      Generate Import PR / PO
                    </Button>
                    <Button
                      size="middle"
                      icon={<ContainerOutlined />}
                      onClick={() => openEditShipmentDrawer()}
                    >
                      Manage Shipments
                    </Button>
                    <Button
                      size="middle"
                      icon={<SlidersOutlined />}
                      onClick={() => setPlanningDrawerOpen(true)}
                    >
                      Planning Parameters
                    </Button>
                  </>
                )}
                <Popover
                  open={remarksPopoverOpen}
                  onOpenChange={setRemarksPopoverOpen}
                  trigger="click"
                  placement="bottomRight"
                  title={<span style={{ fontWeight: 700 }}>Report Remarks / Notes (English &amp; Urdu)</span>}
                  content={
                    <div style={{ width: 320 }}>
                      <Input.TextArea
                        rows={3}
                        dir="auto"
                        placeholder="Enter remarks, shipment instructions, or Urdu notes for PDF / Excel / Print..."
                        value={reportRemarks}
                        onChange={(e) => {
                          const val = e.target.value;
                          setReportRemarks(val);
                          try {
                            localStorage.setItem('pwi_nipple_report_remarks', val);
                          } catch {
                            // ignore
                          }
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                        <Button
                          size="small"
                          onClick={() => {
                            setReportRemarks('');
                            try {
                              localStorage.removeItem('pwi_nipple_report_remarks');
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          Clear
                        </Button>
                        <Button size="small" type="primary" onClick={() => setRemarksPopoverOpen(false)}>
                          Done
                        </Button>
                      </div>
                    </div>
                  }
                >
                  <Tooltip title="Add custom English or Urdu Remarks to PDF, Excel & Print View">
                    <Button
                      size="middle"
                      icon={<FileTextOutlined />}
                      type={reportRemarks.trim() ? 'primary' : 'default'}
                      ghost={Boolean(reportRemarks.trim())}
                    >
                      Remarks{reportRemarks.trim() ? ' ✓' : ''}
                    </Button>
                  </Tooltip>
                </Popover>
              </Space>

              {/* Right Zone: Cohesive Document Export Group */}
              <Space.Compact size="middle">
                <Tooltip title="Open clean A4 Landscape Print View">
                  <Button icon={<PrinterOutlined />} onClick={handlePrintView}>
                    Print View
                  </Button>
                </Tooltip>
                <Tooltip title="Download Executive A4 Landscape PDF Report">
                  <Button
                    icon={<FilePdfOutlined />}
                    style={{ color: token.colorError, borderColor: token.colorErrorBorder, fontWeight: 600 }}
                    onClick={handleExportPdf}
                  >
                    PDF
                  </Button>
                </Tooltip>
                <Tooltip title="Download Formatted Multi-Sheet Excel (.xlsx) Workbook">
                  <Button
                    icon={<FileExcelOutlined />}
                    style={{ color: token.colorSuccess, borderColor: token.colorSuccessBorder, fontWeight: 600 }}
                    onClick={handleExportExcel}
                  >
                    Excel (.xlsx)
                  </Button>
                </Tooltip>
                {!isControlled && (
                  <Tooltip title="Refresh Live Data">
                    <Button icon={<ReloadOutlined />} onClick={fetchLive} loading={isLoading}>
                      Refresh
                    </Button>
                  </Tooltip>
                )}
              </Space.Compact>
            </div>
        }
      >
        {isInventoryMode && viewMode === 'matrix' && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '8px 12px',
              marginBottom: 10,
              borderRadius: 8,
              border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
              background: `var(--theme-surface, ${token.colorFillAlter})`,
            }}
          >
            <Space size={16} wrap>
              <Space size={6}>
                <span style={{ fontSize: 12, fontWeight: 700, color: token.colorText }}>
                  Safety Target (Months):
                </span>
                <InputNumber
                  size="small"
                  min={1}
                  max={12}
                  step={0.5}
                  value={safetyMonths}
                  onChange={(v) => setSafetyMonths(Number(v || 4))}
                  style={{ width: 75 }}
                />
              </Space>
              <Space size={6}>
                <span style={{ fontSize: 12, fontWeight: 700, color: token.colorText }}>
                  Target Arrival Month:
                </span>
                <DatePicker
                  size="small"
                  picker="month"
                  value={targetArrivalMonth}
                  onChange={(d) => d && setTargetArrivalMonth(d)}
                  allowClear={false}
                />
              </Space>
              <Space size={6}>
                <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                  Include FGR Packed Cartons in Stock in Hand:
                </span>
                <Switch
                  size="small"
                  checked={includeFgrStock}
                  onChange={(checked) => setIncludeFgrStock(checked)}
                />
              </Space>
            </Space>
            <Space size={8} wrap>
              <Tag color="blue" style={{ margin: 0, fontWeight: 700 }}>
                Active Open Shipments: {timePhasedPlan.shipmentMilestones.length}
              </Tag>
              <Tag color="green" style={{ margin: 0, fontWeight: 700 }}>
                Total Recommended Order: {formatDecimal(totals.matrixRecommendedOrderQty, 0)} GRS
              </Tag>
            </Space>
          </div>
        )}

        {/* Executive 4-Card KPI Strip with Icons & Visual Depth */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))',
            gap: 12,
            marginBottom: 14,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {[
            {
              key: 'pending',
              label: 'Total Pending Order',
              value: `${formatDecimal(totals.netPendingOrder, 0)} GRS`,
              valColor: token.colorText,
              accent: token.colorPrimary,
              iconBg: token.colorPrimaryBg,
              icon: <ShoppingCartOutlined />,
              pills: [
                `Gross Ord: ${formatDecimal(totals.totalDemand, 0)}`,
                `Disp: ${formatDecimal(totals.totalDispatched, 0)} GRS`,
              ],
            },
            {
              key: 'pack',
              label: 'Remaining to Pack',
              value: `${formatDecimal(totals.remainingToPack, 0)} GRS`,
              valColor: token.colorError,
              accent: token.colorError,
              iconBg: token.colorErrorBg,
              icon: <InboxOutlined />,
              pills: [
                `Packed (w/ Nipple): ${formatDecimal(totals.packedFgr, 0)}`,
                ...(totals.withoutNippleCartonsFgr > 0
                  ? [`No-Nipple: ${formatDecimal(totals.withoutNippleCartonsFgr, 0)} GRS`]
                  : ['All Nipple-Verified']),
              ],
            },
            {
              key: 'stock',
              label: 'Unpacked Nipple Stock (WH-002)',
              value: `${formatDecimal(totals.currentFg, 0)} GRS`,
              valColor: token.colorSuccess,
              accent: token.colorSuccess,
              iconBg: token.colorSuccessBg,
              icon: <DatabaseOutlined />,
              pills: [
                `Packable Now: ${formatDecimal(totals.packableFromStockGrs, 0)}`,
                `Surplus: +${formatDecimal(totals.stockSurplus, 0)} GRS`,
              ],
            },
            {
              key: 'deficit',
              label: 'Net Deficit / In-Transit POs',
              value: `${formatDecimal(totals.netDeficitRequired, 0)} GRS Deficit`,
              extraValue: isInventoryMode ? `PO: ${formatDecimal(totals.openPoPendingQty, 0)} GRS` : undefined,
              valColor: totals.netDeficitRequired > 0 ? token.colorError : token.colorSuccess,
              accent: token.colorInfo,
              iconBg: token.colorInfoBg,
              icon: <GlobalOutlined />,
              pills: isInventoryMode
                ? [
                    `Order Today (4M): ${formatDecimal(totals.orderTodayQty || 0, 0)} GRS`,
                    `${safetyMonths}M Target: ${formatDecimal(totals.forecastSafetyStock, 0)} GRS`,
                  ]
                : [
                    `3M Burn: ${formatDecimal(totals.last3MonthSales, 0)}`,
                    `Target Order: ${formatDecimal(totals.recommendedOrderQty, 0)} GRS`,
                  ],
            },
          ].map((kpi) => (
            <div
              key={kpi.key}
              style={{
                position: 'relative',
                overflow: 'hidden',
                padding: '12px 14px',
                borderRadius: token.borderRadiusLG,
                border: `1px solid var(--theme-border, ${token.colorBorderSecondary})`,
                borderTop: `3px solid ${kpi.accent}`,
                background: `linear-gradient(135deg, var(--theme-surface, ${token.colorBgContainer}) 0%, var(--theme-surface-alt, ${token.colorFillAlter}) 100%)`,
                boxShadow: token.boxShadowTertiary,
              }}
            >
              {/* Subtle Watermark Icon */}
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -10,
                  fontSize: 56,
                  color: kpi.accent,
                  opacity: 0.08,
                  pointerEvents: 'none',
                  lineHeight: 1,
                }}
              >
                {kpi.icon}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: token.colorTextSecondary, fontWeight: 600 }}>
                    {kpi.label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 3 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: kpi.valColor, lineHeight: 1.2 }}>
                      {kpi.value}
                    </span>
                    {kpi.extraValue && (
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: token.colorInfo }}>
                        · {kpi.extraValue}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: kpi.iconBg,
                    color: kpi.accent,
                    fontSize: 17,
                  }}
                >
                  {kpi.icon}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, position: 'relative' }}>
                {kpi.pills.map((pill) => (
                  <span
                    key={pill}
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: token.colorTextSecondary,
                      background: token.colorFillAlter,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 6,
                      padding: '1px 7px',
                    }}
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {isInventoryMode && viewMode === 'matrix' ? (
          <Table
            size="small"
            bordered
            loading={isLoading}
            dataSource={timePhasedPlan.matrixRows}
            rowKey="itemCode"
            pagination={false}
            scroll={{
              x: 1100 + timePhasedPlan.shipmentMilestones.length * 480,
            }}
            columns={matrixColumns}
          />
        ) : (
          <Table
            size="small"
            loading={isLoading}
            dataSource={rows}
            rowKey="itemCode"
            pagination={false}
            scroll={{ x: isInventoryMode ? 1360 : 1060 }}
            columns={summaryColumns}
          />
        )}
      </Card>

      {/* Inline Shipment ETA / File # Quick-Edit Drawer */}
      <Drawer
        title="Manage Incoming China Import Shipments (ETA & File #)"
        width={480}
        open={shipmentDrawerOpen}
        onClose={() => setShipmentDrawerOpen(false)}
        extra={
          <Button type="primary" loading={savingShipmentUpdate} onClick={handleSaveShipmentMilestone}>
            Save Update
          </Button>
        }
      >
        <Form form={shipmentForm} layout="vertical">
          <Form.Item
            name="poId"
            label="Select Open Import Purchase Order"
            rules={[{ required: true, message: 'Please select a Purchase Order' }]}
          >
            <Select
              placeholder="Choose open import PO"
              onChange={(poId) => {
                const found = timePhasedPlan.shipmentMilestones.find((m: any) => m.poId === poId);
                if (found) {
                  setEditingMilestone(found);
                  shipmentForm.setFieldsValue({
                    fileNumber: found.lcTtNumber || found.fileNumber || found.poNumber,
                    etaDate: found.etaDate ? dayjs(found.etaDate) : dayjs(),
                    stage: found.importStage || 'READY_TO_SHIP',
                  });
                }
              }}
              options={timePhasedPlan.shipmentMilestones.map((m: any) => ({
                value: m.poId,
                label: `${m.poNumber} — ${m.vendorName} (${formatDecimal(m.totalShipmentQtyGrs, 0)} GRS)`,
              }))}
            />
          </Form.Item>

          {editingMilestone && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorFillAlter,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700, color: token.colorText }}>
                Vendor: {editingMilestone.vendorName}
              </div>
              <div style={{ color: token.colorTextSecondary, marginTop: 2 }}>
                PO Code: <strong>{editingMilestone.poNumber}</strong> · Open Qty:{' '}
                <strong>{formatDecimal(editingMilestone.totalShipmentQtyGrs, 0)} GRS</strong>
              </div>
            </div>
          )}

          <Form.Item
            name="fileNumber"
            label="Import File # / LC-TT Reference (e.g. File 12/27)"
            rules={[{ required: true, message: 'Please enter File # or LC reference' }]}
          >
            <Input placeholder="e.g. File 12/27 or LC-2026-09" />
          </Form.Item>

          <Form.Item
            name="etaDate"
            label="Expected Arrival Date (ETA)"
            rules={[{ required: true, message: 'Please select ETA date' }]}
          >
            <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
          </Form.Item>

          <Form.Item name="stage" label="Current Shipment Stage">
            <Select options={IMPORT_STAGE_OPTIONS} />
          </Form.Item>

          <Form.Item name="remarks" label="Revision Remarks / Notes">
            <Input.TextArea rows={3} placeholder="Reason for ETA update or shipment notes..." />
          </Form.Item>
        </Form>
      </Drawer>

      {/* 1-Click Generate Import PR / PO Modal */}
      <Modal
        title="Generate Import Purchase Requisition / Draft PO"
        open={reorderModalOpen}
        onCancel={() => setReorderModalOpen(false)}
        onOk={handleConfirmGenerateReorder}
        confirmLoading={creatingReorder}
        okText={reorderDocType === 'PO' ? 'Create Draft Import PO' : 'Create Import PR'}
        width={760}
      >
        <Form form={reorderForm} layout="vertical" initialValues={{ docType: 'PR' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="docType" label="Document Type">
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={(e) => setReorderDocType(e.target.value)}
              >
                <Radio.Button value="PR">Purchase Requisition (PR)</Radio.Button>
                <Radio.Button value="PO">Draft Import PO</Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item name="requiredDate" label="Target Arrival / Required Date">
              <DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="title" label="Requisition / Order Title">
              <Input placeholder="Nipple Import Replenishment" />
            </Form.Item>

            <Form.Item name="warehouseId" label="Target Warehouse / Store">
              <Select
                placeholder="Select destination warehouse"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: `${w.warehouseCode || ''} ${w.name}`,
                }))}
              />
            </Form.Item>
          </div>

          {reorderDocType === 'PO' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Form.Item
                name="supplierId"
                label="Overseas Vendor / Supplier"
                rules={[{ required: true, message: 'Please select a supplier for the PO' }]}
              >
                <Select
                  placeholder="Select overseas supplier"
                  options={suppliers.map((s: any) => ({
                    value: s.id,
                    label: s.name,
                  }))}
                />
              </Form.Item>

              <Form.Item name="fileNumber" label="Import File # / LC Ref">
                <Input placeholder="e.g. File 12/27" />
              </Form.Item>
            </div>
          )}

          <Table
            size="small"
            pagination={false}
            rowKey="itemCode"
            dataSource={reorderLines}
            columns={[
              {
                title: 'Nipple Item',
                key: 'item',
                render: (_: any, r: any) => (
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.itemName}</div>
                    <Tag color="cyan" style={{ fontSize: 10 }}>
                      {r.itemCode}
                    </Tag>
                  </div>
                ),
              },
              {
                title: `${safetyMonths}M Recommended (GRS)`,
                dataIndex: 'recommendedQty',
                align: 'right',
                render: (v: number) => <strong>{formatDecimal(v, 0)} GRS</strong>,
              },
              {
                title: 'Order Quantity (GRS)',
                key: 'orderQty',
                width: 160,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    value={r.orderQty}
                    onChange={(val) => {
                      const next = [...reorderLines];
                      next[idx] = { ...next[idx], orderQty: Number(val || 0) };
                      setReorderLines(next);
                    }}
                  />
                ),
              },
              {
                title: 'Est. Rate (PKR/GRS)',
                key: 'unitPrice',
                width: 150,
                render: (_: any, r: any, idx: number) => (
                  <InputNumber
                    min={0}
                    style={{ width: '100%' }}
                    value={r.unitPrice}
                    onChange={(val) => {
                      const next = [...reorderLines];
                      next[idx] = { ...next[idx], unitPrice: Number(val || 0) };
                      setReorderLines(next);
                    }}
                  />
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* Hybrid 4-Month Advance Lead-Time & Monthly Usage Planning Parameters Modal */}
      <Modal
        centered
        width={screens.md ? 960 : '95vw'}
        title={
          <Space size={8}>
            <SlidersOutlined style={{ color: token.colorPrimary }} />
            <span>Import Lead-Time &amp; Monthly Usage Planning Parameters</span>
          </Space>
        }
        open={planningDrawerOpen}
        onCancel={() => setPlanningDrawerOpen(false)}
        footer={[
          <Button key="close" onClick={() => setPlanningDrawerOpen(false)}>
            Close
          </Button>,
          <Button
            key="save-all"
            type="primary"
            loading={savingAllPlanning}
            disabled={rows.every((r: any) => !r.itemId)}
            onClick={async () => {
              const validRows = rows.filter((r: any) => Boolean(r.itemId));
              if (validRows.length === 0) return;
              setSavingAllPlanning(true);
              try {
                await Promise.all(
                  validRows.map((r: any) =>
                    updateNipplePlanningConfig(r.itemId, {
                      manualMonthlyUsageGrs: r.manualMonthlyUsageGrs ?? null,
                      importLeadTimeMonths: Number(r.importLeadTimeMonths ?? 4),
                      safetyBufferMonths: Number(r.safetyBufferMonths ?? 1),
                    }),
                  ),
                );
                message.success(`Saved planning parameters for all ${validRows.length} Nipple items`);
                if (!isControlled) fetchLive();
              } catch (err: any) {
                message.error(err?.response?.data?.message || err?.message || 'Failed to save planning parameters');
              } finally {
                setSavingAllPlanning(false);
              }
            }}
          >
            Save All Parameters
          </Button>,
        ]}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 14, borderRadius: token.borderRadiusLG }}
          message="How 4-Month Advance Lead-Time Planning Works"
          description={
            <span style={{ fontSize: 12.5 }}>
              <strong>Manual Usage (GRS/Mo)</strong> overrides the automatic rolling 3-month sales average (leave blank
              for <strong>Auto</strong>). <strong>Lead Time + Safety Buffer</strong> sets your target survival horizon,
              recalculating <strong>Coverage Months</strong>, <strong>Projected Stockout Date</strong>, and{' '}
              <strong>Order Today (GRS)</strong> live.
            </span>
          }
        />
        <Table
          size="small"
          scroll={{ x: 840 }}
          rowKey={(r: any) => r.itemId || r.itemCode}
          pagination={false}
          dataSource={rows}
          columns={[
            {
              title: 'Nipple Item',
              key: 'item',
              width: 215,
              render: (_: any, r: any) => {
                const isManual = r.usageSource === 'MANUAL';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Space size={6}>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: token.colorText }}>{r.itemName}</span>
                      <Tag color={isManual ? 'purple' : 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
                        {isManual ? 'Manual' : 'Auto'}
                      </Tag>
                    </Space>
                    <div style={{ fontSize: 11, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      {r.itemCode} · Auto 3M Avg: <strong>{formatDecimal(r.monthlyAvgConsumption || 0, 0)}</strong> GRS/mo
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'Manual Usage (GRS/Mo)',
              key: 'manualUsage',
              width: 155,
              render: (_: any, r: any) => {
                const key = String(r.itemId || r.itemCode);
                return (
                  <InputNumber
                    min={0}
                    placeholder="Auto (3M Avg)"
                    style={{ width: '100%' }}
                    value={r.manualMonthlyUsageGrs ?? undefined}
                    onChange={(val) => {
                      setPlanningEdits((prev) => ({
                        ...prev,
                        [key]: {
                          manualMonthlyUsageGrs: val === null || val === undefined ? null : Number(val),
                          importLeadTimeMonths: prev[key]?.importLeadTimeMonths ?? Number(r.importLeadTimeMonths ?? 4),
                          safetyBufferMonths: prev[key]?.safetyBufferMonths ?? Number(r.safetyBufferMonths ?? 1),
                        },
                      }));
                    }}
                  />
                );
              },
            },
            {
              title: 'Lead (Mo)',
              key: 'lead',
              width: 90,
              align: 'center',
              render: (_: any, r: any) => {
                const key = String(r.itemId || r.itemCode);
                return (
                  <InputNumber
                    min={0.5}
                    max={24}
                    step={0.5}
                    style={{ width: '100%' }}
                    value={r.importLeadTimeMonths}
                    onChange={(val) => {
                      setPlanningEdits((prev) => ({
                        ...prev,
                        [key]: {
                          manualMonthlyUsageGrs:
                            prev[key]?.manualMonthlyUsageGrs !== undefined
                              ? prev[key].manualMonthlyUsageGrs
                              : r.manualMonthlyUsageGrs ?? null,
                          importLeadTimeMonths: Number(val || 4),
                          safetyBufferMonths: prev[key]?.safetyBufferMonths ?? Number(r.safetyBufferMonths ?? 1),
                        },
                      }));
                    }}
                  />
                );
              },
            },
            {
              title: 'Buffer (Mo)',
              key: 'buffer',
              width: 90,
              align: 'center',
              render: (_: any, r: any) => {
                const key = String(r.itemId || r.itemCode);
                return (
                  <InputNumber
                    min={0}
                    max={12}
                    step={0.5}
                    style={{ width: '100%' }}
                    value={r.safetyBufferMonths}
                    onChange={(val) => {
                      setPlanningEdits((prev) => ({
                        ...prev,
                        [key]: {
                          manualMonthlyUsageGrs:
                            prev[key]?.manualMonthlyUsageGrs !== undefined
                              ? prev[key].manualMonthlyUsageGrs
                              : r.manualMonthlyUsageGrs ?? null,
                          importLeadTimeMonths: prev[key]?.importLeadTimeMonths ?? Number(r.importLeadTimeMonths ?? 4),
                          safetyBufferMonths: Number(val ?? 1),
                        },
                      }));
                    }}
                  />
                );
              },
            },
            {
              title: 'Coverage & Stockout',
              key: 'coverage',
              width: 155,
              align: 'center',
              render: (_: any, r: any) => {
                const cov = Number(r.coverageMonths ?? 999);
                const leadM = Number(r.importLeadTimeMonths ?? 4);
                const isAtRisk = cov < leadM;
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                    <Tag color={isAtRisk ? 'red' : 'green'} style={{ margin: 0, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                      {cov >= 999 ? '999M Safe' : `${cov.toFixed(1)}M ${isAtRisk ? 'Risk' : 'Safe'}`}
                    </Tag>
                    <span style={{ fontSize: 10.5, color: token.colorTextSecondary, fontVariantNumeric: 'tabular-nums' }}>
                      Out: {r.projectedStockoutDate ? dayjs(r.projectedStockoutDate).format('DD MMM YY') : '—'}
                    </span>
                  </div>
                );
              },
            },
            {
              title: 'Order Today',
              key: 'orderToday',
              width: 115,
              align: 'right',
              render: (_: any, r: any) => {
                const qty = Number(r.orderTodayQty || 0);
                return (
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: 12.5,
                      fontVariantNumeric: 'tabular-nums',
                      color: qty > 0 ? token.colorError : token.colorSuccess,
                    }}
                  >
                    {qty > 0 ? `${formatDecimal(qty, 0)} GRS` : '0 GRS'}
                  </span>
                );
              },
            },
            {
              title: 'Action',
              key: 'save',
              width: 80,
              align: 'center',
              render: (_: any, r: any) => (
                <Button
                  size="small"
                  type="primary"
                  loading={savingPlanningId === r.itemId}
                  disabled={!r.itemId || savingAllPlanning}
                  onClick={async () => {
                    if (!r.itemId) return;
                    setSavingPlanningId(r.itemId);
                    try {
                      await updateNipplePlanningConfig(r.itemId, {
                        manualMonthlyUsageGrs: r.manualMonthlyUsageGrs ?? null,
                        importLeadTimeMonths: Number(r.importLeadTimeMonths ?? 4),
                        safetyBufferMonths: Number(r.safetyBufferMonths ?? 1),
                      });
                      message.success(`Saved planning config for ${r.itemCode}`);
                      if (!isControlled) fetchLive();
                    } catch (err: any) {
                      message.error(err?.response?.data?.message || err?.message || 'Failed to save planning config');
                    } finally {
                      setSavingPlanningId(null);
                    }
                  }}
                >
                  Save
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
};

export default NippleDemandStockBalanceCard;
