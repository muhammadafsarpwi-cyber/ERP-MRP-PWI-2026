import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Button, Card, Col, Input, Row, Select, Space, Statistic, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  BarChartOutlined,
  BuildOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  FilterOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  RiseOutlined,
  ScanOutlined,
  ScheduleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { label, OrgOption } from './jobCards.types';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import {
  useMaintenanceHierarchy, divisionLabel, sectionLabel, departmentLabel,
} from './useMaintenanceHierarchy';
import {
  ACTION_COLORS, panelCard, shadowHover, shadowSm, tint,
  TYPE_COLORS, PRIORITY_COLORS, STATUS_COLORS,
} from './maintTheme';
import './maintTheme.css';

const { Text } = Typography;

interface DashboardResponse {
  total: number;
  open: number;
  assigned: number;
  inProgress: number;
  onHold: number;
  waitingForParts: number;
  completed: number;
  pendingVerification: number;
  verified: number;
  closed: number;
  rejected: number;
  cancelled: number;
  approved: number;
  critical: number;
  byMaintenanceType?: Array<{ type: string; count: string }>;
  percentages?: Record<string, number | null>;
}

interface ChartData {
  typeBreakdown: Array<{ type: string; count: string }>;
  priorityBreakdown: Array<{ priority: string; count: string }>;
  monthlyTrend: Array<{ month: string; count: string; completed: string; breakdowns: string }>;
  statusBreakdown: Array<{ status: string; count: string }>;
  avgDowntimeMinutes: number | null;
  totalDowntimeMinutes: number | null;
  mttrMinutes: number | null;
  mtbfMinutes: number | null;
  mpbfMinutes: number | null;
  availabilityPercent: number | null;
  plannedDowntimeMinutes: number | null;
  unplannedDowntimeMinutes: number | null;
  activeRepairMinutes?: number | null;
  waitingMinutes?: number | null;
  onHoldMinutes?: number | null;
  breakdownJobs?: number | null;
  completedJobs?: number | null;
  openJobs?: number | null;
  overdueJobs?: number | null;
  pmScheduled?: number | null;
  pmCompletedOnTime?: number | null;
  pmCompliancePercent?: number | null;
  pmOverdue?: number | null;
  maintenanceCost?: number | null;
  downtimeTrend?: Array<{ month: string; planned: number; unplanned: number; total: number }>;
  breakdownTrend?: Array<{ month: string; count: number }>;
  mttrTrend?: Array<{ month: string; mttr: number }>;
}

interface ReportsData {
  topProblemMachines: Array<{ machineId: string; machineName?: string; machineCode?: string; jobCount: string; approvedCount?: string; totalDowntime?: string }>;
  downtimeByType: Array<{ type: string; count: string; avgDowntime?: string; totalDowntime?: string }>;
  mtbfByMachine: Array<{ machineId: string; machineName?: string; totalJobs?: string }>;
}

const QUEUE: Array<{ status: string | null; label: string; key: string }> = [
  { status: null, label: 'ALL', key: 'total' },
  { status: 'OPEN', label: 'OPEN', key: 'open' },
  { status: 'ASSIGNED', label: 'ASSIGNED', key: 'assigned' },
  { status: 'IN_PROGRESS', label: 'IN_PROGRESS', key: 'inProgress' },
  { status: 'ON_HOLD', label: 'ON_HOLD', key: 'onHold' },
  { status: 'WAITING_FOR_PARTS', label: 'WAITING_FOR_PARTS', key: 'waitingForParts' },
  { status: 'COMPLETED', label: 'COMPLETED', key: 'completed' },
  { status: 'PENDING_VERIFICATION', label: 'PENDING_VERIFICATION', key: 'pendingVerification' },
  { status: 'VERIFIED', label: 'VERIFIED', key: 'verified' },
  { status: 'APPROVED', label: 'APPROVED', key: 'approved' },
  { status: 'CLOSED', label: 'CLOSED', key: 'closed' },
  { status: 'REJECTED', label: 'REJECTED', key: 'rejected' },
  { status: 'CANCELLED', label: 'CANCELLED', key: 'cancelled' },
];

