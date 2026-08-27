import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Typography, Tag, Space, Button, Tooltip, Alert,
  List, Select, Modal, Spin, Badge, Input, Divider, Descriptions,
} from 'antd';
import {
  DashboardOutlined, ToolOutlined, ShopOutlined, ShoppingCartOutlined, DollarOutlined,
  ReloadOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined,
  AlertOutlined, TeamOutlined, BarChartOutlined, RiseOutlined, HomeOutlined,
  SearchOutlined, ApartmentOutlined,
  RightOutlined, InfoCircleOutlined, CloseCircleOutlined, FireOutlined, CalendarOutlined, CloseOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import LoadingState from '../../components/shared/LoadingState';
import './dashboard.css';
import dashboardService, {
  DashboardFilters, DashboardSummary, ProductionSummary, ProductionTrendDay,
  MachinePerformanceItem, InventorySummary, AlertItem, ActivityItem,
  PurchaseOrderSummary, SalesOrderSummary, ItemOverview, ItemRoute,
  FilterOption,
} from '../../services/dashboardService';

const { Text, Title } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Global Filters ──
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [sections, setSections] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);
  const [shifts, setShifts] = useState<FilterOption[]>([]);

  // ── Data ──
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [prodSummary, setProdSummary] = useState<ProductionSummary | null>(null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>([]);
  const [machinePerf, setMachinePerf] = useState<MachinePerformanceItem[]>([]);
  const [itemOverview, setItemOverview] = useState<ItemOverview[]>([]);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [poSummary, setPoSummary] = useState<PurchaseOrderSummary | null>(null);
  const [soSummary, setSoSummary] = useState<SalesOrderSummary | null>(null);

  // ── Item Detail Modal ──
  const [itemDetailVisible, setItemDetailVisible] = useState(false);
  const [itemDetailLoading, setItemDetailLoading] = useState(false);
  const [itemDetail, setItemDetail] = useState<ItemOverview | null>(null);
  const [itemRoute, setItemRoute] = useState<ItemRoute | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  // ── Filter Options Loading ──
  useEffect(() => {
    Promise.allSettled([
      dashboardService.getFilterDivisions(),
      dashboardService.getFilterShifts(),
    ]).then(([divRes, shiftRes]) => {
      if (divRes.status === 'fulfilled' && divRes.value.success) setDivisions(divRes.value.data);
      if (shiftRes.status === 'fulfilled' && shiftRes.value.success) setShifts(shiftRes.value.data);
    });
  }, []);

  // ── Cascading filter: Division → Sections → Departments ──
  useEffect(() => {
    setSections([]);
    setDepartments([]);
    setFilters(prev => ({ ...prev, sectionId: undefined, departmentId: undefined }));
    if (filters.divisionId) {
      dashboardService.getFilterSections(filters.divisionId).then(res => {
        if (res.success) setSections(res.data);
      });
    } else {
      dashboardService.getFilterSections().then(res => {
        if (res.success) setSections(res.data);
      });
    }
  }, [filters.divisionId]);

  useEffect(() => {
    setDepartments([]);
    setFilters(prev => ({ ...prev, departmentId: undefined }));
    dashboardService.getFilterDepartments(filters.divisionId, filters.sectionId).then(res => {
      if (res.success) setDepartments(res.data);
    });
  }, [filters.divisionId, filters.sectionId]);

  // ── Data Loading ──
  const loadAll = useCallback(async (f?: DashboardFilters) => {
    setLoading(true);
    setError(null);
    const effectiveFilters = f ?? filters;
    try {
      const [sumRes, prodRes, trendRes, machineRes, invRes, alertRes, actRes, poRes, soRes, itemRes] = await Promise.allSettled([
        dashboardService.getSummary(effectiveFilters),
        dashboardService.getProduction(effectiveFilters),
        dashboardService.getProductionTrend(14, effectiveFilters),
        dashboardService.getMachinePerformance(effectiveFilters),
        dashboardService.getInventory(),
        dashboardService.getAlerts(effectiveFilters),
        dashboardService.getActivity(15),
        dashboardService.getProcurement(),
        dashboardService.getSales(),
        dashboardService.getItemOverview(effectiveFilters),
      ]);
      if (sumRes.status === 'fulfilled' && sumRes.value.success) setSummary(sumRes.value.data);
      if (prodRes.status === 'fulfilled' && prodRes.value.success) setProdSummary(prodRes.value.data);
      if (trendRes.status === 'fulfilled' && trendRes.value.success) setTrend(trendRes.value.data);
      if (machineRes.status === 'fulfilled' && machineRes.value.success) setMachinePerf(machineRes.value.data);
      if (invRes.status === 'fulfilled' && invRes.value.success) setInventory(invRes.value.data);
      if (alertRes.status === 'fulfilled' && alertRes.value.success) setAlerts(alertRes.value.data);
      if (actRes.status === 'fulfilled' && actRes.value.success) setActivity(actRes.value.data);
      if (poRes.status === 'fulfilled' && poRes.value.success) setPoSummary(poRes.value.data);
      if (soRes.status === 'fulfilled' && soRes.value.success) setSoSummary(soRes.value.data);
      if (itemRes.status === 'fulfilled' && itemRes.value.success) setItemOverview(itemRes.value.data);

      const failed = [sumRes, prodRes, trendRes, machineRes, invRes, alertRes, actRes].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        setError('Some dashboard sections failed to load. Showing partial results.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Filter change handler ──
  const handleFilterChange = useCallback((key: string, value: string | undefined) => {
    const newFilters = { ...filters, [key]: value };
    if (key === 'divisionId') {
      newFilters.sectionId = undefined;
      newFilters.departmentId = undefined;
    } else if (key === 'sectionId') {
      newFilters.departmentId = undefined;
    }
    setFilters(newFilters);
  }, [filters]);

  // ── Item Detail ──
  const openItemDetail = async (item: ItemOverview) => {
    setItemDetail(item);
    setItemDetailVisible(true);
    setItemDetailLoading(true);
    setItemRoute(null);
    try {
      const res = await dashboardService.getItemRoute(item.id);
      if (res.success) setItemRoute(res.data);
    } catch {
      setItemRoute(null);
    } finally {
      setItemDetailLoading(false);
    }
  };

  const currentDate = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const currentTime = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const activeFilterChips: Array<{ key: string; label: string; value: string }> = [];
  if (filters.divisionId) {
    const d = divisions.find(x => x.id === filters.divisionId);
    activeFilterChips.push({ key: 'divisionId', label: 'Division', value: d ? `${d.divisionCode || ''} ${d.name}`.trim() : filters.divisionId });
  }
  if (filters.sectionId) {
    const s = sections.find(x => x.id === filters.sectionId);
    activeFilterChips.push({ key: 'sectionId', label: 'Section', value: s?.name ?? filters.sectionId });
  }
  if (filters.departmentId) {
    const dp = departments.find(x => x.id === filters.departmentId);
    activeFilterChips.push({ key: 'departmentId', label: 'Dept', value: dp?.name ?? filters.departmentId });
  }
  if (filters.shiftId) {
    const s = shifts.find(x => x.id === filters.shiftId);
    activeFilterChips.push({ key: 'shiftId', label: 'Shift', value: s?.name ?? filters.shiftId });
  }
  if (filters.machineId) {
    const m = machinePerf.find(x => x.machineCode === filters.machineId);
    activeFilterChips.push({ key: 'machineId', label: 'Machine', value: m ? `${m.machineCode}` : filters.machineId });
  }
  const activeFilterCount = activeFilterChips.length;

  const filteredItems = itemOverview.filter(item =>
    !itemSearch || item.itemCode.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const criticalAlertCount = alerts.filter(a => a.severity === 'error').length;
  const warningAlertCount = alerts.filter(a => a.severity === 'warning').length;

  if (loading) return <LoadingState tip="Loading Command Center..." />;

  return (
    <div className="erp-dashboard">
      {/* ━━━ DASHBOARD HEADER ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-dashboard-header">
        <div className="erp-dashboard-header__left">
          <div className="erp-dashboard-header__icon">
            <DashboardOutlined />
          </div>
          <div className="erp-dashboard-header__text">
            <div className="erp-dashboard-header__title">Command Center</div>
            <div className="erp-dashboard-header__subtitle">Production · Inventory · Procurement · Sales</div>
          </div>
        </div>
        <div className="erp-dashboard-header__right">
          <span className="erp-dashboard-header__time">
            <CalendarOutlined style={{ marginRight: 4 }} />{currentDate} · {currentTime}
          </span>
          <Tooltip title="Refresh All Data">
            <Button className="erp-dashboard-header__refresh" icon={<ReloadOutlined />} loading={loading} onClick={() => loadAll()} />
          </Tooltip>
        </div>
      </div>

      {error && <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" />}

      {/* ━━━ GLOBAL FILTER BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card size="small" className="erp-filter-bar" styles={{ body: { padding: '10px 16px' } }}>
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <SearchOutlined /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <Select
              placeholder="Division"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.divisionId}
              onChange={v => handleFilterChange('divisionId', v)}
              options={divisions.map(d => ({ value: d.id, label: `${d.divisionCode || ''} ${d.name}` }))}
            />
            <Select
              placeholder="Section"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.sectionId}
              onChange={v => handleFilterChange('sectionId', v)}
              options={sections.map(s => ({ value: s.id, label: s.name }))}
            />
            <Select
              placeholder="Department"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.departmentId}
              onChange={v => handleFilterChange('departmentId', v)}
              options={departments.map(d => ({ value: d.id, label: d.name }))}
            />
            <Select
              placeholder="Shift"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.shiftId}
              onChange={v => handleFilterChange('shiftId', v)}
              options={shifts.map(s => ({ value: s.id, label: `${s.name}${s.startTime ? ` (${s.startTime}-${s.endTime})` : ''}` }))}
            />
            <Select
              placeholder="Machine"
              allowClear
              showSearch
              optionFilterProp="label"
              size="small"
              style={{ width: '100%' }}
              value={filters.machineId}
              onChange={v => handleFilterChange('machineId', v)}
              options={machinePerf.map(m => ({ value: m.machineCode, label: `${m.machineCode} — ${m.machineName}` }))}
            />
          </div>
          <div className="erp-filter-bar__actions">
            {activeFilterCount > 0 && (
              <span className="erp-filter-bar__count">{activeFilterCount} active</span>
            )}
            {activeFilterCount > 0 && (
              <Button size="small" className="erp-filter-bar__clear" onClick={() => { setFilters({}); loadAll({}); }}>
                Clear All
              </Button>
            )}
          </div>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="erp-filter-chips">
            {activeFilterChips.map(chip => (
              <span key={chip.key} className="erp-filter-chip">
                <span className="erp-filter-chip__label">{chip.label}:</span>
                <span className="erp-filter-chip__value">{chip.value}</span>
                <span
                  className="erp-filter-chip__remove"
                  onClick={() => handleFilterChange(chip.key, undefined)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleFilterChange(chip.key, undefined); }}
                >
                  <CloseOutlined />
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* ━━━ KPI SUMMARY ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-kpi-grid">
        {[
          {
            label: 'Active Items',
            value: summary?.items.active ?? 0,
            detail: `${summary?.items.total ?? 0} total in system`,
            icon: <DatabaseOutlined />,
            iconVariant: 'primary' as const,
            nav: '/master-data/items',
          },
          {
            label: 'Machines',
            value: summary?.machines.active ?? 0,
            detail: `${summary?.machines.total ?? 0} total registered`,
            icon: <ToolOutlined />,
            iconVariant: 'success' as const,
            nav: '/master-data/machines',
          },
          {
            label: 'Production Entries',
            value: summary?.productionEntries.total ?? 0,
            detail: `${summary?.productionEntries.today ?? 0} today`,
            icon: <ShopOutlined />,
            iconVariant: 'primary' as const,
            nav: '/production',
          },
          {
            label: 'Active Targets',
            value: summary?.machineTargets.active ?? 0,
            detail: `${summary?.machineTargets.total ?? 0} total targets`,
            icon: <RiseOutlined />,
            iconVariant: 'warning' as const,
            nav: '/production/targets',
          },
          {
            label: 'Low Stock',
            value: summary?.inventory.lowStockItems ?? 0,
            detail: summary && summary.inventory.lowStockItems > 0 ? 'Requires attention' : 'All stock levels healthy',
            detailVariant: (summary && summary.inventory.lowStockItems > 0 ? 'danger' : 'success'),
            icon: summary && summary.inventory.lowStockItems > 0 ? <WarningOutlined /> : <CheckCircleOutlined />,
            iconVariant: (summary && summary.inventory.lowStockItems > 0 ? 'danger' : 'success'),
            nav: '/inventory',
          },
          {
            label: 'Active POs',
            value: summary?.purchaseOrders.active ?? 0,
            detail: 'Open purchase orders',
            icon: <ShoppingCartOutlined />,
            iconVariant: 'primary' as const,
            nav: '/procurement/orders',
          },
          {
            label: 'Active SOs',
            value: summary?.salesOrders.active ?? 0,
            detail: 'Open sales orders',
            icon: <DollarOutlined />,
            iconVariant: 'primary' as const,
            nav: '/sales/orders',
          },
        ].map((kpi, idx) => (
          <Card
            key={idx}
            size="small"
            className="erp-kpi-card"
            onClick={() => navigate(kpi.nav)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(kpi.nav); }}
            role="button"
            tabIndex={0}
            aria-label={`${kpi.label}: ${kpi.value}`}
          >
            <div className={`erp-kpi-card__icon erp-kpi-card__icon--${kpi.iconVariant}`}>
              {kpi.icon}
            </div>
            <div className="erp-kpi-card__body">
              <div className="erp-kpi-card__label">{kpi.label}</div>
              <div className={`erp-kpi-card__value${kpi.iconVariant === 'danger' && kpi.value > 0 ? ' erp-kpi-card__value--danger' : ''}`}>
                {kpi.value}
              </div>
              <div className={`erp-kpi-card__detail${kpi.detailVariant ? ` erp-kpi-card__detail--${kpi.detailVariant}` : ''}`}>
                {kpi.detail}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ━━━ PRODUCTION PERFORMANCE + ACHIEVEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <BarChartOutlined className="erp-chart-header__title-icon" />
                Production Performance
                <span className="erp-chart-header__subtitle">Target vs Actual by Department</span>
              </div>
            }
            extra={<Button size="small" type="link" onClick={() => navigate('/production')}>View All <RightOutlined /></Button>}
          >
            {prodSummary && prodSummary.departments.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={prodSummary.departments.map(d => ({
                  name: d.departmentName.length > 14 ? d.departmentName.slice(0, 14) + '…' : d.departmentName,
                  fullName: d.departmentName,
                  Target: Math.round(d.targetQuantity),
                  Actual: Math.round(d.actualQuantity),
                  Scrap: Math.round(d.scrapQuantity),
                  Achievement: d.achievementPercentage,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={55}
                    axisLine={{ stroke: 'var(--theme-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0]?.payload;
                      return (
                        <div className="erp-chart-tooltip">
                          <div className="erp-chart-tooltip__title">{data?.fullName || label}</div>
                          {payload.map((entry: any, idx: number) => (
                            <div key={idx} className="erp-chart-tooltip__row">
                              <span className="erp-chart-tooltip__label">
                                <span className="erp-chart-tooltip__dot" style={{ background: entry.color }} />
                                {entry.name}
                              </span>
                              <span className="erp-chart-tooltip__value">
                                {typeof entry.value === 'number' ? entry.value.toLocaleString() : entry.value}
                              </span>
                            </div>
                          ))}
                          {data?.Achievement !== undefined && (
                            <div className="erp-chart-tooltip__row" style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid var(--theme-border)' }}>
                              <span className="erp-chart-tooltip__label">
                                <span className="erp-chart-tooltip__dot" style={{ background: 'var(--theme-accent)' }} />
                                Achievement
                              </span>
                              <span className={`erp-chart-tooltip__value ${data.Achievement >= 90 ? 'erp-chart-tooltip__value--success' : data.Achievement >= 70 ? 'erp-chart-tooltip__value--warning' : 'erp-chart-tooltip__value--danger'}`}>
                                {data.Achievement.toFixed(1)}%
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="square"
                    iconSize={8}
                  />
                  <Bar dataKey="Target" fill="var(--theme-primary)" radius={[3, 3, 0, 0]} opacity={0.7} />
                  <Bar dataKey="Actual" fill="var(--theme-success)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Scrap" fill="var(--theme-danger)" radius={[3, 3, 0, 0]} opacity={0.8} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><BarChartOutlined /></div>
                <div className="erp-empty-state__title">No production data available</div>
                <div className="erp-empty-state__desc">Data will appear once production entries are recorded</div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <RiseOutlined className="erp-chart-header__title-icon" />
                Achievement Overview
              </div>
            }
          >
            {prodSummary ? (
              <div className="erp-achievement">
                <div className="erp-achievement__donut-wrapper">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Achieved', value: Math.round(prodSummary.summary.achievementPercentage) },
                          { name: 'Remaining', value: Math.max(0, 100 - Math.round(prodSummary.summary.achievementPercentage)) },
                        ]}
                        cx="50%" cy="50%" innerRadius={52} outerRadius={72}
                        startAngle={90} endAngle={-270}
                        stroke="none"
                      >
                        <Cell fill="var(--theme-success)" />
                        <Cell fill="var(--theme-surface-alt)" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="erp-achievement__center">
                    <div
                      className="erp-achievement__percentage"
                      style={{
                        color: prodSummary.summary.achievementPercentage >= 90
                          ? 'var(--theme-success)'
                          : prodSummary.summary.achievementPercentage >= 70
                            ? 'var(--theme-warning)'
                            : 'var(--theme-danger)'
                      }}
                    >
                      {prodSummary.summary.achievementPercentage.toFixed(1)}%
                    </div>
                    <div className="erp-achievement__label">Achievement</div>
                  </div>
                </div>

                <div className="erp-achievement__metrics">
                  <div className="erp-achievement__metric">
                    <div className="erp-achievement__metric-dot" style={{ background: 'var(--theme-primary)' }} />
                    <div className="erp-achievement__metric-content">
                      <div className="erp-achievement__metric-label">Target</div>
                      <div className="erp-achievement__metric-value">{prodSummary.summary.totalTarget.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="erp-achievement__metric">
                    <div className="erp-achievement__metric-dot" style={{ background: 'var(--theme-success)' }} />
                    <div className="erp-achievement__metric-content">
                      <div className="erp-achievement__metric-label">Actual</div>
                      <div className="erp-achievement__metric-value">{prodSummary.summary.totalActual.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="erp-achievement__metric">
                    <div className="erp-achievement__metric-dot" style={{ background: 'var(--theme-danger)' }} />
                    <div className="erp-achievement__metric-content">
                      <div className="erp-achievement__metric-label">Scrap</div>
                      <div className="erp-achievement__metric-value">{prodSummary.summary.totalScrap.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="erp-achievement__metric">
                    <div className="erp-achievement__metric-dot" style={{ background: 'var(--theme-accent)' }} />
                    <div className="erp-achievement__metric-content">
                      <div className="erp-achievement__metric-label">Efficiency</div>
                      <div className="erp-achievement__metric-value">{prodSummary.summary.efficiencyPercentage.toFixed(1)}%</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><RiseOutlined /></div>
                <div className="erp-empty-state__title">No achievement data</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ PRODUCTION TREND ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card size="small"
        className="erp-section-card"
        title={
          <div className="erp-chart-header__title">
            <ClockCircleOutlined className="erp-chart-header__title-icon" />
            Production Trend
            <span className="erp-chart-header__subtitle">Last 14 Days</span>
          </div>
        }
        extra={<Button size="small" type="link" onClick={() => navigate('/production')}>View Entries <RightOutlined /></Button>}
      >
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend.map(t => {
              const d = new Date(t.date);
              const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return {
                date: shortDate,
                fullDate: t.date,
                Target: t.targetQuantity,
                Actual: t.actualQuantity,
                Achievement: t.achievementPercentage,
              };
            })}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                axisLine={{ stroke: 'var(--theme-border)' }}
                tickLine={false}
                interval={Math.max(0, Math.floor(trend.length / 7) - 1)}
              />
              <YAxis
                yAxisId="qty"
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 150]}
                tick={{ fontSize: 10, fill: 'var(--theme-text-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <RTooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0]?.payload;
                  return (
                    <div className="erp-chart-tooltip">
                      <div className="erp-chart-tooltip__title">{data?.fullDate || label}</div>
                      {payload.map((entry: any, idx: number) => {
                        const isPercent = entry.yAxisId === 'pct';
                        return (
                          <div key={idx} className="erp-chart-tooltip__row">
                            <span className="erp-chart-tooltip__label">
                              <span className="erp-chart-tooltip__dot" style={{ background: entry.color }} />
                              {entry.name}
                            </span>
                            <span className="erp-chart-tooltip__value">
                              {typeof entry.value === 'number'
                                ? isPercent ? `${entry.value.toFixed(1)}%` : entry.value.toLocaleString()
                                : entry.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="plainline"
                iconSize={16}
              />
              <Line
                yAxisId="qty"
                type="monotone"
                dataKey="Target"
                stroke="var(--theme-primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                yAxisId="qty"
                type="monotone"
                dataKey="Actual"
                stroke="var(--theme-success)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Achievement"
                stroke="var(--theme-warning)"
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="erp-empty-state">
            <div className="erp-empty-state__icon"><ClockCircleOutlined /></div>
            <div className="erp-empty-state__title">No trend data available</div>
            <div className="erp-empty-state__desc">Trends will appear as daily production is recorded</div>
          </div>
        )}
      </Card>

      {/* ━━━ ALERTS + MACHINE PERFORMANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <AlertOutlined className="erp-chart-header__title-icon" />
                Alerts
                {alerts.length > 0 && <Badge count={alerts.length} size="small" style={{ backgroundColor: criticalAlertCount > 0 ? 'var(--theme-danger)' : 'var(--theme-warning)' }} />}
              </div>
            }
            extra={alerts.length > 0 ? (
              <Space size={4}>
                {criticalAlertCount > 0 && <Tag color="error" style={{ margin: 0, fontSize: 10 }}>{criticalAlertCount} Critical</Tag>}
                {warningAlertCount > 0 && <Tag color="warning" style={{ margin: 0, fontSize: 10 }}>{warningAlertCount} Warning</Tag>}
              </Space>
            ) : (
              <Tag color="success" style={{ margin: 0, fontSize: 10 }}>All Clear</Tag>
            )}
          >
            {alerts.length > 0 ? (
              <div>
                {alerts.slice(0, 10).map((a, idx) => (
                  <div
                    key={idx}
                    className="erp-alert-row"
                    onClick={() => a.link && navigate(a.link)}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && a.link) navigate(a.link); }}
                    role={a.link ? 'button' : undefined}
                    tabIndex={a.link ? 0 : undefined}
                    aria-label={a.title}
                  >
                    <div className={`erp-alert-row__icon erp-alert-row__icon--${a.severity}`}>
                      {a.severity === 'error' ? <CloseCircleOutlined /> :
                       a.severity === 'warning' ? <WarningOutlined /> :
                       <InfoCircleOutlined />}
                    </div>
                    <div className="erp-alert-row__body">
                      <div className="erp-alert-row__title">{a.title}</div>
                      <div className="erp-alert-row__desc">{a.description}</div>
                    </div>
                    <div className="erp-alert-row__meta">
                      {a.count && a.count > 1 && <span className="erp-alert-row__count">{a.count}</span>}
                      {a.link && <RightOutlined className="erp-alert-row__arrow" />}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="erp-alert-empty">
                <div className="erp-alert-empty__icon"><CheckCircleOutlined /></div>
                <div className="erp-alert-empty__title">All Clear</div>
                <div className="erp-alert-empty__desc">No active alerts — all systems nominal</div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <ToolOutlined className="erp-chart-header__title-icon" />
                Machine Performance
                <span className="erp-chart-header__subtitle">Top 8 by Achievement</span>
              </div>
            }
            extra={<Button size="small" type="link" onClick={() => navigate('/master-data/machines')}>View All <RightOutlined /></Button>}
          >
            {machinePerf.length > 0 ? (
              <div>
                {machinePerf.slice(0, 8).map((m, idx) => {
                  const achPct = Math.min(100, Math.max(0, m.avgAchievement));
                  const level = achPct >= 90 ? 'high' : achPct >= 70 ? 'medium' : 'low';
                  return (
                    <div key={idx} className="erp-machine-bar">
                      <div className="erp-machine-bar__name" title={m.machineCode}>
                        {m.machineCode}
                      </div>
                      <div className="erp-machine-bar__track">
                        <div
                          className={`erp-machine-bar__fill erp-machine-bar__fill--${level}`}
                          style={{ width: `${achPct}%` }}
                        />
                      </div>
                      <div
                        className="erp-machine-bar__value"
                        style={{
                          color: level === 'high' ? 'var(--theme-success)'
                            : level === 'medium' ? 'var(--theme-warning)'
                            : 'var(--theme-danger)'
                        }}
                      >
                        {achPct.toFixed(1)}%
                      </div>
                    </div>
                  );
                })}
                <div className="erp-machine-table-sep">
                  <div style={{ overflowX: 'auto' }}>
                    <table className="erp-data-table">
                      <thead>
                        <tr>
                          <th>Machine</th>
                          <th style={{ textAlign: 'right' }}>Target</th>
                          <th style={{ textAlign: 'right' }}>Actual</th>
                          <th style={{ textAlign: 'right' }}>Scrap</th>
                          <th style={{ textAlign: 'right' }}>Ach %</th>
                          <th style={{ textAlign: 'right' }}>Entries</th>
                        </tr>
                      </thead>
                      <tbody>
                        {machinePerf.slice(0, 6).map(m => (
                          <tr key={m.id} style={{ cursor: 'pointer' }}
                            onClick={() => navigate('/production/machines')}>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <Text strong style={{ fontSize: 11 }}>{m.machineCode}</Text>
                                {m.departmentName && (
                                  <Text type="secondary" style={{ fontSize: 10 }}>{m.departmentName}</Text>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.targetQuantity.toFixed(1)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.actualQuantity.toFixed(1)}</td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: m.scrapQuantity > 0 ? 'var(--theme-danger)' : 'var(--theme-text-muted)' }}>
                              {m.scrapQuantity.toFixed(1)}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <Tag
                                color={m.avgAchievement >= 90 ? 'green' : m.avgAchievement >= 70 ? 'orange' : 'red'}
                                style={{ margin: 0, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}
                              >
                                {m.avgAchievement.toFixed(1)}%
                              </Tag>
                            </td>
                            <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.entryCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><ToolOutlined /></div>
                <div className="erp-empty-state__title">No machine performance data</div>
                <div className="erp-empty-state__desc">Performance metrics will appear once entries are recorded</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ ITEM OVERVIEW + INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <ApartmentOutlined className="erp-chart-header__title-icon" />
                Item Overview
                <span className="erp-chart-header__subtitle">{itemOverview.length} items</span>
              </div>
            }
            extra={
              <div className="erp-chart-header__actions">
                <Input
                  placeholder="Search items..."
                  prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                  size="small"
                  allowClear
                  style={{ width: 170, fontSize: 12 }}
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                />
                <Button size="small" type="link" onClick={() => navigate('/master-data/items')}>View All <RightOutlined /></Button>
              </div>
            }
          >
            {filteredItems.length > 0 ? (
              <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto' }}>
                <table className="erp-data-table">
                  <thead>
                      <tr>
                          <th>Code</th>
                          <th>Name</th>
                          <th style={{ textAlign: 'center' }}>Type</th>
                          <th style={{ textAlign: 'right' }}>Stock</th>
                          <th style={{ textAlign: 'right' }}>Reserved</th>
                          <th style={{ textAlign: 'right' }}>Available</th>
                          <th style={{ textAlign: 'right' }}>Prod</th>
                          <th style={{ textAlign: 'center' }}>Route</th>
                        </tr>
                  </thead>
                  <tbody>
                    {filteredItems.slice(0, 20).map(item => (
                      <tr key={item.id} style={{ cursor: 'pointer' }}
                        onClick={() => openItemDetail(item)}>
                        <td><Text strong style={{ fontSize: 11 }}>{item.itemCode}</Text></td>
                        <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{item.name}</td>
                        <td style={{ textAlign: 'center' }}>
                          <Tag
                            color={item.itemType === 'FINISHED_GOOD' ? 'blue' : item.itemType === 'RAW_MATERIAL' ? 'green' : 'orange'}
                            style={{ margin: 0, fontSize: 9 }}
                          >
                            {item.itemType?.replace('_', ' ') || 'N/A'}
                          </Tag>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <Text
                            strong
                            style={{
                              fontSize: 11,
                              color: item.stock.onHand <= (item.minimumStockLevel ?? 0) ? 'var(--theme-danger)' : 'var(--theme-text)'
                            }}
                          >
                            {item.stock.onHand}
                          </Text>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11, color: 'var(--theme-text-muted)' }}>
                          {item.stock.reserved}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>
                          <Text style={{ color: 'var(--theme-success)' }}>{item.stock.available}</Text>
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{item.production.entryCount}</td>
                        <td style={{ textAlign: 'center' }}>
                          {item.isManufacturable
                            ? <Tag color="green" style={{ margin: 0, fontSize: 9 }}>Yes</Tag>
                            : <Tag style={{ margin: 0, fontSize: 9, color: 'var(--theme-text-muted)' }}>No</Tag>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><ApartmentOutlined /></div>
                <div className="erp-empty-state__title">
                  {itemSearch ? 'No matching items' : 'No item data available'}
                </div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <DatabaseOutlined className="erp-chart-header__title-icon" />
                Inventory
                {inventory && <span className="erp-chart-header__subtitle">{inventory.warehouses.length} warehouse{inventory.warehouses.length !== 1 ? 's' : ''}</span>}
              </div>
            }
            extra={<Button size="small" type="link" onClick={() => navigate('/inventory')}>View <RightOutlined /></Button>}
          >
            {inventory ? (
              <div>
                {inventory.warehouses.map(wh => (
                  <div key={wh.warehouseId} className="erp-wh">
                    <div className="erp-wh__header">
                      <div className="erp-wh__name">
                        <HomeOutlined style={{ color: 'var(--theme-text-muted)', fontSize: 12 }} />
                        <span className="erp-wh__code">{wh.warehouseCode}</span>
                        {wh.warehouseName && <span className="erp-wh__label">{wh.warehouseName}</span>}
                      </div>
                      <span className="erp-wh__badge">{wh.totalItems} items</span>
                    </div>
                    <div className="erp-wh__metrics">
                      <div className="erp-wh__metric">
                        <span className="erp-wh__metric-label">On Hand</span>
                        <span className="erp-wh__metric-value">{wh.totalOnHand.toFixed(1)}</span>
                      </div>
                      <div className="erp-wh__metric">
                        <span className="erp-wh__metric-label">Reserved</span>
                        <span className="erp-wh__metric-value">{wh.totalReserved.toFixed(1)}</span>
                      </div>
                      <div className="erp-wh__metric">
                        <span className="erp-wh__metric-label">Available</span>
                        <span className="erp-wh__metric-value" style={{ color: 'var(--theme-success)' }}>{wh.totalAvailable.toFixed(1)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {inventory.lowStockItems.length > 0 && (
                  <div className="erp-low-stock">
                    <WarningOutlined /> {inventory.lowStockItems.length} Low Stock Item{inventory.lowStockItems.length !== 1 ? 's' : ''}
                  </div>
                )}
                {inventory.recentTransactions.length > 0 && (
                  <>
                    <div className="erp-divider" />
                    <Text strong style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recent Transactions</Text>
                    <div style={{ marginTop: 6 }}>
                      {inventory.recentTransactions.slice(0, 5).map(tx => (
                        <div key={tx.id} className="erp-tx-row">
                          <span className={`erp-tx-row__dir erp-tx-row__dir--${tx.direction}`}>{tx.direction}</span>
                          <span className="erp-tx-row__item">{tx.itemCode}</span>
                          <span className="erp-tx-row__qty">×{tx.quantity}</span>
                          <span className="erp-tx-row__date">{new Date(tx.createdAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {inventory.warehouses.length === 0 && (
                  <div className="erp-empty-state">
                    <div className="erp-empty-state__icon"><DatabaseOutlined /></div>
                    <div className="erp-empty-state__title">No warehouse data available</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><DatabaseOutlined /></div>
                <div className="erp-empty-state__title">No inventory data</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ PROCUREMENT + SALES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <ShoppingCartOutlined className="erp-chart-header__title-icon" />
                Purchase Orders
                {poSummary && <span className="erp-chart-header__subtitle">{poSummary.recentOrders.length + poSummary.statusBreakdown.reduce((s, b) => s + b.count, 0)} total</span>}
              </div>
            }
            extra={<Button size="small" type="link" onClick={() => navigate('/procurement/orders')}>View <RightOutlined /></Button>}
          >
            {poSummary ? (
              <div>
                {poSummary.statusBreakdown.length > 0 && (() => {
                  return (
                    <>
                      <div className="erp-status-bar">
                        {poSummary.statusBreakdown.map(s => (
                          <div
                            key={s.status}
                            className={`erp-status-bar__segment erp-status-bar__segment--${s.status}`}
                            style={{ flex: s.count }}
                            title={`${s.status}: ${s.count}`}
                          >
                            {s.count}
                          </div>
                        ))}
                      </div>
                      <div className="erp-status-legend">
                        {poSummary.statusBreakdown.map(s => (
                          <span key={s.status} className="erp-status-legend__item">
                            <span className={`erp-status-legend__dot erp-status-bar__segment--${s.status}`} />
                            {s.status}
                            <span className="erp-status-legend__count">{s.count}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
                {poSummary.recentOrders.length > 0 ? (
                  <div>
                    {poSummary.recentOrders.slice(0, 5).map(po => (
                      <div key={po.id} className="erp-order-row">
                        <span className={`erp-order-row__status erp-order-row__status--${po.status}`}>{po.status}</span>
                        <span className="erp-order-row__code">{po.poCode}</span>
                        <span className="erp-order-row__party">{po.supplierName}</span>
                        {po.totalAmount > 0 && <span className="erp-order-row__amount">{po.currencyCode} {po.totalAmount.toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="erp-empty-state">
                    <div className="erp-empty-state__icon"><ShoppingCartOutlined /></div>
                    <div className="erp-empty-state__title">No purchase orders</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><ShoppingCartOutlined /></div>
                <div className="erp-empty-state__title">No procurement data</div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <DollarOutlined className="erp-chart-header__title-icon" />
                Sales Orders
                {soSummary && <span className="erp-chart-header__subtitle">{soSummary.recentOrders.length + soSummary.statusBreakdown.reduce((s, b) => s + b.count, 0)} total</span>}
              </div>
            }
            extra={<Button size="small" type="link" onClick={() => navigate('/sales/orders')}>View <RightOutlined /></Button>}
          >
            {soSummary ? (
              <div>
                {soSummary.statusBreakdown.length > 0 && (() => {
                  return (
                    <>
                      <div className="erp-status-bar">
                        {soSummary.statusBreakdown.map(s => (
                          <div
                            key={s.status}
                            className={`erp-status-bar__segment erp-status-bar__segment--${s.status}`}
                            style={{ flex: s.count }}
                            title={`${s.status}: ${s.count}`}
                          >
                            {s.count}
                          </div>
                        ))}
                      </div>
                      <div className="erp-status-legend">
                        {soSummary.statusBreakdown.map(s => (
                          <span key={s.status} className="erp-status-legend__item">
                            <span className={`erp-status-legend__dot erp-status-bar__segment--${s.status}`} />
                            {s.status}
                            <span className="erp-status-legend__count">{s.count}</span>
                          </span>
                        ))}
                      </div>
                    </>
                  );
                })()}
                {soSummary.recentOrders.length > 0 ? (
                  <div>
                    {soSummary.recentOrders.slice(0, 5).map(so => (
                      <div key={so.id} className="erp-order-row">
                        <span className={`erp-order-row__status erp-order-row__status--${so.status}`}>{so.status}</span>
                        <span className="erp-order-row__code">{so.orderNumber}</span>
                        <span className="erp-order-row__party">{so.customerName}</span>
                        {so.totalAmount > 0 && <span className="erp-order-row__amount">{so.currency} {so.totalAmount.toLocaleString()}</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="erp-empty-state">
                    <div className="erp-empty-state__icon"><DollarOutlined /></div>
                    <div className="erp-empty-state__title">No sales orders</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="erp-empty-state">
                <div className="erp-empty-state__icon"><DollarOutlined /></div>
                <div className="erp-empty-state__title">No sales data</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ DEPARTMENT PERFORMANCE + ACTIVITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <TeamOutlined className="erp-chart-header__title-icon" />
                Department Performance
                {prodSummary && <span className="erp-chart-header__subtitle">{prodSummary.departments.length} departments</span>}
              </div>
            }
          >
            {prodSummary && prodSummary.departments.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table className="erp-data-table">
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Department</th>
                      <th style={{ textAlign: 'right' }}>Entries</th>
                      <th style={{ textAlign: 'right' }}>Target</th>
                      <th style={{ textAlign: 'right' }}>Actual</th>
                      <th style={{ textAlign: 'right' }}>Scrap</th>
                      <th style={{ textAlign: 'left', minWidth: 110 }}>Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodSummary.departments.map(d => {
                      const achPct = Math.min(100, Math.max(0, d.achievementPercentage));
                      const level = achPct >= 90 ? 'high' : achPct >= 70 ? 'medium' : 'low';
                      return (
                        <tr key={d.departmentId}>
                          <td><Text strong style={{ fontSize: 12 }}>{d.departmentName}</Text></td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.entryCount}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.targetQuantity.toFixed(1)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.actualQuantity.toFixed(1)}</td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: d.scrapQuantity > 0 ? 'var(--theme-danger)' : 'var(--theme-text-muted)' }}>
                            {d.scrapQuantity.toFixed(1)}
                          </td>
                          <td>
                            <div className="erp-dept-ach">
                              <div className="erp-dept-ach__track">
                                <div className={`erp-dept-ach__fill erp-dept-ach__fill--${level}`} style={{ width: `${achPct}%` }} />
                              </div>
                              <span className="erp-dept-ach__value" style={{
                                color: level === 'high' ? 'var(--theme-success)' : level === 'medium' ? 'var(--theme-warning)' : 'var(--theme-danger)'
                              }}>
                                {d.achievementPercentage.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '28px 0' }}>
                <TeamOutlined style={{ fontSize: 24, color: 'var(--theme-text-muted)', marginBottom: 8 }} />
                <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>No department data available</div>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            className="erp-section-card"
            title={
              <div className="erp-chart-header__title">
                <ClockCircleOutlined className="erp-chart-header__title-icon" />
                Recent Activity
              </div>
            }
          >
            {activity.length > 0 ? (
              <div>
                {activity.slice(0, 10).map(a => {
                  const actionLower = (a.action || '').toLowerCase();
                  const iconClass = actionLower.includes('delete') || actionLower.includes('remove')
                    ? 'delete' : actionLower.includes('create') || actionLower.includes('add')
                    ? 'create' : actionLower.includes('update') || actionLower.includes('edit')
                    ? 'update' : 'other';
                  return (
                    <div key={a.id} className="erp-activity-row">
                      <div className={`erp-activity-row__icon erp-activity-row__icon--${iconClass}`}>
                        {iconClass === 'create' ? <CheckCircleOutlined /> :
                         iconClass === 'delete' ? <CloseCircleOutlined /> :
                         iconClass === 'update' ? <RiseOutlined /> :
                         <InfoCircleOutlined />}
                      </div>
                      <div className="erp-activity-row__body">
                        <div className="erp-activity-row__top">
                          <span className={`erp-activity-row__action erp-activity-row__action--${iconClass}`}>{a.action}</span>
                          <span className="erp-activity-row__target">{a.targetType}{a.targetName ? `: ${a.targetName}` : ''}</span>
                        </div>
                        <div className="erp-activity-row__meta">
                          {a.actorEmail} · {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="erp-activity-empty">
                <div className="erp-activity-empty__icon"><ClockCircleOutlined /></div>
                <div className="erp-activity-empty__text">No recent activity</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ QUICK ACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card
        size="small"
        className="erp-section-card"
        title={
          <div className="erp-chart-header__title">
            <FireOutlined className="erp-chart-header__title-icon" />
            Quick Actions
          </div>
        }
      >
        <div className="erp-actions-grid">
          {[
            { icon: <ShopOutlined />, label: 'Production Entries', desc: 'Log production data', nav: '/production' },
            { icon: <ToolOutlined />, label: 'Machine Master', desc: 'Manage machines', nav: '/master-data/machines' },
            { icon: <DatabaseOutlined />, label: 'Inventory', desc: 'Stock & warehouses', nav: '/inventory' },
            { icon: <ShoppingCartOutlined />, label: 'Purchase Orders', desc: 'Procurement', nav: '/procurement/orders' },
            { icon: <DollarOutlined />, label: 'Sales Orders', desc: 'Sales management', nav: '/sales/orders' },
            { icon: <BarChartOutlined />, label: 'Inventory Reports', desc: 'Stock analytics', nav: '/inventory/reports' },
            { icon: <TeamOutlined />, label: 'Item Master', desc: 'Master data items', nav: '/master-data/items' },
          ].map((action, idx) => (
            <div key={idx} className="erp-action-card" onClick={() => navigate(action.nav)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') navigate(action.nav); }} role="button" tabIndex={0} aria-label={action.label}>
              <div className="erp-action-card__icon">{action.icon}</div>
              <div className="erp-action-card__text">
                <div className="erp-action-card__label">{action.label}</div>
                <div className="erp-action-card__desc">{action.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ━━━ ITEM DETAIL MODAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Modal
        title={itemDetail ? `${itemDetail.itemCode} — ${itemDetail.name}` : 'Item Details'}
        open={itemDetailVisible}
        onCancel={() => setItemDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setItemDetailVisible(false)}>Close</Button>,
          <Button key="items" type="primary" onClick={() => { setItemDetailVisible(false); navigate('/master-data/items'); }}>Go to Item Master</Button>,
        ]}
        width={700}
      >
        {itemDetailLoading ? (
          <Spin tip="Loading route..." />
        ) : itemDetail ? (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Item Code">{itemDetail.itemCode}</Descriptions.Item>
              <Descriptions.Item label="Type">
                <Tag color={itemDetail.itemType === 'FINISHED_GOOD' ? 'blue' : itemDetail.itemType === 'RAW_MATERIAL' ? 'green' : 'orange'}>
                  {itemDetail.itemType?.replace('_', ' ')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={itemDetail.status === 'ACTIVE' ? 'green' : 'default'}>{itemDetail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Manufacturable">{itemDetail.isManufacturable ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Stock On Hand">{itemDetail.stock.onHand}</Descriptions.Item>
              <Descriptions.Item label="Reserved">{itemDetail.stock.reserved}</Descriptions.Item>
              <Descriptions.Item label="Available">{itemDetail.stock.available}</Descriptions.Item>
              <Descriptions.Item label="Min Stock">{itemDetail.minimumStockLevel ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Cost Price">{itemDetail.costPrice ? `$${itemDetail.costPrice}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Selling Price">{itemDetail.sellingPrice ? `$${itemDetail.sellingPrice}` : '—'}</Descriptions.Item>
            </Descriptions>

            {itemRoute && (
              <>
                <Divider />
                <Title level={5} style={{ margin: '0 0 8px 0' }}>
                  <ApartmentOutlined /> Production Route: {itemRoute.routing?.name || 'N/A'}
                </Title>
                {itemRoute.operations.length > 0 ? (
                  <List
                    size="small"
                    bordered
                    dataSource={itemRoute.operations}
                    renderItem={(op, idx) => (
                      <List.Item>
                        <Space direction="vertical" size={0} style={{ width: '100%' }}>
                          <Space size={8}>
                            <Tag color="blue" style={{ margin: 0 }}>Step {op.sequenceNo}</Tag>
                            <Text strong>{op.operationName}</Text>
                            <Tag style={{ margin: 0, fontSize: 10 }}>{op.operationCode}</Tag>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Setup: {op.setupTimeMinutes}min | Run: {op.runTimeMinutes}min | Output: {op.outputQuantity}
                            {op.machineRequired ? ' | Machine Required' : ''}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Alert message="No routing operations defined for this item" type="info" showIcon />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="erp-empty-state">
            <div className="erp-empty-state__icon"><InfoCircleOutlined /></div>
            <div className="erp-empty-state__title">No item selected</div>
            <div className="erp-empty-state__desc">Click a table row to view details</div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
