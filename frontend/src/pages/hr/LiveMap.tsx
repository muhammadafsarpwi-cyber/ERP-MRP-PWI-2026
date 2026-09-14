import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Divider,
  Empty,
  Input,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  BulbOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FilterOutlined,
  FlagOutlined,
  GlobalOutlined,
  HeartOutlined,
  ManOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import { describeRequestError } from '../../services/api';
import {
  ATTENDANCE_STATUS_LABELS,
  hasLiveMarkers,
  LOCATION_FRESHNESS_MINUTES,
  fetchLiveMap,
  fetchLiveMapOptions,
} from '../../services/hrLiveMapService';
import type {
  LiveMapData,
  LiveMapEmployee,
  LiveMapFilters,
  LiveMapOptions,
  LocationStatus,
} from '../../services/hrLiveMapService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const { Text } = Typography;

const LOCATION_LABELS: Record<LocationStatus, string> = {
  LIVE: 'Live',
  RECENT: 'Recent',
  STALE: 'Stale',
  NO_LOCATION: 'No Location',
};

const LOCATION_COLORS: Record<LocationStatus, string> = {
  LIVE: 'green',
  RECENT: 'blue',
  STALE: 'orange',
  NO_LOCATION: 'default',
};

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

function fmtTime(t: string | null): string {
  return t ?? '—';
}

function shiftLabel(e: LiveMapEmployee): string {
  if (!e.shift) return '—';
  return e.shift.name || e.shift.code || '—';
}

function shiftHours(e: LiveMapEmployee): string {
  const s = e.shift;
  if (!s?.startTime) return '—';
  return `${s.startTime}–${s.endTime ?? ''}`;
}

const renderEmployeeCell = (e: LiveMapEmployee) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{e.employeeCode}</div>
    <div className="erp-ar-emp__name">{e.employeeName}</div>
  </div>
);

const LiveMapPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LiveMapData | null>(null);
  const [options, setOptions] = useState<LiveMapOptions | null>(null);

  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [shiftId, setShiftId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<LiveMapFilters>({});

  const buildFilters = (overrides: Partial<LiveMapFilters> = {}): LiveMapFilters => {
    const next: LiveMapFilters = {};
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (shiftId) next.shiftId = shiftId;
    if (status) next.status = status;
    if (employeeId) next.employeeId = employeeId;
    const trimmed = search.trim();
    if (trimmed) next.search = trimmed;
    return { ...next, ...overrides };
  };

  const load = useCallback(async (filters: LiveMapFilters, mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchLiveMap(filters);
      setData(result);
    } catch (err) {
      setData(null);
      setError(describeRequestError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchLiveMapOptions()
      .then((opts) => {
        if (!mounted) return;
        setOptions(opts);
      })
      .catch(() => { /* filter dropdowns are optional; the live map itself still loads */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    load({ limit: 10, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onApply = () => {
    const filters = buildFilters({ page: 1, limit: applied.limit ?? 10 });
    setApplied(filters);
    load(filters);
  };

  const onReset = () => {
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setShiftId(undefined);
    setStatus(undefined);
    setEmployeeId(undefined);
    setSearch('');
    const filters: LiveMapFilters = { page: 1, limit: applied.limit ?? 10 };
    setApplied(filters);
    load(filters);
  };

  const onRefresh = () => load(applied, 'refresh');

  const onPageChange = (page: number, pageSize: number) => {
    const filters = { ...applied, page, limit: pageSize };
    setApplied(filters);
    load(filters);
  };

  const filteredSections = useMemo(() => {
    if (!options) return [];
    return divisionId ? options.sections.filter((s) => s.divisionId === divisionId) : options.sections;
  }, [options, divisionId]);

  const filteredDepartments = useMemo(() => {
    if (!options) return [];
    return options.departments.filter(
      (d) =>
        (!divisionId || d.divisionId === divisionId) &&
        (!sectionId || d.sectionId === sectionId),
    );
  }, [options, divisionId, sectionId]);

  const summary = data?.summary;

  const kpis: Kpi[] = summary
    ? [
        {
          key: 'live',
          icon: <EnvironmentOutlined />,
          tone: summary.location.live > 0 ? 'success' : 'muted',
          label: 'Live on Map',
          value: summary.location.live,
          detail: `${LOCATION_FRESHNESS_MINUTES.LIVE_MAX_MINUTES}min freshness · derived`,
        },
        {
          key: 'presentNow',
          icon: <HeartOutlined />,
          tone: 'success',
          label: 'Present Now',
          value: summary.presence.presentNow,
          detail: 'derived · clocked in, not clocked out',
        },
        {
          key: 'presentToday',
          icon: <SafetyCertificateOutlined />,
          tone: 'info',
          label: 'Present Today',
          value: summary.presence.presentToday,
          detail: 'from today attendance',
        },
        {
          key: 'noLocation',
          icon: <FlagOutlined />,
          tone: 'muted',
          label: 'No Location',
          value: summary.location.noLocation,
          detail: `of ${summary.total} employee${summary.total === 1 ? '' : 's'} · no geo source`,
        },
      ]
    : [];

  const presenceChips: Array<{ key: string; label: string; value: number }> = summary
    ? [
        { key: 'presentNow', label: 'Present now', value: summary.presence.presentNow },
        { key: 'presentToday', label: 'Present today', value: summary.presence.presentToday },
        { key: 'absent', label: 'Absent', value: summary.presence.absent },
        { key: 'onLeave', label: 'On leave', value: summary.presence.onLeave },
        { key: 'halfDay', label: 'Half day', value: summary.presence.halfDay },
        { key: 'holiday', label: 'Holiday', value: summary.presence.holiday },
        { key: 'weekend', label: 'Weekend', value: summary.presence.weekend },
        { key: 'noRecord', label: 'No record', value: summary.presence.noRecord },
      ]
    : [];

  const hasActiveFilters = Boolean(
    divisionId || sectionId || departmentId || shiftId || status || employeeId || search.trim(),
  );

  const noLocationMarkers = Boolean(summary) && !hasLiveMarkers(summary);
  const noDefaultCompany = data !== null && !data.companyId && data.reason === 'NO_DEFAULT_COMPANY';

  const columns: ColumnsType<LiveMapEmployee> = [
    { title: 'Employee', key: 'employee', width: 200, fixed: 'left', render: (_, e) => renderEmployeeCell(e) },
    {
      title: 'Division',
      key: 'division',
      width: 140,
      render: (_, e) => e.department?.division?.name ?? '—',
    },
    {
      title: 'Section',
      key: 'section',
      width: 140,
      render: (_, e) => e.department?.section?.name ?? '—',
    },
    {
      title: 'Department',
      key: 'department',
      width: 150,
      render: (_, e) => e.department?.name ?? '—',
    },
    {
      title: 'Designation',
      key: 'designation',
      width: 150,
      render: (_, e) => e.designation?.name ?? '—',
    },
    {
      title: 'Shift',
      key: 'shift',
      width: 160,
      render: (_, e) => {
        if (!e.shift) return <Text type="secondary">No shift set</Text>;
        return (
          <Tooltip title={`${shiftLabel(e)} · ${shiftHours(e)}`}>
            <ClockCircleOutlined style={{ marginRight: 6, color: 'var(--theme-accent, #10b981)' }} />
            {shiftLabel(e)}
            <em style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-text-muted, #64748b)' }}>
              {e.shiftSource === 'attendance' ? 'att.' : e.shiftSource === 'roster' ? 'plan' : ''}
            </em>
          </Tooltip>
        );
      },
    },
    {
      title: 'Attendance',
      key: 'attendance',
      width: 130,
      render: (_, e) => {
        if (!e.attendance) return <Text type="secondary">Not recorded</Text>;
        return (
          <Tooltip
            title={
              e.attendance.presentNow
                ? `${ATTENDANCE_STATUS_LABELS[e.attendance.status] ?? e.attendance.status} · present now`
                : ATTENDANCE_STATUS_LABELS[e.attendance.status] ?? e.attendance.status
            }
          >
            <Tag color={e.attendance.presentNow ? 'green' : 'blue'}>
              {ATTENDANCE_STATUS_LABELS[e.attendance.status] ?? e.attendance.status}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: 'Location',
      key: 'location',
      width: 140,
      render: (_, e) => (
        <Tooltip title="No GPS/device location source is configured in this ERP instance">
          <Tag color={LOCATION_COLORS[e.location.status]}>{LOCATION_LABELS[e.location.status]}</Tag>
        </Tooltip>
      ),
    },
  ];

  const emptyText =
    data?.employees.length === 0
      ? hasActiveFilters
        ? 'No employees match the selected filters'
        : 'No active employees found for this company'
      : undefined;

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<EnvironmentOutlined />}
        title="Live Map"
        subtitle={`${data?.total ?? 0} employee${data?.total === 1 ? '' : 's'} · ${summary?.location.live ?? 0} live · as of ${data?.asOf ? new Date(data.asOf).toLocaleTimeString() : '—'}`}
      />

      <section className="erp-filter-bar" aria-label="Live map filters">
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <FilterOutlined aria-hidden="true" /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <Select
              placeholder="Division"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 150 }}
              aria-label="Division"
              value={divisionId}
              onChange={(v) => {
                setDivisionId(v as string | undefined);
                setSectionId(undefined);
                setDepartmentId(undefined);
              }}
              options={(options?.divisions ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
            <Select
              placeholder="Section"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 150 }}
              aria-label="Section"
              value={sectionId}
              onChange={(v) => {
                setSectionId(v as string | undefined);
                setDepartmentId(undefined);
              }}
              options={filteredSections.map((s) => ({ value: s.id, label: s.name }))}
            />
            <Select
              placeholder="Department"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 160 }}
              aria-label="Department"
              value={departmentId}
              onChange={(v) => setDepartmentId(v as string | undefined)}
              options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Select
              placeholder="Shift"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 150 }}
              aria-label="Shift"
              value={shiftId}
              onChange={(v) => setShiftId(v as string | undefined)}
              options={(options?.shifts ?? []).map((s) => ({ value: s.id, label: `${s.code ?? ''} — ${s.name ?? ''}`.replace(/^ — /, '') }))}
            />
            <Select
              placeholder="Presence"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 140 }}
              aria-label="Presence status"
              value={status}
              onChange={(v) => setStatus(v as string | undefined)}
              options={(options?.attendanceStatuses ?? []).map((s) => ({
                value: s,
                label: ATTENDANCE_STATUS_LABELS[s] ?? s,
              }))}
            />
            <Select
              placeholder="Employee"
              allowClear
              showSearch
              optionFilterProp="label"
              size="small"
              className="erp-filter-select"
              style={{ width: 200 }}
              aria-label="Employee"
              value={employeeId}
              onChange={(v) => setEmployeeId(v as string | undefined)}
              options={(options?.employees ?? []).map((e) => ({
                value: e.id,
                label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}`,
              }))}
            />
            <Input.Search
              size="small"
              placeholder="Employee search"
              allowClear
              style={{ width: 170 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onSearch={onApply}
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
                className="erp-filter-bar__apply-btn"
              >
                Apply
              </Button>
              <Tooltip title="Reset filters">
                <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
                  Reset
                </Button>
              </Tooltip>
              <Divider type="vertical" style={{ height: 22 }} />
              <Tooltip title="Re-fetch the live map">
                <Button
                  size="small"
                  icon={<GlobalOutlined />}
                  loading={refreshing}
                  onClick={onRefresh}
                  aria-label="Refresh live map"
                >
                  Refresh
                </Button>
              </Tooltip>
            </Space>
          </div>
        </div>
      </section>

      {error && (
        <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />
      )}

      {data && !data.location.providerConfigured && (
        <Alert
          type="info"
          showIcon
          className="erp-alert-bar erp-live-map-notice"
          icon={<BulbOutlined />}
          message="No live location source configured"
          description={data.location.note}
        />
      )}

      {noDefaultCompany ? (
        <Alert
          type="warning"
          showIcon
          message="Live Map is not available"
          description="Your ERP account has no default company set. Contact an administrator to configure your default company before viewing the live map."
          className="erp-alert-bar"
        />
      ) : loading && !data ? (
        <div className="erp-hr-kpi-grid">
          <EmptyState icon={<EnvironmentOutlined />} title="Loading live map…" desc="Fetching workforce presence" />
        </div>
      ) : data ? (
        <>
          <div className="erp-hr-kpi-grid">
            {kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </div>

          <div className="erp-section-card">
            <div className="erp-sec-title">
              <span className="erp-sec-title__icon"><EnvironmentOutlined /></span>
              Workforce Map
              <span className="erp-sec-title__sub">provider-neutral view · real data only · no markers are simulated</span>
            </div>

            <div className="erp-live-map-board" aria-label="Live map map board">
              {noLocationMarkers ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ margin: '40px 0 28px' }}
                  description={
                    <span className="erp-live-map-empty">
                      <TeamOutlined style={{ color: 'var(--theme-text-muted, #64748b)', marginRight: 6 }} />
                      No live employee locations available
                      <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
                        {summary?.location.live ?? 0} live · {summary?.location.recent ?? 0} recent ·{' '}
                        {summary?.location.stale ?? 0} stale · {summary?.location.noLocation ?? 0} no location
                      </Text>
                    </span>
                  }
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  style={{ margin: '40px 0 28px' }}
                  description={<span className="erp-live-map-empty">Live location markers appear here</span>}
                />
              )}

              <div className="erp-live-map-legend" role="list" aria-label="Location legend">
                {(Object.keys(LOCATION_LABELS) as LocationStatus[]).map((s) => (
                  <span key={s} className="erp-live-map-legend__item" role="listitem">
                    <Tag color={LOCATION_COLORS[s]}>{LOCATION_LABELS[s]}</Tag>
                    <em className="erp-live-map-legend__hint">
                      {s === 'LIVE' ? `within ${LOCATION_FRESHNESS_MINUTES.LIVE_MAX_MINUTES} min` :
                        s === 'RECENT' ? `within ${LOCATION_FRESHNESS_MINUTES.RECENT_MAX_MINUTES} min` :
                        s === 'STALE' ? `older than ${LOCATION_FRESHNESS_MINUTES.RECENT_MAX_MINUTES} min` :
                        'no geo timestamp'}
                    </em>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {summary && (
            <div className="erp-section-card">
              <div className="erp-sec-title">
                <span className="erp-sec-title__icon"><ManOutlined /></span>
                Workforce Presence
                <span className="erp-sec-title__sub">derived from today real attendance records</span>
              </div>
              <div className="erp-live-map-chips" role="list" aria-label="Presence summary">
                {presenceChips.map((c) => (
                  <span key={c.key} className="erp-live-map-chip" role="listitem">
                    <strong>{c.value}</strong>
                    <em>{c.label}</em>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="erp-section-card">
            <div className="erp-sec-title">
              <span className="erp-sec-title__icon"><TeamOutlined /></span>
              Employee Locations
              <span className="erp-sec-title__sub">
                {data.asOf ? `as of ${new Date(data.asOf).toLocaleString()}` : ''} · {data.total} employee{data.total === 1 ? '' : 's'} in scope
              </span>
            </div>

            <Table
              size="small"
              rowKey={(e) => e.employeeId}
              columns={columns}
              dataSource={data.employees}
              loading={loading}
              scroll={{ x: 1280 }}
              pagination={{
                current: data.page,
                pageSize: data.limit,
                total: data.total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                onChange: onPageChange,
              }}
              locale={{ emptyText: emptyText ?? 'No live map records' }}
            />
          </div>
        </>
      ) : null}

      {summary && (
        <div className="erp-live-map-footnote" aria-label="Live map notes">
          <WarningOutlined style={{ marginRight: 6 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Presence (present-now, present-today, absent, on-leave, half-day, holiday, weekend, no-record) is derived
            from real hr_attendance records. Location counters are truthful: no GPS source exists in this ERP, so
            every employee is reported as No Location — no coordinates are simulated.
          </Text>
        </div>
      )}
    </div>
  );
};

export default LiveMapPage;