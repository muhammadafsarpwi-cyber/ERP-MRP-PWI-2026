import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Descriptions, Input, Select, Space, Table, Tag, Tooltip } from 'antd';
import {
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import { describeRequestError } from '../../services/api';
import {
  fetchAttendanceRegister,
  fetchAttendanceRegisterOptions,
  HR_ATTENDANCE_STATUSES,
} from '../../services/hrAttendanceRegisterService';
import type {
  AttendanceRegisterData,
  AttendanceRegisterFilters,
  AttendanceRegisterOptions,
  AttendanceRegisterRecord,
  AttendanceStatus,
} from '../../services/hrAttendanceRegisterService';
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

function orgPath(rec: AttendanceRegisterRecord): string {
  const d = rec.employee.department;
  if (!d) return '—';
  return [d.division?.name, d.section?.name, d.name].filter(Boolean).join(' / ');
}

const renderEmployee = (rec: AttendanceRegisterRecord) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{rec.employee.employeeCode}</div>
    <div className="erp-ar-emp__name">
      {rec.employee.firstName} {rec.employee.lastName}
    </div>
  </div>
);

const renderLate = (rec: AttendanceRegisterRecord) => {
  if (rec.lateMinutes === null) return '—';
  return (
    <Tooltip title="Derived: check-in time vs the employee's shift start time">
      <Tag color="magenta">{fmtDuration(rec.lateMinutes)} late</Tag>
    </Tooltip>
  );
};

