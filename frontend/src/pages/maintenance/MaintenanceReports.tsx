import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, Input, Row, Select, Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  BarChartOutlined,
  BuildOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  DollarCircleOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RiseOutlined,
  ScanOutlined,
  ScheduleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { useNavigate } from 'react-router-dom';
import { LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { label, OrgOption } from './jobCards.types';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { useMaintenanceHierarchy, divisionLabel, sectionLabel, departmentLabel } from './useMaintenanceHierarchy';
import { panelCard, shadowSm, tint, TYPE_COLORS } from './maintTheme';
import './maintTheme.css';

const { Text } = Typography;

const JOB_CARDS_BASE = '/master-data/maintenance/job-cards';
type Any = Record<string, any>;

const ALL = '__all__';
const ALL_OPTION = { value: ALL, label: 'All' };

const formatDuration = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || minutes < 0) return 'Insufficient data';
  if (minutes === 0) return '0m';
  const d = Math.floor(minutes / 1440);
  const rem = minutes % 1440;
  const h = Math.floor(rem / 60);
  const m = rem % 60;
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  return parts.join(' ') || '0m';
};

const formatPct = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return 'Insufficient data';
  return `${Math.round(value)}%`;
};

const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return 'Insufficient data';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(value);
};

const metricValue = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || minutes < 0) return 'Insufficient data';
  return formatDuration(Math.round(minutes));
};

const kpiNumber = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return 'Insufficient data';
  return String(value);
};

const machineOptionLabel = (m: OrgOption): string => {
  const number = m.machineNumber || m.machineCode || m.machineId || '';
  const name = m.name || m.machineName || number;
  return number && name && number !== name ? `${number} — ${name}` : (number || name || 'Unnamed machine');
};

const KpiCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; color: string; hint?: string }> = ({ label: kpiLabel, value, icon, color, hint }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
    border: `1px solid var(--theme-border)`, borderLeft: `3px solid ${color}`,
    background: 'var(--theme-surface)', borderRadius: 4, height: '100%',
  }}>
    <div style={{ width: 34, height: 34, borderRadius: 4, background: tint(color), color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>{icon}</div>
    <div style={{ lineHeight: 1.15, minWidth: 0 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-text)', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
        {kpiLabel}
        {hint ? <Tooltip title={hint}><InfoCircleOutlined style={{ fontSize: 11, cursor: 'help' }} /></Tooltip> : null}
      </div>
    </div>
  </div>
);

const PanelSection: React.FC<{ title: string; extra?: React.ReactNode; children: React.ReactNode }> = ({ title, extra, children }) => (
  <Card
    size="small"
    title={<span style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.02em', color: 'var(--theme-text)' }}>{title}</span>}
    extra={extra}
    style={{ ...panelCard, marginBottom: 0, boxShadow: shadowSm }}
    styles={{ body: { paddingTop: 12 } }}
  >
    {children}
  </Card>
);

export const MaintenanceReports: React.FC = () => {
  const { user, can } = usePermission();
  const navigate = useNavigate();
  const defaultCompanyId = user?.defaultCompanyId as string | undefined;

  const [machines, setMachines] = useState<OrgOption[]>([]);
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [machineId, setMachineId] = useState<string | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [reports, setReports] = useState<Any | null>(null);
  const [kpi, setKpi] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const canReports = can('maintenance.reports.view');
  const canView = can('maintenance.job_card.view');

  const { divisions, sections, departments } = useMaintenanceHierarchy(defaultCompanyId, divisionId, sectionId);

  const machinesReq = useRef(0);
  useEffect(() => {
    if (!defaultCompanyId) { setMachines([]); return; }
    const reqId = ++machinesReq.current;
    setMachines([]);
    const params: Record<string, string | number> = { limit: 1000, sortBy: 'machineCode', sortDir: 'ASC' };
    if (divisionId) params.divisionId = divisionId;
    if (sectionId) params.sectionId = sectionId;
    if (departmentId) params.departmentId = departmentId;
    apiService.get<any>('/machines', params)
      .then(r => { if (machinesReq.current !== reqId) return; setMachines((r?.data || r || []).filter((m: any) => m && m.id)); })
      .catch(() => { if (machinesReq.current === reqId) setMachines([]); });
  }, [defaultCompanyId, divisionId, sectionId, departmentId]);

  const onDivisionChange = (value?: string) => { setDivisionId(value || undefined); setSectionId(undefined); setDepartmentId(undefined); setMachineId(undefined); };
  const onSectionChange = (value?: string) => { setSectionId(value || undefined); setDepartmentId(undefined); setMachineId(undefined); };
  const onDepartmentChange = (value?: string) => { setDepartmentId(value || undefined); setMachineId(undefined); };
  const onMachineChange = (value?: string) => { setMachineId(value || undefined); };
  const clearAllFilters = () => { setDivisionId(undefined); setSectionId(undefined); setDepartmentId(undefined); setMachineId(undefined); };

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSearch(value); }, 400);
  };

  const loadReq = useRef(0);
  const load = useCallback(async () => {
    if (!defaultCompanyId) { setError('No default company is assigned to your account. Contact your administrator to set a default company.'); setLoading(false); return; }
    const reqId = ++loadReq.current;
    setLoading(true); setError('');
    const query: Record<string, string | undefined> = { companyId: defaultCompanyId };
    if (machineId) query.machineId = machineId;
    if (divisionId) query.divisionId = divisionId;
    if (sectionId) query.sectionId = sectionId;
    if (departmentId) query.departmentId = departmentId;
    if (search) query.search = search;
    try {
      const jobs: Array<Promise<Any>> = [];
      if (canReports) jobs.push(apiService.get<Any>(JOB_CARDS_BASE + '/reports', query));
      if (canView) jobs.push(apiService.get<Any>(JOB_CARDS_BASE + '/chart-data', query));
      const [reportsRes, kpiRes] = await Promise.all(jobs);
      if (loadReq.current !== reqId) return;
      setReports((reportsRes as Any | undefined) || null);
      setKpi((kpiRes as Any | undefined) || null);
    } catch (e) {
      if (loadReq.current !== reqId) return;
      const response = (e as { response?: { data?: { message?: string | string[] } } })?.response;
      const msg = response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] || 'Unable to load reports.' : msg || 'Unable to load reports.');
    } finally {
      if (loadReq.current === reqId) setLoading(false);
    }
  }, [defaultCompanyId, machineId, divisionId, sectionId, departmentId, search, canView, canReports]);

  useEffect(() => { void load(); }, [load]);

  const hasActiveFilters = !!(divisionId || sectionId || departmentId || machineId || search);

  const topProblemColumns: ColumnsType<Any> = [
    { title: 'Machine', key: 'machine', render: (_: any, r: Any) => <Space size={4}><Typography.Text strong>{r.machineCode || '—'}</Typography.Text><Text type="secondary">{r.machineName || ''}</Text></Space> },
    { title: 'Total Jobs', dataIndex: 'jobCount', sorter: (a: Any, b: Any) => Number(a.jobCount) - Number(b.jobCount), defaultSortOrder: 'descend' as const, render: (v: string) => Number(v) || 0 },
    { title: 'Approved', dataIndex: 'approvedCount', render: (v: string) => Number(v) || 0 },
    { title: 'Total Downtime', dataIndex: 'totalDowntime', render: (v: string) => (Number(v) ? formatDuration(Number(v)) : '—') },
  ];

  const downtimeByTypeColumns: ColumnsType<Any> = [
    { title: 'Maintenance Type', dataIndex: 'type', render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{label(v)}</Tag> },
    { title: 'Count', dataIndex: 'count', render: (v: string) => Number(v) || 0 },
    { title: 'Avg Duration', dataIndex: 'avgDowntime', render: (v: string) => (Number(v) ? formatDuration(Number(v)) : '—') },
    { title: 'Total Downtime', dataIndex: 'totalDowntime', render: (v: string) => (Number(v) ? formatDuration(Number(v)) : '—') },
  ];

  const mtbfColumns: ColumnsType<Any> = [
    { title: 'Machine', key: 'machine', render: (_: any, r: Any) => <Typography.Text strong>{r.machineName || r.machineId || '—'}</Typography.Text> },
    { title: 'Approved Jobs', dataIndex: 'totalJobs', render: (v: string) => Number(v) || 0 },
  ];

  const kpiCards = useMemo(() => kpi ? [
    <KpiCard key="mttr" label="MTTR" value={metricValue(kpi.mttrMinutes)} icon={<ToolOutlined />} color="#1890ff" hint="Mean Time To Repair — average active repair duration for completed repair jobs." />,
    <KpiCard key="mtbf" label="MTBF" value={metricValue(kpi.mtbfMinutes)} icon={<ClockCircleOutlined />} color="#722ed1" hint="Mean Time Between Failures — average interval between consecutive breakdown occurrences per machine." />,
    <KpiCard key="mpbf" label="MPBF" value={metricValue(kpi.mpbfMinutes)} icon={<ThunderboltOutlined />} color="#13c2c2" hint="Mean Period Between Failures — average interval between consecutive breakdown completions per machine." />,
    <KpiCard key="avail" label="Availability %" value={formatPct(kpi.availabilityPercent)} icon={<RiseOutlined />} color="#52c41a" hint="Availability = (observed window − unplanned downtime) ÷ observed window × 100." />,
    <KpiCard key="downtime" label="Total Downtime" value={metricValue(kpi.totalDowntimeMinutes)} icon={<WarningOutlined />} color="#fa541c" hint={`Planned: ${metricValue(kpi.plannedDowntimeMinutes)} | Unplanned: ${metricValue(kpi.unplannedDowntimeMinutes)}`} />,
    <KpiCard key="breakdown" label="Breakdown Count" value={kpiNumber(kpi.breakdownJobs)} icon={<BuildOutlined />} color="#cf1322" hint="Breakdown / emergency / corrective events in scope." />,
    <KpiCard key="pm" label="PM Compliance %" value={formatPct(kpi.pmCompliancePercent)} icon={<ScheduleOutlined />} color="#faad14" hint="Completed on-time PMs ÷ total scheduled PMs × 100." />,
    <KpiCard key="cost" label="Maintenance Cost" value={formatMoney(kpi.maintenanceCost)} icon={<DollarCircleOutlined />} color="#2f9e44" hint="Sum of spare parts total_cost consumed for maintenance (PKR)." />,
  ] : null, [kpi]);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Refresh</Button>) },
      ...(canReports
        ? [{
            key: 'open-job-cards',
            node: (
              <Button type="primary" icon={<BarChartOutlined />} onClick={() => navigate('/maintenance/job-cards')}>
                View Job Cards
              </Button>
            ),
          }]
        : []),
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, load, loading, navigate, canReports]);

  const hasReportData = !!(reports?.topProblemMachines?.length || reports?.downtimeByType?.length || reports?.mtbfByMachine?.length);

  return (
    <div>
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ ...panelCard, marginBottom: 12 }}>
        <Row gutter={[8, 12]} align="middle">
          <Col>
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters(v => !v)} type={showFilters ? 'primary' : 'default'}>
              <Text style={{ color: showFilters ? '#fff' : undefined }}>Filters</Text>
            </Button>
          </Col>
          <Col flex="auto" />
          <Col style={{ minWidth: 220, flex: '1 1 260px' }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
              placeholder="Search machines, codes, complaints..."
              value={searchInput}
              onChange={e => onSearchChange(e.target.value)}
              style={{ width: '100%' }}
            />
          </Col>
          {hasActiveFilters && <Col><Button type="text" icon={<ClearOutlined />} onClick={() => { clearAllFilters(); setSearchInput(''); setSearch(''); }}>Clear</Button></Col>}
        </Row>
        {showFilters && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--theme-border)', paddingTop: 16 }}>
            <Row gutter={[12, 12]}>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select showSearch aria-label="Reports Filter Division" placeholder="All Divisions ▼" value={divisionId || ALL}
                  onChange={(v) => onDivisionChange(v === ALL ? undefined : v)} optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...divisions.map(d => ({ value: d.id, label: divisionLabel(d) }))]} style={{ width: '100%', minWidth: 140 }} />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select showSearch aria-label="Reports Filter Section" placeholder="All Sections ▼" value={sectionId || ALL}
                  onChange={(v) => onSectionChange(v === ALL ? undefined : v)} disabled={!divisionId} optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...sections.map(s => ({ value: s.id, label: sectionLabel(s) }))]} style={{ width: '100%', minWidth: 140 }} />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select showSearch aria-label="Reports Filter Department" placeholder="All Departments ▼" value={departmentId || ALL}
                  onChange={(v) => onDepartmentChange(v === ALL ? undefined : v)} disabled={!sectionId} optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...departments.map(d => ({ value: d.id, label: departmentLabel(d) }))]} style={{ width: '100%', minWidth: 140 }} />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select showSearch aria-label="Reports Filter Machine Number" placeholder="All Machine Numbers ▼" value={machineId || ALL}
                  onChange={(v) => onMachineChange(v === ALL ? undefined : v)} optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...machines.map(m => ({ value: m.id, label: machineOptionLabel(m), title: machineOptionLabel(m) }))]} style={{ width: '100%', minWidth: 140 }}
                  suffixIcon={<ScanOutlined style={{ color: 'var(--theme-text-muted)' }} />} />
              </Col>
            </Row>
          </div>
        )}
      </Card>

      {!defaultCompanyId && !loading && (
        <Alert type="warning" showIcon message="No default company" description="No default company is assigned to your account. Reports cannot be loaded." style={{ marginBottom: 16 }} />
      )}

      {loading && <LoadingState tip="Loading maintenance reports…" />}

      {!loading && error && (
        <Alert type="error" showIcon message="Unable to load reports" description={error} action={<Button size="small" onClick={() => void load()}>Retry</Button>} style={{ borderRadius: 6 }} />
      )}

      {!loading && !error && !canReports && !canView && (
        <Alert type="warning" showIcon message="Insufficient permission" description="You need maintenance reports or job card view permission to view maintenance reports." style={{ borderRadius: 6 }} />
      )}

