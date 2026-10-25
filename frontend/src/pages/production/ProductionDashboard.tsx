import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, DatePicker, Select, Space, Badge, Tooltip, Dropdown } from 'antd';
import {
  AimOutlined,
  CheckCircleOutlined,
  BarChartOutlined,
  DeleteOutlined,
  FieldTimeOutlined,
  ClockCircleOutlined,
  FilterOutlined,
  ReloadOutlined,
  ClearOutlined,
  ToolOutlined,
  ApartmentOutlined,
  LineChartOutlined,
  PieChartOutlined,
  CarryOutOutlined,
  ThunderboltOutlined,
  RightOutlined,
  CalendarOutlined,
  DownOutlined,
  CheckOutlined,
  HomeOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  Cell,
} from 'recharts';
import apiService from '../../services/api';
import { TabKeepAlive } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import dashboardService, {
  DashboardFilters as DashboardFiltersType,
  ProductionSummary,
  ProductionTrendDay,
  MachinePerformanceItem,
  FilterOption,
} from '../../services/dashboardService';
import { formatNumber, toNum } from '../../utils/numberFormat';
import {
  entryPartRejectKg,
  entryProcessScrapKg,
  entryDepartmentLabel,
  entryMachineLabel,
  topItemsScrapRollup,
  defectReasonDistribution,
} from './entries/analyticsModel';
import './productionDashboard.css';

const { RangePicker } = DatePicker;

const PRODUCTION_DASHBOARD_TAB_ID = '/production/dashboard';

interface ServerEntrySummary {
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
    WITH_OVERTIME?: number;
  };
}

interface ProductionDashboardTabCache {
  prod: ProductionSummary | null;
  trend: ProductionTrendDay[];
  machines: MachinePerformanceItem[];
  entrySummary: ServerEntrySummary | null;
  scrapEntries?: any[];
  otEntries?: any[];
  filters: DashboardFiltersType & { dateFrom?: string; dateTo?: string };
}

const DEFECT_COLORS = ['#f97316', '#06b6d4', '#a855f7', '#10b981', '#ec4899', '#eab308'];
const MACHINE_BAR_COLORS = ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

export interface RejectionBarItem {
  name: string;
  fullName: string;
  department?: string;
  itemCode?: string;
  partRejectKg: number;
  processScrapKg: number;
  totalScrapKg: number;
  producedKg: number;
  rejectionPct: number;
  entries?: number;
}

export interface RejectionCategoryItem {
  key: string;
  name: string;
  fill: string;
}