const DetailRow: React.FC<{ record: AttendanceRegisterRecord }> = ({ record }) => {
  const e = record.employee;
  return (
    <div className="erp-ar-detail">
      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label="Employee code">{e.employeeCode}</Descriptions.Item>
        <Descriptions.Item label="Employee status">{e.status ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Designation">{e.designation?.name ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Job title">{e.jobTitle ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Employment type">{e.employmentType ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Email">{e.email ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Department">
          {e.department ? orgPath(record) : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Shift">
          {record.shift ? `${record.shift.name ?? record.shift.code ?? ''}${record.shift.startTime ? ` (${record.shift.startTime}–${record.shift.endTime ?? ''})` : ''}` : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Check in">{fmtTime(record.checkIn)}</Descriptions.Item>
        <Descriptions.Item label="Check out">{fmtTime(record.checkOut)}</Descriptions.Item>
        <Descriptions.Item label="Working">{fmtDuration(record.durationMinutes)}</Descriptions.Item>
        <Descriptions.Item label="Overtime">{fmtDuration(record.overtimeMinutes)}</Descriptions.Item>
        <Descriptions.Item label="Late minutes">
          {record.lateMinutes === null ? '—' : `${record.lateMinutes} min (derived)`}
        </Descriptions.Item>
        <Descriptions.Item label="Remarks">{record.remarks ?? '—'}</Descriptions.Item>
      </Descriptions>
    </div>
  );
};

const AttendanceRegister: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AttendanceRegisterData | null>(null);
  const [options, setOptions] = useState<AttendanceRegisterOptions | null>(null);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>(() => {
    const start = dayjs().startOf('month');
    const end = dayjs();
    return [start, end];
  });
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [shiftId, setShiftId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<AttendanceStatus | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<AttendanceRegisterFilters>({});

  const initialFilters = useMemo<AttendanceRegisterFilters>(() => {
    const start = dayjs().startOf('month').format('YYYY-MM-DD');
    const end = dayjs().format('YYYY-MM-DD');
    return { from: start, to: end };
  }, []);

  const load = useCallback(async (filters: AttendanceRegisterFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAttendanceRegister(filters);
      setData(result);
    } catch (err) {
      setData(null);
      setError(describeRequestError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchAttendanceRegisterOptions()
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch(() => { /* filter dropdowns are optional; the register itself still loads */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    load(initialFilters);
  }, [load, initialFilters]);

  const onApply = () => {
    const from = range[0]?.format('YYYY-MM-DD');
    const to = range[1]?.format('YYYY-MM-DD');
    const next: AttendanceRegisterFilters = {};
    if (from && to) {
      next.from = from;
      next.to = to;
    }
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (shiftId) next.shiftId = shiftId;
    if (status) next.status = status;
    const trimmed = search.trim();
    if (trimmed) next.search = trimmed;
    setApplied(next);
    load(next);
  };

  const onReset = () => {
    setRange([dayjs().startOf('month'), dayjs()]);
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setShiftId(undefined);
    setStatus(undefined);
    setSearch('');
    setApplied({});
    load(initialFilters);
  };

  const onPageChange = (page: number, pageSize: number) => {
    load({ ...applied, page, limit: pageSize });
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

  const columns: ColumnsType<AttendanceRegisterRecord> = [
    {
      title: 'Employee',
      key: 'employee',
      width: 180,
      fixed: 'left',
      render: renderEmployee,
    },
    {
      title: 'Department',
      key: 'department',
      width: 210,
      render: (_, rec) => <span className="erp-ar-dept">{orgPath(rec)}</span>,
    },
    { title: 'Date', dataIndex: 'date', key: 'date', width: 120 },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: AttendanceStatus) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] ?? s}</Tag>,
    },
    {
      title: 'Shift',
      dataIndex: 'shift',
      key: 'shift',
      width: 150,
      render: (s: AttendanceRegisterRecord['shift']) =>
        s ? (
          <span>
            {s.name || s.code || '—'}
            {s.startTime ? <span className="erp-ar-shift-time">{` ${s.startTime}–${s.endTime ?? ''}`}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    { title: 'Check In', dataIndex: 'checkIn', key: 'in', render: fmtTime, width: 110 },
    { title: 'Check Out', dataIndex: 'checkOut', key: 'out', render: fmtTime, width: 110 },
    { title: 'Working', dataIndex: 'durationMinutes', key: 'working', render: fmtDuration, width: 100 },
    { title: 'Late', key: 'late', width: 110, render: (_, rec) => renderLate(rec) },
    { title: 'Overtime', dataIndex: 'overtimeMinutes', key: 'ot', render: fmtDuration, width: 100 },
    { title: 'Remarks', dataIndex: 'remarks', key: 'remarks', render: (r: string | null) => r ?? '—' },
  ];

  const kpis: Kpi[] = data
    ? [
        { key: 'total', icon: <BarChartOutlined />, tone: 'info', label: 'Records', value: data.summary.total, detail: `${data.range.from} → ${data.range.to}` },
        { key: 'employees', icon: <TeamOutlined />, tone: 'info', label: 'Employees', value: data.summary.employeesCovered },
        { key: 'present', icon: <CheckCircleOutlined />, tone: 'success', label: 'Present', value: data.summary.present },
        { key: 'late', icon: <FieldTimeOutlined />, tone: 'danger', label: 'Late', value: data.summary.late, detail: 'derived from check-in vs shift' },
        { key: 'absent', icon: <WarningOutlined />, tone: 'danger', label: 'Absent', value: data.summary.absent },
        { key: 'leave', icon: <CalendarOutlined />, tone: 'warning', label: 'On Leave', value: data.summary.onLeave },
        { key: 'halfday', icon: <ClockCircleOutlined />, tone: 'warning', label: 'Half Day', value: data.summary.halfDay },
        { key: 'holiday', icon: <CalendarOutlined />, tone: 'info', label: 'Holiday', value: data.summary.holiday },
        { key: 'weekend', icon: <CalendarOutlined />, tone: 'muted', label: 'Weekend', value: data.summary.weekend },
      ]
    : [];

  const noDefaultCompany = data !== null && !data.companyId && data.reason === 'NO_DEFAULT_COMPANY';

  return (
    <div className="erp-dashboard">
      <PageHeader icon={<TeamOutlined />} title="Attendance Register" subtitle="Company-wide attendance register (read-only)" />

      <section className="erp-filter-bar" aria-label="Attendance register filters">
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <FilterOutlined aria-hidden="true" /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <DatePicker.RangePicker
              size="small"
              style={{ width: 240 }}
              value={range}
              onChange={(v) => setRange(v as [Dayjs | null, Dayjs | null])}
              allowClear
            />
            <Select
              placeholder="Division"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 160 }}
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
              style={{ width: 160 }}
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
              style={{ width: 170 }}
              value={departmentId}
              onChange={(v) => setDepartmentId(v as string | undefined)}
              options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
            />
            <Select
              placeholder="Shift"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 140 }}
              value={shiftId}
              onChange={(v) => setShiftId(v as string | undefined)}
              options={(options?.shifts ?? []).map((s) => ({ value: s.id, label: `${s.code ?? ''}${s.name ? ` — ${s.name}` : ''}` }))}
            />
            <Select
              placeholder="Status"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 130 }}
              value={status}
              onChange={(v) => setStatus(v as AttendanceStatus | undefined)}
              options={HR_ATTENDANCE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
            />
            <Input.Search
              size="small"
              placeholder="Employee search"
              allowClear
              style={{ width: 200 }}
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

      {noDefaultCompany ? (
        <Alert
          type="warning"
          showIcon
          message="Attendance register is not available"
          description="Your ERP account has no default company set. Contact an administrator to configure your default company before viewing the attendance register."
          className="erp-alert-bar"
        />
      ) : loading && !data ? (
        <div className="erp-hr-kpi-grid">
          <EmptyState icon={<TeamOutlined />} title="Loading attendance register…" desc="Fetching company-wide attendance records" />
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
              <span className="erp-sec-title__icon"><CalendarOutlined /></span>
              Attendance Register
              <span className="erp-sec-title__sub">{data.total} record{data.total === 1 ? '' : 's'} · {data.summary.employeesCovered} employee{data.summary.employeesCovered === 1 ? '' : 's'}</span>
            </div>
            <Table
              size="small"
              rowKey="id"
              columns={columns}
              dataSource={data.records}
              loading={loading}
              scroll={{ x: 1400 }}
              expandable={{
                expandedRowRender: (rec) => <DetailRow record={rec} />,
                rowExpandable: () => true,
              }}
              pagination={{
                current: data.page,
                pageSize: data.limit,
                total: data.total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                onChange: onPageChange,
              }}
              locale={{ emptyText: data.records.length === 0 && Object.keys(applied).some((k) => k !== 'from' && k !== 'to' && k !== 'page' && k !== 'limit') ? 'No records match the selected filters' : 'No attendance records in this period' }}
            />
          </div>
        </>
      ) : null}
    </div>
  );
};

export default AttendanceRegister;