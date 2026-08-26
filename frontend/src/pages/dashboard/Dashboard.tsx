import React, { useEffect, useState, useCallback } from 'react';
import {
  Card, Row, Col, Typography, Statistic, Tag, Space, Button, Tooltip, Empty, Alert,
  List, Select, Modal, Spin, Badge, Input, Divider, Descriptions, Progress,
} from 'antd';
import {
  DashboardOutlined, ToolOutlined, ShopOutlined, ShoppingCartOutlined, DollarOutlined,
  ReloadOutlined, WarningOutlined, CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined,
  AlertOutlined, TeamOutlined, BarChartOutlined, RiseOutlined, HomeOutlined,
  SearchOutlined, ApartmentOutlined,
  RightOutlined, InfoCircleOutlined, CloseCircleOutlined, FireOutlined,
} from '@ant-design/icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import LoadingState from '../../components/shared/LoadingState';
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
  }, [filters, loadAll]);

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

  const greetingTime = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();

  const filteredItems = itemOverview.filter(item =>
    !itemSearch || item.itemCode.toLowerCase().includes(itemSearch.toLowerCase()) ||
    item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const criticalAlertCount = alerts.filter(a => a.severity === 'error').length;
  const warningAlertCount = alerts.filter(a => a.severity === 'warning').length;

  if (loading) return <LoadingState tip="Loading Command Center..." />;

  return (
    <div>
      <PageHeader
        icon={<DashboardOutlined />}
        title={`${greetingTime} — Command Center`}
        subtitle="Real-time ERP overview with live production, inventory, procurement and sales data"
        extra={
          <Space>
            <Tooltip title="Refresh All Data">
              <Button icon={<ReloadOutlined />} onClick={() => loadAll()}>Refresh</Button>
            </Tooltip>
          </Space>
        }
      />

      {error && <Alert message={error} type="warning" showIcon closable style={{ marginBottom: 16 }} />}

      {/* ━━━ GLOBAL FILTER BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card size="small" style={{ marginBottom: 16 }} bodyStyle={{ padding: '10px 16px' }}>
        <Row gutter={[12, 8]} align="middle">
          <Col flex="none">
            <Text strong style={{ fontSize: 12, marginRight: 4 }}><SearchOutlined /> Filters:</Text>
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select
              placeholder="Division"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.divisionId}
              onChange={v => handleFilterChange('divisionId', v)}
              options={divisions.map(d => ({ value: d.id, label: `${d.divisionCode || ''} ${d.name}` }))}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select
              placeholder="Section"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.sectionId}
              onChange={v => handleFilterChange('sectionId', v)}
              options={sections.map(s => ({ value: s.id, label: s.name }))}
            />
          </Col>
          <Col xs={12} sm={8} md={4}>
            <Select
              placeholder="Department"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.departmentId}
              onChange={v => handleFilterChange('departmentId', v)}
              options={departments.map(d => ({ value: d.id, label: d.name }))}
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
            <Select
              placeholder="Shift"
              allowClear
              size="small"
              style={{ width: '100%' }}
              value={filters.shiftId}
              onChange={v => handleFilterChange('shiftId', v)}
              options={shifts.map(s => ({ value: s.id, label: `${s.name}${s.startTime ? ` (${s.startTime}-${s.endTime})` : ''}` }))}
            />
          </Col>
          <Col xs={12} sm={8} md={3}>
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
          </Col>
          <Col flex="none">
            <Button size="small" onClick={() => { setFilters({}); loadAll({}); }}>Clear All</Button>
          </Col>
        </Row>
      </Card>

      {/* ━━━ KPI SUMMARY ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {[
          { label: 'Items', value: summary?.items.active ?? 0, suffix: `/ ${summary?.items.total ?? 0}`, color: '#1677ff', icon: <DatabaseOutlined />, nav: '/master-data/items' },
          { label: 'Machines', value: summary?.machines.active ?? 0, suffix: `/ ${summary?.machines.total ?? 0}`, color: '#52c41a', icon: <ToolOutlined />, nav: '/master-data/machines' },
          { label: 'Entries', value: summary?.productionEntries.total ?? 0, extra: `Today: ${summary?.productionEntries.today ?? 0}`, color: '#722ed1', icon: <ShopOutlined />, nav: '/production' },
          { label: 'Targets', value: summary?.machineTargets.active ?? 0, suffix: `/ ${summary?.machineTargets.total ?? 0}`, color: '#faad14', icon: <RiseOutlined />, nav: '/production/targets' },
          { label: 'Low Stock', value: summary?.inventory.lowStockItems ?? 0, color: summary && summary.inventory.lowStockItems > 0 ? '#f5222d' : '#52c41a', icon: summary && summary.inventory.lowStockItems > 0 ? <WarningOutlined /> : <CheckCircleOutlined />, nav: '/inventory' },
          { label: 'Active POs', value: summary?.purchaseOrders.active ?? 0, color: '#13c2c2', icon: <ShoppingCartOutlined />, nav: '/procurement/orders' },
          { label: 'Active SOs', value: summary?.salesOrders.active ?? 0, color: '#eb2f96', icon: <DollarOutlined />, nav: '/sales/orders' },
        ].map((kpi, idx) => (
          <Col xs={12} sm={8} md={3} key={idx}>
            <Card
              size="small" hoverable
              onClick={() => navigate(kpi.nav)}
              style={{ borderLeft: `3px solid ${kpi.color}` }}
            >
              <Statistic
                title={<Text type="secondary" style={{ fontSize: 11 }}>{kpi.label}</Text>}
                value={kpi.value}
                suffix={kpi.suffix ? <Text type="secondary" style={{ fontSize: 10 }}>{kpi.suffix}</Text> : kpi.extra ? <Tag color="blue" style={{ marginLeft: 4, fontSize: 9 }}>{kpi.extra}</Tag> : undefined}
                prefix={kpi.icon}
                valueStyle={{ fontSize: 20, color: kpi.color }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* ━━━ PRODUCTION PERFORMANCE + ACHIEVEMENT PIE ━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={16}>
          <Card
            size="small"
            title={<Space><BarChartOutlined /> Production Summary</Space>}
            extra={<Button size="small" type="link" onClick={() => navigate('/production')}>View All <RightOutlined /></Button>}
          >
            {prodSummary && prodSummary.departments.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={prodSummary.departments.map(d => ({
                  name: d.departmentName.length > 12 ? d.departmentName.slice(0, 12) + '…' : d.departmentName,
                  Target: Math.round(d.targetQuantity),
                  Actual: Math.round(d.actualQuantity),
                  Scrap: Math.round(d.scrapQuantity),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-30} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Target" fill="#1677ff" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Actual" fill="#52c41a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Scrap" fill="#f5222d" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty description="No production data" style={{ padding: '40px 0' }} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={<Space><RiseOutlined /> Achievement</Space>}>
            {prodSummary ? (
              <div>
                <div style={{ textAlign: 'center', marginBottom: 8 }}>
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Achieved', value: Math.round(prodSummary.summary.achievementPercentage) },
                          { name: 'Remaining', value: Math.max(0, 100 - Math.round(prodSummary.summary.achievementPercentage)) },
                        ]}
                        cx="50%" cy="50%" innerRadius={40} outerRadius={58}
                        startAngle={90} endAngle={-270}
                      >
                        <Cell fill="#52c41a" />
                        <Cell fill="#e8e8e8" />
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <Statistic
                    value={prodSummary.summary.achievementPercentage}
                    suffix="%"
                    valueStyle={{ fontSize: 24, color: prodSummary.summary.achievementPercentage >= 90 ? '#52c41a' : prodSummary.summary.achievementPercentage >= 70 ? '#faad14' : '#f5222d' }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>Overall Achievement</Text>
                </div>
                <Divider style={{ margin: '8px 0' }} />
                <Row gutter={[6, 6]}>
                  <Col span={12}>
                    <Statistic title={<Text style={{ fontSize: 10 }}>Target</Text>} value={prodSummary.summary.totalTarget} valueStyle={{ fontSize: 14 }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={<Text style={{ fontSize: 10 }}>Actual</Text>} value={prodSummary.summary.totalActual} valueStyle={{ fontSize: 14, color: '#52c41a' }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={<Text style={{ fontSize: 10 }}>Scrap</Text>} value={prodSummary.summary.totalScrap} valueStyle={{ fontSize: 14, color: '#f5222d' }} />
                  </Col>
                  <Col span={12}>
                    <Statistic title={<Text style={{ fontSize: 10 }}>Efficiency</Text>} value={prodSummary.summary.efficiencyPercentage} suffix="%" valueStyle={{ fontSize: 14 }} />
                  </Col>
                </Row>
              </div>
            ) : (
              <Empty description="No data" />
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ PRODUCTION TREND ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card size="small" style={{ marginBottom: 16 }}
        title={<Space><ClockCircleOutlined /> Production Trend (Last 14 Days)</Space>}
        extra={<Button size="small" type="link" onClick={() => navigate('/production')}>View Entries <RightOutlined /></Button>}
      >
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend.map(t => ({
              date: t.date.slice(5),
              Target: t.targetQuantity,
              Actual: t.actualQuantity,
              Achievement: t.achievementPercentage,
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="qty" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 150]} tick={{ fontSize: 10 }} />
              <RTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line yAxisId="qty" type="monotone" dataKey="Target" stroke="#1677ff" strokeWidth={2} dot={false} />
              <Line yAxisId="qty" type="monotone" dataKey="Actual" stroke="#52c41a" strokeWidth={2} dot={false} />
              <Line yAxisId="pct" type="monotone" dataKey="Achievement" stroke="#faad14" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="No trend data" style={{ padding: '30px 0' }} />
        )}
      </Card>

      {/* ━━━ ALERTS + MACHINE PERFORMANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={
              <Space>
                <AlertOutlined /> Alerts
                {alerts.length > 0 && <Badge count={alerts.length} style={{ backgroundColor: criticalAlertCount > 0 ? '#f5222d' : '#faad14' }} />}
              </Space>
            }
            extra={alerts.length > 0 ? (
              <Space>
                {criticalAlertCount > 0 && <Tag color="error">{criticalAlertCount} Critical</Tag>}
                {warningAlertCount > 0 && <Tag color="warning">{warningAlertCount} Warning</Tag>}
              </Space>
            ) : <Tag color="success">All Clear</Tag>}
            bodyStyle={{ padding: alerts.length > 0 ? '4px 12px' : 24 }}
          >
            {alerts.length > 0 ? (
              <List
                size="small"
                dataSource={alerts.slice(0, 10)}
                renderItem={(a) => (
                  <List.Item
                    style={{ padding: '6px 0', cursor: a.link ? 'pointer' : 'default' }}
                    onClick={() => a.link && navigate(a.link)}
                  >
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space size={8}>
                        {a.severity === 'error' ? <CloseCircleOutlined style={{ color: '#f5222d' }} /> :
                         a.severity === 'warning' ? <WarningOutlined style={{ color: '#faad14' }} /> :
                         <InfoCircleOutlined style={{ color: '#1677ff' }} />}
                        <Text strong style={{ fontSize: 12 }}>{a.title}</Text>
                        {a.count && a.count > 1 && <Tag style={{ margin: 0, fontSize: 10 }}>{a.count}</Tag>}
                      </Space>
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 20 }}>{a.description}</Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <CheckCircleOutlined style={{ fontSize: 28, color: '#52c41a', marginBottom: 8 }} />
                <br />
                <Text type="secondary">No alerts — all systems nominal</Text>
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<Space><ToolOutlined /> Machine Performance</Space>}
            extra={<Button size="small" type="link" onClick={() => navigate('/master-data/machines')}>View All <RightOutlined /></Button>}
          >
            {machinePerf.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart
                    data={machinePerf.slice(0, 10).map(m => ({
                      name: m.machineCode.length > 8 ? m.machineCode.slice(0, 8) + '…' : m.machineCode,
                      Achievement: m.avgAchievement,
                      Entries: m.entryCount,
                    }))}
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={65} />
                    <RTooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Achievement" fill="#52c41a" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="Entries" fill="#1677ff" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ overflowX: 'auto', marginTop: 8 }}>
                  <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px' }}>Machine</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px' }}>Dept</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px' }}>Target</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px' }}>Actual</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ach %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {machinePerf.slice(0, 6).map(m => (
                        <tr key={m.id} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                          onClick={() => navigate('/production/machines')}>
                          <td style={{ padding: '4px 6px' }}><Text strong>{m.machineCode}</Text></td>
                          <td style={{ textAlign: 'right', padding: '4px 6px' }}>{m.departmentName || '-'}</td>
                          <td style={{ textAlign: 'right', padding: '4px 6px' }}>{m.targetQuantity.toFixed(1)}</td>
                          <td style={{ textAlign: 'right', padding: '4px 6px' }}>{m.actualQuantity.toFixed(1)}</td>
                          <td style={{ textAlign: 'right', padding: '4px 6px' }}>
                            <Tag color={m.avgAchievement >= 90 ? 'green' : m.avgAchievement >= 70 ? 'orange' : 'red'} style={{ margin: 0, fontSize: 10 }}>
                              {m.avgAchievement.toFixed(1)}%
                            </Tag>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <Empty description="No machine data" style={{ padding: '30px 0' }} />
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ ITEM OVERVIEW + INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card
            size="small"
            title={<Space><ApartmentOutlined /> Item Overview <Text type="secondary" style={{ fontSize: 11 }}>({itemOverview.length} items)</Text></Space>}
            extra={<Space>
              <Input
                placeholder="Search items..."
                prefix={<SearchOutlined />}
                size="small"
                allowClear
                style={{ width: 180 }}
                value={itemSearch}
                onChange={e => setItemSearch(e.target.value)}
              />
              <Button size="small" type="link" onClick={() => navigate('/master-data/items')}>View All <RightOutlined /></Button>
            </Space>}
            bodyStyle={{ padding: filteredItems.length > 0 ? '4px 8px' : 24 }}
          >
            {filteredItems.length > 0 ? (
              <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 1 }}>
                    <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Code</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px' }}>Name</th>
                      <th style={{ textAlign: 'center', padding: '4px 6px' }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>Stock</th>
                      <th style={{ textAlign: 'right', padding: '4px 6px' }}>Prod</th>
                      <th style={{ textAlign: 'center', padding: '4px 6px' }}>Route</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.slice(0, 20).map(item => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}
                        onClick={() => openItemDetail(item)}>
                        <td style={{ padding: '4px 6px' }}><Text strong>{item.itemCode}</Text></td>
                        <td style={{ padding: '4px 6px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                          <Tag color={item.itemType === 'FINISHED_GOOD' ? 'blue' : item.itemType === 'RAW_MATERIAL' ? 'green' : 'orange'} style={{ margin: 0, fontSize: 9 }}>
                            {item.itemType?.replace('_', ' ') || 'N/A'}
                          </Tag>
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 6px' }}>
                          <Text type={item.stock.onHand <= (item.minimumStockLevel ?? 0) ? 'danger' : undefined}>
                            {item.stock.onHand}
                          </Text>
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 6px' }}>{item.production.entryCount}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                          {item.isManufacturable ? <Tag color="green" style={{ margin: 0, fontSize: 9 }}>Yes</Tag> : <Tag style={{ margin: 0, fontSize: 9 }}>No</Tag>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty description={itemSearch ? 'No matching items' : 'No item data'} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={<Space><DatabaseOutlined /> Inventory</Space>}
            extra={<Button size="small" type="link" onClick={() => navigate('/inventory')}>View <RightOutlined /></Button>}
          >
            {inventory ? (
              <div>
                {inventory.warehouses.map(wh => (
                  <div key={wh.warehouseId} style={{ padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                      <Space>
                        <HomeOutlined style={{ color: '#722ed1' }} />
                        <Text strong style={{ fontSize: 12 }}>{wh.warehouseCode}</Text>
                        {wh.warehouseName && <Text type="secondary" style={{ fontSize: 11 }}>({wh.warehouseName})</Text>}
                      </Space>
                      <Tag color="blue" style={{ margin: 0, fontSize: 10 }}>{wh.totalItems} items</Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      On Hand: {wh.totalOnHand.toFixed(1)} | Reserved: {wh.totalReserved.toFixed(1)} | Available: {wh.totalAvailable.toFixed(1)}
                    </Text>
                  </div>
                ))}
                {inventory.lowStockItems.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color="red"><WarningOutlined /> {inventory.lowStockItems.length} Low Stock Items</Tag>
                  </div>
                )}
                {inventory.recentTransactions.length > 0 && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <Text strong style={{ fontSize: 11 }}>Recent Transactions</Text>
                    <List size="small" dataSource={inventory.recentTransactions.slice(0, 5)} renderItem={tx => (
                      <List.Item style={{ padding: '3px 0' }}>
                        <Space size={4} style={{ fontSize: 11 }}>
                          <Tag color={tx.direction === 'IN' ? 'green' : 'red'} style={{ margin: 0, fontSize: 9 }}>{tx.direction}</Tag>
                          <Text>{tx.itemCode}</Text>
                          <Text type="secondary">×{tx.quantity}</Text>
                        </Space>
                      </List.Item>
                    )} />
                  </>
                )}
                {inventory.warehouses.length === 0 && <Empty description="No warehouse data" />}
              </div>
            ) : (
              <Empty description="No inventory data" />
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ PROCUREMENT + SALES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={<Space><ShoppingCartOutlined /> Purchase Orders</Space>}
            extra={<Button size="small" type="link" onClick={() => navigate('/procurement/orders')}>View <RightOutlined /></Button>}
          >
            {poSummary ? (
              <div>
                {poSummary.statusBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={poSummary.statusBreakdown.map(s => ({ name: s.status, Count: s.count, Value: s.totalValue }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip />
                      <Bar dataKey="Count" fill="#13c2c2" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty description="No PO data" />
                )}
                {poSummary.recentOrders.length > 0 && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <List size="small" dataSource={poSummary.recentOrders.slice(0, 4)} renderItem={po => (
                      <List.Item style={{ padding: '3px 0' }}>
                        <Space style={{ fontSize: 11, width: '100%', justifyContent: 'space-between' }}>
                          <Space size={4}>
                            <Tag color={po.status === 'APPROVED' ? 'green' : po.status === 'DRAFT' ? 'blue' : 'orange'} style={{ margin: 0, fontSize: 9 }}>{po.status}</Tag>
                            <Text>{po.poCode}</Text>
                          </Space>
                          <Text type="secondary">{po.supplierName}</Text>
                        </Space>
                      </List.Item>
                    )} />
                  </>
                )}
              </div>
            ) : (
              <Empty description="No procurement data" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card
            size="small"
            title={<Space><DollarOutlined /> Sales Orders</Space>}
            extra={<Button size="small" type="link" onClick={() => navigate('/sales/orders')}>View <RightOutlined /></Button>}
          >
            {soSummary ? (
              <div>
                {soSummary.statusBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={soSummary.statusBreakdown.map(s => ({ name: s.status, Count: s.count, Value: s.totalValue }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RTooltip />
                      <Bar dataKey="Count" fill="#eb2f96" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <Empty description="No SO data" />
                )}
                {soSummary.recentOrders.length > 0 && (
                  <>
                    <Divider style={{ margin: '8px 0' }} />
                    <List size="small" dataSource={soSummary.recentOrders.slice(0, 4)} renderItem={so => (
                      <List.Item style={{ padding: '3px 0' }}>
                        <Space style={{ fontSize: 11, width: '100%', justifyContent: 'space-between' }}>
                          <Space size={4}>
                            <Tag color={so.status === 'CONFIRMED' ? 'green' : so.status === 'Draft' ? 'blue' : 'orange'} style={{ margin: 0, fontSize: 9 }}>{so.status}</Tag>
                            <Text>{so.orderNumber}</Text>
                          </Space>
                          <Text type="secondary">{so.customerName}</Text>
                        </Space>
                      </List.Item>
                    )} />
                  </>
                )}
              </div>
            ) : (
              <Empty description="No sales data" />
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ DEPARTMENT PERFORMANCE + ACTIVITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} lg={14}>
          <Card size="small" title={<Space><TeamOutlined /> Department Performance</Space>}>
            {prodSummary && prodSummary.departments.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px' }}>Department</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Entries</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Target</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Actual</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px' }}>Scrap</th>
                      <th style={{ textAlign: 'center', padding: '6px 8px' }}>Achievement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prodSummary.departments.map(d => (
                      <tr key={d.departmentId} style={{ borderBottom: '1px solid #f5f5f5' }}>
                        <td style={{ padding: '6px 8px' }}><Text strong>{d.departmentName}</Text></td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{d.entryCount}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{d.targetQuantity.toFixed(1)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{d.actualQuantity.toFixed(1)}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px' }}>{d.scrapQuantity.toFixed(1)}</td>
                        <td style={{ textAlign: 'center', padding: '6px 8px' }}>
                          <Progress
                            percent={Math.min(d.achievementPercentage, 100)}
                            size="small"
                            status={d.achievementPercentage >= 90 ? 'success' : d.achievementPercentage >= 70 ? 'normal' : 'exception'}
                            format={() => `${d.achievementPercentage.toFixed(1)}%`}
                            style={{ width: 80, display: 'inline-block' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty description="No department data" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            size="small"
            title={<Space><ClockCircleOutlined /> Recent Activity</Space>}
            bodyStyle={{ padding: '4px 12px' }}
          >
            {activity.length > 0 ? (
              <List
                size="small"
                dataSource={activity.slice(0, 10)}
                renderItem={(a) => (
                  <List.Item style={{ padding: '5px 0' }}>
                    <Space direction="vertical" size={0} style={{ width: '100%' }}>
                      <Space size={6}>
                        <Tag
                          color={a.action?.includes('DELETE') || a.action?.includes('REMOVE') ? 'red' : a.action?.includes('CREATE') ? 'green' : 'blue'}
                          style={{ margin: 0, fontSize: 9 }}
                        >
                          {a.action}
                        </Tag>
                        <Text style={{ fontSize: 11 }}>{a.targetType}{a.targetName ? `: ${a.targetName}` : ''}</Text>
                      </Space>
                      <Text type="secondary" style={{ fontSize: 10 }}>
                        {a.actorEmail} · {new Date(a.createdAt).toLocaleDateString()} {new Date(a.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <ClockCircleOutlined style={{ fontSize: 24, color: '#d9d9d9', marginBottom: 8 }} />
                <br />
                <Text type="secondary" style={{ fontSize: 11 }}>No recent activity</Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ━━━ QUICK ACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Card size="small" title={<Space><FireOutlined /> Quick Actions</Space>}>
        <Space wrap>
          <Button icon={<ShopOutlined />} onClick={() => navigate('/production')}>Production Entries</Button>
          <Button icon={<ToolOutlined />} onClick={() => navigate('/master-data/machines')}>Machine Master</Button>
          <Button icon={<DatabaseOutlined />} onClick={() => navigate('/inventory')}>Inventory</Button>
          <Button icon={<ShoppingCartOutlined />} onClick={() => navigate('/procurement/orders')}>Purchase Orders</Button>
          <Button icon={<DollarOutlined />} onClick={() => navigate('/sales/orders')}>Sales Orders</Button>
          <Button icon={<BarChartOutlined />} onClick={() => navigate('/inventory/reports')}>Inventory Reports</Button>
          <Button icon={<TeamOutlined />} onClick={() => navigate('/master-data/items')}>Item Master</Button>
        </Space>
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
          <Empty description="No item selected" />
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;
