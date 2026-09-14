import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Tooltip } from 'antd';
import {
  AuditOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeploymentUnitOutlined,
  DownOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  HourglassOutlined,
  InfoCircleOutlined,
  LineChartOutlined,
  PieChartOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  UpOutlined,
  UserOutlined,
  WalletOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import {
  ChartLegend,
  EmptyState,
  fmtQty,
  SkeletonChart,
  SkeletonKpi,
  TooltipCard,
  TooltipRow,
} from '../../components/dashboard/dashboardShared';
import apiService from '../../services/api';
import { describeRequestError } from '../../services/api';
import { fetchHrDashboard } from '../../services/hrDashboardService';
import type { HrDashboardData, HrTrendDay } from '../../services/hrDashboardService';
import { useUserStore } from '../../store/userStore';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const TREND_DAYS = 30;

const DEPT_COLORS = [
  'var(--theme-info)',
  'var(--theme-success)',
  'var(--theme-warning)',
  'var(--theme-danger)',
  'var(--theme-icon-violet)',
  'var(--theme-icon-cyan)',
  'var(--theme-icon-orange)',
  'var(--theme-icon-indigo)',
];

type HrTone = 'info' | 'success' | 'danger' | 'warning' | 'muted';

interface RefKpiConfig {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone: HrTone;
  link?: string;
}

const RefKpiCard: React.FC<{ card: RefKpiConfig }> = ({ card }) => {
  const navigate = useNavigate();
  const link = card.link;
  const onClick = link ? () => navigate(link) : undefined;
  return (
    <div
      className={`erp-ref-kpi erp-ref-kpi--${card.tone}${link ? ' erp-ref-kpi--link' : ''}`}
      onClick={onClick}
      role={link ? 'button' : undefined}
      tabIndex={link ? 0 : undefined}
      onKeyDown={
        link
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      data-testid={`hr-kpi-${card.key}`}
    >
      <div className="erp-ref-kpi__body">
        <span className="erp-ref-kpi__label">{card.label}</span>
        <span className="erp-ref-kpi__value">{card.value}</span>
      </div>
      <span className="erp-ref-kpi__icon" aria-hidden="true">{card.icon}</span>
      <div className="erp-ref-kpi__footer">
        <InfoCircleOutlined className="erp-ref-kpi__footer-icon" aria-hidden="true" />
        <span className="erp-ref-kpi__footer-text">More info</span>
      </div>
    </div>
  );
};

interface SecCardConfig {
  key: string;
  title: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  tone: HrTone;
}

const SecCard: React.FC<{ card: SecCardConfig }> = ({ card }) => (
  <div className={`erp-ref-sec erp-ref-sec--${card.tone}`} data-testid={`hr-sec-${card.key}`}>
    <span className="erp-ref-sec__icon" aria-hidden="true">{card.icon}</span>
    <div className="erp-ref-sec__body">
      <span className="erp-ref-sec__label">{card.title}</span>
      <span className="erp-ref-sec__value">{card.value}</span>
      {card.sub && <span className="erp-ref-sec__sub">{card.sub}</span>}
    </div>
  </div>
);

interface ChartPanelProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  collapsed?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}

const ChartPanel: React.FC<ChartPanelProps> = ({ icon, title, subtitle, collapsed, onToggle, children }) => (
  <section className="erp-ref-panel" data-testid={`hr-panel-${title}`}>
    <header className="erp-ref-panel__head">
      <div className="erp-ref-panel__title-group">
        <span className="erp-ref-panel__icon" aria-hidden="true">{icon}</span>
        <div className="erp-ref-panel__titling">
          <h3 className="erp-ref-panel__title">{title}</h3>
          <span className="erp-ref-panel__sub">{subtitle}</span>
        </div>
      </div>
      {onToggle && (
        <Button
          type="text"
          size="small"
          className="erp-ref-panel__toggle"
          icon={collapsed ? <DownOutlined /> : <UpOutlined />}
          onClick={onToggle}
          aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
        />
      )}
    </header>
    {!collapsed && <div className="erp-ref-panel__body">{children}</div>}
  </section>
);

interface ShiftInfo {
  id: string;
  shiftCode: string;
  shiftName: string;
  startTime: string | null;
  endTime: string | null;
  status?: string;
}

function toMinutes(value: string): number {
  const [h = '0', m = '0'] = value.split(':');
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

function formatClock(value: string | null): string {
  if (!value) return '--:--';
  const [h, m] = value.split(':');
  return `${h}:${m}`;
}

function computeCurrentShift(shifts: ShiftInfo[]): ShiftInfo | null {
  const active = shifts
    .filter((s) => (s.status ?? 'ACTIVE') === 'ACTIVE' && s.startTime && s.endTime)
    .sort((a, b) => toMinutes(a.startTime as string) - toMinutes(b.startTime as string));
  if (active.length === 0) return null;

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const covering = active.find((s) => {
    const st = toMinutes(s.startTime as string);
    const et = toMinutes(s.endTime as string);
    return et > st ? nowMin >= st && nowMin < et : nowMin >= st || nowMin < et;
  });
  if (covering) return covering;

  const latestStarted = active.reduce<ShiftInfo | null>((acc, s) => {
    const st = toMinutes(s.startTime as string);
    if (st <= nowMin && (!acc || st > toMinutes(acc.startTime as string))) return s;
    return acc;
  }, null);
  return latestStarted ?? active[0];
}

const HrDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HrDashboardData | null>(null);
  const [shifts, setShifts] = useState<ShiftInfo[]>([]);
  const [shiftsError, setShiftsError] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const user = useUserStore((s) => s.user);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHrDashboard(undefined, TREND_DAYS);
      setData(result);
    } catch (err) {
      setData(null);
      setError(describeRequestError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const companyId = user?.defaultCompanyId;
    if (!companyId) return;
    let cancelled = false;
    apiService
      .get<{ success: boolean; data: ShiftInfo[] }>('/hr/shifts', { companyId })
      .then((res) => {
        if (!cancelled) setShifts(res?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setShiftsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.defaultCompanyId]);

  const togglePanel = useCallback((key: string) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const kpi = data?.kpi;
  const onTimeToday = Math.max(0, (kpi?.presentToday ?? 0) - (kpi?.lateToday ?? 0));

  const deptData = (data?.employeesByDepartment ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({ name: b.name || 'Unassigned', value: b.count }));
  const deptTotal = deptData.reduce((sum, d) => sum + d.value, 0);

  const kpiCards: RefKpiConfig[] = kpi
    ? [
        { key: 'attendance', label: 'Attendance Today', value: fmtQty(kpi.presentToday), icon: <CheckCircleOutlined />, tone: 'success', link: '/hr/attendance-register' },
        { key: 'ontime', label: 'On Time Today', value: fmtQty(onTimeToday), icon: <ClockCircleOutlined />, tone: 'success', link: '/hr/attendance-register' },
        { key: 'late', label: 'Late Today', value: fmtQty(kpi.lateToday), icon: <FieldTimeOutlined />, tone: 'danger', link: '/hr/attendance-register?status=LATE' },
        { key: 'leave', label: 'On Leave Today', value: fmtQty(kpi.onLeaveToday), icon: <CalendarOutlined />, tone: 'warning', link: '/hr/leaves' },
        { key: 'absent', label: 'Absent Today', value: fmtQty(kpi.absentToday), icon: <WarningOutlined />, tone: 'danger', link: '/hr/attendance-register?status=ABSENT' },
        { key: 'pending', label: 'Pending Approvals', value: fmtQty(kpi.pendingApprovals), icon: <AuditOutlined />, tone: 'warning', link: '/hr/leaves' },
        { key: 'total', label: 'Total Employees', value: fmtQty(kpi.totalEmployees), icon: <TeamOutlined />, tone: 'info', link: '/hr/employees' },
        { key: 'active', label: 'Active Employees', value: fmtQty(kpi.activeEmployees), icon: <UserOutlined />, tone: 'success', link: '/hr/employees' },
        { key: 'outofzone', label: 'Out of Zone Today', value: fmtQty(kpi.outOfZone), icon: <EnvironmentOutlined />, tone: 'muted' },
        { key: 'docsexp', label: 'Documents Expiring', value: fmtQty(kpi.documentsExpiring), icon: <FileTextOutlined />, tone: 'muted' },
        { key: 'depts', label: 'Departments', value: fmtQty(deptData.length), icon: <DeploymentUnitOutlined />, tone: 'info', link: '/hr/employees' },
      ]
    : [];

  const currentShift = computeCurrentShift(shifts);

  const secCards: SecCardConfig[] = kpi
    ? [
        {
          key: 'shift',
          title: 'Current Shift',
          value: currentShift ? `${currentShift.shiftCode} · ${currentShift.shiftName}` : shiftsError ? 'Unavailable' : '—',
          sub: currentShift
            ? `${formatClock(currentShift.startTime)} – ${formatClock(currentShift.endTime)}`
            : shiftsError
              ? 'shifts could not be loaded'
              : shifts.length === 0
                ? 'no shift configured'
                : 'no shift active now',
          icon: <ThunderboltOutlined />,
          tone: 'info',
        },
        {
          key: 'leaves',
          title: 'Leaves Pending',
          value: fmtQty(kpi.pendingApprovals),
          sub: 'leave requests awaiting approval',
          icon: <HourglassOutlined />,
          tone: 'warning',
        },
        {
          key: 'advances',
          title: 'Advances Pending',
          value: '0',
          sub: 'not tracked yet',
          icon: <WalletOutlined />,
          tone: 'muted',
        },
        {
          key: 'docsexpiring',
          title: 'Docs Expiring',
          value: fmtQty(kpi.documentsExpiring),
          sub: 'no expiry dates on file',
          icon: <FileTextOutlined />,
          tone: 'muted',
        },
      ]
    : [];

  const trendRows: Array<{
    date: string;
    fullDate: string;
    Present: number;
    Late: number;
    OnLeave: number;
    Absent: number;
    OnTime: number;
  }> = (data?.attendanceTrend ?? []).map((t: HrTrendDay) => {
    const d = new Date(`${t.date}T00:00:00`);
    return {
      date: Number.isNaN(d.getTime()) ? t.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: t.date,
      Present: t.present,
      Late: t.late,
      OnLeave: t.onLeave,
      Absent: t.absent,
      OnTime: Math.max(0, t.present - t.late),
    };
  });
  const hasTrend = trendRows.some((r) => r.Present > 0 || r.Late > 0 || r.OnLeave > 0 || r.Absent > 0);
  const hasOnTimeSeries = trendRows.some((r) => r.OnTime > 0 || r.Late > 0);
  const tickInterval = Math.max(0, Math.ceil(trendRows.length / 7) - 1);

  const splitData = (data?.attendanceTrend ?? []).reduce(
    (acc, t) => {
      acc.present += t.present;
      acc.late += t.late;
      acc.absent += t.absent;
      acc.leave += t.onLeave;
      return acc;
    },
    { present: 0, late: 0, absent: 0, leave: 0 },
  );
  const splitRows = [
    { name: 'Present', value: splitData.present },
    { name: 'Late', value: splitData.late },
    { name: 'Absent', value: splitData.absent },
    { name: 'On Leave', value: splitData.leave },
  ].filter((r) => r.value > 0);
  const splitTotal = splitRows.reduce((sum, r) => sum + r.value, 0);

  const notes = data?.notes
    ? [
        data.notes.lateToday === 'DERIVED' ? 'Late / On Time figures derive from recorded check-in vs each employee\u2019s assigned shift start time.' : null,
        data.notes.outOfZone === 'UNSUPPORTED' ? 'Out of Zone shows 0 — no geo-location tracking exists in the HR module yet.' : null,
        data.notes.documentsExpiring === 'UNSUPPORTED' ? 'Documents Expiring shows 0 — employee documents carry no expiry dates yet.' : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <div className="erp-dashboard">
      <PageHeader icon={<TeamOutlined />} title="HR Dashboard" subtitle="Attendance & workforce overview" />

      {error && (
        <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />
      )}

      {loading && !data ? (
        <>
          <div className="erp-hr-dash-kpi-grid">
            <SkeletonKpi count={11} />
          </div>
          <div className="erp-hr-sec-grid">
            <SkeletonKpi count={4} />
          </div>
          <div className="erp-hr-chart-grid">
            <SkeletonChart height={200} />
            <SkeletonChart height={200} />
            <SkeletonChart height={200} />
            <SkeletonChart height={200} />
          </div>
        </>
      ) : (
        <>
          {kpiCards.length > 0 && (
            <div className="erp-hr-dash-kpi-grid" aria-label="HR key performance indicators">
              {kpiCards.map((card) => <RefKpiCard key={card.key} card={card} />)}
            </div>
          )}

          {secCards.length > 0 && (
            <div className="erp-hr-sec-grid" aria-label="HR status">
              {secCards.map((card) => <SecCard key={card.key} card={card} />)}
            </div>
          )}

          {notes.length > 0 && (
            <Alert type="info" showIcon message="Metric notes" description={notes.join(' ')} className="erp-alert-bar" />
          )}

          <div className="erp-hr-chart-grid">
            <ChartPanel
              icon={<LineChartOutlined />}
              title="Attendance Trend"
              subtitle={`Last ${TREND_DAYS} Days`}
              collapsed={collapsed['trend']}
              onToggle={() => togglePanel('trend')}
            >
              {hasTrend ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendRows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'var(--theme-chart-axis)' }}
                      axisLine={{ stroke: 'var(--theme-border)' }}
                      tickLine={false}
                      interval={tickInterval}
                      tickMargin={4}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--theme-chart-axis)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={30}
                    />
                    <ChartTooltip
                      cursor={{ stroke: 'var(--theme-border-strong)', strokeDasharray: '3 3' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as (typeof trendRows)[number];
                        return (
                          <TooltipCard title={row?.fullDate ?? label}>
                            <TooltipRow color="var(--theme-success)" label="Present" value={fmtQty(row.Present)} />
                            <TooltipRow color="var(--theme-danger)" label="Late" value={fmtQty(row.Late)} />
                            <TooltipRow color="var(--theme-warning)" label="On Leave" value={fmtQty(row.OnLeave)} />
                            <TooltipRow color="var(--theme-text-muted)" label="Absent" value={fmtQty(row.Absent)} />
                          </TooltipCard>
                        );
                      }}
                    />
                    <Legend content={<ChartLegend />} />
                    <Line type="monotone" dataKey="Present" stroke="var(--theme-success)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="OnLeave" name="On Leave" stroke="var(--theme-warning)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="Absent" stroke="var(--theme-text-muted)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="Late" stroke="var(--theme-danger)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={<LineChartOutlined />}
                  title="No attendance records in this period"
                  desc="The trend appears once daily attendance is recorded"
                />
              )}
            </ChartPanel>

            <ChartPanel
              icon={<ClockCircleOutlined />}
              title="On-Time vs. Late"
              subtitle={`Last ${TREND_DAYS} Days`}
              collapsed={collapsed['ontime']}
              onToggle={() => togglePanel('ontime')}
            >
              {hasOnTimeSeries ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendRows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: 'var(--theme-chart-axis)' }}
                      axisLine={{ stroke: 'var(--theme-border)' }}
                      tickLine={false}
                      interval={tickInterval}
                      tickMargin={4}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: 'var(--theme-chart-axis)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                      width={30}
                    />
                    <ChartTooltip
                      cursor={{ stroke: 'var(--theme-border-strong)', strokeDasharray: '3 3' }}
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0]?.payload as (typeof trendRows)[number];
                        return (
                          <TooltipCard title={row?.fullDate ?? label}>
                            <TooltipRow color="var(--theme-success)" label="On Time" value={fmtQty(row.OnTime)} />
                            <TooltipRow color="var(--theme-danger)" label="Late" value={fmtQty(row.Late)} />
                          </TooltipCard>
                        );
                      }}
                    />
                    <Legend content={<ChartLegend />} />
                    <Line type="monotone" dataKey="OnTime" name="On Time" stroke="var(--theme-success)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="Late" stroke="var(--theme-danger)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={<ClockCircleOutlined />}
                  title="No check-in data yet"
                  desc="On-time vs. late appears once check-ins are recorded"
                />
              )}
            </ChartPanel>

            <ChartPanel
              icon={<PieChartOutlined />}
              title="Attendance Split"
              subtitle={`Last ${TREND_DAYS} Days`}
              collapsed={collapsed['split']}
              onToggle={() => togglePanel('split')}
            >
              {splitRows.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={splitRows}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={72}
                        innerRadius={36}
                        paddingAngle={1}
                      >
                        {splitRows.map((entry, i) => (
                          <Cell key={entry.name} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const entry = payload[0]?.payload as { name: string; value: number };
                          return (
                            <TooltipCard title={entry?.name}>
                              <TooltipRow label="Records" value={fmtQty(entry?.value ?? 0)} />
                            </TooltipCard>
                          );
                        }}
                      />
                      <Legend content={<ChartLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="erp-hr-dept-total">
                    {splitTotal.toLocaleString('en-US')} attendance records across {splitRows.length} status{splitRows.length === 1 ? '' : 'es'}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<PieChartOutlined />}
                  title="No attendance data"
                  desc="The status split appears once attendance is recorded"
                />
              )}
            </ChartPanel>

            <ChartPanel
              icon={<TeamOutlined />}
              title="Workforce by Department"
              subtitle="head count"
              collapsed={collapsed['depts']}
              onToggle={() => togglePanel('depts')}
            >
              {deptData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={deptData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={72}
                        innerRadius={36}
                        paddingAngle={1}
                      >
                        {deptData.map((entry, i) => (
                          <Cell key={entry.name} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />
                        ))}
                      </Pie>
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const entry = payload[0]?.payload as { name: string; value: number };
                          return (
                            <TooltipCard title={entry?.name}>
                              <TooltipRow label="Employees" value={fmtQty(entry?.value ?? 0)} />
                            </TooltipCard>
                          );
                        }}
                      />
                      <Legend content={<ChartLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="erp-hr-dept-total">
                    {deptTotal.toLocaleString('en-US')} employees across {deptData.length} department{deptData.length === 1 ? '' : 's'}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={<TeamOutlined />}
                  title="No employee data"
                  desc="Department distribution appears once employees are registered"
                />
              )}
            </ChartPanel>
          </div>

          <div className="erp-hr-footer-links">
            <Tooltip title="Open the attendance register">
              <Button type="link" size="small" onClick={() => navigate('/hr/attendance-register')}>
                Attendance Register
              </Button>
            </Tooltip>
            <Tooltip title="Review leave requests">
              <Button type="link" size="small" onClick={() => navigate('/hr/leaves')}>
                Leave Requests
              </Button>
            </Tooltip>
            <Tooltip title="Open employee master">
              <Button type="link" size="small" onClick={() => navigate('/hr/employees')}>
                Employee Master
              </Button>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
};

export default HrDashboard;