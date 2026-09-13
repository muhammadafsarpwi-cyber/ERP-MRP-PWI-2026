import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Select, Space, Tooltip } from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  FileTextOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
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
import PageHeader from '../../components/shared/PageHeader';
import {
  ChartLegend,
  EmptyState,
  fmtQty,
  SectionCard,
  SkeletonChart,
  SkeletonKpi,
  TooltipCard,
  TooltipRow,
} from '../../components/dashboard/dashboardShared';
import dashboardService from '../../services/dashboardService';
import type { FilterOption } from '../../services/dashboardService';
import { describeRequestError } from '../../services/api';
import { fetchHrDashboard } from '../../services/hrDashboardService';
import type { HrDashboardData, HrDashboardFilters, HrTrendDay } from '../../services/hrDashboardService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const TREND_PERIODS = [7, 14, 30, 60, 90];

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

interface KpiCardData {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: React.ReactNode;
  detail?: string;
}

const KpiCard: React.FC<{ kpi: KpiCardData }> = ({ kpi }) => (
  <div className={`erp-kpi-card erp-kpi-card--${kpi.tone}`}>
    <span className="erp-kpi-card__icon">{kpi.icon}</span>
    <div className="erp-kpi-card__body">
      <span className="erp-kpi-card__label">{kpi.label}</span>
      <span className="erp-kpi-card__value">{kpi.value}</span>
      {kpi.detail && <span className="erp-kpi-card__detail">{kpi.detail}</span>}
    </div>
  </div>
);

interface TrendRow {
  date: string;
  fullDate: string;
  Present: number;
  Late: number;
  OnLeave: number;
  Absent: number;
}

const HrDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HrDashboardData | null>(null);

  const [optionsLoading, setOptionsLoading] = useState(false);
  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [sections, setSections] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState<HrDashboardFilters>({});
  const [applied, setApplied] = useState<HrDashboardFilters>({});

  const loadOptions = useCallback(async () => {
    setOptionsLoading(true);
    try {
      const [d, s, dp] = await Promise.all([
        dashboardService.getFilterDivisions(),
        dashboardService.getFilterSections(),
        dashboardService.getFilterDepartments(),
      ]);
      setDivisions(d.data);
      setSections(s.data);
      setDepartments(dp.data);
    } catch (err) {
      setError(describeRequestError(err));
    } finally {
      setOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const load = useCallback(async (filters: HrDashboardFilters, period: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchHrDashboard(filters, period);
      setData(result);
    } catch (err) {
      setData(null);
      setError(describeRequestError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(applied, days);
  }, [load, applied, days]);

  const onDivisionChange = (value?: string) => {
    const next = { ...draft, divisionId: value, sectionId: undefined, departmentId: undefined };
    setDraft(next);
    if (value) {
      dashboardService.getFilterSections(value).then((r) => setSections(r.data)).catch(() => setSections([]));
      dashboardService.getFilterDepartments(value).then((r) => setDepartments(r.data)).catch(() => setDepartments([]));
    }
  };

  const onSectionChange = (value?: string) => {
    const next = { ...draft, sectionId: value, departmentId: undefined };
    setDraft(next);
    if (value) {
      dashboardService.getFilterDepartments(draft.divisionId, value).then((r) => setDepartments(r.data)).catch(() => setDepartments([]));
    }
  };

  const onApply = () => {
    setApplied({ ...draft });
  };

  const onReset = () => {
    setDraft({});
    setApplied({});
    setDays(30);
  };

  const hasDraftChanges =
    draft.divisionId !== applied.divisionId ||
    draft.sectionId !== applied.sectionId ||
    draft.departmentId !== applied.departmentId;

  const kpi = data?.kpi;
  const kpis: KpiCardData[] = kpi
    ? [
        { key: 'total', icon: <TeamOutlined />, tone: 'info', label: 'Total Employees', value: fmtQty(kpi.totalEmployees) },
        { key: 'active', icon: <UserOutlined />, tone: 'success', label: 'Active Employees', value: fmtQty(kpi.activeEmployees), detail: 'status = ACTIVE' },
        { key: 'present', icon: <CheckCircleOutlined />, tone: 'success', label: 'Present Today', value: fmtQty(kpi.presentToday), detail: `as of ${data?.asOf ?? 'today'}` },
        { key: 'late', icon: <FieldTimeOutlined />, tone: 'danger', label: 'Late Today', value: fmtQty(kpi.lateToday), detail: 'derived from check-in vs shift' },
        { key: 'absent', icon: <WarningOutlined />, tone: 'danger', label: 'Absent Today', value: fmtQty(kpi.absentToday) },
        { key: 'leave', icon: <CalendarOutlined />, tone: 'warning', label: 'On Leave Today', value: fmtQty(kpi.onLeaveToday) },
        { key: 'pending', icon: <ClockCircleOutlined />, tone: 'warning', label: 'Pending Approvals', value: fmtQty(kpi.pendingApprovals), detail: 'leave requests' },
        { key: 'outOfZone', icon: <EnvironmentOutlined />, tone: 'muted', label: 'Out of Zone', value: fmtQty(kpi.outOfZone), detail: 'not tracked yet' },
        { key: 'docsExpiring', icon: <FileTextOutlined />, tone: 'muted', label: 'Docs Expiring', value: fmtQty(kpi.documentsExpiring), detail: 'not tracked yet' },
      ]
    : [];

  const trendRows: TrendRow[] = (data?.attendanceTrend ?? []).map((t: HrTrendDay) => {
    const d = new Date(`${t.date}T00:00:00`);
    return {
      date: Number.isNaN(d.getTime()) ? t.date : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullDate: t.date,
      Present: t.present,
      Late: t.late,
      OnLeave: t.onLeave,
      Absent: t.absent,
    };
  });
  const hasTrend = trendRows.some((r) => r.Present > 0 || r.Late > 0 || r.OnLeave > 0 || r.Absent > 0);
  const tickInterval = Math.max(0, Math.ceil(trendRows.length / 7) - 1);

  const deptData = (data?.employeesByDepartment ?? [])
    .filter((b) => b.count > 0)
    .map((b) => ({ name: b.name || 'Unassigned', value: b.count }));
  const deptTotal = deptData.reduce((sum, d) => sum + d.value, 0);

  const notes = data?.notes
    ? [
        data.notes.lateToday === 'DERIVED' ? 'Late Today is derived from recorded check-in time vs the assigned shift start time.' : null,
        data.notes.outOfZone === 'UNSUPPORTED' ? 'Out of Zone shows 0 — no geo-location tracking exists in the HR module yet.' : null,
        data.notes.documentsExpiring === 'UNSUPPORTED' ? 'Documents Expiring shows 0 — employee documents carry no expiry dates yet.' : null,
      ].filter((x): x is string => Boolean(x))
    : [];

  return (
    <div className="erp-dashboard">
      <PageHeader icon={<TeamOutlined />} title="HR Dashboard" subtitle="Attendance & workforce overview" />

      <section className="erp-filter-bar" aria-label="HR dashboard filters">
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <FilterOutlined aria-hidden="true" /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <Select
              placeholder="Period"
              allowClear
              size="small"
              className="erp-filter-select"
              value={days}
              onChange={setDays}
              options={TREND_PERIODS.map((d) => ({ value: d, label: `Last ${d} days` }))}
            />
            <Select
              placeholder="Division"
              allowClear
              size="small"
              loading={optionsLoading}
              className="erp-filter-select"
              value={draft.divisionId}
              onChange={onDivisionChange}
              options={divisions.map((d) => ({ value: d.id, label: `${d.divisionCode ?? ''} ${d.name}` }))}
            />
            <Select
              placeholder="Section"
              allowClear
              size="small"
              loading={optionsLoading}
              className="erp-filter-select"
              value={draft.sectionId}
              onChange={onSectionChange}
              options={sections.map((s) => ({ value: s.id, label: s.name }))}
              disabled={!draft.divisionId && sections.length === 0}
            />
            <Select
              placeholder="Department"
              allowClear
              size="small"
              loading={optionsLoading}
              className="erp-filter-select"
              value={draft.departmentId}
              onChange={(v) => setDraft((p) => ({ ...p, departmentId: v }))}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              disabled={!draft.divisionId && !draft.sectionId && departments.length === 0}
            />
          </div>
          <div className="erp-filter-bar__actions">
            <Space size={6}>
              <Button
                type="primary"
                size="small"
                icon={<SearchOutlined />}
                loading={loading}
                onClick={onApply}
                className={`erp-filter-bar__apply-btn${hasDraftChanges ? ' erp-filter-bar__apply-btn--pending' : ''}`}
              >
                {hasDraftChanges ? 'Apply Filters *' : 'Apply'}
              </Button>
              <Tooltip title="Reset all filters">
                <Button size="small" icon={<ReloadOutlined />} onClick={onReset} disabled={!hasDraftChanges && days === 30}>
                  Reset
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </section>

      {error && (
        <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />
      )}

      {loading && !data ? (
        <>
          <div className="erp-hr-kpi-grid">
            <SkeletonKpi count={9} />
          </div>
          <div className="erp-row erp-row--half">
            <div className="erp-col--half">
              <SectionCard icon={<ClockCircleOutlined />} title="Attendance Trend" subtitle={`Last ${days} Days`}>
                <SkeletonChart height={250} />
              </SectionCard>
            </div>
            <div className="erp-col--half">
              <SectionCard icon={<TeamOutlined />} title="Employees by Department">
                <SkeletonChart height={250} />
              </SectionCard>
            </div>
          </div>
        </>
      ) : (
        <>
          {kpis.length > 0 && (
            <>
              <div className="erp-hr-kpi-grid">
                {kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
              </div>
              {notes.length > 0 && (
                <Alert type="info" showIcon message="Metric notes" description={notes.join(' ')} className="erp-alert-bar" />
              )}
            </>
          )}

          <div className="erp-row erp-row--half">
            <div className="erp-col--half">
              <SectionCard icon={<ClockCircleOutlined />} title="Attendance Trend" subtitle={`Last ${days} Days`}>
                {hasTrend ? (
                  <div className="erp-trend-wrap">
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={trendRows} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-chart-grid)" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
                          axisLine={{ stroke: 'var(--theme-border)' }}
                          tickLine={false}
                          interval={tickInterval}
                          tickMargin={6}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--theme-chart-axis)' }}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                          width={36}
                        />
                        <ChartTooltip
                          cursor={{ stroke: 'var(--theme-border-strong)', strokeDasharray: '3 3' }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const row = payload[0]?.payload as TrendRow;
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
                        <Line type="monotone" dataKey="Late" stroke="var(--theme-danger)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Line type="monotone" dataKey="OnLeave" stroke="var(--theme-warning)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Line type="monotone" dataKey="Absent" stroke="var(--theme-text-muted)" strokeWidth={1.25} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyState
                    icon={<ClockCircleOutlined />}
                    title="No attendance records in this period"
                    desc="The trend appears once daily attendance is recorded"
                  />
                )}
              </SectionCard>
            </div>

            <div className="erp-col--half">
              <SectionCard icon={<TeamOutlined />} title="Employees by Department">
                {deptData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={216}>
                      <PieChart>
                        <Pie data={deptData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={88} innerRadius={44}>
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
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HrDashboard;