{!error && (
        <>
          {!loading && kpiCards && (
            <div className="maint-kpi-grid" style={{ marginBottom: 12 }}>
              {kpiCards}
            </div>
          )}

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={12}>
              <PanelSection title="Top Problem Machines">
                {loading ? <Text type="secondary">Loading…</Text> : (reports?.topProblemMachines?.length ? (
                  <Table rowKey="machineId" columns={topProblemColumns} dataSource={reports.topProblemMachines} pagination={false} size="small" scroll={{ x: 560 }} />
                ) : <Text type="secondary">No machine-reported downtime data in scope.</Text>)}
              </PanelSection>
            </Col>
            <Col xs={24} lg={12}>
              <PanelSection title="Downtime by Maintenance Type">
                {loading ? <Text type="secondary">Loading…</Text> : (reports?.downtimeByType?.length ? (
                  <Table rowKey="type" columns={downtimeByTypeColumns} dataSource={reports.downtimeByType} pagination={false} size="small" scroll={{ x: 480 }} />
                ) : <Text type="secondary">No downtime-by-type data in scope.</Text>)}
              </PanelSection>
            </Col>
          </Row>

          <div style={{ marginTop: 12 }}>
            <PanelSection title="MTBF by Machine (Approved)">
              {reports?.mtbfByMachine?.length ? (
                <Table rowKey="machineId" columns={mtbfColumns} dataSource={reports.mtbfByMachine} pagination={false} size="small" scroll={{ x: 380 }} />
              ) : <Text type="secondary">Not enough approved job data to compute MTBF.</Text>}
            </PanelSection>
          </div>

          {!loading && !hasReportData && !kpi && (
            <Card style={{ ...panelCard, marginTop: 12 }}>
              <Text type="secondary">Create and complete job cards to generate maintenance reports.</Text>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default MaintenanceReports;
