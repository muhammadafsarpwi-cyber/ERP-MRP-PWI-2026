import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  Space,
  Select,
  DatePicker,
  App,
  Tabs,
  Typography,
  Statistic,
  Row,
  Col,
  Input,
  Tooltip,
  Modal,
  Tag,
  Grid,
} from 'antd';
import PageHeader from '../../../components/shared/PageHeader';
import LargeLoadingBuffer from '../../../components/shared/LargeLoadingBuffer';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../../services/tabSessionCache';
import {
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  BarChartOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  TeamOutlined,
  ClockCircleOutlined,
  ToolOutlined,
  UserOutlined,
  AppstoreOutlined,
  AimOutlined,
  PercentageOutlined,
  CheckCircleOutlined,
  SettingOutlined,
  DownloadOutlined,
  UploadOutlined,
  FilePdfOutlined,
  PrinterOutlined,
  FilterOutlined,
  ClearOutlined,
  DownOutlined,
  CarryOutOutlined,
  FieldTimeOutlined,
  DeleteOutlined,
  SyncOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { calcActualKg, perUnitWeightLabel } from '../../../utils/productionWeight';
import { useLookups, Department, ShiftLk } from './lookups';
import KpiPercentage, { kpiIndicator } from '../../../components/kpi/KpiPercentage';
import {
  ERPTable,
  TableActions,
  StatusBadge,
  DepartmentBadge,
  ShiftBadge,
  ItemBadge,
} from '../../../components/shared';
import './entryList.css';

interface KpiCardProps {
  testId: string;
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ style?: React.CSSProperties; className?: string; 'aria-hidden'?: React.AriaAttributes['aria-hidden'] }>;
  tone: string;
  toneSoft: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  testId,
  label,
  value,
  icon: Icon,
  tone,
  toneSoft,
}) => (
  <Card
    size="small"
    className="entry-crystal-kpi-card"
    data-testid={testId}
    styles={{ body: { padding: '12px 14px' } }}
    style={{ position: 'relative', overflow: 'hidden', borderLeft: `3.5px solid ${tone}` }}
  >
    <Icon
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: -10,
        bottom: -16,
        fontSize: 68,
        opacity: 0.12,
        pointerEvents: 'none',
        zIndex: 0,
        color: tone,
      }}
    />
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, minWidth: 0 }}>
      <Text
        style={{
          fontSize: 11,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'var(--theme-text-muted, #64748b)',
          textTransform: 'uppercase',
        }}
        ellipsis
      >
        {label}
      </Text>
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          flex: '0 0 auto',
          borderRadius: 8,
          fontSize: 15,
          background: toneSoft,
          color: tone,
        }}
      >
        <Icon />
      </span>
    </div>
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        marginTop: 8,
        fontSize: 26,
        fontWeight: 700,
        lineHeight: 1.1,
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--theme-text, #0f172a)',
      }}
    >
      {value}
    </div>
  </Card>
);

interface EntryChevronOption {
  key: string;
  label: string;
  color: string;
  activeBg: string;
  icon: React.ReactNode;
}

const ENTRY_CHEVRONS: EntryChevronOption[] = [
  { key: 'all', label: 'ALL ENTRIES', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'COMPLETED', label: 'COMPLETED', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'IN_PROGRESS', label: 'IN PROGRESS', color: '#0891b2', activeBg: '#0e7490', icon: <SyncOutlined /> },
  { key: 'DRAFT', label: 'DRAFT', color: '#64748b', activeBg: '#475569', icon: <MinusOutlined /> },
  { key: 'WITH_SCRAP', label: 'WITH SCRAP', color: '#e11d48', activeBg: '#be123c', icon: <DeleteOutlined /> },
  { key: 'WITH_DOWNTIME', label: 'WITH DOWNTIME', color: '#d97706', activeBg: '#b45309', icon: <ClockCircleOutlined /> },
];

