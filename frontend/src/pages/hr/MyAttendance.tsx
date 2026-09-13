import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Select, Space, Table, Tag, Tooltip } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import { describeRequestError } from '../../services/api';
import {
  fetchMyAttendance,
  HR_ATTENDANCE_STATUSES,
} from '../../services/hrMyAttendanceService';
import type {
  MyAttendanceData,
  MyAttendanceFilters,
  MyAttendanceRecord,
  AttendanceStatus,
} from '../../services/hrMyAttendanceService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PRESENT: 'green',
  ABSENT: 'red',
  LEAVE: 'orange',
  HALF_DAY: 'gold',
  HOLIDAY: 'blue',
  WEEKEND: 'purple',
  LATE: 'magenta',
};

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'On Leave',
  HALF_DAY: 'Half Day',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
  LATE: 'Late',
};

function fmtDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '—';
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function MonthCalendar({
  year,
  month,
  records,
}: {
  year: number;
  month: number;
  records: MyAttendanceRecord[];
}) {
  const byDate = useMemo(() => {
    const map = new Map<string, MyAttendanceRecord[]>();
    records.forEach((r) => {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    });
    return map;
  }, [records]);

  const cells = useMemo(() => {
    const first = dayjs(new Date(year, month, 1));
    const daysInMonth = first.daysInMonth();
    const startOffset = first.day();
    const list: { key: string; date: string | null; day?: number }[] = [];
    for (let i = 0; i < startOffset; i++) list.push({ key: `pad-${i}`, date: null });
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({ key: `d-${d}`, date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, day: d });
    }
    while (list.length % 7 !== 0) list.push({ key: `pad-${list.length}`, date: null });
    return list;
  }, [year, month]);

  const today = dayjs().format('YYYY-MM-DD');

  return (
    <div className="erp-ma-cal" role="grid" aria-label={`Attendance calendar ${month + 1}/${year}`}>
      <div className="erp-ma-cal__head">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="erp-ma-cal__dow">{d}</div>
        ))}
      </div>
      <div className="erp-ma-cal__grid">
        {cells.map((c) => {
          if (!c.date) return <div key={c.key} className="erp-ma-cal__cell erp-ma-cal__cell--pad" />;
          const dayRecs = byDate.get(c.date) ?? [];
          const first = dayRecs[0];
          const isToday = c.date === today;
          return (
            <div key={c.key} className={`erp-ma-cal__cell${isToday ? ' erp-ma-cal__cell--today' : ''}`}>
              <span className="erp-ma-cal__day">{c.day}</span>
              {first ? (
                <Tag color={STATUS_COLORS[first.status]} className="erp-ma-cal__tag">
                  {first.status === 'PRESENT' ? 'P' : first.status === 'LATE' ? 'L' : first.status === 'LEAVE' ? 'LV' : first.status === 'HALF_DAY' ? 'HD' : first.status === 'ABSENT' ? 'A' : first.status === 'HOLIDAY' ? 'H' : 'W'}
                </Tag>
              ) : (
                <span className="erp-ma-cal__none">·</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="erp-ma-cal__legend">
        {HR_ATTENDANCE_STATUSES.map((s) => (
          <span key={s} className="erp-ma-cal__legend-item">
            <Tag color={STATUS_COLORS[s]}>·</Tag> {STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

const MyAttendance: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MyAttendanceData | null>(null);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const start = dayjs().startOf('month');
    const end = dayjs();
    return [start, end];
  });
  const [status, setStatus] = useState<AttendanceStatus | undefined>(undefined);
  const [applied, setApplied] = useState<MyAttendanceFilters>({});

  const load = useCallback(async (filters: MyAttendanceFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchMyAttendance(filters);
      setData(result);
    } catch (err) {
      setData(null);
      setError(describeRequestError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const initialFilters = useMemo<MyAttendanceFilters>(() => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD');
    const end = dayjs().format('YYYY-MM-DD');
    return { from: start, to: end };
  }, []);

  useEffect(() => {
    load(initialFilters);
  }, [load, initialFilters]);

  const onApply = () => {
    const from = range[0]?.format('YYYY-MM-DD');
    const to = range[1]?.format('YYYY-MM-DD');
    if (!from || !to) {
      setApplied({});
      load(initialFilters);
      return;
    }
    const next: MyAttendanceFilters = { from, to };
    if (status) next.status = status;
    setApplied(next);
    load(next);
  };

  const onReset = () => {
    setRange([dayjs().startOf('month'), dayjs()]);
    setStatus(undefined);
    setApplied({});
    load(initialFilters);
  };

  const onPageChange = (page: number, pageSize: number) => {
    load({ ...applied, page, limit: pageSize });
  };

  const columns: ColumnsType<MyAttendanceRecord> = [
    { title: 'Date', dataIndex: 'date', key: 'date', width: 130 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: AttendanceStatus) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] ?? s}</Tag>,
    },
    { title: 'Check In', dataIndex: 'checkIn', key: 'in', render: fmtTime, width: 120 },
    { title: 'Check Out', dataIndex: 'checkOut', key: 'out', render: fmtTime, width: 120 },
    { title: 'Duration', dataIndex: 'durationMinutes', key: 'dur', render: fmtDuration, width: 110 },
    { title: 'Overtime', dataIndex: 'overtimeMinutes', key: 'ot', render: fmtDuration, width: 110 },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      width: 170,
      render: (s: MyAttendanceRecord['shift']) =>
        s ? (
          <span>
            {s.name || s.code || '—'}
            {s.startTime ? <span className="erp-ma-shift-time">{` ${s.startTime}–${s.endTime ?? ''}`}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (r: string | null) => r ?? '—' },
  ];

  const kpis: Kpi[] = data
    ? [
        { key: 'total', icon: <BarChartOutlined />, tone: 'info', label: 'Records', value: data.summary.total, detail: `${data.range.from} → ${data.range.to}` },
        { key: 'present', icon: <CheckCircleOutlined />, tone: 'success', label: 'Present', value: data.summary.present },
        { key: 'late', icon: <FieldTimeOutlined />, tone: 'danger', label: 'Late', value: data.summary.late, detail: 'derived from check-in vs shift' },
        { key: 'absent', icon: <WarningOutlined />, tone: 'danger', label: 'Absent', value: data.summary.absent },
        { key: 'leave', icon: <CalendarOutlined />, tone: 'warning', label: 'On Leave', value: data.summary.onLeave },
        { key: 'halfday', icon: <ClockCircleOutlined />, tone: 'warning', label: 'Half Day', value: data.summary.halfDay },
        { key: 'holiday', icon: <CalendarOutlined />, tone: 'info', label: 'Holiday', value: data.summary.holiday },
        { key: 'weekend', icon: <CalendarOutlined />, tone: 'muted', label: 'Weekend', value: data.summary.weekend },
      ]
    : [];

  const notLinked = data && !data.linked;

  const calMonth = useMemo(() => {
    const from = data?.range.from ?? initialFilters.from ?? '';
    const d = dayjs(`${from}T00:00:00`);
    return d.isValid() ? { year: d.year(), month: d.month() } : { year: dayjs().year(), month: dayjs().month() };
  }, [data?.range.from, initialFilters]);

  return (
    <div className="erp-dashboard">
      <PageHeader icon={<UserOutlined />} title="My Attendance" subtitle="Your attendance summary, calendar and history" />

      <section className="erp-filter-bar" aria-label="My attendance filters">
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <FilterOutlined aria-hidden="true" /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <DatePicker.RangePicker
              size="small"
              style={{ width: 260 }}
              value={range}
              onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null])}
              allowClear
            />
            <Select
              placeholder="Status"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 140 }}
              value={status}
              onChange={(v) => setStatus(v as AttendanceStatus | undefined)}
              options={HR_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
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
              <Tooltip title="Reset to current month">
                <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
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
        <div className="erp-hr-kpi-grid">
          <EmptyState icon={<UserOutlined />} title="Loading your attendance…" desc="Fetching attendance summary and records" />
        </div>
      ) : notLinked ? (
        <Alert
          type="warning"
          showIcon
          message="Attendance is not available"
          description={
            data?.reason === 'ACCOUNT_NOT_LINKED'
              ? 'Your ERP account is not linked to an HR employee record yet, so attendance cannot be shown. Contact an administrator to link your account.'
              : data?.reason === 'NO_DEFAULT_COMPANY'
                ? 'Your ERP account has no default company set. Contact an administrator to configure your default company.'
                : 'Your ERP account points to an employee record that could not be found. Contact an administrator to correct the linkage.'
          }
          className="erp-alert-bar"
        />
      ) : data ? (
        <>
          {data.employee && (
            <div className="erp-ma-employee-bar">
              <span className="erp-ma-employee-bar__avatar">
                {data.employee.firstName?.[0] ?? ''}
                {data.employee.lastName?.[0] ?? ''}
              </span>
              <div className="erp-ma-employee-bar__body">
                <div className="erp-ma-employee-bar__name">
                  {data.employee.firstName} {data.employee.lastName}
                  <span className="erp-ma-employee-bar__code">({data.employee.employeeCode})</span>
                </div>
                <div className="erp-ma-employee-bar__meta">
                  {data.employee.designation?.designationName ?? data.employee.jobTitle ?? 'Employee'}
                  {data.employee.employmentType ? ` · ${data.employee.employmentType?.split('_').map((w: string) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')}` : ''}
                  {data.employee.department
                    ? ` · ${[data.employee.department.division?.name, data.employee.department.section?.name, data.employee.department.name].filter(Boolean).join(' / ')}`
                    : ''}
                </div>
              </div>
              <div className="erp-ma-employee-bar__today">
                <span className="erp-ma-employee-bar__today-label">Today</span>
                {data.today ? (
                  <Tag color={STATUS_COLORS[data.today.status]}>{STATUS_LABELS[data.today.status] ?? data.today.status}</Tag>
                ) : (
                  <Tag>No record</Tag>
                )}
              </div>
            </div>
          )}

          <div className="erp-hr-kpi-grid">
            {kpis.map((k) => (
              <KpiCard key={k.key} kpi={k} />
            ))}
          </div>

          <div className="erp-row erp-row--half">
            <div className="erp-col--half">
              <div className="erp-section-card">
                <div className="erp-sec-title">
                  <span className="erp-sec-title__icon"><CalendarOutlined /></span>
                  Calendar
                  <span className="erp-sec-title__sub">
                    {new Date(calMonth.year, calMonth.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <MonthCalendar year={calMonth.year} month={calMonth.month} records={data.records} />
              </div>
            </div>
            <div className="erp-col--half">
              <div className="erp-section-card">
                <div className="erp-sec-title">
                  <span className="erp-sec-title__icon"><CheckCircleOutlined /></span>
                  History
                  <span className="erp-sec-title__sub">{data.total} record{data.total === 1 ? '' : 's'}</span>
                </div>
                <Table
                  size="small"
                  rowKey="id"
                  columns={columns}
                  dataSource={data.records}
                  loading={loading}
                  pagination={{
                    current: data.page,
                    pageSize: data.limit,
                    total: data.total,
                    showSizeChanger: true,
                    pageSizeOptions: [10, 20, 50, 100],
                    onChange: onPageChange,
                  }}
                  locale={{ emptyText: data.records.length === 0 && applied.status ? 'No records match the selected filters' : 'No attendance records in this period' }}
                />
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default MyAttendance;