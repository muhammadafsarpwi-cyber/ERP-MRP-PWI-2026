import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Badge,
  Skeleton,
  Popover,
  Checkbox,
  Dropdown,
} from 'antd';
import PageHeader from '../../../components/shared/PageHeader';
import { useHeaderActions } from '../../../components/layout/headerActionsStore';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../../services/tabSessionCache';
import {
  PlusOutlined,
  ReloadOutlined,
  FileExcelOutlined,
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
  TableOutlined,
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
  CloseOutlined,
  InboxOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { calcActualKg, perUnitWeightLabel } from '../../../utils/productionWeight';
import { useLookups, Department, ShiftLk } from './lookups';
import { entryOvertimeHours, sumOvertime } from './overtimeHours';
import { effectiveRunning } from './downtimeHours';
import {
  buildDailyProductionReport,
  buildDailyProductionCsv,
  buildPrintHtml,
  executiveKpis,
  grandTotalLabel,
  pdfLineRow,
  pdfSummaryRow,
  sectionBlocks,
  EXECUTIVE_TITLE,
  PDF_MAIN_TEXT,
  PDF_SUB_TEXT,
  TONE_COLOR,
  perUnitWeightValue,
} from './dailyProductionReport';
import type { ExecutiveKpi } from './dailyProductionReport';
import DowntimeAnalytics from './DowntimeAnalytics';
import RejectionScrapDetails from './RejectionScrapDetails';
import KpiPercentage, { kpiIndicator } from '../../../components/kpi/KpiPercentage';
import {
  ERPTable,
  TableActions,
  StatusBadge,
  DepartmentBadge,
  ShiftBadge,
  ItemBadge,
  DeleteConfirmModal,
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
      <span
        style={{
          fontSize: 11,
          lineHeight: 1.2,
          fontWeight: 700,
          letterSpacing: '0.04em',
          color: 'var(--theme-text-muted, #64748b)',
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          display: 'block',
        }}
        title={label}
      >
        {label}
      </span>
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
  overtimeHours?: number | string;
  downtimeHours: number | string;
  downtimeReasonText: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
  status?: string;
  isActive?: boolean;
  inventoryReferenceId?: string | null;
  rawMaterialWarehouseId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
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

/** Shift planned hours carried by a grid row; 0 when the row has no shift plan. */
export function rowPlannedHours(row: ProductionEntryRow): number {
  return toNum((row.shift as { plannedHours?: number | string } | null | undefined)?.plannedHours);
}

/**
 * HOUR MATRIX — the ONE running-hours figure the grid may show.
 *
 * `row.runningHours` is the persisted column and can still carry the legacy
 * value written before overtime was counted, so echoing it put 6h on the grid
 * while EntryDetail and EntryForm both resolved 8h from the same document.
 * Every grid cell therefore recomputes:
 *
 *     Display Running = Shift Planned + Overtime − Total Downtime
 *
 * e.g. 8h shift + 2h OT − 2h downtime → 8h (not 6h);
 *      8h shift + 4h OT − 1h downtime → 11h.
 *
 * Falls back to the stored column when the row carries no planned shift, so a
 * legacy row without a shift plan can never render a bogus 0.
 */
export function displayRunningHours(row: ProductionEntryRow): number {
  return effectiveRunning(
    toNum(row.runningHours),
    toNum(row.downtimeHours),
    rowPlannedHours(row),
    entryOvertimeHours(row),
  );
}

/**
 * RangePicker payload → `[start, end]` tuple, ALWAYS safe to store.
 * Ant Design hands back `null` when the user clicks the clear (x) button and
 * `[start, end]` (either end possibly null) while picking — indexing the null
 * payload directly used to throw
 * "TypeError: Cannot read properties of null (reading '0')" and freeze the
 * Production Entries filter UI. Anything that is not an array collapses to
 * `[null, null]`, so clearing the picker just resets the date filter.
 */
export function dateRangeTuple(value: unknown): [dayjs.Dayjs | null, dayjs.Dayjs | null] {
  const range = Array.isArray(value) ? (value as (dayjs.Dayjs | null)[]) : [];
  return [range[0] ?? null, range[1] ?? null];
}

interface ServerSummary {
  total: number;
  actual: number;
  target: number;
  scrap: number;
  overtime: number;
  downtime: number;
  efficiency: number;
  counts: {
    all: number;
    COMPLETED: number;
    IN_PROGRESS: number;
    DRAFT: number;
    WITH_SCRAP: number;
    WITH_DOWNTIME: number;
  };
}

interface EntryListTabCache {
  rows: ProductionEntryRow[];
  total: number;
  report: ReportResponse | null;
  summary: ServerSummary | null;
}

/** True when a request was cancelled by an AbortController (never an error). */
const isRequestAbort = (err: unknown): boolean => {
  const e = err as { code?: string; name?: string } | null | undefined;
  return e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.name === 'AbortError';
};

/** Headings for the "Manage Columns" popover — MUST stay in the same order as
 *  the `columns` literal inside EntryList: visibility is tracked by column
 *  index, so the two lists are zipped together. A length mismatch degrades to
 *  `Column N` labels (see `columnLabel`) instead of ever crashing the grid. */
const GRID_COLUMN_LABELS: string[] = [
  'Sr #',
  'Date',
  'Division',
  'Department',
  'Shift',
  'Machine',
  'Operator',
  'Item / Product',
  'Target',
  'Production',
  'Achievement',
  'Per Unit Weight',
  'Actual KG',
  'Scrap (KG)',
  'Run / Down',
  'OT (h)',
  'Status',
  'Created By',
  'Updated By',
  'Actions',
];

const EntryList: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const lookups = useLookups();
  const screens = Grid.useBreakpoint();
  const PAGE_SIZE_KEY = 'production_entry_pagesize';
  const tabKey = '/production/entries';

  // Retrieve cached tab data if this workspace tab is already open
  const cachedTab = useMemo(() => tabSessionCache.get<EntryListTabCache>(tabKey), []);

  const [rows, setRows] = useState<ProductionEntryRow[]>(() => cachedTab?.rows ?? []);
  const [total, setTotal] = useState<number>(() => cachedTab?.total ?? 0);
  const [serverSummary, setServerSummary] = useState<ServerSummary | null>(() => cachedTab?.summary ?? null);
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

  // ── Column visibility (Manage Columns popover) ────────────────────────
  // Indices of the grid columns the user unchecked. Held as a Set replaced
  // wholesale on every toggle so React always sees a new reference — showing
  // / hiding a column can never leave the table in a stale or broken state.
  const [hiddenColumnIdx, setHiddenColumnIdx] = useState<Set<number>>(() => new Set());
  const toggleColumn = useCallback((idx: number) => {
    setHiddenColumnIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);
  const showAllColumns = useCallback(() => setHiddenColumnIdx(new Set()), []);

  // Start with loading true only if tab has never loaded yet
  const [loading, setLoading] = useState(!cachedTab);
  const [reportLoading, setReportLoading] = useState(!cachedTab);
  const [report, setReport] = useState<ReportResponse | null>(() => cachedTab?.report ?? null);
  const isInitialMount = useRef(true);

  // ── Request lifecycle ───────────────────────────────────────────────────
  // rowsAbortRef / reportAbortRef: starting a new request of the same kind
  // aborts the previous one, so a stale response can never overwrite newer
  // tab state (search / refresh / sort races).
  // disposedRef: flipped when this instance is genuinely destroyed; a late
  // response is then ignored instead of resurrecting state for a closed tab.
  // Deliberately NOT aborting on unmount: React 18 StrictMode re-runs mount
  // effects on the same instance, so cancelling there would kill the only
  // in-flight request while the fetch lock still blocks the re-run. The pane
  // itself is never unmounted (WorkspaceTabViewport keeps it alive), so this
  // is only a safety net, not the primary mechanism.
  const rowsAbortRef = useRef<AbortController | null>(null);
  const reportAbortRef = useRef<AbortController | null>(null);
  const disposedRef = useRef(false);
  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

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

  // Which pane of the main <Tabs> is on screen. The Tabs stay UNCONTROLLED
  // (defaultActiveKey) so their behaviour is byte-identical to before — this
  // state only gates the two analytical sheets' read-only requests, so a pane
  // the operator never opens costs exactly zero requests. The live log grid is
  // never touched by either sheet (Zero-Disturbance Policy).
  const [paneKey, setPaneKey] = useState<string>('entries');

  // ── Delete Confirmation & Success Result Dialog States ──
  const [deleteTarget, setDeleteTarget] = useState<ProductionEntryRow | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const buildFilters = useCallback((chevron = activeChevronKey) => ({
    search: fSearch.trim() || undefined,
    divisionId: fDivision,
    sectionId: fSection,
    departmentId: fDepartment,
    dateFrom: dateRange[0]?.format('YYYY-MM-DD'),
    dateTo: dateRange[1]?.format('YYYY-MM-DD'),
    shiftId: fShift,
    machineNo: fMachineNo.trim() || undefined,
    status: fStatus,
    chevronKey: chevron !== 'all' ? chevron : undefined,
  }), [fSearch, fDivision, fSection, fDepartment, dateRange, fShift, fMachineNo, fStatus, activeChevronKey]);

  const fetchRows = useCallback(async (p = page, ps = pageSize, chevron = activeChevronKey) => {
    // Supersede any in-flight list request (refresh / search / filter races)
    // so an older response can never overwrite newer tab state.
    rowsAbortRef.current?.abort();
    const controller = new AbortController();
    rowsAbortRef.current = controller;

    setLoading(true);
    try {
      const res = await apiService.get<{
        success: boolean;
        data: ProductionEntryRow[];
        total: number;
        summary?: ServerSummary;
      }>(
        '/production/entries',
        { page: p, limit: ps, ...buildFilters(chevron) },
        { signal: controller.signal },
      );
      if (disposedRef.current || rowsAbortRef.current !== controller) return;
      const newRows = res.data || [];
      const newTotal = res.total || 0;
      const newSummary = res.summary ?? null;
      setRows(newRows);
      setTotal(newTotal);
      if (newSummary) {
        setServerSummary(newSummary);
      }

      // Save to tab session cache
      const current = tabSessionCache.get<EntryListTabCache>(tabKey);
      tabSessionCache.set<EntryListTabCache>(tabKey, {
        rows: newRows,
        total: newTotal,
        report: current?.report ?? null,
        summary: newSummary ?? current?.summary ?? null,
      });
    } catch (err) {
      if (isRequestAbort(err) || disposedRef.current || rowsAbortRef.current !== controller) return;
      message.error('Failed to load production entries');
    } finally {
      if (rowsAbortRef.current === controller) {
        rowsAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [page, pageSize, activeChevronKey, buildFilters, message]);

  const fetchReport = useCallback(async () => {
    reportAbortRef.current?.abort();
    const controller = new AbortController();
    reportAbortRef.current = controller;

    setReportLoading(true);
    try {
      const res = await apiService.get<{ success: boolean } & ReportResponse>(
        '/production/entries/report',
        buildFilters(),
        { signal: controller.signal },
      );
      if (disposedRef.current || reportAbortRef.current !== controller) return;
      setReport(res);

      // Save to tab session cache
      const current = tabSessionCache.get<EntryListTabCache>(tabKey);
      tabSessionCache.set<EntryListTabCache>(tabKey, {
        rows: current?.rows ?? rows,
        total: current?.total ?? total,
        report: res,
        summary: current?.summary ?? serverSummary,
      });
    } catch (err) {
      if (isRequestAbort(err) || disposedRef.current || reportAbortRef.current !== controller) return;
      message.error('Failed to load production report');
    } finally {
      if (reportAbortRef.current === controller) {
        reportAbortRef.current = null;
        setReportLoading(false);
      }
    }
  }, [buildFilters, message, rows, total, serverSummary]);

  useEffect(() => {
    // (1) Returning to an already-open tab: its data lives in the session
    //     cache, so switching tabs must never behave like a refresh.
    if (tabSessionCache.has(tabKey)) {
      return;
    }
    // (2) Single-flight lock: React 18 StrictMode re-runs this mount effect in
    //     dev. Only the very first run may issue the requests, which makes a
    //     cold load exactly 1 × /production/entries + 1 × /entries/report.
    if (!tabSessionCache.tryAcquireFetchLock(tabKey)) {
      return;
    }
    let settled = 0;
    const onSettled = () => {
      if (++settled >= 2) tabSessionCache.releaseFetchLock(tabKey);
    };
    void fetchRows(page, pageSize).then(onSettled, onSettled);
    void fetchReport().then(onSettled, onSettled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    void fetchRows(1, pageSize, activeChevronKey);
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
      void fetchRows(1, pageSize, 'all').then(() => fetchReport());
    }, 0);
  };

  // Status & Attribute Counts for 2027 Chevron Status Ribbon
  const ribbonCounts = useMemo(() => {
    if (serverSummary?.counts) {
      return serverSummary.counts;
    }
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
  }, [serverSummary, rows, total]);

  // Client-side status and chevron filter (fallback only if backend didn't filter)
  const displayedRows = useMemo(() => {
    if (serverSummary) {
      return rows;
    }
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
  }, [rows, serverSummary, activeChevronKey, fStatus]);

  // Aggregate KPI summary for Crystal Metric Cards
  const kpiData = useMemo(() => {
    if (serverSummary) {
      return {
        total: serverSummary.total,
        actual: serverSummary.actual,
        target: serverSummary.target,
        scrap: serverSummary.scrap,
        // Canonical OT (SQL: overtime_hours, else legacy remarks `OT: X h`) —
        // the exact same rule the OT column renders (see ./overtimeHours.ts).
        overtime: serverSummary.overtime,
        downtime: serverSummary.downtime,
        ach: `${formatNumber(serverSummary.efficiency, 2)}%`,
      };
    }
    const target = displayedRows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = displayedRows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = displayedRows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    const overtime = sumOvertime(displayedRows);
    const downtime = displayedRows.reduce((s, r) => s + toNum(r.downtimeHours), 0);
    const ach = target > 0 ? Math.round((actual / target) * 10000) / 100 : null;
    return {
      total: total || rows.length,
      actual,
      target,
      scrap,
      overtime,
      downtime,
      ach: ach !== null ? `${ach}%` : '0%',
    };
  }, [serverSummary, displayedRows, total, rows.length]);

  const summary = useMemo(() => {
    if (serverSummary) {
      return {
        target: serverSummary.target,
        actual: serverSummary.actual,
        scrap: serverSummary.scrap,
        ach: serverSummary.efficiency,
      };
    }
    const target = displayedRows.reduce((s, r) => s + toNum(r.targetQuantity), 0);
    const actual = displayedRows.reduce((s, r) => s + toNum(r.actualQuantity), 0);
    const scrap = displayedRows.reduce((s, r) => s + toNum(r.scrapQuantity), 0);
    return {
      target,
      actual,
      scrap,
      ach: target > 0 ? Math.round((actual / target) * 10000) / 100 : null,
    };
  }, [serverSummary, displayedRows]);

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

  const panelFilterCount = useMemo(() => {
    let count = 0;
    if (fDivision) count++;
    if (fSection) count++;
    if (fDepartment) count++;
    if (fShift) count++;
    if (fMachineNo.trim()) count++;
    if (fStatus) count++;
    if (dateRange[0] || dateRange[1]) count++;
    return count;
  }, [fDivision, fSection, fDepartment, fShift, fMachineNo, fStatus, dateRange]);

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

  // Claim this tab's shared-header action slot. Most pages register their header
  // buttons WITHOUT a tab id, which the store resolves to "the tab that is active
  // right now" — correct only while the caller itself is on screen. Now that panes
  // stay mounted (keep-alive), a background page re-registering late would
  // otherwise replace the entries header (Refresh / Export / …) with its own
  // buttons; a claimed slot rejects those anonymous writes.
  useEffect(() => {
    const store = useHeaderActions.getState();
    store.claimActionsSlot(location.pathname);
    return () => store.releaseActionsSlot(location.pathname);
  }, [location.pathname]);

  // ------------------------------------------------------------------
  // PHASE 5 — ONE report model shared by Print / PDF / Excel export.
  // Header (division + the exact date selected in the filter), grouping by
  // department, machine-ascending row order and department totals all come
  // from this single builder (./dailyProductionReport.ts).
  // ------------------------------------------------------------------
  const buildReportModel = useCallback(
    () =>
      buildDailyProductionReport(displayedRows, {
        divisionName: fDivision ? lookups.divisions.find((d) => d.id === fDivision)?.name ?? null : null,
        dateFrom: dateRange[0]?.format('YYYY-MM-DD') ?? null,
        dateTo: dateRange[1]?.format('YYYY-MM-DD') ?? null,
        shiftName: fShift ? lookups.shifts.find((s) => s.id === fShift)?.name ?? null : null,
        operatorName: (row) => {
          const emp = lookups.hrEmployees.find(
            (e) => e.id === row.operatorName || e.employeeCode === row.operatorName,
          );
          return emp ? lookups.employeeFullName(emp) : row.operatorName || '—';
        },
        status: (row) => getEntryStatus(row as ProductionEntryRow),
        // Line 2 of the Shift cell — the shift master's window (`06:00 -
        // 14:00`), falling back to the times already carried on the row.
        shiftTiming: (row) => {
          const rowShift = row.shift as
            | { id?: string; name?: string; startTime?: string | null; endTime?: string | null }
            | null
            | undefined;
          const master = lookups.shifts.find(
            (s) =>
              (rowShift?.id && s.id === rowShift.id) ||
              (rowShift?.name && s.name === rowShift.name),
          );
          const hm = (v?: string | null): string => (/^(\d{1,2}:\d{2})/.exec(String(v ?? '').trim()) || [])[1] || '';
          const start = hm(master?.startTime ?? rowShift?.startTime);
          const end = hm(master?.endTime ?? rowShift?.endTime);
          if (start && end) return `${start} - ${end}`;
          return start || end || '-';
        },
      }),
    [displayedRows, fDivision, fShift, dateRange, lookups],
  );

  // Excel (CSV) export — mirrors the print/PDF layout exactly: report header
  // block (Division / Date), department sections, machine ordering, the same
  // column order and one summary row per department plus a grand total.
  const exportToCsv = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export');
      return;
    }
    const model = buildReportModel();
    const csvContent = buildDailyProductionCsv(model);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `daily-production-report-${(dateRange[0] ?? dayjs()).format('YYYY-MM-DD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success(
      `Exported ${model.grand.entries} entries across ${model.sections.length} department(s) to Excel (CSV)`,
    );
  };

  // PDF export — same header (division + the exact selected date), department
  // grouping, machine-ascending order, department totals and grand total as
  // the Print and Excel outputs. Fixed column widths + linebreak overflow keep
  // every value inside its box.
  const exportPdf = async () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to export to PDF');
      return;
    }
    setPdfLoading(true);
    try {
      const model = buildReportModel();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      const marginLeft = 28;
      const marginRight = 28;
      const marginTop = 84;
      const marginBottom = 34;
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const contentWidth = pageWidth - marginLeft - marginRight;

      // The model's column widths (always 100%) become fixed cell widths, so
      // long item/operator names wrap inside the cell instead of overflowing.
      //
      // 2-LINE MAXIMUM RHYTHM — mirrors the print CSS, so a PDF row is never
      // taller than 2 lines either:
      //   · Item / Shift are TWO raw lines (name + code / timing). autoTable's
      //     built-in `ellipsize` measures EACH raw line against the cell width
      //     and shortens it with "..." instead of wrapping it — a wrapped name
      //     would make the row 3 lines tall and the sub-line drawn below would
      //     land on top of the wrapped text.
      //   · every other cell may wrap, but `twoLinesMax` hard-caps it at two
      //     physical lines and marks the cut with an ellipsis.
      type PdfColumnStyle = {
        cellWidth: number;
        halign: 'left' | 'center' | 'right';
        overflow: 'ellipsize' | ((text: string | string[], space: number) => string[]);
        /** Only WEIGHT (KG) overrides the global 3pt padding — it is the
         *  narrowest numeric column in the table, so it sheds the horizontal
         *  dead space the wider text columns genuinely need. */
        cellPadding?: { top?: number; right?: number; bottom?: number; left?: number };
      };

      /** Truncate `text` so it fits `space` at the CURRENT font, with an
       *  ellipsis when it had to be cut. */
      const fitText = (text: string, space: number): string => {
        if (doc.getTextWidth(text) <= space) return text;
        let cut = text;
        while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > space) cut = cut.slice(0, -1);
        return `${cut.trimEnd()}...`;
      };

      /** Wrap to the cell width, keeping AT MOST two lines; whatever does not
       *  fit is folded into line 2 behind an ellipsis. */
      const twoLinesMax = (text: string | string[], space: number): string[] => {
        const usable = Math.max(space, 1);
        const rawLines = Array.isArray(text) ? text : [text];
        const out: string[] = [];
        for (const raw of rawLines) {
          const parts = (doc.splitTextToSize(String(raw), usable) || []) as string[];
          for (const part of parts) {
            if (out.length < 2) {
              out.push(part);
              continue;
            }
            out[1] = fitText(`${out[1]} ${part}`.trim(), usable);
            return out;
          }
        }
        return out;
      };

      const columnStyles: Record<string, PdfColumnStyle> = {};
      model.columns.forEach((c, i) => {
        const base: Omit<PdfColumnStyle, 'overflow'> = {
          cellWidth: (contentWidth * c.width) / 100,
          halign: c.align,
        };
        // WEIGHT (KG) — the print CSS drops this column's horizontal padding
        // too (.rp-table .c-tight); the PDF mirrors it so both surfaces shed
        // the same dead space.
        if (c.key === 'weight') base.cellPadding = { top: 3, right: 1, bottom: 3, left: 1 };
        columnStyles[String(i)] =
          c.key === 'item' || c.key === 'shift'
            ? { ...base, overflow: 'ellipsize' }
            : { ...base, overflow: twoLinesMax };
      });

      // Redrawn on every page (via didDrawPage) so the division/date header
      // never breaks away from the table it describes. The production date +
      // generation stamp are pinned to the FAR RIGHT of that line on EVERY
      // sheet — they are never part of the left-hand run.
      const drawHeader = () => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(model.title, marginLeft, 30);
        doc.setFontSize(11);
        doc.setTextColor(29, 78, 216);
        doc.text(model.divisionLabel, marginLeft, 45);

        // FAR RIGHT first: the stamp must always fit, so the left run yields
        // the shift before the entry counts if the two would collide.
        const stamp = [model.dateLabel, model.generatedLabel].filter(Boolean).join('   ·   ');
        const stampW = stamp ? doc.getTextWidth(stamp) : 0;
        let bits = [model.shiftLabel, model.metaLine].filter(Boolean) as string[];
        if (stamp) {
          const leftW = () => doc.getTextWidth(bits.join('   ·   '));
          while (bits.length > 1 && leftW() + 14 + stampW > contentWidth) bits = bits.slice(1);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        if (bits.length) doc.text(bits.join('   ·   '), marginLeft, 60);
        if (stamp) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(stamp, pageWidth - marginRight, 60, { align: 'right' });
        }

        doc.setDrawColor(15, 23, 42);
        doc.setLineWidth(0.8);
        doc.line(marginLeft, 70, pageWidth - marginRight, 70);
      };

      const head = [model.columns.map((c) => c.label)];
      let startY = marginTop;
      const fits = (height: number) => startY + height <= pageHeight - marginBottom;

      // PHASE 6 — jsPDF embeds WinAnsi fonts, so ▲/▼ would come out as
      // garbage (UTF-16 bytes read back as WinAnsi). The arrow is therefore
      // drawn as a vector triangle on the free left side of the cell (the
      // percentage itself is right-aligned), in the achievement tone colour.
      const achIndex = model.columns.findIndex((c) => c.key === 'achievement');
      const drawAchievementArrow = (data: any) => {
        if (data.section === 'head' || data.column.index !== achIndex) return;
        const raw = data.cell.raw;
        if (!raw || typeof raw !== 'object' || raw.colSpan) return;
        const color = raw.styles?.textColor;
        if (!Array.isArray(color)) return;
        const isUp = color[0] === TONE_COLOR.up[0] && color[1] === TONE_COLOR.up[1];
        const isDown = color[0] === TONE_COLOR.down[0] && color[1] === TONE_COLOR.down[1];
        if (!isUp && !isDown) return;
        const cx = data.cell.x + 7;
        const cy = data.cell.y + data.cell.height / 2;
        const s = 3.4;
        doc.setFillColor(color[0], color[1], color[2]);
        if (isUp) doc.triangle(cx - s, cy + s, cx + s, cy + s, cx, cy - s, 'F');
        else doc.triangle(cx - s, cy - s, cx + s, cy - s, cx, cy + s, 'F');
      };

      // PHASE 7 — autoTable styles apply to the whole CELL, so a cell whose
      // two lines must look different cannot be styled per line. The four
      // FUSED cells (Item / Shift / WEIGHT (KG) / REJECTION-SCRAP) are
      // therefore emitted as `<line 1>\n<nbsp>`: autoTable draws line 1 and
      // the trailing non-breaking space keeps line 2 reserved, which is
      // painted here with its own colour — and, when the cell asks for it,
      // its own weight. WEIGHT (KG) needs that: the small per-unit figure is
      // line 1 and the Actual KG trails underneath in bold, the reverse of
      // Item / Shift. See STACKED_PDF in ./dailyProductionReport.ts.
      const drawSubLine = (data: any) => {
        if (data.section === 'head') return;
        const raw = data.cell.raw;
        if (!raw || typeof raw !== 'object' || raw.colSpan) return;
        const sub = raw.sub;
        if (typeof sub !== 'string' || sub.trim() === '') return;

        const lines = Array.isArray(data.cell.text) ? data.cell.text : [];
        const lineCount = lines.length || 1;
        const styles = data.cell.styles ?? {};
        const fontSize = (doc.internal as any).getFontSize(); // unit is 'pt' → points
        const lineHeightFactor = (doc as any).getLineHeightFactor
          ? (doc as any).getLineHeightFactor()
          : 1.15;
        const lineHeight = fontSize * lineHeightFactor;
        const pos = data.cell.getTextPos();

        // Same maths as autoTable's autoTableText(): first baseline, then a
        // step down to the LAST line, so a wrapped product name still leaves
        // the code / shift timing on its own line.
        let baseline = pos.y + fontSize * (2 - 1.15);
        if (styles.valign === 'middle') baseline -= (lineCount / 2) * lineHeight;
        else if (styles.valign === 'bottom') baseline -= lineCount * lineHeight;
        baseline += (lineCount - 1) * lineHeight;

        const color = raw.subColor || PDF_SUB_TEXT;
        // WEIGHT (KG) trails its Actual KG in BOLD, so line 2 must be able to
        // switch weight; every other fused cell stays normal. (Without this
        // the two lines of a fused cell are always identically weighted.)
        doc.setFont('helvetica', raw.subBold ? 'bold' : 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(color[0], color[1], color[2]);
        // REJECTION / SCRAP runs the tightest rhythm in the table: its cell
        // carries a negative `subGap`, which lifts line 2 toward line 1.
        if (typeof raw.subGap === 'number' && raw.subGap !== 0) baseline += raw.subGap;
        // Never let the sub-line spill into the neighbouring column: it is
        // drawn as plain text (no autoTable wrapping), so it is clipped to the
        // cell's inner width first. `cellPadding` resolves to a NUMBER for
        // most columns but to a per-side object for WEIGHT (KG), which shaves
        // its horizontal padding — so the inner width is derived from
        // whichever shape the column actually resolved to.
        const pad = styles.cellPadding;
        const innerPad =
          typeof pad === 'number'
            ? pad * 2
            : pad && typeof pad === 'object'
              ? Number((pad as { left?: number }).left ?? 3) + Number((pad as { right?: number }).right ?? 3)
              : 6;
        const space = Math.max((data.cell.width || 0) - innerPad, 4);
        doc.text(fitText(sub, space), pos.x, baseline);
      };

      const runTable = (head: string[][], body: any[][], y: number): number => {
        autoTable(doc, {
          head,
          body,
          startY: y,
          margin: { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft },
          styles: {
            fontSize: 9,
            cellPadding: 3,
            overflow: 'linebreak',
            lineColor: [148, 163, 184],
            lineWidth: 0.4,
            valign: 'middle',
          },
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: 'bold', halign: 'center' },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          columnStyles,
          didDrawPage: () => drawHeader(),
          didDrawCell: (data: any) => {
            drawAchievementArrow(data);
            drawSubLine(data);
          },
        });
        return ((doc as any).lastAutoTable?.finalY as number) ?? y;
      };

      for (const section of model.sections) {
        // A department that does not fit in the remaining space starts on a
        // fresh page; one that is longer than a page splits across pages.
        const rowsInTable = section.lines.length + section.shiftGroups.length + 1;
        const estimate = 20 + rowsInTable * 15 + 20;
        if (startY > marginTop && !fits(estimate)) {
          doc.addPage();
          startY = marginTop;
        }
        // DEPARTMENT header, then (Day rows + Day Shift Total, Night rows +
        // Night Shift Total) and finally the Department Grand Total.
        const body: any[][] = [
          [
            {
              content: `DEPARTMENT — ${section.name}    ·    ${section.totals.machines} machine(s) · ${section.totals.entries} entries`,
              colSpan: model.columns.length,
              styles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'left' },
            },
          ],
        ];
        for (const block of sectionBlocks(section)) {
          for (const line of block.lines) body.push(pdfLineRow(model.columns, line));
          body.push(pdfSummaryRow(model, block.totals, block.label, block.kind));
        }
        startY = runTable(head, body, startY) + 14;
      }

      if (model.sections.length > 0) {
        if (startY > marginTop && !fits(40)) {
          doc.addPage();
          startY = marginTop;
        }
        startY =
          runTable(
            [],
            [pdfSummaryRow(model, model.grand, grandTotalLabel(model.sections.length), 'grand')],
            startY,
          ) + 14;
      }

      // ── EXECUTIVE DEPARTMENT SUMMARY — always the LAST page ───────────
      // One boxed card per department (3 per row), drawn with vector
      // rectangles so the PDF matches the print card exactly: 1px #cbd5e1
      // border over a subtle #f8fafc fill, then Target / Actual, the
      // highlighted Achievement % with its Phase 7 tone — green ▲ / red ▼,
      // drawn as vector triangles because jsPDF embeds WinAnsi fonts — the
      // two scrap rows, and finally THAT department's own nested item list
      // (there is no separate consolidation card any more).
      const execCards = executiveKpis(model);
      if (execCards.length > 0) {
        const cols = 3;
        const gap = 14;
        const cardW = (contentWidth - gap * (cols - 1)) / cols;
        const rowGap = 14;
        const pad = 10;
        const titleY = 100;
        const gridTop = titleY + 22;
        // The KPI block is a fixed height; the nested footer then adds a
        // rule + column header (30pt) and 26pt per pooled part.
        const KPI_H = 122;
        const FOOT_HEAD = 30;
        const ITEM_ROW = 26;
        // The three-column metric grid of the print card, in points:
        // pooled code | production pieces | completed weight.
        const PCS_COL = 66;
        const KG_COL = 70;
        const COL_GAP = 6;
        const cardHeight = (card: ExecutiveKpi) =>
          card.items.length ? KPI_H + FOOT_HEAD + card.items.length * ITEM_ROW : KPI_H;

        const drawTitle = () => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(16);
          doc.setTextColor(15, 23, 42);
          const w = doc.getTextWidth(EXECUTIVE_TITLE);
          doc.text(EXECUTIVE_TITLE, marginLeft + (contentWidth - w) / 2, titleY);
        };

        const drawCard = (card: ExecutiveKpi, x: number, y: number) => {
          const h = cardHeight(card);
          // Box: border + light background + inner padding (.rp-kpi-card).
          doc.setFillColor(248, 250, 252);
          doc.rect(x, y, cardW, h, 'F');
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.8);
          doc.rect(x, y, cardW, h, 'S');

          // Row 1 — department name, bold, over its own rule.
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.setTextColor(15, 23, 42);
          doc.text(card.name, x + pad, y + 20);
          doc.setLineWidth(0.5);
          doc.line(x + pad, y + 26, x + cardW - pad, y + 26);

          // Rows 2 / 3 — Target / Actual (label left, value right).
          const targetY = y + 43;
          const actualY = y + 57;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Target:', x + pad, targetY);
          doc.text('Actual:', x + pad, actualY);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(card.target, x + cardW - pad, targetY, { align: 'right' });
          doc.text(card.actual, x + cardW - pad, actualY, { align: 'right' });

          // Row 4 — highlighted Achievement %, tinted by the tone colour.
          const achY = y + 82;
          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.5);
          doc.setLineDashPattern([2, 2], 0);
          doc.line(x + pad, y + 68, x + cardW - pad, y + 68);
          doc.setLineDashPattern([], 0);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Achievement %:', x + pad, achY);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          const color = card.tone ? TONE_COLOR[card.tone] : PDF_MAIN_TEXT;
          doc.setTextColor(color[0], color[1], color[2]);
          const valueRight = x + cardW - pad;
          doc.text(card.achievementText, valueRight, achY, { align: 'right' });
          if (card.tone) {
            const cx = valueRight - doc.getTextWidth(card.achievementText) - 7;
            const cy = achY - 3.4;
            const s = 3.6;
            doc.setFillColor(color[0], color[1], color[2]);
            if (card.tone === 'up') doc.triangle(cx - s, cy + s, cx + s, cy + s, cx, cy - s, 'F');
            else doc.triangle(cx - s, cy - s, cx + s, cy - s, cx, cy + s, 'F');
          }

          // Rows 5 / 6 — the NEW scrap rows, stacked straight under
          // Achievement % exactly as the print card stacks them.
          const rejKgY = y + 96;
          const scrapPctY = y + 110;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9.5);
          doc.setTextColor(100, 116, 139);
          doc.text('Total Rejection:', x + pad, rejKgY);
          doc.text('Scrap Percentage:', x + pad, scrapPctY);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(15, 23, 42);
          doc.text(card.rejectionKg, valueRight, rejKgY, { align: 'right' });
          doc.text(card.rejectionPct, valueRight, scrapPctY, { align: 'right' });

          if (card.items.length === 0) return;

          // ── NESTED ITEM FOOTER — this department's own pooled parts ─────
          // Mirrors .rp-iw-head / .rp-iw-main / .rp-iw-sub: a rule, a tiny
          // column header, then one two-line row per part — the pooled code,
          // piece count and weight on line 1, the full product name and the
          // light scrap sub-metric on line 2. Grouping already happened
          // upstream: `sectionItemTotals` only ever sees this section's lines.
          const kgRight = x + cardW - pad;
          const pcsRight = kgRight - KG_COL - COL_GAP;
          const labelX = x + pad;
          const labelW = Math.max(pcsRight - COL_GAP - PCS_COL - labelX, 24);
          const rowW = kgRight - labelX;

          doc.setDrawColor(203, 213, 225);
          doc.setLineWidth(0.5);
          doc.line(labelX, y + KPI_H, kgRight, y + KPI_H);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text('ITEM', labelX, y + KPI_H + 13);
          doc.text('PRODUCTION (Pcs)', pcsRight, y + KPI_H + 13, { align: 'right' });
          doc.text('WEIGHT (KG)', kgRight, y + KPI_H + 13, { align: 'right' });
          doc.setLineWidth(0.4);
          doc.line(labelX, y + KPI_H + 17, kgRight, y + KPI_H + 17);

          card.items.forEach((it, i) => {
            const line1 = y + KPI_H + 32 + i * ITEM_ROW;
            const line2 = line1 + 11;
            // Line 1 — pooled code, piece count, weight. The code is trimmed
            // rather than wrapped so every row stays exactly two lines tall.
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(51, 65, 85);
            doc.text(fitText(it.code, labelW), labelX, line1);
            doc.setTextColor(15, 23, 42);
            doc.text(it.actualPcs, pcsRight, line1, { align: 'right' });
            doc.setFont('helvetica', 'normal');
            doc.text(it.actualKg, kgRight, line1, { align: 'right' });
            // Line 2 — the full product name, muted; the light scrap
            // sub-metric rides on the right ONLY when there is one to show.
            // Font size first, so both the fit budget and the trim itself
            // measure at the SAME size the text is finally drawn at.
            const scrap = it.hasScrap ? `Scrap ${it.scrapPcs} Pcs / ${it.scrapKg} KG` : '';
            doc.setFontSize(7.5);
            const scrapW = scrap ? doc.getTextWidth(scrap) : 0;
            doc.setTextColor(100, 116, 139);
            doc.text(fitText(it.name, Math.max(rowW - scrapW - 8, 16)), labelX, line2);
            if (scrap) {
              doc.setTextColor(148, 163, 184);
              doc.text(scrap, kgRight, line2, { align: 'right' });
            }
            // Dotted separator between parts — the last row keeps none.
            if (i < card.items.length - 1) {
              doc.setDrawColor(226, 232, 240);
              doc.setLineWidth(0.3);
              doc.setLineDashPattern([1, 2], 0);
              doc.line(labelX, line2 + 5, kgRight, line2 + 5);
              doc.setLineDashPattern([], 0);
            }
          });
        };

        // Cards are packed GREEDILY: a row of up to three goes onto the page
        // only while the TALLEST card in it still fits, because the nested
        // item footer gives every department a different height. A card that
        // cannot fit even on an empty sheet is drawn anyway rather than
        // looping on it forever.
        let placed = 0;
        while (placed < execCards.length) {
          doc.addPage();
          drawHeader();
          drawTitle();
          let y = gridTop;
          while (placed < execCards.length) {
            const rowCards = execCards.slice(placed, placed + cols);
            const rowH = Math.max(...rowCards.map(cardHeight));
            if (y > gridTop && y + rowH > pageHeight - marginBottom) break;
            rowCards.forEach((card, k) => drawCard(card, marginLeft + k * (cardW + gap), y));
            y += rowH + rowGap;
            placed += rowCards.length;
          }
        }
      }

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
      doc.save(`daily-production-report-${(dateRange[0] ?? dayjs()).format('YYYY-MM-DD')}.pdf`);
      message.success(
        `Exported ${model.grand.entries} entries across ${model.sections.length} department(s) to PDF`,
      );
    } catch (err: any) {
      message.error(err?.message || 'PDF export failed');
    } finally {
      setPdfLoading(false);
    }
  };

  // Print layout — A4 landscape document with the report header (Division +
  // the exact selected Date), one section per department with machine-
  // ascending rows and a summary row per department + grand total. Table data
  // is 11px, boxed with consistent borders, `thead` repeats across pages and a
  // department section that does not fit continues on a fresh page.
  const handlePrint = () => {
    if (!displayedRows || displayedRows.length === 0) {
      message.warning('No production entries to print');
      return;
    }
    const html = buildPrintHtml(buildReportModel());

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
          {perUnitWeightValue(r.uom?.code || '', r.item?.weightPerPiece, r.item?.weightPerMeter) || '—'}
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
        const uom = r.uom?.code || '';
        // Rejection % — Rejection KG / (Actual KG + Rejection KG) × 100. The
        // denominator is the TOTAL produced (good + rejected), the SAME
        // formula `rejectionPercent` uses in ./dailyProductionReport.ts and
        // `aggregateProductionTotals` uses for the scrap KPI, so the grid,
        // the printed page, the PDF and Excel can never disagree. Every
        // operand is hard-cast with Number(), so a decimal string from the pg
        // driver can never be mistaken for 0 (that is what made live rows
        // print 0.00% while scrap existed). Zero total produced → 0.00%.
        const actualKg = calcActualKg(uom, toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
        const scrapKg = calcActualKg(uom, scrap, r.item?.weightPerPiece, r.item?.weightPerMeter);
        const producedKg = Number(actualKg || 0) + Number(scrapKg || 0);
        const rejPct = producedKg > 0 ? (Number(scrapKg || 0) / producedKg) * 100 : 0;
        return (
          <div style={{ textAlign: 'right', lineHeight: 1.25, whiteSpace: 'nowrap' }}>
            <span
              style={{
                color: scrap > 0 ? 'var(--theme-danger, #e11d48)' : 'var(--theme-text-muted, #94a3b8)',
                fontWeight: scrap > 0 ? 500 : 400,
              }}
            >
              {formatNumber(scrap, 2)} KG
            </span>
            {/* line 2 — light gray, directly under the KG value (report style) */}
            <div style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
              {`${rejPct.toFixed(2)}%`}
            </div>
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
        // ── HOUR MATRIX — never echo the stored column ─────────────────────
        // Total Available (planned + overtime) minus downtime, the same figure
        // EntryDetail and EntryForm resolve. The persisted column can still
        // hold the legacy 6h written before overtime reached the calculation.
        const runH = displayRunningHours(r);
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
          <FieldTimeOutlined style={{ color: '#8b5cf6' }} />
          <span>OT (h)</span>
        </span>
      ),
      align: 'right',
      width: 85,
      ellipsis: true,
      // PHASE 3 — canonical OT only (persisted overtime_hours → legacy remarks
      // `OT: X h` → 0). Deliberately NOT `runningHours - 8`: the shifts master
      // holds 8h AND 12h planned shifts, so a hardcoded 8 invents overtime that
      // the KPI (SUM of overtime_hours) never sees. See ./overtimeHours.ts.
      sorter: (a, b) => entryOvertimeHours(a) - entryOvertimeHours(b),
      render: (_t, r) => {
        const ot = entryOvertimeHours(r);
        return (
          <span
            style={{
              whiteSpace: 'nowrap',
              fontVariantNumeric: 'tabular-nums',
              fontWeight: ot > 0 ? 600 : 400,
              color: ot > 0 ? '#8b5cf6' : 'var(--theme-text-muted, #94a3b8)',
            }}
          >
            {ot > 0 ? `${formatNumber(ot, 1)}h` : '—'}
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
      // The operational breakdown needs the room the bare badge never did.
      width: 175,
      render: (_t, r) => {
        const status = getEntryStatus(r);
        // ── The status CODE is retained untouched: the chevron ribbon counts,
        // the status filter and every export still call getEntryStatus. Only
        // the VISIBLE text of this one column changes, so a generic teal
        // COMPLETED can no longer hide how the machine actually ran.
        if (status !== 'COMPLETED') return <StatusBadge status={status} />;
        const runH = displayRunningHours(r);
        const downH = toNum(r.downtimeHours);
        const reason = (r.downtimeReasonText ?? '').trim();
        // Nothing recorded to report → the badge still says more than 0 hrs.
        if (runH <= 0 && downH <= 0) return <StatusBadge status={status} />;
        return (
          <div
            data-testid="machine-remarks"
            style={{ fontSize: 11.5, lineHeight: 1.3, whiteSpace: 'normal', wordBreak: 'break-word' }}
          >
            <span style={{ fontWeight: 700, color: 'var(--theme-success, #16a34a)' }}>
              {formatNumber(runH, 2)} hrs Running
            </span>
            {downH > 0 && (
              <span style={{ fontWeight: 700, color: 'var(--theme-warning, #d97706)' }}>
                {' / '}{formatNumber(downH, 2)} hrs{reason ? ` ${reason}` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <UserOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Created By</span>
        </span>
      ),
      key: 'createdByNameDate',
      width: 155,
      render: (_t, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' }}>
            {r.createdByName || (r.createdBy ? 'Admin' : '-')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
            {r.createdAt ? dayjs(r.createdAt).format('DD-MMM-YYYY HH:mm') : '-'}
          </span>
        </div>
      ),
    },
    {
      title: (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <UserOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
          <span>Updated By</span>
        </span>
      ),
      key: 'updatedByNameDate',
      width: 155,
      render: (_t, r) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap' }}>
            {r.updatedByName || (r.updatedBy ? 'Admin' : '-')}
          </span>
          <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', whiteSpace: 'nowrap' }}>
            {r.updatedAt ? dayjs(r.updatedAt).format('DD-MMM-YYYY HH:mm') : '-'}
          </span>
        </div>
      ),
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
          disableConfirm={true}
          onDelete={() => {
            setDeleteTarget(r);
            setDeleteModalOpen(true);
          }}
        />
      ),
    },
  ];

  /** Grid headings zip with `columns` by index — see GRID_COLUMN_LABELS. */
  const columnLabel = (i: number) => GRID_COLUMN_LABELS[i] ?? `Column ${i + 1}`;

  /** Columns the user has NOT unchecked in the Manage Columns popover. */
  const visibleColumns = columns.filter((_, i) => !hiddenColumnIdx.has(i));
  const visibleColumnWidth = visibleColumns.reduce((sum, c) => sum + (Number(c.width) || 0), 0);
  // Ceiling = today's 1990px canvas, floor = a readable minimum: hiding
  // columns lets the remaining ones widen rather than leaving a dead gap.
  const tableScrollX = Math.min(1990, Math.max(visibleColumnWidth, 1100));

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

  const headerExtra = useMemo(() => (
    <Space wrap size={8}>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        onClick={() => {
          navigate('/production/entries/select');
        }}
        style={{ fontWeight: 600 }}
      >
        Add Entry
      </Button>

      <Button
        icon={<InboxOutlined />}
        onClick={() => {
          navigate('/production/packing');
        }}
        style={{
          fontWeight: 600,
          borderColor: 'var(--theme-success, #10b981)',
          color: 'var(--theme-success, #10b981)',
        }}
      >
        Hand Packing
      </Button>

      <Button
        icon={<ReloadOutlined spin={loading} />}
        onClick={handleRefresh}
        loading={loading}
        title="Refresh entries data from database"
      >
        Refresh
      </Button>

      {/* ── Export Dropdown: Excel, PDF, and Print grouped together ───── */}
      <Dropdown
        menu={{
          items: [
            {
              key: 'excel',
              icon: <FileExcelOutlined style={{ color: 'var(--theme-success, #10b981)' }} />,
              label: 'Export to Excel (CSV)',
              onClick: exportToCsv,
              disabled: displayedRows.length === 0,
            },
            {
              key: 'pdf',
              icon: <FilePdfOutlined style={{ color: 'var(--theme-danger, #ef4444)' }} />,
              label: 'Export to PDF',
              onClick: exportPdf,
              disabled: displayedRows.length === 0 || pdfLoading,
            },
            {
              type: 'divider',
            },
            {
              key: 'print',
              icon: <PrinterOutlined style={{ color: 'var(--theme-primary, #1890ff)' }} />,
              label: 'Print Report View',
              onClick: handlePrint,
              disabled: displayedRows.length === 0,
            },
          ],
        }}
        trigger={['click']}
      >
        <Button
          icon={<DownloadOutlined />}
          loading={pdfLoading}
          disabled={displayedRows.length === 0}
          title="Export options: Excel, PDF, Print"
          style={{ fontWeight: 600 }}
        >
          Export <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
        </Button>
      </Dropdown>

      {/* ── Manage Columns: instantly show/hide any grid column ───────── */}
      <Popover
        trigger="click"
        placement="bottomRight"
        content={
          <div
            data-testid="column-visibility-popover"
            style={{ width: 220, maxHeight: 380, overflowY: 'auto' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 6,
                borderBottom: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 12.5, color: 'var(--theme-text, #1e293b)' }}>
                Manage Columns
              </span>
              <Button type="link" size="small" style={{ padding: 0, fontSize: 11.5 }} onClick={showAllColumns}>
                Show all
              </Button>
            </div>
            {GRID_COLUMN_LABELS.map((_label, i) => (
              <div
                key={`${i}-${columnLabel(i)}`}
                style={{ padding: '2px 0', fontSize: 12.5, color: 'var(--theme-text, #1e293b)' }}
              >
                <Checkbox checked={!hiddenColumnIdx.has(i)} onChange={() => toggleColumn(i)}>
                  {columnLabel(i)}
                </Checkbox>
              </div>
            ))}
          </div>
        }
      >
        <Button
          icon={<TableOutlined />}
          data-testid="manage-columns-btn"
          title="Show or hide grid columns"
        >
          Columns
          {hiddenColumnIdx.size > 0 ? ` (${visibleColumns.length}/${GRID_COLUMN_LABELS.length})` : ''}
        </Button>
      </Popover>

      <Button
        icon={<UploadOutlined />}
        onClick={() => setImportModalVisible(true)}
        title="Batch import"
      >
        Import
      </Button>
    </Space>
  ), [navigate, handleRefresh, loading, exportToCsv, displayedRows.length, exportPdf, pdfLoading, handlePrint,
      hiddenColumnIdx, visibleColumns.length, toggleColumn, showAllColumns, columnLabel]);

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Single Main Page Header Meta with Actions (Image 2 style) */}
      <PageHeader
        icon={<CarryOutOutlined />}
        title="Daily Production Entry"
        subtitle="Manage daily shift production records, operational outputs, and metrics."
        extra={headerExtra}
      />

      {/* ── 5 Crystal KPI Metric Cards (Image 2 style) ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: screens.xl ? 'repeat(7, 1fr)' : screens.lg ? 'repeat(4, 1fr)' : screens.sm ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)',
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
          testId="kpi-total-overtime"
          label="OVERTIME (OT)"
          value={`${formatNumber(kpiData.overtime, 1)} h`}
          icon={FieldTimeOutlined}
          tone="#8b5cf6"
          toneSoft="rgba(139, 92, 246, 0.12)"
        />
        <KpiCard
          testId="kpi-total-downtime"
          label="TOTAL DOWNTIME"
          value={`${formatNumber(kpiData.downtime, 1)} h`}
          icon={ClockCircleOutlined}
          tone="#f59e0b"
          toneSoft="rgba(245, 158, 11, 0.12)"
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
          onSelect={(key) => {
            setActiveChevronKey(key);
            setPage(1);
            void fetchRows(1, pageSize, key);
          }}
        />

        {/* Enterprise Unified Filter Toolbar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--theme-border, #f0f0f0)' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              allowClear
              placeholder="Search entries..."
              prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
              value={fSearch}
              onChange={(e) => setFSearch(e.target.value)}
              onPressEnter={handleSearch}
              style={{ flex: '1 1 240px', maxWidth: 360 }}
            />

            {/* Single Unified "Filters" Button */}
            <Button
              icon={<FilterOutlined />}
              onClick={() => setMoreFiltersOpen((prev) => !prev)}
              type={moreFiltersOpen ? 'primary' : 'default'}
              data-testid="toggle-filters-btn"
              style={{ fontWeight: 600 }}
            >
              Filters
              {panelFilterCount > 0 && (
                <Badge
                  count={panelFilterCount}
                  style={{
                    marginLeft: 6,
                    backgroundColor: moreFiltersOpen ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                    color: moreFiltersOpen ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                  }}
                />
              )}
            </Button>

            <div style={{ flex: 1 }} />

            <div className="entry-filter-toolbar__right" style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)' }}>
              <strong style={{ color: 'var(--theme-text, #1e293b)' }}>{displayedRows.length}</strong> entries · Sorted by Date
            </div>
          </div>
        </div>

        {/* Collapsible Panel with ALL Filters */}
        {moreFiltersOpen && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              marginTop: 12,
            }}
          >
            {/* Header: Title + Active Count + Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Production Entries
                </span>
                {panelFilterCount > 0 && (
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {panelFilterCount} Active
                  </Tag>
                )}
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setMoreFiltersOpen(false)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of ALL Filters */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: screens.lg
                  ? 'repeat(4, 1fr)'
                  : screens.md
                  ? 'repeat(2, 1fr)'
                  : '1fr',
                gap: 10,
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Date Range
                </label>
                <RangePicker
                  style={{ width: '100%' }}
                  value={dateRange as never}
                  onChange={(v) => {
                    // `v` is `null` on the clear (x) button — never index it
                    // directly. dateRangeTuple() resets BOTH ends to null.
                    setDateRange(dateRangeTuple(v));
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Division
                </label>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Divisions"
                  style={{ width: '100%' }}
                  value={fDivision}
                  options={lookups.divisions.map((d) => ({ value: d.id, label: d.name }))}
                  onChange={(v) => {
                    setFDivision(v);
                    setFSection(undefined);
                    setFDepartment(undefined);
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Department
                </label>
                <Select
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  placeholder="All Departments"
                  style={{ width: '100%' }}
                  value={fDepartment}
                  options={lookups.departments.map((d: Department) => ({ value: d.id, label: d.name }))}
                  onChange={(v) => setFDepartment(v)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Section
                </label>
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
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Shift
                </label>
                <Select
                  allowClear
                  placeholder="All Shifts"
                  style={{ width: '100%' }}
                  value={fShift}
                  options={(lookups.shifts || []).map((s) => ({ value: s.id, label: s.name }))}
                  onChange={(v) => setFShift(v)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Machine No
                </label>
                <Input
                  allowClear
                  placeholder="e.g. FT-04"
                  value={fMachineNo}
                  onChange={(e) => setFMachineNo(e.target.value)}
                  onPressEnter={handleSearch}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Status
                </label>
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
                onClick={handleReset}
                danger={activeFilterCount > 0}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setMoreFiltersOpen(false)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<SearchOutlined />}
                  onClick={() => {
                    handleSearch();
                    setMoreFiltersOpen(false);
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
      </Card>

      {/* ── Main Production Tabs ─────────────────────────────────────────── */}
      <Tabs
        defaultActiveKey="entries"
        onChange={(k) => setPaneKey(k)}
        items={[
          {
            key: 'entries',
            label: 'Production Records',
            children: (
              <div style={{ position: 'relative', minHeight: 340 }}>
                {loading && displayedRows.length === 0 ? (
                  /* Initial load: compact in-place skeleton (no full-area wash) */
                  <div className="entry-list-loading-block" data-testid="entries-initial-loading">
                    <div className="entry-list-loading-caption">
                      <LoadingOutlined spin />
                      <span>Loading production entries…</span>
                    </div>
                    <Skeleton active title={false} paragraph={{ rows: 6 }} />
                  </div>
                ) : (
                  <>
                    {/* Background refresh: existing rows stay visible & usable;
                        only a small non-blocking badge is shown. */}
                    {loading && (
                      <div
                        className="entry-list-refresh-indicator"
                        role="status"
                        aria-live="polite"
                        data-testid="entries-refresh-indicator"
                      >
                        <LoadingOutlined spin />
                        <span>Refreshing…</span>
                      </div>
                    )}
                    {/* ── Enterprise Production Entry Table ───────────────────── */}
                    <ERPTable<ProductionEntryRow>
                      rowKey="id"
                      columns={visibleColumns}
                      dataSource={displayedRows}
                      loading={false}
                      scroll={{ x: tableScrollX }}
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
              <div className="entry-list-loading-block" data-testid="report-initial-loading">
                <div className="entry-list-loading-caption">
                  <LoadingOutlined spin />
                  <span>Generating department-wise report…</span>
                </div>
                <Skeleton active title={false} paragraph={{ rows: 5 }} />
              </div>
            ) : (
              <>
                {reportLoading && (
                  <div
                    className="entry-list-refresh-indicator"
                    role="status"
                    aria-live="polite"
                    data-testid="report-refresh-indicator"
                  >
                    <LoadingOutlined spin />
                    <span>Updating…</span>
                  </div>
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
      /* ── Analytical sub-views (read-only, own layout panels) ──────────────
         Both sheets mount only when their pane is opened, seed themselves from
         the rows the grid already holds, then widen to the current filter with
         ONE request. They share no state with the log grids above them. */
      {
        key: 'downtime',
        label: (
          <span>
            <ToolOutlined /> Downtime Analytics
          </span>
        ),
        children: (
          <DowntimeAnalytics
            seed={displayedRows}
            buildFilters={buildFilters}
            active={paneKey === 'downtime'}
          />
        ),
      },
      {
        key: 'scrap',
        label: (
          <span>
            <PercentageOutlined /> Rejection &amp; Scrap Details
          </span>
        ),
        children: (
          <RejectionScrapDetails
            seed={displayedRows}
            buildFilters={buildFilters}
            active={paneKey === 'scrap'}
          />
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

      {/* ── Enterprise In-Modal Delete Confirmation & Success Result Dialog ── */}
      <DeleteConfirmModal
        open={deleteModalOpen}
        title="Delete this daily production entry?"
        itemType="Daily Production Entry"
        itemCode={deleteTarget?.item?.itemCode || deleteTarget?.id}
        itemName={deleteTarget?.item?.name || deleteTarget?.item?.shortName || 'Production Item'}
        recordType="ITEM CODE"
        description="Are you sure you want to proceed with this deletion? This action cannot be undone."
        userName={
          (() => {
            if (!deleteTarget) return undefined;
            const emp = lookups.hrEmployees.find(
              (e) => e.id === deleteTarget.operatorName || e.employeeCode === deleteTarget.operatorName,
            );
            return emp ? lookups.employeeFullName(emp) : (deleteTarget.createdByName || deleteTarget.operatorName || 'Operator');
          })()
        }
        tags={[
          deleteTarget?.department?.name || deleteTarget?.departmentId || '',
          deleteTarget?.shift ? `Shift ${deleteTarget.shift}` : '',
          deleteTarget?.entryDate ? dayjs(deleteTarget.entryDate).format('DD MMM YYYY') : '',
          deleteTarget?.actualQuantity ? `${Number(deleteTarget.actualQuantity).toLocaleString()} PCS` : '',
        ].filter(Boolean)}
        successTitle="Successfully Deleted"
        successMessage="Daily Production Entry Deleted Successfully"
        okLabel="OK"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await apiService.delete(`/production/entries/${deleteTarget.id}`);
          // Note: NO message.success top toast, as requested by user.
          // Note: Rows are re-fetched in onSuccessClose when the user clicks 'OK'.
        }}
        onSuccessClose={() => {
          if (deleteTarget) {
            const removedId = deleteTarget.id;
            setRows((prev) => prev.filter((r) => r.id !== removedId));
            setTotal((prev) => Math.max(0, prev - 1));
            const current = tabSessionCache.get<EntryListTabCache>(tabKey);
            if (current) {
              tabSessionCache.set<EntryListTabCache>(tabKey, {
                ...current,
                rows: (current.rows || []).filter((r) => r.id !== removedId),
                total: Math.max(0, (current.total || 1) - 1),
              });
            }
          }
          setDeleteModalOpen(false);
          setDeleteTarget(null);
          void fetchRows();
          void fetchReport();
        }}
        onCancel={() => {
          setDeleteModalOpen(false);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};

export default EntryList;
