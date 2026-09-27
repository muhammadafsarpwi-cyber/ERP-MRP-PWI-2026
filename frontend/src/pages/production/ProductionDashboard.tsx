import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Select, Space, Badge, Tag, Grid } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, FileDoneOutlined, AimOutlined, BarChartOutlined, NumberOutlined, FilterOutlined, CloseOutlined, ClearOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import apiService from '../../services/api';
import { GlobalLoading, TabKeepAlive } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import dashboardService, {
  DashboardFilters as DashboardFiltersType, ProductionSummary, ProductionTrendDay, MachinePerformanceItem, FilterOption,
} from '../../services/dashboardService';
import './productionDashboard.css';

const { RangePicker } = DatePicker;
const { useBreakpoint } = Grid;

const PRODUCTION_DASHBOARD_TAB_ID = '/production/dashboard';

interface ProductionDashboardTabCache {
  orderSummary: OrderSummary | null;
  prod: ProductionSummary | null;
  trend: ProductionTrendDay[];
  machines: MachinePerformanceItem[];
  filters: DashboardFiltersType & { dateFrom?: string; dateTo?: string };
}

interface OrderSummary {
  total: number;
  open: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  plannedQuantity: number;
  completedQuantity: number;
  scrappedQuantity: number;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#8b5cf6',
  RELEASED: '#38bdf8',
  IN_PROGRESS: '#f59e0b',
  COMPLETED: '#22c55e',
  CANCELLED: '#ef4444',
  OPEN: '#8b5cf6',
  'IN PROGRESS': '#38bdf8',
};