const EntryStatusChevronRibbon: React.FC<{
  counts: Record<string, number>;
  activeKey: string;
  onSelect: (key: string) => void;
}> = ({ counts, activeKey, onSelect }) => {
  return (
    <div className="entry-ribbon-container">
      {ENTRY_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === ENTRY_CHEVRONS.length - 1;
        const count = counts[ch.key] ?? 0;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => onSelect(ch.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '9px 22px 9px 16px'
                : isLast
                ? '9px 18px 9px 24px'
                : '9px 20px 9px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isSelected ? 12 : ENTRY_CHEVRONS.length - idx,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.4px',
              color: '#ffffff',
              background: isSelected ? ch.activeBg : ch.color,
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 0 0 2px #ffffff, 0 4px 14px rgba(0,0,0,0.35)' : undefined,
              transform: isSelected ? 'scale(1.025) translateY(-1px)' : 'none',
              opacity: isSelected ? 1 : 0.93,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '0.93';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            <span style={{ fontSize: 13, display: 'flex', alignItems: 'center' }}>{ch.icon}</span>
            <span>{ch.label}</span>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(255, 255, 255, 0.25)',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0,
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

const { Text } = Typography;
const { RangePicker } = DatePicker;

export interface ProductionEntryRow {
  id: string;
  entryDate: string;
  divisionId: string;
  sectionId: string;
  departmentId: string;
  division?: { id: string; name: string; divisionCode: string };
  section?: { id: string; name: string; sectionCode: string };
  department?: { id: string; name: string; departmentCode: string };
  shift?: ShiftLk | { id: string; name: string; shiftCode: string; startTime?: string | null; endTime?: string | null };
  machineId?: string | null;
  machine?: { id: string; machineCode: string; name: string; status?: string };
  machineNo: string;
  operatorName: string;
  supervisorName: string | null;
  coilSize: string | null;
  itemId: string;
  item?: { id: string; name: string; itemCode: string; sku?: string; shortName?: string; weightPerPiece?: number | null; weightPerMeter?: number | null };
  uomId: string;
  uom?: { id: string; code: string; symbol: string; name?: string };
  targetQuantity: number | string;
  calculatedTarget?: number | string;
  actualQuantity: number | string;
  achievementPercentage: number | string;
  efficiencyPercentage: number | string;
  runningHours: number | string;
  downtimeHours: number | string;
  downtimeReasonText: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
  status?: string;
  isActive?: boolean;
  inventoryReferenceId?: string | null;
  rawMaterialWarehouseId?: string | null;
}

interface ReportItemGroup {
  itemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  weightPerPiece?: number | null;
  weightPerMeter?: number | null;
  actualKg?: number | null;
  targetQuantity: number;
  actualQuantity: number;
  scrapQuantity: number;
  runningHours: number;
  downtimeHours: number;
  achievementPercentage: number | null;
  efficiencyPercentage: number | null;
  entryCount: number;
}

interface ReportDept {
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  divisionName: string;
  sectionName: string;
  items: ReportItemGroup[];
  totalsByUom: Array<{
    uomCode: string;
    targetQuantity: number;
    actualQuantity: number;
    scrapQuantity: number;
    runningHours: number;
    downtimeHours: number;
    achievementPercentage: number | null;
    efficiencyPercentage: number | null;
    entryCount: number;
  }>;
}

interface ReportResponse {
  entryCount: number;
  departments: ReportDept[];
  grandTotalsByUom: ReportDept['totalsByUom'];
}

/**
 * Derives an authoritative enterprise status for a production entry row.
 * Respects row.status if provided by the API; otherwise uses posted/completion states.
 */
export function getEntryStatus(row: ProductionEntryRow): string {
  if (row.status) return row.status;
  if (row.isActive === false) return 'CANCELLED';
  if (row.inventoryReferenceId) return 'COMPLETED';
  if (toNum(row.actualQuantity) > 0) return 'COMPLETED';
  return 'DRAFT';
}

interface EntryListTabCache {
  rows: ProductionEntryRow[];
  total: number;
  report: ReportResponse | null;
}

const EntryList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const lookups = useLookups();
  const screens = Grid.useBreakpoint();
  const PAGE_SIZE_KEY = 'production_entry_pagesize';
  const tabKey = '/production/entries';

  // Retrieve cached tab data if this workspace tab is already open
  const cachedTab = useMemo(() => tabSessionCache.get<EntryListTabCache>(tabKey), []);

  const [rows, setRows] = useState<ProductionEntryRow[]>(() => cachedTab?.rows ?? []);
  const [total, setTotal] = useState<number>(() => cachedTab?.total ?? 0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(PAGE_SIZE_KEY);
      const parsed = saved ? parseInt(saved, 10) : 10;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
    } catch {
      return 10;
    }
  });

  // Start with loading true only if tab has never loaded yet
  const [loading, setLoading] = useState(!cachedTab);
  const [reportLoading, setReportLoading] = useState(!cachedTab);
  const [report, setReport] = useState<ReportResponse | null>(() => cachedTab?.report ?? null);
  const isInitialMount = useRef(true);

  // Filters & Chevron Ribbon State
  const [activeChevronKey, setActiveChevronKey] = useState<string>('all');
  const [moreFiltersOpen, setMoreFiltersOpen] = useState<boolean>(false);
  const [fSearch, setFSearch] = useState<string>('');
  const [fDivision, setFDivision] = useState<string>();
  const [fSection, setFSection] = useState<string>();
  const [fDepartment, setFDepartment] = useState<string>();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [fShift, setFShift] = useState<string>();
  const [fMachineNo, setFMachineNo] = useState<string>('');
  const [fStatus, setFStatus] = useState<string>();

  const buildFilters = useCallback(() => ({
    search: fSearch.trim() || undefined,
    divisionId: fDivision,
    sectionId: fSection,
    departmentId: fDepartment,
    dateFrom: dateRange[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange[1]?.format('YYYY-MM-DD'),
    shiftId: fShift,
    machineNo: fMachineNo.trim() || undefined,
  }), [fSearch, fDivision, fSection, fDepartment, dateRange, fShift, fMachineNo]);

  const fetchRows = useCallback(async (p = page, ps = pageSize) => {
    setLoading(true);
    try {
      const res = await apiService.get<{ success: boolean; data: ProductionEntryRow[]; total: number }>(
        '/production/entries',
        { page: p, limit: ps, ...buildFilters() },
      );
      const newRows = res.data || [];
      const newTotal = res.total || 0;
      setRows(newRows);
      setTotal(newTotal);

      // Save to tab session cache
      const current = tabSessionCache.get<EntryListTabCache>(tabKey);
      tabSessionCache.set<EntryListTabCache>(tabKey, {
        rows: newRows,
        total: newTotal,
        report: current?.report ?? null,
      });
    } catch {
      message.error('Failed to load production entries');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, buildFilters, message]);

  const fetchReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const res = await apiService.get<{ success: boolean } & ReportResponse>(
        '/production/entries/report',
        buildFilters(),
      );
      setReport(res);

      // Save to tab session cache
      const current = tabSessionCache.get<EntryListTabCache>(tabKey);
      tabSessionCache.set<EntryListTabCache>(tabKey, {
        rows: current?.rows ?? rows,
        total: current?.total ?? total,
        report: res,
      });
    } catch {
      message.error('Failed to load production report');
    } finally {
      setReportLoading(false);
    }
  }, [buildFilters, message, rows, total]);

  useEffect(() => {
    // If tab was already loaded in this session, DO NOT re-fetch when returning to the tab!
    if (tabSessionCache.has(tabKey)) {
      return;
    }
    void fetchRows(page, pageSize);
    void fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    void fetchRows(1, pageSize);
    void fetchReport();
  };

  const handleReset = () => {
    setFSearch('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setDateRange([null, null]);
    setFShift(undefined);
    setFMachineNo('');
    setFStatus(undefined);
    setActiveChevronKey('all');
    setPage(1);
    setTimeout(() => {
      void fetchRows(1, pageSize).then(() => fetchReport());
    }, 0);
  };

  // Status & Attribute Counts for 2027 Chevron Status Ribbon
  const ribbonCounts = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let draft = 0;
    let withScrap = 0;
    let withDowntime = 0;

    for (const r of rows) {
      const s = getEntryStatus(r);
      if (s === 'COMPLETED') completed++;
      else if (s === 'IN_PROGRESS') inProgress++;
      else if (s === 'DRAFT') draft++;

      if (toNum(r.scrapQuantity) > 0) withScrap++;
      if (toNum(r.downtimeHours) > 0) withDowntime++;
    }

    return {
      all: total || rows.length,
      COMPLETED: completed,
      IN_PROGRESS: inProgress,
      DRAFT: draft,
      WITH_SCRAP: withScrap,
      WITH_DOWNTIME: withDowntime,
    };
  }, [rows, total]);

  // Client-side status and chevron filter
  const displayedRows = useMemo(() => {
    let list = rows;
    if (activeChevronKey === 'COMPLETED') {
      list = list.filter((r) => getEntryStatus(r) === 'COMPLETED');
    } else if (activeChevronKey === 'IN_PROGRESS') {
      list = list.filter((r) => getEntryStatus(r) === 'IN_PROGRESS');
    } else if (activeChevronKey === 'DRAFT') {
      list = list.filter((r) => getEntryStatus(r) === 'DRAFT');
    } else if (activeChevronKey === 'WITH_SCRAP') {
      list = list.filter((r) => toNum(r.scrapQuantity) > 0);
    } else if (activeChevronKey === 'WITH_DOWNTIME') {
      list = list.filter((r) => toNum(r.downtimeHours) > 0);
    }
    if (fStatus) {
      list = list.filter((r) => getEntryStatus(r) === fStatus);
    }
    return list;
  }, [rows, activeChevronKey, fStatus]);

  // Aggregate KPI summary for Crystal Metric Cards
  const kpiData = useMemo(() => {
    const target = displayedRows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = displayedRows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = displayedRows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    const ach = target > 0 ? Math.round((actual / target) * 10000) / 100 : null;
    return {
      total: total || rows.length,
      actual,
      target,
      scrap,
      ach: ach !== null ? `${ach}%` : '0%',
    };
  }, [displayedRows, total, rows.length]);

  const summary = useMemo(() => {
    const target = displayedRows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = displayedRows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = displayedRows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    return {
      target,
      actual,
      scrap,
      ach: target > 0 ? Math.round((actual / target) * 10000) / 100 : null,
    };
  }, [displayedRows]);

  const achIndicator = kpiIndicator(summary.ach);

  // Collapsible Filters State
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (fSearch.trim()) count++;
    if (fDivision) count++;
    if (fSection) count++;
    if (fDepartment) count++;
    if (fShift) count++;
    if (fMachineNo.trim()) count++;
    if (fStatus) count++;
    if (dateRange[0] || dateRange[1]) count++;
    return count;
  }, [fSearch, fDivision, fSection, fDepartment, fShift, fMachineNo, fStatus, dateRange]);

  const handleRefresh = useCallback(() => {
    tabSessionCache.remove(tabKey);
    void fetchRows(page, pageSize);
    void fetchReport();
    message.success('Production entries refreshed from database');
  }, [fetchRows, fetchReport, page, pageSize, message]);

  // Global header / tab refresh event listener
  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || detail.tabId.startsWith('/production/entries')) {
        handleRefresh();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [handleRefresh]);

  // CSV Export
  const exportToCsv = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export');
      return;
    }
    const headers = [
      'Sr',
      'Date',
      'Division',
      'Section',
      'Department',
      'Shift',
      'Machine',
      'Operator',
      'Item Code',
      'Item Name',
      'Target Qty',
      'Actual Qty',
      'UOM',
      'Per Unit Weight',
      'Actual KG',
      'Achievement %',
      'Efficiency %',
      'Running Hours',
      'Downtime Hours',
      'Scrap (KG)',
      'Status',
    ];

    const csvLines = displayedRows.map((r, i) => {
      const emp = lookups.hrEmployees.find(
        (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
      );
      const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '');
      const itemCode = r.item?.itemCode || '';
      const itemName = r.item?.name || '';
      const status = getEntryStatus(r);

      return [
        (page - 1) * pageSize + i + 1,
        r.entryDate || '',
        `"${(r.division?.name || '').replace(/"/g, '""')}"`,
        `"${(r.section?.name || '').replace(/"/g, '""')}"`,
        `"${(r.department?.name || '').replace(/"/g, '""')}"`,
        `"${(r.shift?.name || '').replace(/"/g, '""')}"`,
        `"${(r.machineNo || '').replace(/"/g, '""')}"`,
        `"${op.replace(/"/g, '""')}"`,
        `"${itemCode.replace(/"/g, '""')}"`,
        `"${itemName.replace(/"/g, '""')}"`,
        r.targetQuantity ?? 0,
        r.actualQuantity ?? 0,
        r.uom?.code || '',
        perUnitWeightLabel(r.uom?.code || '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—',
        calcActualKg(r.uom?.code || '', toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '',
        r.achievementPercentage ?? 0,
        r.efficiencyPercentage ?? 0,
        r.runningHours ?? 0,
        r.downtimeHours ?? 0,
        r.scrapQuantity ?? 0,
        status,
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvLines].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `daily-production-entries-${dayjs().format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success('Exported production entries to CSV');
  };

  // PDF Export
  const exportPdf = async () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export to PDF');
      return;
    }
    setPdfLoading(true);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Daily Production Entry Report', 40, 36);
      doc.setFontSize(9);
      doc.setTextColor(120);
      const dateStr = dayjs().format('DD MMM YYYY, HH:mm');
      doc.text(`Generated: ${dateStr} · Total entries: ${displayedRows.length}`, 40, 50);

      const head = [
        ['Sr', 'Date', 'Division', 'Department', 'Shift', 'Machine', 'Operator', 'Item / Product', 'Target', 'Actual', 'UOM', 'Per Unit Weight', 'Actual KG', 'Achv %', 'Run/Down', 'Status']
      ];

      const body = displayedRows.map((r, i) => {
        const emp = lookups.hrEmployees.find(
          (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
        );
        const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
        const itemCode = r.item?.itemCode || '';
        const itemName = r.item?.name || '';
        const itemDisplay = itemCode && itemName && itemCode !== itemName ? `${itemName} (${itemCode})` : (itemName || itemCode || '—');
        const runH = toNum(r.runningHours);
        const downH = toNum(r.downtimeHours);
        const ach = toNum(r.achievementPercentage);

        return [
          (page - 1) * pageSize + i + 1,
          r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '—',
          r.division?.name || r.division?.divisionCode || '—',
          r.department?.name || r.department?.departmentCode || '—',
          r.shift?.name || '—',
          r.machine?.machineCode || r.machineNo || '—',
          op,
          itemDisplay,
          formatNumber(r.targetQuantity, 2),
          formatNumber(r.actualQuantity, 2),
          r.uom?.code || '',
          perUnitWeightLabel(r.uom?.code || '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—',
          (() => {
            const kg = calcActualKg(r.uom?.code || '', toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
            return kg == null ? '—' : formatNumber(kg, 2);
          })(),
          `${ach.toFixed(1)}%`,
          `${formatNumber(runH, 1)}h / ${formatNumber(downH, 1)}h`,
          getEntryStatus(r),
        ];
      });

      autoTable(doc, {
        head,
        body,
        startY: 60,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
      });

      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.getWidth() - 40,
          doc.internal.pageSize.getHeight() - 15,
          { align: 'right' }
        );
      }
      doc.save(`daily-production-entries-${dayjs().format('YYYY-MM-DD')}.pdf`);
      message.success(`Exported ${displayedRows.length} entries to PDF`);
    } catch (err: any) {
      message.error(err?.message || 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  // Clean Print Layout
  const handlePrint = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to print');
      return;
    }
    const rowHtml = displayedRows.map((r, i) => {
      const emp = lookups.hrEmployees.find(
        (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
      );
      const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
      const itemName = r.item?.name || r.item?.itemCode || '—';
      const ach = toNum(r.achievementPercentage);
      const status = getEntryStatus(r);
      return `<tr>
        <td style="text-align:center;">${(page - 1) * pageSize + i + 1}</td>
        <td>${r.entryDate ? dayjs(r.entryDate).format('YYYY-MM-DD') : '—'}</td>
        <td>${(r.department?.name || '').replace(/[<>&]/g, '')}</td>
        <td>${(r.shift?.name || '').replace(/[<>&]/g, '')}</td>
        <td>${(r.machine?.machineCode || r.machineNo || '').replace(/[<>&]/g, '')}</td>
        <td>${op.replace(/[<>&]/g, '')}</td>
        <td>${itemName.replace(/[<>&]/g, '')}</td>
        <td style="text-align:right;">${formatNumber(r.targetQuantity, 2)} ${r.uom?.code || ''}</td>
        <td style="text-align:right; font-weight:600;">${formatNumber(r.actualQuantity, 2)} ${r.uom?.code || ''}</td>
        <td style="text-align:right; color:#64748b;">${(perUnitWeightLabel(r.uom?.code || '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—').replace(/[<>&]/g, '')}</td>
        <td style="text-align:right; font-weight:600;">${(() => {
          const kg = calcActualKg(r.uom?.code || '', toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
          return kg == null ? '—' : formatNumber(kg, 2);
        })()} KG</td>
        <td style="text-align:right;">${ach.toFixed(1)}%</td>
        <td style="text-align:center;">${status}</td>
      </tr>`;
    }).join('');

    const html = `<!doctype html>
    <html>
    <head>
      <title>Daily Production Entry</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; color: #0f172a; }
        h1 { font-size: 18px; margin: 0 0 4px 0; }
        p { font-size: 11px; color: #64748b; margin: 0 0 14px 0; }
        table { border-collapse: collapse; width: 100%; font-size: 11px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
        th { background: #f1f5f9; font-weight: 600; color: #334155; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { margin: 0; }
        }
      </style>
    </head>
    <body>
      <h1>Daily Production Entry</h1>
      <p>Generated on ${dayjs().format('DD MMM YYYY, HH:mm')} · ${displayedRows.length} record(s)</p>
      <table>
        <thead>
          <tr>
            <th style="width:35px; text-align:center;">Sr</th>
            <th>Date</th>
            <th>Department</th>
            <th>Shift</th>
            <th>Machine</th>
            <th>Operator</th>
            <th>Item / Product</th>
            <th style="text-align:right;">Target</th>
            <th style="text-align:right;">Actual</th>
            <th style="text-align:right;">Per Unit Weight</th>
            <th style="text-align:right;">Actual KG</th>
            <th style="text-align:right;">Achievement</th>
            <th style="text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowHtml}
        </tbody>
      </table>
      <script>
        window.onload = function() {
          window.print();
        };
      </script>
    </body>
    </html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) message.warning('Popup blocked — please allow popups for printing.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Table Columns
  const columns: ColumnsType<ProductionEntryRow> = [
    {
      title: 'Sr',
      width: 46,
      align: 'center',
      ellipsis: true,
      render: (_t, _r, i) => (
        <span style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 11 }}>
          {(page - 1) * pageSize + i + 1}
        </span>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CalendarOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Date</span>
        </span>
      ),
      dataIndex: 'entryDate',
      width: 105,
      sorter: true,
      ellipsis: true,
      render: (d: string) => {
        const dateObj = dayjs(d);
        const formatted = dateObj.isValid() ? dateObj.format('DD MMM YYYY') : (d?.slice(0, 10) || '—');
        return <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>{formatted}</span>;
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ApartmentOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Division</span>
        </span>
      ),
      width: 130,
      ellipsis: true,
      responsive: ['xl'],
      render: (_t, r: ProductionEntryRow) => {
        const divName = r.division?.name || r.division?.divisionCode || '—';
        return (
          <Tooltip title={r.division?.divisionCode ? `${divName} (${r.division.divisionCode})` : divName}>
            <span style={{ whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #475569)' }}>{divName}</span>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <TeamOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Department</span>
        </span>
      ),
      width: 140,
      ellipsis: true,
      render: (_t, r) => (
        <DepartmentBadge
          department={r.department}
          fallback={r.departmentId ? r.departmentId.slice(0, 8) : '—'}
        />
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ClockCircleOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Shift</span>
        </span>
      ),
      width: 120,
      ellipsis: true,
      render: (_t, r) => (
        <ShiftBadge shift={r.shift} fallback="—" />
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <ToolOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Machine</span>
        </span>
      ),
      width: 140,
      ellipsis: true,
      render: (_t, r) => {
        const mCode = r.machine?.machineCode || r.machineNo || '—';
        const mName = r.machine?.name;
        const mFullName = mName ? `${mName} (${mCode})` : mCode;
        return (
          <Tooltip title={mFullName}>
            <div style={{ maxWidth: 140, lineHeight: 1.25 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 12.5,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--theme-text, #1e293b)',
                }}
              >
                <ToolOutlined style={{ fontSize: 11, color: 'var(--theme-primary, #2563eb)', marginRight: 4 }} />
                <span>{mName || mCode}</span>
              </div>
              {mName && mCode !== mName && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--theme-text-muted, #64748b)',
                    paddingLeft: 15,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {mCode}
                </div>
              )}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <UserOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Operator</span>
        </span>
      ),
      width: 140,
      ellipsis: true,
      render: (_t, r) => {
        const emp = lookups.hrEmployees.find(
          (e) => e.id === r.operatorName || e.employeeCode === r.operatorName,
        );
        const op = emp ? lookups.employeeFullName(emp) : (r.operatorName || '—');
        const tooltipText = emp ? `${op} (${emp.employeeCode})` : op;
        return (
          <Tooltip title={tooltipText}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              <UserOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>{op}</span>
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <AppstoreOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Item / Product</span>
        </span>
      ),
      width: 220,
      ellipsis: true,
      render: (_t, r) => {
        const itemName = r.item?.name || r.item?.shortName || r.item?.itemCode;
        const itemCode = r.item?.itemCode;
        const hasDiffCode = itemCode && itemName && itemCode !== itemName;
        return (
          <div style={{ maxWidth: 220, lineHeight: 1.25 }}>
            <ItemBadge item={r.item} fallback="—" />
            {hasDiffCode && (
              <div
                style={{
                  fontSize: 10.5,
                  color: 'var(--theme-text-muted, #64748b)',
                  marginLeft: 14,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={itemCode}
              >
                {itemCode}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <AimOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Target</span>
        </span>
      ),
      align: 'right',
      width: 95,
      ellipsis: true,
      sorter: true,
      dataIndex: 'targetQuantity',
      render: (_t, r) => {
        const uom = r.uom?.code || '';
        return (
          <span style={{ whiteSpace: 'nowrap', color: 'var(--theme-text-secondary, #475569)' }}>
            {formatNumber(r.targetQuantity, 2)}{' '}
            {uom && <span style={{ fontSize: 11, opacity: 0.85 }}>{uom}</span>}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <BarChartOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Production</span>
        </span>
      ),
      align: 'right',
      width: 100,
      ellipsis: true,
      sorter: true,
      dataIndex: 'actualQuantity',
      render: (_t, r) => {
        const uom = r.uom?.code || '';
        return (
          <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--theme-text, #0f172a)' }}>
            {formatNumber(r.actualQuantity, 2)}{' '}
            {uom && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.85 }}>{uom}</span>}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FieldTimeOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Per Unit Weight</span>
        </span>
      ),
      align: 'right',
      width: 120,
      ellipsis: true,
      responsive: ['lg'],
      render: (_t, r) => (
        <span
          style={{
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
            color: 'var(--theme-text-secondary, #475569)',
          }}
        >
          {perUnitWeightLabel(r.uom?.code || '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—'}
        </span>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FieldTimeOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Actual KG</span>
        </span>
      ),
      align: 'right',
      width: 100,
      ellipsis: true,
      responsive: ['lg'],
      render: (_t, r) => {
        const kg = calcActualKg(r.uom?.code || '', toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
        return (
          <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {kg == null ? '—' : `${formatNumber(kg, 2)} KG`}
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <PercentageOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Achievement</span>
        </span>
      ),
      align: 'right',
      width: 115,
      ellipsis: true,
      render: (_t, r) => {
        const ach = toNum(r.achievementPercentage);
        const target = toNum(r.targetQuantity);
        const actual = toNum(r.actualQuantity);
        const uom = r.uom?.code || '';
        const diff = actual - target;

        let varianceNode: React.ReactNode = null;
        if (target > 0) {
          if (diff > 0) {
            varianceNode = (
              <span style={{ color: 'var(--theme-success, #16a34a)', fontWeight: 600 }}>
                ↑ +{formatNumber(diff, 2)} {uom}
              </span>
            );
          } else if (diff < 0) {
            varianceNode = (
              <span style={{ color: 'var(--theme-danger, #dc2626)', fontWeight: 600 }}>
                ↓ -{formatNumber(Math.abs(diff), 2)} {uom}
              </span>
            );
          } else {
            varianceNode = (
              <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
                – 0 {uom}
              </span>
            );
          }
        }

        return (
          <div style={{ textAlign: 'right', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
            <KpiPercentage value={ach} fontSize={12} fontWeight={600} />
            {varianceNode && (
              <div style={{ fontSize: 10.5, marginTop: 1.5 }}>
                {varianceNode}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <FieldTimeOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Run / Down</span>
        </span>
      ),
      align: 'right',
      width: 105,
      ellipsis: true,
      responsive: ['md'],
      render: (_t, r) => {
        const runH = toNum(r.runningHours);
        const downH = toNum(r.downtimeHours);
        const reason = r.downtimeReasonText;
        return (
          <div style={{ textAlign: 'right', lineHeight: 1.25, whiteSpace: 'nowrap', fontSize: 12 }}>
            <span>{formatNumber(runH, 1)}h</span>
            <span style={{ color: 'var(--theme-text-muted, #94a3b8)', margin: '0 3px' }}>/</span>
            <Tooltip title={reason ? `Downtime reason: ${reason}` : undefined}>
              <span
                style={{
                  color: downH > 0 ? 'var(--theme-warning, #d97706)' : 'var(--theme-text-muted, #94a3b8)',
                  fontWeight: downH > 0 ? 500 : 400,
                }}
              >
                {formatNumber(downH, 1)}h
              </span>
            </Tooltip>
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <DeleteOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Scrap (KG)</span>
        </span>
      ),
      align: 'right',
      width: 95,
      ellipsis: true,
      responsive: ['lg'],
      render: (_t, r) => {
        const scrap = toNum(r.scrapQuantity);
        return (
          <span
            style={{
              whiteSpace: 'nowrap',
              color: scrap > 0 ? 'var(--theme-danger, #e11d48)' : 'var(--theme-text-muted, #94a3b8)',
              fontWeight: scrap > 0 ? 500 : 400,
            }}
          >
            {formatNumber(scrap, 2)} KG
          </span>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <CheckCircleOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Status</span>
        </span>
      ),
      align: 'center',
      width: 105,
      render: (_t, r) => {
        const status = getEntryStatus(r);
        return <StatusBadge status={status} />;
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <SettingOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Actions</span>
        </span>
      ),
      fixed: 'right',
      width: 95,
      render: (_t, r) => (
        <TableActions
          className="erp-table-actions--bordered"
          onView={() => navigate(`/production/entries/${r.id}`)}
          onEdit={() => navigate(`/production/entries/${r.id}/edit`)}
          onDelete={async () => {
            try {
              await apiService.delete(`/production/entries/${r.id}`);
              message.success('Production entry deleted successfully');
              void fetchRows();
              void fetchReport();
            } catch {
              message.error('Failed to delete production entry');
            }
          }}
          deleteConfirmTitle="Delete this daily production entry?"
        />
      ),
    },
  ];

  const reportColumns = [
    { title: 'Division', dataIndex: 'divisionName', key: 'divisionName', width: 140 },
    { title: 'Section', dataIndex: 'sectionName', key: 'sectionName', width: 130 },
    {
      title: 'Department',
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 150,
      render: (v: string, d: ReportDept) => (
        <DepartmentBadge department={{ id: d.departmentId, departmentCode: d.departmentCode, name: v }} />
      ),
    },
    {
      title: 'Item Details',
      key: 'detail',
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.items.map((g) => (
            <div
              key={`${g.itemId}-${g.uomCode}`}
              style={{
                padding: '6px 0',
                borderBottom: '1px dashed var(--theme-border, rgba(15, 23, 42, 0.08))',
              }}
            >
              <Space size="middle" wrap>
                <ItemBadge item={{ id: g.itemId, itemCode: g.itemCode, name: g.itemName }} showCode />
<span style={{ fontSize: 12 }}>
                    Target <Text strong>{formatNumber(g.targetQuantity, 0)} {g.uomCode}</Text> · Actual{' '}
                    <Text strong>{formatNumber(g.actualQuantity, 0)} {g.uomCode}</Text>
                  </span>
                  {g.actualKg != null && (
                    <span style={{ fontSize: 12 }}>
                      <Text type="secondary">Actual KG </Text>
                      <Text strong>{formatNumber(g.actualKg, 2)}</Text>
                    </span>
                  )}
                  {perUnitWeightLabel(g.uomCode, g.weightPerPiece, g.weightPerMeter) && (
                    <span style={{ fontSize: 12 }}>
                      <Text type="secondary">Unit Wt </Text>
                      <Text>{perUnitWeightLabel(g.uomCode, g.weightPerPiece, g.weightPerMeter)}</Text>
                    </span>
                  )}
                  {g.achievementPercentage !== null && (
                    <span style={{ fontSize: 12 }}>
                      <Text type="secondary">Achv </Text>
                      <KpiPercentage value={g.achievementPercentage} fontSize={12} fontWeight={600} />
                    </span>
                  )}
                  {g.efficiencyPercentage !== null && (
                    <span style={{ fontSize: 12 }}>
                      <Text type="secondary">Eff </Text>
                      <KpiPercentage value={g.efficiencyPercentage} fontSize={12} fontWeight={600} />
                    </span>
                  )}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Run {formatNumber(g.runningHours, 1)}h · Down {formatNumber(g.downtimeHours, 1)}h · Scrap{' '}
                    {formatNumber(g.scrapQuantity, 0)} KG
                  </Text>
              </Space>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Totals by UOM',
      key: 'totals',
      width: 220,
      render: (_t: unknown, d: ReportDept) => (
        <div>
          {d.totalsByUom.map((t) => (
            <div key={t.uomCode} style={{ padding: '3px 0' }}>
              <Text strong>{t.uomCode}: </Text>
              <Text>
                T {formatNumber(t.targetQuantity, 0)} / A {formatNumber(t.actualQuantity, 0)}
              </Text>{' '}
              {t.achievementPercentage !== null && (
                <KpiPercentage value={t.achievementPercentage} fontSize={12} />
              )}
            </div>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Single Main Page Header Meta with Actions (Image 2 style) */}
      <PageHeader
        icon={<CarryOutOutlined />}
        title="Daily Production Entry"
        subtitle="Manage daily shift production records, operational outputs, and metrics."
        extra={
          <>
            <span className="entry-model-badge">
              ENTERPRISE 2027
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                const qs = new URLSearchParams();
                if (fDivision) qs.set('divisionId', fDivision);
                if (fSection) qs.set('sectionId', fSection);
                if (fDepartment) qs.set('departmentId', fDepartment);
                if (dateRange[0]) qs.set('entryDate', dateRange[0].format('YYYY-MM-DD'));
                if (fShift) qs.set('shiftId', fShift);
                const s = qs.toString();
                navigate(`/production/entries/select${s ? `?${s}` : ''}`);
              }}
            >
              Add Entry
            </Button>

            <Tooltip title="Refresh entries data from database (manual sync)">
              <Button
                icon={<ReloadOutlined spin={loading} />}
                onClick={handleRefresh}
                loading={loading}
                className="entry-top-refresh-btn"
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
            </Tooltip>

            <Tooltip title="Export current entries to CSV">
              <Button
                icon={<DownloadOutlined />}
                onClick={exportToCsv}
                disabled={displayedRows.length === 0}
              >
                Export
              </Button>
            </Tooltip>

            <Tooltip title="Export current entries to PDF">
              <Button
                icon={<FilePdfOutlined />}
                onClick={exportPdf}
                loading={pdfLoading}
                disabled={displayedRows.length === 0}
              >
                PDF
              </Button>
            </Tooltip>

            <Tooltip title="Print professional report view">
              <Button
                icon={<PrinterOutlined />}
                onClick={handlePrint}
                disabled={displayedRows.length === 0}
              >
                Print
              </Button>
            </Tooltip>

            <Tooltip title="Batch import restricted for audit compliance">
              <Button
                icon={<UploadOutlined />}
                onClick={() => setImportModalVisible(true)}
              >
                Import
              </Button>
            </Tooltip>
          </>
        }
      />

      {/* ── 5 Crystal KPI Metric Cards (Image 2 style) ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.lg ? 'repeat(5, 1fr)' : screens.sm ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <KpiCard
          testId="kpi-total-entries"
          label="TOTAL ENTRIES"
          value={kpiData.total}
          icon={CarryOutOutlined}
          tone="#3b82f6"
          toneSoft="rgba(59, 130, 246, 0.12)"
        />
        <KpiCard
          testId="kpi-good-production"
          label="GOOD PRODUCTION"
          value={formatNumber(kpiData.actual, 0)}
          icon={CheckCircleOutlined}
          tone="#16a34a"
          toneSoft="rgba(22, 163, 74, 0.12)"
        />
        <KpiCard
          testId="kpi-target-qty"
          label="TARGET QTY"
          value={formatNumber(kpiData.target, 0)}
          icon={AimOutlined}
          tone="#6366f1"
          toneSoft="rgba(99, 102, 241, 0.12)"
        />
        <KpiCard
          testId="kpi-scrap-rejection"
          label="SCRAP / REJECTION"
          value={`${formatNumber(kpiData.scrap, 1)} KG`}
          icon={DeleteOutlined}
          tone="#e11d48"
          toneSoft="rgba(225, 29, 72, 0.12)"
        />
        <KpiCard
          testId="kpi-avg-efficiency"
          label="AVG EFFICIENCY"
          value={kpiData.ach}
          icon={BarChartOutlined}
          tone="#d97706"
          toneSoft="rgba(217, 119, 6, 0.12)"
        />
      </div>

      {/* ── Chevron Status Pipeline Ribbon & Unified Filter Strip (Image 2 style) ──── */}
      <Card style={{ marginBottom: 12, borderRadius: 12 }} styles={{ body: { padding: '12px 14px' } }}>
        <EntryStatusChevronRibbon
          counts={ribbonCounts}
          activeKey={activeChevronKey}
          onSelect={(key) => setActiveChevronKey(key)}
        />

        <div className="entry-filter-toolbar">
          <Input
            allowClear
            placeholder="Search entries..."
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
            value={fSearch}
            onChange={(e) => setFSearch(e.target.value)}
            onPressEnter={handleSearch}
            style={{ minWidth: 240, flex: '1 1 240px' }}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All Divisions"
            style={{ width: 160 }}
            value={fDivision}
            options={lookups.divisions.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => {
              setFDivision(v);
              setFSection(undefined);
              setFDepartment(undefined);
            }}
          />

          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="All Departments"
            style={{ width: 170 }}
            value={fDepartment}
            options={lookups.departments.map((d: Department) => ({ value: d.id, label: d.name }))}
            onChange={(v) => setFDepartment(v)}
          />

          <Select
            allowClear
            placeholder="All Shifts"
            style={{ width: 140 }}
            value={fShift}
            options={(lookups.shifts || []).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => setFShift(v)}
          />

          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            Search
          </Button>

          <Button
            icon={<FilterOutlined />}
            onClick={() => setMoreFiltersOpen((prev) => !prev)}
            type={moreFiltersOpen || activeFilterCount > 0 ? 'primary' : 'default'}
            ghost={moreFiltersOpen || activeFilterCount > 0}
          >
            More Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </Button>

          <Button icon={<ReloadOutlined />} onClick={handleReset}>
            Reset
          </Button>

          <div className="entry-filter-toolbar__right">
            <strong>{displayedRows.length}</strong> entries · Sorted by Date
          </div>
        </div>

        {moreFiltersOpen && (
          <div className="entry-more-filters-panel">
            <Row gutter={[10, 10]} align="middle">
              <Col xs={24} sm={12} md={8} lg={6}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Date Range
                </Text>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange as never}
                  onChange={(v) =>
                    setDateRange([
                      (v as never as unknown[])[0] as dayjs.Dayjs ?? null,
                      (v as never as unknown[])[1] as dayjs.Dayjs ?? null,
                    ])
                  }
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={4}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Section
                </Text>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Sections"
                  style={{ width: '100%' }}
                  value={fSection}
                  options={lookups.sections.map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(v) => setFSection(v)}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Machine
                </Text>
                <Input
                  allowClear
                  placeholder="e.g. FT-04"
                  value={fMachineNo}
                  onChange={(e) => setFMachineNo(e.target.value)}
                  onPressEnter={handleSearch}
                />
              </Col>

              <Col xs={12} sm={6} md={4} lg={3}>
                <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 2 }}>
                  Status
                </Text>
                <Select
                  allowClear
                  placeholder="All Statuses"
                  style={{ width: '100%' }}
                  value={fStatus}
                  options={[
                    { value: 'COMPLETED', label: 'Completed' },
                    { value: 'IN_PROGRESS', label: 'In Progress' },
                    { value: 'DRAFT', label: 'Draft' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                  ]}
                  onChange={(v) => setFStatus(v)}
                />
              </Col>

              <Col xs={24} sm={12} md={4} lg={3}>
                <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} style={{ marginTop: 18 }}>
                  Apply
                </Button>
              </Col>
            </Row>
          </div>
        )}
      </Card>

      {/* ── Main Production Tabs ─────────────────────────────────────────── */}
      <Tabs
        defaultActiveKey="entries"
        items={[
          {
            key: 'entries',
            label: 'Production Records',
            children: (
              <div style={{ position: 'relative', minHeight: 340 }}>
                {loading && displayedRows.length === 0 ? (
                  <LargeLoadingBuffer
                    title="Loading Production Entries..."
                    subtitle="Syncing real-time records directly from PostgreSQL database..."
                    badgeText="Live Database Feed"
                    minHeight={360}
                  />
                ) : (
                  <>
                    {loading && (
                      <LargeLoadingBuffer
                        overlay
                        title="Refreshing Production Entries..."
                        subtitle="Updating shift production and operational metrics directly from database..."
                        badgeText="Instant Sync"
                      />
                    )}
                    {/* ── Enterprise Production Entry Table ───────────────────── */}
                    <ERPTable<ProductionEntryRow>
                      rowKey="id"
                      columns={columns}
                      dataSource={displayedRows}
                      loading={false}
                      scroll={{ x: 1680 }}
                      dense
                      containerClassName="erp-table-striped"
                  pagination={{
                    current: page,
                    pageSize,
                    total,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (t) => `${t} production entries`,
                    onChange: (p, ps) => {
                      const nextP = ps !== pageSize ? 1 : p;
                      setPage(nextP);
                      setPageSize(ps);
                      void fetchRows(nextP, ps);
                      try {
                        localStorage.setItem(PAGE_SIZE_KEY, String(ps));
                      } catch {
                        // ignore
                      }
                    },
                  }}
                  onChange={(_pagination, _filters, sorter: any) => {
                    if (sorter?.field && sorter?.order) {
                      const fieldMap: Record<string, string> = {
                        entryDate: 'entryDate',
                        targetQuantity: 'targetQuantity',
                        actualQuantity: 'actualQuantity',
                      };
                      const sortBy = fieldMap[sorter.field];
                      if (sortBy) {
                        setLoading(true);
                        apiService
                          .get<{ data: ProductionEntryRow[]; total: number }>('/production/entries', {
                            page,
                            limit: pageSize,
                            sortBy,
                            sortDir: sorter.order === 'ascend' ? 'ASC' : 'DESC',
                            ...buildFilters(),
                          })
                          .then((res) => {
                            setRows(res.data || []);
                            setTotal(res.total || 0);
                          })
                          .catch(() => message.error('Failed to sort production entries'))
                          .finally(() => setLoading(false));
                      }
                    }
                  }}
                />
              </>
            )}
          </div>
        ),
      },
      {
        key: 'report',
        label: (
          <span>
            <BarChartOutlined /> Department-Wise Report
          </span>
        ),
        children: (
          <div style={{ position: 'relative', minHeight: 300 }}>
            {reportLoading && (!report || report.departments.length === 0) ? (
              <LargeLoadingBuffer
                title="Generating Department-Wise Report..."
                subtitle="Aggregating shift operational data and output metrics across departments..."
                badgeText="Real-time Analytics"
                minHeight={320}
              />
            ) : (
              <>
                {reportLoading && (
                  <LargeLoadingBuffer
                    overlay
                    title="Updating Report..."
                    subtitle="Syncing latest departmental metrics..."
                    badgeText="Instant Sync"
                  />
                )}
                {report && report.grandTotalsByUom.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <Row gutter={16}>
                      {report.grandTotalsByUom.map((t) => (
                        <Col key={t.uomCode} span={Math.max(4, Math.floor(24 / report.grandTotalsByUom.length))}>
                          <Statistic
                            title={`Actual (${t.uomCode})`}
                            value={t.actualQuantity}
                            precision={0}
                            suffix={
                              t.achievementPercentage !== null
                                ? ` (${t.achievementPercentage.toFixed(1)}%)`
                                : ''
                            }
                          />
                          <Text type="secondary">
                            Target {formatNumber(t.targetQuantity, 0)} · Scrap {formatNumber(t.scrapQuantity, 0)}
                          </Text>
                        </Col>
                      ))}
                    </Row>
                  </Card>
                )}
                <ERPTable
                  rowKey="departmentId"
                  columns={reportColumns as never}
                  dataSource={report?.departments ?? []}
                  loading={false}
                  pagination={false}
                  dense
                />
              </>
            )}
          </div>
        ),
      },
        ]}
      />

      {/* ── Import Compliance Modal ─────────────────────────────────────── */}
      <Modal
        title="Production Entry Import Policy"
        open={importModalVisible}
        onCancel={() => setImportModalVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setImportModalVisible(false)}>
            Understood
          </Button>,
        ]}
        width={500}
      >
        <div style={{ padding: '8px 0', lineHeight: 1.6 }}>
          <p style={{ margin: '0 0 10px 0' }}>
            Direct bulk file import is intentionally <strong>restricted</strong> for Daily Production entries to guarantee strict inventory ledger trace integrity and audit compliance.
          </p>
          <p style={{ margin: 0, color: 'var(--theme-text-muted, #64748b)', fontSize: 13 }}>
            Each production record requires active machine selection, operator verification, calibrated downtime capture, and real-time inventory lot deduction. Please use the <strong>Add Entry</strong> button to post authorized entries.
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default EntryList;
