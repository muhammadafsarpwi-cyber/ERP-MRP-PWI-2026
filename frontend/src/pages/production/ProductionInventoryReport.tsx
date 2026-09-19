import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Badge, Button, Card, Checkbox, Col, DatePicker, Descriptions, Empty, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  AimOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  AuditOutlined,
  BarChartOutlined,
  BarcodeOutlined,
  BranchesOutlined,
  BuildOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FilterOutlined,
  FolderOpenOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  GoldOutlined,
  HistoryOutlined,
  InboxOutlined,
  MailOutlined,
  MinusOutlined,
  NodeIndexOutlined,
  PrinterOutlined,
  ReloadOutlined,
  SafetyOutlined,
  SearchOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  WarningOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import dashboardService, { FilterOption } from '../../services/dashboardService';
import { PageHeader, EmptyState, LargeLoadingBuffer } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { formatDimension } from '../../utils/numberFormat';
import { ITEM_TYPES } from '../master-data/items/itemTypes';
import './productionInventoryReport.css';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

/* ── Types (mirror backend responses) ─────────────────────────────────── */

interface MovementTypeDef { value: string; label: string; }

interface ReportFilters {
  divisionId?: string;
  departmentId?: string;
  itemId?: string;
  itemType?: string;
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface ReportFlowRef {
  itemId: string;
  itemCode: string;
  itemName: string;
  inScope: boolean;
}

interface ReportRow {
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomCode: string | null;
  wireSizeMm: number | null;
  thicknessMm: number | null;
  widthMm: number | null;
  divisionId: string | null;
  divisionName: string | null;
  sectionName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  consumed: number;
  produced: number;
  required: number;
  closingBalance: number;
  onHand: number;
  reserved: number;
  available: number;
  lastMovementDate: string | null;
  movementType: string | null;
  shortage: number;
  status: 'SHORT' | 'OK';
  reconciled?: boolean;
  flow?: {
    source: ReportFlowRef | null;
    consumers: ReportFlowRef[];
    flowStatus: 'SOURCE' | 'CHAIN';
  };
}

interface ReportSummary {
  itemCount: number;
  onHand: number;
  reserved: number;
  available: number;
  totalIn: number;
  totalOut: number;
  scrapOut: number;
  consumed: number;
  produced: number;
  required: number;
  shortItems: number;
  rawMaterialItems?: number;
  wipItems: number;
  finishedGoodsItems?: number;
  storeItems?: number;
  otherItems?: number;
  reconciledItems?: number;
  flowSourceItems?: number;
  flowChainItems?: number;
  flowConsumersPresent?: number;
  movementTypes: MovementTypeDef[];
}

interface ReportResponse {
  filters: ReportFilters & { movementTypes: MovementTypeDef[] };
  summary: ReportSummary;
  items: ReportRow[];
}

export interface JourneyStage {
  stageNumber: number;
  stageKey: string;
  stageName: string;
  departmentName: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uom: string;
  isCurrentItem: boolean;
  items?: Array<{ id: string; itemCode: string; name: string; department?: string }>;
}

interface LedgerRow {
  id: string;
  transactionDate: string;
  transactionType: string;
  direction: string;
  quantity: number;
  item: { id: string; itemCode: string; name: string } | null;
  warehouse: { id: string; warehouseCode: string; name: string } | null;
  uom: { id: string; code: string } | null;
  batch: { id: string; batchNumber: string } | null;
  division: { id: string; name: string } | null;
  section: { id: string; name: string } | null;
  department: { id: string; name: string } | null;
  destinationDepartment?: string | null;
  producingItem?: { id: string; itemCode: string; name: string } | null;
  productionEntry?: {
    id: string;
    entryNumber: string;
    departmentName: string | null;
    itemCode: string | null;
    itemName: string | null;
  } | null;
  referenceType: string | null;
  referenceId: string | null;
  referenceNumber: string | null;
  notes: string | null;
  runningBalance: number;
}

interface LedgerDetail {
  item: { id: string; itemCode: string; name: string; itemType: string; wireSizeMm?: number | null; thicknessMm?: number | null; widthMm?: number | null; uom?: { id: string; code: string; name: string } | null; department?: { id: string; name: string } | null; division?: { id: string; name: string } | null; section?: { id: string; name: string } | null } | null;
  openingBalance: number;
  rows: LedgerRow[];
  closingBalance: number;
  totalIn: number;
  totalOut: number;
  truncated: boolean;
  totalLedgerRows: number;
  journey?: JourneyStage[];
}

/* ── Formatting: Clean Integer Representation without unwanted Decimals ─ */

const formatInt = (v: number | null | undefined): string => {
  if (v == null || isNaN(Number(v))) return '-';
  return Math.round(Number(v)).toLocaleString('en-US');
};

const dateShort = (v?: string | null): string => (v ? new Date(v).toISOString().slice(0, 10) : '-');
const dateTime = (v?: string | null): string =>
  v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const specLine = (r: ReportRow): string => {
  if (r.thicknessMm != null || r.widthMm != null) return `${formatDimension(r.thicknessMm)} × ${formatDimension(r.widthMm)}`;
  if (r.wireSizeMm != null) return `${formatDimension(r.wireSizeMm)} mm`;
  return '';
};

const MovementTag: React.FC<{ value: string; direction: string }> = ({ value, direction }) => {
  const isIn = direction === 'IN';
  return (
    <div className={`erp-mvt-pill ${isIn ? 'erp-mvt-pill--in' : 'erp-mvt-pill--out'}`}>
      {isIn ? <ArrowDownOutlined style={{ fontSize: 10 }} /> : <ArrowUpOutlined style={{ fontSize: 10 }} />}
      <span>{direction} • {value}</span>
    </div>
  );
};

const FlowCell: React.FC<{ flow?: ReportRow['flow'] }> = ({ flow }) => {
  if (!flow) return <Text type="secondary">—</Text>;
  const refTag = (r: ReportFlowRef) => (
    <Tag color={r.inScope ? 'blue' : 'default'} title={r.inScope ? r.itemName : `${r.itemName} (out of scope)`}>
      {r.itemCode}
    </Tag>
  );
  return (
    <Space direction="vertical" size={2}>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 11 }}><ArrowUpOutlined /> source</Text>
        {flow.source ? refTag(flow.source) : <Tag color="green">SOURCE</Tag>}
      </Space>
      <Space size={4}>
        <Text type="secondary" style={{ fontSize: 11 }}><ArrowDownOutlined /> feeds</Text>
        {flow.consumers.length > 0 ? (
          <Space size={4} wrap>{flow.consumers.map((c) => <span key={c.itemId}>{refTag(c)}</span>)}</Space>
        ) : (
          <Tag>LEAF</Tag>
        )}
      </Space>
    </Space>
  );
};

/* ── 2027 KPI Card Component with Background Watermark Icon ───────────── */
interface KpiCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'primary' | 'success' | 'info' | 'warning' | 'danger' | 'cyan' | 'purple';
}

const KpiCard: React.FC<KpiCardProps> = ({ title, value, icon: Icon, variant = 'primary' }) => (
  <Card size="small" className={`erp-kpi-card erp-kpi-card--${variant}`}>
    <Icon className="erp-kpi-card__watermark" />
    <div className="erp-kpi-card__header">
      <span className="erp-kpi-card__title">
        <Icon className="erp-kpi-card__icon" />
        {title}
      </span>
    </div>
    <div className="erp-kpi-card__value">
      {formatInt(value)}
    </div>
  </Card>
);

interface InventoryReportTabCache {
  report: ReportResponse;
  divisions?: FilterOption[];
  movementTypes?: MovementTypeDef[];
  masterItemTypes?: Array<{ id: string; code: string; name: string; status: string }>;
}