const PENDING_ACTIONS: Array<{ status: string; label: string; key: string; icon: React.ReactNode; color: string; description: string }> = [
  { status: 'OPEN', label: 'Pending Assignment', key: 'open', icon: <ScheduleOutlined />, color: ACTION_COLORS.OPEN, description: 'Job cards awaiting technician or team assignment.' },
  { status: 'WAITING_FOR_PARTS', label: 'Pending Parts', key: 'waitingForParts', icon: <WarningOutlined />, color: ACTION_COLORS.WAITING_FOR_PARTS, description: 'Jobs paused waiting for spare parts.' },
  { status: 'PENDING_VERIFICATION', label: 'Pending Verification', key: 'pendingVerification', icon: <ThunderboltOutlined />, color: ACTION_COLORS.PENDING_VERIFICATION, description: 'Completed work awaiting requester verification.' },
  { status: 'VERIFIED', label: 'Pending Approval', key: 'verified', icon: <CheckCircleOutlined />, color: ACTION_COLORS.VERIFIED, description: 'Verified jobs awaiting final approval.' },
];

const USER_PERMISSIONS = {
  view: 'maintenance.job_card.view',
  reports: 'maintenance.reports.view',
};

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

const metricValue = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || minutes < 0) return 'Insufficient data';
  return formatDuration(Math.round(minutes));
};

const formatPct = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return 'Insufficient data';
  return `${Math.round(value)}%`;
};

