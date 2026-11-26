import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Table, Tag, Input, Select, Button, Spin, Empty, Tooltip,
  Progress, Row, Col, Statistic, Card, Tabs, Badge, Modal, theme,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined, UnorderedListOutlined,
  TrophyOutlined, ShoppingCartOutlined, RocketOutlined, BarChartOutlined,
  UserOutlined, TagOutlined, DollarOutlined, InboxOutlined,
  LeftOutlined, RightOutlined, RightCircleOutlined, ClockCircleOutlined, CheckCircleOutlined,
  FileTextOutlined, ArrowLeftOutlined, FolderOpenOutlined, ContainerOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import DraggableResizableModal from '../../components/shared/DraggableResizableModal';
import { matchesTabRefresh, tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import {
  AnalyticsUomBucket,
  DivisionOptionRecord,
  ItemMasterUomRecord,
  SPOKE_DIVISION_DEFAULT_ID,
  SafetyItemDetail,
  UomConversionRecord,
  buildItemMasterIndex,
  buildSafetyBufferDockSummary,
  buildSafetyItemMetrics,
  buildUnifiedItemRollupFromCustomers,
  canonicalizeSocKey,
  cleanDisplayNumber,
  convertGrossToExactPcsAndCartons,
  formatUomBreakdownDisplay,
  inferDivisionFromItemCode,
  isExplicitRealSocToken,
  isSpokeDivisionRecord,
  matchesDivisionFilter,
  normalizeUomCode,
  reconcileCustomerSocContracts,
  resolveBufferEntryMetrics,
  resolveDefaultAnalyticsDivision,
  resolveDivisionDefaultPackagingUnit,
  resolveDivisionPrimaryUom,
  resolveExactPcsPerCarton,
  splitItemDisplayName,
  summarizeUomBuckets,
  toPackagingShortCode,
} from './safetyStockBufferUtils';
import './CustomerAnalytics.css';

const { Option } = Select;

export type { SafetyItemDetail };

export interface SocItemDetail {
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
  orderedQtyRaw?: number;
  packedQtyRaw?: number;
  dispatchedQtyRaw?: number;
  totalPackedGross?: number;
  totalPackedCartons?: number;
  warehouseFgrGross?: number;
}

export interface SocContractSummary {
  orderId: string;
  socNumber: string;
  orderDate?: string;
  status: string;
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
  items: SocItemDetail[];
  isOfficialOrder?: boolean;
  primaryUom?: string;
  packagingUnitCode?: string;
}

interface CustomerStat {
  id: string;
  customerCode: string;
  name: string;
  customerType?: string;
  totalOrders: number;
  totalOrderedGross: number;
  totalPackedGross: number;
  totalPackedCartons: number;
  totalDispatchedGross: number;
  totalDispatchedCartons: number;
  totalOrderValue: number;
  pendingGross: number;
  fulfillmentPct: number;
  readyToDispatchGross: number;
  readyToDispatchCartons: number;
  topItem?: string;
  orderNumbers?: string[];
  lastOrderDate?: string;
  isSafetyStock?: boolean;
  safetyItems?: SafetyItemDetail[];
  socContracts?: SocContractSummary[];
  primaryUom?: string;
  packagingUnitCode?: string;
  isGrossUnit?: boolean;
  orderedUomBuckets?: AnalyticsUomBucket[];
  packedUomBuckets?: AnalyticsUomBucket[];
  dispatchedUomBuckets?: AnalyticsUomBucket[];
  readyUomBuckets?: AnalyticsUomBucket[];
  pendingUomBuckets?: AnalyticsUomBucket[];
}

export interface ItemCustomerRef {
  customerId: string;
  customerName: string;
  customerCode?: string;
}

export const STANDARD_FG_CATALOG = [
  { itemCode: 'SPI-FG-SPK-001', name: '250X17 INN / OUT Spoke Butted__225X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-002', name: '250X17 Inn / Out Spoke Butted__CD-250X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-003', name: '250X18 Inn / Out Spoke Butted__CD-250X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-004', name: '250*17 Inn / Out Spoke Straight__RM-250*17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-005', name: '250*18 Inn / Out Spoke Straight__RM-250*17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-007', name: '300X18 S9 Inn / Out Spoke Straight__125-S9 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-008', name: '125-300X17 Inn / Out Spoke Butted__125 - 300X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-009', name: '125-300X18 Inn / Out Spoke Butted__125 - 300X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-010', name: 'DS Front Inn / Out Spoke Straight__225X17 Nipple', packagingSize: 10 },
  { itemCode: 'SPI-FG-SPK-011', name: '300X17 S9 Inn / Out Spoke Straight (CS)__125-S9 Nipple (CS)', packagingSize: 10.556 },
  { itemCode: 'SPI-FG-SPK-012', name: 'RM Inn / Out Spoke Straight (CS)__RM-250*17 Nipple', packagingSize: 10.556 },
];

export const normKey = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const resolveFgItem = (
  rawCode: string,
  rawName: string
): { code: string; name: string; packagingSize?: number } => {
  const nc = normKey(rawCode);
  const nn = normKey(rawName);

  // Exact code match first
  if (nc) {
    const byCode = STANDARD_FG_CATALOG.find((std) => normKey(std.itemCode) === nc);
    if (byCode) return { code: byCode.itemCode, name: byCode.name, packagingSize: byCode.packagingSize };
  }

  // Name match with CS sensitivity
  const isCS =
    (rawCode + ' ' + rawName).toUpperCase().includes('(CS)') ||
    (rawCode + ' ' + rawName).toUpperCase().includes(' CS') ||
    nc.includes('011') ||
    nc.includes('012');

  for (const std of STANDARD_FG_CATALOG) {
    const stdIsCS = std.name.includes('(CS)');
    if (isCS !== stdIsCS) continue;

    const sn = normKey(std.name);
    if (nn && (nn === sn || nn.includes(sn) || sn.includes(nn))) {
      return { code: std.itemCode, name: std.name, packagingSize: std.packagingSize };
    }
  }

  return { code: rawCode || rawName, name: rawName || rawCode };
};

interface ItemStat {
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
  totalDispatchedGross?: number;
  totalDispatchedCartons?: number;
  undispatchedGross: number;
  undispatchedPieces: number;
  undispatchedCartons: number;
  undispatchedKgs: number;
  weightPerPiece: number;
  grossPerCarton: number;
  customerCount: number;
  customerNames: string[];
  customers: ItemCustomerRef[];
  primaryUom?: string;
  packagingUnitCode?: string;
  isGrossUnit?: boolean;
  orderedQtyRaw?: number;
  packedQtyRaw?: number;
  dispatchedQtyRaw?: number;
  totalPackedGross?: number;
  totalPackedCartons?: number;
  warehouseFgrGross?: number;
}

const CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX = 'customer_analytics_snapshot_v2_';
const CUSTOMER_ANALYTICS_MASTERS_KEY = 'customer_analytics_masters_v2';

function purgeLegacyAnalyticsSessionCache() {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith('erp_tab_session_customer_analytics_snapshot_v1_') ||
        k === 'erp_tab_session_customer_analytics_masters_v1'
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
  } catch {
    // Ignore storage access errors
  }
}

interface CustomerAnalyticsSnapshot {
  customers: CustomerStat[];
  itemStats: ItemStat[];
  safetyDivisions: DivisionOptionRecord[];
  safetyBatchesMeta: Array<{ divisionId?: string; divisionCode?: string }>;
  divisionOptions: DivisionOptionRecord[];
  fetchedAt: number;
}

interface CustomerAnalyticsMasters {
  divisionsRaw: DivisionOptionRecord[];
  uomConversionsList: UomConversionRecord[];
}