const ProductionInventoryReport: React.FC = () => {
  const tabKey = '/production/inventory-report';
  const cachedTab = useMemo(() => tabSessionCache.get<InventoryReportTabCache>(tabKey), []);

  const [loading, setLoading] = useState(!cachedTab);
  const [error, setError] = useState<string | null>(null);
  const isInitialMount = useRef(true);

  // Quick live search filter on loaded items
  const [searchTerm, setSearchTerm] = useState('');

  // Advanced Filters
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<ReportFilters>({});
  const [applied, setApplied] = useState<ReportFilters>({});

  const [divisions, setDivisions] = useState<FilterOption[]>(() => cachedTab?.divisions ?? []);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [movementTypes, setMovementTypes] = useState<MovementTypeDef[]>(() => cachedTab?.movementTypes ?? []);
  const [masterItemTypes, setMasterItemTypes] = useState<Array<{ id: string; code: string; name: string; status: string }>>(
    () => cachedTab?.masterItemTypes ?? []
  );

  // Modals
  const [ledger, setLedger] = useState<LedgerDetail | null>(null);
  const [ledgerVisible, setLedgerVisible] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<ReportRow | null>(null);
  const [isLedgerMaximized, setIsLedgerMaximized] = useState(false);
  const [isLedgerMinimized, setIsLedgerMinimized] = useState(false);

  // Category quick filter state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Multi-item row selection for WhatsApp & batch export
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // End-to-End Material Flow & Journey Modal
  const [journeyModalVisible, setJourneyModalVisible] = useState(false);
  const [journeyItem, setJourneyItem] = useState<ReportRow | LedgerDetail['item'] | null>(null);
  const [journeyData, setJourneyData] = useState<JourneyStage[]>([]);
  const [isJourneyModalMaximized, setIsJourneyModalMaximized] = useState(false);
  const [journeyModalPos, setJourneyModalPos] = useState({ x: 0, y: 0 });

  // Multi-Department Report Modal
  const [deptModalVisible, setDeptModalVisible] = useState(false);
  const [selectedDivisionForDept, setSelectedDivisionForDept] = useState<string | undefined>(undefined);
  const [availableDeptsForDivision, setAvailableDeptsForDivision] = useState<FilterOption[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);
  const [isDeptModalMaximized, setIsDeptModalMaximized] = useState(false);

  // Department Items Detail Breakdown Modal
  const [deptItemsModalVisible, setDeptItemsModalVisible] = useState(false);
  const [selectedDeptForItems, setSelectedDeptForItems] = useState<{
    departmentId: string;
    departmentName: string;
    itemCount: number;
    opening: number;
    totalIn: number;
    totalOut: number;
    closing: number;
    onHand: number;
    available: number;
    produced: number;
    required: number;
    consumed: number;
    scrap: number;
    shortItems: number;
    items: ReportRow[];
  } | null>(null);
  const [deptItemsSearchText, setDeptItemsSearchText] = useState('');

  const handleViewDeptItems = (dept: {
    departmentId: string;
    departmentName: string;
    itemCount: number;
    opening: number;
    totalIn: number;
    totalOut: number;
    closing: number;
    onHand: number;
    available: number;
    produced: number;
    required: number;
    consumed: number;
    scrap: number;
    shortItems: number;
    items: ReportRow[];
  }) => {
    setSelectedDeptForItems(dept);
    setDeptItemsSearchText('');
    setDeptItemsModalVisible(true);
  };

  // Draggable Modal Offset refs
  const [ledgerModalPos, setLedgerModalPos] = useState({ x: 0, y: 0 });
  const [deptModalPos, setDeptModalPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  const typeLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of masterItemTypes) m.set(t.code, t.name || t.code);
    for (const t of ITEM_TYPES) if (!m.has(t.value)) m.set(t.value, t.label);
    return m;
  }, [masterItemTypes]);
  const itemTypeLabel = useCallback((v: string): string => typeLabelMap.get(v) ?? v, [typeLabelMap]);
  const itemTypeOptions = useMemo(
    () => (masterItemTypes.length > 0
      ? masterItemTypes.map((t) => ({ value: t.code, label: t.name || t.code }))
      : ITEM_TYPES),
    [masterItemTypes],
  );

  const [report, setReport] = useState<ReportResponse | null>(() => cachedTab?.report ?? null);

  // Compute effective divisions merging API data with any unique divisions from report items
  const effectiveDivisions = useMemo(() => {
    const list = [...(divisions || [])];
    const seenIds = new Set(list.map((d) => d.id));
    (report?.items || []).forEach((it) => {
      if (it.divisionId && !seenIds.has(it.divisionId)) {
        seenIds.add(it.divisionId);
        list.push({ id: it.divisionId, name: it.divisionName || it.divisionId });
      }
    });
    return list;
  }, [divisions, report?.items]);

  // Always fetch filter metadata on mount so dropdowns are never left empty
  useEffect(() => {
    dashboardService.getFilterDivisions().then((res) => {
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setDivisions(res.data);
      }
    }).catch(() => {});

    apiService.get<{ data: MovementTypeDef[] }>('/production/inventory-report/movement-types').then((res) => {
      if (Array.isArray(res.data) && res.data.length > 0) {
        setMovementTypes(res.data);
      }
    }).catch(() => {});

    apiService.get<{ data: Array<{ id: string; code: string; name: string; status: string }> }>('/master-data/item-types', { limit: 500 }).then((res) => {
      if (Array.isArray(res.data) && res.data.length > 0) {
        setMasterItemTypes(res.data);
      }
    }).catch(() => {});
  }, []);

  // Sync loaded divisions into tabSessionCache
  useEffect(() => {
    if (divisions.length > 0) {
      const cached = tabSessionCache.get<InventoryReportTabCache>(tabKey);
      if (cached) {
        tabSessionCache.set<InventoryReportTabCache>(tabKey, {
          ...cached,
          divisions,
        });
      }
    }
  }, [divisions]);

  // Automatically select a division for multi-department modal if none selected
  useEffect(() => {
    if (!selectedDivisionForDept && effectiveDivisions.length > 0) {
      const target = applied.divisionId || effectiveDivisions[0]?.id;
      if (target) setSelectedDivisionForDept(target);
    }
  }, [selectedDivisionForDept, effectiveDivisions, applied.divisionId]);

  // Department cascade for filters
  useEffect(() => {
    setDepartments([]);
    setFilter((prev) => ({ ...prev, departmentId: undefined }));
    dashboardService.getFilterDepartments(filter.divisionId).then((res) => {
      if (res?.success && Array.isArray(res.data)) setDepartments(res.data);
    }).catch(() => {});
  }, [filter.divisionId]);

  // Department cascade for multi-department modal with automatic report-items fallback
  useEffect(() => {
    if (!selectedDivisionForDept) {
      setAvailableDeptsForDivision([]);
      setSelectedDeptIds([]);
      return;
    }
    dashboardService.getFilterDepartments(selectedDivisionForDept).then((res) => {
      if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
        setAvailableDeptsForDivision(res.data);
        setSelectedDeptIds(res.data.map((d) => d.id));
      } else {
        const deptMap = new Map<string, string>();
        (report?.items || []).forEach((it) => {
          if (it.divisionId === selectedDivisionForDept && it.departmentId && it.departmentName) {
            deptMap.set(it.departmentId, it.departmentName);
          }
        });
        const fallback = Array.from(deptMap.entries()).map(([id, name]) => ({ id, name }));
        setAvailableDeptsForDivision(fallback);
        setSelectedDeptIds(fallback.map((d) => d.id));
      }
    }).catch(() => {
      const deptMap = new Map<string, string>();
      (report?.items || []).forEach((it) => {
        if (it.divisionId === selectedDivisionForDept && it.departmentId && it.departmentName) {
          deptMap.set(it.departmentId, it.departmentName);
        }
      });
      const fallback = Array.from(deptMap.entries()).map(([id, name]) => ({ id, name }));
      setAvailableDeptsForDivision(fallback);
      setSelectedDeptIds(fallback.map((d) => d.id));
    });
  }, [selectedDivisionForDept, report?.items]);

  const loadReport = useCallback(async (f: ReportFilters) => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    Object.entries(f).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    });
    try {
      const res = await apiService.get<{ data: ReportResponse }>('/production/inventory-report', params);
      setReport(res.data);
      tabSessionCache.set<InventoryReportTabCache>(tabKey, {
        report: res.data,
        divisions: divisions.length > 0 ? divisions : cachedTab?.divisions,
        movementTypes: movementTypes.length > 0 ? movementTypes : cachedTab?.movementTypes,
        masterItemTypes: masterItemTypes.length > 0 ? masterItemTypes : cachedTab?.masterItemTypes,
      });
      if (!params.itemId) setFilter((prev) => ({ ...prev, itemId: undefined }));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load the Production Inventory Report');
    } finally {
      setLoading(false);
    }
  }, [divisions, movementTypes, masterItemTypes, cachedTab]);

  useEffect(() => {
    if (tabSessionCache.has(tabKey)) {
      return;
    }
    void loadReport({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || detail.tabId.startsWith('/production/inventory-report')) {
        tabSessionCache.remove(tabKey);
        void loadReport(applied);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [loadReport, applied]);

  const applyFilters = () => {
    setApplied(filter);
    void loadReport(filter);
  };

  const resetFilters = () => {
    const cleared: ReportFilters = {};
    setFilter(cleared);
    setApplied(cleared);
    void loadReport(cleared);
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (applied.divisionId) count++;
    if (applied.departmentId) count++;
    if (applied.itemId) count++;
    if (applied.itemType) count++;
    if (applied.movementType) count++;
    if (applied.dateFrom || applied.dateTo) count++;
    return count;
  }, [applied]);

  const openLedger = async (row: ReportRow) => {
    setLedgerVisible(true);
    setIsLedgerMinimized(false);
    setLedgerLoading(true);
    setLedger(null);
    setSelectedRow(row);
    setLedgerModalPos({ x: 0, y: 0 });
    const params: Record<string, string> = {};
    if (applied.dateFrom) params.dateFrom = applied.dateFrom;
    if (applied.dateTo) params.dateTo = applied.dateTo;
    if (applied.movementType) params.movementType = applied.movementType;
    try {
      const res = await apiService.get<{ data: LedgerDetail }>(`/production/inventory-report/${row.itemId}/ledger`, params);
      setLedger(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load the stock ledger drill-down');
    } finally {
      setLedgerLoading(false);
    }
  };

  // Dynamic Category Counts strictly adding up to total items
  const categoryCounts = useMemo(() => {
    const items = report?.items || [];
    let rm = 0;
    let wip = 0;
    let fg = 0;
    let store = 0;
    let other = 0;
    items.forEach((item) => {
      const t = (item.itemType || '').toUpperCase();
      if (t === 'RAW_MATERIAL') rm++;
      else if (t === 'SEMI_FINISHED' || t === 'WORK_IN_PROGRESS') wip++;
      else if (t === 'FINISHED_GOOD') fg++;
      else if (['CONSUMABLE', 'SPARE_PART', 'PACKAGING_MATERIAL'].includes(t)) store++;
      else other++;
    });
    return {
      total: items.length,
      rm,
      wip,
      fg,
      store,
      other,
    };
  }, [report?.items]);

  // Instant client-side category + search filtering
  const filteredItems = useMemo(() => {
    if (!report?.items || !Array.isArray(report.items)) return [];
    let items = report.items;

    // Filter by category if selected
    if (selectedCategory && selectedCategory !== 'ALL') {
      items = items.filter((r) => {
        const t = (r.itemType || '').toUpperCase();
        if (selectedCategory === 'RAW_MATERIAL') return t === 'RAW_MATERIAL';
        if (selectedCategory === 'WIP') return t === 'SEMI_FINISHED' || t === 'WORK_IN_PROGRESS';
        if (selectedCategory === 'FINISHED_GOOD') return t === 'FINISHED_GOOD';
        if (selectedCategory === 'STORE') return ['CONSUMABLE', 'SPARE_PART', 'PACKAGING_MATERIAL'].includes(t);
        if (selectedCategory === 'OTHER') return !['RAW_MATERIAL', 'SEMI_FINISHED', 'WORK_IN_PROGRESS', 'FINISHED_GOOD', 'CONSUMABLE', 'SPARE_PART', 'PACKAGING_MATERIAL'].includes(t);
        return true;
      });
    }

    if (!searchTerm.trim()) return items;
    const q = searchTerm.toLowerCase().trim();
    return items.filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q) ||
        (r.divisionName && r.divisionName.toLowerCase().includes(q)) ||
        (r.departmentName && r.departmentName.toLowerCase().includes(q)) ||
        (r.itemType && r.itemType.toLowerCase().includes(q))
    );
  }, [report?.items, selectedCategory, searchTerm]);

  // Multi-item batch selected rows
  const selectedRows = useMemo(() => {
    if (!report?.items) return [];
    const set = new Set(selectedRowKeys);
    return report.items.filter((r) => set.has(r.itemId));
  }, [report?.items, selectedRowKeys]);

  const handleShareBatchWhatsApp = () => {
    if (selectedRows.length === 0) return;
    const lines = [
      `*${dynamicReportTitle.company}*`,
      `*Production Inventory — Batch Summary (${selectedRows.length} Items)*`,
      `Division: ${dynamicReportTitle.divName} | Dept: ${dynamicReportTitle.deptName}`,
      `Date: ${dayjs().format('DD MMM YYYY, HH:mm')}`,
      `-----------------------------------------`,
    ];
    selectedRows.forEach((r, idx) => {
      lines.push(
        `*${idx + 1}. ${r.itemCode}* — ${r.itemName}`,
        `   • Type: ${itemTypeLabel(r.itemType)} | Dept: ${r.departmentName || '-'}`,
        `   • Opening: ${formatInt(r.openingBalance)} | IN: ${formatInt(r.totalIn)} | OUT: ${formatInt(r.totalOut)}`,
        `   • Closing: ${formatInt(r.closingBalance)} | On Hand: ${formatInt(r.onHand)}`,
        r.flow ? `   • Flow: ${r.flow.flowStatus === 'SOURCE' ? 'SOURCE (Feeds production)' : `Fed by ${r.flow.source?.itemCode || '-'}`}` : '',
        `-----------------------------------------`
      );
    });
    lines.push(`_Generated from PWI ERP System_`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`, '_blank');
  };

  const handleExportSelectedCSV = () => {
    if (selectedRows.length === 0) return;
    const header = [
      'Item Code', 'Item Name', 'Type', 'UOM', 'Division', 'Department',
      'Opening', 'IN', 'OUT', 'Closing', 'On Hand', 'Available', 'Produced',
      'Required', 'Consumed', 'Scrap', 'Shortage', 'Status',
    ];
    const csvLines = [
      `"${dynamicReportTitle.company}"`,
      `"Selected Batch Items (${selectedRows.length})"`,
      '',
      header.join(','),
    ];
    selectedRows.forEach((r) => {
      csvLines.push([
        r.itemCode,
        `"${r.itemName.replace(/"/g, '""')}"`,
        r.itemType,
        r.uomCode || '',
        `"${r.divisionName || ''}"`,
        `"${r.departmentName || ''}"`,
        Math.round(r.openingBalance),
        Math.round(r.totalIn),
        Math.round(r.totalOut),
        Math.round(r.closingBalance),
        Math.round(r.onHand),
        Math.round(r.available),
        Math.round(r.produced),
        Math.round(r.required),
        Math.round(r.consumed),
        Math.round(r.scrapOut),
        Math.round(r.shortage),
        r.status,
      ].join(','));
    });
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `selected-batch-items-${dayjs().format('YYYY-MM-DD-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Fallback & Journey Modal Openers ───────────────────────────────── */
  const buildFallbackJourney = (row: ReportRow | LedgerDetail['item']): JourneyStage[] => {
    if (!row) return [];
    const itemCode = 'itemCode' in row ? row.itemCode : '';
    const itemName = 'name' in row ? row.name : ('itemName' in row ? (row as any).itemName : '');
    const itemType = 'itemType' in row ? row.itemType : 'RAW_MATERIAL';
    const deptName = 'departmentName' in row ? (row as any).departmentName : (row as any).department?.name || 'SPI Stores';
    const uom = 'uomCode' in row ? (row as any).uomCode : (row as any).uom?.code || 'KG';
    const flow = 'flow' in row ? (row as any).flow : null;

    const isSource = flow?.flowStatus === 'SOURCE' || !flow?.source;
    const stages: JourneyStage[] = [];

    stages.push({
      stageNumber: 1,
      stageKey: 'RM_RECEIPT',
      stageName: isSource ? 'Raw Material Stores / Receipt' : 'Input Material Source',
      departmentName: isSource ? deptName : (flow?.source?.itemName || 'SPI Stores'),
      itemCode: isSource ? itemCode : (flow?.source?.itemCode || 'RM-SOURCE'),
      itemName: isSource ? itemName : (flow?.source?.itemName || 'Raw Material Input'),
      itemType: isSource ? itemType : 'RAW_MATERIAL',
      uom,
      isCurrentItem: isSource,
    });

    if (!isSource) {
      stages.push({
        stageNumber: 2,
        stageKey: 'PRIMARY_PROCESS',
        stageName: 'Primary Processing / Straightening Dept',
        departmentName: deptName || 'Straightening Dept',
        itemCode,
        itemName,
        itemType,
        uom,
        isCurrentItem: true,
      });
    }

    if (flow?.consumers && flow.consumers.length > 0) {
      stages.push({
        stageNumber: stages.length + 1,
        stageKey: 'INTERMEDIATE_PROCESS',
        stageName: 'Secondary Processing / Swaging Dept',
        departmentName: 'Swaging Dept',
        itemCode: flow.consumers.map((c: any) => c.itemCode).join(', '),
        itemName: flow.consumers.map((c: any) => c.itemName).join(', '),
        itemType: 'SEMI_FINISHED',
        uom,
        isCurrentItem: false,
        items: flow.consumers.map((c: any) => ({ id: c.itemId, itemCode: c.itemCode, name: c.itemName })),
      });
    }

    stages.push({
      stageNumber: stages.length + 1,
      stageKey: 'DISPATCH',
      stageName: 'Customer Dispatch & Sales (Outward)',
      departmentName: 'Dispatch & Logistics',
      itemCode: 'DISPATCH',
      itemName: 'Dispatched to Customer in KG',
      itemType: 'DISPATCH',
      uom: 'KG',
      isCurrentItem: false,
    });

    return stages;
  };

  const openJourney = async (row: ReportRow) => {
    setJourneyItem(row);
    setJourneyModalVisible(true);
    setJourneyModalPos({ x: 0, y: 0 });
    try {
      const res = await apiService.get<{ data: LedgerDetail }>(`/production/inventory-report/${row.itemId}/ledger`);
      if (res.data?.journey && res.data.journey.length > 0) {
        setJourneyData(res.data.journey);
      } else {
        setJourneyData(buildFallbackJourney(row));
      }
    } catch {
      setJourneyData(buildFallbackJourney(row));
    }
  };

  const openJourneyFromLedger = (ld: LedgerDetail) => {
    if (!ld.item) return;
    setJourneyItem(ld.item);
    setJourneyModalVisible(true);
    setJourneyModalPos({ x: 0, y: 0 });
    if (ld.journey && ld.journey.length > 0) {
      setJourneyData(ld.journey);
    } else {
      setJourneyData(buildFallbackJourney(ld.item));
    }
  };

  const handleShareJourneyWhatsApp = () => {
    if (!journeyItem) return;
    const itemCode = 'itemCode' in journeyItem ? journeyItem.itemCode : '';
    const itemName = 'name' in journeyItem ? journeyItem.name : ('itemName' in journeyItem ? (journeyItem as any).itemName : '');
    const lines = [
      `*${dynamicReportTitle.company}*`,
      `*End-to-End Material Flow & Traceability Journey*`,
      `Item: *${itemCode}* — ${itemName}`,
      `Date: ${dayjs().format('DD MMM YYYY, HH:mm')}`,
      `-----------------------------------------`,
    ];
    journeyData.forEach((st) => {
      lines.push(
        `*Stage ${st.stageNumber}: ${st.stageName}*`,
        `   • Dept: ${st.departmentName}`,
        `   • Item: ${st.itemCode} (${st.itemName})`,
        `   • Unit: ${st.uom}`,
        st.isCurrentItem ? `   • _[CURRENT INSPECTED ITEM]_` : '',
        `-----------------------------------------`
      );
    });
    lines.push(`_Generated from PWI ERP System_`);
    window.open(`https://wa.me/?text=${encodeURIComponent(lines.filter(Boolean).join('\n'))}`, '_blank');
  };

  const itemOptions = useMemo(
    () => (Array.isArray(report?.items) ? report.items : []).map((i) => ({ value: i.itemId, label: `${i.itemCode} - ${i.itemName}` })),
    [report],
  );

  const movementLabel = (v: string): string => (movementTypes || []).find((m) => m.value === v)?.label || v;
  const movementSelectOptions = (movementTypes || []).map((m) => ({ value: m.value, label: m.label }));

  // Formatted report header description for exports / print
  const dynamicReportTitle = useMemo(() => {
    const divName = applied.divisionId ? (effectiveDivisions.find((d) => d.id === applied.divisionId)?.name || applied.divisionId) : 'All Divisions';
    const deptName = applied.departmentId ? departments.find((d) => d.id === applied.departmentId)?.name : 'All Departments';
    const dateStr = applied.dateFrom || applied.dateTo ? `${applied.dateFrom || 'Start'} to ${applied.dateTo || 'Present'}` : 'All Time';
    return {
      company: 'PAKISTAN WIRE INDUSTRIES (PVT) LTD',
      title: 'Production Inventory Report',
      subtitle: `Division: ${divName} | Department: ${deptName} | Date Range: ${dateStr}`,
      divName,
      deptName,
      dateStr,
    };
  }, [applied, effectiveDivisions, departments]);

  /* ── Export CSV / Excel ─────────────────────────────────────────────── */
  const handleExportCSV = () => {
    const header = [
      'Item Code', 'Item Name', 'Type', 'UOM', 'Division', 'Department',
      'Opening', 'IN', 'OUT', 'Closing', 'On Hand', 'Available', 'Produced',
      'Required', 'Consumed', 'Scrap', 'Shortage', 'Status',
    ];
    const csvLines = [
      `"${dynamicReportTitle.company}"`,
      `"${dynamicReportTitle.title}"`,
      `"${dynamicReportTitle.subtitle}"`,
      '',
      header.join(','),
    ];
    filteredItems.forEach((r) => {
      csvLines.push([
        r.itemCode,
        `"${r.itemName.replace(/"/g, '""')}"`,
        r.itemType,
        r.uomCode || '',
        `"${r.divisionName || ''}"`,
        `"${r.departmentName || ''}"`,
        Math.round(r.openingBalance),
        Math.round(r.totalIn),
        Math.round(r.totalOut),
        Math.round(r.closingBalance),
        Math.round(r.onHand),
        Math.round(r.available),
        Math.round(r.produced),
        Math.round(r.required),
        Math.round(r.consumed),
        Math.round(r.scrapOut),
        Math.round(r.shortage),
        r.status,
      ].join(','));
    });
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production-inventory-${dayjs().format('YYYY-MM-DD-HHmm')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Print / PDF View ─────────────────────────────────────────────────── */
  const handlePrintReport = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = filteredItems.map((r, i) => `
      <tr>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${i + 1}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; font-weight: 600;">${r.itemCode}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${r.itemName}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${r.divisionName || '-'}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px;">${r.departmentName || '-'}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.openingBalance)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; color: #16a34a; font-weight: 600;">${formatInt(r.totalIn)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; color: #dc2626; font-weight: 600;">${formatInt(r.totalOut)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; font-weight: 600;">${formatInt(r.closingBalance)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.onHand)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.available)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.produced)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.required)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.consumed)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right;">${formatInt(r.scrapOut)}</td>
        <td style="border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; ${r.shortage > 0 ? 'color: #dc2626; font-weight: 700;' : ''}">${formatInt(r.shortage)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${dynamicReportTitle.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 20px; font-size: 12px; color: #0f172a; }
            .pwi-header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 14px; }
            .pwi-header h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 0.5px; }
            .pwi-header h2 { margin: 4px 0; font-size: 16px; color: #4338ca; }
            .pwi-header p { margin: 4px 0; font-size: 12px; color: #475569; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 7px 8px; font-size: 11px; text-align: left; }
            th.num { text-align: right; }
            @media print {
              body { margin: 10mm; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="pwi-header">
            <h1>${dynamicReportTitle.company}</h1>
            <h2>${dynamicReportTitle.title}</h2>
            <p><strong>Division:</strong> ${dynamicReportTitle.divName} &nbsp;|&nbsp; <strong>Department:</strong> ${dynamicReportTitle.deptName} &nbsp;|&nbsp; <strong>Date:</strong> ${dynamicReportTitle.dateStr}</p>
            <p style="font-size: 11px; color: #64748b;">Generated: ${dayjs().format('DD-MMM-YYYY HH:mm')} &nbsp;|&nbsp; Items: ${filteredItems.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Division</th>
                <th>Department</th>
                <th class="num">Opening</th>
                <th class="num">IN</th>
                <th class="num">OUT</th>
                <th class="num">Closing</th>
                <th class="num">On Hand</th>
                <th class="num">Available</th>
                <th class="num">Produced</th>
                <th class="num">Required</th>
                <th class="num">Consumed</th>
                <th class="num">Scrap</th>
                <th class="num">Shortage</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  /* ── WhatsApp Sharing ─────────────────────────────────────────────────── */
  const handleShareWhatsApp = () => {
    const s = report?.summary;
    const text = [
      `*${dynamicReportTitle.company}*`,
      `*${dynamicReportTitle.title}*`,
      `Division: ${dynamicReportTitle.divName}`,
      `Department: ${dynamicReportTitle.deptName}`,
      `Date Range: ${dynamicReportTitle.dateStr}`,
      `-----------------------------`,
      `*Total Items:* ${formatInt(s?.itemCount ?? 0)}`,
      `*On Hand Stock:* ${formatInt(s?.onHand ?? 0)}`,
      `*Available Stock:* ${formatInt(s?.available ?? 0)}`,
      `*Total IN (range):* ${formatInt(s?.totalIn ?? 0)}`,
      `*Total OUT (range):* ${formatInt(s?.totalOut ?? 0)}`,
      `*Produced:* ${formatInt(s?.produced ?? 0)}`,
      `*Required:* ${formatInt(s?.required ?? 0)}`,
      `*Short Items:* ${formatInt(s?.shortItems ?? 0)}`,
      `-----------------------------`,
      `_Generated from PWI ERP System_`,
    ].join('\n');

    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  /* ── Multi-Department Aggregated Breakdown ───────────────────────────── */
  const departmentBreakdown = useMemo(() => {
    if (!report?.items || !Array.isArray(report.items) || (selectedDeptIds || []).length === 0) return [];

    const map = new Map<string, {
      departmentId: string;
      departmentName: string;
      itemCount: number;
      opening: number;
      totalIn: number;
      totalOut: number;
      closing: number;
      onHand: number;
      available: number;
      produced: number;
      required: number;
      consumed: number;
      scrap: number;
      shortItems: number;
      items: ReportRow[];
    }>();

    (selectedDeptIds || []).forEach((dId) => {
      const dName = (availableDeptsForDivision || []).find((d) => d.id === dId)?.name || dId;
      map.set(dId, {
        departmentId: dId,
        departmentName: dName,
        itemCount: 0,
        opening: 0,
        totalIn: 0,
        totalOut: 0,
        closing: 0,
        onHand: 0,
        available: 0,
        produced: 0,
        required: 0,
        consumed: 0,
        scrap: 0,
        shortItems: 0,
        items: [],
      });
    });

    (report.items || []).forEach((item) => {
      if (item.departmentId && map.has(item.departmentId)) {
        const d = map.get(item.departmentId)!;
        d.itemCount++;
        d.opening += item.openingBalance;
        d.totalIn += item.totalIn;
        d.totalOut += item.totalOut;
        d.closing += item.closingBalance;
        d.onHand += item.onHand;
        d.available += item.available;
        d.produced += item.produced;
        d.required += item.required;
        d.consumed += item.consumed;
        d.scrap += item.scrapOut;
        if (item.shortage > 0) d.shortItems++;
        d.items.push(item);
      }
    });

    return Array.from(map.values());
  }, [report?.items, selectedDeptIds, availableDeptsForDivision]);

  /* ── Draggable Modal Logic ────────────────────────────────────────────── */
  const handleDragStart = (e: React.MouseEvent, pos: { x: number; y: number }, setPos: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.x;
      const dy = moveEvent.clientY - dragStartRef.current.y;
      setPos({
        x: dragStartRef.current.initialX + dx,
        y: dragStartRef.current.initialY + dy,
      });
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  /* ── Table Columns with Modern 2027 Contextual Icons ──────────────────── */
  const columns: ColumnsType<ReportRow> = [
    {
      title: <span><BarcodeOutlined className="erp-th-icon" />Item</span>,
      key: 'item',
      fixed: 'left',
      width: 260,
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Text strong>{r.itemCode}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.itemName}</Text>
          <Text type="secondary" style={{ fontSize: 10 }}>
            {itemTypeLabel(r.itemType)} · {r.uomCode || '-'}{specLine(r) ? ` · ${specLine(r)}` : ''}
          </Text>
        </Space>
      ),
    },
    {
      title: <span><ApartmentOutlined className="erp-th-icon" />Division</span>,
      key: 'div',
      width: 140,
      render: (_, r) => r.divisionName || '-',
    },
    {
      title: <span><TeamOutlined className="erp-th-icon" />Department</span>,
      key: 'dept',
      width: 150,
      render: (_, r) => r.departmentName || '-',
    },
    {
      title: <span><FolderOpenOutlined className="erp-th-icon" />Opening</span>,
      dataIndex: 'openingBalance',
      key: 'opening',
      align: 'right',
      width: 100,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : 'erp-num--bold'}>{formatInt(v)}</span>,
    },
    {
      title: <span><ArrowDownOutlined className="erp-th-icon" />IN</span>,
      dataIndex: 'totalIn',
      key: 'in',
      align: 'right',
      width: 90,
      render: (v: number) => <span className="erp-num--success">{formatInt(v)}</span>,
    },
    {
      title: <span><ArrowUpOutlined className="erp-th-icon" />OUT</span>,
      dataIndex: 'totalOut',
      key: 'out',
      align: 'right',
      width: 90,
      render: (v: number) => <span className="erp-num--danger">{formatInt(v)}</span>,
    },
    {
      title: <span><CheckSquareOutlined className="erp-th-icon" />Closing</span>,
      dataIndex: 'closingBalance',
      key: 'closing',
      align: 'right',
      width: 100,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : 'erp-num--bold'}>{formatInt(v)}</span>,
    },
    {
      title: <span><DatabaseOutlined className="erp-th-icon" />On Hand</span>,
      dataIndex: 'onHand',
      key: 'onHand',
      align: 'right',
      width: 90,
      render: (v: number) => <span className="erp-num--bold">{formatInt(v)}</span>,
    },
    {
      title: <span><CheckCircleOutlined className="erp-th-icon" />Available</span>,
      dataIndex: 'available',
      key: 'available',
      align: 'right',
      width: 90,
      render: (v: number) => <span className={v < 0 ? 'erp-num--danger' : 'erp-num--bold'}>{formatInt(v)}</span>,
    },
    {
      title: <span><BuildOutlined className="erp-th-icon" />Produced</span>,
      dataIndex: 'produced',
      key: 'produced',
      align: 'right',
      width: 90,
      render: (v: number) => formatInt(v),
    },
    {
      title: <span><AimOutlined className="erp-th-icon" />Required</span>,
      dataIndex: 'required',
      key: 'required',
      align: 'right',
      width: 90,
      render: (v: number) => formatInt(v),
    },
    {
      title: <span><ThunderboltOutlined className="erp-th-icon" />Consumed</span>,
      dataIndex: 'consumed',
      key: 'consumed',
      align: 'right',
      width: 90,
      render: (v: number) => formatInt(v),
    },
    {
      title: <span><DeleteOutlined className="erp-th-icon" />Scrap</span>,
      dataIndex: 'scrapOut',
      key: 'scrap',
      align: 'right',
      width: 80,
      render: (v: number) => formatInt(v),
    },
    {
      title: <span><WarningOutlined className="erp-th-icon" />Shortage</span>,
      key: 'shortage',
      align: 'right',
      width: 110,
      render: (_, r) => (r.shortage > 0 ? <Tag color="red">{formatInt(r.shortage)}</Tag> : <Text type="secondary">—</Text>),
    },
    {
      title: <span><SafetyOutlined className="erp-th-icon" />Status</span>,
      key: 'status',
      width: 90,
      align: 'center',
      render: (_, r) => (r.status === 'SHORT' ? <Tag color="red">SHORT</Tag> : <Tag color="green">OK</Tag>),
    },
    {
      title: <span><AuditOutlined className="erp-th-icon" />Balance</span>,
      key: 'reconciled',
      width: 90,
      align: 'center',
      render: (_, r) => (r.reconciled == null ? <Text type="secondary">—</Text> : r.reconciled ? <Tag color="green">OK</Tag> : <Tag color="red">FAIL</Tag>),
    },
    {
      title: <span><BranchesOutlined className="erp-th-icon" />Flow</span>,
      key: 'flow',
      width: 220,
      render: (_, r) => <FlowCell flow={r.flow} />,
    },
    {
      title: <span><HistoryOutlined className="erp-th-icon" />Last Movement</span>,
      dataIndex: 'lastMovementDate',
      key: 'lastMov',
      width: 120,
      render: (v: string | null) => dateShort(v),
    },
    {
      title: <span><NodeIndexOutlined className="erp-th-icon" />Journey</span>,
      key: 'journeyAction',
      width: 105,
      align: 'center',
      render: (_, r) => (
        <Tooltip title="View Material Flow & Traceability Journey">
          <Button
            size="small"
            icon={<NodeIndexOutlined style={{ color: '#16a34a' }} />}
            onClick={(e) => {
              e.stopPropagation();
              void openJourney(r);
            }}
          >
            Journey
          </Button>
        </Tooltip>
      ),
    },
  ];

  /* ── Ledger Columns ───────────────────────────────────────────────────── */
  const ledgerColumns: ColumnsType<LedgerRow> = [
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'date',
      width: 145,
      render: (v) => <span style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)', whiteSpace: 'nowrap' }}>{dateTime(v)}</span>,
    },
    {
      title: 'Transaction',
      dataIndex: 'transactionType',
      key: 'type',
      width: 220,
      render: (v: string, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
          <MovementTag value={movementLabel(v)} direction={r.direction} />
          <span className="erp-mvt-raw-type">{v}</span>
        </div>
      ),
    },
    {
      title: 'Reference',
      key: 'ref',
      width: 160,
      render: (_, r) => (
        <span style={{ fontWeight: 600, fontSize: 12, fontFamily: 'monospace', color: 'var(--theme-text, #0f172a)' }}>
          {r.referenceNumber || r.referenceType || 'SYSTEM'}
        </span>
      ),
    },
    {
      title: 'Warehouse',
      key: 'wh',
      width: 130,
      render: (_, r) => r.warehouse?.name || 'Main Warehouse',
    },
    {
      title: 'Department / Destination',
      key: 'dept',
      width: 240,
      render: (_, r: any) => {
        const isOut = r.direction === 'OUT';
        const deptLabel = r.destinationDepartment || r.department?.name || (isOut ? 'Production Floor' : 'Warehouse Stores');
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
            <span className={`erp-dest-badge ${isOut ? 'erp-dest-badge--out' : 'erp-dest-badge--in'}`}>
              {isOut ? <ArrowRightOutlined style={{ fontSize: 10 }} /> : <ArrowLeftOutlined style={{ fontSize: 10 }} />}
              {deptLabel}
            </span>
            {r.producingItem && (
              <span
                className="erp-dest-produces-tag"
                title={r.producingItem.name ? `${r.producingItem.itemCode} — ${r.producingItem.name}` : r.producingItem.itemCode}
              >
                Produces: {r.producingItem.itemCode}{r.producingItem.name ? ` — ${r.producingItem.name}` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'qty',
      align: 'right',
      width: 100,
      render: (v: number) => <span className="erp-cell-num" style={{ fontWeight: 600 }}>{formatInt(v)}</span>,
    },
    { title: 'UOM', key: 'uom', width: 65, render: (_, r) => r.uom?.code || '-' },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'running',
      align: 'right',
      width: 120,
      render: (v: number) => (
        <span className={`erp-cell-num ${v < 0 ? 'erp-num--danger' : 'erp-num--bold'}`} style={{ fontWeight: 700 }}>
          {formatInt(v)}
        </span>
      ),
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)' }}>{v || '—'}</span>,
    },
  ];

  /* ── Multi-Department Item Detail Columns ────────────────────────────── */
  const deptItemDetailColumns: ColumnsType<ReportRow> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      key: 'itemCode',
      width: 140,
      render: (code: string, row: ReportRow) => (
        <Tooltip title="Click to view full stock ledger history">
          <Button
            type="link"
            size="small"
            style={{ padding: 0, fontWeight: 700, color: '#2563eb' }}
            onClick={() => openLedger(row)}
          >
            <BarcodeOutlined style={{ marginRight: 4 }} />
            {code}
          </Button>
        </Tooltip>
      ),
    },
    {
      title: 'Item Name / Description',
      dataIndex: 'itemName',
      key: 'itemName',
      render: (name: string, row: ReportRow) => (
        <div>
          <div style={{ fontWeight: 600, color: '#1e293b' }}>{name}</div>
          {(row.wireSizeMm != null || row.thicknessMm != null || row.widthMm != null) && (
            <div style={{ fontSize: 11, color: '#64748b' }}>
              {row.wireSizeMm != null ? `Wire: ${formatDimension(row.wireSizeMm)} mm ` : ''}
              {row.thicknessMm != null ? `Thick: ${formatDimension(row.thicknessMm)} mm ` : ''}
              {row.widthMm != null ? `Width: ${formatDimension(row.widthMm)} mm` : ''}
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Type',
      dataIndex: 'itemType',
      key: 'itemType',
      width: 110,
      render: (type: string) => {
        const color = type === 'RAW_MATERIAL' ? 'blue' : type === 'WIP' ? 'orange' : type === 'FINISHED_GOODS' ? 'green' : 'default';
        return <Tag color={color} style={{ fontSize: 11 }}>{itemTypeLabel(type)}</Tag>;
      },
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 70,
      align: 'center',
      render: (uom: string) => <Tag style={{ margin: 0, fontSize: 11 }}>{uom || '—'}</Tag>,
    },
    {
      title: 'Opening',
      dataIndex: 'openingBalance',
      key: 'openingBalance',
      align: 'right',
      render: (v: number) => formatInt(v),
    },
    {
      title: 'IN',
      dataIndex: 'totalIn',
      key: 'in',
      align: 'right',
      render: (v: number) => <span className="erp-num--success">{formatInt(v)}</span>,
    },
    {
      title: 'OUT',
      dataIndex: 'totalOut',
      key: 'out',
      align: 'right',
      render: (v: number) => <span className="erp-num--danger">{formatInt(v)}</span>,
    },
    {
      title: 'Closing',
      dataIndex: 'closingBalance',
      key: 'closing',
      align: 'right',
      render: (v: number) => <span className="erp-num--bold">{formatInt(v)}</span>,
    },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      key: 'onHand',
      align: 'right',
      render: (v: number) => <span className="erp-num--bold">{formatInt(v)}</span>,
    },
    {
      title: 'Available',
      dataIndex: 'available',
      key: 'available',
      align: 'right',
      render: (v: number) => (
        <span className={`erp-cell-num ${v < 0 ? 'erp-num--danger' : 'erp-num--bold'}`}>{formatInt(v)}</span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 80,
      render: (st: string) => (
        st === 'SHORT' ? <Tag color="red">SHORT</Tag> : <Tag color="green">OK</Tag>
      ),
    },
    {
      title: 'Ledger',
      key: 'ledgerAction',
      align: 'center',
      width: 85,
      render: (_, r: ReportRow) => (
        <Button
          size="small"
          icon={<HistoryOutlined />}
          onClick={() => openLedger(r)}
          style={{ fontSize: 11, padding: '0 8px', height: 24 }}
        >
          Ledger
        </Button>
      ),
    },
  ];

  /* ── Multi-Department Table Columns ───────────────────────────────────── */
  const deptColumns: ColumnsType<typeof departmentBreakdown[0]> = [
    {
      title: 'Department',
      dataIndex: 'departmentName',
      key: 'dept',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'ITEMS',
      dataIndex: 'itemCount',
      key: 'items',
      align: 'center',
      render: (v, record) => {
        if (!v || v === 0) {
          return <Tag color="default" style={{ borderRadius: 10 }}>0 Items</Tag>;
        }
        return (
          <Tooltip title={`Click to view all ${v} items in ${record.departmentName}`}>
            <Button
              type="primary"
              size="small"
              onClick={() => handleViewDeptItems(record)}
              style={{
                backgroundColor: '#2563eb',
                borderColor: '#1d4ed8',
                fontWeight: 700,
                fontSize: 13,
                borderRadius: 14,
                padding: '1px 12px',
                height: 28,
                boxShadow: '0 2px 5px rgba(37,99,235,0.25)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
            >
              <span>{v} Items</span>
              <EyeOutlined style={{ fontSize: 12 }} />
            </Button>
          </Tooltip>
        );
      },
    },
    { title: 'Opening', dataIndex: 'opening', key: 'opening', align: 'right', render: (v) => formatInt(v) },
    { title: 'IN', dataIndex: 'totalIn', key: 'in', align: 'right', render: (v) => <span className="erp-num--success">{formatInt(v)}</span> },
    { title: 'OUT', dataIndex: 'totalOut', key: 'out', align: 'right', render: (v) => <span className="erp-num--danger">{formatInt(v)}</span> },
    { title: 'Closing', dataIndex: 'closing', key: 'closing', align: 'right', render: (v) => <span className="erp-num--bold">{formatInt(v)}</span> },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', align: 'right', render: (v) => <span className="erp-num--bold">{formatInt(v)}</span> },
    { title: 'Available', dataIndex: 'available', key: 'available', align: 'right', render: (v) => formatInt(v) },
    { title: 'Produced', dataIndex: 'produced', key: 'produced', align: 'right', render: (v) => formatInt(v) },
    { title: 'Required', dataIndex: 'required', key: 'required', align: 'right', render: (v) => formatInt(v) },
    { title: 'Consumed', dataIndex: 'consumed', key: 'consumed', align: 'right', render: (v) => formatInt(v) },
    { title: 'Scrap', dataIndex: 'scrap', key: 'scrap', align: 'right', render: (v) => formatInt(v) },
    {
      title: 'Short Items',
      dataIndex: 'shortItems',
      key: 'short',
      align: 'right',
      render: (v) => (v > 0 ? <Tag color="red">{formatInt(v)}</Tag> : <Text type="secondary">0</Text>),
    },
    {
      title: 'Action',
      key: 'action',
      align: 'center',
      render: (_, record) => (
        <Button
          size="small"
          icon={<UnorderedListOutlined />}
          onClick={() => handleViewDeptItems(record)}
          disabled={!record.itemCount || record.itemCount === 0}
        >
          View Items
        </Button>
      ),
    },
  ];

  const summary = report?.summary;
  const movementNote = applied.movementType
    ? `IN/OUT columns are narrowed to "${movementLabel(applied.movementType)}" movements in the selected range. Opening / Closing / Shortage always reflect the full stock movement (PRODUCTION_SCRAP excluded — it carries no balance impact).`
    : null;

  return (
    <div className="erp-pir">
      <PageHeader
        icon={<BarChartOutlined />}
        title="Production Inventory Report"
        subtitle="Real inventory balances + stock ledger movements, filtered by division, department, item, type, movement and date"
        extra={
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => {
              tabSessionCache.remove(tabKey);
              void loadReport(applied);
            }}
            loading={loading}
            style={{
              fontWeight: 600,
              borderRadius: 6,
              border: '1.5px solid var(--theme-primary, #2563eb)',
              color: 'var(--theme-primary, #2563eb)',
              background: 'var(--theme-hover, rgba(37, 99, 235, 0.06))',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            Refresh
          </Button>
        }
      />

      {error && <Alert message={error} type="warning" showIcon closable onClose={() => setError(null)} />}
      {movementNote && <Alert message={movementNote} type="info" showIcon style={{ marginBottom: 4 }} />}

      {/* ── Top Single-Line Action & Filter Toolbar ─────────────────────── */}
      <Card size="small" className="erp-pir__toolbar-card">
        <div className="erp-pir__main-toolbar">
          <div className="erp-pir__toolbar-left">
            <Input
              className="erp-pir__quick-search"
              placeholder="Search by code, name, department, type…"
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
            />
            <Button
              type={filtersOpen ? 'primary' : 'default'}
              icon={<FilterOutlined />}
              onClick={() => setFiltersOpen(!filtersOpen)}
            >
              Filters
              {activeFilterCount > 0 && (
                <Badge count={activeFilterCount} style={{ backgroundColor: '#4f46e5', marginLeft: 6 }} />
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button type="link" size="small" onClick={resetFilters} style={{ padding: 0 }}>
                Reset Filters ({activeFilterCount})
              </Button>
            )}
          </div>

          <div className="erp-pir__toolbar-right">
            <Button
              icon={<ReloadOutlined />}
              onClick={() => void loadReport(applied)}
              title="Refresh Report Data"
            >
              Refresh
            </Button>
            <Button
              icon={<ApartmentOutlined />}
              onClick={() => {
                const targetDiv = applied.divisionId || selectedDivisionForDept || effectiveDivisions[0]?.id;
                if (targetDiv) setSelectedDivisionForDept(targetDiv);
                if (divisions.length === 0) {
                  dashboardService.getFilterDivisions().then((res) => {
                    if (res?.success && Array.isArray(res.data) && res.data.length > 0) {
                      setDivisions(res.data);
                      if (!targetDiv && res.data[0]?.id) {
                        setSelectedDivisionForDept(res.data[0].id);
                      }
                    }
                  }).catch(() => {});
                }
                setDeptModalVisible(true);
              }}
            >
              Multi-Dept Report
            </Button>
            <Button
              icon={<FileExcelOutlined />}
              onClick={handleExportCSV}
            >
              Export CSV
            </Button>
            <Button
              icon={<PrinterOutlined />}
              onClick={handlePrintReport}
            >
              Print / PDF
            </Button>
            <Tooltip title="Share summary on WhatsApp">
              <Button
                icon={<WhatsAppOutlined style={{ color: '#16a34a' }} />}
                onClick={handleShareWhatsApp}
              >
                WhatsApp
              </Button>
            </Tooltip>
          </div>
        </div>

        {/* Sliding Collapsible Filter Panel */}
        {filtersOpen && (
          <div className="erp-pir__filter-panel">
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Division</Text>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="All Divisions"
                  value={filter.divisionId}
                  onChange={(v) => setFilter((prev) => ({ ...prev, divisionId: v }))}
                  options={(effectiveDivisions || []).map((d) => ({ value: d.id, label: d.name }))}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Department</Text>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="All Departments"
                  value={filter.departmentId}
                  onChange={(v) => setFilter((prev) => ({ ...prev, departmentId: v }))}
                  options={(departments || []).map((d) => ({ value: d.id, label: d.name }))}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Item</Text>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Items"
                  value={filter.itemId}
                  onChange={(v) => setFilter((prev) => ({ ...prev, itemId: v }))}
                  options={itemOptions}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Item Type</Text>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="All Types"
                  value={filter.itemType}
                  onChange={(v) => setFilter((prev) => ({ ...prev, itemType: v }))}
                  options={itemTypeOptions}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Movement Type</Text>
                <Select
                  style={{ width: '100%' }}
                  allowClear
                  placeholder="All Movements"
                  value={filter.movementType}
                  onChange={(v) => setFilter((prev) => ({ ...prev, movementType: v }))}
                  options={movementSelectOptions}
                />
              </Col>
              <Col xs={24} sm={12} md={6} lg={4}>
                <Text type="secondary" style={{ fontSize: 11 }}>Date Range</Text>
                <RangePicker
                  style={{ width: '100%' }}
                  allowClear
                  value={
                    filter.dateFrom || filter.dateTo
                      ? [filter.dateFrom ? dayjs(filter.dateFrom).startOf('day') : null, filter.dateTo ? dayjs(filter.dateTo).startOf('day') : null]
                      : null
                  }
                  onChange={(_, range) =>
                    setFilter((prev) => ({
                      ...prev,
                      dateFrom: Array.isArray(range) ? range[0] || undefined : undefined,
                      dateTo: Array.isArray(range) ? range[1] || undefined : undefined,
                    }))
                  }
                />
              </Col>
              <Col xs={24} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                <Button type="primary" icon={<ReloadOutlined />} onClick={applyFilters}>
                  Apply
                </Button>
                <Button onClick={resetFilters}>Clear</Button>
              </Col>
            </Row>
          </div>
        )}
      </Card>

      {/* ── Category Quick-Filter Cards (31 Items Breakdown) ────────────── */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
          <Text strong style={{ fontSize: 12, color: 'var(--theme-text-secondary, #64748b)' }}>
            <AppstoreOutlined style={{ marginRight: 6 }} />
            Item Categories (Click any card to filter):
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Total: <strong>{categoryCounts.total}</strong> Items = RM ({categoryCounts.rm}) + WIP ({categoryCounts.wip}) + FG ({categoryCounts.fg}) + Store ({categoryCounts.store}) + Other ({categoryCounts.other})
          </Text>
        </div>
        <Row gutter={[8, 8]}>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--primary ${selectedCategory === 'ALL' || !selectedCategory ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><BarcodeOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">All Items</span>
                  <span className="erp-category-badge">ALL</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.total)}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--success ${selectedCategory === 'RAW_MATERIAL' ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory((prev) => (prev === 'RAW_MATERIAL' ? null : 'RAW_MATERIAL'))}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><GoldOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">Raw Material</span>
                  <span className="erp-category-badge" style={{ color: '#16a34a', background: 'rgba(22, 163, 74, 0.1)' }}>RM</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.rm)}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--purple ${selectedCategory === 'WIP' ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory((prev) => (prev === 'WIP' ? null : 'WIP'))}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><ClockCircleOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">WIP / Semi-Fin</span>
                  <span className="erp-category-badge" style={{ color: '#9333ea', background: 'rgba(147, 51, 234, 0.1)' }}>WIP</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.wip)}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--info ${selectedCategory === 'FINISHED_GOOD' ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory((prev) => (prev === 'FINISHED_GOOD' ? null : 'FINISHED_GOOD'))}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><InboxOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">Finished Goods</span>
                  <span className="erp-category-badge" style={{ color: '#0284c7', background: 'rgba(2, 132, 199, 0.1)' }}>FG</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.fg)}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--warning ${selectedCategory === 'STORE' ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory((prev) => (prev === 'STORE' ? null : 'STORE'))}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><ToolOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">Store / Consum</span>
                  <span className="erp-category-badge" style={{ color: '#d97706', background: 'rgba(217, 119, 6, 0.1)' }}>STORE</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.store)}</div>
              </div>
            </div>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <div
              className={`erp-kpi-card erp-category-card erp-kpi-card--cyan ${selectedCategory === 'OTHER' ? 'erp-category-card--active' : ''}`}
              onClick={() => setSelectedCategory((prev) => (prev === 'OTHER' ? null : 'OTHER'))}
            >
              <div className="ant-card-body">
                <div className="erp-kpi-card__watermark"><ClusterOutlined /></div>
                <div className="erp-kpi-card__header">
                  <span className="erp-kpi-card__title">Other / General</span>
                  <span className="erp-category-badge" style={{ color: '#0891b2', background: 'rgba(8, 145, 178, 0.1)' }}>OTHER</span>
                </div>
                <div className="erp-kpi-card__value">{formatInt(categoryCounts.other)}</div>
              </div>
            </div>
          </Col>
        </Row>
      </div>

      {/* ── Inventory Movement & Stock KPI Cards (Zero Decimals) ─────────── */}
      <Row gutter={[8, 8]} className="erp-pir__cards" style={{ marginTop: 6 }}>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="On Hand" value={summary?.onHand ?? 0} icon={DatabaseOutlined} variant="info" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="Available" value={summary?.available ?? 0} icon={CheckCircleOutlined} variant="success" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="IN (range)" value={summary?.totalIn ?? 0} icon={ArrowDownOutlined} variant="cyan" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="OUT (range)" value={summary?.totalOut ?? 0} icon={ArrowUpOutlined} variant="warning" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="Produced" value={summary?.produced ?? 0} icon={BuildOutlined} variant="success" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="Required" value={summary?.required ?? 0} icon={AimOutlined} variant="primary" />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="Short Items" value={summary?.shortItems ?? 0} icon={WarningOutlined} variant={summary && summary.shortItems > 0 ? 'danger' : 'primary'} />
        </Col>
        <Col xs={12} sm={8} md={6} lg={3}>
          <KpiCard title="Chain Items" value={summary?.flowChainItems ?? 0} icon={ClusterOutlined} variant="info" />
        </Col>
      </Row>

      {/* ── Table Card with Batch Action Bar ─────────────────────────────── */}
      <Card size="small">
        {selectedRowKeys.length > 0 && (
          <div className="erp-batch-bar">
            <div className="erp-batch-bar__info">
              <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 16 }} />
              <span><strong>{selectedRowKeys.length}</strong> items selected for batch action</span>
            </div>
            <Space size={8}>
              <Button
                type="primary"
                icon={<WhatsAppOutlined />}
                style={{ background: '#16a34a', borderColor: '#16a34a' }}
                onClick={handleShareBatchWhatsApp}
              >
                Share Selected ({selectedRowKeys.length}) on WhatsApp
              </Button>
              <Button icon={<FileExcelOutlined />} onClick={handleExportSelectedCSV}>
                Export Selected CSV
              </Button>
              <Button size="small" onClick={() => setSelectedRowKeys([])}>
                Clear
              </Button>
            </Space>
          </div>
        )}

        <div style={{ position: 'relative', minHeight: 340 }}>
          {loading && (!report?.items || report.items.length === 0) ? (
            <LargeLoadingBuffer
              title="Loading Production Inventory Report..."
              subtitle="Calculating live stock balances, movements & WIP reconciliation directly from database..."
              badgeText="Live Inventory Feed"
              minHeight={380}
            />
          ) : report && (!report.items || report.items.length === 0) ? (
            <EmptyState
              title="No inventory data for this selection"
              description="Items with a stock ledger or inventory balance row for this company will appear here"
            />
          ) : report && Array.isArray(report.items) ? (
            <>
              {loading && (
                <LargeLoadingBuffer
                  overlay
                  title="Refreshing Inventory Report..."
                  subtitle="Recalculating inventory lot movements and ledger balances..."
                  badgeText="Instant Sync"
                />
              )}
              <Table
                rowKey="itemId"
                size="small"
                loading={false}
                columns={columns}
                dataSource={filteredItems}
                scroll={{ x: 1950 }}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'] }}
                onRow={(row) => ({
                  onClick: () => void openLedger(row),
                  style: { cursor: 'pointer' },
                })}
                bordered
              />
              <Text type="secondary" style={{ fontSize: 11 }}>
                Click any row to open its stock-ledger drill-down popup. Click &quot;Journey&quot; to view the complete material flow from Raw Material to Dispatch. Opening / Closing / Shortage always exclude PRODUCTION_SCRAP
                (audit-trail only — no balance impact), matching the Traceability reconciliation.
              </Text>
            </>
          ) : (
            <Empty />
          )}
        </div>
      </Card>

      {/* ── Draggable & Maximizable Stock Ledger Drill-down Modal ────────── */}
      <Modal
        title={
          <div
            className="erp-modal-drag-header"
            onMouseDown={(e) => !isLedgerMaximized && handleDragStart(e, ledgerModalPos, setLedgerModalPos)}
          >
            <span className="erp-modal-drag-title">
              <HistoryOutlined style={{ color: '#4f46e5' }} />
              {ledger?.item ? `${ledger.item.itemCode} — ${ledger.item.name || (ledger.item as any).itemName || ''}` : 'Stock Ledger Drill-down'}
            </span>
            <div className="erp-modal-ctrl-group" onClick={(e) => e.stopPropagation()}>
              <Tooltip title="Minimize to bottom dock">
                <button
                  type="button"
                  className="erp-modal-ctrl-btn"
                  onClick={() => setIsLedgerMinimized(true)}
                  aria-label="Minimize"
                >
                  <MinusOutlined />
                </button>
              </Tooltip>
              <Tooltip title={isLedgerMaximized ? 'Restore' : 'Maximize'}>
                <button
                  type="button"
                  className="erp-modal-ctrl-btn"
                  onClick={() => setIsLedgerMaximized(!isLedgerMaximized)}
                  aria-label={isLedgerMaximized ? 'Restore' : 'Maximize'}
                >
                  {isLedgerMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                </button>
              </Tooltip>
              <Tooltip title="Close">
                <button
                  type="button"
                  className="erp-modal-ctrl-btn erp-modal-ctrl-btn--close"
                  onClick={() => {
                    setLedgerVisible(false);
                    setIsLedgerMaximized(false);
                    setIsLedgerMinimized(false);
                  }}
                  aria-label="Close"
                >
                  <CloseOutlined />
                </button>
              </Tooltip>
            </div>
          </div>
        }
        wrapClassName="erp-workspace-modal"
        closable={false}
        open={ledgerVisible && !isLedgerMinimized}
        onCancel={() => {
          setLedgerVisible(false);
          setIsLedgerMaximized(false);
          setIsLedgerMinimized(false);
        }}
        footer={null}
        width={isLedgerMaximized ? 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' : 1020}
        zIndex={1100}
        style={
          isLedgerMaximized
            ? { top: 16, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)', padding: 0 }
            : { transform: `translate(${ledgerModalPos.x}px, ${ledgerModalPos.y}px)`, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' }
        }
      >
        {ledgerLoading ? (
          <EmptyState title="Loading ledger…" description="Reading real stock_ledger movements" />
        ) : ledger ? (
          <div>
            {selectedRow?.flow && (
              <div className="erp-flow-stage-strip">
                <div className="erp-flow-stage-node erp-flow-stage-node--source">
                  <CheckCircleOutlined style={{ color: '#059669' }} />
                  <span>{selectedRow.flow.source ? `Source: ${selectedRow.flow.source.itemCode}` : 'Source: Raw Material'}</span>
                </div>

                <span className="erp-flow-stage-arrow">
                  <ArrowRightOutlined />
                </span>

                <div className="erp-flow-stage-node erp-flow-stage-node--current">
                  <DatabaseOutlined style={{ color: '#4f46e5' }} />
                  <span>Current: <strong>{ledger.item?.itemCode || selectedRow.itemCode}</strong></span>
                </div>

                {selectedRow.flow.consumers && selectedRow.flow.consumers.length > 0 && (
                  <>
                    <span className="erp-flow-stage-arrow">
                      <ArrowRightOutlined />
                    </span>
                    <div className="erp-flow-stage-node erp-flow-stage-node--target">
                      <BranchesOutlined style={{ color: '#86198f' }} />
                      <span>Feeds ({selectedRow.flow.consumers.length}):</span>
                      <div className="erp-flow-stage-chips">
                        {selectedRow.flow.consumers.map((c) => (
                          <span
                            key={c.itemId || c.itemCode}
                            className="erp-flow-consumer-chip"
                            title={`${c.itemCode} — ${c.itemName || ''}`}
                          >
                            {c.itemCode}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2027 Executive Ledger Summary Banner */}
            <div
              className="erp-ledger-summary-banner"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: 10,
                marginBottom: 12,
                padding: '12px 14px',
                background: 'var(--theme-surface-subtle, #f8fafc)',
                borderRadius: 10,
                border: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Division & Dept</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2, color: 'var(--theme-text, #0f172a)' }}>
                  {ledger.item?.department?.name || ledger.item?.division?.name || 'Stores Department'}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{ledger.item ? itemTypeLabel(ledger.item.itemType) : ''} • {ledger.item?.uom?.code || 'KG'}</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--theme-border, #e2e8f0)', paddingLeft: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Opening Stock</div>
                <div className="erp-cell-num" style={{ fontWeight: 700, fontSize: 16, marginTop: 2, color: 'var(--theme-text, #0f172a)' }}>
                  {formatInt(ledger.openingBalance)}
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Prior Balance</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--theme-border, #e2e8f0)', paddingLeft: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total In (+)</div>
                <div className="erp-cell-num" style={{ fontWeight: 700, fontSize: 16, marginTop: 2, color: '#047857' }}>
                  +{formatInt(ledger.totalIn)}
                </div>
                <div style={{ fontSize: 10.5, color: '#059669' }}>Receipts & Inward</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--theme-border, #e2e8f0)', paddingLeft: 12 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: '#be123c', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Out (−)</div>
                <div className="erp-cell-num" style={{ fontWeight: 700, fontSize: 16, marginTop: 2, color: '#be123c' }}>
                  −{formatInt(ledger.totalOut)}
                </div>
                <div style={{ fontSize: 10.5, color: '#e11d48' }}>Consumption & Issues</div>
              </div>
              <div style={{ borderLeft: '1px solid var(--theme-border, #e2e8f0)', paddingLeft: 12, background: 'rgba(79, 70, 229, 0.05)', borderRadius: 6, padding: '4px 10px' }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: '#4338ca', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Closing Balance</div>
                <div className="erp-cell-num" style={{ fontWeight: 800, fontSize: 18, marginTop: 2, color: ledger.closingBalance < 0 ? '#dc2626' : '#4338ca' }}>
                  {formatInt(ledger.closingBalance)} <span style={{ fontSize: 11, fontWeight: 600 }}>{ledger.item?.uom?.code || 'KG'}</span>
                </div>
                <div style={{ fontSize: 10.5, color: '#6366f1' }}>On-Hand Net</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
              <Button
                size="small"
                icon={<NodeIndexOutlined style={{ color: '#16a34a' }} />}
                onClick={() => openJourneyFromLedger(ledger)}
              >
                Material Flow Journey
              </Button>
              <Button
                size="small"
                icon={<WhatsAppOutlined style={{ color: '#16a34a' }} />}
                onClick={() => {
                  const text = `*PWI Stock Ledger Summary*\nItem: ${ledger.item?.itemCode} - ${ledger.item?.name}\nOpening: ${formatInt(ledger.openingBalance)}\nIN: ${formatInt(ledger.totalIn)}\nOUT: ${formatInt(ledger.totalOut)}\nClosing: ${formatInt(ledger.closingBalance)}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
              >
                Share on WhatsApp
              </Button>
            </div>

            <Table
              rowKey="id"
              size="small"
              className="erp-modern-ledger-table"
              columns={ledgerColumns}
              dataSource={ledger.rows}
              scroll={{ x: 1000, y: isLedgerMaximized ? '60vh' : 380 }}
              pagination={ledger.rows.length > 20 ? { pageSize: 20, showSizeChanger: true } : false}
              bordered
            />
            {ledger.truncated && (
              <Alert
                style={{ marginTop: 8 }}
                type="warning"
                showIcon
                message={`Showing the last 500 of ${ledger.totalLedgerRows} ledger rows. Opening balance already includes the earlier history.`}
              />
            )}
            {ledger.rows.length === 0 && (
              <Text type="secondary">No ledger movements match the current date / movement filters.</Text>
            )}
          </div>
        ) : (
          <Empty />
        )}
      </Modal>

      {/* ── Minimized Stock Ledger Floating Dock Bar ────────────────────── */}
      {ledgerVisible && isLedgerMinimized && ledger && (
        <div
          className="erp-modal-minimized-dock"
          onClick={() => setIsLedgerMinimized(false)}
          title="Click to restore Stock Ledger drill-down"
        >
          <div className="erp-modal-minimized-dock__title">
            <HistoryOutlined style={{ color: '#818cf8', fontSize: 14 }} />
            <span>{ledger.item?.itemCode || 'Stock Ledger'}</span>
            <span className="erp-modal-minimized-dock__badge">Minimized</span>
          </div>
          <div style={{ fontSize: 11, color: '#cbd5e1', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ledger.item?.name ? (ledger.item.name.length > 28 ? `${ledger.item.name.substring(0, 28)}…` : ledger.item.name) : ''}
          </div>
          <div className="erp-modal-minimized-dock__actions">
            <Tooltip title="Restore">
              <Button
                type="text"
                size="small"
                icon={<FullscreenOutlined style={{ color: '#ffffff', fontSize: 12 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLedgerMinimized(false);
                }}
              />
            </Tooltip>
            <Tooltip title="Close">
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined style={{ color: '#f87171', fontSize: 12 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  setLedgerVisible(false);
                  setIsLedgerMinimized(false);
                  setIsLedgerMaximized(false);
                }}
              />
            </Tooltip>
          </div>
        </div>
      )}

      {/* ── Multi-Department Batch Comparison Report Modal ─────────────────── */}
      <Modal
        title={
          <div
            className="erp-modal-drag-header"
            onMouseDown={(e) => !isDeptModalMaximized && handleDragStart(e, deptModalPos, setDeptModalPos)}
          >
            <span className="erp-modal-drag-title">
              <ApartmentOutlined style={{ color: '#4f46e5' }} />
              Multi-Department Production & Inventory Report
            </span>
            <Space size={6} onClick={(e) => e.stopPropagation()}>
              <Tooltip title={isDeptModalMaximized ? 'Restore' : 'Maximize'}>
                <Button
                  size="small"
                  type="text"
                  icon={isDeptModalMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setIsDeptModalMaximized(!isDeptModalMaximized)}
                />
              </Tooltip>
            </Space>
          </div>
        }
        wrapClassName="erp-workspace-modal"
        open={deptModalVisible}
        onCancel={() => {
          setDeptModalVisible(false);
          setIsDeptModalMaximized(false);
        }}
        footer={null}
        width={isDeptModalMaximized ? 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' : 980}
        style={
          isDeptModalMaximized
            ? { top: 16, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)', padding: 0 }
            : { transform: `translate(${deptModalPos.x}px, ${deptModalPos.y}px)`, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' }
        }
      >
        <div className="erp-dept-modal__filters">
          <Row gutter={[12, 12]} align="middle">
            <Col xs={24} md={8}>
              <Text strong style={{ fontSize: 12 }}>Select Division:</Text>
              <Select
                style={{ width: '100%', marginTop: 4 }}
                placeholder="Select a Division"
                value={selectedDivisionForDept}
                onChange={(v) => setSelectedDivisionForDept(v)}
                options={(effectiveDivisions || []).map((d) => ({ value: d.id, label: d.name }))}
              />
            </Col>
            <Col xs={24} md={16} style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button
                size="small"
                onClick={() => setSelectedDeptIds((availableDeptsForDivision || []).map((d) => d.id))}
              >
                Select All
              </Button>
              <Button
                size="small"
                onClick={() => setSelectedDeptIds([])}
              >
                Deselect All
              </Button>
            </Col>
          </Row>

          <div style={{ marginTop: 10 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Tick the departments you want to compare and include in the batch report:
            </Text>
            <div className="erp-dept-modal__dept-list">
              {(availableDeptsForDivision || []).length === 0 ? (
                <Text type="secondary">No departments available for this division.</Text>
              ) : (
                availableDeptsForDivision.map((dept) => (
                  <Checkbox
                    key={dept.id}
                    checked={(selectedDeptIds || []).includes(dept.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDeptIds((prev) => [...prev, dept.id]);
                      } else {
                        setSelectedDeptIds((prev) => prev.filter((id) => id !== dept.id));
                      }
                    }}
                  >
                    <strong>{dept.name}</strong>
                  </Checkbox>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Action buttons for Department Report */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Title level={5} style={{ margin: 0 }}>
            Selected Departments Report ({departmentBreakdown.length})
          </Title>
          <Space wrap>
            <Button
              size="small"
              icon={<WhatsAppOutlined style={{ color: '#16a34a' }} />}
              onClick={() => {
                const divName = (effectiveDivisions || []).find((d) => d.id === selectedDivisionForDept)?.name || 'Division';
                const lines = [
                  `*${dynamicReportTitle.company}*`,
                  `*Multi-Department Production Report*`,
                  `Division: ${divName}`,
                  `Departments: ${departmentBreakdown.map((d) => d.departmentName).join(', ')}`,
                  `-----------------------------`,
                ];
                departmentBreakdown.forEach((d) => {
                  lines.push(`*${d.departmentName}*:`);
                  lines.push(`- Items: ${d.itemCount} | On Hand: ${formatInt(d.onHand)}`);
                  lines.push(`- In: ${formatInt(d.totalIn)} | Out: ${formatInt(d.totalOut)} | Closing: ${formatInt(d.closing)}`);
                  lines.push(`- Produced: ${formatInt(d.produced)} | Short: ${d.shortItems}`);
                  lines.push(``);
                });
                lines.push(`_Generated from PWI ERP System_`);
                window.open(`https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
              }}
            >
              WhatsApp
            </Button>
            <Button
              size="small"
              icon={<MailOutlined />}
              onClick={() => {
                const divName = (effectiveDivisions || []).find((d) => d.id === selectedDivisionForDept)?.name || 'Division';
                const subject = `PWI Department Production Report - ${divName}`;
                const body = departmentBreakdown.map((d) =>
                  `${d.departmentName}: On Hand = ${formatInt(d.onHand)}, Produced = ${formatInt(d.produced)}, Shortage = ${d.shortItems}`
                ).join('\n');
                window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
              }}
            >
              Email
            </Button>
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              onClick={() => {
                const csvRows = [
                  'Department,Items,Opening,IN,OUT,Closing,On Hand,Available,Produced,Required,Consumed,Scrap,Short Items',
                ];
                departmentBreakdown.forEach((d) => {
                  csvRows.push([
                    `"${d.departmentName}"`,
                    d.itemCount,
                    Math.round(d.opening),
                    Math.round(d.totalIn),
                    Math.round(d.totalOut),
                    Math.round(d.closing),
                    Math.round(d.onHand),
                    Math.round(d.available),
                    Math.round(d.produced),
                    Math.round(d.required),
                    Math.round(d.consumed),
                    Math.round(d.scrap),
                    d.shortItems,
                  ].join(','));
                });
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `department-summary-${dayjs().format('YYYY-MM-DD')}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Export CSV
            </Button>
          </Space>
        </div>

        {/* Aggregated Department Table with Inline Expansion & Highlighting */}
        <Table
          rowKey="departmentId"
          size="small"
          columns={deptColumns}
          dataSource={departmentBreakdown}
          pagination={false}
          bordered
          scroll={{ x: 1000 }}
          expandable={{
            expandedRowRender: (record) => (
              <div style={{ margin: '8px 0', background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 13, color: '#1e293b' }}>
                    <ClusterOutlined style={{ color: '#2563eb', marginRight: 6 }} />
                    {record.departmentName} — Detailed Item Breakdown ({record.items.length} {record.items.length === 1 ? 'Item' : 'Items'})
                  </Text>
                  <Button
                    size="small"
                    type="link"
                    icon={<FullscreenOutlined />}
                    onClick={() => handleViewDeptItems(record)}
                  >
                    Open Full Modal
                  </Button>
                </div>
                <Table
                  size="small"
                  rowKey="itemId"
                  columns={deptItemDetailColumns}
                  dataSource={record.items}
                  pagination={record.items.length > 5 ? { pageSize: 5, size: 'small' } : false}
                  bordered
                  scroll={{ x: 900 }}
                />
              </div>
            ),
            rowExpandable: (record) => Boolean(record.items && record.items.length > 0),
          }}
        />
      </Modal>

      {/* ── Department Items Detail Breakdown Modal ──────────────────────── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClusterOutlined style={{ color: '#2563eb', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {selectedDeptForItems?.departmentName} — Items Detail Breakdown
            </span>
            <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px', borderRadius: 12 }}>
              {selectedDeptForItems?.itemCount || 0} Items
            </Tag>
          </div>
        }
        open={deptItemsModalVisible}
        onCancel={() => setDeptItemsModalVisible(false)}
        width={1100}
        zIndex={1050}
        footer={[
          <Button key="close" type="primary" onClick={() => setDeptItemsModalVisible(false)}>
            Close
          </Button>,
        ]}
        style={{ top: 20 }}
      >
        {selectedDeptForItems && (
          <div>
            {/* Department Summary KPI Cards */}
            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
              <Col xs={12} sm={6} md={4}>
                <Card size="small" style={{ background: '#f8fafc', borderColor: '#e2e8f0', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>TOTAL ITEMS</Text>
                  <Text strong style={{ fontSize: 18, color: '#1e293b' }}>{selectedDeptForItems.itemCount}</Text>
                </Card>
              </Col>
              <Col xs={12} sm={6} md={5}>
                <Card size="small" style={{ background: '#f8fafc', borderColor: '#e2e8f0', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>TOTAL ON HAND</Text>
                  <Text strong style={{ fontSize: 18, color: '#0f172a' }}>{formatInt(selectedDeptForItems.onHand)}</Text>
                </Card>
              </Col>
              <Col xs={12} sm={6} md={5}>
                <Card size="small" style={{ background: '#f8fafc', borderColor: '#e2e8f0', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>TOTAL AVAILABLE</Text>
                  <Text strong style={{ fontSize: 18, color: selectedDeptForItems.available < 0 ? '#ef4444' : '#16a34a' }}>
                    {formatInt(selectedDeptForItems.available)}
                  </Text>
                </Card>
              </Col>
              <Col xs={12} sm={6} md={5}>
                <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', color: '#166534' }}>TOTAL IN (+)</Text>
                  <Text strong style={{ fontSize: 18, color: '#16a34a' }}>+{formatInt(selectedDeptForItems.totalIn)}</Text>
                </Card>
              </Col>
              <Col xs={12} sm={6} md={5}>
                <Card size="small" style={{ background: '#fef2f2', borderColor: '#fecaca', textAlign: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block', color: '#991b1b' }}>TOTAL OUT (-)</Text>
                  <Text strong style={{ fontSize: 18, color: '#dc2626' }}>-{formatInt(selectedDeptForItems.totalOut)}</Text>
                </Card>
              </Col>
            </Row>

            {/* Search Filter & Export Toolbar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <Input
                placeholder="Search by item code or description..."
                prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                value={deptItemsSearchText}
                onChange={(e) => setDeptItemsSearchText(e.target.value)}
                style={{ width: 280 }}
                allowClear
              />
              <Space>
                <Button
                  size="small"
                  icon={<FileExcelOutlined />}
                  onClick={() => {
                    const csvRows = [
                      'Department,Item Code,Item Name,Type,UOM,Opening,IN,OUT,Closing,On Hand,Available,Required,Consumed,Scrap,Status',
                    ];
                    (selectedDeptForItems.items || []).forEach((it: ReportRow) => {
                      csvRows.push([
                        `"${selectedDeptForItems.departmentName}"`,
                        `"${it.itemCode}"`,
                        `"${(it.itemName || '').replace(/"/g, '""')}"`,
                        `"${it.itemType}"`,
                        `"${it.uomCode || ''}"`,
                        Math.round(it.openingBalance),
                        Math.round(it.totalIn),
                        Math.round(it.totalOut),
                        Math.round(it.closingBalance),
                        Math.round(it.onHand),
                        Math.round(it.available),
                        Math.round(it.required),
                        Math.round(it.consumed),
                        Math.round(it.scrapOut),
                        `"${it.status}"`,
                      ].join(','));
                    });
                    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${selectedDeptForItems.departmentName.toLowerCase().replace(/\s+/g, '-')}-items-${dayjs().format('YYYY-MM-DD')}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export CSV
                </Button>
              </Space>
            </div>

            {/* Department Items Table */}
            <Table
              size="small"
              rowKey="itemId"
              columns={deptItemDetailColumns}
              dataSource={
                deptItemsSearchText
                  ? (selectedDeptForItems.items || []).filter(
                      (it: ReportRow) =>
                        it.itemCode.toLowerCase().includes(deptItemsSearchText.toLowerCase()) ||
                        it.itemName.toLowerCase().includes(deptItemsSearchText.toLowerCase()),
                    )
                  : selectedDeptForItems.items || []
              }
              pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
              bordered
              scroll={{ x: 1000 }}
            />
          </div>
        )}
      </Modal>

      {/* ── End-to-End Material Flow & Journey Modal ────────────────────── */}
      <Modal
        title={
          <div
            className="erp-modal-drag-header"
            onMouseDown={(e) => !isJourneyModalMaximized && handleDragStart(e, journeyModalPos, setJourneyModalPos)}
          >
            <span className="erp-modal-drag-title">
              <NodeIndexOutlined style={{ color: '#16a34a' }} />
              End-to-End Material Flow & Traceability Journey
              {journeyItem && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  {'itemCode' in journeyItem ? journeyItem.itemCode : ''}
                </Tag>
              )}
            </span>
            <Space size={6} onClick={(e) => e.stopPropagation()}>
              <Tooltip title={isJourneyModalMaximized ? 'Restore' : 'Maximize'}>
                <Button
                  size="small"
                  type="text"
                  icon={isJourneyModalMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                  onClick={() => setIsJourneyModalMaximized(!isJourneyModalMaximized)}
                />
              </Tooltip>
            </Space>
          </div>
        }
        wrapClassName="erp-workspace-modal"
        open={journeyModalVisible}
        onCancel={() => {
          setJourneyModalVisible(false);
          setIsJourneyModalMaximized(false);
        }}
        footer={null}
        width={isJourneyModalMaximized ? 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' : 980}
        style={
          isJourneyModalMaximized
            ? { top: 16, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)', padding: 0 }
            : { transform: `translate(${journeyModalPos.x}px, ${journeyModalPos.y}px)`, maxWidth: 'calc(100vw - var(--erp-sidebar-width, 0px) - 32px)' }
        }
      >
        {journeyItem && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <Title level={5} style={{ margin: 0 }}>
                  {'itemCode' in journeyItem ? journeyItem.itemCode : ''} — {'name' in journeyItem ? journeyItem.name : ('itemName' in journeyItem ? (journeyItem as any).itemName : '')}
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Complete production flow tracked in <strong>KG</strong> continuity across routing & departments
                </Text>
              </div>
              <Space size={8}>
                <Button
                  type="primary"
                  icon={<WhatsAppOutlined />}
                  style={{ background: '#16a34a', borderColor: '#16a34a' }}
                  onClick={handleShareJourneyWhatsApp}
                >
                  Share Journey on WhatsApp
                </Button>
                <Button icon={<PrinterOutlined />} onClick={() => window.print()}>
                  Print Flow
                </Button>
              </Space>
            </div>

            <div className="erp-journey-container">
              {journeyData.map((stage, idx) => (
                <React.Fragment key={stage.stageNumber}>
                  <div className={`erp-journey-stage-card ${stage.isCurrentItem ? 'erp-journey-stage-card--current' : ''}`}>
                    <div className="erp-journey-stage-badge">
                      <div className="erp-journey-stage-number">{stage.stageNumber}</div>
                      <div className="erp-journey-stage-label">Step</div>
                    </div>
                    <div className="erp-journey-stage-content">
                      <div className="erp-journey-stage-header">
                        <div className="erp-journey-stage-title">
                          {stage.stageName}
                          {stage.isCurrentItem && (
                            <Tag color="green" style={{ marginLeft: 8, fontSize: 11 }}>CURRENT ITEM</Tag>
                          )}
                        </div>
                        <Tag color="blue">{stage.departmentName}</Tag>
                      </div>

                      <Row gutter={[12, 6]} style={{ marginTop: 6 }}>
                        <Col xs={24} sm={12}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Item Code & Name:</Text>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>
                            {stage.itemCode}
                            <span style={{ fontWeight: 400, color: '#64748b', marginLeft: 6 }}>{stage.itemName}</span>
                          </div>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Department:</Text>
                          <div style={{ fontWeight: 600 }}>{stage.departmentName}</div>
                        </Col>
                        <Col xs={12} sm={6}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Standard Tracking:</Text>
                          <div><Tag color="cyan">Continuity in {stage.uom || 'KG'}</Tag></div>
                        </Col>
                      </Row>

                      {stage.items && stage.items.length > 0 && (
                        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #e2e8f0' }}>
                          <Text type="secondary" style={{ fontSize: 11 }}>Produced Outward Variants / Consumers:</Text>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {stage.items.map((it) => (
                              <Tag key={it.id || it.itemCode} color="purple">
                                <strong>{it.itemCode}</strong>: {it.name} {it.department ? `(${it.department})` : ''}
                              </Tag>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {idx < journeyData.length - 1 && (
                    <div className="erp-journey-arrow-connector">
                      <div className="erp-journey-flow-pill">
                        <ArrowDownOutlined />
                        <span>Issued & Transferred to Next Operation in KG</span>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ProductionInventoryReport;