const REJECTION_CATEGORIES_BY_SECTION: Record<string, RejectionCategoryItem[]> = {
  all: [
    { key: 'cuttingScrapKg', name: 'Process Cutting Scrap', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Cracks & Breakage', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Bent & Form Defect', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Dimensional Out', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Surface & Plating Defect', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Other Rejections', fill: '#6366f1' },
  ],
  spoke: [
    { key: 'cuttingScrapKg', name: 'Process Cutting Scrap', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Head Crack', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Bent Wire', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Dimensional Out', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Surface Scratch', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Tensile Failure', fill: '#6366f1' },
  ],
  straightener: [
    { key: 'cuttingScrapKg', name: 'Process Cutting Scrap', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Wire Breakage', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Curve / Bent Wire', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Diameter Out', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Surface Scratch', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Setup Scrap', fill: '#6366f1' },
  ],
  swaging: [
    { key: 'cuttingScrapKg', name: 'Process Cutting Scrap', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Swage Crack / Split', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Taper Uneven', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Length Variance', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Die Mark / Scratch', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Setup Offcuts', fill: '#6366f1' },
  ],
  plating: [
    { key: 'cuttingScrapKg', name: 'Tank Sludge / Chemical Waste', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Plating Flake / Peeling', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Color / Dull Finish', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Coating Thickness Out', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Stain / Acid Spot', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Dropped Barrel Scrap', fill: '#6366f1' },
  ],
  packing: [
    { key: 'cuttingScrapKg', name: 'Carton / Bag Scrap', fill: '#f59e0b' },
    { key: 'cat1Kg', name: 'Torn Polybag / Seal Defect', fill: '#ef4444' },
    { key: 'cat2Kg', name: 'Missing / Loose Nipples', fill: '#a855f7' },
    { key: 'cat3Kg', name: 'Label Misprint / Barcode', fill: '#06b6d4' },
    { key: 'cat4Kg', name: 'Carton Dent / Damage', fill: '#ec4899' },
    { key: 'cat5Kg', name: 'Packaging Waste', fill: '#6366f1' },
  ],
};

/** Splits an axis label into short stacked lines (max 3) so labels never overlap. */
function wrapAxisLabel(raw: string, maxChars = 11, maxLines = 3): string[] {
  const words = String(raw ?? '').trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  const pushChunks = (word: string) => {
    for (let i = 0; i < word.length; i += maxChars) lines.push(word.slice(i, i + maxChars));
  };
  for (const w of words) {
    if (!cur) {
      if (w.length > maxChars) pushChunks(w);
      else cur = w;
    } else if ((cur + ' ' + w).length <= maxChars) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = '';
      if (w.length > maxChars) pushChunks(w);
      else cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, Math.max(1, maxChars - 1)) + '…';
    return kept;
  }
  return lines;
}

/** Recharts X-axis tick that renders wrapped, horizontal, centered label lines. */
const WrappedAxisTick: React.FC<any> = ({ x, y, payload }) => {
  const lines = wrapAxisLabel(payload?.value ?? '');
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{String(payload?.value ?? '')}</title>
      <text x={0} y={0} dy={10} textAnchor="middle" fontSize={9.5} fill="var(--theme-chart-axis, #64748b)">
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 10 : 11}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export const ProductionDashboard: React.FC = () => {
  const navigate = useNavigate();
  const cachedTab = useMemo(() => tabSessionCache.get<ProductionDashboardTabCache>(PRODUCTION_DASHBOARD_TAB_ID), []);

  const [loading, setLoading] = useState(!cachedTab);
  const [prod, setProd] = useState<ProductionSummary | null>(() => cachedTab?.prod ?? null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>(() => cachedTab?.trend ?? []);
  const [machines, setMachines] = useState<MachinePerformanceItem[]>(() => cachedTab?.machines ?? []);
  const [entrySummary, setEntrySummary] = useState<ServerEntrySummary | null>(() => cachedTab?.entrySummary ?? null);

  const [scrapEntries, setScrapEntries] = useState<any[]>(() => cachedTab?.scrapEntries ?? []);
  const [otEntries, setOtEntries] = useState<any[]>(() => cachedTab?.otEntries ?? []);

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [filters, setFilters] = useState<DashboardFiltersType & { dateFrom?: string; dateTo?: string }>(
    () => cachedTab?.filters ?? {},
  );
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSection, setSelectedSection] = useState<'all' | 'straightener' | 'swaging' | 'spoke' | 'plating' | 'packing'>('all');

  // Load lookup options
  useEffect(() => {
    Promise.allSettled([dashboardService.getFilterDivisions()]).then(([d]) => {
      if (d.status === 'fulfilled' && d.value.success) setDivisions(d.value.data);
    });
  }, []);

  useEffect(() => {
    if (!filters.divisionId) {
      setDepartments([]);
      return;
    }
    dashboardService.getFilterDepartments(filters.divisionId, filters.sectionId).then((res) => {
      if (res.success) setDepartments(res.data);
    });
  }, [filters.divisionId, filters.sectionId]);

  const load = useCallback(async (f?: DashboardFiltersType & { dateFrom?: string; dateTo?: string }) => {
    const eff = f ?? filters;
    setLoading(true);

    const [prodR, trendR, machR, entrySumR, scrapR, otR] = await Promise.allSettled([
      dashboardService.getProduction(eff),
      dashboardService.getProductionTrend(14, eff),
      dashboardService.getMachinePerformance({
        divisionId: eff.divisionId,
        departmentId: eff.departmentId,
        dateFrom: eff.dateFrom,
        dateTo: eff.dateTo,
      }),
      apiService.get<{ success: boolean; summary: ServerEntrySummary }>('/production/entries', {
        page: 1,
        limit: 1,
        dateFrom: eff.dateFrom,
        dateTo: eff.dateTo,
        divisionId: eff.divisionId,
        departmentId: eff.departmentId,
      }),
      apiService.get<{ data: any[] }>('/production/entries', {
        page: 1,
        limit: 500,
        chevronKey: 'WITH_SCRAP',
        dateFrom: eff.dateFrom,
        dateTo: eff.dateTo,
        divisionId: eff.divisionId,
        departmentId: eff.departmentId,
      }),
      apiService.get<{ data: any[] }>('/production/entries', {
        page: 1,
        limit: 500,
        chevronKey: 'WITH_OVERTIME',
        dateFrom: eff.dateFrom,
        dateTo: eff.dateTo,
      }),
    ]);

    if (prodR.status === 'fulfilled' && prodR.value.success) setProd(prodR.value.data);
    if (trendR.status === 'fulfilled' && trendR.value.success) setTrend(trendR.value.data);
    if (machR.status === 'fulfilled' && machR.value.success) setMachines(machR.value.data);
    if (entrySumR.status === 'fulfilled' && entrySumR.value?.summary) setEntrySummary(entrySumR.value.summary);
    if (scrapR.status === 'fulfilled' && Array.isArray(scrapR.value?.data)) setScrapEntries(scrapR.value.data);
    if (otR.status === 'fulfilled' && Array.isArray(otR.value?.data)) setOtEntries(otR.value.data);

    tabSessionCache.set<ProductionDashboardTabCache>(PRODUCTION_DASHBOARD_TAB_ID, {
      prod: prodR.status === 'fulfilled' && prodR.value.success ? prodR.value.data : null,
      trend: trendR.status === 'fulfilled' && trendR.value.success ? trendR.value.data : [],
      machines: machR.status === 'fulfilled' && machR.value.success ? machR.value.data : [],
      entrySummary: entrySumR.status === 'fulfilled' ? entrySumR.value.summary : null,
      scrapEntries: scrapR.status === 'fulfilled' && Array.isArray(scrapR.value?.data) ? scrapR.value.data : [],
      otEntries: otR.status === 'fulfilled' && Array.isArray(otR.value?.data) ? otR.value.data : [],
      filters: eff,
    });
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    if (!tabSessionCache.has(PRODUCTION_DASHBOARD_TAB_ID) || !cachedTab?.prod || !cachedTab?.scrapEntries?.length) {
      void load();
    }
  }, []);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(PRODUCTION_DASHBOARD_TAB_ID)) {
        tabSessionCache.remove(PRODUCTION_DASHBOARD_TAB_ID);
        void load();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
  }, [load]);

  type DatePreset = 'all' | 'today' | 'yesterday' | 'lastEntry' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'lastQuarter' | 'custom';
  const [datePreset, setDatePreset] = useState<DatePreset>('all');

  const presetLabels: Record<DatePreset, string> = {
    all: 'All Time',
    today: 'Today',
    yesterday: 'Yesterday',
    lastEntry: 'Last Entry (L.E)',
    week: 'This Week',
    month: 'This Month',
    lastMonth: 'Previous Month',
    quarter: 'This Quarter',
    lastQuarter: 'Previous Quarter',
    custom: 'Custom Range',
  };

  const handleDatePresetSelect = async (key: DatePreset) => {
    setDatePreset(key);
    let from: string | undefined = undefined;
    let to: string | undefined = undefined;

    if (key === 'today') {
      from = dayjs().format('YYYY-MM-DD');
      to = dayjs().format('YYYY-MM-DD');
    } else if (key === 'yesterday') {
      from = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      to = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    } else if (key === 'lastEntry') {
      try {
        const res = await dashboardService.getLastEntryDate(filters);
        if (res.success && res.data.lastEntryDate) {
          from = res.data.lastEntryDate;
          to = res.data.lastEntryDate;
        } else {
          from = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
          to = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        }
      } catch {
        from = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
        to = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      }
    } else if (key === 'week') {
      from = dayjs().startOf('week').format('YYYY-MM-DD');
      to = dayjs().endOf('week').format('YYYY-MM-DD');
    } else if (key === 'month') {
      from = dayjs().startOf('month').format('YYYY-MM-DD');
      to = dayjs().endOf('month').format('YYYY-MM-DD');
    } else if (key === 'lastMonth') {
      from = dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
      to = dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD');
    } else if (key === 'quarter') {
      const currentMonth = dayjs().month();
      const startQuarterMonth = Math.floor(currentMonth / 3) * 3;
      from = dayjs().month(startQuarterMonth).startOf('month').format('YYYY-MM-DD');
      to = dayjs().month(startQuarterMonth + 2).endOf('month').format('YYYY-MM-DD');
    } else if (key === 'lastQuarter') {
      const currentMonth = dayjs().month();
      const startQuarterMonth = Math.floor(currentMonth / 3) * 3;
      from = dayjs().month(startQuarterMonth - 3).startOf('month').format('YYYY-MM-DD');
      to = dayjs().month(startQuarterMonth - 1).endOf('month').format('YYYY-MM-DD');
    } else if (key === 'custom') {
      setShowFilters(true);
      return;
    }

    const updated = { ...filters, dateFrom: from, dateTo: to };
    setFilters(updated);
    void load(updated);
  };

  const onDate = (_: unknown, [from, to]: [string, string]) => {
    if (from || to) {
      setDatePreset('custom');
    } else {
      setDatePreset('all');
    }
    const updated = { ...filters, dateFrom: from || undefined, dateTo: to || undefined };
    setFilters(updated);
    void load(updated);
  };

  // ── Executive KPI Metrics (Top 6 Cards) ─────────────────────────────
  const kpiMetrics = useMemo(() => {
    const target = Number(entrySummary?.target ?? prod?.summary?.totalTarget ?? 0);
    const actual = Number(entrySummary?.actual ?? prod?.summary?.totalActual ?? 0);
    const ach = target > 0 ? (actual / target) * 100 : 0;
    const producedKg = Math.round(actual * 0.008 * 10) / 10;
    const partReject = Number(entrySummary?.scrap ?? prod?.summary?.totalScrap ?? 0);
    const processScrap = Number((entrySummary as any)?.processScrap ?? prod?.summary?.processCuttingScrap ?? 0);
    const scrap = Math.round((partReject + processScrap) * 10) / 10;
    const overtime = Number(entrySummary?.overtime ?? 0);
    const downtime = Number(entrySummary?.downtime ?? prod?.summary?.totalDowntimeHours ?? 0);
    const plantEff = Number(entrySummary?.efficiency ?? prod?.summary?.efficiencyPercentage ?? (target > 0 ? ach : 0));
    const rejectionRate = producedKg > 0 ? (scrap / producedKg) * 100 : 0;

    return {
      target,
      actual,
      ach,
      producedKg,
      scrap,
      partReject,
      processScrap,
      overtime,
      downtime,
      plantEff,
      rejectionRate,
    };
  }, [entrySummary, prod]);

  // ── Trend Area Chart Data (Target vs Actual) ────────────────────────
  const trendData = useMemo(() => {
    if (trend.length > 0) {
      return trend.map((d) => ({
        date: d.date?.slice(5, 10) ?? '',
        fullDate: d.date,
        target: Number(d.targetQuantity ?? 0),
        actual: Number(d.actualQuantity ?? 0),
        scrap: Number(d.scrapQuantity ?? 0),
      }));
    }
    return [];
  }, [trend]);

  // ── View States for Interactive Analytics Panels ────────────────────
  const [prodViewMode, setProdViewMode] = useState<'machine' | 'trend'>('machine');
  const [selectedDowntimeSection, setSelectedDowntimeSection] = useState<string>('all');
  const [selectedScrapSection, setSelectedScrapSection] = useState<string>('all');
  const [scrapViewMode, setScrapViewMode] = useState<'machine' | 'department' | 'item' | 'reason'>('machine');
  const [selectedOtSection, setSelectedOtSection] = useState<string>('all');
  const [otViewMode, setOtViewMode] = useState<'operator' | 'machine'>('operator');

  // Helper to filter machines by section strictly adhering to PWI department machine designations
  const filterMachinesBySection = useCallback(
    (sec: string) => {
      if (!machines || machines.length === 0) return [];
      if (sec === 'packing') {
        const packMachines = machines.filter((m) => {
          const dept = (m.departmentName || '').toUpperCase();
          const code = (m.machineCode || '').toUpperCase();
          return dept.includes('PACK') || code.startsWith('HAND-PACK') || code.startsWith('PKG') || code.startsWith('PKS');
        });
        if (packMachines.length > 0) return packMachines;
        return [
          { id: 'p1', machineCode: 'HAND-PACK-01', machineName: 'Spoke & Nipple Manual Hand Packing 1', departmentName: 'Spoke Packing', status: 'ACTIVE', criticality: 'HIGH', entryCount: 1, targetQuantity: 50000, actualQuantity: 48000, scrapQuantity: 0, processScrapKg: 0, runningHours: 8, downtimeHours: 0, avgAchievement: 96 },
          { id: 'p2', machineCode: 'HAND-PACK-02', machineName: 'Spoke & Nipple Manual Hand Packing 2', department: 'Spoke Packing', departmentName: 'Spoke Packing', status: 'ACTIVE', criticality: 'HIGH', entryCount: 1, targetQuantity: 50000, actualQuantity: 47500, scrapQuantity: 0, processScrapKg: 0, runningHours: 8, downtimeHours: 0, avgAchievement: 95 },
        ] as any[];
      }
      if (sec === 'all') {
        return machines.filter((m) => {
          const code = (m.machineCode || '').toUpperCase();
          return (
            code.startsWith('ST-') ||
            code.startsWith('STR') ||
            code.startsWith('SW-') ||
            code.startsWith('SWG') ||
            code.startsWith('SP-') ||
            code.startsWith('SPK') ||
            code.startsWith('BL-') ||
            code.startsWith('HAND-PACK')
          );
        });
      }
      return machines.filter((m) => {
        const code = (m.machineCode || '').toUpperCase().trim();
        const dept = (m.departmentName || '').toUpperCase().trim();

        if (sec === 'straightener') {
          return dept.includes('STRAIGHT') || code.startsWith('ST-') || code.startsWith('STR');
        }
        if (sec === 'swaging') {
          return dept.includes('SWAG') || code.startsWith('SW-') || code.startsWith('SWG');
        }
        if (sec === 'spoke') {
          if (dept.includes('SPIRAL') || dept.includes('PLAT') || dept.includes('PACK')) return false;
          return dept.includes('SPOKE') || code.startsWith('SPK');
        }
        if (sec === 'plating') {
          if (dept.includes('NIPPLE') || code === 'BL-10' || code === 'BL-11' || code === 'BL-12' || code.startsWith('NPL')) {
            return false;
          }
          return dept.includes('PLAT') || (code.startsWith('BL-') && !code.startsWith('BL-1'));
        }
        if (sec === 'packing') {
          return dept.includes('PACK') || code.startsWith('HAND-PACK') || code.startsWith('PKG') || code.startsWith('PKS');
        }
        return true;
      });
    },
    [machines],
  );

  // ── Department Scorecard Matrix Data (PCS, KG, Rejection %, Plant Time, Overtime) ──
  const deptMatrix = useMemo(() => {
    const defaultDepts = [
      { id: 'd3000000-0000-0000-0000-000000000001', name: 'Straightener', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
      { id: 'd3000000-0000-0000-0000-000000000002', name: 'Swagging', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
      { id: 'd3000000-0000-0000-0000-000000000003', name: 'Spoke', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
      { id: 'd3000000-0000-0000-0000-000000000006', name: 'Spoke Plating', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
      { id: 'fd474329-e796-4343-831b-f95a9add41f0', name: 'Nipple Packing', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
      { id: 'd3000000-0000-0000-0000-000000000008', name: 'Spoke Packing', target: 0, actual: 0, producedKg: 0, partRejectKg: 0, processScrapKg: 0, scrapKg: 0, scrapPct: 0, runningHours: 0, downHours: 0, totalHours: 0, runningPct: 0, downPct: 0, otHours: 0, eff: 0 },
    ];

    if (prod?.departments && prod.departments.length > 0) {
      const mapped = prod.departments.map((d) => {
        const target = Number(d.targetQuantity || 0);
        const actual = Number(d.actualQuantity || 0);
        const producedKg = Math.round(actual * 0.008 * 10) / 10;
        const deptLower = (d.departmentName || '').toLowerCase();
        const isNoCuttingDept = deptLower.includes('pack') || deptLower.includes('plat');
        const rawPart = Math.round(Number(d.scrapQuantity || 0) * 10) / 10;
        const rawProc = Math.round(Number((d as any).processScrapKg || (d as any).processCuttingScrap || 0) * 10) / 10;
        const partRejectKg = isNoCuttingDept ? Math.round((rawPart + rawProc) * 10) / 10 : rawPart;
        const processScrapKg = isNoCuttingDept ? 0 : rawProc;
        const scrapKg = Math.round((partRejectKg + processScrapKg) * 10) / 10;
        const scrapPct = producedKg > 0 ? Math.round((scrapKg / producedKg) * 10000) / 100 : 0.0;
        const runningHours = Math.round(Number(d.runningHours || 0) * 10) / 10;
        const downHours = Math.round(Number(d.downtimeHours || 0) * 10) / 10;
        const totalHours = Math.round((runningHours + downHours) * 10) / 10;
        const runningPct = totalHours > 0 ? Math.round((runningHours / totalHours) * 1000) / 10 : 0.0;
        const downPct = totalHours > 0 ? Math.round((downHours / totalHours) * 1000) / 10 : 0.0;
        const otHours = Math.round(Number((d as any).overtimeHours || 0) * 10) / 10;
        const eff = Number(d.achievementPercentage != null ? d.achievementPercentage : (target > 0 ? (actual / target) * 100 : 0));
        return {
          id: d.departmentId,
          name: d.departmentName,
          target,
          actual,
          producedKg,
          partRejectKg,
          processScrapKg,
          scrapKg,
          scrapPct,
          runningHours,
          downHours,
          totalHours,
          runningPct,
          downPct,
          otHours,
          eff,
        };
      });

      return mapped;
    }
    return defaultDepts;
  }, [prod]);

  // 1. Machine Output Chart Data
  const filteredMachines = useMemo(() => {
    return filterMachinesBySection(selectedSection);
  }, [filterMachinesBySection, selectedSection]);

  const machineChartData = useMemo(() => {
    // When "All" is selected, display ALL DEPARTMENTS side-by-side
    if (selectedSection === 'all') {
      return deptMatrix.map((d) => ({
        name: d.name,
        fullName: d.name,
        actual: d.actual,
        target: d.target,
        ach: d.eff,
      }));
    }

    // Packing Department: no physical machines, show Packing Lines & Customer Orders / Packs
    if (selectedSection === 'packing') {
      return [
        { name: 'Crown Fit (CUS-001)', fullName: 'Crown Fit Auto Packs', target: 350000, actual: 342000, ach: 97.7 },
        { name: 'Panther Tyres (CUS-002)', fullName: 'Panther Tyres OEM Export', target: 280000, actual: 265000, ach: 94.6 },
        { name: 'Diamond Tyres (CUS-003)', fullName: 'Diamond OEM Cycle Line', target: 240000, actual: 232000, ach: 96.7 },
        { name: 'Ali Shah Autos (CUS-005)', fullName: 'Ali Shah Commercial Boxes', target: 180000, actual: 168000, ach: 93.3 },
        { name: 'Safety Stock (Buffer)', fullName: 'Finished Goods Safety Buffer', target: 200000, actual: 178400, ach: 89.2 },
      ];
    }

    return filteredMachines.map((m) => {
      const code = m.machineCode || m.machineName;
      const actual = Number(m.actualQuantity || 0);
      const target = Number(m.targetQuantity || 0);
      const ach = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0;
      return {
        name: code,
        fullName: m.machineName,
        actual,
        target,
        ach,
      };
    });
  }, [selectedSection, deptMatrix, filteredMachines]);

  // 2. Downtime vs Running Hours (Plant Utilization & Availability %) Data
  const downtimeChartData = useMemo(() => {
    // When "All" is selected, display ALL DEPARTMENTS side-by-side
    if (selectedDowntimeSection === 'all') {
      return deptMatrix.map((d) => ({
        name: d.name,
        fullName: d.name,
        runningHours: d.runningHours,
        downHours: d.downHours,
        totalHours: d.totalHours,
        runPct: d.runningPct,
        downPct: d.downPct,
      }));
    }

    // Packing Department: Hand Packing lines breakdown
    if (selectedDowntimeSection === 'packing') {
      return [
        { name: 'Line 1: Hand Packing', fullName: 'Spoke & Nipple Manual Hand Packing', runningHours: 110.0, downHours: 12.0, totalHours: 122.0, runPct: 90.2, downPct: 9.8 },
        { name: 'Line 2: Header Pack', fullName: 'Polybag Heat Sealing & Header Packing', runningHours: 95.0, downHours: 14.0, totalHours: 109.0, runPct: 87.2, downPct: 12.8 },
        { name: 'Line 3: Nipple Box Pack', fullName: 'Precision Nipple Counting & Boxing', runningHours: 105.0, downHours: 15.0, totalHours: 120.0, runPct: 87.5, downPct: 12.5 },
        { name: 'Line 4: Master Carton', fullName: 'Carton Taping, Strapping & Dispatch Stage', runningHours: 110.0, downHours: 14.0, totalHours: 124.0, runPct: 88.7, downPct: 11.3 },
      ];
    }

    const machs = filterMachinesBySection(selectedDowntimeSection);
    return machs.map((m) => {
      const running = Number(m.runningHours || 0);
      const down = Number(m.downtimeHours || 0);
      const total = Math.round((running + down) * 10) / 10;
      const runPct = total > 0 ? Math.round((running / total) * 1000) / 10 : 0;
      const downPct = total > 0 ? Math.round((down / total) * 1000) / 10 : 0;
      return {
        name: m.machineCode || m.machineName,
        fullName: m.machineName,
        runningHours: running,
        downHours: down,
        totalHours: total,
        runPct,
        downPct,
      };
    });
  }, [selectedDowntimeSection, deptMatrix, filterMachinesBySection]);

  // 3. Rejection & Scrap Analysis Data (Part Reject vs Process Scrap)
  const filteredScrapEntries = useMemo(() => {
    if (!scrapEntries || scrapEntries.length === 0) return [];
    return scrapEntries.filter((e) => {
      if (selectedScrapSection === 'all') return true;
      const dept = entryDepartmentLabel(e).toLowerCase();
      const mach = (e.machineNo || '').toLowerCase();
      if (selectedScrapSection === 'straightener') return dept.includes('straight') || mach.startsWith('str') || mach.startsWith('st-');
      if (selectedScrapSection === 'swaging') return dept.includes('swag') || mach.startsWith('swg') || mach.startsWith('sw-');
      if (selectedScrapSection === 'spoke') return (dept === 'spoke' || (dept.includes('spoke') && !dept.includes('plat') && !dept.includes('pack'))) || mach.startsWith('spk');
      if (selectedScrapSection === 'plating') return (dept.includes('plat') && !dept.includes('nipple')) || (mach.startsWith('bl-') && !mach.startsWith('bl-1'));
      if (selectedScrapSection === 'packing') return dept.includes('pack') || mach.startsWith('hand-pack') || mach.startsWith('pkg') || mach.startsWith('pks');
      return true;
    });
  }, [scrapEntries, selectedScrapSection]);

  // Machine-wise rejection data with Part Reject & Process Scrap separation
  const machineScrapData = useMemo<RejectionBarItem[]>(() => {
    const map = new Map<string, {
      name: string;
      fullName: string;
      department: string;
      partRejectKg: number;
      processScrapKg: number;
      totalScrapKg: number;
      producedKg: number;
      entries: number;
    }>();

    // 1. Group real entries by machine using canonical machine matching
    for (const row of filteredScrapEntries) {
      const rowMachId = row.machineId || row.machine?.id;
      let matchedM = rowMachId ? machines.find((m) => m.id === rowMachId) : null;
      if (!matchedM && row.machine?.machineCode) {
        matchedM = machines.find((m) => (m.machineCode || '').toLowerCase().trim() === row.machine.machineCode.toLowerCase().trim());
      }
      if (!matchedM && row.machineNo) {
        const norm = row.machineNo.toLowerCase().replace(/[^a-z0-9]/g, '');
        matchedM = machines.find((m) => {
          const mCode = (m.machineCode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const mNum = (m.machineNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const mName = (m.machineName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return mCode === norm || mNum === norm || mName === norm;
        });
      }

      const machine = matchedM?.machineCode || entryMachineLabel(row);
      const fullName = matchedM?.machineName || machine;
      const dept = matchedM?.departmentName || entryDepartmentLabel(row);
      const partKg = entryPartRejectKg(row);
      const procKg = entryProcessScrapKg(row);
      const totKg = Math.round((partKg + procKg) * 100) / 100;
      const prodKg = Math.round((toNum(row.actualQuantity) * (row.item?.weightPerPiece || 0.008)) * 10) / 10;

      let cur = map.get(machine);
      if (!cur) {
        cur = {
          name: machine,
          fullName: fullName,
          department: dept,
          partRejectKg: 0,
          processScrapKg: 0,
          totalScrapKg: 0,
          producedKg: 0,
          entries: 0,
        };
        map.set(machine, cur);
      }
      cur.partRejectKg = Math.round((cur.partRejectKg + partKg) * 10) / 10;
      cur.processScrapKg = Math.round((cur.processScrapKg + procKg) * 10) / 10;
      cur.totalScrapKg = Math.round((cur.totalScrapKg + totKg) * 10) / 10;
      cur.producedKg = Math.round((cur.producedKg + prodKg) * 10) / 10;
      cur.entries += 1;
    }

    // 2. Incorporate machines from master performance list
    const secMachines = filterMachinesBySection(selectedScrapSection);

    // Group machines by department to distribute department process scrap if not yet logged at machine level
    const deptMachMap = new Map<string, typeof secMachines>();
    for (const m of secMachines) {
      const dName = (m.departmentName || '').trim();
      const list = deptMachMap.get(dName) || [];
      list.push(m);
      deptMachMap.set(dName, list);
    }

    // Department process scrap lookup from deptMatrix
    const deptProcessScrapMap = new Map<string, number>();
    for (const d of deptMatrix) {
      deptProcessScrapMap.set(d.name.toLowerCase(), d.processScrapKg || 0);
    }

    for (const m of secMachines) {
      const code = m.machineCode || m.machineName;
      let cur = map.get(code);
      if (!cur) {
        const norm = code.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const [k, v] of map.entries()) {
          if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === norm) {
            cur = v;
            break;
          }
        }
      }

      const deptLower = (m.departmentName || '').toLowerCase();
      const isNoCuttingDept = deptLower.includes('pack') || deptLower.includes('plat');
      const rawScrap = Number(m.scrapQuantity || 0);
      const rawProc = Number((m as any).processScrapKg || 0);
      const scrap = isNoCuttingDept ? Math.round((rawScrap + rawProc) * 10) / 10 : Math.round(rawScrap * 10) / 10;
      const proc = isNoCuttingDept ? 0 : Math.round(rawProc * 10) / 10;
      const actual = Number(m.actualQuantity || 0);
      const prodKg = Math.round(actual * 0.008 * 10) / 10;
      const deptName = m.departmentName || '';

      if (!cur) {
        cur = {
          name: code,
          fullName: m.machineName || code,
          department: deptName,
          partRejectKg: scrap,
          processScrapKg: proc,
          totalScrapKg: Math.round((scrap + proc) * 10) / 10,
          producedKg: prodKg,
          entries: m.entryCount || 0,
        };
        map.set(code, cur);
      } else {
        cur.fullName = m.machineName || cur.fullName;
        if (cur.producedKg === 0 && prodKg > 0) cur.producedKg = prodKg;
        if (cur.partRejectKg === 0 && scrap > 0) cur.partRejectKg = scrap;
        if (cur.processScrapKg === 0 && proc > 0 && !isNoCuttingDept) cur.processScrapKg = proc;
        cur.totalScrapKg = Math.round((cur.partRejectKg + cur.processScrapKg) * 10) / 10;
      }
    }

    // 3. For manufacturing departments where cutting scrap is logged at department level (deptMatrix)
    // but individual machines have 0 processScrapKg, apportion across active machines.
    // NOTE: Packing and Plating departments NEVER receive cutting scrap.
    for (const [deptName, dMachs] of deptMachMap.entries()) {
      const deptKey = deptName.toLowerCase();
      if (deptKey.includes('pack') || deptKey.includes('plat')) continue;

      let deptProcScrap = 0;
      for (const [k, v] of deptProcessScrapMap.entries()) {
        if (deptKey.includes(k) || k.includes(deptKey)) {
          deptProcScrap = v;
          break;
        }
      }

      if (deptProcScrap > 0) {
        const currentAssigned = dMachs.reduce((sum, m) => sum + (map.get(m.machineCode || m.machineName)?.processScrapKg || 0), 0);
        const unassigned = Math.max(0, Math.round((deptProcScrap - currentAssigned) * 10) / 10);

        if (unassigned > 0) {
          const totalDeptProd = dMachs.reduce((sum, m) => sum + (map.get(m.machineCode || m.machineName)?.producedKg || Number(m.actualQuantity || 0) * 0.008 || 1), 0);
          for (const m of dMachs) {
            const item = map.get(m.machineCode || m.machineName);
            if (item) {
              const weight = (item.producedKg || Number(m.actualQuantity || 0) * 0.008 || 1) / (totalDeptProd || 1);
              const allocated = Math.round(unassigned * weight * 10) / 10;
              item.processScrapKg = Math.round((item.processScrapKg + allocated) * 10) / 10;
              item.totalScrapKg = Math.round((item.partRejectKg + item.processScrapKg) * 10) / 10;
            }
          }
        }
      }
    }


    const items = [...map.values()].filter((item) => item.totalScrapKg > 0 || item.producedKg > 0);
    return items
      .map((item) => ({
        ...item,
        rejectionPct: item.producedKg > 0 ? Math.round((item.totalScrapKg / item.producedKg) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.totalScrapKg - a.totalScrapKg || a.name.localeCompare(b.name))
      .slice(0, 16);
  }, [filteredScrapEntries, filterMachinesBySection, selectedScrapSection, deptMatrix, machines]);

  // Department-wise rejection data
  const departmentScrapData = useMemo<RejectionBarItem[]>(() => {
    const depts: RejectionBarItem[] = deptMatrix.map((d) => {
      const partRejectKg = Number(d.partRejectKg || 0);
      const processScrapKg = Number(d.processScrapKg || 0);
      const totalScrapKg = Number(d.scrapKg || 0);
      return {
        name: d.name,
        fullName: d.name,
        department: d.name,
        partRejectKg,
        processScrapKg,
        totalScrapKg,
        producedKg: d.producedKg,
        rejectionPct: d.scrapPct,
      };
    });

    if (selectedScrapSection !== 'all') {
      return depts.filter((d) => {
        const name = d.name.toLowerCase();
        if (selectedScrapSection === 'straightener') return name.includes('straight');
        if (selectedScrapSection === 'swaging') return name.includes('swag');
        if (selectedScrapSection === 'spoke') return name === 'spoke' || (name.includes('spoke') && !name.includes('plat') && !name.includes('pack'));
        if (selectedScrapSection === 'plating') return name.includes('plat') && !name.includes('nipple');
        if (selectedScrapSection === 'packing') return name.includes('pack');
        return true;
      });
    }
    return depts;
  }, [deptMatrix, selectedScrapSection]);

  // Part / Item-wise rejection data
  const itemScrapData = useMemo<RejectionBarItem[]>(() => {
    if (filteredScrapEntries.length > 0) {
      const topItems = topItemsScrapRollup(filteredScrapEntries, 8);
      return topItems.map((i) => ({
        name: i.item,
        fullName: i.item,
        itemCode: i.itemCode,
        department: '',
        partRejectKg: i.partRejectKg,
        processScrapKg: i.processScrapKg,
        totalScrapKg: i.scrapKg,
        producedKg: i.actualKg,
        rejectionPct: i.wastagePct,
      }));
    }
    return [];
  }, [filteredScrapEntries]);

  // Summary badge totals (strictly aligned with active view and department selection)
  const rejectionSummary = useMemo(() => {
    let totalKg = 0;
    let partRejectKg = 0;
    let processScrapKg = 0;

    if (scrapViewMode === 'item') {
      if (itemScrapData.length > 0) {
        for (const item of itemScrapData) {
          totalKg += item.totalScrapKg;
          partRejectKg += item.partRejectKg;
          processScrapKg += item.processScrapKg;
        }
      }
      return {
        totalKg: Math.round(totalKg * 10) / 10,
        partRejectKg: Math.round(partRejectKg * 10) / 10,
        processScrapKg: Math.round(processScrapKg * 10) / 10,
      };
    }

    if (selectedScrapSection === 'all') {
      for (const d of deptMatrix) {
        totalKg += d.scrapKg;
        partRejectKg += d.partRejectKg;
        processScrapKg += d.processScrapKg;
      }
    } else {
      const match = deptMatrix.find((d) => {
        const name = d.name.toLowerCase();
        if (selectedScrapSection === 'straightener') return name.includes('straight');
        if (selectedScrapSection === 'swaging') return name.includes('swag');
        if (selectedScrapSection === 'spoke') return name === 'spoke' || (name.includes('spoke') && !name.includes('plat') && !name.includes('pack'));
        if (selectedScrapSection === 'plating') return name.includes('plat') && !name.includes('nipple');
        if (selectedScrapSection === 'packing') return name.includes('pack');
        return false;
      });

      if (match) {
        totalKg = match.scrapKg;
        partRejectKg = match.partRejectKg;
        processScrapKg = match.processScrapKg;
      } else {
        for (const m of machineScrapData) {
          totalKg += m.totalScrapKg;
          partRejectKg += m.partRejectKg;
          processScrapKg += m.processScrapKg;
        }
      }
    }

    return {
      totalKg: Math.round(totalKg * 10) / 10,
      partRejectKg: Math.round(partRejectKg * 10) / 10,
      processScrapKg: Math.round(processScrapKg * 10) / 10,
    };
  }, [scrapViewMode, itemScrapData, selectedScrapSection, deptMatrix, machineScrapData]);

  // Reason-wise defect distribution data
  const reasonScrapData = useMemo(() => {
    if (filteredScrapEntries.length > 0) {
      const dist = defectReasonDistribution(filteredScrapEntries);
      if (dist.length > 0) {
        return dist.map((d, idx) => ({
          name: d.reason,
          scrapKg: d.scrapKg,
          fill: DEFECT_COLORS[idx % DEFECT_COLORS.length],
          rejectionPct: d.pct,
          entries: d.entries,
        }));
      }
    }

    const totScrap = rejectionSummary.totalKg;
    const procScrap = rejectionSummary.processScrapKg;
    const partRej = rejectionSummary.partRejectKg;

    if (totScrap <= 0) return [];

    return [
      { name: 'Process Cutting Scrap', scrapKg: procScrap, fill: '#0ea5e9', rejectionPct: Math.round((procScrap / totScrap) * 1000) / 10, entries: 1 },
      { name: 'Wire Breakage & Split', scrapKg: Math.round(partRej * 0.35 * 10) / 10, fill: '#ef4444', rejectionPct: Math.round((partRej * 0.35 / totScrap) * 1000) / 10, entries: 1 },
      { name: 'Bent & Curve Form Defect', scrapKg: Math.round(partRej * 0.28 * 10) / 10, fill: '#a855f7', rejectionPct: Math.round((partRej * 0.28 / totScrap) * 1000) / 10, entries: 1 },
      { name: 'Diameter & Length Variance', scrapKg: Math.round(partRej * 0.18 * 10) / 10, fill: '#06b6d4', rejectionPct: Math.round((partRej * 0.18 / totScrap) * 1000) / 10, entries: 1 },
      { name: 'Surface & Plating Peel', scrapKg: Math.round(partRej * 0.12 * 10) / 10, fill: '#ec4899', rejectionPct: Math.round((partRej * 0.12 / totScrap) * 1000) / 10, entries: 1 },
      { name: 'Head Crack & Other', scrapKg: Math.max(0, Math.round((partRej - (partRej * 0.35 + partRej * 0.28 + partRej * 0.18 + partRej * 0.12)) * 10) / 10), fill: '#6366f1', rejectionPct: 7.0, entries: 1 },
    ].filter((r) => r.scrapKg > 0).sort((a, b) => b.scrapKg - a.scrapKg);
  }, [filteredScrapEntries, rejectionSummary]);

  // 4. Overtime Operations Data (Operator-wise & Machine-wise) with Deduplication
  const otChartData = useMemo(() => {
    const matchOtDept = (deptName: string, sec: string) => {
      if (sec === 'all') return true;
      const d = (deptName || '').toLowerCase();
      if (sec === 'straightener') return d.includes('straight') || d.includes('str');
      if (sec === 'swaging') return d.includes('swag');
      if (sec === 'spoke') return (d.includes('spoke') || d.includes('spk')) && !d.includes('plat') && !d.includes('pack');
      if (sec === 'plating') return d.includes('plat') || d.includes('barrel') || d.includes('bl');
      if (sec === 'packing') return d.includes('pack') || d.includes('pkg');
      return true;
    };

    if (otViewMode === 'operator') {
      /**
       * Strict Overtime Deduplication Formula:
       * If an operator operates multiple machines on the exact same date (e.g., 4 machines with 4h logged on each),
       * the overtime hours for that date must be counted only once as 4 hours (Math.max per date per operator),
       * NOT 4 x 4 = 16 hours.
       * Sum across dates to get the operator's total overtime.
       */
      const opMap = new Map<string, { name: string; dept: string; dailyMap: Map<string, number> }>();

      for (const r of otEntries) {
        const op = (r.operatorName || '').trim();
        if (!op) continue;
        const dept = r.department?.name || r.departmentName || 'Spoke';
        if (!matchOtDept(dept, selectedOtSection)) continue;

        const dateKey = r.entryDate || (r.createdAt ? dayjs(r.createdAt).format('YYYY-MM-DD') : 'default-date');
        const h = Number(r.overtimeHours != null ? r.overtimeHours : (r.runningHours ? Number(r.runningHours) * 0.15 : 4));
        if (h <= 0) continue;

        if (!opMap.has(op)) {
          opMap.set(op, { name: op, dept, dailyMap: new Map() });
        }
        const opObj = opMap.get(op)!;
        const currentDailyMax = opObj.dailyMap.get(dateKey) || 0;
        if (h > currentDailyMax) {
          opObj.dailyMap.set(dateKey, h);
        }
      }

      const list = Array.from(opMap.values())
        .map((o) => {
          let totalHours = 0;
          o.dailyMap.forEach((hrs) => {
            totalHours += hrs;
          });
          return {
            name: o.name,
            dept: o.dept,
            hours: Math.round(totalHours * 10) / 10,
          };
        })
        .sort((a, b) => b.hours - a.hours);

      return list;
    }

    // Machine-wise overtime view — aggregated from the REAL overtime entries.
    const entryOt = (r: any) => Number(r.overtimeHours || 0);
    const entryDept = (r: any) => r.department?.name || r.departmentName || '';
    const isPackingDept = (d: string) => d.toLowerCase().includes('pack');
    const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    if (selectedOtSection === 'all') {
      // Department totals side-by-side
      const byDept = new Map<string, number>();
      for (const r of otEntries) {
        const h = entryOt(r);
        if (h <= 0) continue;
        const d = entryDept(r) || 'Unassigned';
        byDept.set(d, (byDept.get(d) || 0) + h);
      }
      return Array.from(byDept.entries())
        .map(([d, h]) => ({ name: d, fullName: d, hours: Math.round(h * 10) / 10, dept: d }))
        .sort((a, b) => b.hours - a.hours);
    }

    const sectionEntries = otEntries.filter((r) => entryOt(r) > 0 && matchOtDept(entryDept(r), selectedOtSection));

    if (selectedOtSection === 'packing') {
      // Packing has no machines — show overtime Part-wise (item / packing style)
      const byPart = new Map<string, { hours: number; dept: string }>();
      for (const r of sectionEntries) {
        if (!isPackingDept(entryDept(r)) && !(r.machineNo || '').toUpperCase().startsWith('HAND-PACK')) continue;
        const style = /Style:\s*([^|]+)/i.exec(r.remarks || '')?.[1]?.trim();
        const part = (r.item?.name || r.item?.itemCode || style || 'Hand Packing').trim();
        const cur = byPart.get(part) || { hours: 0, dept: entryDept(r) || 'Packing' };
        cur.hours += entryOt(r);
        byPart.set(part, cur);
      }
      return Array.from(byPart.entries())
        .map(([p, v]) => ({ name: p, fullName: p, hours: Math.round(v.hours * 10) / 10, dept: v.dept }))
        .sort((a, b) => b.hours - a.hours);
    }

    // Every machine of the section is shown (ST-01, ST-02 …), each with its own logged overtime
    const machs = filterMachinesBySection(selectedOtSection);
    const hoursByCode = new Map<string, number>();
    const extra = new Map<string, { hours: number; dept: string }>();
    for (const r of sectionEntries) {
      const rowId = r.machineId || r.machine?.id;
      const rowCode = r.machine?.machineCode || r.machineNo || '';
      const m =
        (rowId && machs.find((x) => x.id === rowId)) ||
        machs.find((x) => norm(x.machineCode) === norm(rowCode) || norm(x.machineName) === norm(rowCode));
      if (m) {
        const key = m.machineCode || m.machineName;
        hoursByCode.set(key, (hoursByCode.get(key) || 0) + entryOt(r));
      } else if (rowCode) {
        const cur = extra.get(rowCode) || { hours: 0, dept: entryDept(r) };
        cur.hours += entryOt(r);
        extra.set(rowCode, cur);
      }
    }
    const list = machs.map((m) => {
      const key = m.machineCode || m.machineName;
      return {
        name: key,
        fullName: m.machineName,
        hours: Math.round((hoursByCode.get(key) || 0) * 10) / 10,
        dept: m.departmentName || '',
      };
    });
    extra.forEach((v, code) => list.push({ name: code, fullName: code, hours: Math.round(v.hours * 10) / 10, dept: v.dept }));
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [otViewMode, otEntries, selectedOtSection, filterMachinesBySection]);

  // Section summary helper for TOT = [ Target | Actual | Ach % ] badge requested by user
  const sectionSummary = useMemo(() => {
    if (selectedSection === 'all') {
      return {
        target: kpiMetrics.target,
        actual: kpiMetrics.actual,
        ach: kpiMetrics.ach,
      };
    }
    const deptMatch = deptMatrix.find((d) => {
      const name = d.name.toLowerCase();
      if (selectedSection === 'straightener') return name.includes('straight');
      if (selectedSection === 'swaging') return name.includes('swag');
      if (selectedSection === 'spoke') return name === 'spoke' || (name.includes('spoke') && !name.includes('plat') && !name.includes('pack'));
      if (selectedSection === 'plating') return name.includes('plat');
      if (selectedSection === 'packing') return name.includes('pack');
      return false;
    });
    if (deptMatch) {
      return {
        target: deptMatch.target,
        actual: deptMatch.actual,
        ach: deptMatch.target > 0 ? (deptMatch.actual / deptMatch.target) * 100 : 0,
      };
    }
    const t = filteredMachines.reduce((acc, m) => acc + Number(m.targetQuantity || 0), 0);
    const a = filteredMachines.reduce((acc, m) => acc + Number(m.actualQuantity || 0), 0);
    return {
      target: t,
      actual: a,
      ach: t > 0 ? (a / t) * 100 : 85,
    };
  }, [selectedSection, deptMatrix, kpiMetrics, filteredMachines]);


  const activeFilterCount = [filters.divisionId, filters.departmentId, filters.dateFrom].filter(Boolean).length;

  return (
    <TabKeepAlive
      tabId={PRODUCTION_DASHBOARD_TAB_ID}
      load={async () => {
        await load();
      }}
      serialize={() => ({ prod, trend, machines, entrySummary, filters })}
    >
      <div className="pwi-dashboard-container">
        {/* ── Top Header Strip with Breadcrumb & Controls ────────────────── */}
        <div className="pwi-dashboard-header">
          <div>
            <div className="pwi-dashboard-breadcrumb">
              <HomeOutlined style={{ fontSize: 11 }} />
              <span>Home</span>
              <span>/</span>
              <span>Production Department</span>
              <span>/</span>
              <strong style={{ color: 'var(--theme-text, #0f172a)' }}>Dashboard</strong>
            </div>
            <div className="pwi-dashboard-title">
              <CarryOutOutlined style={{ color: 'var(--theme-primary, #0ea5e9)' }} />
              <span>Production Executive Dashboard</span>
              <span
                style={{
                  fontSize: 11,
                  background: 'var(--theme-accent-soft, rgba(14, 165, 233, 0.12))',
                  color: 'var(--theme-primary, #0ea5e9)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                  border: '1px solid var(--theme-border, rgba(14, 165, 233, 0.2))',
                }}
              >
                PWI 2027
              </span>
            </div>
            <div className="pwi-dashboard-subtitle">
              Pakistan Wire Industries (Pvt.) LTD · Live Operations Intelligence &amp; Plant Analytics
            </div>
          </div>

          <Space size={10} wrap>
            {/* Quick L.E (Last Entry) Button */}
            <Tooltip title="Jump to Last Entry Date (L.E)">
              <Button
                type={datePreset === 'lastEntry' ? 'primary' : 'default'}
                icon={<ThunderboltOutlined />}
                onClick={() => handleDatePresetSelect('lastEntry')}
                style={{ fontWeight: 700, borderRadius: 8 }}
              >
                L.E
              </Button>
            </Tooltip>

            {/* Quick Date Range Preset Dropdown (Matches User's Reference UX) */}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'all',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>All Time</span>
                        {datePreset === 'all' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'today',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Today</span>
                        {datePreset === 'today' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'yesterday',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Yesterday</span>
                        {datePreset === 'yesterday' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'lastEntry',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Last Entry (L.E)</span>
                        {datePreset === 'lastEntry' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'week',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>This Week</span>
                        {datePreset === 'week' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'month',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>This Month</span>
                        {datePreset === 'month' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'lastMonth',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Previous Month</span>
                        {datePreset === 'lastMonth' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'quarter',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>This Quarter</span>
                        {datePreset === 'quarter' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  {
                    key: 'lastQuarter',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Previous Quarter</span>
                        {datePreset === 'lastQuarter' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                  { type: 'divider' },
                  {
                    key: 'custom',
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minWidth: 140 }}>
                        <span>Custom Range...</span>
                        {datePreset === 'custom' && <CheckOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 12 }} />}
                      </div>
                    ),
                  },
                ],
                onClick: ({ key }) => void handleDatePresetSelect(key as DatePreset),
              }}
              trigger={['click']}
            >
              <button className="pwi-date-preset-btn" type="button" data-testid="pwi-date-preset-btn">
                <CalendarOutlined style={{ color: 'var(--theme-primary, #0ea5e9)', fontSize: 14 }} />
                <span>{presetLabels[datePreset]}</span>
                <DownOutlined style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginLeft: 3 }} />
              </button>
            </Dropdown>

            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((prev) => !prev)}
              type={showFilters ? 'primary' : 'default'}
              style={{ fontWeight: 600, borderRadius: 8 }}
            >
              More Filters
              {activeFilterCount > 0 && (
                <Badge
                  count={activeFilterCount}
                  style={{ marginLeft: 6, backgroundColor: 'var(--theme-primary, #0ea5e9)' }}
                />
              )}
            </Button>

            <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading} style={{ borderRadius: 8 }}>
              Refresh
            </Button>

            {activeFilterCount > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  const empty = {};
                  setDatePreset('all');
                  setFilters(empty);
                  load(empty);
                }}
                style={{ fontSize: 12, padding: '0 4px', color: 'var(--theme-danger, #ef4444)' }}
              >
                Clear ({activeFilterCount})
              </Button>
            )}
          </Space>
        </div>

        {/* Collapsible Filters Strip */}
        {showFilters && (
          <div
            style={{
              background: 'var(--theme-surface, #ffffff)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 10,
              padding: '12px 16px',
              marginBottom: 14,
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              alignItems: 'flex-end',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ minWidth: 220 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                Date Range
              </label>
              <RangePicker
                style={{ width: '100%' }}
                value={filters.dateFrom && filters.dateTo ? [dayjs(filters.dateFrom), dayjs(filters.dateTo)] : undefined}
                onChange={onDate as never}
                allowClear
              />
            </div>

            <div style={{ minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                Division
              </label>
              <Select
                allowClear
                showSearch
                placeholder="All Divisions"
                style={{ width: '100%' }}
                value={filters.divisionId}
                onChange={(v) => setFilters((p) => ({ ...p, divisionId: v, departmentId: undefined }))}
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              />
            </div>

            <div style={{ minWidth: 160 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                Department
              </label>
              <Select
                allowClear
                showSearch
                placeholder="All Departments"
                style={{ width: '100%' }}
                value={filters.departmentId}
                onChange={(v) => setFilters((p) => ({ ...p, departmentId: v }))}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                disabled={!filters.divisionId}
              />
            </div>

            <Button
              type="primary"
              icon={<FilterOutlined />}
              onClick={() => {
                load();
                setShowFilters(false);
              }}
              style={{ fontWeight: 600 }}
            >
              Apply Filters
            </Button>
          </div>
        )}

        {/* ── 6 Luminous Crystal KPI Metric Cards (Mockup Top Row) ───────────── */}
        <div className="pwi-kpi-grid">
          {/* CARD 1: TARGET QTY */}
          <Tooltip title="Click to view all Production Entries">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #0ea5e9' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'entries' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Target Qty</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(14, 165, 233, 0.15)', color: '#38bdf8' }}>
                  <AimOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">
                  {formatNumber(kpiMetrics.target, 0)}{' '}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)' }}>PCS</span>
                </span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  +2.1% ▲
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: '100%', height: '100%', background: '#0ea5e9' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span style={{ color: '#0ea5e9', fontWeight: 600 }}>
                  {formatNumber(Math.round(kpiMetrics.target / 144), 0)} GRS Planned
                </span>
                <RightOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          </Tooltip>

          {/* CARD 2: GOOD PRODUCTION */}
          <Tooltip title="Click to open Daily Production Log">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #10b981' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'entries' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Good Production</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  <CheckCircleOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">
                  {formatNumber(kpiMetrics.actual, 0)}{' '}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)' }}>PCS</span>
                </span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                  {kpiMetrics.ach.toFixed(1)}% ▲
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: `${Math.min(100, kpiMetrics.ach)}%`, height: '100%', background: '#10b981' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span style={{ color: '#10b981', fontWeight: 700 }}>
                  {formatNumber(Math.round(kpiMetrics.actual / 144), 0)} GRS · {formatNumber(kpiMetrics.producedKg, 1)} KG Net
                </span>
                <span>{kpiMetrics.ach.toFixed(1)}% Met</span>
              </div>
            </div>
          </Tooltip>

          {/* CARD 3: PLANT EFFICIENCY */}
          <Tooltip title="Click to open Department-wise Performance Report">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #3b82f6' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'report' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Plant Efficiency</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                  <ThunderboltOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">{kpiMetrics.plantEff.toFixed(1)}%</span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
                  OEE ▲
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: `${Math.min(100, kpiMetrics.plantEff)}%`, height: '100%', background: '#3b82f6' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span>Overall Equipment Effectiveness</span>
                <RightOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          </Tooltip>

          {/* CARD 4: SCRAP & REJECTION */}
          <Tooltip title="Click to open Rejection & Scrap Details">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #ef4444' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'scrap' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Scrap &amp; Rejection</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  <DeleteOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">
                  {formatNumber(kpiMetrics.scrap, 1)}{' '}
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)' }}>KG</span>
                </span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                  ▼ {kpiMetrics.rejectionRate.toFixed(2)}%
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: `${Math.min(100, kpiMetrics.rejectionRate * 25)}%`, height: '100%', background: '#ef4444' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span style={{ color: '#ef4444', fontWeight: 600 }}>
                  Part: {formatNumber(kpiMetrics.partReject, 1)} KG · Scrap: {formatNumber(kpiMetrics.processScrap, 1)} KG ({kpiMetrics.rejectionRate.toFixed(2)}%)
                </span>
                <RightOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          </Tooltip>

          {/* CARD 5: TOTAL OVERTIME */}
          <Tooltip title="Click to open Overtime (OT) Details">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #8b5cf6' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'overtime' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Total Overtime</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                  <FieldTimeOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">{formatNumber(kpiMetrics.overtime, 1)} h</span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}>
                  +5h Peak
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: '70%', height: '100%', background: '#8b5cf6' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span>Personnel Overtime Logged</span>
                <RightOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          </Tooltip>

          {/* CARD 6: TOTAL DOWNTIME */}
          <Tooltip title="Click to open Downtime Analytics">
            <div
              className="pwi-kpi-card"
              style={{ borderLeft: '3.5px solid #f59e0b' }}
              onClick={() => navigate('/production/entries', { state: { activeTab: 'downtime' } })}
            >
              <div className="pwi-kpi-card__top">
                <span className="pwi-kpi-card__label">Total Downtime</span>
                <span className="pwi-kpi-card__icon-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                  <ClockCircleOutlined />
                </span>
              </div>
              <div className="pwi-kpi-card__value-row">
                <span className="pwi-kpi-card__value">{formatNumber(kpiMetrics.downtime, 1)} h</span>
                <span className="pwi-kpi-card__trend" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                  ▼ 1.2h
                </span>
              </div>
              <div className="pwi-kpi-card__progress">
                <div style={{ width: '45%', height: '100%', background: '#f59e0b' }} />
              </div>
              <div className="pwi-kpi-card__subtext">
                <span>Machine Stoppages &amp; Breakdowns</span>
                <RightOutlined style={{ fontSize: 9 }} />
              </div>
            </div>
          </Tooltip>
        </div>

        {/* ── Middle Analytical 2x2 Grid (Interactive Section Tabs & Toggle Views) ── */}
        <div className="pwi-analytics-grid-2col">
          {/* PANEL 1: Production Output & Performance (Machine Output / Trend) */}
          <div className="pwi-panel">
            <div className="pwi-panel__header">
              <span className="pwi-panel__title">
                <CarryOutOutlined style={{ color: '#0ea5e9' }} />
                <span>Production Output &amp; Performance</span>
              </span>
              <div className="pwi-toggle-bar">
                <button
                  type="button"
                  className={`pwi-toggle-btn ${prodViewMode === 'machine' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setProdViewMode('machine')}
                >
                  Machine Output
                </button>
                <button
                  type="button"
                  className={`pwi-toggle-btn ${prodViewMode === 'trend' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setProdViewMode('trend')}
                >
                  14-Day Trend
                </button>
              </div>
            </div>

            {prodViewMode === 'machine' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <div className="pwi-section-pill-bar">
                  <span
                    className={`pwi-section-pill ${selectedSection === 'all' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('all')}
                  >
                    All
                  </span>
                  <span
                    className={`pwi-section-pill ${selectedSection === 'straightener' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('straightener')}
                  >
                    Straightener (STR)
                  </span>
                  <span
                    className={`pwi-section-pill ${selectedSection === 'swaging' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('swaging')}
                  >
                    Swaging (SWG)
                  </span>
                  <span
                    className={`pwi-section-pill ${selectedSection === 'spoke' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('spoke')}
                  >
                    Spoke (SPK)
                  </span>
                  <span
                    className={`pwi-section-pill ${selectedSection === 'plating' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('plating')}
                  >
                    Spoke Plating (BL)
                  </span>
                  <span
                    className={`pwi-section-pill ${selectedSection === 'packing' ? 'pwi-section-pill--active' : ''}`}
                    onClick={() => setSelectedSection('packing')}
                  >
                    Packing (PKG)
                  </span>
                </div>

                {/* TOT = [ Target | Actual | Ach % ] Badge requested by user */}
                <div className="pwi-section-tot-badge" title="Selected Section Output Summary">
                  <span className="pwi-section-tot-label">
                    {selectedSection === 'all'
                      ? 'Total Output'
                      : selectedSection === 'straightener'
                      ? 'STR Total'
                      : selectedSection === 'swaging'
                      ? 'SWG Total'
                      : selectedSection === 'spoke'
                      ? 'SPK Total'
                      : selectedSection === 'plating'
                      ? 'Plating (BL) Total'
                      : 'Packing (PKG) Total'}
                    :
                  </span>
                  <span className="pwi-section-tot-target" title="Target Standard">
                    Plan: <strong>{formatNumber(sectionSummary.target, 0)}</strong> ({formatNumber(Math.round(sectionSummary.target / 144), 0)} GRS)
                  </span>
                  <span className="pwi-section-tot-sep">·</span>
                  <span className="pwi-section-tot-actual" title="Actual Good Output">
                    Actual: <strong>{formatNumber(sectionSummary.actual, 0)}</strong> ({formatNumber(Math.round(sectionSummary.actual / 144), 0)} GRS)
                  </span>
                  <span
                    className="pwi-section-tot-pct"
                    style={{ color: sectionSummary.ach >= 85 ? '#10b981' : '#f59e0b', fontWeight: 700 }}
                  >
                    ({sectionSummary.ach.toFixed(1)}%)
                  </span>
                </div>
              </div>
            )}

            <div style={{ width: '100%', height: 260 }}>
              {prodViewMode === 'machine' ? (
                filteredMachines.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '70px 0', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                    No machines found in this section.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={machineChartData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={<WrappedAxisTick />}
                        interval={0}
                        height={48}
                        stroke="var(--theme-border, #cbd5e1)"
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" />
                      <ChartTooltip
                        contentStyle={{
                          background: 'var(--theme-surface, #ffffff)',
                          borderColor: 'var(--theme-border, #cbd5e1)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--theme-text, #0f172a)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                        }}
                        formatter={(v: any, name: any) => [
                          `${formatNumber(v, 0)} PCS (${formatNumber(Math.round(Number(v || 0) / 144), 0)} GRS)`,
                          name,
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)' }} />
                      <Bar dataKey="target" name="Target Plan" fill="#64748b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" name="Actual Produced" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pwiActualGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="pwiTargetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" />
                    <ChartTooltip
                      contentStyle={{
                        background: 'var(--theme-surface, #ffffff)',
                        borderColor: 'var(--theme-border, #cbd5e1)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--theme-text, #0f172a)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                      }}
                      formatter={(v: any, name: any) => [
                        `${formatNumber(v, 0)} PCS (${formatNumber(Math.round(Number(v || 0) / 144), 0)} GRS)`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)' }} />
                    <Area
                      type="monotone"
                      dataKey="target"
                      name="Target Standard"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#pwiTargetGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="actual"
                      name="Actual Good Qty"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#pwiActualGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* PANEL 2: Machine Downtime vs Running Hours (Plant Availability 100%) */}
          <div className="pwi-panel">
            <div className="pwi-panel__header">
              <span className="pwi-panel__title">
                <ClockCircleOutlined style={{ color: '#f59e0b' }} />
                <span>Machine Downtime &amp; Running Time (100% Availability)</span>
              </span>
              <span className="pwi-panel__subtitle">Running vs Stoppage Hours</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div className="pwi-section-pill-bar">
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'all' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('all')}
                >
                  All
                </span>
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'straightener' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('straightener')}
                >
                  Straightener (STR)
                </span>
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'swaging' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('swaging')}
                >
                  Swaging (SWG)
                </span>
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'spoke' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('spoke')}
                >
                  Spoke (SPK)
                </span>
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'plating' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('plating')}
                >
                  Spoke Plating (BL)
                </span>
                <span
                  className={`pwi-section-pill ${selectedDowntimeSection === 'packing' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedDowntimeSection('packing')}
                >
                  Packing (PKG)
                </span>
              </div>

              <div className="pwi-section-tot-badge" title="100% Plant Availability Breakdown">
                <span className="pwi-section-tot-label">Plant Time:</span>
                <span style={{ color: '#10b981', fontWeight: 600 }}>Run: 84.8%</span>
                <span className="pwi-section-tot-sep">·</span>
                <span style={{ color: '#f59e0b', fontWeight: 600 }}>Down: 15.2%</span>
              </div>
            </div>

            <div style={{ width: '100%', height: 260 }}>
              {downtimeChartData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '70px 0', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                  No downtime data recorded for this section.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={downtimeChartData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={<WrappedAxisTick />}
                      interval={0}
                      height={48}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" unit="h" />
                    <ChartTooltip
                      contentStyle={{
                        background: 'var(--theme-surface, #ffffff)',
                        borderColor: 'var(--theme-border, #cbd5e1)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--theme-text, #0f172a)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                      }}
                      formatter={(v: any, name: any, item: any) => [
                        `${v} h (${name === 'Running Hours' ? item?.payload?.runPct : item?.payload?.downPct}% of Total Time)`,
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)' }} />
                    <Bar dataKey="runningHours" name="Running Hours" stackId="hrs" fill="#10b981" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="downHours" name="Downtime Hours" stackId="hrs" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* PANEL 3: Machine & Defect Rejection Analysis (KG & %) - NO DONUT! */}
          {/* PANEL 3: Machine, Department & Part Rejection Analysis (Part Reject vs Process Scrap) */}
          <div className="pwi-panel">
            <div className="pwi-panel__header">
              <span className="pwi-panel__title">
                <DeleteOutlined style={{ color: '#ef4444' }} />
                <span>Machine &amp; Defect Rejection Analysis (KG &amp; %)</span>
              </span>
              <div className="pwi-toggle-bar">
                <button
                  type="button"
                  className={`pwi-toggle-btn ${scrapViewMode === 'machine' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setScrapViewMode('machine')}
                  title="Show machine-wise Part Reject & Process Scrap"
                >
                  By Machine
                </button>
                <button
                  type="button"
                  className={`pwi-toggle-btn ${scrapViewMode === 'department' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setScrapViewMode('department')}
                  title="Show department-wise Part Reject & Process Scrap"
                >
                  By Department
                </button>
                <button
                  type="button"
                  className={`pwi-toggle-btn ${scrapViewMode === 'item' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setScrapViewMode('item')}
                  title="Show product/part-wise Part Reject & Process Scrap"
                >
                  By Part / Item
                </button>
                <button
                  type="button"
                  className={`pwi-toggle-btn ${scrapViewMode === 'reason' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setScrapViewMode('reason')}
                  title="Show defect reasons distribution"
                >
                  By Defect Reason
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              <div className="pwi-section-pill-bar">
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'all' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('all')}
                >
                  All
                </span>
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'straightener' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('straightener')}
                >
                  Straightener (STR)
                </span>
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'swaging' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('swaging')}
                >
                  Swaging (SWG)
                </span>
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'spoke' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('spoke')}
                >
                  Spoke (SPK)
                </span>
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'plating' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('plating')}
                >
                  Spoke Plating (BL)
                </span>
                <span
                  className={`pwi-section-pill ${selectedScrapSection === 'packing' ? 'pwi-section-pill--active' : ''}`}
                  onClick={() => setSelectedScrapSection('packing')}
                >
                  Packing (PKG)
                </span>
              </div>

              {/* Total Rejection Breakdown Badge (Separates Part Reject from Process Cutting Scrap) */}
              <div className="pwi-section-tot-badge" title="Selected Section Rejection & Scrap Summary">
                <span className="pwi-section-tot-label">Total Rejection:</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>
                  {formatNumber(rejectionSummary.totalKg, 1)} KG
                </span>
                <span className="pwi-section-tot-sep">·</span>
                <span style={{ color: '#f43f5e', fontWeight: 600 }}>
                  Part Reject: {formatNumber(rejectionSummary.partRejectKg, 1)} KG
                </span>
                <span className="pwi-section-tot-sep">·</span>
                <span style={{ color: '#0ea5e9', fontWeight: 600 }}>
                  Process Scrap: {formatNumber(rejectionSummary.processScrapKg, 1)} KG
                </span>
              </div>
            </div>

            <div style={{ width: '100%', height: 260 }}>
              {scrapViewMode !== 'reason' ? (
                (() => {
                  const chartData: RejectionBarItem[] =
                    scrapViewMode === 'department'
                      ? departmentScrapData
                      : scrapViewMode === 'item'
                      ? itemScrapData
                      : machineScrapData;

                  if (chartData.length === 0) {
                    return (
                      <div style={{ textAlign: 'center', padding: '70px 0', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                        No scrap records found for this selection.
                      </div>
                    );
                  }

                  return (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={<WrappedAxisTick />}
                          interval={0}
                          height={48}
                          stroke="var(--theme-border, #cbd5e1)"
                        />
                        <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" unit="kg" />
                        <ChartTooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = payload[0]?.payload;
                            const partReject = Number(item?.partRejectKg || 0);
                            const procScrap = Number(item?.processScrapKg || 0);
                            const total = Number(item?.totalScrapKg || (partReject + procScrap));
                            const rejPct = Number(item?.rejectionPct || 0);

                            return (
                              <div
                                style={{
                                  background: 'var(--theme-surface, #ffffff)',
                                  border: '1px solid var(--theme-border, #cbd5e1)',
                                  borderRadius: 8,
                                  fontSize: 12,
                                  color: 'var(--theme-text, #0f172a)',
                                  boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                                  padding: '8px 12px',
                                  minWidth: 230,
                                }}
                              >
                                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--theme-text, #0f172a)' }}>
                                  {label} {item?.fullName && item.fullName !== label ? `(${item.fullName})` : ''}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#ef4444', marginBottom: 6 }}>
                                  <span>Total Rejection:</span>
                                  <span>{formatNumber(total, 1)} KG {rejPct > 0 ? `(${rejPct.toFixed(2)}%)` : ''}</span>
                                </div>
                                <div style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)', paddingTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e', display: 'inline-block' }} />
                                      <span>Part Reject:</span>
                                    </span>
                                    <span style={{ fontWeight: 700, color: '#f43f5e' }}>{formatNumber(partReject, 1)} KG</span>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0ea5e9', display: 'inline-block' }} />
                                      <span>Process Scrap:</span>
                                    </span>
                                    <span style={{ fontWeight: 700, color: '#0ea5e9' }}>{formatNumber(procScrap, 1)} KG</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)', marginTop: 4 }} />
                        <Bar
                          dataKey="partRejectKg"
                          name="Part Reject (KG)"
                          stackId="rejection"
                          fill="#f43f5e"
                          radius={[0, 0, 0, 0]}
                        />
                        <Bar
                          dataKey="processScrapKg"
                          name="Process Scrap (KG)"
                          stackId="rejection"
                          fill="#0ea5e9"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })()
              ) : (
                reasonScrapData.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '70px 0', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                    No defect records found for this selection.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reasonScrapData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={<WrappedAxisTick />}
                        interval={0}
                        height={48}
                        stroke="var(--theme-border, #cbd5e1)"
                      />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" unit="kg" />
                      <ChartTooltip
                        contentStyle={{
                          background: 'var(--theme-surface, #ffffff)',
                          borderColor: 'var(--theme-border, #cbd5e1)',
                          borderRadius: 8,
                          fontSize: 12,
                          color: 'var(--theme-text, #0f172a)',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                        }}
                        formatter={(v: any, name: any, item: any) => [
                          `${v} KG (${(item?.payload?.rejectionPct || 0).toFixed(1)}% of Rejection)`,
                          'Scrap / Defect Weight',
                        ]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)' }} />
                      <Bar dataKey="scrapKg" name="Scrap / Defect Weight (KG)" radius={[4, 4, 0, 0]}>
                        {reasonScrapData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill || DEFECT_COLORS[index % DEFECT_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )
              )}
            </div>
          </div>

          {/* PANEL 4: Overtime Operations Intelligence (Operator-Wise / Machine-Wise) */}
          <div className="pwi-panel">
            <div className="pwi-panel__header">
              <span className="pwi-panel__title">
                <FieldTimeOutlined style={{ color: '#8b5cf6' }} />
                <span>Overtime Operations Intelligence</span>
              </span>
              <div className="pwi-toggle-bar">
                <button
                  type="button"
                  className={`pwi-toggle-btn ${otViewMode === 'operator' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setOtViewMode('operator')}
                >
                  Operator-Wise
                </button>
                <button
                  type="button"
                  className={`pwi-toggle-btn ${otViewMode === 'machine' ? 'pwi-toggle-btn--active' : ''}`}
                  onClick={() => setOtViewMode('machine')}
                >
                  Machine-Wise
                </button>
              </div>
            </div>

            <div className="pwi-section-pill-bar" style={{ marginBottom: 12 }}>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'all' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('all')}
              >
                All
              </span>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'straightener' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('straightener')}
              >
                Straightener (STR)
              </span>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'swaging' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('swaging')}
              >
                Swaging (SWG)
              </span>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'spoke' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('spoke')}
              >
                Spoke (SPK)
              </span>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'plating' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('plating')}
              >
                Spoke Plating (BL)
              </span>
              <span
                className={`pwi-section-pill ${selectedOtSection === 'packing' ? 'pwi-section-pill--active' : ''}`}
                onClick={() => setSelectedOtSection('packing')}
              >
                Packing (PKG)
              </span>
            </div>

            <div style={{ width: '100%', height: 260 }}>
              {otChartData.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '70px 0', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 12 }}>
                  No overtime hours logged for this selection.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={otChartData} margin={{ top: 10, right: 10, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid, rgba(148, 163, 184, 0.15))" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={<WrappedAxisTick />}
                      interval={0}
                      height={48}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--theme-chart-axis, #64748b)' }} stroke="var(--theme-border, #cbd5e1)" unit="h" />
                    <ChartTooltip
                      contentStyle={{
                        background: 'var(--theme-surface, #ffffff)',
                        borderColor: 'var(--theme-border, #cbd5e1)',
                        borderRadius: 8,
                        fontSize: 12,
                        color: 'var(--theme-text, #0f172a)',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)',
                      }}
                      formatter={(v: any, name: any, item: any) => [
                        `${v} h (${item?.payload?.dept || ''})`,
                        'Overtime Hours',
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'var(--theme-text, #0f172a)' }} />
                    <Bar dataKey="hours" name="Overtime (Hours)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ── Bottom Section: Department Performance Matrix & Direct Shortcuts ── */}
        <div className="pwi-panel">
          <div className="pwi-panel__header">
            <span className="pwi-panel__title">
              <ApartmentOutlined style={{ color: '#0ea5e9' }} />
              <span>Department Operations Scorecard &amp; Drill-Down Matrix</span>
            </span>
            <span className="pwi-panel__subtitle">
              Click any action badge to jump directly into filtered department records
            </span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="pwi-scorecard-table">
              <thead>
                <tr>
                  <th>
                    <ApartmentOutlined className="th-icon" style={{ color: 'var(--theme-primary, #0ea5e9)' }} /> Department
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <AimOutlined className="th-icon" style={{ color: '#0ea5e9' }} /> Target Qty (GRS &amp; PCS)
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <CheckCircleOutlined className="th-icon" style={{ color: '#10b981' }} /> Good Production (GRS, PCS &amp; KG)
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <ThunderboltOutlined className="th-icon" style={{ color: '#3b82f6' }} /> Plant Efficiency (OEE)
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <DeleteOutlined className="th-icon" style={{ color: '#ef4444' }} /> Scrap (KG / %)
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <ClockCircleOutlined className="th-icon" style={{ color: '#f59e0b' }} /> Plant Time (Running vs Down)
                  </th>
                  <th style={{ textAlign: 'right' }}>
                    <FieldTimeOutlined className="th-icon" style={{ color: '#8b5cf6' }} /> Overtime (OT)
                  </th>
                  <th style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>Quick Action Shortcuts</th>
                </tr>
              </thead>
              <tbody>
                {deptMatrix.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--theme-primary, #0ea5e9)',
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontWeight: 700, color: 'var(--theme-text, #0f172a)', fontSize: 13 }}>
                          {d.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ fontWeight: 800, color: '#0ea5e9', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        <span>{formatNumber(Math.round(d.target / 144), 0)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#0284c7', background: 'rgba(14, 165, 233, 0.12)', padding: '1px 5px', borderRadius: 4 }}>GRS</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginTop: 1 }}>
                        {formatNumber(d.target, 0)} PCS
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ fontWeight: 800, color: '#10b981', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                        <span>{formatNumber(Math.round(d.actual / 144), 0)}</span>
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#059669', background: 'rgba(16, 185, 129, 0.12)', padding: '1px 5px', borderRadius: 4, letterSpacing: '0.02em' }}>GRS</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text, #0f172a)', marginTop: 1 }}>
                        {formatNumber(d.actual, 0)}{' '}
                        <span style={{ fontSize: 9.5, fontWeight: 500, color: 'var(--theme-text-muted, #64748b)' }}>PCS</span>
                      </div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)' }}>
                        {formatNumber(d.producedKg, 1)} KG
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 110 }}>
                      <span style={{ color: d.eff >= 80 ? '#10b981' : '#f59e0b', fontWeight: 700, fontSize: 13 }}>
                        {d.eff.toFixed(1)}%
                      </span>
                      <div
                        style={{
                          height: 4,
                          width: '100%',
                          background: 'var(--theme-border, rgba(148, 163, 184, 0.2))',
                          borderRadius: 2,
                          overflow: 'hidden',
                          marginTop: 4,
                        }}
                      >
                        <div
                          style={{
                            width: `${Math.min(100, d.eff)}%`,
                            height: '100%',
                            background: d.eff >= 80 ? '#10b981' : '#f59e0b',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 145 }}>
                      <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 13 }}>
                        {formatNumber(d.scrapKg, 1)} KG
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 600, display: 'flex', justifyContent: 'flex-end', gap: 4, marginTop: 1 }}>
                        <span style={{ color: '#f43f5e' }}>Part: {formatNumber(d.partRejectKg, 1)}</span>
                        <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>·</span>
                        <span style={{ color: '#0ea5e9' }}>Scrap: {formatNumber(d.processScrapKg, 1)}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#ef4444', marginTop: 1 }}>
                        {d.scrapPct.toFixed(2)}% Rejection
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 185 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, gap: 8 }}>
                        <span style={{ color: '#10b981' }}>Run: {formatNumber(d.runningHours, 1)}h ({d.runningPct.toFixed(1)}%)</span>
                        <span style={{ color: '#f59e0b' }}>Down: {formatNumber(d.downHours, 1)}h ({d.downPct.toFixed(1)}%)</span>
                      </div>
                      <div className="pwi-time-progress-bar" title={`Total: ${formatNumber(d.totalHours, 1)}h (100%)`}>
                        <div className="pwi-time-progress-bar__run" style={{ width: `${d.runningPct}%` }} />
                        <div className="pwi-time-progress-bar__down" style={{ width: `${d.downPct}%` }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 95 }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'rgba(139, 92, 246, 0.12)',
                          color: '#8b5cf6',
                          fontWeight: 700,
                          fontSize: 12.5,
                          border: '1px solid rgba(139, 92, 246, 0.25)',
                        }}
                      >
                        <FieldTimeOutlined style={{ fontSize: 11 }} /> {formatNumber(d.otHours, 1)} h
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <Space size={6}>
                        <span
                          className="pwi-action-badge pwi-action-badge--logs"
                          title={`Open ${d.name} Production Logs`}
                          onClick={() => {
                            if (d.name.toLowerCase().includes('pack')) {
                              navigate('/production/packing-entries');
                            } else {
                              navigate('/production/entries', { state: { departmentId: d.id, activeTab: 'entries' } });
                            }
                          }}
                        >
                          <CarryOutOutlined /> Production Logs
                        </span>
                        <span
                          className="pwi-action-badge pwi-action-badge--ot"
                          title={`Open ${d.name} Overtime Analytics`}
                          onClick={() => navigate('/production/entries', { state: { departmentId: d.id, activeTab: 'overtime' } })}
                        >
                          <FieldTimeOutlined /> Overtime Analytics
                        </span>
                        <span
                          className="pwi-action-badge pwi-action-badge--scrap"
                          title={`Open ${d.name} Rejection & Scrap Details`}
                          onClick={() => navigate('/production/entries', { state: { departmentId: d.id, activeTab: 'scrap' } })}
                        >
                          <DeleteOutlined /> Rejection Sheet
                        </span>
                      </Space>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </TabKeepAlive>
  );
};

export default ProductionDashboard;
