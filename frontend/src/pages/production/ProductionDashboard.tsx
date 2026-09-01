import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, DatePicker, Select, Space, Spin } from 'antd';
import { ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, PlayCircleOutlined, FileDoneOutlined, AimOutlined, BarChartOutlined, NumberOutlined } from '@ant-design/icons';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import apiService from '../../services/api';
import dashboardService, {
  DashboardFilters as DashboardFiltersType, ProductionSummary, ProductionTrendDay, MachinePerformanceItem, FilterOption,
} from '../../services/dashboardService';
import './productionDashboard.css';

const { RangePicker } = DatePicker;

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

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');
const ProductionDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderSummary, setOrderSummary] = useState<OrderSummary | null>(null);
  const [prod, setProd] = useState<ProductionSummary | null>(null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>([]);
  const [machines, setMachines] = useState<MachinePerformanceItem[]>([]);

  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [filters, setFilters] = useState<DashboardFiltersType & { dateFrom?: string; dateTo?: string }>({});

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
    setLoading(false);
  }, [filters]);

  useEffect(() => { void load(); }, [load]);

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

  const axisColor = 'var(--theme-text-muted)';
  const tooltipStyle = { background: 'var(--theme-surface-alt)', border: '1px solid var(--theme-border)', color: 'var(--theme-text)', borderRadius: 6, fontSize: 12 };

  return (
    <div className="erp-dashboard erp-pd">
      {/* Filters */}
      <div className="erp-pd__toolbar">
        <Space wrap size={10}>
          <RangePicker onChange={onDate as never} allowClear />
          <Select
            allowClear placeholder="Division" style={{ minWidth: 160 }}
            value={filters.divisionId}
            onChange={(v) => setFilters((p) => ({ ...p, divisionId: v, sectionId: undefined, departmentId: undefined }))}
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            allowClear placeholder="Department" style={{ minWidth: 160 }}
            value={filters.departmentId}
            onChange={(v) => setFilters((p) => ({ ...p, departmentId: v }))}
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
            disabled={!filters.divisionId}
          />
          <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>Refresh</Button>
        </Space>
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
            {loading && !trend.length ? <Spin /> : trendData.length === 0 ? <div className="erp-pd-empty">No production trend data</div> : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
                  <XAxis dataKey="date" stroke={axisColor} tick={{ fontSize: 11 }} />
                  <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
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
                  <Tooltip contentStyle={tooltipStyle} />
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
                  <XAxis dataKey="name" stroke={axisColor} tick={{ fontSize: 11 }} />
                  <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
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
                  <XAxis dataKey="name" stroke={axisColor} tick={{ fontSize: 11 }} />
                  <YAxis stroke={axisColor} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
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
  );
};

export default ProductionDashboard;