const FALLBACK_ANALYTICS_DIVISIONS: DivisionOptionRecord[] = [
  { id: SPOKE_DIVISION_DEFAULT_ID, divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
  { id: 'd1000000-0000-0000-0000-000000000002', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  { id: 'd1000000-0000-0000-0000-000000000005', divisionCode: 'DIV-005-WRD', name: 'WRD Division' },
];

interface ActionKpiCardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  actionText: string;
  onAction?: () => void;
  suffix?: string;
}

const ActionKpiCard: React.FC<ActionKpiCardProps> = ({
  value,
  label,
  icon,
  gradient,
  actionText,
  onAction,
  suffix,
}) => {
  const isCompactMulti = !suffix && typeof value === 'string' && value.includes('·');
  return (
    <div
      onClick={onAction}
      className="action-kpi-card"
      style={{ background: gradient, cursor: onAction ? 'pointer' : 'default' }}
    >
      <div className="action-kpi-body">
        <div
          className="action-kpi-val"
          style={isCompactMulti ? { fontSize: 15, lineHeight: 1.35 } : undefined}
        >
          {value}
          {suffix ? <span style={{ fontSize: 13, marginLeft: 4, opacity: 0.9 }}>{suffix}</span> : null}
        </div>
        <div className="action-kpi-label">{label}</div>
        <div className="action-kpi-watermark">{icon}</div>
      </div>
      <div className="action-kpi-footer">
        <span>{actionText}</span>
        <RightCircleOutlined style={{ fontSize: 13 }} />
      </div>
    </div>
  );
};

const COLORS = [
  '#6366f1', '#22d3ee', '#f59e0b', '#10b981', '#f43f5e',
  '#8b5cf6', '#0ea5e9', '#84cc16', '#fb923c', '#e879f9',
  '#06b6d4', '#14b8a6',
];

export const getFulfillmentColor = (pct: number) => {
  if (pct >= 100) return '#10b981'; // Green (100% Completed / Packed)
  if (pct >= 75) return '#0ea5e9'; // Cyan / Sky
  if (pct >= 50) return '#f59e0b'; // Amber / Gold
  if (pct > 0) return '#f97316'; // Orange
  return '#ef4444'; // Red (0% Unfulfilled / Pending)
};

interface PackedEntryInfo {
  id: string;
  customerName: string;
  socNo: string;
  cartons: number;
  gross: number;
  pcs: number;
  baseQty: number;
  salesQty: number;
  packagingQty: number;
  baseUomCode: string;
  salesUomCode: string;
  packagingType?: string;
  packagingUnit?: string;
  packagingUnitCode: string;
  packagingSize: number;
  hasGrossUom: boolean;
  divisionId?: string;
  divisionCode?: string;
  divisionName?: string;
  fgItemName?: string;
  fgItemCode?: string;
  date?: string;
  isSafetyStock: boolean;
}

interface BufferMasterContext {
  itemMasterMap: Map<string, ItemMasterUomRecord>;
  uomConversions: UomConversionRecord[];
  divisions: DivisionOptionRecord[];
}

function parsePackingEntry(e: any, masterCtx?: BufferMasterContext): PackedEntryInfo | null {
  if (!e) return null;
  const rem = String(e.remarks || '');
  const machineNo = String(e.machineNo || e.machine_no || '');
  if (!rem.includes('[HAND PACKING]') && !machineNo.toUpperCase().startsWith('HAND-PACK')) return null;

  // Exclude pending-nipple batches (WITHOUT_NIPPLE): they are NOT ready Finished Goods in FG Dispatch Warehouse
  const packingMode = String(e.packingMode || e.packing_mode || '').toUpperCase().trim();
  if (packingMode === 'WITHOUT_NIPPLE' || (!packingMode && rem.toUpperCase().includes('WITHOUT_NIPPLE'))) {
    return null;
  }

  const custMatch = rem.match(/Customer:\s*([^|—\n]+)/i);
  const socMatch = rem.match(/SOC:\s*([^|—\n]+)/i);
  const divCodeMatch = rem.match(/DivCode:\s*([^|—\n]+)/i);
  const divNameMatch = rem.match(/Division:\s*([^|—\n]+)/i);
  const qtyMatch = rem.match(/Cartons:\s*([\d.]+)\s*\(([\d.]+)\s*Gross(?:\s*\/\s*([\d.]+)\s*PCS)?/i) ||
                   rem.match(/Total:\s*([\d.]+)\s*Cartons\s*\(([\d.]+)\s*Gross/i);
  const ctnOnlyMatch = rem.match(/Cartons:\s*([\d.]+)/i) || rem.match(/\[([\d.]+)\s*CTN/i);
  const grossOnlyMatch = rem.match(/\(([\d.]+)\s*Gross/i) || rem.match(/Gross:\s*([\d.]+)/i) || rem.match(/([\d.]+)\s*GRS/i);

  const rawQty = Number(e.actualQuantity || e.actual_quantity || 0);
  const fallbackPcs = qtyMatch && qtyMatch[3] ? parseFloat(qtyMatch[3]) : (qtyMatch ? parseFloat(qtyMatch[2]) * 144 : 0);
  const effectiveRawQty = rawQty > 0 ? rawQty : fallbackPcs;
  const legacyCartons = qtyMatch ? parseFloat(qtyMatch[1]) : (ctnOnlyMatch ? parseFloat(ctnOnlyMatch[1]) : 0);
  const legacyGross = qtyMatch ? parseFloat(qtyMatch[2]) : (grossOnlyMatch ? parseFloat(grossOnlyMatch[1]) : 0);

  let custName = custMatch ? custMatch[1].trim() : '';
  let socNo = socMatch ? socMatch[1].trim() : '';

  const isShiftedFromSafety =
    rem.toUpperCase().includes('SHIFTED FROM SAFETY') ||
    rem.toUpperCase().includes('ALLOCATED FROM SAFETY');

  const isSafetyStock =
    !isShiftedFromSafety &&
    (custName.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
     socNo.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
     rem.toUpperCase().includes('CUSTOMER: SAFETY') ||
     rem.toUpperCase().includes('SOC: SAFETY_STOCK'));

  if (isSafetyStock) {
    custName = 'SAFETY STOCK';
    socNo = 'SAFETY_STOCK';
  }

  const itemObj = e.item || (Array.isArray(e.items) && e.items[0]) || {};
  let rawCode = itemObj.itemCode || itemObj.item_code || e.itemCode || e.item_code || '';
  let rawName = itemObj.name || itemObj.itemName || itemObj.item_name || e.itemName || e.item_name || '';

  if (!rawCode) {
    const codeMatch = rem.match(/SPI-FG-[A-Z0-9-]+/i) || rem.match(/CCD-FGR-[A-Z0-9-]+/i) || rem.match(/FG-[A-Z0-9-]+/i);
    if (codeMatch) rawCode = codeMatch[0];
  }

  const resolved = resolveFgItem(rawCode, rawName);
  const fgCode = resolved.code || rawCode;
  const fgName = resolved.name || rawName;
  const uomFromEntry = e.uom?.code || e.uom?.symbol || e.uomCode || '';

  const metrics = resolveBufferEntryMetrics({
    itemCode: fgCode,
    itemName: fgName,
    rawQuantity: effectiveRawQty,
    entryUomCode: uomFromEntry,
    entryDivisionId: e.divisionId || e.division_id || itemObj.divisionId,
    entryDivisionCode: divCodeMatch ? divCodeMatch[1].trim() : e.division?.divisionCode,
    entryDivisionName: divNameMatch ? divNameMatch[1].trim() : e.division?.name,
    legacyCartons,
    legacyGross,
    itemMasterMap: masterCtx?.itemMasterMap || new Map(),
    uomConversions: masterCtx?.uomConversions || [],
    divisions: masterCtx?.divisions || [],
  });

  return {
    id: String(e.id),
    customerName: custName,
    socNo,
    cartons: metrics.cartons,
    gross: metrics.gross,
    pcs: metrics.pcs,
    baseQty: metrics.baseQty,
    salesQty: metrics.salesQty,
    packagingQty: metrics.packagingQty,
    baseUomCode: metrics.baseUomCode,
    salesUomCode: metrics.salesUomCode,
    packagingType: metrics.packagingType,
    packagingUnit: metrics.packagingUnit,
    packagingUnitCode: metrics.packagingUnitCode,
    packagingSize: metrics.packagingSize,
    hasGrossUom: metrics.hasGrossUom,
    divisionId: metrics.divisionId,
    divisionCode: metrics.divisionCode,
    divisionName: metrics.divisionName,
    fgItemName: fgName,
    fgItemCode: fgCode,
    date: e.entryDate || e.entry_date || e.createdAt,
    isSafetyStock,
  };
}

function parseOpenStockEntry(os: any, masterCtx?: BufferMasterContext): PackedEntryInfo | null {
  if (!os) return null;
  const dir = String(os.direction || '').toUpperCase().trim();
  const txType = String(os.transactionType || '').toUpperCase().trim();
  const refType = String(os.referenceType || '').toUpperCase().trim();
  if (dir === 'OUT' || txType.includes('REVERSAL') || refType === 'PRODUCTION_STOCK_ADJUSTMENT') {
    return null;
  }
  if (txType && txType !== 'OPENING') {
    return null;
  }
  const itemType = String(os.itemType || os.item?.itemType || '').toUpperCase().trim();
  if (itemType && itemType !== 'FINISHED_GOOD' && itemType !== 'FINISHED_GOODS') {
    return null;
  }
  const notes = String(os.notes || '');
  const whCode = String(os.warehouseCode || os.warehouse?.warehouseCode || '').toUpperCase().trim();
  if (whCode && !whCode.includes('FGDW') && !whCode.includes('FG-')) {
    const notesUpper = notes.toUpperCase();
    if (!notesUpper.includes('CUSTOMER:') && !notesUpper.includes('SOC:')) {
      return null;
    }
  }
  const custMatch = notes.match(/Customer:\s*([^|\]]+)/i);
  const socMatch = notes.match(/SOC:\s*([^|\]]+)/i);
  const ctnMatch = notes.match(/Cartons:\s*([\d.]+)/i) || notes.match(/\[([\d.]+)\s*CTN/i);
  const grossMatch = notes.match(/Gross:\s*([\d.]+)/i) || notes.match(/([\d.]+)\s*GRS/i);

  const rawQty = Number(os.quantity || 0);
  if (rawQty <= 0) return null;
  const legacyCartons = ctnMatch ? Number(ctnMatch[1]) : 0;
  const legacyGross = grossMatch ? Number(grossMatch[1]) : 0;

  let custName = custMatch ? custMatch[1].trim() : (os.customerName || 'General Stock');
  let socNo = socMatch ? socMatch[1].trim() : (os.socNo || '—');

  const isShiftedFromSafety =
    notes.toUpperCase().includes('SHIFTED FROM SAFETY') ||
    notes.toUpperCase().includes('ALLOCATED FROM SAFETY');

  const isSafetyStock =
    !isShiftedFromSafety &&
    (custName.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
     socNo.toUpperCase().replace(/[\s_-]+/g, '') === 'SAFETYSTOCK' ||
     notes.toUpperCase().includes('CUSTOMER: SAFETY') ||
     notes.toUpperCase().includes('SOC: SAFETY'));

  if (isSafetyStock) {
    custName = 'SAFETY STOCK';
    socNo = 'SAFETY_STOCK';
  }

  const rawCode = os.itemCode || os.item?.itemCode || '';
  const rawName = os.itemName || os.item?.name || '';
  const resolved = resolveFgItem(rawCode, rawName);
  const fgCode = resolved.code || rawCode;
  const fgName = resolved.name || rawName;
  const uomFromEntry = os.uomCode || os.uomSymbol || os.uom?.code || '';

  const metrics = resolveBufferEntryMetrics({
    itemCode: fgCode,
    itemName: fgName,
    rawQuantity: rawQty,
    entryUomCode: uomFromEntry,
    entryDivisionId: os.divisionId || os.item?.divisionId,
    entryDivisionCode: os.divisionCode,
    entryDivisionName: os.divisionName,
    legacyCartons,
    legacyGross,
    itemMasterMap: masterCtx?.itemMasterMap || new Map(),
    uomConversions: masterCtx?.uomConversions || [],
    divisions: masterCtx?.divisions || [],
  });

  return {
    id: String(os.id),
    customerName: custName,
    socNo,
    cartons: metrics.cartons,
    gross: metrics.gross,
    pcs: metrics.pcs,
    baseQty: metrics.baseQty,
    salesQty: metrics.salesQty,
    packagingQty: metrics.packagingQty,
    baseUomCode: metrics.baseUomCode,
    salesUomCode: metrics.salesUomCode,
    packagingType: metrics.packagingType,
    packagingUnit: metrics.packagingUnit,
    packagingUnitCode: metrics.packagingUnitCode,
    packagingSize: metrics.packagingSize,
    hasGrossUom: metrics.hasGrossUom,
    divisionId: metrics.divisionId,
    divisionCode: metrics.divisionCode,
    divisionName: metrics.divisionName,
    fgItemName: fgName,
    fgItemCode: fgCode,
    date: os.transactionDate || os.createdAt,
    isSafetyStock,
  };
}

const fmtNum = (n: number, dec = 0) =>
  n === undefined || n === null || isNaN(n)
    ? '—'
    : n.toLocaleString('en-PK', { maximumFractionDigits: dec, minimumFractionDigits: dec });

function getCustomerDisplayName(c: any): string {
  if (!c) return '';
  const raw = c.companyName || c.company_name || c.name || c.customerName || c.customer_name || c.contactPerson || c.contact_person;
  if (typeof raw === 'string' && raw.trim() && raw.trim().toLowerCase() !== 'unknown') {
    return raw.trim();
  }
  return '';
}

function getCustomerDisplayCode(c: any): string {
  if (!c) return '';
  const raw = c.customerCode || c.customer_code || c.code;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return '';
}

const CustomerAnalytics: React.FC = () => {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const [selectedDivisionId, setSelectedDivisionId] = useState<string>(SPOKE_DIVISION_DEFAULT_ID);
  const initialSnapshot = useMemo(() => {
    purgeLegacyAnalyticsSessionCache();
    return tabSessionCache.get<CustomerAnalyticsSnapshot>(
      `${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${SPOKE_DIVISION_DEFAULT_ID}`,
    );
  }, []);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'orders' | 'dispatched' | 'packed' | 'value' | 'pending' | 'ready'>('dispatched');
  const [chartView, setChartView] = useState<'customers' | 'items'>('customers');
  const [customerPage, setCustomerPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerStat[]>(initialSnapshot?.customers || []);
  const [itemStats, setItemStats] = useState<ItemStat[]>(initialSnapshot?.itemStats || []);
  const [safetyDivisions, setSafetyDivisions] = useState<DivisionOptionRecord[]>(
    initialSnapshot?.safetyDivisions || FALLBACK_ANALYTICS_DIVISIONS,
  );
  const [safetyBatchesMeta, setSafetyBatchesMeta] = useState<Array<{ divisionId?: string; divisionCode?: string }>>(
    initialSnapshot?.safetyBatchesMeta || [],
  );
  const [divisionOptions, setDivisionOptions] = useState<DivisionOptionRecord[]>(
    initialSnapshot?.divisionOptions || FALLBACK_ANALYTICS_DIVISIONS,
  );
  const [activeTab, setActiveTab] = useState<'pending' | 'done' | 'all' | 'items'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedSocNumber, setSelectedSocNumber] = useState<string | null>(null);
  const loadedDivisionRef = useRef<string | null>(initialSnapshot ? SPOKE_DIVISION_DEFAULT_ID : null);

  const selectedDivisionObj = useMemo(() => {
    if (!selectedDivisionId || selectedDivisionId === 'ALL') return null;
    return (
      divisionOptions.find(
        (d) => d.id === selectedDivisionId || d.divisionCode === selectedDivisionId,
      ) ||
      safetyDivisions.find(
        (d) => d.id === selectedDivisionId || d.divisionCode === selectedDivisionId,
      ) ||
      null
    );
  }, [selectedDivisionId, divisionOptions, safetyDivisions]);

  const activeDivisionUnitFallback = useMemo(() => {
    if (!selectedDivisionId || selectedDivisionId === 'ALL') return '';
    return resolveDivisionPrimaryUom(selectedDivisionObj) || 'GRS';
  }, [selectedDivisionId, selectedDivisionObj]);

  const isSpokeActive = useMemo(() => {
    if (selectedDivisionId === 'ALL') return false;
    return isSpokeDivisionRecord(selectedDivisionObj) || selectedDivisionId === SPOKE_DIVISION_DEFAULT_ID;
  }, [selectedDivisionId, selectedDivisionObj]);

  const evictAllAnalyticsSnapshots = useCallback(() => {
    purgeLegacyAnalyticsSessionCache();
    tabSessionCache.remove(CUSTOMER_ANALYTICS_MASTERS_KEY);
    tabSessionCache.remove(`${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}ALL`);
    tabSessionCache.remove(`${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${SPOKE_DIVISION_DEFAULT_ID}`);
    for (const d of divisionOptions) {
      if (d.id) tabSessionCache.remove(`${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${d.id}`);
      if (d.divisionCode) tabSessionCache.remove(`${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${d.divisionCode}`);
    }
    for (const d of FALLBACK_ANALYTICS_DIVISIONS) {
      tabSessionCache.remove(`${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${d.id}`);
    }
  }, [divisionOptions]);

  const openCustomerSocModal = useCallback((c: CustomerStat) => {
    setSelectedCustomerId(c.id);
    setSelectedSocNumber(null);
  }, []);

  const closeCustomerSocModal = useCallback(() => {
    setSelectedCustomerId(null);
    setSelectedSocNumber(null);
  }, []);

  const openCustomerByNameOrRef = useCallback(
    (refOrName: ItemCustomerRef | string) => {
      const targetId = typeof refOrName === 'object' ? refOrName.customerId : '';
      const targetName = (typeof refOrName === 'object' ? refOrName.customerName : refOrName)
        .trim()
        .toLowerCase();

      const found =
        (targetId ? customers.find((c) => c.id === targetId && !c.isSafetyStock) : undefined) ||
        customers.find(
          (c) =>
            !c.isSafetyStock &&
            (c.name.trim().toLowerCase() === targetName ||
              c.name.trim().toLowerCase().includes(targetName) ||
              targetName.includes(c.name.trim().toLowerCase()))
        );

      if (found) {
        openCustomerSocModal(found);
      }
    },
    [customers, openCustomerSocModal]
  );

  const loadData = useCallback(async (targetDivisionId?: string, forceRefresh = false) => {
    const activeDivId = targetDivisionId || selectedDivisionId || SPOKE_DIVISION_DEFAULT_ID;
    const isAllDiv = activeDivId === 'ALL';
    const snapKey = `${CUSTOMER_ANALYTICS_SNAPSHOT_PREFIX}${activeDivId}`;

    if (!forceRefresh) {
      const cachedSnap = tabSessionCache.get<CustomerAnalyticsSnapshot>(snapKey);
      if (cachedSnap) {
        setCustomers(cachedSnap.customers);
        setItemStats(cachedSnap.itemStats);
        if (cachedSnap.safetyDivisions?.length) setSafetyDivisions(cachedSnap.safetyDivisions);
        setSafetyBatchesMeta(cachedSnap.safetyBatchesMeta || []);
        if (cachedSnap.divisionOptions?.length) setDivisionOptions(cachedSnap.divisionOptions);
        loadedDivisionRef.current = activeDivId;
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    try {
      const divParam = isAllDiv ? '' : `&divisionId=${encodeURIComponent(activeDivId)}`;
      const divOnlyParam = isAllDiv ? '' : `?divisionId=${encodeURIComponent(activeDivId)}`;
      const cachedMasters = !forceRefresh
        ? tabSessionCache.get<CustomerAnalyticsMasters>(CUSTOMER_ANALYTICS_MASTERS_KEY)
        : undefined;

      // Fetch strictly division-scoped transactional data + cached master lookups in parallel
      const [
        ordersRes,
        deliveriesRes,
        salesCustRes,
        masterCustRes,
        prodRes,
        openStockRes,
        matrixRes,
        prodItemsRes,
        divisionsRes,
        uomConvRes,
      ] = await Promise.allSettled([
        apiService.get(`/sales/orders?limit=500&status=all${divParam}`),
        apiService.get(`/sales/deliveries?limit=500&status=all${divParam}`),
        apiService.get(`/sales/orders/meta/customers${divOnlyParam}`),
        apiService.get(`/customer/customers?limit=500${divParam}`),
        apiService.get(`/production/entries?machineNo=HAND-PACK&limit=500&allDates=true${divParam}`),
        apiService.get(`/production/open-stock/history?limit=200${divParam}`),
        apiService.get(`/production/open-stock/matrix${divOnlyParam}`),
        apiService.get(`/production/open-stock/items${divOnlyParam}`),
        cachedMasters?.divisionsRaw?.length
          ? Promise.resolve({ data: cachedMasters.divisionsRaw })
          : apiService.get('/divisions?limit=200&status=ACTIVE'),
        Array.isArray(cachedMasters?.uomConversionsList)
          ? Promise.resolve({ data: cachedMasters.uomConversionsList })
          : apiService.get('/master-data/uom-conversions?limit=500'),
      ]);

      const unwrapList = (res: PromiseSettledResult<any>): any[] => {
        if (res.status !== 'fulfilled') return [];
        const payload = (res.value as any)?.data?.data ?? (res.value as any)?.data ?? res.value;
        return Array.isArray(payload) ? payload : [];
      };

      const rawOrders: any[] = ordersRes.status === 'fulfilled'
        ? ((ordersRes.value as any)?.data?.data || (ordersRes.value as any)?.data || [])
        : [];
      const rawDeliveries: any[] = deliveriesRes.status === 'fulfilled'
        ? ((deliveriesRes.value as any)?.data?.data || (deliveriesRes.value as any)?.data || [])
        : [];

      const salesCustList: any[] = salesCustRes.status === 'fulfilled'
        ? ((salesCustRes.value as any)?.data?.data || (salesCustRes.value as any)?.data || [])
        : [];
      const masterCustList: any[] = unwrapList(masterCustRes);
      const prodEntries: any[] = unwrapList(prodRes);
      const openStockEntries: any[] = unwrapList(openStockRes);
      const matrixRows: any[] = unwrapList(matrixRes);
      const prodItemsList: any[] = unwrapList(prodItemsRes);
      const divisionsRaw: DivisionOptionRecord[] = unwrapList(divisionsRes);
      const uomConversionsList: UomConversionRecord[] = unwrapList(uomConvRes);

      if (divisionsRaw.length > 0 && (uomConvRes.status === 'fulfilled' || Array.isArray(cachedMasters?.uomConversionsList))) {
        tabSessionCache.set<CustomerAnalyticsMasters>(CUSTOMER_ANALYTICS_MASTERS_KEY, {
          divisionsRaw,
          uomConversionsList,
        });
      }

      const resolveRecordDivision = (rec: any) => {
        const dId = rec?.divisionId || rec?.division_id || rec?.division?.id || rec?.salesOrder?.divisionId || rec?.salesOrder?.division?.id;
        const dCode = rec?.divisionCode || rec?.division_code || rec?.division?.divisionCode || rec?.salesOrder?.division?.divisionCode;
        const dName = rec?.divisionName || rec?.division_name || rec?.division?.name || rec?.salesOrder?.division?.name;
        return { divisionId: dId, divisionCode: dCode, divisionName: dName };
      };

      // Track excluded uncommitted orders (DRAFT, CANCELLED, VOID) canonically so explicit
      // deliveries or hand-packing batches tagged to them NEVER leak into committed orders.
      const excludedSocKeys = new Set<string>();
      const excludedOrderIds = new Set<string>();
      for (const o of rawOrders) {
        if (!o) continue;
        const st = String(o.status || '').toUpperCase().trim();
        if (st === 'DRAFT' || st === 'CANCELLED' || st === 'VOID') {
          if (o.id) excludedOrderIds.add(String(o.id));
          const oNum = String(o.orderNumber || o.order_number || o.socNumber || '');
          const cKey = canonicalizeSocKey(oNum);
          if (cKey) excludedSocKeys.add(cKey);
        }
      }

      // Exclude uncommitted orders (DRAFT, CANCELLED, VOID) and enforce division filter safety belt
      const isCommittedOrder = (o: any) => {
        if (!o) return false;
        const s = String(o.status || '').toUpperCase().trim();
        if (s === 'DRAFT' || s === 'CANCELLED' || s === 'VOID') return false;
        if (!isAllDiv) {
          const recDiv = resolveRecordDivision(o);
          if (recDiv.divisionId || recDiv.divisionCode || recDiv.divisionName) {
            return matchesDivisionFilter(recDiv, activeDivId, divisionsRaw);
          }
        }
        return true;
      };
      const orders: any[] = rawOrders.filter(isCommittedOrder);

      // Strictly keep CONFIRMED / DELIVERED / SHIPPED deliveries (exclude CANCELLED, DRAFT, VOID & deliveries for excluded orders)
      const deliveries: any[] = rawDeliveries.filter((d: any) => {
        if (!d) return false;
        const s = String(d.status || '').toUpperCase().trim();
        if (s === 'CANCELLED' || s === 'DRAFT' || s === 'VOID') return false;
        const dOrderId = String(d.salesOrderId || d.sales_order_id || d.salesOrder?.id || '');
        if (dOrderId && excludedOrderIds.has(dOrderId)) return false;
        const dSocNo = canonicalizeSocKey(
          d.salesOrderNumber || d.sales_order_number || d.salesOrder?.orderNumber || d.salesOrder?.order_number || ''
        );
        if (dSocNo && excludedSocKeys.has(dSocNo)) return false;
        if (!isAllDiv) {
          const recDiv = resolveRecordDivision(d);
          if (recDiv.divisionId || recDiv.divisionCode || recDiv.divisionName) {
            return matchesDivisionFilter(recDiv, activeDivId, divisionsRaw);
          }
        }
        return true;
      });
      const itemMasterMap = buildItemMasterIndex(prodItemsList, divisionsRaw);
      const bufferMasterCtx: BufferMasterContext = {
        itemMasterMap,
        uomConversions: uomConversionsList,
        divisions: divisionsRaw,
      };
      const activeDivisionMeta = isAllDiv
        ? null
        : divisionsRaw.find((d) => d.id === activeDivId || d.divisionCode === activeDivId) ||
          FALLBACK_ANALYTICS_DIVISIONS.find((d) => d.id === activeDivId || d.divisionCode === activeDivId) ||
          null;
      const isActiveSpokeDiv = isAllDiv ? true : isSpokeDivisionRecord(activeDivisionMeta);

      // Build customer directory mapping ID and code to real genuine names
      const customerDirectory = new Map<string, { id: string; name: string; code: string; type: string }>();

      const registerToDirectory = (c: any) => {
        if (!c) return;
        const id = c.id || c.customerId || c.customer_id;
        const name = getCustomerDisplayName(c);
        const code = getCustomerDisplayCode(c);
        const type = c.customerType || c.customer_type || 'B2B';
        if (id) {
          const prev = customerDirectory.get(id);
          customerDirectory.set(id, {
            id,
            name: name || prev?.name || (code ? `Customer (${code})` : 'Customer'),
            code: code || prev?.code || '',
            type: type || prev?.type || 'B2B',
          });
        }
        if (code && !customerDirectory.has(code)) {
          customerDirectory.set(code, {
            id: id || code,
            name: name || `Customer (${code})`,
            code,
            type,
          });
        }
      };

      salesCustList.forEach(registerToDirectory);
      masterCustList.forEach(registerToDirectory);
      orders.forEach((o) => { if (o.customer) registerToDirectory(o.customer); });
      deliveries.forEach((d) => { if (d.customer) registerToDirectory(d.customer); });

      // Build customer map from orders and track per-customer SOC contracts
      const custMap = new Map<string, CustomerStat>();
      const custSocMap = new Map<string, SocContractSummary[]>();

      const resolveItemPackSpec = (
        code: string,
        name: string,
        hintPkgSize?: number,
        hintUomCode?: string,
        hintDiv?: { id?: string; divisionCode?: string; name?: string } | null,
      ) => {
        const resolved = resolveFgItem(code, name);
        const master =
          itemMasterMap.get(normKey(resolved.code)) ||
          itemMasterMap.get(normKey(code)) ||
          itemMasterMap.get(normKey(resolved.name)) ||
          itemMasterMap.get(normKey(name));
        const inferredDiv = inferDivisionFromItemCode(resolved.code || code, divisionsRaw);
        const effectiveDiv =
          hintDiv?.id || hintDiv?.divisionCode
            ? hintDiv
            : master?.divisionId || master?.divisionCode
            ? { id: master.divisionId, divisionCode: master.divisionCode, name: master.divisionName }
            : inferredDiv;
        const rawUomHint = normalizeUomCode(hintUomCode);
        const primaryUom = normalizeUomCode(
          rawUomHint ||
            master?.salesUomCode ||
            master?.baseUomCode ||
            resolveDivisionPrimaryUom(effectiveDiv) ||
            resolveDivisionPrimaryUom(activeDivisionMeta) ||
            'GRS',
        );
        const isGrossUnit =
          primaryUom === 'GRS' ||
          (primaryUom === 'PCS' && (!master || master.salesUomCode === 'GRS'));
        const packagingUnitCode = isGrossUnit
          ? 'CTN'
          : toPackagingShortCode(master?.packagingUnit, master?.packagingType) ||
            resolveDivisionDefaultPackagingUnit(effectiveDiv);
        const grossPerCarton =
          (Number(hintPkgSize) > 0 ? Number(hintPkgSize) : 0) ||
          (master?.packagingSize && master.packagingSize > 0 ? master.packagingSize : 0) ||
          (isGrossUnit ? resolved.packagingSize || 10 : 0);
        const pcsPerCarton = isGrossUnit
          ? resolveExactPcsPerCarton(grossPerCarton, resolved.code, resolved.name)
          : 0;
        return { resolved, grossPerCarton, pcsPerCarton, primaryUom, packagingUnitCode, isGrossUnit, master, effectiveDiv };
      };

      const findOrCreateSocItem = (
        soc: SocContractSummary,
        code: string,
        name: string,
        hintPkgSize?: number,
        hintUomCode?: string,
        hintDiv?: { id?: string; divisionCode?: string; name?: string } | null,
      ): SocItemDetail => {
        const { resolved, grossPerCarton, pcsPerCarton, primaryUom, packagingUnitCode, isGrossUnit } =
          resolveItemPackSpec(code, name, hintPkgSize, hintUomCode, hintDiv);
        const nResolvedCode = normKey(resolved.code);
        let found = soc.items.find((it) => {
          const itRes = resolveFgItem(it.itemCode, it.itemName);
          return normKey(itRes.code) === nResolvedCode;
        });
        if (!found) {
          found = {
            key: `${soc.socNumber}-${resolved.code || resolved.name || soc.items.length + 1}`,
            itemCode: resolved.code || 'FG-ITEM',
            itemName: resolved.name || resolved.code || 'Finished Goods Item',
            orderedQty: 0,
            orderedPcs: 0,
            orderedCartons: 0,
            packedQty: 0,
            packedPcs: 0,
            packedCartons: 0,
            dispatchedQty: 0,
            dispatchedPcs: 0,
            dispatchedCartons: 0,
            readyToDispatchQty: 0,
            readyToDispatchPcs: 0,
            readyToDispatchCartons: 0,
            remainingPendingQty: 0,
            remainingPendingPcs: 0,
            remainingPendingCartons: 0,
            toPackQty: 0,
            toPackPcs: 0,
            toPackCartons: 0,
            pcsPerCarton,
            grossPerCarton,
            fulfillmentPct: 0,
            primaryUom,
            packagingUnitCode,
            isGrossUnit,
            orderedQtyRaw: 0,
            packedQtyRaw: 0,
            dispatchedQtyRaw: 0,
          };
          soc.items.push(found);
          if (!soc.primaryUom) soc.primaryUom = primaryUom;
          if (!soc.packagingUnitCode) soc.packagingUnitCode = packagingUnitCode;
        } else if (hintPkgSize && hintPkgSize > 0 && found.grossPerCarton !== hintPkgSize) {
          found.grossPerCarton = grossPerCarton;
          found.pcsPerCarton = pcsPerCarton;
        }
        return found;
      };

      for (const order of orders) {
        const custId = order.customerId || order.customer_id || order.customer?.id;
        if (!custId) continue;

        const info = customerDirectory.get(custId) ||
          (order.customer ? {
            id: custId,
            name: getCustomerDisplayName(order.customer),
            code: getCustomerDisplayCode(order.customer),
            type: order.customer?.customerType || 'B2B',
          } : null);

        const custCode = info?.code || getCustomerDisplayCode(order.customer) || '';
        const custName = info?.name || getCustomerDisplayName(order.customer) || (custCode ? `Customer (${custCode})` : 'Customer');
        const custType = info?.type || order.customer?.customerType || 'B2B';
        const orderNo = String(order.orderNumber || order.order_number || order.socNumber || order.id || '');
        const orderDate = order.orderDate || order.order_date || order.createdAt;

        if (!custMap.has(custId)) {
          custMap.set(custId, {
            id: custId,
            customerCode: custCode,
            name: custName,
            customerType: custType,
            totalOrders: 0,
            totalOrderedGross: 0,
            totalDispatchedGross: 0,
            totalDispatchedCartons: 0,
            totalOrderValue: 0,
            pendingGross: 0,
            fulfillmentPct: 0,
            readyToDispatchGross: 0,
            readyToDispatchCartons: 0,
            totalPackedGross: 0,
            totalPackedCartons: 0,
            topItem: '',
            orderNumbers: [],
            lastOrderDate: orderDate,
            socContracts: [],
          });
        }

        const stat = custMap.get(custId)!;
        stat.totalOrders += 1;
        if (orderNo && !stat.orderNumbers?.includes(orderNo)) stat.orderNumbers?.push(orderNo);
        if (orderDate && (!stat.lastOrderDate || orderDate > stat.lastOrderDate)) {
          stat.lastOrderDate = orderDate;
        }

        if (!custSocMap.has(custId)) {
          custSocMap.set(custId, []);
        }
        const custSocs = custSocMap.get(custId)!;
        const socNumberLabel = orderNo || `SOC-${custSocs.length + 1}`;
        let socEntry = custSocs.find(
          (s) =>
            (order.id && s.orderId === String(order.id)) ||
            (canonicalizeSocKey(socNumberLabel) &&
              canonicalizeSocKey(s.socNumber) === canonicalizeSocKey(socNumberLabel)) ||
            normKey(s.socNumber) === normKey(socNumberLabel)
        );
        if (!socEntry) {
          socEntry = {
            orderId: String(order.id || socNumberLabel),
            socNumber: socNumberLabel,
            orderDate,
            status: String(order.status || 'ACTIVE').toUpperCase(),
            totalOrderedQty: 0,
            totalOrderedPcs: 0,
            totalOrderedCartons: 0,
            totalPackedQty: 0,
            totalPackedPcs: 0,
            totalPackedCartons: 0,
            totalDispatchedQty: 0,
            totalDispatchedPcs: 0,
            totalDispatchedCartons: 0,
            totalReadyToDispatchQty: 0,
            totalReadyToDispatchPcs: 0,
            totalReadyToDispatchCartons: 0,
            totalPendingQty: 0,
            totalPendingPcs: 0,
            totalPendingCartons: 0,
            totalToPackQty: 0,
            totalToPackPcs: 0,
            totalToPackCartons: 0,
            fulfillmentPct: 0,
            items: [],
            isOfficialOrder: true,
          };
          custSocs.push(socEntry);
        }

        // Sum order items
        const items = order.items || order.orderItems || order.lines || [];
        const orderDiv = order.division || (order.divisionId ? { id: order.divisionId, divisionCode: order.divisionCode, name: order.divisionName } : null);
        for (const item of items) {
          const itemObj = item.item || {};
          const code = itemObj.itemCode || item.itemCode || item.item_code || '';
          const name = itemObj.name || item.description || item.itemName || item.item_name || code || 'Item';
          const qty = Number(item.quantity || item.qty || 0);
          const hintPkgSize = Number(itemObj.packagingSize || item.packageQuantity || item.packagingSize || 0);
          const lineUom = item.uom?.code || item.uom?.symbol || item.uomCode || itemObj.salesUom?.code || itemObj.baseUom?.code;
          const lineTotal = Number(item.lineTotal || item.line_total || (qty * Number(item.unitPrice || item.unit_price || 0)));

          const socItem = findOrCreateSocItem(socEntry, code, name, hintPkgSize, lineUom, orderDiv);
          if (socItem.isGrossUnit) {
            const exactOrd = convertGrossToExactPcsAndCartons(qty, socItem.grossPerCarton, socItem.itemCode, socItem.itemName);
            stat.totalOrderedGross += qty;
            socItem.orderedQty += qty;
            socItem.orderedPcs += exactOrd.pcs;
            socItem.orderedQtyRaw = (socItem.orderedQtyRaw || 0) + qty;
          } else {
            stat.totalOrderedGross += qty;
            socItem.orderedQty += qty;
            socItem.orderedQtyRaw = (socItem.orderedQtyRaw || 0) + qty;
          }
          stat.totalOrderValue += lineTotal;

          if (!stat.topItem && name) {
            stat.topItem = name;
          }

          socItem.isOrderItem = true;
        }
      }

      // Add delivered/dispatched quantities
      for (const delivery of deliveries) {
        if (String(delivery.status || '').toUpperCase() === 'CANCELLED') continue;

        const custId = delivery.customerId || delivery.customer_id || delivery.customer?.id;
        if (!custId) continue;

        if (!custMap.has(custId)) {
          const info = customerDirectory.get(custId);
          const custCode = info?.code || getCustomerDisplayCode(delivery.customer) || '';
          const custName = info?.name || getCustomerDisplayName(delivery.customer) || (custCode ? `Customer (${custCode})` : 'Customer');
          const custType = info?.type || delivery.customer?.customerType || 'B2B';
          custMap.set(custId, {
            id: custId,
            customerCode: custCode,
            name: custName,
            customerType: custType,
            totalOrders: 0,
            totalOrderedGross: 0,
            totalDispatchedGross: 0,
            totalDispatchedCartons: 0,
            totalOrderValue: 0,
            pendingGross: 0,
            fulfillmentPct: 0,
            readyToDispatchGross: 0,
            readyToDispatchCartons: 0,
            totalPackedGross: 0,
            totalPackedCartons: 0,
            topItem: '',
            orderNumbers: [],
            lastOrderDate: delivery.deliveryDate || delivery.created_at,
            socContracts: [],
          });
        }

        const stat = custMap.get(custId)!;
        if (!custSocMap.has(custId)) {
          custSocMap.set(custId, []);
        }
        const custSocs = custSocMap.get(custId)!;

        const delivDiv = delivery.salesOrder?.division || delivery.division || null;
        const delivOrderId = String(delivery.salesOrderId || delivery.sales_order_id || delivery.salesOrder?.id || '');
        const delivSocNo = String(
          delivery.salesOrderNumber ||
          delivery.sales_order_number ||
          delivery.salesOrder?.orderNumber ||
          delivery.salesOrder?.order_number ||
          delivery.socNumber ||
          delivery.soc_no ||
          ''
        );
        const lines = delivery.lines || delivery.items || [];
        for (const line of lines) {
          const lineItemObj = line.item || {};
          const code = lineItemObj.itemCode || line.itemCode || line.item_code || '';
          const name = lineItemObj.name || line.description || line.itemName || line.item_name || code || 'Item';
          const qty = Number(line.quantity || line.qty || 0);
          const hintPkgSize = Number(lineItemObj.packagingSize || line.packageQuantity || line.packagingSize || 0);
          const lineUom = line.uom?.code || line.uom?.symbol || line.uomCode || lineItemObj.salesUom?.code || lineItemObj.baseUom?.code;
          const { resolved, grossPerCarton, primaryUom, packagingUnitCode, isGrossUnit } =
            resolveItemPackSpec(code, name, hintPkgSize, lineUom, delivDiv);
          const exactDel = isGrossUnit
            ? convertGrossToExactPcsAndCartons(qty, grossPerCarton, resolved.code, resolved.name)
            : {
                pcs: 0,
                cartons: grossPerCarton > 0 ? Math.round((qty / grossPerCarton) * 100) / 100 : 0,
                exactGross: qty,
                pcsPerCarton: 0,
                grossPerCarton,
              };

          if (qty <= 0) continue;

          // Check line-level SOC first: e.g. [SOC: SOC-2026-05814] or [SOC: SOC-2026-5810]
          const lineSocMatch = (line.description || '').match(/\[SOC:\s*([^\]]+)\]/i) || (line.description || '').match(/SOC[:\s]+(SOC-[A-Za-z0-9-]+|[0-9A-Za-z-]+)/i);
          const lineSocNo = line.socNumber || line.salesOrderNumber || (lineSocMatch ? lineSocMatch[1].trim() : '');
          const lineOrderId = line.salesOrderId || line.orderId || '';

          const cLineSoc = canonicalizeSocKey(lineSocNo);
          const cDelivSoc = canonicalizeSocKey(delivSocNo);
          if (cLineSoc && excludedSocKeys.has(cLineSoc)) continue;
          if (!cLineSoc && lineOrderId && excludedOrderIds.has(String(lineOrderId))) continue;
          if (!cLineSoc && cDelivSoc && excludedSocKeys.has(cDelivSoc)) continue;

          stat.totalDispatchedGross += qty;
          stat.totalDispatchedCartons += exactDel.cartons;
          if (!stat.topItem) {
            stat.topItem = name;
          }

          const nResolvedCode = normKey(resolved.code);
          const matchesCanonSoc = (soc: SocContractSummary, targetCanon: string, rawToken: string) => {
            if (!targetCanon) return false;
            const cSoc = canonicalizeSocKey(soc.socNumber);
            if (cSoc && cSoc === targetCanon) return true;
            const nSoc = normKey(soc.socNumber);
            const nRaw = normKey(rawToken);
            return Boolean(nRaw && (nSoc === nRaw || nSoc.endsWith(nRaw) || nRaw.endsWith(nSoc)));
          };
          const socHasItem = (soc: SocContractSummary) =>
            soc.items.some((it) => normKey(resolveFgItem(it.itemCode, it.itemName).code) === nResolvedCode);

          let targetSoc: SocContractSummary | undefined;

          // Priority 1: Match explicit Line-Level SOC (canonical 4/5-digit normalized, including DELIVERED/CLOSED)
          if (cLineSoc) {
            targetSoc =
              custSocs.find((s) => matchesCanonSoc(s, cLineSoc, lineSocNo) && socHasItem(s)) ||
              custSocs.find((s) => matchesCanonSoc(s, cLineSoc, lineSocNo));
          }

          // Priority 2: Match explicit line-level salesOrderId (including DELIVERED/CLOSED)
          if (!targetSoc && lineOrderId) {
            targetSoc =
              custSocs.find((s) => s.orderId === lineOrderId && socHasItem(s)) ||
              custSocs.find((s) => s.orderId === lineOrderId);
          }

          // Priority 3: Match delivery-level order ID or canonical delivSocNo across ALL customer SOCs
          // (Never reject DELIVERED/CLOSED here, otherwise delivered DN lines fall through onto open SOCs!)
          if (!targetSoc && (delivOrderId || cDelivSoc)) {
            targetSoc =
              custSocs.find(
                (s) =>
                  ((delivOrderId && s.orderId === delivOrderId) ||
                    (cDelivSoc && matchesCanonSoc(s, cDelivSoc, delivSocNo))) &&
                  socHasItem(s),
              ) ||
              custSocs.find(
                (s) =>
                  (delivOrderId && s.orderId === delivOrderId) ||
                  (cDelivSoc && matchesCanonSoc(s, cDelivSoc, delivSocNo)),
              );
          }

          // Priority 4: Fallback ONLY when no explicit SOC/Order reference was given on line or header
          const hasExplicitRef =
            isExplicitRealSocToken(lineSocNo) ||
            isExplicitRealSocToken(delivSocNo) ||
            Boolean(lineOrderId) ||
            Boolean(delivOrderId);
          if (!targetSoc && !hasExplicitRef) {
            targetSoc =
              custSocs.find(
                (s) =>
                  String(s.status).toUpperCase() !== 'DELIVERED' &&
                  String(s.status).toUpperCase() !== 'CLOSED' &&
                  socHasItem(s),
              ) || custSocs.find((s) => socHasItem(s));
          }

          if (targetSoc) {
            // Strictly match against items ordered in this SOC by resolved standard FG code
            let socItem = targetSoc.items.find((it) => {
              const itRes = resolveFgItem(it.itemCode, it.itemName);
              return normKey(itRes.code) === nResolvedCode;
            });

            // Single-item fallback ONLY if item code matches or is absent
            if (!socItem && targetSoc.items.length === 1) {
              const singleIt = targetSoc.items[0];
              const singleRes = resolveFgItem(singleIt.itemCode, singleIt.itemName);
              if (!nResolvedCode || normKey(singleRes.code) === nResolvedCode) {
                socItem = singleIt;
              }
            }

            if (socItem) {
              socItem.dispatchedQty += qty;
              socItem.dispatchedPcs += exactDel.pcs;
              socItem.dispatchedQtyRaw = (socItem.dispatchedQtyRaw || 0) + qty;
            } else if (targetSoc.isOfficialOrder) {
              // Item was not ordered in targetSoc, check other customer SOCs ONLY if un-tagged
              const altSoc = !hasExplicitRef
                ? custSocs.find((s) => s.items.some((it) => it.isOrderItem && normKey(resolveFgItem(it.itemCode, it.itemName).code) === nResolvedCode))
                : undefined;
              if (altSoc) {
                const altItem = findOrCreateSocItem(altSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, delivDiv);
                altItem.dispatchedQty += qty;
                altItem.dispatchedPcs += exactDel.pcs;
                altItem.dispatchedQtyRaw = (altItem.dispatchedQtyRaw || 0) + qty;
              } else {
                const created = findOrCreateSocItem(targetSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, delivDiv);
                created.dispatchedQty += qty;
                created.dispatchedPcs += exactDel.pcs;
                created.dispatchedQtyRaw = (created.dispatchedQtyRaw || 0) + qty;
              }
            } else {
              const created = findOrCreateSocItem(targetSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, delivDiv);
              created.dispatchedQty += qty;
              created.dispatchedPcs += exactDel.pcs;
              created.dispatchedQtyRaw = (created.dispatchedQtyRaw || 0) + qty;
            }
          } else if (custSocs.length > 0 && !hasExplicitRef) {
            // Allocate FIFO strictly across customer's SOCs that ALREADY have this ordered item
            let remainingUnitsToAllocate = isGrossUnit ? exactDel.pcs : qty;
            const matchingItems: SocItemDetail[] = [];

            for (const s of custSocs) {
              for (const it of s.items) {
                const itRes = resolveFgItem(it.itemCode, it.itemName);
                if (normKey(itRes.code) === nResolvedCode) {
                  matchingItems.push(it);
                }
              }
            }

            if (matchingItems.length > 0) {
              for (const it of matchingItems) {
                if (it.isGrossUnit !== false) {
                  const roomPcs = Math.max(0, it.orderedPcs - it.dispatchedPcs);
                  if (roomPcs > 0 && remainingUnitsToAllocate > 0) {
                    const allocPcs = Math.min(roomPcs, remainingUnitsToAllocate);
                    const allocGross = Math.round((allocPcs / 144) * 100) / 100;
                    it.dispatchedPcs += allocPcs;
                    it.dispatchedQty += allocGross;
                    it.dispatchedQtyRaw = (it.dispatchedQtyRaw || 0) + allocGross;
                    remainingUnitsToAllocate -= allocPcs;
                  }
                } else {
                  const roomQty = Math.max(0, (it.orderedQtyRaw || 0) - (it.dispatchedQtyRaw || 0));
                  if (roomQty > 0 && remainingUnitsToAllocate > 0) {
                    const allocQty = Math.min(roomQty, remainingUnitsToAllocate);
                    it.dispatchedQty += allocQty;
                    it.dispatchedQtyRaw = (it.dispatchedQtyRaw || 0) + allocQty;
                    remainingUnitsToAllocate -= allocQty;
                  }
                }
              }
              if (remainingUnitsToAllocate > 0) {
                const last = matchingItems[matchingItems.length - 1];
                if (last.isGrossUnit !== false) {
                  const allocGross = Math.round((remainingUnitsToAllocate / 144) * 100) / 100;
                  last.dispatchedPcs += remainingUnitsToAllocate;
                  last.dispatchedQty += allocGross;
                  last.dispatchedQtyRaw = (last.dispatchedQtyRaw || 0) + allocGross;
                } else {
                  last.dispatchedQty += remainingUnitsToAllocate;
                  last.dispatchedQtyRaw = (last.dispatchedQtyRaw || 0) + remainingUnitsToAllocate;
                }
              }
            }
            // If no matching item exists across existing orders, do NOT inject ghost items
          } else if (!hasExplicitRef || !excludedSocKeys.has(cLineSoc || cDelivSoc)) {
            // Customer has delivery without an order record in orders list
            const synthSocNo = delivSocNo || `SOC-${stat.customerCode || 'DIRECT'}`;
            const newSoc: SocContractSummary = {
              orderId: delivOrderId || synthSocNo,
              socNumber: synthSocNo,
              orderDate: delivery.deliveryDate || delivery.created_at,
              status: 'DISPATCHED',
              primaryUom,
              packagingUnitCode,
              totalOrderedQty: 0,
              totalOrderedPcs: 0,
              totalOrderedCartons: 0,
              totalPackedQty: 0,
              totalPackedPcs: 0,
              totalPackedCartons: 0,
              totalDispatchedQty: 0,
              totalDispatchedPcs: 0,
              totalDispatchedCartons: 0,
              totalReadyToDispatchQty: 0,
              totalReadyToDispatchPcs: 0,
              totalReadyToDispatchCartons: 0,
              totalPendingQty: 0,
              totalPendingPcs: 0,
              totalPendingCartons: 0,
              totalToPackQty: 0,
              totalToPackPcs: 0,
              totalToPackCartons: 0,
              fulfillmentPct: 100,
              items: [],
            };
            custSocs.push(newSoc);
            targetSoc = newSoc;
            const socItem = findOrCreateSocItem(newSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, delivDiv);
            socItem.dispatchedQty += exactDel.exactGross;
            socItem.dispatchedPcs += exactDel.pcs;
            socItem.dispatchedQtyRaw = (socItem.dispatchedQtyRaw || 0) + exactDel.exactGross;
          }
        }
      }

      // Parse all hand-packing and opening-stock entries with strict cross-table deduplication & division guard
      const allPackedEntries: PackedEntryInfo[] = [];
      const seenEntryKeys = new Set<string>();

      prodEntries.forEach((e) => {
        const p = parsePackingEntry(e, bufferMasterCtx);
        if (p && (isAllDiv || matchesDivisionFilter(p, activeDivId, divisionsRaw))) {
          const key = `${normKey(p.fgItemCode || '')}_${normKey(p.socNo || '')}_${normKey(p.customerName || '')}_${p.cartons}_${p.gross}_${Math.round(p.baseQty || p.pcs || 0)}`;
          seenEntryKeys.add(key);
          allPackedEntries.push(p);
        }
      });
      openStockEntries.forEach((os) => {
        const p = parseOpenStockEntry(os, bufferMasterCtx);
        if (p && (isAllDiv || matchesDivisionFilter(p, activeDivId, divisionsRaw))) {
          const key = `${normKey(p.fgItemCode || '')}_${normKey(p.socNo || '')}_${normKey(p.customerName || '')}_${p.cartons}_${p.gross}_${Math.round(p.baseQty || p.pcs || 0)}`;
          if (!seenEntryKeys.has(key)) {
            seenEntryKeys.add(key);
            allPackedEntries.push(p);
          }
        }
      });

      // Group packed quantities: safety stock buffer vs customer packed stock
      const safetyBatches: PackedEntryInfo[] = [];
      const custPackedMap = new Map<string, { gross: number; cartons: number; topItem?: string }>();

      const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      const findMatchingCustomerId = (rawName: string) => {
        if (!rawName) return null;
        const nTarget = norm(rawName);
        for (const [id, dir] of customerDirectory.entries()) {
          const nDirName = norm(dir.name);
          const nDirCode = norm(dir.code);
          if (nDirName && (nTarget === nDirName || nDirName.includes(nTarget) || nTarget.includes(nDirName))) {
            return dir.id;
          }
          if (nDirCode && nTarget === nDirCode) {
            return dir.id;
          }
        }
        for (const [id, stat] of custMap.entries()) {
          const nStatName = norm(stat.name);
          const nStatCode = norm(stat.customerCode);
          if (nStatName && (nTarget === nStatName || nStatName.includes(nTarget) || nTarget.includes(nStatName))) {
            return id;
          }
          if (nStatCode && nTarget === nStatCode) {
            return id;
          }
        }
        return null;
      };

      for (const entry of allPackedEntries) {
        if (entry.isSafetyStock) {
          safetyBatches.push(entry);
          continue;
        }

        const rawSoc = String(entry.socNo || '').trim();
        const cEntrySoc = canonicalizeSocKey(rawSoc);
        const hasExplicitRealSoc = isExplicitRealSocToken(rawSoc);
        const nEntrySoc = normKey(rawSoc);

        // Strictly isolate Hand-Packing & Open Stock tagged to Draft/Cancelled/Void SOCs (e.g. SOC-2026-05832)
        if (hasExplicitRealSoc && excludedSocKeys.has(cEntrySoc)) {
          continue;
        }

        const matchesPackedCanonSoc = (soc: SocContractSummary) => {
          const cSoc = canonicalizeSocKey(soc.socNumber);
          if (cEntrySoc && cSoc && cSoc === cEntrySoc) return true;
          const nSoc = normKey(soc.socNumber);
          return Boolean(nEntrySoc && (nSoc === nEntrySoc || nSoc.endsWith(nEntrySoc) || nEntrySoc.endsWith(nSoc)));
        };

        // Find customer and SOC: check canonical SOC match across committed SOCs first
        let matchedCustId: string | null = null;
        let matchedSoc: SocContractSummary | undefined;

        if (cEntrySoc && rawSoc !== '—') {
          for (const [cId, socList] of custSocMap.entries()) {
            const found = socList.find(matchesPackedCanonSoc);
            if (found) {
              matchedCustId = cId;
              matchedSoc = found;
              break;
            }
          }
        }

        // Fallback to customer name matching ONLY if not already matched via SOC number
        if (!matchedCustId) {
          matchedCustId = findMatchingCustomerId(entry.customerName);
        }

        if (matchedCustId) {
          const pCode = entry.fgItemCode || '';
          const pName = entry.fgItemName || '';
          const entryDivMeta = entry.divisionId || entry.divisionCode
            ? { id: entry.divisionId, divisionCode: entry.divisionCode, name: entry.divisionName }
            : null;
          const { resolved, grossPerCarton, primaryUom, packagingUnitCode, isGrossUnit } =
            resolveItemPackSpec(pCode, pName, entry.packagingSize, entry.salesUomCode || entry.baseUomCode, entryDivMeta);
          const nResolvedCode = normKey(resolved.code);
          const entryPcs = isGrossUnit
            ? (entry.pcs > 0
                ? Math.round(entry.pcs)
                : convertGrossToExactPcsAndCartons(entry.gross, grossPerCarton, resolved.code, resolved.name).pcs)
            : 0;
          const entryQtyPrimary = isGrossUnit
            ? Math.round((entryPcs / 144) * 100) / 100
            : (Number(entry.salesQty || entry.baseQty || 0) || 0);

          if (!custSocMap.has(matchedCustId)) {
            custSocMap.set(matchedCustId, []);
          }
          const custSocs = custSocMap.get(matchedCustId)!;

          if (!matchedSoc && cEntrySoc && rawSoc !== '—') {
            matchedSoc = custSocs.find(matchesPackedCanonSoc);
          }

          // If entry explicitly references a concrete SOC that belongs to no committed customer order,
          // do NOT fall back onto unrelated customer SOCs (prevents Draft/cross-division stock leaks).
          if (!matchedSoc && hasExplicitRealSoc) {
            continue;
          }

          const prev = custPackedMap.get(matchedCustId) || { gross: 0, cartons: 0, topItem: '' };
          custPackedMap.set(matchedCustId, {
            gross: prev.gross + entryQtyPrimary,
            cartons: prev.cartons + entry.cartons,
            topItem: prev.topItem || entry.fgItemName || '',
          });

          if (matchedSoc) {
            let socItem = matchedSoc.items.find((it) => {
              const itRes = resolveFgItem(it.itemCode, it.itemName);
              return normKey(itRes.code) === nResolvedCode;
            });
            if (!socItem && !nResolvedCode && matchedSoc.items.length === 1) {
              socItem = matchedSoc.items[0];
            }

            if (socItem) {
              socItem.packedQty += entryQtyPrimary;
              socItem.packedPcs += entryPcs;
              socItem.packedQtyRaw = (socItem.packedQtyRaw || 0) + entryQtyPrimary;
            } else {
              const created = findOrCreateSocItem(matchedSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, entryDivMeta);
              created.packedQty += entryQtyPrimary;
              created.packedPcs += entryPcs;
              created.packedQtyRaw = (created.packedQtyRaw || 0) + entryQtyPrimary;
            }
          } else if (custSocs.length > 0) {
            // Match by item across customer's SOCs in FIFO order ONLY for untagged entries
            let remPackedUnits = isGrossUnit ? entryPcs : entryQtyPrimary;
            const candidateItems: SocItemDetail[] = [];

            for (const s of custSocs) {
              for (const it of s.items) {
                const itRes = resolveFgItem(it.itemCode, it.itemName);
                if (normKey(itRes.code) === nResolvedCode) {
                  candidateItems.push(it);
                }
              }
            }

            if (candidateItems.length > 0) {
              for (const it of candidateItems) {
                if (it.isGrossUnit !== false) {
                  const roomPcs = Math.max(0, it.orderedPcs - it.packedPcs);
                  if (roomPcs > 0 && remPackedUnits > 0) {
                    const allocPcs = Math.min(roomPcs, remPackedUnits);
                    const allocGross = Math.round((allocPcs / 144) * 100) / 100;
                    it.packedPcs += allocPcs;
                    it.packedQty += allocGross;
                    it.packedQtyRaw = (it.packedQtyRaw || 0) + allocGross;
                    remPackedUnits -= allocPcs;
                  }
                } else {
                  const roomQty = Math.max(0, (it.orderedQtyRaw || 0) - (it.packedQtyRaw || 0));
                  if (roomQty > 0 && remPackedUnits > 0) {
                    const allocQty = Math.min(roomQty, remPackedUnits);
                    it.packedQty += allocQty;
                    it.packedQtyRaw = (it.packedQtyRaw || 0) + allocQty;
                    remPackedUnits -= allocQty;
                  }
                }
              }
              if (remPackedUnits > 0) {
                const last = candidateItems[candidateItems.length - 1];
                if (last.isGrossUnit !== false) {
                  const allocGross = Math.round((remPackedUnits / 144) * 100) / 100;
                  last.packedPcs += remPackedUnits;
                  last.packedQty += allocGross;
                  last.packedQtyRaw = (last.packedQtyRaw || 0) + allocGross;
                } else {
                  last.packedQty += remPackedUnits;
                  last.packedQtyRaw = (last.packedQtyRaw || 0) + remPackedUnits;
                }
              }
            }
          } else {
            const synthSocNo = (rawSoc && rawSoc !== '—') ? rawSoc : 'SOC-PACKED';
            const newSoc: SocContractSummary = {
              orderId: synthSocNo,
              socNumber: synthSocNo,
              orderDate: entry.date,
              status: 'PACKED',
              primaryUom,
              packagingUnitCode,
              totalOrderedQty: 0,
              totalOrderedPcs: 0,
              totalOrderedCartons: 0,
              totalPackedQty: 0,
              totalPackedPcs: 0,
              totalPackedCartons: 0,
              totalDispatchedQty: 0,
              totalDispatchedPcs: 0,
              totalDispatchedCartons: 0,
              totalReadyToDispatchQty: 0,
              totalReadyToDispatchPcs: 0,
              totalReadyToDispatchCartons: 0,
              totalPendingQty: 0,
              totalPendingPcs: 0,
              totalPendingCartons: 0,
              totalToPackQty: 0,
              totalToPackPcs: 0,
              totalToPackCartons: 0,
              fulfillmentPct: 0,
              items: [],
            };
            custSocs.push(newSoc);
            const socItem = findOrCreateSocItem(newSoc, resolved.code, resolved.name, grossPerCarton, primaryUom, entryDivMeta);
            socItem.packedQty += entryQtyPrimary;
            socItem.packedPcs += entryPcs;
            socItem.packedQtyRaw = (socItem.packedQtyRaw || 0) + entryQtyPrimary;
          }
        }
      }

      // Build item metadata lookup (weightPerPiece, packagingSize, FGR warehouse ready stock) early so SOC details can access it
      const itemMetaMap = new Map<
        string,
        {
          weightPerPiece: number;
          packagingSize: number;
          matrixFgrGross: number;
          matrixFgrPieces: number;
          matrixFgrCartons: number;
          matrixFgrKgs: number;
        }
      >();

      const registerItemMeta = (
        rawCode: string,
        rawName: string,
        wpp: number,
        pkg: number,
        fgrGross = 0,
        fgrPieces = 0,
        fgrCartons = 0,
        fgrKgs = 0,
        fgrNative = 0
      ) => {
        const keys = [normKey(rawCode), normKey(rawName)].filter(Boolean);
        for (const k of keys) {
          const prev = itemMetaMap.get(k) || {
            weightPerPiece: 0,
            packagingSize: 0,
            matrixFgrGross: 0,
            matrixFgrPieces: 0,
            matrixFgrCartons: 0,
            matrixFgrKgs: 0,
            matrixFgrNative: 0,
          } as any;
          itemMetaMap.set(k, {
            weightPerPiece: wpp > 0 ? wpp : prev.weightPerPiece,
            packagingSize: pkg > 0 ? pkg : prev.packagingSize,
            matrixFgrGross: prev.matrixFgrGross + fgrGross,
            matrixFgrPieces: prev.matrixFgrPieces + fgrPieces,
            matrixFgrCartons: prev.matrixFgrCartons + fgrCartons,
            matrixFgrKgs: prev.matrixFgrKgs + fgrKgs,
            matrixFgrNative: (prev.matrixFgrNative || 0) + fgrNative,
          } as any);
        }
      };

      for (const pIt of prodItemsList) {
        const wpp =
          Number(pIt.weightPerPiece) > 0
            ? Number(pIt.weightPerPiece)
            : Number(pIt.piecesPerKg) > 0
            ? 1 / Number(pIt.piecesPerKg)
            : 0;
        const pkg = Number(pIt.packagingSize) || 0;
        registerItemMeta(pIt.itemCode || '', pIt.name || pIt.itemName || '', wpp, pkg);
      }

      for (const whRow of matrixRows) {
        const isFgrWh = Boolean(
          whRow.isFgWarehouse ||
          String(whRow.warehouseCode || '').toUpperCase().includes('FGDW') ||
          String(whRow.warehouseName || '').toUpperCase().includes('DISPATCH') ||
          String(whRow.warehouseName || '').toUpperCase().includes('FG')
        );
        const mItems: any[] = whRow.items || [];
        for (const mIt of mItems) {
          if (!isAllDiv) {
            const mDiv = {
              divisionId: mIt.divisionId || whRow.divisionId,
              divisionCode: mIt.divisionCode || whRow.divisionCode,
              divisionName: mIt.divisionName || whRow.divisionName,
            };
            if (mDiv.divisionId || mDiv.divisionCode || mDiv.divisionName) {
              if (!matchesDivisionFilter(mDiv, activeDivId, divisionsRaw)) continue;
            }
          }
          const wpp = Number(mIt.weightPerPiece) || 0;
          const pkg = Number(mIt.packagingSize || mIt.grossPerCarton) || 0;
          const isFgItem = isFgrWh || mIt.itemType === 'FINISHED_GOOD';
          const fgrPcs = isFgItem ? Math.round(Number(mIt.convertedPieces || 0)) : 0;
          const fgrGrs = isFgItem
            ? Number(mIt.convertedGross || (fgrPcs > 0 ? fgrPcs / 144 : 0))
            : 0;
          const fgrCtn = isFgItem ? Number(mIt.convertedCartons || 0) : 0;
          const fgrKg = isFgItem ? Number(mIt.convertedWeightKg || 0) : 0;
          const fgrNative = isFgItem ? Number(mIt.onHand ?? mIt.quantity ?? mIt.convertedQuantity ?? 0) : 0;
          registerItemMeta(mIt.itemCode || '', mIt.itemName || '', wpp, pkg, fgrGrs, fgrPcs, fgrCtn, fgrKg, fgrNative);
        }
      }

      // Calculate fulfillment %, totalPacked, readyToDispatch, and finalized SOC contracts for regular customers
      const result: CustomerStat[] = Array.from(custMap.values()).map((c) => {
        const packed = custPackedMap.get(c.id) || { gross: 0, cartons: 0, topItem: '' };

        const rawSocs = custSocMap.get(c.id) || [];
        const finalizedSocs: SocContractSummary[] = reconcileCustomerSocContracts(rawSocs);

        // System-wide strict sync: Customer Card figures MUST match actual reconciled deliveries & packing
        const totalOrderedGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalOrderedQty, 0) * 100) / 100
          : Math.round(c.totalOrderedGross * 100) / 100;
        const totalDispatchedGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalDispatchedQty, 0) * 100) / 100
          : Math.round(c.totalDispatchedGross * 100) / 100;
        const totalDispatchedCartons = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalDispatchedCartons, 0) * 10) / 10
          : Math.round(c.totalDispatchedCartons);
        const totalPackedGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalPackedQty, 0) * 100) / 100
          : Math.round(packed.gross * 100) / 100;
        const totalPackedCartons = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalPackedCartons, 0) * 10) / 10
          : packed.gross > 0 && packed.cartons > 0
          ? Math.round((totalPackedGross / packed.gross) * packed.cartons)
          : Math.round(totalPackedGross / 10);
        const pendingGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalPendingQty, 0) * 100) / 100
          : Math.max(0, Math.round((totalOrderedGross - totalDispatchedGross) * 100) / 100);
        const totalOrders = finalizedSocs.length > 0 ? finalizedSocs.length : c.totalOrders;

        // Ready to dispatch = exact sum of undispatched packed FG across open SOCs
        const readyToDispatchGross = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalReadyToDispatchQty, 0) * 100) / 100
          : Math.max(0, Math.round((totalPackedGross - totalDispatchedGross) * 100) / 100);
        const readyToDispatchCartons = finalizedSocs.length > 0
          ? Math.round(finalizedSocs.reduce((s, x) => s + x.totalReadyToDispatchCartons, 0) * 10) / 10
          : totalPackedGross > 0 && packed.cartons > 0
          ? Math.round((readyToDispatchGross / totalPackedGross) * packed.cartons)
          : Math.round(readyToDispatchGross / 10);

        const custFulfillmentPct =
          totalOrderedGross > 0
            ? Math.min(100, Math.round((totalDispatchedGross / totalOrderedGross) * 100))
            : (totalDispatchedGross > 0 ? 100 : 0);

        const socItemsFlat = finalizedSocs.flatMap((s) => s.items || []);
        const divFallbackUnit = resolveDivisionPrimaryUom(activeDivisionMeta) || 'GRS';
        const orderedUomBuckets = summarizeUomBuckets(
          socItemsFlat.map((it) => ({ unitCode: it.primaryUom || divFallbackUnit, qty: it.orderedQty })),
        );
        const packedUomBuckets = summarizeUomBuckets(
          socItemsFlat.map((it) => ({ unitCode: it.primaryUom || divFallbackUnit, qty: it.packedQty })),
        );
        const dispatchedUomBuckets = summarizeUomBuckets(
          socItemsFlat.map((it) => ({ unitCode: it.primaryUom || divFallbackUnit, qty: it.dispatchedQty })),
        );
        const readyUomBuckets = summarizeUomBuckets(
          socItemsFlat.map((it) => ({ unitCode: it.primaryUom || divFallbackUnit, qty: it.readyToDispatchQty })),
        );
        const pendingUomBuckets = summarizeUomBuckets(
          socItemsFlat.map((it) => ({ unitCode: it.primaryUom || divFallbackUnit, qty: it.remainingPendingQty })),
        );
        const primaryUom =
          orderedUomBuckets[0]?.unitCode ||
          dispatchedUomBuckets[0]?.unitCode ||
          packedUomBuckets[0]?.unitCode ||
          finalizedSocs[0]?.primaryUom ||
          divFallbackUnit;
        const packagingUnitCode =
          finalizedSocs[0]?.packagingUnitCode ||
          resolveDivisionDefaultPackagingUnit(activeDivisionMeta);
        const isGrossUnit = socItemsFlat.some((it) => it.isGrossUnit !== false) || primaryUom === 'GRS';

        return {
          ...c,
          totalOrders,
          totalOrderedGross,
          totalDispatchedGross,
          totalDispatchedCartons,
          totalPackedGross,
          totalPackedCartons,
          pendingGross,
          fulfillmentPct: custFulfillmentPct,
          readyToDispatchGross,
          readyToDispatchCartons,
          topItem: c.topItem || packed.topItem || '',
          isSafetyStock: false,
          socContracts: finalizedSocs,
          primaryUom,
          packagingUnitCode,
          isGrossUnit,
          orderedUomBuckets,
          packedUomBuckets,
          dispatchedUomBuckets,
          readyUomBuckets,
          pendingUomBuckets,
        };
      });

      // Aggregate Safety Stock items dynamically using Item Master UOMs & Packaging Metadata
      const safetyItemsMap = new Map<string, SafetyItemDetail>();
      for (const b of safetyBatches) {
        const itemCode = b.fgItemCode || 'SPI-FG-SPK-006';
        const itemName = b.fgItemName || 'Finished Goods (Safety Stock Buffer)';
        const key = itemCode;
        const prev = safetyItemsMap.get(key) || {
          itemCode,
          itemName,
          divisionId: b.divisionId,
          divisionCode: b.divisionCode,
          divisionName: b.divisionName,
          baseUomCode: b.baseUomCode || 'PCS',
          salesUomCode: b.salesUomCode || b.baseUomCode || 'PCS',
          packagingType: b.packagingType,
          packagingUnit: b.packagingUnit,
          packagingUnitCode: b.packagingUnitCode,
          packagingSize: b.packagingSize,
          baseQty: 0,
          salesQty: 0,
          packagingQty: 0,
          cartons: 0,
          gross: 0,
          pcs: 0,
          hasGrossUom: Boolean(b.hasGrossUom),
          metrics: [],
        };
        const nextBaseQty = Math.round((prev.baseQty + (b.baseQty || 0)) * 10000) / 10000;
        const nextSalesQty = Math.round((prev.salesQty + (b.salesQty || 0)) * 10000) / 10000;
        const nextPackagingQty = Math.round((prev.packagingQty + (b.packagingQty || 0)) * 10000) / 10000;
        const nextCartons = Math.round((prev.cartons + (b.cartons || 0)) * 100) / 100;
        const nextGross = Math.round((prev.gross + (b.gross || 0)) * 100) / 100;
        const nextPcs = Math.round(prev.pcs + (b.pcs || 0));
        const hasGrossUom = prev.hasGrossUom || Boolean(b.hasGrossUom);
        const baseUomCode = prev.baseUomCode || b.baseUomCode || 'PCS';
        const salesUomCode = prev.salesUomCode || b.salesUomCode || baseUomCode;
        const packagingUnitCode = prev.packagingUnitCode || b.packagingUnitCode || '';

        safetyItemsMap.set(key, {
          ...prev,
          itemCode,
          itemName: prev.itemName && prev.itemName !== 'Item' ? prev.itemName : itemName,
          divisionId: prev.divisionId || b.divisionId,
          divisionCode: prev.divisionCode || b.divisionCode,
          divisionName: prev.divisionName || b.divisionName,
          baseUomCode,
          salesUomCode,
          packagingType: prev.packagingType || b.packagingType,
          packagingUnit: prev.packagingUnit || b.packagingUnit,
          packagingUnitCode,
          packagingSize: prev.packagingSize || b.packagingSize,
          baseQty: nextBaseQty,
          salesQty: nextSalesQty,
          packagingQty: nextPackagingQty,
          cartons: nextCartons,
          gross: nextGross,
          pcs: nextPcs,
          hasGrossUom,
          metrics: buildSafetyItemMetrics({
            baseUomCode,
            salesUomCode,
            packagingUnitCode,
            baseQty: nextBaseQty,
            salesQty: nextSalesQty,
            packagingQty: nextPackagingQty,
            hasGrossUom,
          }),
        });
      }
      const safetyItems = Array.from(safetyItemsMap.values())
        .filter((it) => it.baseQty > 0 || it.cartons > 0)
        .sort((a, b) => (b.packagingQty - a.packagingQty) || (b.baseQty - a.baseQty));

      // Build Division options for Safety Stock Buffer Warehouse filter
      const safetyDivOptionMap = new Map<string, DivisionOptionRecord>();
      for (const d of divisionsRaw) {
        const divCodeUpper = String(d.divisionCode || '').toUpperCase();
        const isActiveOperational =
          d.isActive !== false &&
          String(d.status || 'ACTIVE').toUpperCase() === 'ACTIVE' &&
          !divCodeUpper.includes('444');
        if (d.id && isActiveOperational) {
          safetyDivOptionMap.set(d.id, d);
        }
      }
      for (const it of safetyItems) {
        const divKey = it.divisionId || it.divisionCode;
        if (divKey && !safetyDivOptionMap.has(divKey)) {
          safetyDivOptionMap.set(divKey, {
            id: divKey,
            divisionCode: it.divisionCode,
            name: it.divisionName || it.divisionCode || 'Production Division',
          });
        }
      }
      const sortedSafetyDivisions = Array.from(safetyDivOptionMap.values()).sort((a, b) => {
        const aSpk = isSpokeDivisionRecord(a) ? 0 : 1;
        const bSpk = isSpokeDivisionRecord(b) ? 0 : 1;
        if (aSpk !== bSpk) return aSpk - bSpk;
        return (a.divisionCode || a.name).localeCompare(b.divisionCode || b.name);
      });
      const resolvedDivisionOptions =
        sortedSafetyDivisions.length > 0 ? sortedSafetyDivisions : FALLBACK_ANALYTICS_DIVISIONS;
      const batchMetaList = safetyBatches.map((b) => ({ divisionId: b.divisionId, divisionCode: b.divisionCode }));
      setSafetyDivisions(resolvedDivisionOptions);
      setDivisionOptions(resolvedDivisionOptions);
      setSafetyBatchesMeta(batchMetaList);

      // Add dedicated SAFETY STOCK customer card scoped to the selected division
      const divSafetyVolumeBuckets = summarizeUomBuckets(
        safetyItems.map((it) => ({
          unitCode: it.hasGrossUom ? 'GRS' : it.salesUomCode || it.baseUomCode,
          qty: it.hasGrossUom ? it.gross : it.salesQty || it.baseQty,
        })),
      );
      const totalSafetyPrimaryQty = Math.round(
        safetyBatches.reduce((s, b) => s + (b.hasGrossUom ? b.gross : b.salesQty || b.baseQty), 0),
      );
      const totalSafetyCartons = Math.round(safetyBatches.reduce((s, b) => s + b.cartons, 0));
      const topSafetyItem = safetyItems[0]?.itemName || 'Finished Goods Safety Buffer Stock';
      const lastSafetyDate = safetyBatches[0]?.date || new Date().toISOString().slice(0, 10);
      const safetyPrimaryUom =
        divSafetyVolumeBuckets[0]?.unitCode || resolveDivisionPrimaryUom(activeDivisionMeta) || 'GRS';
      const safetyPkgCode =
        safetyItems[0]?.packagingUnitCode || resolveDivisionDefaultPackagingUnit(activeDivisionMeta);

      const safetyStockStat: CustomerStat = {
        id: 'cust-safety-stock-buffer-01',
        customerCode: 'BUFF-SAFE-01',
        name: 'SAFETY STOCK',
        customerType: 'BUFFER_STOCK',
        totalOrders: safetyBatches.length,
        totalOrderedGross: 0,
        totalPackedGross: totalSafetyPrimaryQty,
        totalPackedCartons: totalSafetyCartons,
        totalDispatchedGross: 0,
        totalDispatchedCartons: 0,
        totalOrderValue: 0,
        pendingGross: 0,
        fulfillmentPct: 100, // 100% available ready buffer
        readyToDispatchGross: totalSafetyPrimaryQty,
        readyToDispatchCartons: totalSafetyCartons,
        topItem: topSafetyItem,
        orderNumbers: [],
        lastOrderDate: lastSafetyDate,
        isSafetyStock: true,
        safetyItems,
        primaryUom: safetyPrimaryUom,
        packagingUnitCode: safetyPkgCode,
        isGrossUnit: safetyPrimaryUom === 'GRS',
        packedUomBuckets: divSafetyVolumeBuckets,
        readyUomBuckets: divSafetyVolumeBuckets,
      };

      result.push(safetyStockStat);

      // Sort by dispatched volume by default, keeping active dispatches on top
      result.sort((a, b) => {
        if (a.isSafetyStock && b.totalDispatchedGross > 0) return 1;
        if (b.isSafetyStock && a.totalDispatchedGross > 0) return -1;
        return b.totalDispatchedGross - a.totalDispatchedGross;
      });

      setCustomers(result);

      const inferDefaultWeightPerPiece = (code: string, name: string): number => {
        const combined = `${code} ${name}`.toUpperCase();
        if (combined.includes('8G') || combined.includes('4.0MM')) return 0.0185;
        if (combined.includes('9G') || combined.includes('3.6MM') || combined.includes('S9')) return 0.0165;
        if (combined.includes('10G') || combined.includes('3.2MM') || combined.includes('S10')) return 0.015;
        if (combined.includes('12G') || combined.includes('2.6MM')) return 0.0125;
        return 0.0155; // Standard Finished Goods Spoke & Nipple set (~2.23 KG/Gross, ~22.3 KG/Carton)
      };

      // Single Unified Calculation Pipeline: build ItemStat[] strictly from the reconciled regular
      // customer SOC contracts so Top KPIs, Top Customers/Items Charts, Customer Cards, Item Cards,
      // and SOC Drill-Down Modals match 100% down to the exact unit.
      const regularCustomersReconciled = result.filter((c) => !c.isSafetyStock);
      const itemResult: ItemStat[] = buildUnifiedItemRollupFromCustomers({
        regularCustomers: regularCustomersReconciled,
        preSeedCatalog: isActiveSpokeDiv ? STANDARD_FG_CATALOG : [],
        resolveStandardCode: resolveFgItem,
        resolveMeta: (code, name) => {
          const nCode = normKey(code);
          const nName = normKey(name);
          return (itemMetaMap.get(nCode) || itemMetaMap.get(nName)) as any;
        },
        inferDefaultWpp: inferDefaultWeightPerPiece,
      });

      setItemStats(itemResult);
      tabSessionCache.set<CustomerAnalyticsSnapshot>(snapKey, {
        customers: result,
        itemStats: itemResult,
        safetyDivisions: resolvedDivisionOptions,
        safetyBatchesMeta: batchMetaList,
        divisionOptions: resolvedDivisionOptions,
        fetchedAt: Date.now(),
      });
      loadedDivisionRef.current = activeDivId;
    } catch (err) {
      console.error('CustomerAnalytics load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDivisionId]);

  useEffect(() => {
    loadData(selectedDivisionId, false);
  }, [selectedDivisionId, loadData]);

  useEffect(() => {
    const onTabRefresh = (evt: Event) => {
      const detail = (evt as CustomEvent).detail;
      if (
        matchesTabRefresh(detail, '/customers/analytics') ||
        matchesTabRefresh(detail, '/sales/orders') ||
        matchesTabRefresh(detail, '/sales/deliveries') ||
        matchesTabRefresh(detail, '/production/entries')
      ) {
        evictAllAnalyticsSnapshots();
        loadData(selectedDivisionId, true);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, onTabRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, onTabRefresh);
  }, [evictAllAnalyticsSnapshots, loadData, selectedDivisionId]);

  const handleManualRefresh = useCallback(() => {
    evictAllAnalyticsSnapshots();
    loadData(selectedDivisionId, true);
  }, [evictAllAnalyticsSnapshots, loadData, selectedDivisionId]);

  const handleDivisionChange = useCallback((divId: string) => {
    setSelectedCustomerId(null);
    setSelectedSocNumber(null);
    setCustomerPage(1);
    setSelectedDivisionId(divId || SPOKE_DIVISION_DEFAULT_ID);
  }, []);

  const filteredCustomers = useMemo(() => {
    let list = [...customers];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          (c.topItem || '').toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      if (sortBy === 'ready') return (b.readyToDispatchGross || 0) - (a.readyToDispatchGross || 0);
      if (sortBy === 'packed') return (b.totalPackedGross || 0) - (a.totalPackedGross || 0);
      if (sortBy === 'orders') return b.totalOrders - a.totalOrders;
      if (sortBy === 'dispatched') return b.totalDispatchedGross - a.totalDispatchedGross;
      if (sortBy === 'value') return b.totalOrderValue - a.totalOrderValue;
      if (sortBy === 'pending') return b.pendingGross - a.pendingGross;
      return 0;
    });
    return list;
  }, [customers, searchText, sortBy]);

  const filteredItemStats = useMemo(() => {
    let list = [...itemStats];
    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter(
        (it) =>
          it.itemCode.toLowerCase().includes(q) ||
          it.itemName.toLowerCase().includes(q) ||
          it.customerNames.some((cn) => cn.toLowerCase().includes(q))
      );
    }
    return list;
  }, [itemStats, searchText]);

  const CARDS_PER_ROW = 5;
  const nonSafetyCustomers = useMemo(
    () => filteredCustomers.filter((c) => !c.isSafetyStock),
    [filteredCustomers]
  );

  // Dynamic routing based on fulfillment percentage & remaining pending qty:
  // - Pending: active, unfulfilled, or partially fulfilled (< 100% fulfillment or pendingGross > 0)
  // - Done: 100% fulfilled (fulfillmentPct >= 100 and pendingGross <= 0)
  const pendingCustomers = useMemo(
    () => nonSafetyCustomers.filter((c) => c.fulfillmentPct < 100 || c.pendingGross > 0),
    [nonSafetyCustomers]
  );
  const doneCustomers = useMemo(
    () => nonSafetyCustomers.filter((c) => c.fulfillmentPct >= 100 && c.pendingGross <= 0),
    [nonSafetyCustomers]
  );

  const onlyCustomers = useMemo(() => {
    if (activeTab === 'pending') return pendingCustomers;
    if (activeTab === 'done') return doneCustomers;
    return nonSafetyCustomers;
  }, [activeTab, pendingCustomers, doneCustomers, nonSafetyCustomers]);

  const tableCustomers = useMemo(() => {
    if (activeTab === 'pending') return pendingCustomers;
    if (activeTab === 'done') return doneCustomers;
    return filteredCustomers;
  }, [activeTab, pendingCustomers, doneCustomers, filteredCustomers]);

  const safetyStockStat = useMemo(() => customers.find((c) => c.isSafetyStock), [customers]);
  const safetyBufferSummary = useMemo(
    () =>
      buildSafetyBufferDockSummary(
        safetyStockStat?.safetyItems || [],
        safetyBatchesMeta,
        selectedDivisionId,
      ),
    [safetyStockStat, safetyBatchesMeta, selectedDivisionId],
  );
  const selectedDivisionName = useMemo(() => {
    if (!selectedDivisionId || selectedDivisionId === 'ALL') return 'All Divisions';
    return (
      selectedDivisionObj?.name ||
      safetyDivisions.find((d) => d.id === selectedDivisionId || d.divisionCode === selectedDivisionId)?.name ||
      selectedDivisionId
    );
  }, [selectedDivisionId, selectedDivisionObj, safetyDivisions]);
  const totalCustomerPages = Math.max(1, Math.ceil(onlyCustomers.length / CARDS_PER_ROW));

  const selectedCustomerModal = useMemo(
    () => (selectedCustomerId ? customers.find((c) => c.id === selectedCustomerId) || null : null),
    [customers, selectedCustomerId]
  );

  const selectedSocContract = useMemo(() => {
    if (!selectedCustomerModal || !selectedSocNumber) return null;
    return (
      selectedCustomerModal.socContracts?.find((s) => s.socNumber === selectedSocNumber) || null
    );
  }, [selectedCustomerModal, selectedSocNumber]);

  useEffect(() => {
    setCustomerPage(1);
  }, [activeTab]);

  useEffect(() => {
    if (customerPage > totalCustomerPages) {
      setCustomerPage(1);
    }
  }, [customerPage, totalCustomerPages]);

  const pagedCustomers = useMemo(() => {
    const start = (customerPage - 1) * CARDS_PER_ROW;
    return onlyCustomers.slice(start, start + CARDS_PER_ROW);
  }, [onlyCustomers, customerPage]);

  const regularCustomers = useMemo(() => customers.filter((c) => !c.isSafetyStock), [customers]);
  const totalDispatchedGross = useMemo(
    () => Math.round(regularCustomers.reduce((s, c) => s + c.totalDispatchedGross, 0) * 100) / 100,
    [regularCustomers],
  );
  const totalOrderedGross = useMemo(
    () => Math.round(regularCustomers.reduce((s, c) => s + c.totalOrderedGross, 0) * 100) / 100,
    [regularCustomers],
  );
  const totalOrders = useMemo(
    () => regularCustomers.reduce((s, c) => s + c.totalOrders, 0),
    [regularCustomers],
  );
  const totalPackedGrossAll = useMemo(
    () => Math.round(regularCustomers.reduce((s, c) => s + (c.totalPackedGross || 0), 0) * 100) / 100,
    [regularCustomers],
  );
  const totalReadyToDispatchGross = useMemo(
    () => Math.round(regularCustomers.reduce((s, c) => s + (c.readyToDispatchGross || 0), 0) * 100) / 100,
    [regularCustomers],
  );
  const overallFulfillment = totalOrderedGross > 0 ? Math.round((totalDispatchedGross / totalOrderedGross) * 100) : 0;

  const kpiOrderedBuckets = useMemo(() => {
    const entries = regularCustomers.flatMap((c) =>
      c.orderedUomBuckets && c.orderedUomBuckets.length > 0
        ? c.orderedUomBuckets.map((b) => ({ unitCode: b.unitCode, qty: b.value }))
        : [{ unitCode: c.primaryUom || activeDivisionUnitFallback || 'GRS', qty: c.totalOrderedGross }],
    );
    return summarizeUomBuckets(entries);
  }, [regularCustomers, activeDivisionUnitFallback]);

  const kpiPackedBuckets = useMemo(() => {
    const entries = regularCustomers.flatMap((c) =>
      c.packedUomBuckets && c.packedUomBuckets.length > 0
        ? c.packedUomBuckets.map((b) => ({ unitCode: b.unitCode, qty: b.value }))
        : [{ unitCode: c.primaryUom || activeDivisionUnitFallback || 'GRS', qty: c.totalPackedGross || 0 }],
    );
    return summarizeUomBuckets(entries);
  }, [regularCustomers, activeDivisionUnitFallback]);

  const kpiDispatchedBuckets = useMemo(() => {
    const entries = regularCustomers.flatMap((c) =>
      c.dispatchedUomBuckets && c.dispatchedUomBuckets.length > 0
        ? c.dispatchedUomBuckets.map((b) => ({ unitCode: b.unitCode, qty: b.value }))
        : [{ unitCode: c.primaryUom || activeDivisionUnitFallback || 'GRS', qty: c.totalDispatchedGross }],
    );
    return summarizeUomBuckets(entries);
  }, [regularCustomers, activeDivisionUnitFallback]);

  const kpiReadyBuckets = useMemo(() => {
    const entries = regularCustomers.flatMap((c) =>
      c.readyUomBuckets && c.readyUomBuckets.length > 0
        ? c.readyUomBuckets.map((b) => ({ unitCode: b.unitCode, qty: b.value }))
        : [{ unitCode: c.primaryUom || activeDivisionUnitFallback || 'GRS', qty: c.readyToDispatchGross || 0 }],
    );
    return summarizeUomBuckets(entries);
  }, [regularCustomers, activeDivisionUnitFallback]);

  const orderedKpiDisplay = useMemo(
    () => formatUomBreakdownDisplay(kpiOrderedBuckets, fmtNum, activeDivisionUnitFallback),
    [kpiOrderedBuckets, activeDivisionUnitFallback],
  );
  const packedKpiDisplay = useMemo(
    () => formatUomBreakdownDisplay(kpiPackedBuckets, fmtNum, activeDivisionUnitFallback),
    [kpiPackedBuckets, activeDivisionUnitFallback],
  );
  const dispatchedKpiDisplay = useMemo(
    () => formatUomBreakdownDisplay(kpiDispatchedBuckets, fmtNum, activeDivisionUnitFallback),
    [kpiDispatchedBuckets, activeDivisionUnitFallback],
  );
  const readyKpiDisplay = useMemo(
    () => formatUomBreakdownDisplay(kpiReadyBuckets, fmtNum, activeDivisionUnitFallback),
    [kpiReadyBuckets, activeDivisionUnitFallback],
  );

  const unitHdrSuffix = activeDivisionUnitFallback ? ` (${activeDivisionUnitFallback})` : '';
  const formatCustomerMetric = (
    val: number,
    unitFallback: string | undefined,
    buckets?: AnalyticsUomBucket[],
    showSuffix = false,
  ) => {
    if (buckets && buckets.length > 1) {
      return buckets.map((b) => `${fmtNum(b.value, b.decimals)} ${b.unitCode}`).join(' · ');
    }
    const unit = buckets?.[0]?.unitCode || unitFallback || activeDivisionUnitFallback || 'GRS';
    const numStr = fmtNum(val, 0);
    return showSuffix || !activeDivisionUnitFallback ? `${numStr} ${unit}` : numStr;
  };

  const tableColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, c: CustomerStat, i: number) => (
        <span style={{ fontWeight: 700, color: c.isSafetyStock ? '#10b981' : i < 3 ? COLORS[0] : 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
          {c.isSafetyStock ? '🛡️' : i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'CUSTOMER',
      key: 'name',
      render: (_: any, c: CustomerStat) => (
        <div>
          <div style={{ fontWeight: 700, color: c.isSafetyStock ? '#059669' : 'var(--theme-accent, #6366f1)', fontSize: 13 }}>
            {c.name}
            {c.isSafetyStock && <Tag color="cyan" style={{ marginLeft: 6, fontSize: 10 }}>Buffer</Tag>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.customerCode}</div>
        </div>
      ),
    },
    {
      title: 'ORDERS',
      key: 'orders',
      width: 80,
      align: 'center' as const,
      render: (_: any, c: CustomerStat) => (
        <Tag color={c.isSafetyStock ? 'purple' : 'blue'} style={{ fontWeight: 700 }}>
          {c.totalOrders} {c.isSafetyStock ? 'Batches' : ''}
        </Tag>
      ),
    },
    {
      title: `ORDERED${unitHdrSuffix}`,
      key: 'ordered',
      width: 140,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>
          {c.isSafetyStock ? '—' : formatCustomerMetric(c.totalOrderedGross, c.primaryUom, c.orderedUomBuckets)}
        </span>
      ),
    },
    {
      title: `TOTAL PACKED${unitHdrSuffix}`,
      key: 'packed',
      width: 155,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => {
        const pkgLabel = c.packagingUnitCode || 'CTN';
        return (
          <span style={{ fontWeight: 700, color: '#0d9488' }}>
            {formatCustomerMetric(c.totalPackedGross, c.primaryUom, c.packedUomBuckets)}
            {c.totalPackedCartons > 0 && (
              <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', display: 'block' }}>
                ({fmtNum(c.totalPackedCartons, 0)} {pkgLabel})
              </span>
            )}
          </span>
        );
      },
    },
    {
      title: `DISPATCHED${unitHdrSuffix}`,
      key: 'dispatched',
      width: 145,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: '#10b981' }}>
          {formatCustomerMetric(c.totalDispatchedGross, c.primaryUom, c.dispatchedUomBuckets)}
        </span>
      ),
    },
    {
      title: 'READY TO DISPATCH',
      key: 'readyToDispatch',
      width: 170,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => {
        const unit = c.readyUomBuckets?.[0]?.unitCode || c.primaryUom || activeDivisionUnitFallback || 'GRS';
        const pkgLabel = c.packagingUnitCode || 'CTN';
        return (
          <span style={{ fontWeight: 700, color: c.readyToDispatchGross > 0 ? '#0284c7' : 'var(--theme-text-muted, #94a3b8)' }}>
            {c.readyToDispatchGross > 0
              ? `${formatCustomerMetric(c.readyToDispatchGross, c.primaryUom, c.readyUomBuckets, true)}${c.readyToDispatchCartons ? ` (${fmtNum(c.readyToDispatchCartons, 0)} ${pkgLabel})` : ''}`
              : `0 ${unit}`}
          </span>
        );
      },
    },
    {
      title: `PENDING${unitHdrSuffix}`,
      key: 'pending',
      width: 135,
      align: 'right' as const,
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontWeight: 700, color: c.pendingGross > 0 ? '#f59e0b' : '#10b981' }}>
          {c.pendingGross > 0 ? formatCustomerMetric(c.pendingGross, c.primaryUom, c.pendingUomBuckets) : '✅ 0'}
        </span>
      ),
    },
    {
      title: 'FULFILLMENT',
      key: 'fulfillment',
      width: 160,
      render: (_: any, c: CustomerStat) => {
        const clr = getFulfillmentColor(c.fulfillmentPct);
        return (
          <div>
            <Progress
              percent={c.fulfillmentPct}
              size="small"
              strokeColor={clr}
              format={(p) => <span style={{ fontSize: 10, fontWeight: 700, color: clr }}>{p}%</span>}
            />
          </div>
        );
      },
    },
    {
      title: 'TOP ITEM',
      key: 'topItem',
      render: (_: any, c: CustomerStat) => (
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>{c.topItem || '—'}</span>
      ),
    },
  ];

  const itemColumns = [
    {
      title: '#',
      key: 'rank',
      width: 50,
      render: (_: any, __: any, i: number) => (
        <span style={{ fontWeight: 700, color: i < 3 ? COLORS[0] : 'var(--theme-text-muted)', fontSize: 13 }}>
          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
        </span>
      ),
    },
    {
      title: 'ITEM CODE & NAME',
      key: 'item',
      render: (_: any, it: ItemStat) => (
        <div>
          <div style={{ fontWeight: 800, color: 'var(--theme-accent, #6366f1)', fontSize: 13, fontFamily: 'monospace' }}>
            {it.itemCode}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--theme-text, #1e293b)', fontWeight: 600 }}>{it.itemName}</div>
        </div>
      ),
    },
    {
      title: 'TOTAL ORDERED',
      key: 'ordered',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => {
        const unit = it.primaryUom || 'GRS';
        const pkg = it.packagingUnitCode || 'CTN';
        if (it.isGrossUnit === false) {
          return (
            <div>
              <div style={{ fontWeight: 800, color: 'var(--theme-heading, #1e293b)', fontSize: 13 }}>
                {fmtNum(it.totalGross, 0)} {unit}
              </div>
              {it.totalCartons > 0 && (
                <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
                  {fmtNum(it.totalCartons, 1)} {pkg}
                </div>
              )}
            </div>
          );
        }
        return (
          <div>
            <div style={{ fontWeight: 800, color: 'var(--theme-heading, #1e293b)', fontSize: 13 }}>
              {fmtNum(it.totalOrderedKgs, 1)} KGS • {fmtNum(it.totalCartons, 1)} {pkg}
            </div>
            <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700 }}>
              {fmtNum(it.totalGross, 0)} {unit} • {fmtNum(it.totalPieces, 0)} PCS
            </div>
          </div>
        );
      },
    },
    {
      title: 'READY IN FGR',
      key: 'readyFgr',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => {
        const unit = it.primaryUom || 'GRS';
        const pkg = it.packagingUnitCode || 'CTN';
        if (it.isGrossUnit === false) {
          return (
            <div>
              <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13 }}>
                {fmtNum(it.readyFgrGross, 0)} {unit}
              </div>
              {it.readyFgrCartons > 0 && (
                <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700 }}>
                  {fmtNum(it.readyFgrCartons, 1)} {pkg}
                </div>
              )}
            </div>
          );
        }
        return (
          <div>
            <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13 }}>
              {fmtNum(it.readyFgrKgs, 1)} KGS • {fmtNum(it.readyFgrCartons, 1)} {pkg}
            </div>
            <div style={{ fontSize: 11, color: '#0d9488', fontWeight: 700 }}>
              {fmtNum(it.readyFgrGross, 0)} {unit} • {fmtNum(it.readyFgrPieces, 0)} PCS
            </div>
          </div>
        );
      },
    },
    {
      title: 'PENDING DISPATCH',
      key: 'undispatched',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => {
        const unit = it.primaryUom || 'GRS';
        const pkg = it.packagingUnitCode || 'CTN';
        if (it.isGrossUnit === false) {
          return (
            <div>
              <div style={{ fontWeight: 800, color: it.undispatchedGross > 0 ? '#3b82f6' : '#10b981', fontSize: 13 }}>
                {fmtNum(it.undispatchedGross, 0)} {unit}
              </div>
              {it.undispatchedCartons > 0 && (
                <div style={{ fontSize: 11, color: it.undispatchedCartons > 0 ? '#2563eb' : '#10b981', fontWeight: 700 }}>
                  {fmtNum(it.undispatchedCartons, 1)} {pkg}
                </div>
              )}
            </div>
          );
        }
        return (
          <div>
            <div
              style={{
                fontWeight: 800,
                color: it.undispatchedGross > 0 ? '#3b82f6' : '#10b981',
                fontSize: 13,
              }}
            >
              {fmtNum(it.undispatchedGross, 0)} {unit} • {fmtNum(it.undispatchedPieces, 0)} PCS
            </div>
            <div
              style={{
                fontSize: 11,
                color: it.undispatchedCartons > 0 ? '#2563eb' : '#10b981',
                fontWeight: 700,
              }}
            >
              {fmtNum(it.undispatchedCartons, 1)} {pkg} • {fmtNum(it.undispatchedKgs, 1)} KGS
            </div>
          </div>
        );
      },
    },
    {
      title: 'PENDING PRODUCTION',
      key: 'balancePending',
      align: 'right' as const,
      render: (_: any, it: ItemStat) => {
        const unit = it.primaryUom || 'GRS';
        const pkg = it.packagingUnitCode || 'CTN';
        if (it.isGrossUnit === false) {
          return (
            <div>
              <div style={{ fontWeight: 800, color: it.balancePendingGross > 0 ? '#f59e0b' : '#10b981', fontSize: 13 }}>
                {fmtNum(it.balancePendingGross, 0)} {unit}
              </div>
              {it.balancePendingCartons > 0 && (
                <div style={{ fontSize: 11, color: it.balancePendingCartons > 0 ? '#d97706' : '#10b981', fontWeight: 700 }}>
                  {fmtNum(it.balancePendingCartons, 1)} {pkg}
                </div>
              )}
            </div>
          );
        }
        return (
          <div>
            <div
              style={{
                fontWeight: 800,
                color: it.balancePendingGross > 0 ? '#f59e0b' : '#10b981',
                fontSize: 13,
              }}
            >
              {fmtNum(it.balancePendingGross, 0)} {unit} • {fmtNum(it.balancePendingPieces, 0)} PCS
            </div>
            <div
              style={{
                fontSize: 11,
                color: it.balancePendingCartons > 0 ? '#d97706' : '#10b981',
                fontWeight: 700,
              }}
            >
              {fmtNum(it.balancePendingCartons, 1)} {pkg} • {fmtNum(it.balancePendingKgs, 1)} KGS
            </div>
          </div>
        );
      },
    },
    {
      title: 'ASSOCIATED CUSTOMERS',
      key: 'customers',
      render: (_: any, it: ItemStat) => (
        <div>
          <Tag
            color="purple"
            style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 4 }}
            onClick={() => {
              const firstCust = it.customers?.[0] || it.customerNames[0];
              if (firstCust) openCustomerByNameOrRef(firstCust);
            }}
          >
            <UserOutlined /> {it.customerCount} {it.customerCount === 1 ? 'Customer' : 'Customers'}
          </Tag>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {(it.customers && it.customers.length > 0
              ? it.customers
              : it.customerNames.map((n) => ({ customerId: n, customerName: n }))
            ).map((cust) => (
              <button
                key={cust.customerId + cust.customerName}
                type="button"
                className="ca-item-cust-link"
                onClick={() => openCustomerByNameOrRef(cust)}
              >
                {cust.customerName}
              </button>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="ca-root">
      {/* ── Header ── */}
      <div className="ca-header">
        <div className="ca-header-left">
          <div className="ca-title-icon">📊</div>
          <div>
            <h1 className="ca-title">Customer Analytics</h1>
            <p className="ca-subtitle">Dispatch history, order fulfillment &amp; product analysis</p>
          </div>
        </div>
        <div className="ca-header-actions">
          <div className="ca-header-division-filter">
            <span className="ca-dock-filter-label" style={{ color: token.colorTextSecondary }}>
              Division
            </span>
            <Select
              aria-label="Filter Customer Analytics by division"
              value={selectedDivisionId}
              onChange={handleDivisionChange}
              style={{ minWidth: 235 }}
              optionLabelProp="label"
              popupMatchSelectWidth={false}
              disabled={loading}
            >
              {(divisionOptions.length > 0 ? divisionOptions : FALLBACK_ANALYTICS_DIVISIONS).map((div) => (
                <Option key={div.id} value={div.id} label={div.name}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <span>{div.name}</span>
                    {div.divisionCode && (
                      <Tag style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
                        {div.divisionCode}
                      </Tag>
                    )}
                  </div>
                </Option>
              ))}
              <Option value="ALL" label="All Divisions">
                <span>All Divisions</span>
              </Option>
            </Select>
          </div>
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={handleManualRefresh}
            loading={loading}
            className="ca-refresh-btn"
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Strip (Executive Action KPI Cards) ── */}
      <div className="ca-kpi-grid">
        <ActionKpiCard
          value={customers.filter((c) => !c.isSafetyStock).length}
          label="Active Customers"
          icon={<UserOutlined />}
          gradient="linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)"
          actionText="Customer list"
          onAction={() => navigate('/customers')}
        />
        <ActionKpiCard
          value={totalOrders}
          label="Total Orders"
          icon={<ShoppingCartOutlined />}
          gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)"
          actionText="View orders"
          onAction={() => navigate('/sales/orders')}
        />
        <ActionKpiCard
          value={orderedKpiDisplay.text}
          suffix={orderedKpiDisplay.suffix}
          label="Ordered Demand"
          icon={<ClockCircleOutlined />}
          gradient="linear-gradient(135deg, #ea580c 0%, #c2410c 100%)"
          actionText="Track demand"
          onAction={() => navigate('/sales/orders')}
        />
        <ActionKpiCard
          value={packedKpiDisplay.text}
          suffix={packedKpiDisplay.suffix}
          label="Total Packed"
          icon={<AppstoreOutlined />}
          gradient="linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
          actionText="Production entries"
          onAction={() => navigate('/production/entries')}
        />
        <ActionKpiCard
          value={dispatchedKpiDisplay.text}
          suffix={dispatchedKpiDisplay.suffix}
          label="Dispatched Goods"
          icon={<RocketOutlined />}
          gradient="linear-gradient(135deg, #16a34a 0%, #15803d 100%)"
          actionText="View deliveries"
          onAction={() => navigate('/sales/deliveries')}
        />
        <ActionKpiCard
          value={readyKpiDisplay.text}
          suffix={readyKpiDisplay.suffix}
          label="Ready to Dispatch"
          icon={<InboxOutlined />}
          gradient="linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
          actionText="Finished goods"
          onAction={() => navigate('/inventory')}
        />
        <ActionKpiCard
          value={`${overallFulfillment}%`}
          label="Overall Fulfillment"
          icon={<CheckCircleOutlined />}
          gradient="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)"
          actionText="Analyze chart"
          onAction={() => {
            const el = document.querySelector('.ca-chart-card');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
        />
      </div>

      {/* ── Dual Comparison Bar Chart: Top Customers / Top Items ── */}
      <div className="ca-chart-card">
        <div className="ca-chart-header">
          <div className="ca-chart-title">
            <TrophyOutlined style={{ color: '#f59e0b', fontSize: 18 }} />
            <span>
              {chartView === 'customers' ? 'Top Customers by Volume' : 'Top Items by Volume'}
            </span>
          </div>

          <div className="ca-chart-toggles">
            <div className="ca-chart-legend">
              <span className="ca-legend-item">
                <span className="ca-legend-dot ca-legend-dispatched" />
                <span>Dispatched (Solid)</span>
              </span>
              <span className="ca-legend-item">
                <span className="ca-legend-dot ca-legend-ready" />
                <span>Ready to Dispatch (Packed)</span>
              </span>
              <span className="ca-legend-item">
                <span className="ca-legend-dot ca-legend-ordered" />
                <span>Ordered Demand</span>
              </span>
            </div>

            <div className="ca-chart-segmented">
              <button
                className={`ca-chart-seg-btn ${chartView === 'customers' ? 'active' : ''}`}
                onClick={() => setChartView('customers')}
                type="button"
              >
                <UserOutlined /> Customers ({customers.filter(c => !c.isSafetyStock).length})
              </button>
              <button
                className={`ca-chart-seg-btn ${chartView === 'items' ? 'active' : ''}`}
                onClick={() => setChartView('items')}
                type="button"
              >
                <TagOutlined /> Items ({itemStats.length})
              </button>
            </div>
          </div>
        </div>

        {chartView === 'customers' ? (
          <div className="ca-dual-chart">
            {customers
              .filter((c) => !c.isSafetyStock)
              .slice(0, 10)
              .map((c, i) => {
                const orderedGross = c.totalOrderedGross || 0;
                const dispatchedGross = c.totalDispatchedGross || 0;
                const readyGross = c.readyToDispatchGross || 0;
                const pendingGross = c.pendingGross ?? Math.max(0, orderedGross - dispatchedGross);
                const cUnit = c.primaryUom || activeDivisionUnitFallback || 'GRS';

                const sameUnitPeers = customers.filter(
                  (x) => !x.isSafetyStock && (x.primaryUom || activeDivisionUnitFallback || 'GRS') === cUnit,
                );
                const maxVol = Math.max(
                  ...sameUnitPeers.map((x) =>
                    Math.max(x.totalOrderedGross, (x.totalDispatchedGross || 0) + (x.readyToDispatchGross || 0)),
                  ),
                  1,
                );
                const envelopeTotal = Math.max(orderedGross, dispatchedGross + readyGross);
                const capsuleWidth = Math.min(100, Math.max(8, (envelopeTotal / maxVol) * 100));

                const dispatchedPct = envelopeTotal > 0 ? (dispatchedGross / envelopeTotal) * 100 : 0;
                const readyPct = envelopeTotal > 0 ? (readyGross / envelopeTotal) * 100 : 0;
                const pendingPct = Math.max(0, 100 - dispatchedPct - readyPct);
                const clr = COLORS[i % COLORS.length];
                const orderedStr = formatCustomerMetric(orderedGross, cUnit, c.orderedUomBuckets, true);
                const dispatchedStr = formatCustomerMetric(dispatchedGross, cUnit, c.dispatchedUomBuckets, true);
                const readyStr = formatCustomerMetric(readyGross, cUnit, c.readyUomBuckets, true);
                const pendingStr = formatCustomerMetric(pendingGross, cUnit, c.pendingUomBuckets, true);

                return (
                  <div key={c.id} className="ca-dual-row">
                    <div className="ca-dual-label">
                      <span className="ca-dual-rank" style={{ color: clr }}>
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                      </span>
                      <div className="ca-dual-names">
                        <Tooltip title={`${c.name} (${c.customerCode})`}>
                          <span className="ca-dual-name">{c.name}</span>
                        </Tooltip>
                        <span className="ca-dual-sub">{c.customerCode || 'B2B'}</span>
                      </div>
                    </div>

                    <div className="ca-multi-track-wrapper">
                      <div className="ca-multi-track-capsule-outer">
                        <Tooltip
                          title={
                            <div>
                              <div style={{ fontWeight: 800, marginBottom: 4 }}>{c.name}</div>
                              <div>📦 Ordered Demand: <strong>{orderedStr}</strong></div>
                              <div style={{ color: '#818cf8' }}>🚚 Dispatched: <strong>{dispatchedStr}</strong> ({Math.round((dispatchedGross / Math.max(orderedGross, 1)) * 100)}%)</div>
                              <div style={{ color: '#34d399' }}>🛡️ Ready to Dispatch: <strong>{readyStr}</strong> ({Math.round((readyGross / Math.max(orderedGross, 1)) * 100)}%)</div>
                              <div style={{ color: '#fbbf24' }}>⏳ Pending Production: <strong>{pendingStr}</strong></div>
                            </div>
                          }
                        >
                          <div
                            className="ca-multi-track-capsule"
                            style={{ width: `${capsuleWidth}%` }}
                          >
                            {dispatchedPct > 0 && (
                              <div
                                className="ca-seg-dispatched"
                                style={{ width: `${dispatchedPct}%` }}
                              />
                            )}
                            {readyPct > 0 && (
                              <div
                                className="ca-seg-ready"
                                style={{ width: `${readyPct}%` }}
                              />
                            )}
                            {pendingPct > 0 && (
                              <div
                                className="ca-seg-pending"
                                style={{ width: `${pendingPct}%` }}
                              />
                            )}
                          </div>
                        </Tooltip>
                      </div>

                      <div className="ca-multi-submetrics">
                        <span className="ca-submetric-pill">
                          <span>📦 Demand:</span> <strong>{orderedStr}</strong>
                        </span>
                        <span className="ca-submetric-pill pill-dispatched">
                          <span>🚚 Dispatched:</span> <strong>{dispatchedStr}</strong>
                        </span>
                        {readyGross > 0 && (
                          <span className="ca-submetric-pill pill-ready">
                            <span>🛡️ Ready:</span> <strong>{readyStr}</strong>
                          </span>
                        )}
                        {pendingGross > 0 && (
                          <span className="ca-submetric-pill pill-pending">
                            <span>⏳ Pending:</span> <strong>{pendingStr}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ca-dual-right">
                      <Tag
                        color={c.fulfillmentPct >= 100 ? 'success' : c.fulfillmentPct >= 50 ? 'warning' : 'default'}
                        style={{ fontWeight: 800, margin: 0, borderRadius: 6, fontSize: 11 }}
                      >
                        {c.fulfillmentPct}% Fulfilled
                      </Tag>
                      {readyGross > 0 && (
                        <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>
                          +{Math.round((readyGross / Math.max(orderedGross, 1)) * 100)}% Packed Ready
                        </span>
                      )}
                      <span className="ca-dual-fraction">
                        {fmtNum(dispatchedGross, 0)} / {fmtNum(orderedGross, 0)} {cUnit}
                      </span>
                    </div>
                  </div>
                );
              })}
            {customers.filter((c) => !c.isSafetyStock).length === 0 && !loading && (
              <Empty description="No customer data" style={{ padding: 40 }} />
            )}
          </div>
        ) : (
          <div className="ca-dual-chart">
            {itemStats.map((it, i) => {
              const orderedGross = it.totalGross || 0;
              const dispatchedGross = it.totalDispatchedGross || 0;
              const readyGross = it.readyFgrGross || 0;
              const pendingGross = it.balancePendingGross ?? Math.max(0, orderedGross - dispatchedGross);
              const itUnit = it.primaryUom || activeDivisionUnitFallback || 'GRS';

              const sameUnitItems = itemStats.filter(
                (x) => (x.primaryUom || activeDivisionUnitFallback || 'GRS') === itUnit,
              );
              const maxVol = Math.max(
                ...sameUnitItems.map((x) => Math.max(x.totalGross, (x.totalDispatchedGross || 0) + (x.readyFgrGross || 0))),
                1,
              );
              const envelopeTotal = Math.max(orderedGross, dispatchedGross + readyGross);
              const capsuleWidth = Math.min(100, Math.max(8, (envelopeTotal / maxVol) * 100));

              const dispatchedPct = envelopeTotal > 0 ? (dispatchedGross / envelopeTotal) * 100 : 0;
              const readyPct = envelopeTotal > 0 ? (readyGross / envelopeTotal) * 100 : 0;
              const pendingPct = Math.max(0, 100 - dispatchedPct - readyPct);
              const fulfillmentPct =
                orderedGross > 0 ? Math.round((dispatchedGross / orderedGross) * 100) : (dispatchedGross > 0 ? 100 : 0);
              const clr = COLORS[i % COLORS.length];

              return (
                <div key={it.itemCode} className="ca-dual-row">
                  <div className="ca-dual-label">
                    <span className="ca-dual-rank" style={{ color: clr }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <div className="ca-dual-names">
                      <Tooltip title={`${it.itemName} (${it.itemCode})`}>
                        <span className="ca-dual-name">{it.itemName}</span>
                      </Tooltip>
                      <span className="ca-dual-sub">{it.itemCode} • {it.customerCount} Customers</span>
                    </div>
                  </div>

                  <div className="ca-multi-track-wrapper">
                    <div className="ca-multi-track-capsule-outer">
                      <Tooltip
                        title={
                          <div>
                            <div style={{ fontWeight: 800, marginBottom: 4 }}>{it.itemName}</div>
                            <div>📦 Ordered Demand: <strong>{fmtNum(orderedGross, 0)} {itUnit}</strong></div>
                            <div style={{ color: '#818cf8' }}>🚚 Dispatched: <strong>{fmtNum(dispatchedGross, 0)} {itUnit}</strong> ({Math.round((dispatchedGross / Math.max(orderedGross, 1)) * 100)}%)</div>
                            <div style={{ color: '#34d399' }}>🛡️ Ready in Warehouse: <strong>{fmtNum(readyGross, 0)} {itUnit}</strong> ({Math.round((readyGross / Math.max(orderedGross, 1)) * 100)}%)</div>
                            <div style={{ color: '#fbbf24' }}>⏳ Pending Production: <strong>{fmtNum(pendingGross, 0)} {itUnit}</strong></div>
                          </div>
                        }
                      >
                        <div
                          className="ca-multi-track-capsule"
                          style={{ width: `${capsuleWidth}%` }}
                        >
                          {dispatchedPct > 0 && (
                            <div
                              className="ca-seg-dispatched"
                              style={{ width: `${dispatchedPct}%` }}
                            />
                          )}
                          {readyPct > 0 && (
                            <div
                              className="ca-seg-ready"
                              style={{ width: `${readyPct}%` }}
                            />
                          )}
                          {pendingPct > 0 && (
                            <div
                              className="ca-seg-pending"
                              style={{ width: `${pendingPct}%` }}
                            />
                          )}
                        </div>
                      </Tooltip>
                    </div>

                    <div className="ca-multi-submetrics">
                      <span className="ca-submetric-pill">
                        <span>📦 Demand:</span> <strong>{fmtNum(orderedGross, 0)} {itUnit}</strong>
                      </span>
                      <span className="ca-submetric-pill pill-dispatched">
                        <span>🚚 Dispatched:</span> <strong>{fmtNum(dispatchedGross, 0)} {itUnit}</strong>
                      </span>
                      {readyGross > 0 && (
                        <span className="ca-submetric-pill pill-ready">
                          <span>🛡️ Ready:</span> <strong>{fmtNum(readyGross, 0)} {itUnit}</strong>
                        </span>
                      )}
                      {pendingGross > 0 && (
                        <span className="ca-submetric-pill pill-pending">
                          <span>⏳ Pending:</span> <strong>{fmtNum(pendingGross, 0)} {itUnit}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="ca-dual-right">
                    <Tag
                      color={fulfillmentPct >= 100 ? 'success' : fulfillmentPct >= 50 ? 'warning' : 'default'}
                      style={{ fontWeight: 800, margin: 0, borderRadius: 6, fontSize: 11 }}
                    >
                      {fulfillmentPct}% Fulfilled
                    </Tag>
                    {readyGross > 0 && (
                      <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700 }}>
                        +{Math.round((readyGross / Math.max(orderedGross, 1)) * 100)}% Ready
                      </span>
                    )}
                    <span className="ca-dual-fraction">
                      {fmtNum(dispatchedGross, 0)} / {fmtNum(orderedGross, 0)} {itUnit}
                    </span>
                  </div>
                </div>
              );
            })}
            {itemStats.length === 0 && !loading && (
              <Empty description="No item data" style={{ padding: 40 }} />
            )}
          </div>
        )}
      </div>

      {/* ── Tabs: Pending | Done | All | Items ── */}
      <div className="ca-section">
        <div className="ca-section-toolbar">
          <div className="ca-tabs">
            <button
              type="button"
              className={`ca-tab ca-tab-pending ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <ClockCircleOutlined /> Pending ({pendingCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ca-tab-done ${activeTab === 'done' ? 'active' : ''}`}
              onClick={() => setActiveTab('done')}
            >
              <CheckCircleOutlined /> Done ({doneCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ${activeTab === 'all' ? 'active' : ''}`}
              onClick={() => setActiveTab('all')}
            >
              <UserOutlined /> All ({nonSafetyCustomers.length})
            </button>
            <button
              type="button"
              className={`ca-tab ${activeTab === 'items' ? 'active' : ''}`}
              onClick={() => setActiveTab('items')}
            >
              <TagOutlined /> Items ({filteredItemStats.length})
            </button>
          </div>

          <div className="ca-toolbar-right">
            <Input
              prefix={<SearchOutlined />}
              placeholder={
                activeTab === 'items'
                  ? 'Search item code, product name or customer...'
                  : 'Search customer, item or buffer...'
              }
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
              className="ca-search"
            />
            {activeTab !== 'items' && (
              <Select value={sortBy} onChange={setSortBy} className="ca-sort-select">
                <Option value="dispatched">Sort: Dispatched ↓</Option>
                <Option value="packed">Sort: Total Packed ↓</Option>
                <Option value="ready">Sort: Ready to Dispatch ↓</Option>
                <Option value="pending">Sort: Pending ↓</Option>
                <Option value="orders">Sort: Orders ↓</Option>
                <Option value="value">Sort: Value ↓</Option>
              </Select>
            )}
            <div className="ca-view-toggle">
              <button
                type="button"
                className={`ca-toggle-btn ${viewMode === 'card' ? 'active' : ''}`}
                onClick={() => setViewMode('card')}
                title="Card View"
              >
                <AppstoreOutlined />
              </button>
              <button
                type="button"
                className={`ca-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
                title="Table View"
              >
                <UnorderedListOutlined />
              </button>
            </div>
          </div>
        </div>

        <Spin spinning={loading}>
          {activeTab !== 'items' ? (
            viewMode === 'card' ? (
              <div className="ca-cards-carousel-container">
                {/* ── Single-Row Customer Cards Carousel with Side Edge Arrows ── */}
                {pagedCustomers.length > 0 ? (
                  <div className="ca-cards-carousel-viewport">
                    {totalCustomerPages > 1 && (
                      <button
                        className={`ca-carousel-edge-btn ca-edge-prev ${customerPage <= 1 ? 'disabled' : ''}`}
                        onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                        disabled={customerPage <= 1}
                        title="Previous Customers"
                        type="button"
                      >
                        <LeftOutlined />
                      </button>
                    )}

                    <div className="ca-card-grid ca-card-grid-row">
                      {pagedCustomers.map((c, i) => {
                        const globalIdx = (customerPage - 1) * CARDS_PER_ROW + i;
                        const accentColor = getFulfillmentColor(c.fulfillmentPct);
                        const socCount = c.socContracts?.length || c.totalOrders || 0;
                        return (
                          <div
                            key={c.id}
                            className="ca-customer-card ca-customer-card-clickable"
                            style={{ '--accent': accentColor } as any}
                            onClick={() => openCustomerSocModal(c)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openCustomerSocModal(c);
                              }
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div
                                className="ca-card-rank"
                                style={{
                                  color: COLORS[globalIdx % COLORS.length],
                                  margin: 0,
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                {globalIdx === 0 ? '🥇' : globalIdx === 1 ? '🥈' : globalIdx === 2 ? '🥉' : `#${globalIdx + 1}`}
                              </div>
                              <Tag
                                color="blue"
                                style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 6, margin: 0 }}
                              >
                                {socCount} {socCount === 1 ? 'SOC' : 'SOCs'}
                              </Tag>
                            </div>

                            <div className="ca-card-header">
                              <div
                                className="ca-card-avatar"
                                style={{
                                  background: `${accentColor}18`,
                                  color: accentColor,
                                }}
                              >
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="ca-card-info">
                                <div className="ca-card-name" title={c.name}>{c.name}</div>
                                <div className="ca-card-code">{c.customerCode || 'B2B'}</div>
                              </div>
                            </div>

                            <div className="ca-card-progress-row">
                              <span className="ca-card-pct-label">Fulfillment</span>
                              <span
                                className="ca-card-pct"
                                style={{ color: accentColor, fontWeight: 800 }}
                              >
                                {c.fulfillmentPct}%
                              </span>
                            </div>
                            <Progress
                              percent={c.fulfillmentPct}
                              showInfo={false}
                              size="small"
                              strokeColor={accentColor}
                              style={{ marginBottom: 10 }}
                            />

                            <div className="ca-card-stats">
                              {(() => {
                                const cUnit = c.primaryUom || activeDivisionUnitFallback || 'GRS';
                                const cPkg = c.packagingUnitCode || 'CTN';
                                return (
                                  <>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Ordered</div>
                                <div className="ca-stat-val">
                                  {c.isSafetyStock ? '—' : formatCustomerMetric(c.totalOrderedGross, cUnit, c.orderedUomBuckets, true)}
                                </div>
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label" style={{ color: '#0d9488' }}>Total Packed</div>
                                <div className="ca-stat-val" style={{ color: '#0d9488' }}>
                                  {formatCustomerMetric(c.totalPackedGross, cUnit, c.packedUomBuckets, true)}
                                </div>
                                {c.totalPackedCartons > 0 && (
                                  <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600, marginTop: 1 }}>
                                    ({fmtNum(c.totalPackedCartons, 0)} {cPkg})
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Dispatched</div>
                                <div className="ca-stat-val" style={{ color: '#10b981' }}>
                                  {formatCustomerMetric(c.totalDispatchedGross, cUnit, c.dispatchedUomBuckets, true)}
                                </div>
                                {c.totalDispatchedCartons > 0 && (
                                  <div style={{ fontSize: 10, color: '#10b981', fontWeight: 600, marginTop: 1 }}>
                                    ({fmtNum(c.totalDispatchedCartons, 0)} {cPkg})
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat ca-stat-ready">
                                <div className="ca-stat-label ca-stat-label-ready">
                                  READY TO DISPATCH
                                </div>
                                <div className="ca-stat-val ca-stat-val-ready">
                                  {c.readyToDispatchGross > 0
                                    ? formatCustomerMetric(c.readyToDispatchGross, cUnit, c.readyUomBuckets, true)
                                    : `0 ${cUnit}`}
                                </div>
                                {c.readyToDispatchCartons > 0 && (
                                  <div className="ca-stat-sub-ready">
                                    ({fmtNum(c.readyToDispatchCartons, 0)} {cPkg})
                                  </div>
                                )}
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Pending</div>
                                <div
                                  className="ca-stat-val"
                                  style={{
                                    color: c.pendingGross > 0 ? '#f59e0b' : '#10b981',
                                    fontWeight: 700,
                                  }}
                                >
                                  {c.pendingGross > 0 ? formatCustomerMetric(c.pendingGross, cUnit, c.pendingUomBuckets, true) : '✅ Done'}
                                </div>
                              </div>
                              <div className="ca-stat">
                                <div className="ca-stat-label">Orders</div>
                                <div className="ca-stat-val" style={{ color: COLORS[globalIdx % COLORS.length] }}>
                                  {c.totalOrders}
                                </div>
                              </div>
                                  </>
                                );
                              })()}
                            </div>

                            {c.topItem && (
                              <div className="ca-card-item" title={c.topItem}>
                                <TagOutlined style={{ marginRight: 5, flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.topItem}</span>
                              </div>
                            )}

                            <div className="ca-card-footer-row">
                              {c.lastOrderDate ? (
                                <span className="ca-card-date">
                                  Last order: {c.lastOrderDate?.slice(0, 10) || ''}
                                </span>
                              ) : <span />}
                              <span className="ca-card-soc-hint">
                                <FolderOpenOutlined /> View SOCs →
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {totalCustomerPages > 1 && (
                      <button
                        className={`ca-carousel-edge-btn ca-edge-next ${customerPage >= totalCustomerPages ? 'disabled' : ''}`}
                        onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                        disabled={customerPage >= totalCustomerPages}
                        title="Next Customers"
                        type="button"
                      >
                        <RightOutlined />
                      </button>
                    )}
                  </div>
                ) : (
                  <Empty
                    description={
                      activeTab === 'pending'
                        ? 'No customers with pending orders — all orders are 100% fulfilled!'
                        : activeTab === 'done'
                        ? 'No customers have reached 100% order fulfillment yet.'
                        : 'No matching customers found.'
                    }
                    style={{ padding: 48 }}
                  />
                )}

                {/* ── Bottom Pagination Bar: P 1 2 N ── */}
                {totalCustomerPages > 1 && (
                  <div className="ca-carousel-pagination">
                    <button
                      className="ca-carousel-nav-btn"
                      disabled={customerPage <= 1}
                      onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                      type="button"
                    >
                      <LeftOutlined /> Previous
                    </button>
                    <div className="ca-carousel-pages">
                      {Array.from({ length: totalCustomerPages }, (_, idx) => idx + 1).map((p) => (
                        <button
                          key={p}
                          className={`ca-carousel-page-btn ${p === customerPage ? 'active' : ''}`}
                          onClick={() => setCustomerPage(p)}
                          type="button"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <button
                      className="ca-carousel-nav-btn"
                      disabled={customerPage >= totalCustomerPages}
                      onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                      type="button"
                    >
                      Next <RightOutlined />
                    </button>
                  </div>
                )}

                {/* ── Permanent Dedicated Safety Stock Buffer Dock Below (driven by top header DIVISION) ── */}
                {activeTab === 'all' && safetyStockStat && (
                  <div className="ca-safety-dock">
                    <div className="ca-safety-dock-header">
                      <div className="ca-safety-dock-title-box">
                        <span className="ca-safety-dock-icon">🛡️</span>
                        <div>
                          <div className="ca-safety-dock-title">
                            Safety Stock Buffer Warehouse
                            <Tag color="cyan" style={{ marginLeft: 8, fontWeight: 700, borderRadius: 4 }}>
                              Permanent Buffer
                            </Tag>
                            <Tag color="blue" style={{ marginLeft: 4, fontWeight: 600, borderRadius: 4 }}>
                              {selectedDivisionName}
                            </Tag>
                          </div>
                          <div className="ca-safety-dock-desc">
                            Finished goods held in safety buffer inventory for {selectedDivisionName} — dynamically calculated from Item Master UOM conversions
                          </div>
                        </div>
                      </div>
                      <div className="ca-safety-dock-controls">
                        <div className="ca-safety-dock-kpis">
                          <div className="ca-dock-kpi">
                            <span className="ca-dock-kpi-label">{safetyBufferSummary.volumeLabel}</span>
                            <span className="ca-dock-kpi-val">
                              {safetyBufferSummary.volumeTotals.length > 0 ? (
                                <span className="ca-dock-kpi-multi">
                                  {safetyBufferSummary.volumeTotals.map((t, idx) => (
                                    <React.Fragment key={t.unitCode}>
                                      {idx > 0 && <span className="ca-dock-kpi-sep">·</span>}
                                      <span>
                                        {fmtNum(t.value, t.decimals)} {t.unitCode}
                                      </span>
                                    </React.Fragment>
                                  ))}
                                </span>
                              ) : (
                                '0'
                              )}
                            </span>
                          </div>
                          <div className="ca-dock-kpi">
                            <span className="ca-dock-kpi-label">{safetyBufferSummary.packageLabel}</span>
                            <span className="ca-dock-kpi-val">
                              {safetyBufferSummary.packageTotals.length > 0 ? (
                                <span className="ca-dock-kpi-multi">
                                  {safetyBufferSummary.packageTotals.map((t, idx) => (
                                    <React.Fragment key={t.unitCode}>
                                      {idx > 0 && <span className="ca-dock-kpi-sep">·</span>}
                                      <span>
                                        {fmtNum(t.value, t.decimals)} {t.unitCode}
                                      </span>
                                    </React.Fragment>
                                  ))}
                                </span>
                              ) : (
                                '0'
                              )}
                            </span>
                          </div>
                          <div className="ca-dock-kpi">
                            <span className="ca-dock-kpi-label">Batches</span>
                            <span className="ca-dock-kpi-val">{safetyBufferSummary.batchCount} Batches</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {safetyBufferSummary.items.length > 0 ? (
                      <div className="ca-safety-dock-items">
                        {safetyBufferSummary.items.map((it) => {
                          const specFormula = [
                            `Base UOM: ${it.baseUomCode}`,
                            it.salesUomCode && it.salesUomCode !== it.baseUomCode ? `Sales UOM: ${it.salesUomCode}` : null,
                            it.packagingSize && it.packagingSize > 0
                              ? `Packaging: ${it.packagingSize} ${it.salesUomCode || it.baseUomCode} / ${it.packagingUnit || it.packagingUnitCode || 'PKG'}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' | ');
                          return (
                            <div key={it.itemCode} className="ca-dock-item-card">
                              <div className="ca-dock-item-top">
                                <span className="ca-dock-item-code">{it.itemCode}</span>
                                <div className="ca-dock-item-badges">
                                  {it.divisionName && (
                                    <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 600 }}>
                                      {it.divisionCode || it.divisionName}
                                    </Tag>
                                  )}
                                  <Tag color="green" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                                    Available
                                  </Tag>
                                </div>
                              </div>
                              <div className="ca-dock-item-name" title={it.itemName}>
                                {it.itemName}
                              </div>
                              <Tooltip title={specFormula || undefined}>
                                <div className="ca-dock-item-bottom">
                                  {it.metrics.map((m) => (
                                    <div
                                      key={m.code}
                                      className={
                                        m.role === 'packaging'
                                          ? 'ca-dock-item-ctn'
                                          : m.role === 'sales'
                                          ? 'ca-dock-item-grs'
                                          : 'ca-dock-item-pcs'
                                      }
                                    >
                                      {fmtNum(m.value, m.decimals)} {m.code}
                                    </div>
                                  ))}
                                </div>
                              </Tooltip>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ padding: '18px 8px' }}>
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          description={
                            <span style={{ color: token.colorTextSecondary }}>
                              No safety stock buffer inventory found for {selectedDivisionName}.
                            </span>
                          }
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Table
                size="small"
                dataSource={tableCustomers}
                rowKey="id"
                columns={tableColumns}
                pagination={{ pageSize: 20, showSizeChanger: true }}
                className="ca-table"
                onRow={(record) => ({
                  onClick: () => {
                    if (!record.isSafetyStock) {
                      openCustomerSocModal(record);
                    }
                  },
                  style: { cursor: record.isSafetyStock ? 'default' : 'pointer' },
                })}
              />
            )
          ) : (
            viewMode === 'card' ? (
              filteredItemStats.length > 0 ? (
                <div className="ca-item-pro-grid">
                  {filteredItemStats.map((it, i) => {
                    const accentClr = COLORS[i % COLORS.length];
                    const itemUnit = it.primaryUom || 'GRS';
                    const itemPkgUnit = it.packagingUnitCode || (it.isGrossUnit === false ? 'PKG' : 'CTN');
                    const isItemGross = it.isGrossUnit !== false;
                    const fgrCoveragePct = isItemGross
                      ? it.totalOrderedKgs > 0
                        ? Math.min(100, Math.round((it.readyFgrKgs / it.totalOrderedKgs) * 100))
                        : it.totalGross > 0
                        ? Math.min(100, Math.round((it.readyFgrGross / it.totalGross) * 100))
                        : it.readyFgrGross > 0
                        ? 100
                        : 0
                      : it.totalGross > 0
                      ? Math.min(100, Math.round((it.readyFgrGross / it.totalGross) * 100))
                      : it.readyFgrGross > 0
                      ? 100
                      : 0;
                    const fgrStatusColor = getFulfillmentColor(fgrCoveragePct);
                    const associatedCusts =
                      it.customers && it.customers.length > 0
                        ? it.customers
                        : it.customerNames.map((n) => ({ customerId: n, customerName: n }));

                    const pendingDispatchTone = it.undispatchedGross > 0 ? 'ca-val-amber' : 'ca-val-emerald';
                    const pendingProdTone = it.balancePendingGross > 0 ? 'ca-val-rose' : 'ca-val-emerald';
                    const matrixSegments = [
                      {
                        key: 'ordered',
                        segClass: 'ca-matrix-seg-ordered',
                        dotColor: '#6366f1',
                        title: 'A. Total Order Requirements',
                        weightLabel: 'Total Weight',
                        weightVal: it.totalOrderedKgs,
                        pkgLabel: isItemGross ? 'Total Cartons' : `Total ${itemPkgUnit}`,
                        pkgVal: it.totalCartons,
                        primaryLabel: isItemGross ? 'Total Gross' : `Total ${itemUnit}`,
                        primaryVal: it.totalGross,
                        pcsLabel: 'Total Pieces',
                        pcsVal: it.totalPieces,
                        weightCls: 'ca-val-primary',
                        pkgCls: 'ca-val-indigo',
                        primaryCls: 'ca-val-primary',
                        pcsCls: 'ca-val-teal',
                      },
                      {
                        key: 'dispatch',
                        segClass: 'ca-matrix-seg-dispatch',
                        dotColor: '#f59e0b',
                        title: 'B. Pending Dispatch (To Ship)',
                        weightLabel: 'Bal. Weight',
                        weightVal: it.undispatchedKgs,
                        pkgLabel: isItemGross ? 'Bal. Cartons' : `Bal. ${itemPkgUnit}`,
                        pkgVal: it.undispatchedCartons,
                        primaryLabel: isItemGross ? 'Bal. Gross' : `Bal. ${itemUnit}`,
                        primaryVal: it.undispatchedGross,
                        pcsLabel: 'Bal. Pieces',
                        pcsVal: it.undispatchedPieces,
                        weightCls: it.undispatchedKgs > 0 ? 'ca-val-amber' : 'ca-val-emerald',
                        pkgCls: it.undispatchedCartons > 0 ? 'ca-val-amber' : pendingDispatchTone,
                        primaryCls: pendingDispatchTone,
                        pcsCls: it.undispatchedPieces > 0 ? 'ca-val-amber' : 'ca-val-emerald',
                      },
                      {
                        key: 'fgr',
                        segClass: 'ca-matrix-seg-fgr',
                        dotColor: '#10b981',
                        title: 'C. Current Inventory & Ready Stock (FGR)',
                        weightLabel: 'Ready Weight',
                        weightVal: it.readyFgrKgs,
                        pkgLabel: isItemGross ? 'Ready Cartons' : `Ready ${itemPkgUnit}`,
                        pkgVal: it.readyFgrCartons,
                        primaryLabel: isItemGross ? 'Ready Gross' : `Ready ${itemUnit}`,
                        primaryVal: it.readyFgrGross,
                        pcsLabel: 'Ready Pieces',
                        pcsVal: it.readyFgrPieces,
                        weightCls: 'ca-val-emerald',
                        pkgCls: 'ca-val-teal',
                        primaryCls: 'ca-val-emerald',
                        pcsCls: 'ca-val-teal',
                      },
                      {
                        key: 'production',
                        segClass: 'ca-matrix-seg-production',
                        dotColor: it.balancePendingGross > 0 ? '#ef4444' : '#10b981',
                        title: 'D. Pending Production (To Produce)',
                        weightLabel: 'Prod. Weight',
                        weightVal: it.balancePendingKgs,
                        pkgLabel: isItemGross ? 'Prod. Cartons' : `Prod. ${itemPkgUnit}`,
                        pkgVal: it.balancePendingCartons,
                        primaryLabel: isItemGross ? 'Prod. Gross' : `Prod. ${itemUnit}`,
                        primaryVal: it.balancePendingGross,
                        pcsLabel: 'Prod. Pieces',
                        pcsVal: it.balancePendingPieces,
                        weightCls: it.balancePendingKgs > 0 ? 'ca-val-rose' : 'ca-val-emerald',
                        pkgCls: it.balancePendingCartons > 0 ? 'ca-val-rose' : pendingProdTone,
                        primaryCls: pendingProdTone,
                        pcsCls: it.balancePendingPieces > 0 ? 'ca-val-rose' : 'ca-val-emerald',
                      },
                    ];

                    return (
                      <div
                        key={it.itemCode}
                        className="ca-item-pro-card"
                        style={{ '--item-accent': accentClr } as React.CSSProperties}
                      >
                        {/* ── Top Identity & Customer Badge Bar ── */}
                        <div className="ca-item-pro-top">
                          <div className="ca-item-pro-rank-wrap">
                            <span
                              className="ca-item-pro-rank"
                              style={{ color: accentClr, borderColor: `${accentClr}44`, background: `${accentClr}14` }}
                            >
                              #{i + 1}
                            </span>
                            <span className="ca-item-pro-grs-pill">
                              {fmtNum(it.totalGross, 0)} {itemUnit} Demand
                            </span>
                          </div>

                          <button
                            type="button"
                            className="ca-item-cust-badge"
                            title="Click to inspect customer Sales Order Contracts (SOC)"
                            onClick={() => {
                              const firstCust = associatedCusts[0];
                              if (firstCust) openCustomerByNameOrRef(firstCust);
                            }}
                          >
                            <UserOutlined />
                            <span>
                              {it.customerCount} {it.customerCount === 1 ? 'Customer' : 'Customers'}
                            </span>
                          </button>
                        </div>

                        {/* ── Primary Identifier: Bold Prominent Item Code & Product Name ── */}
                        <div className="ca-item-pro-identity">
                          <div
                            className="ca-item-pro-avatar"
                            style={{ background: `${accentClr}1f`, color: accentClr }}
                          >
                            <InboxOutlined />
                          </div>
                          <div className="ca-item-pro-titles">
                            <div className="ca-item-pro-code" title={it.itemCode}>
                              {it.itemCode}
                            </div>
                            <div className="ca-item-pro-name" title={it.itemName}>
                              {it.itemName}
                            </div>
                          </div>
                        </div>

                        {/* ── FGR Readiness Progress Strip ── */}
                        <div className="ca-item-pro-progress">
                          <div className="ca-item-pro-progress-hdr">
                            <span className="ca-item-pro-progress-lbl">FGR Stock Coverage</span>
                            <span
                              className="ca-item-pro-progress-val"
                              style={{ color: fgrStatusColor }}
                            >
                              {fgrCoveragePct}% Ready in FGR
                            </span>
                          </div>
                          <Progress
                            percent={fgrCoveragePct}
                            showInfo={false}
                            size="small"
                            strokeColor={fgrStatusColor}
                            style={{ margin: 0 }}
                          />
                        </div>

                        {/* ── 4-Segment Structured Inventory Matrix (A, B, C, D) ── */}
                        <div className="ca-item-matrix">
                          {matrixSegments.map((seg) => (
                            <div key={seg.key} className={`ca-matrix-segment ${seg.segClass}`}>
                              <div className="ca-matrix-seg-header">
                                <span className="ca-matrix-seg-dot" style={{ background: seg.dotColor }} />
                                <span className="ca-matrix-seg-title">{seg.title}</span>
                              </div>
                              <div className="ca-matrix-cells">
                                <div className="ca-matrix-col">
                                  {isItemGross && (
                                    <div className="ca-matrix-subrow">
                                      <span className="ca-matrix-cell-label">{seg.weightLabel}</span>
                                      <span className={`ca-matrix-cell-val ${seg.weightCls}`}>
                                        {fmtNum(seg.weightVal, 1)} <small>KGS</small>
                                      </span>
                                    </div>
                                  )}
                                  <div className="ca-matrix-subrow">
                                    <span className="ca-matrix-cell-label">{seg.pkgLabel}</span>
                                    <span className={`ca-matrix-cell-val ${seg.pkgCls}`}>
                                      {fmtNum(seg.pkgVal, 1)} <small>{itemPkgUnit}</small>
                                    </span>
                                  </div>
                                </div>
                                <div className="ca-matrix-col">
                                  <div className="ca-matrix-subrow">
                                    <span className="ca-matrix-cell-label">{seg.primaryLabel}</span>
                                    <span className={`ca-matrix-cell-val ${seg.primaryCls}`}>
                                      {fmtNum(seg.primaryVal, 0)} <small>{itemUnit}</small>
                                    </span>
                                  </div>
                                  {isItemGross && (
                                    <div className="ca-matrix-subrow">
                                      <span className="ca-matrix-cell-label">{seg.pcsLabel}</span>
                                      <span className={`ca-matrix-cell-val ${seg.pcsCls}`}>
                                        {fmtNum(seg.pcsVal, 0)} <small>PCS</small>
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* ── Associated Customers Quick View (Interactive Hyperlinks/Tags) ── */}
                        <div className="ca-item-pro-customers">
                          <div className="ca-item-pro-cust-hdr">
                            <UserOutlined style={{ color: accentClr }} />
                            <span>Associated Customers (Click to drill down into SOCs):</span>
                          </div>
                          <div className="ca-item-pro-cust-tags">
                            {associatedCusts.map((cust) => (
                              <button
                                key={cust.customerId + cust.customerName}
                                type="button"
                                className="ca-item-cust-chip"
                                onClick={() => openCustomerByNameOrRef(cust)}
                                title={`Open SOC Contracts for ${cust.customerName}`}
                              >
                                <span>{cust.customerName}</span>
                                <RightOutlined className="ca-item-cust-chip-arrow" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Empty description="No matching items found." style={{ padding: 48 }} />
              )
            ) : (
              <Table
                size="small"
                dataSource={filteredItemStats}
                rowKey="itemCode"
                columns={itemColumns}
                pagination={{ pageSize: 20 }}
                className="ca-table"
              />
            )
          )}
        </Spin>
      </div>

      {/* ── Layer 2 & Layer 3 Drill-Down Modal: SOC Summary -> Item-Wise Order Details ── */}
      <DraggableResizableModal
        open={Boolean(selectedCustomerModal)}
        onCancel={closeCustomerSocModal}
        footer={null}
        width={1180}
        height={700}
        centered
        destroyOnClose
        className="ca-soc-modal"
        title={
          selectedCustomerModal ? (
            <div className="ca-soc-modal-header">
              <div
                className="ca-soc-modal-avatar"
                style={{
                  background: `${getFulfillmentColor(selectedCustomerModal.fulfillmentPct)}22`,
                  color: getFulfillmentColor(selectedCustomerModal.fulfillmentPct),
                }}
              >
                {selectedCustomerModal.name.charAt(0).toUpperCase()}
              </div>
              <div className="ca-soc-modal-title-wrap">
                <div className="ca-soc-modal-title-row">
                  <span className="ca-soc-modal-cust-name">{selectedCustomerModal.name}</span>
                  <Tag color="geekblue" style={{ margin: 0, fontWeight: 700 }}>
                    {selectedCustomerModal.customerCode || 'B2B'}
                  </Tag>
                  <Tag
                    color={
                      selectedCustomerModal.fulfillmentPct >= 100 && selectedCustomerModal.pendingGross <= 0
                        ? 'success'
                        : 'warning'
                    }
                    style={{ margin: 0, fontWeight: 700 }}
                  >
                    {selectedCustomerModal.fulfillmentPct >= 100 && selectedCustomerModal.pendingGross <= 0
                      ? '100% Fulfilled (Done)'
                      : `${selectedCustomerModal.fulfillmentPct}% Fulfilled • Pending`}
                  </Tag>
                </div>
                <div className="ca-soc-modal-subtitle">
                  {selectedSocContract
                    ? `Layer 3 Drill-Down • Item-Wise Order Details for ${selectedSocContract.socNumber}`
                    : 'Layer 2 Drill-Down • Click any Sales Order Contract (SOC) Number below to inspect item-wise order details'}
                </div>
              </div>
            </div>
          ) : null
        }
      >
        {selectedCustomerModal && (() => {
          const fmtCleanCtn = (ctn: number) => {
            const clean = cleanDisplayNumber(ctn);
            return fmtNum(clean.value, clean.decimals);
          };
          const modalFallbackUom = selectedCustomerModal.primaryUom || activeDivisionUnitFallback || 'GRS';
          const socUnit = selectedSocContract
            ? selectedSocContract.primaryUom || modalFallbackUom
            : modalFallbackUom;
          const socPkgUnit = selectedSocContract
            ? selectedSocContract.packagingUnitCode ||
              (socUnit === 'GRS' ? 'CTN' : selectedSocContract.items[0]?.packagingUnitCode || 'PKG')
            : selectedCustomerModal.packagingUnitCode || (modalFallbackUom === 'GRS' ? 'CTN' : 'PKG');
          const socIsGross = selectedSocContract
            ? selectedSocContract.items.every((i) => i.isGrossUnit !== false)
            : selectedCustomerModal.isGrossUnit !== false;

          const formatSocSubLine = (
            pkgCount: number,
            pcsCount: number,
            pkgCode: string,
            isGrossItem: boolean,
            extraSuffix?: string,
          ) => {
            const base = isGrossItem
              ? `${fmtCleanCtn(pkgCount)} ${pkgCode} • ${fmtNum(pcsCount, 0)} PCS`
              : `${fmtCleanCtn(pkgCount)} ${pkgCode}`;
            return extraSuffix ? `${base} • ${extraSuffix}` : base;
          };

          return (
          <div className="ca-soc-modal-body">
            {/* Customer Summary Strip */}
            <div className="ca-soc-kpi-strip">
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Total SOC Contracts</span>
                <span className="ca-soc-kpi-val" style={{ color: token.colorPrimary }}>
                  {selectedCustomerModal.socContracts?.length || selectedCustomerModal.totalOrders || 0}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Ordered Qty</span>
                <span className="ca-soc-kpi-val">
                  {formatCustomerMetric(
                    selectedCustomerModal.totalOrderedGross,
                    modalFallbackUom,
                    selectedCustomerModal.orderedUomBuckets,
                    true,
                  )}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Packed Qty</span>
                <span className="ca-soc-kpi-val" style={{ color: '#0d9488' }}>
                  {formatCustomerMetric(
                    selectedCustomerModal.totalPackedGross,
                    modalFallbackUom,
                    selectedCustomerModal.packedUomBuckets,
                    true,
                  )}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Dispatched Qty</span>
                <span className="ca-soc-kpi-val" style={{ color: '#0284c7' }}>
                  {formatCustomerMetric(
                    selectedCustomerModal.totalDispatchedGross,
                    modalFallbackUom,
                    selectedCustomerModal.dispatchedUomBuckets,
                    true,
                  )}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Ready to Dispatch</span>
                <span className="ca-soc-kpi-val" style={{ color: '#10b981' }}>
                  {formatCustomerMetric(
                    selectedCustomerModal.readyToDispatchGross,
                    modalFallbackUom,
                    selectedCustomerModal.readyUomBuckets,
                    true,
                  )}
                </span>
              </div>
              <div className="ca-soc-kpi-box">
                <span className="ca-soc-kpi-label">Remaining Pending</span>
                <span
                  className="ca-soc-kpi-val"
                  style={{
                    color: selectedCustomerModal.pendingGross > 0 ? '#f59e0b' : '#10b981',
                  }}
                >
                  {formatCustomerMetric(
                    selectedCustomerModal.pendingGross,
                    modalFallbackUom,
                    selectedCustomerModal.pendingUomBuckets,
                    true,
                  )}
                </span>
              </div>
            </div>

            {!selectedSocContract ? (
              /* ── LAYER 2: SOC Summary List ── */
              <div className="ca-soc-list-section">
                <div className="ca-soc-section-heading">
                  <span>
                    <FileTextOutlined style={{ marginRight: 6, color: token.colorPrimary }} />
                    Sales Order Contracts (SOC) — Select an SOC Number to view item-wise breakdown
                  </span>
                  <span className="ca-soc-count-badge">
                    {selectedCustomerModal.socContracts?.length || 0} Contracts
                  </span>
                </div>

                {selectedCustomerModal.socContracts && selectedCustomerModal.socContracts.length > 0 ? (
                  <div className="ca-soc-grid">
                    {selectedCustomerModal.socContracts.map((soc) => {
                      const socColor = getFulfillmentColor(soc.fulfillmentPct);
                      const isDone = soc.fulfillmentPct >= 100 && soc.totalPendingQty <= 0;
                      const cardUom = soc.primaryUom || modalFallbackUom;
                      return (
                        <div
                          key={soc.orderId + soc.socNumber}
                          className="ca-soc-card"
                          onClick={() => setSelectedSocNumber(soc.socNumber)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedSocNumber(soc.socNumber);
                            }
                          }}
                        >
                          <div className="ca-soc-card-top">
                            <button
                              type="button"
                              className="ca-soc-number-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedSocNumber(soc.socNumber);
                              }}
                            >
                              <FileTextOutlined />
                              <span>{soc.socNumber}</span>
                            </button>
                            <div className="ca-soc-card-badges">
                              {soc.orderDate && (
                                <span className="ca-soc-date">
                                  {String(soc.orderDate).slice(0, 10)}
                                </span>
                              )}
                              <Tag
                                color={isDone ? 'success' : soc.totalDispatchedQty > 0 ? 'processing' : 'warning'}
                                style={{ margin: 0, fontWeight: 700, fontSize: 11 }}
                              >
                                {isDone ? 'Done (100%)' : soc.totalDispatchedQty > 0 ? 'Partial' : 'Pending'}
                              </Tag>
                            </div>
                          </div>

                          <div className="ca-soc-card-metrics">
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Items</span>
                              <span className="ca-soc-metric-val">{soc.items.length}</span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Ordered</span>
                              <span className="ca-soc-metric-val">
                                {fmtNum(soc.totalOrderedQty, 0)} {cardUom}
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl" style={{ color: '#0d9488' }}>Packed</span>
                              <span className="ca-soc-metric-val" style={{ color: '#0d9488' }}>
                                {fmtNum(soc.totalPackedQty, 0)} {cardUom}
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl" style={{ color: '#0284c7' }}>Dispatched</span>
                              <span className="ca-soc-metric-val" style={{ color: '#0284c7' }}>
                                {fmtNum(soc.totalDispatchedQty, 0)} {cardUom}
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl" style={{ color: '#10b981' }}>Ready FG</span>
                              <span className="ca-soc-metric-val" style={{ color: '#10b981' }}>
                                {fmtNum(soc.totalReadyToDispatchQty, 0)} {cardUom}
                              </span>
                            </div>
                            <div className="ca-soc-metric">
                              <span className="ca-soc-metric-lbl">Balance</span>
                              <span
                                className="ca-soc-metric-val"
                                style={{ color: soc.totalPendingQty > 0 ? '#f59e0b' : '#10b981' }}
                              >
                                {soc.totalPendingQty > 0 ? `${fmtNum(soc.totalPendingQty, 0)} ${cardUom}` : `0 ${cardUom}`}
                              </span>
                            </div>
                          </div>

                          <div className="ca-soc-card-bottom">
                            <div className="ca-soc-progress-wrap">
                              <Progress
                                percent={soc.fulfillmentPct}
                                size="small"
                                strokeColor={socColor}
                                format={(p) => (
                                  <span style={{ color: socColor, fontWeight: 800, fontSize: 11 }}>{p}%</span>
                                )}
                              />
                            </div>
                            <span className="ca-soc-drill-link">
                              View Item Details <RightOutlined style={{ fontSize: 10 }} />
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <Empty description="No SOC contracts found for this customer." style={{ padding: 32 }} />
                )}
              </div>
            ) : (
              /* ── LAYER 3: Item-Wise Order Details for Selected SOC ── */
              <div className="ca-soc-detail-section">
                <div className="ca-soc-detail-nav">
                  <button
                    type="button"
                    className="ca-soc-back-btn"
                    onClick={() => setSelectedSocNumber(null)}
                  >
                    <ArrowLeftOutlined /> Back to All SOC Contracts
                  </button>

                  {selectedCustomerModal.socContracts && selectedCustomerModal.socContracts.length > 1 && (
                    <div className="ca-soc-Quick-pills">
                      {selectedCustomerModal.socContracts.map((s) => (
                        <button
                          key={s.socNumber}
                          type="button"
                          className={`ca-soc-pill ${s.socNumber === selectedSocContract.socNumber ? 'active' : ''}`}
                          onClick={() => setSelectedSocNumber(s.socNumber)}
                        >
                          {s.socNumber}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="ca-soc-active-banner">
                  <div className="ca-soc-active-left">
                    <span className="ca-soc-active-tag">
                      <FileTextOutlined /> {selectedSocContract.socNumber}
                    </span>
                    {selectedSocContract.orderDate && (
                      <span className="ca-soc-active-date">
                        Contract Date: {String(selectedSocContract.orderDate).slice(0, 10)}
                      </span>
                    )}
                  </div>
                  <div className="ca-soc-active-right">
                    <span>
                      Ordered: <strong>{fmtNum(selectedSocContract.totalOrderedQty, 0)} {socUnit}</strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: '#0d9488' }}>
                      Packed: <strong>{fmtNum(selectedSocContract.totalPackedQty, 0)} {socUnit}</strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: '#0284c7' }}>
                      Dispatched: <strong>{fmtNum(selectedSocContract.totalDispatchedQty, 0)} {socUnit}</strong>
                    </span>
                    <span>•</span>
                    <span className="ca-soc-ready-banner-chip">
                      Ready to Dispatch:{' '}
                      <strong>
                        {fmtNum(selectedSocContract.totalReadyToDispatchQty, 0)} {socUnit} (
                        {fmtCleanCtn(selectedSocContract.totalReadyToDispatchCartons)} {socPkgUnit})
                      </strong>
                    </span>
                    <span>•</span>
                    <span style={{ color: selectedSocContract.totalPendingQty > 0 ? '#f59e0b' : '#10b981' }}>
                      Remaining Balance: <strong>{fmtNum(selectedSocContract.totalPendingQty, 0)} {socUnit}</strong>
                    </span>
                  </div>
                </div>

                <Table
                  size="small"
                  rowKey="key"
                  pagination={false}
                  scroll={{ x: 960 }}
                  dataSource={selectedSocContract.items}
                  className="ca-table ca-soc-item-table"
                  columns={[
                    {
                      title: '#',
                      key: 'idx',
                      width: 44,
                      render: (_: any, __: SocItemDetail, idx: number) => (
                        <span style={{ fontWeight: 700, color: token.colorTextSecondary }}>
                          {idx + 1}
                        </span>
                      ),
                    },
                    {
                      title: 'ITEM NAME',
                      key: 'itemName',
                      width: 280,
                      render: (_: any, item: SocItemDetail) => {
                        const splitName = splitItemDisplayName(item.itemName);
                        return (
                          <div>
                            {item.itemCode && (
                              <div>
                                <span className="ca-soc-item-code-pill">{item.itemCode}</span>
                              </div>
                            )}
                            <div className="ca-soc-item-name-main">{splitName.primary}</div>
                            {splitName.secondary && (
                              <div className="ca-soc-item-name-sub">{splitName.secondary}</div>
                            )}
                          </div>
                        );
                      },
                    },
                    {
                      title: 'ORDERED QTY',
                      key: 'orderedQty',
                      align: 'right' as const,
                      width: 145,
                      render: (_: any, item: SocItemDetail) => {
                        const uom = item.primaryUom || socUnit;
                        const pkg = item.packagingUnitCode || socPkgUnit;
                        const isGrossItem = item.isGrossUnit !== false;
                        return (
                          <div>
                            <div style={{ fontWeight: 700, color: token.colorText, fontSize: 13 }}>
                              {fmtNum(item.orderedQty, 0)} {uom}
                            </div>
                            <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                              {formatSocSubLine(item.orderedCartons, item.orderedPcs, pkg, isGrossItem)}
                            </div>
                          </div>
                        );
                      },
                    },
                    {
                      title: 'PACKED QTY',
                      key: 'packedQty',
                      align: 'right' as const,
                      width: 145,
                      render: (_: any, item: SocItemDetail) => {
                        const uom = item.primaryUom || socUnit;
                        const pkg = item.packagingUnitCode || socPkgUnit;
                        const isGrossItem = item.isGrossUnit !== false;
                        return (
                          <div>
                            <div style={{ fontWeight: 700, color: '#0d9488', fontSize: 13 }}>
                              {fmtNum(item.packedQty, 0)} {uom}
                            </div>
                            <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                              {formatSocSubLine(item.packedCartons, item.packedPcs, pkg, isGrossItem)}
                            </div>
                          </div>
                        );
                      },
                    },
                    {
                      title: 'DISPATCHED QTY',
                      key: 'dispatchedQty',
                      align: 'right' as const,
                      width: 145,
                      render: (_: any, item: SocItemDetail) => {
                        const uom = item.primaryUom || socUnit;
                        const pkg = item.packagingUnitCode || socPkgUnit;
                        const isGrossItem = item.isGrossUnit !== false;
                        return (
                          <div>
                            <div style={{ fontWeight: 700, color: '#0284c7', fontSize: 13 }}>
                              {fmtNum(item.dispatchedQty, 0)} {uom}
                            </div>
                            <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                              {formatSocSubLine(item.dispatchedCartons, item.dispatchedPcs, pkg, isGrossItem)}
                            </div>
                          </div>
                        );
                      },
                    },
                    {
                      title: (
                        <span style={{ color: '#10b981', fontWeight: 800 }}>
                          READY TO DISPATCH
                        </span>
                      ),
                      key: 'readyToDispatchQty',
                      align: 'right' as const,
                      width: 170,
                      render: (_: any, item: SocItemDetail) => {
                        const uom = item.primaryUom || socUnit;
                        const pkg = item.packagingUnitCode || socPkgUnit;
                        const isGrossItem = item.isGrossUnit !== false;
                        const hasReady = item.readyToDispatchQty > 0;
                        return (
                          <div className={hasReady ? 'ca-soc-ready-pill' : undefined}>
                            <div
                              style={{
                                fontWeight: 800,
                                color: hasReady ? '#10b981' : token.colorTextSecondary,
                                fontSize: 13,
                              }}
                            >
                              {fmtNum(item.readyToDispatchQty, 0)} {uom}
                            </div>
                            <div style={{ fontSize: 10.5, color: token.colorTextSecondary, whiteSpace: 'nowrap' }}>
                              {formatSocSubLine(item.readyToDispatchCartons, item.readyToDispatchPcs, pkg, isGrossItem)}
                            </div>
                          </div>
                        );
                      },
                    },
                    {
                      title: 'REMAINING ORDER BALANCE',
                      key: 'remainingPendingQty',
                      align: 'right' as const,
                      width: 195,
                      render: (_: any, item: SocItemDetail) => {
                        const uom = item.primaryUom || socUnit;
                        const pkg = item.packagingUnitCode || socPkgUnit;
                        const isGrossItem = item.isGrossUnit !== false;
                        return (
                          <div>
                            <div
                              style={{
                                fontWeight: 800,
                                color: item.remainingPendingQty > 0 ? '#f59e0b' : '#10b981',
                                fontSize: 13,
                              }}
                            >
                              {item.remainingPendingQty > 0
                                ? `${fmtNum(item.remainingPendingQty, 0)} ${uom}`
                                : `0 ${uom} (Done)`}
                            </div>
                            <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                              {formatSocSubLine(
                                item.remainingPendingCartons,
                                item.remainingPendingPcs,
                                pkg,
                                isGrossItem,
                                `${item.fulfillmentPct}%`,
                              )}
                            </div>
                            {item.remainingPendingQty > 0 && (
                              <div className="ca-soc-topack-sub">
                                {item.toPackQty > 0
                                  ? `To Pack: ${fmtNum(item.toPackQty, 0)} ${uom} (${fmtCleanCtn(item.toPackCartons)} ${pkg})`
                                  : 'Fully Packed • Ready to Ship'}
                              </div>
                            )}
                          </div>
                        );
                      },
                    },
                  ]}
                  summary={() => (
                    <Table.Summary fixed>
                      <Table.Summary.Row className="ca-soc-summary-row">
                        <Table.Summary.Cell index={0} colSpan={2}>
                          <strong>Contract Total ({selectedSocContract.items.length} Items)</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={2} align="right">
                          <div>
                            <strong>{fmtNum(selectedSocContract.totalOrderedQty, 0)} {socUnit}</strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {formatSocSubLine(selectedSocContract.totalOrderedCartons, selectedSocContract.totalOrderedPcs, socPkgUnit, socIsGross)}
                          </div>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={3} align="right">
                          <div>
                            <strong style={{ color: '#0d9488' }}>
                              {fmtNum(selectedSocContract.totalPackedQty, 0)} {socUnit}
                            </strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {formatSocSubLine(selectedSocContract.totalPackedCartons, selectedSocContract.totalPackedPcs, socPkgUnit, socIsGross)}
                          </div>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={4} align="right">
                          <div>
                            <strong style={{ color: '#0284c7' }}>
                              {fmtNum(selectedSocContract.totalDispatchedQty, 0)} {socUnit}
                            </strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {formatSocSubLine(selectedSocContract.totalDispatchedCartons, selectedSocContract.totalDispatchedPcs, socPkgUnit, socIsGross)}
                          </div>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={5} align="right">
                          <div>
                            <strong style={{ color: '#10b981' }}>
                              {fmtNum(selectedSocContract.totalReadyToDispatchQty, 0)} {socUnit}
                            </strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {formatSocSubLine(selectedSocContract.totalReadyToDispatchCartons, selectedSocContract.totalReadyToDispatchPcs, socPkgUnit, socIsGross)}
                          </div>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={6} align="right">
                          <div>
                            <strong
                              style={{
                                color: selectedSocContract.totalPendingQty > 0 ? '#f59e0b' : '#10b981',
                              }}
                            >
                              {fmtNum(selectedSocContract.totalPendingQty, 0)} {socUnit}
                            </strong>
                          </div>
                          <div style={{ fontSize: 10.5, color: token.colorTextSecondary }}>
                            {formatSocSubLine(selectedSocContract.totalPendingCartons, selectedSocContract.totalPendingPcs, socPkgUnit, socIsGross)}
                          </div>
                          {selectedSocContract.totalToPackQty > 0 && (
                            <div className="ca-soc-topack-sub">
                              To Pack: {fmtNum(selectedSocContract.totalToPackQty, 0)} {socUnit} ({fmtCleanCtn(selectedSocContract.totalToPackCartons)} {socPkgUnit})
                            </div>
                          )}
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  )}
                />
              </div>
            )}
          </div>
          );
        })()}
      </DraggableResizableModal>
    </div>
  );
};

export default CustomerAnalytics;