const AXIS_COLOR = 'var(--theme-text-muted)';
const TOOLTIP_STYLE = { background: 'var(--theme-surface-alt)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)', borderRadius: 6, fontSize: 12 };
const CHART_TICK = { fontSize: 11 };

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
const ProductionDashboard: React.FC = () => {
  const cachedTab = useMemo(() => tabSessionCache.get<ProductionDashboardTabCache>(PRODUCTION_DASHBOARD_TAB_ID), []);

  const [loading, setLoading] = useState(!cachedTab);
  const [error, setError] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(() => cachedTab?.orderSummary ?? null);
  const [prod, setProd] = useState<ProductionSummary | null>(() => cachedTab?.prod ?? null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>(() => cachedTab?.trend ?? []);
  const [machines, setMachines] = useState<MachinePerformanceItem[]>(() => cachedTab?.machines ?? []);

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [filters, setFilters] = useState<DashboardFiltersType & { dateFrom?: string; dateTo?: string }>(() => cachedTab?.filters ?? {});

  // Load filter options
  useEffect(() => {
    Promise.allSettled([dashboardService.getFilterDivisions()]).then(([d]) => {
      if (d.status === 'fulfilled' && d.value.success) setDivisions(d.value.data);
    });
  }, []);

  useEffect(() => {
    if (!filters.divisionId) { setDepartments([]); return; }
    dashboardService.getFilterDepartments(filters.divisionId, filters.sectionId).then((res) => {
      if (res.success) setDepartments(res.data);
    });
  }, [filters.divisionId, filters.sectionId]);

  const load = useCallback(async (f?: DashboardFiltersType & { dateFrom?: string; dateTo?: string }) => {
    const eff = f ?? filters;
    setLoading(true);
    setError(null);
    const orderParams: Record<string, string> = {};
    if (eff.dateFrom) orderParams.dateFrom = eff.dateFrom;
    if (eff.dateTo) orderParams.dateTo = eff.dateTo;
    if (eff.divisionId) orderParams.divisionId = eff.divisionId;

    const [order, prodR, trendR, machR] = await Promise.allSettled([
      apiService.get<{ success: boolean; data: OrderSummary }>('/production/orders/dashboard/summary', orderParams),
      dashboardService.getProduction(eff),
      dashboardService.getProductionTrend(14, eff),
      dashboardService.getMachinePerformance({ divisionId: eff.divisionId, departmentId: eff.departmentId, dateFrom: eff.dateFrom, dateTo: eff.dateTo }),
    ]);

    if (order.status === 'fulfilled') setOrderSummary(order.value.data);
    if (prodR.status === 'fulfilled' && prodR.value.success) setProd(prodR.value.data);
    if (trendR.status === 'fulfilled' && trendR.value.success) setTrend(trendR.value.data);
    if (machR.status === 'fulfilled' && machR.value.success) setMachines(machR.value.data);

    const failedCount = [order, prodR, trendR, machR].filter(r => r.status === 'rejected').length;
    setError(failedCount > 0 ? 'Some production dashboard sections failed to load. Showing partial results.' : null);

    // Persist to session cache so switching back restores metrics + charts instantly
    tabSessionCache.set<ProductionDashboardTabCache>(PRODUCTION_DASHBOARD_TAB_ID, {
      orderSummary: order.status === 'fulfilled' ? order.value.data : orderSummary,
      prod: prodR.status === 'fulfilled' && prodR.value.success ? prodR.value.data : prod,
      trend: trendR.status === 'fulfilled' && trendR.value.success ? trendR.value.data : trend,
      machines: machR.status === 'fulfilled' && machR.value.success ? machR.value.data : machines,
      filters: eff,
    });
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    // If the tab was already loaded in this session, DO NOT re-fetch when
    // returning to it — the cached metrics/charts are already seeded into state.
    if (!tabSessionCache.has(PRODUCTION_DASHBOARD_TAB_ID)) {
      void load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global header/tab refresh event listener
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const onDate = (_: unknown, [from, to]: [string, string]) => {
    setFilters((p) => ({ ...p, dateFrom: from || undefined, dateTo: to || undefined }));
  };

  const kpis = useMemo(() => {
    const s = orderSummary;
    const achievement = s && s.plannedQuantity > 0 ? (s.completedQuantity / s.plannedQuantity) * 100 : 0;
    const eAch = prod?.summary?.achievementPercentage;
    return [
      { key: 'total', label: 'Total Production Orders', value: s ? fmt(s.total) : '—', icon: <NumberOutlined />, tone: '--theme-info' },
      { key: 'open', label: 'Open (Draft)', value: s ? fmt(s.open) : '—', icon: <PlayCircleOutlined />, tone: '--theme-info' },
      { key: 'inProgress', label: 'In Progress', value: s ? fmt(s.inProgress) : '—', icon: <ClockCircleOutlined />, tone: '--theme-warning' },
      { key: 'completed', label: 'Completed', value: s ? fmt(s.completed) : '—', icon: <CheckCircleOutlined />, tone: '--theme-success' },
      { key: 'cancelled', label: 'Cancelled', value: s ? fmt(s.cancelled) : '—', icon: <CloseCircleOutlined />, tone: '--theme-danger' },
      { key: 'planned', label: 'Planned Qty', value: s ? fmt(s.plannedQuantity) : '—', icon: <AimOutlined />, tone: '--theme-info' },
      { key: 'produced', label: 'Produced Qty', value: s ? fmt(s.completedQuantity) : '—', icon: <BarChartOutlined />, tone: '--theme-success' },
      { key: 'ach', label: 'Achievement %', value: s ? `${achievement.toFixed(1)}%` : '—', icon: <FileDoneOutlined />, tone: '--theme-warning' },
      { key: 'entries', label: 'Production Entries', value: prod ? fmt(prod.totalEntries) : '—', icon: <FileDoneOutlined />, tone: '--theme-info' },
      { key: 'efficiency', label: 'Efficiency %', value: eAch != null ? `${eAch.toFixed(1)}%` : '—', icon: <BarChartOutlined />, tone: '--theme-success' },
    ];
  }, [orderSummary, prod]);

  const trendData = useMemo(() => trend.map((d) => ({
    date: d.date?.slice(5, 10) ?? '',
    target: Number(d.targetQuantity ?? 0),
    actual: Number(d.actualQuantity ?? 0),
  })), [trend]);

  const statusPie = useMemo(() => {
    const s = orderSummary;
    if (!s) return [];
    const rows = [
      { name: 'Open', value: s.open, color: STATUS_COLORS.DRAFT },
      { name: 'In Progress', value: s.inProgress, color: STATUS_COLORS.IN_PROGRESS },
      { name: 'Completed', value: s.completed, color: STATUS_COLORS.COMPLETED },
      { name: 'Cancelled', value: s.cancelled, color: STATUS_COLORS.CANCELLED },
    ];
    return rows.filter((r) => r.value > 0);
  }, [orderSummary]);

  const machineData = useMemo(() => machines.slice(0, 10).map((m) => ({
    name: m.machineName || m.machineCode,
    actual: Number(m.actualQuantity ?? 0),
    target: Number(m.targetQuantity ?? 0),
  })), [machines]);

  const deptData = useMemo(() => (prod?.departments ?? []).map((d) => ({
    name: d.departmentName,
    target: Number(d.targetQuantity ?? 0),
    actual: Number(d.actualQuantity ?? 0),
  })), [prod]);

  const screens = useBreakpoint();
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = [filters.divisionId, filters.departmentId, filters.dateFrom].filter(Boolean).length;

  return (
    <TabKeepAlive
      tabId={PRODUCTION_DASHBOARD_TAB_ID}
      load={async () => { await load(); }}
      serialize={() => ({ orderSummary, prod, trend, machines, filters })}
    >
      <div className="erp-dashboard erp-pd">
      {/* Unified Filters Toolbar */}
      <div
        style={{
          background: 'var(--theme-surface, #ffffff)',
          border: '1px solid var(--theme-border, #e2e8f0)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((prev) => !prev)}
              type={showFilters ? 'primary' : 'default'}
              style={{ fontWeight: 600, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
            >
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <Badge
                  count={activeFilterCount}
                  style={{
                    marginLeft: 6,
                    backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                    color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                  }}
                />
              )}
            </Button>

            <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
              Refresh
            </Button>

            {activeFilterCount > 0 && (
              <Button
                type="link"
                size="small"
                onClick={() => {
                  const empty = {};
                  setFilters(empty);
                  load(empty);
                }}
                style={{ fontSize: 12, padding: '0 4px', color: 'var(--theme-danger, #ef4444)' }}
              >
                Clear Filters ({activeFilterCount})
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Panel */}
        {showFilters && (
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
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Production Dashboard
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
                onClick={() => setShowFilters(false)}
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
                gridTemplateColumns: screens.md ? 'repeat(3, 1fr)' : '1fr',
                gap: 10,
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Date Range
                </label>
                <RangePicker
                  style={{ width: '100%' }}
                  onChange={onDate as never}
                  allowClear
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
                  value={filters.divisionId}
                  onChange={(v) => setFilters((p) => ({ ...p, divisionId: v, sectionId: undefined, departmentId: undefined }))}
                  options={divisions.map((d) => ({ value: d.id, label: d.name }))}
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
                  value={filters.departmentId}
                  onChange={(v) => setFilters((p) => ({ ...p, departmentId: v }))}
                  options={departments.map((d) => ({ value: d.id, label: d.name }))}
                  disabled={!filters.divisionId}
                />
              </div>
            </div>

            {/* Footer */}
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
                onClick={() => {
                  const empty = {};
                  setFilters(empty);
                  load(empty);
                }}
                disabled={activeFilterCount === 0}
                danger={activeFilterCount > 0}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setShowFilters(false)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    load();
                    setShowFilters(false);
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
      </div>

      {error && <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />}

      {/* KPI Cards */}
      <div className="erp-pd-kpi-grid">
        {kpis.map((k) => (
          <div className="erp-kpi-card" key={k.key}>
            <span className="erp-kpi-card__icon" style={{ color: `var(${k.tone})` }}>{k.icon}</span>
            <div className="erp-kpi-card__body">
              <span className="erp-kpi-card__label">{k.label}</span>
              <span className="erp-kpi-card__value">{k.value}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="erp-pd-chart-row">
        <Card className="erp-section-card" title="Production Trend (Actual vs Target)" size="small">
          <div className="erp-pd-chart">
            {loading && !trend.length ? <GlobalLoading title="Loading Production Trend..." subtitle="Aggregating daily actual vs target production..." badgeText="LIVE DATABASE QUERY" minHeight={260} /> : trendData.length === 0 ? <div className="erp-pd-empty">No production trend data</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="date" stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <YAxis stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Line type="monotone" dataKey="target" name="Target" stroke={STATUS_COLORS.DRAFT} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="actual" name="Actual" stroke={STATUS_COLORS.COMPLETED} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="erp-section-card" title="Production Order Status" size="small">
          <div className="erp-pd-chart">
            {statusPie.length === 0 ? <div className="erp-pd-empty">No production orders</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={45} label>
                    {statusPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="erp-pd-chart-row">
        <Card className="erp-section-card" title="Machine Performance" size="small">
          <div className="erp-pd-chart">
            {machineData.length === 0 ? <div className="erp-pd-empty">No machine performance data</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={machineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="name" stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <YAxis stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill={STATUS_COLORS.DRAFT} />
                  <Bar dataKey="actual" name="Actual" fill={STATUS_COLORS.COMPLETED} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="erp-section-card" title="Production Performance by Department" size="small">
          <div className="erp-pd-chart">
            {deptData.length === 0 ? <div className="erp-pd-empty">No department performance data</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={deptData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="name" stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <YAxis stroke={AXIS_COLOR} tick={CHART_TICK} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend />
                  <Bar dataKey="target" name="Target" fill={STATUS_COLORS.IN_PROGRESS} />
                  <Bar dataKey="actual" name="Actual" fill={STATUS_COLORS.COMPLETED} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>
    </div>
  </TabKeepAlive>
  );
};

export default ProductionDashboard;