const formatMoney = (value: number | null | undefined): string => {
  if (value === null || value === undefined || value < 0) return 'Insufficient data';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(value);
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

const ALL = '__all__';
const ALL_OPTION = { value: ALL, label: 'All' };

const getApiError = (error: unknown): string => {
  const response = (error as { response?: { data?: { message?: string | string[] } } })?.response;
  const message = response?.data?.message;
  if (Array.isArray(message)) return message[0] || 'Unable to load the maintenance dashboard.';
  return message || 'Unable to load the maintenance dashboard. Please try again.';
};

const KpiCard: React.FC<{ label: string; value: React.ReactNode; icon: React.ReactNode; color: string; onClick?: () => void; suffix?: string; hint?: string }> = ({ label: kpiLabel, value, icon, color, onClick, suffix, hint }) => {
  const title = (hint ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      {kpiLabel}
      <Tooltip title={hint}><InfoCircleOutlined style={{ fontSize: 11, cursor: 'help' }} /></Tooltip>
    </span>
  ) : kpiLabel);
  const titleNode = (
    <span style={{ fontSize: 11, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: '.03em', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {title}
    </span>
  );
  const content = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <div style={{ width: 34, height: 34, borderRadius: 4, background: tint(color), color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>{icon}</div>
      <Statistic
        title={titleNode}
        value={(typeof value === 'number' || typeof value === 'string') ? value : 0}
        suffix={suffix}
        valueStyle={{ fontSize: 20, fontWeight: 700, color: 'var(--theme-text)', whiteSpace: 'nowrap' }}
      />
    </div>
  );
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
        border: `1px solid var(--theme-border)`, borderLeft: `3px solid ${color}`,
        background: 'var(--theme-surface)', borderRadius: 4, cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow .15s, border-color .15s', height: '100%',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadowHover; e.currentTarget.style.borderColor = color; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--theme-border)'; }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
    >
      {content}
    </div>
  );
};

interface PanelSectionProps {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

const PanelSection: React.FC<PanelSectionProps> = ({ title, extra, children }) => (
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

const MaintenanceDashboard: React.FC = () => {
  const { user, can } = usePermission();
  const navigate = useNavigate();
  const defaultCompanyId = user?.defaultCompanyId as string | undefined;

  const [machines, setMachines] = useState<OrgOption[]>([]);
  const [machineId, setMachineId] = useState<string | undefined>(undefined);
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [reportsData, setReportsData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  const canView = can(USER_PERMISSIONS.view);
  const canReports = can(USER_PERMISSIONS.reports);

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

  const { divisions, sections, departments } = useMaintenanceHierarchy(defaultCompanyId, divisionId, sectionId);

  const onDivisionChange = (value?: string) => {
    setDivisionId(value || undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setMachineId(undefined);
  };
  const onSectionChange = (value?: string) => {
    setSectionId(value || undefined);
    setDepartmentId(undefined);
    setMachineId(undefined);
  };
  const onDepartmentChange = (value?: string) => {
    setDepartmentId(value || undefined);
    setMachineId(undefined);
  };
  const onMachineChange = (value?: string) => {
    setMachineId(value || undefined);
  };
  const clearAllFilters = () => {
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setMachineId(undefined);
  };

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setSearch(value); }, 400);
  };

  const loadReq = useRef(0);
  const load = useCallback(async () => {
    if (!defaultCompanyId) {
      setError('No default company is assigned to your account. Contact your administrator to set a default company.');
      setLoading(false);
      return;
    }
    const reqId = ++loadReq.current;
    setLoading(true);
    setError(null);
    try {
      const query: Record<string, string | undefined> = { companyId: defaultCompanyId };
      if (machineId) query.machineId = machineId;
      if (divisionId) query.divisionId = divisionId;
      if (sectionId) query.sectionId = sectionId;
      if (departmentId) query.departmentId = departmentId;
      if (search) query.search = search;
      const jobs: Array<Promise<any>> = [
        apiService.get<DashboardResponse>('/master-data/maintenance/job-cards/dashboard', query),
        apiService.get<ChartData>('/master-data/maintenance/job-cards/chart-data', query),
      ];
      if (canReports) {
        jobs.push(apiService.get<ReportsData>('/master-data/maintenance/job-cards/reports', query));
      }
      const [dash, chart, reports] = await Promise.all(jobs);
      if (loadReq.current !== reqId) return;
      setData(dash);
      setChartData(chart);
      setReportsData((reports as ReportsData | undefined) || null);
    } catch (requestError) {
      if (loadReq.current !== reqId) return;
      setError(getApiError(requestError));
    } finally {
      if (loadReq.current === reqId) setLoading(false);
    }
  }, [defaultCompanyId, machineId, divisionId, sectionId, departmentId, search, canReports]);

  useEffect(() => { void load(); }, [load]);

  const pipeline = useMemo(
    () => QUEUE.map(q => ({ ...q, count: Number(data?.[q.key as keyof DashboardResponse] ?? 0) })),
    [data],
  );
  const statusTotal = useMemo(() => pipeline.reduce((sum, p) => sum + p.count, 0), [pipeline]);
  const priorityTotal = useMemo(
    () => (chartData?.priorityBreakdown || []).reduce((s, i) => s + parseInt(i.count, 10), 0),
    [chartData],
  );

  const hasActiveFilters = !!(divisionId || sectionId || departmentId || machineId || search);

  const goStatus = (status: string | null) => {
    const params = new URLSearchParams();
    if (status !== null) params.set('status', status);
    if (machineId) params.set('machineId', machineId);
    if (divisionId) params.set('divisionId', divisionId);
    if (sectionId) params.set('sectionId', sectionId);
    if (departmentId) params.set('departmentId', departmentId);
    const qs = params.toString();
    navigate(qs ? `/maintenance/job-cards?${qs}` : '/maintenance/job-cards');
  };

  const renderChartDist = (items: Array<{ label: string; count: number; color: string }>, total: number) => {
    const max = Math.max(1, ...items.map(i => i.count));
    if (total === 0) {
      return <Text type="secondary">No data yet</Text>;
    }
    return (
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {items.map(item => {
          const percent = Math.round((item.count / max) * 100);
          return (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 86, flexShrink: 0, textAlign: 'right' }}>
                <Tag color={item.color} style={{ marginInlineEnd: 0, width: 80, textAlign: 'center' }}>{label(item.label)}</Tag>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ background: 'var(--maint-track-bg)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${percent}%`, height: '100%', background: item.color, borderRadius: 4, transition: 'width .3s' }} />
                </div>
              </div>
              <div style={{ width: 66, flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                {item.count}<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>({total > 0 ? Math.round((item.count / total) * 100) : 0}%)</Text>
              </div>
            </div>
          );
        })}
      </Space>
    );
  };

  const renderTrend = (trend: ChartData['downtimeTrend']) => {
    if (!trend || trend.length === 0) {
      return <Text type="secondary">Insufficient data for downtime trend.</Text>;
    }
    const max = Math.max(1, ...trend.map(t => t.total || 0));
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {trend.map(t => (
          <div key={t.month} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Text strong>{t.month}</Text>
              <Text type="secondary">{formatDuration(t.total || 0)}</Text>
            </div>
            <div style={{ display: 'flex', height: 14, borderRadius: 3, overflow: 'hidden', background: 'var(--maint-track-bg)' }}>
              <div style={{ width: `${max > 0 ? ((t.planned || 0) / max) * 100 : 0}%`, background: '#1890ff' }} title={`Planned: ${formatDuration(t.planned || 0)}`} />
              <div style={{ width: `${max > 0 ? ((t.unplanned || 0) / max) * 100 : 0}%`, background: '#cf1322' }} title={`Unplanned: ${formatDuration(t.unplanned || 0)}`} />
            </div>
          </div>
        ))}
      </Space>
    );
  };

  const renderBreakdownMttrTrend = (breakdown: ChartData['breakdownTrend'], mttr: ChartData['mttrTrend']) => {
    const useBreakdown = breakdown && breakdown.length > 0;
    const useMttr = mttr && mttr.length > 0;
    if (!useBreakdown && !useMttr) {
      return <Text type="secondary">Insufficient data for trend.</Text>;
    }
    const maxCount = useBreakdown ? Math.max(1, ...breakdown.map(b => b.count || 0)) : 1;
    return (
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        {useBreakdown && breakdown.map(b => (
          <div key={`brk-${b.month}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <Text strong>{b.month}</Text>
              <Text type="secondary">{b.count} breakdowns</Text>
            </div>
            <div style={{ background: 'var(--maint-track-bg)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${((b.count || 0) / maxCount) * 100}%`, height: '100%', background: '#cf1322', borderRadius: 4 }} />
            </div>
          </div>
        ))}
        {useMttr && mttr.map(m => (
          <div key={`mttr-${m.month}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <Text strong>MTTR {m.month}</Text>
            <Text type="secondary">{formatDuration(m.mttr)}</Text>
          </div>
        ))}
      </Space>
    );
  };

  const topProblemColumns: ColumnsType<ReportsData['topProblemMachines'][number]> = [
    {
      title: 'Machine', key: 'machine',
      render: (_: any, r: ReportsData['topProblemMachines'][number]) => <Space size={4}><Typography.Text strong>{r.machineCode || '—'}</Typography.Text><Text type="secondary">{r.machineName || ''}</Text></Space>,
    },
    { title: 'Jobs', dataIndex: 'jobCount', width: 64, render: (v: string) => Number(v) || 0 },
    { title: 'Approved', dataIndex: 'approvedCount', width: 76, render: (v: string) => Number(v) || 0 },
    { title: 'Downtime', dataIndex: 'totalDowntime', width: 96, render: (v: string) => (Number(v) ? `${formatDuration(Number(v))}` : '—') },
  ];

  const downtimeByTypeColumns: ColumnsType<ReportsData['downtimeByType'][number]> = [
    { title: 'Type', dataIndex: 'type', key: 'type', render: (v: string) => <Tag color={TYPE_COLORS[v] || 'default'}>{label(v)}</Tag> },
    { title: 'Count', dataIndex: 'count', width: 64, render: (v: string) => Number(v) || 0 },
    { title: 'Avg Duration', dataIndex: 'avgDowntime', width: 110, render: (v: string) => (Number(v) ? `${formatDuration(Number(v))}` : '—') },
    { title: 'Total Downtime', dataIndex: 'totalDowntime', width: 120, render: (v: string) => (Number(v) ? `${formatDuration(Number(v))}` : '—') },
  ];

  const mtbfColumns: ColumnsType<ReportsData['mtbfByMachine'][number]> = [
    { title: 'Machine', key: 'machine', render: (_: any, r: ReportsData['mtbfByMachine'][number]) => <Typography.Text strong>{r.machineName || '—'}</Typography.Text> },
    { title: 'Approved Jobs', dataIndex: 'totalJobs', width: 120, render: (v: string) => Number(v) || 0 },
  ];

  const pendingActions = PENDING_ACTIONS.map(a => ({ ...a, count: Number(data?.[a.key as keyof DashboardResponse] ?? 0) }));

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'refresh',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>
            Refresh
          </Button>
        ),
      },
      ...(canReports
        ? [{
            key: 'reports',
            node: (
              <Button icon={<BarChartOutlined />} onClick={() => navigate('/maintenance/reports')}>
                Reports
              </Button>
            ),
          }]
        : []),
      ...(canView
        ? [{
            key: 'view-job-cards',
            node: (
              <Button type="primary" icon={<UnorderedListOutlined />} onClick={() => navigate('/maintenance/job-cards')}>
                View Job Cards
              </Button>
            ),
          }]
        : []),
    ]);
    return () => clearHeaderActions();
  }, [setHeaderActions, clearHeaderActions, load, loading, navigate, canReports, canView]);

  return (
    <div>
      {/* COLLAPSIBLE FILTERS TOOLBAR (matches Job Card List interaction) */}
      <Card styles={{ body: { padding: '16px 24px' } }} style={{ marginBottom: 12 }}>
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
              placeholder="Search job cards, machines, complaints, codes..."
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
                <Select
                  showSearch
                  aria-label="Dashboard Filter Division"
                  placeholder="All Divisions ▼"
                  value={divisionId || ALL}
                  onChange={(v) => onDivisionChange(v === ALL ? undefined : v)}
                  optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...divisions.map(d => ({ value: d.id, label: divisionLabel(d) }))]}
                  style={{ width: '100%', minWidth: 140 }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select
                  showSearch
                  aria-label="Dashboard Filter Section"
                  placeholder="All Sections ▼"
                  value={sectionId || ALL}
                  onChange={(v) => onSectionChange(v === ALL ? undefined : v)}
                  disabled={!divisionId}
                  optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...sections.map(sec => ({ value: sec.id, label: sectionLabel(sec) }))]}
                  style={{ width: '100%', minWidth: 140 }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select
                  showSearch
                  aria-label="Dashboard Filter Department"
                  placeholder="All Departments ▼"
                  value={departmentId || ALL}
                  onChange={(v) => onDepartmentChange(v === ALL ? undefined : v)}
                  disabled={!sectionId}
                  optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...departments.map(d => ({ value: d.id, label: departmentLabel(d) }))]}
                  style={{ width: '100%', minWidth: 140 }}
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={6}>
                <Select
                  showSearch
                  aria-label="Dashboard Filter Machine Number"
                  placeholder="All Machine Numbers ▼"
                  value={machineId || ALL}
                  onChange={(v) => onMachineChange(v === ALL ? undefined : v)}
                  optionFilterProp="label"
                  filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
                  options={[ALL_OPTION, ...machines.map(m => ({ value: m.id, label: machineOptionLabel(m), title: machineOptionLabel(m) }))]}
                  style={{ width: '100%', minWidth: 140 }}
                  suffixIcon={<ScanOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                />
              </Col>
            </Row>
            <Row justify="end" style={{ marginTop: 12 }}>
              <Col>
                <Button type="text" icon={<ClearOutlined />} onClick={clearAllFilters}>Clear Filters</Button>
              </Col>
            </Row>
          </div>
        )}
      </Card>

      {!defaultCompanyId && !loading && (
        <Alert type="warning" showIcon message="No default company" description="No default company is assigned to your account. The dashboard cannot be loaded." style={{ marginTop: 12 }} />
      )}

      {loading && <div style={{ marginTop: 12 }}><LoadingState tip="Loading maintenance dashboard…" /></div>}

      {!loading && error && (
        <Alert
          type="error" showIcon
          message="Maintenance dashboard unavailable"
          description={error}
          action={<Button size="small" onClick={() => void load()}>Retry</Button>}
          style={{ marginTop: 12 }}
        />
      )}

      {!loading && !error && data && (
        <>
          {/* STATUS PIPELINE */}
          <Card size="small" style={{ ...panelCard, marginTop: 12, boxShadow: shadowSm }} styles={{ body: { padding: 12 } }}>
            <div className="maint-pipeline">
              {pipeline.map(q => {
                const color = STATUS_COLORS[q.label] || STATUS_COLORS.ALL;
                return (
                  <button
                    key={q.label}
                    onClick={() => goStatus(q.status)}
                    title={`View ${label(q.label)} job cards`}
                    style={{
                      flexShrink: 0, cursor: 'pointer', border: '1px solid var(--theme-border)', borderRadius: 6, minWidth: 124,
                      padding: '8px 12px 10px', textAlign: 'left', transition: 'all .15s',
                      background: tint(color), borderTop: `3px solid ${color}`,
                      display: 'flex', flexDirection: 'column', gap: 2,
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = shadowHover; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: 'uppercase', letterSpacing: '.02em' }}>{label(q.label)}</span>
                    <span style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.1, color: 'var(--theme-text)' }}>{q.count}</span>
                    {statusTotal > 0 && q.status !== null ? (
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{Math.round((q.count / statusTotal) * 100)}% of workload</span>
                    ) : statusTotal > 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{statusTotal} total</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* KPI GRID */}
          <div className="maint-kpi-grid" style={{ marginTop: 12 }}>
            <KpiCard label="Total Job Cards" value={data.total} icon={<BuildOutlined />} color={STATUS_COLORS.ALL} onClick={() => goStatus(null)} />
            <KpiCard label="Open" value={data.open} icon={<ExclamationCircleOutlined />} color={STATUS_COLORS.OPEN} onClick={() => goStatus('OPEN')} />
            <KpiCard label="In Progress" value={data.inProgress} icon={<ClockCircleOutlined />} color={STATUS_COLORS.IN_PROGRESS} onClick={() => goStatus('IN_PROGRESS')} />
            <KpiCard label="On Hold" value={data.onHold} icon={<PauseCircleOutlined />} color={STATUS_COLORS.ON_HOLD} onClick={() => goStatus('ON_HOLD')} />
            <KpiCard label="Waiting for Parts" value={data.waitingForParts} icon={<WarningOutlined />} color={STATUS_COLORS.WAITING_FOR_PARTS} onClick={() => goStatus('WAITING_FOR_PARTS')} />
            <KpiCard label="Assigned" value={data.assigned} icon={<ToolOutlined />} color={STATUS_COLORS.ASSIGNED} onClick={() => goStatus('ASSIGNED')} />
            <KpiCard label="Completed" value={data.completed} icon={<CheckCircleOutlined />} color={STATUS_COLORS.COMPLETED} onClick={() => goStatus('COMPLETED')} />
            <KpiCard label="Pending Verification" value={data.pendingVerification} icon={<ScheduleOutlined />} color={STATUS_COLORS.PENDING_VERIFICATION} onClick={() => goStatus('PENDING_VERIFICATION')} />
            <KpiCard label="Verified" value={data.verified} icon={<CheckCircleOutlined />} color={STATUS_COLORS.VERIFIED} onClick={() => goStatus('VERIFIED')} />
            <KpiCard label="Approved" value={data.approved} icon={<CheckCircleOutlined />} color={STATUS_COLORS.APPROVED} onClick={() => goStatus('APPROVED')} />
            <KpiCard label="Rejected" value={data.rejected} icon={<CloseCircleOutlined />} color={STATUS_COLORS.REJECTED} onClick={() => goStatus('REJECTED')} />
            <KpiCard label="Cancelled" value={data.cancelled} icon={<MinusCircleOutlined />} color={STATUS_COLORS.CANCELLED} onClick={() => goStatus('CANCELLED')} />
            <KpiCard label="Closed" value={data.closed} icon={<CheckCircleOutlined />} color="#595959" onClick={() => goStatus('CLOSED')} />
            <KpiCard label="Critical / Priority" value={data.critical} icon={<WarningOutlined />} color="#cf1322" suffix="active" />
            <KpiCard
              label="MTTR"
              value={metricValue(chartData?.mttrMinutes)}
              icon={<ToolOutlined />}
              color="#1890ff"
              hint="Mean Time To Repair — average active repair duration for completed repair jobs (active IN_PROGRESS segments, excluding ON HOLD / WAITING FOR PARTS)."
            />
            <KpiCard
              label="MTBF"
              value={metricValue(chartData?.mtbfMinutes)}
              icon={<ClockCircleOutlined />}
              color="#722ed1"
              hint="Mean Time Between Failures — average interval between consecutive breakdown occurrence events on the same machine."
            />
            <KpiCard
              label="MPBF"
              value={metricValue(chartData?.mpbfMinutes)}
              icon={<ThunderboltOutlined />}
              color="#13c2c2"
              hint="Mean Period Between Failures — average interval between consecutive breakdown completion events on the same machine."
            />
            <KpiCard
              label="Availability %"
              value={formatPct(chartData?.availabilityPercent)}
              icon={<RiseOutlined />}
              color="#52c41a"
              hint="Equipment availability = (observed window − unplanned downtime) ÷ observed window × 100. Uses the real observed data interval; no production calendar exists, so this is the mathematically defensible availability."
            />
            <KpiCard
              label="Total Downtime"
              value={metricValue(chartData?.totalDowntimeMinutes)}
              icon={<ClockCircleOutlined />}
              color="#fa541c"
              hint={`Total unplanned equipment downtime. Planned: ${metricValue(chartData?.plannedDowntimeMinutes)} | Unplanned: ${metricValue(chartData?.unplannedDowntimeMinutes)}`}
            />
            <KpiCard
              label="Breakdown Count"
              value={kpiNumber(chartData?.breakdownJobs)}
              icon={<WarningOutlined />}
              color="#cf1322"
              hint="Number of breakdown / emergency / corrective maintenance events in the selected scope."
            />
            <KpiCard
              label="PM Compliance %"
              value={formatPct(chartData?.pmCompliancePercent)}
              icon={<ScheduleOutlined />}
              color="#faad14"
              hint="Preventive maintenance compliance = completed on-time PMs ÷ total scheduled PMs × 100, from real PM schedule dates and completion status."
            />
            <KpiCard
              label="PM Overdue"
              value={kpiNumber(chartData?.pmOverdue)}
              icon={<CalendarOutlined />}
              color="#d4380d"
              hint="Number of preventive maintenance schedules whose scheduled date has passed but are not yet completed."
            />
            <KpiCard
              label="Open Work Orders"
              value={kpiNumber(chartData?.openJobs)}
              icon={<BuildOutlined />}
              color="#1890ff"
              hint="Job cards not yet in a terminal status (not COMPLETED / APPROVED / CLOSED / REJECTED / CANCELLED). No overdue field exists — there is no due-date column on job cards."
            />
            <KpiCard
              label="Maintenance Cost"
              value={formatMoney(chartData?.maintenanceCost)}
              icon={<DollarOutlined />}
              color="#2f9e44"
              hint="Total cost of spare parts consumed for maintenance (sum of total_cost on job card parts). Labour cost is not currently tracked."
            />
          </div>

          {/* PENDING ACTIONS + ANALYTICS */}
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} lg={8}>
              <PanelSection title="Pending Actions">
                {pendingActions.every(a => a.count === 0) ? (
                  <Text type="secondary">No jobs currently need attention.</Text>
                ) : (
                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                    {pendingActions.filter(a => a.count > 0).map(a => (
                      <button
                        key={a.status}
                        onClick={() => goStatus(a.status)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer',
                          border: '1px solid var(--theme-border)', borderRadius: 4, background: 'var(--theme-surface)', padding: '8px 10px',
                          textAlign: 'left', transition: 'border-color .15s, box-shadow .15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = shadowSm; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--theme-border)'; e.currentTarget.style.boxShadow = 'none'; }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 4, background: tint(a.color), color: a.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{a.icon}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)' }}>{a.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{a.description}</div>
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: a.color }}>{a.count}</div>
                        <RightOutlined style={{ color: 'var(--theme-text-muted)', flexShrink: 0 }} />
                      </button>
                    ))}
                  </Space>
                )}
              </PanelSection>
            </Col>

            <Col xs={24} lg={8}>
              <PanelSection title="Maintenance Type Analysis">
                {renderChartDist((chartData?.typeBreakdown || []).map(i => ({ label: i.type, count: parseInt(i.count, 10), color: TYPE_COLORS[i.type] || '#8c8c8c' })), data.total)}
              </PanelSection>
            </Col>

            <Col xs={24} lg={8}>
              <PanelSection title="Priority Analysis">
                {renderChartDist((chartData?.priorityBreakdown || []).map(i => ({ label: i.priority, count: parseInt(i.count, 10), color: PRIORITY_COLORS[i.priority] || '#8c8c8c' })), priorityTotal)}
              </PanelSection>
            </Col>
          </Row>

          {/* DOWNTIME / TIMING BREAKDOWN */}
          <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} lg={8}>
              <PanelSection title="Downtime Breakdown" extra={<Tooltip title="Total downtime = planned (preventive / inspection) + unplanned (breakdown / emergency / corrective). Active repair excludes waiting for parts and on-hold time."><InfoCircleOutlined style={{ color: 'var(--theme-text-muted)', cursor: 'help' }} /></Tooltip>}>
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong><Tag color="blue" style={{ marginRight: 4 }}>Planned</Tag>Preventive / Inspection</Text>
                    <Text>{metricValue(chartData?.plannedDowntimeMinutes)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong><Tag color="red" style={{ marginRight: 4 }}>Unplanned</Tag>Breakdown / Emergency</Text>
                    <Text>{metricValue(chartData?.unplannedDowntimeMinutes)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong>Active Repair</Text>
                    <Text>{metricValue(chartData?.activeRepairMinutes)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong>Waiting for Parts</Text>
                    <Text>{metricValue(chartData?.waitingMinutes)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong>On Hold</Text>
                    <Text>{metricValue(chartData?.onHoldMinutes)}</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--theme-surface-alt)', borderRadius: 4 }}>
                    <Text strong>Total Downtime</Text>
                    <Text>{metricValue(chartData?.totalDowntimeMinutes)}</Text>
                  </div>
                </Space>
              </PanelSection>
            </Col>
            <Col xs={24} lg={8}>
              <PanelSection title="Downtime Trend (Monthly)" extra={<Tooltip title="Planned vs unplanned downtime by month from real job-card downtime records."><InfoCircleOutlined style={{ color: 'var(--theme-text-muted)', cursor: 'help' }} /></Tooltip>}>
                {renderTrend(chartData?.downtimeTrend)}
              </PanelSection>
            </Col>
            <Col xs={24} lg={8}>
              <PanelSection title="Breakdown & MTTR Trend (Monthly)">
                {renderBreakdownMttrTrend(chartData?.breakdownTrend, chartData?.mttrTrend)}
              </PanelSection>
            </Col>
          </Row>

          {/* OPERATIONS / PERFORMANCE */}
          {canReports && reportsData && (reportsData.topProblemMachines?.length > 0 || reportsData.downtimeByType?.length > 0 || reportsData.mtbfByMachine?.length > 0) && (
            <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} lg={10}>
                <PanelSection
                  title="Top Problem Machines"
                  extra={<Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate('/maintenance/reports')}>Full report</Button>}
                >
                  <Table rowKey="machineId" columns={topProblemColumns} dataSource={reportsData.topProblemMachines || []} pagination={false} size="small" scroll={{ x: 420 }} />
                </PanelSection>
              </Col>
              <Col xs={24} lg={7}>
                <PanelSection title="Downtime by Type">
                  <Table rowKey="type" columns={downtimeByTypeColumns} dataSource={reportsData.downtimeByType || []} pagination={false} size="small" scroll={{ x: 360 }} />
                </PanelSection>
              </Col>
              <Col xs={24} lg={7}>
                <PanelSection title="MTBF by Machine (Approved)">
                  {reportsData.mtbfByMachine?.length ? (
                    <Table rowKey="machineId" columns={mtbfColumns} dataSource={reportsData.mtbfByMachine || []} pagination={false} size="small" scroll={{ x: 280 }} />
                  ) : (
                    <Text type="secondary">Not enough approved job data to compute MTBF.</Text>
                  )}
                </PanelSection>
              </Col>
            </Row>
          )}

          {/* MONTHLY MAINTENANCE TREND */}
          {chartData?.monthlyTrend && chartData.monthlyTrend.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <PanelSection title="Monthly Maintenance Trend (12 Months)">
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--theme-border)' }}>Month</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--theme-border)' }}>Total</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--theme-border)' }}>Approved</th>
                        <th style={{ textAlign: 'right', padding: '6px 8px', borderBottom: '1px solid var(--theme-border)' }}>Breakdowns</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.monthlyTrend.map(m => (
                        <tr key={m.month}>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--theme-border)' }}>{m.month}</td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--theme-border)', textAlign: 'right' }}><Tag>{m.count}</Tag></td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--theme-border)', textAlign: 'right' }}><Tag color="green">{m.completed || 0}</Tag></td>
                          <td style={{ padding: '6px 8px', borderBottom: '1px solid var(--theme-border)', textAlign: 'right' }}><Tag color="red">{m.breakdowns || 0}</Tag></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </PanelSection>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MaintenanceDashboard;
