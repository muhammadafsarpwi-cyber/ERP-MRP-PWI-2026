import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EditOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ScheduleOutlined,
  SearchOutlined,
  TeamOutlined,
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
  createRosterAssignment,
  fetchRosterById,
  fetchShiftRoster,
  fetchShiftRosterOptions,
  removeRosterAssignment,
  updateRosterAssignment,
  HR_ASSIGNMENT_STATUSES,
} from '../../services/hrShiftRosterService';
import type {
  AssignmentStatus,
  ShiftRosterData,
  ShiftRosterFilters,
  ShiftRosterOptions,
  ShiftRosterRecord,
} from '../../services/hrShiftRosterService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const { Text } = Typography;

const ATTENDANCE_LABELS: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'On Leave',
  HALF_DAY: 'Half Day',
  HOLIDAY: 'Holiday',
  WEEKEND: 'Weekend',
  LATE: 'Late',
};

const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = {
  ASSIGNED: 'Assigned',
  TENTATIVE: 'Tentative',
};

const ASSIGNMENT_COLORS: Record<AssignmentStatus, string> = {
  ASSIGNED: 'green',
  TENTATIVE: 'orange',
};

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

interface SuccessRosterSummary {
  mode: 'create' | 'edit';
  employee: string;
  employeeCode: string;
  shift: string;
  rosterDate: string;
  assignmentStatus: AssignmentStatus;
}

function orgPath(rec: ShiftRosterRecord): string {
  const d = rec.employee.department;
  if (!d) return '—';
  return [d.division?.name, d.section?.name, d.name].filter(Boolean).join(' / ');
}

function fmtShiftTime(t: string | null): string {
  return t ?? '—';
}

function shiftSummary(rec: ShiftRosterRecord): string {
  const s = rec.shift;
  if (!s) return '—';
  if (!s.name && !s.code) return '—';
  const label = s.name || s.code || '';
  const times = s.startTime ? ` (${s.startTime}${s.endTime ? `–${s.endTime}` : ''})` : '';
  return `${label}${times}`;
}

const renderEmployeeCell = (rec: ShiftRosterRecord) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{rec.employee.employeeCode}</div>
    <div className="erp-ar-emp__name">
      {rec.employee.firstName} {rec.employee.lastName}
    </div>
  </div>
);

const DETAIL_ICON = <ScheduleOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />;

const ShiftRoster: React.FC = () => {
  const { message, modal } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ShiftRosterData | null>(null);
  const [options, setOptions] = useState<ShiftRosterOptions | null>(null);

  const [rosterDate, setRosterDate] = useState<Dayjs>(() => dayjs());
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [shiftId, setShiftId] = useState<string | undefined>(undefined);
  const [assignmentStatus, setAssignmentStatus] = useState<AssignmentStatus | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<ShiftRosterFilters>({});
  const [activeView, setActiveView] = useState<'all' | 'unassigned' | string>('all');

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRosterRecord | null>(null);
  const [prefillEmployeeId, setPrefillEmployeeId] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<ShiftRosterRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [success, setSuccess] = useState<SuccessRosterSummary | null>(null);

  const load = useCallback(async (filters: ShiftRosterFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchShiftRoster(filters);
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
    fetchShiftRosterOptions()
      .then((opts) => {
        if (!mounted) return;
        setOptions(opts);
        if (opts.today) setRosterDate(dayjs(opts.today));
      })
      .catch(() => { /* filter dropdowns are optional; the roster itself still loads */ });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const today = rosterDate.format('YYYY-MM-DD');
    load({ rosterDate: today, limit: 10, page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFilters = (overrides: Partial<ShiftRosterFilters> = {}): ShiftRosterFilters => {
    const next: ShiftRosterFilters = { rosterDate: rosterDate.format('YYYY-MM-DD') };
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (activeView === 'unassigned') {
      next.assignment = 'unassigned';
    } else {
      if (shiftId) next.shiftId = shiftId;
      else if (activeView !== 'all' && activeView !== 'unassigned') next.shiftId = activeView;
    }
    if (assignmentStatus) next.assignmentStatus = assignmentStatus;
    if (employeeId) next.employeeId = employeeId;
    const trimmed = search.trim();
    if (trimmed) next.search = trimmed;
    return { ...next, ...overrides };
  };

  const onApply = () => {
    const filters = buildFilters({ page: 1, limit: applied.limit ?? 10 });
    setApplied(filters);
    load(filters);
  };

  const onReset = () => {
    setRosterDate(dayjs());
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setShiftId(undefined);
    setAssignmentStatus(undefined);
    setEmployeeId(undefined);
    setSearch('');
    setActiveView('all');
    const filters: ShiftRosterFilters = { rosterDate: dayjs().format('YYYY-MM-DD'), page: 1, limit: 10 };
    setApplied(filters);
    load(filters);
  };

  const onPageChange = (page: number, pageSize: number) => {
    const filters = { ...applied, page, limit: pageSize };
    setApplied(filters);
    load(filters);
  };

  const openView = async (rec: ShiftRosterRecord) => {
    if (!rec.id) {
      setViewing(rec);
      setViewOpen(true);
      return;
    }
    try {
      const full = await fetchRosterById(rec.id);
      setViewing(full);
      setViewOpen(true);
    } catch (err) {
      message.error(describeRequestError(err));
    }
  };

  const openAdd = (prefillEmployee?: string) => {
    setEditing(null);
    setPrefillEmployeeId(prefillEmployee ?? undefined);
    form.resetFields();
    form.setFieldsValue({
      employeeId: prefillEmployee ?? undefined,
      shiftId: undefined,
      rosterDate: rosterDate,
      assignmentStatus: 'ASSIGNED' as AssignmentStatus,
      remarks: undefined,
    });
    setAddOpen(true);
  };

  const openEdit = (rec: ShiftRosterRecord) => {
    setEditing(rec);
    setPrefillEmployeeId(undefined);
    form.resetFields();
    form.setFieldsValue({
      employeeId: rec.employee.id,
      shiftId: rec.shift?.id,
      rosterDate: dayjs(rec.rosterDate),
      assignmentStatus: rec.assignmentStatus ?? 'ASSIGNED',
      remarks: rec.remarks ?? undefined,
    });
    setAddOpen(true);
  };

  const closeAdd = () => {
    if (!form.isFieldsTouched()) {
      setAddOpen(false);
      return;
    }
    modal.confirm({
      title: editing ? 'Discard changes?' : 'Discard this draft?',
      content: 'The unsaved roster assignment will be lost. Are you sure you want to close?',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep Editing',
      onOk: () => setAddOpen(false),
    });
  };

  const handleSave = async () => {
    if (saving) return;
    try {
      const values = await form.validateFields();
      const payload = {
        employeeId: values.employeeId as string,
        shiftId: values.shiftId as string,
        rosterDate: (values.rosterDate as Dayjs).format('YYYY-MM-DD'),
        assignmentStatus: (values.assignmentStatus as AssignmentStatus) ?? 'ASSIGNED',
        remarks: ((values.remarks as string) || null) as string | null,
      };
      setSaving(true);
      let savedId: string | null;
      if (editing?.id) {
        const res = await updateRosterAssignment(editing.id, payload);
        savedId = editing.id;
        if (!res.success) throw new Error(res.message ?? 'Update failed');
      } else {
        const res = await createRosterAssignment(payload);
        savedId = res.data?.id ?? null;
        if (!res.success) throw new Error(res.message ?? 'Save failed');
      }
      const emp = options?.employees.find((e) => e.id === payload.employeeId);
      const shift = options?.shifts.find((s) => s.id === payload.shiftId);
      setAddOpen(false);
      setSuccess({
        mode: editing ? 'edit' : 'create',
        employee: emp ? `${emp.firstName} ${emp.lastName ?? ''}`.trim() : payload.employeeId,
        employeeCode: emp?.employeeCode ?? '—',
        shift: shift ? `${shift.name || shift.code || ''}` : payload.shiftId,
        rosterDate: payload.rosterDate,
        assignmentStatus: payload.assignmentStatus,
      });
      void savedId;
      onApplyAfterSave();
    } catch (err: unknown) {
      if (!(err as { errorFields?: unknown[] }).errorFields) {
        message.error(describeRequestError(err));
      }
    } finally {
      setSaving(false);
    }
  };

  const onApplyAfterSave = () => {
    setLoading(true);
    fetchShiftRoster(applied)
      .then((result) => setData(result))
      .catch(() => { /* keep existing data; the next refresh will surface errors */ })
      .finally(() => setLoading(false));
  };

  const handleDelete = (rec: ShiftRosterRecord) => {
    if (!rec.id) return;
    modal.confirm({
      title: 'Remove this roster assignment?',
      content: `${rec.employee.firstName} ${rec.employee.lastName}` +
        (rec.shift ? ` will no longer be assigned to ${shiftSummary(rec)}` : '') +
        ` on ${rec.rosterDate ?? 'the selected date'}. This soft-deletes the assignment.`,
      okText: 'Remove',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const res = await removeRosterAssignment(rec.id as string);
          if (!res.success) throw new Error(res.message ?? 'Delete failed');
          message.success('Shift roster assignment removed');
          onApplyAfterSave();
        } catch (err) {
          message.error(describeRequestError(err));
        }
      },
    });
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

  const selectedEmployeeId = Form.useWatch('employeeId', form) as string | undefined;
  const selectedShiftId = Form.useWatch('shiftId', form) as string | undefined;
  const selectedEmployee = useMemo(
    () => options?.employees.find((e) => e.id === selectedEmployeeId),
    [options, selectedEmployeeId],
  );
  const selectedShift = useMemo(
    () => options?.shifts.find((s) => s.id === selectedShiftId),
    [options, selectedShiftId],
  );

  const selectedEmployeeOrg = useMemo(() => {
    const dep = options?.departments.find((d) => d.id === selectedEmployee?.departmentId);
    if (!dep) return null;
    const div = options?.divisions.find((x) => x.id === dep.divisionId);
    const sec = options?.sections.find((x) => x.id === dep.sectionId);
    return { division: div?.name ?? '—', section: sec?.name ?? '—', department: dep.name };
  }, [options, selectedEmployee]);

  const canMutate = true;

  const columns: ColumnsType<ShiftRosterRecord> = [
    { title: 'Employee', key: 'employee', width: 200, fixed: 'left', render: renderEmployeeCell },
    {
      title: 'Division',
      key: 'division',
      width: 150,
      render: (_, rec) => rec.employee.department?.division?.name ?? '—',
    },
    {
      title: 'Section',
      key: 'section',
      width: 150,
      render: (_, rec) => rec.employee.department?.section?.name ?? '—',
    },
    {
      title: 'Department',
      key: 'department',
      width: 160,
      render: (_, rec) => rec.employee.department?.name ?? '—',
    },
    {
      title: 'Shift',
      key: 'shift',
      width: 180,
      render: (_, rec) => {
        if (!rec.shift) return <Text type="secondary">No shift set</Text>;
        return (
          <Tooltip title={rec.shift.code ? `Shift code ${rec.shift.code}` : undefined}>
            <ScheduleOutlined style={{ marginRight: 6, color: 'var(--theme-accent, #10b981)' }} />
            {rec.shift.name || rec.shift.code || '—'}
          </Tooltip>
        );
      },
    },
    {
      title: 'Shift Start',
      key: 'start',
      width: 110,
      render: (_, rec) => (rec.shift ? fmtShiftTime(rec.shift.startTime) : '—'),
    },
    {
      title: 'Shift End',
      key: 'end',
      width: 110,
      render: (_, rec) => (rec.shift ? fmtShiftTime(rec.shift.endTime) : '—'),
    },
    {
      title: 'Roster Date',
      key: 'rosterDate',
      width: 120,
      render: (_, rec) => rec.rosterDate ?? '—',
    },
    {
      title: 'Assignment',
      key: 'assignment',
      width: 120,
      render: (_, rec) =>
        rec.assignmentStatus ? (
          <Tag color={ASSIGNMENT_COLORS[rec.assignmentStatus]}>{ASSIGNMENT_LABELS[rec.assignmentStatus]}</Tag>
        ) : (
          <Tag>Unassigned</Tag>
        ),
    },
    {
      title: 'Attendance',
      key: 'attendance',
      width: 130,
      render: (_, rec) =>
        rec.attendance ? (
          <Tooltip title={`Attendance record ${ATTENDANCE_LABELS[rec.attendance.status] ?? rec.attendance.status}`}>
            <Tag color="blue">{ATTENDANCE_LABELS[rec.attendance.status] ?? rec.attendance.status}</Tag>
          </Tooltip>
        ) : (
          <Text type="secondary">Not recorded</Text>
        ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, rec) => (
        <Space size={2}>
          <Tooltip title="View details">
            <Button type="text" size="small" icon={<EyeOutlined />} aria-label="View details" onClick={() => openView(rec)} />
          </Tooltip>
          {rec.id ? (
            <>
              <Tooltip title="Edit assignment">
                <Button type="text" size="small" icon={<EditOutlined />} aria-label="Edit assignment" onClick={() => openEdit(rec)} />
              </Tooltip>
              <Tooltip title="Remove assignment">
                <Button type="text" size="small" danger icon={<WarningOutlined />} aria-label="Remove assignment" onClick={() => handleDelete(rec)} />
              </Tooltip>
            </>
          ) : (
            <Tooltip title="Assign this employee to a shift">
              <Button
                type="primary"
                size="small"
                ghost
                icon={<PlusOutlined />}
                aria-label="Assign employee"
                onClick={() => openAdd(rec.employee.id)}
              >
                Assign
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const summary = data?.summary;

  const kpis: Kpi[] = summary
    ? [
        { key: 'total', icon: <TeamOutlined />, tone: 'info', label: 'Total Employees', value: summary.totalEmployees, detail: `As of ${data?.rosterDate ?? '—'}` },
        { key: 'assigned', icon: <SafetyCertificateOutlined />, tone: 'success', label: 'Assigned Today', value: summary.assigned, detail: `${summary.assignedEmployeeCount} employee${summary.assignedEmployeeCount === 1 ? '' : 's'} covered` },
        { key: 'unassigned', icon: <WarningOutlined />, tone: 'danger', label: 'Unassigned', value: summary.unassigned, detail: 'derived: active employees without a roster' },
        { key: 'shifts', icon: <FieldTimeOutlined />, tone: 'info', label: 'Active Shifts', value: summary.activeShifts, detail: 'from Shift Master' },
      ]
    : [];

  const hasActiveFilters = Boolean(
    divisionId || sectionId || departmentId || shiftId || assignmentStatus || employeeId || search.trim(),
  );

  const emptyText =
    data?.records.length === 0
      ? activeView === 'unassigned'
        ? 'Every active employee already has a shift assignment for this date'
        : hasActiveFilters
          ? 'No roster records match the selected filters'
          : 'No shift assignments recorded for this date'
      : undefined;

  const noDefaultCompany = data !== null && !data.companyId && data.reason === 'NO_DEFAULT_COMPANY';

  const renderOrgPreview = () =>
    selectedEmployeeOrg ? (
      <Descriptions size="small" column={3} bordered>
        <Descriptions.Item label="Division">{selectedEmployeeOrg.division}</Descriptions.Item>
        <Descriptions.Item label="Section">{selectedEmployeeOrg.section}</Descriptions.Item>
        <Descriptions.Item label="Department">{selectedEmployeeOrg.department}</Descriptions.Item>
      </Descriptions>
    ) : null;

  const renderShiftPreview = () =>
    selectedShift ? (
      <Descriptions size="small" column={3} bordered>
        <Descriptions.Item label="Shift code">{selectedShift.code?.toUpperCase() ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Shift start">{fmtShiftTime(selectedShift.startTime ?? null)}</Descriptions.Item>
        <Descriptions.Item label="Shift end">{fmtShiftTime(selectedShift.endTime ?? null)}</Descriptions.Item>
      </Descriptions>
    ) : null;

  return (
    <div className="erp-dashboard">
      <PageHeader
        icon={<ScheduleOutlined />}
        title="Shift Roster"
        subtitle={`${data?.records.length ?? 0} of ${summary?.totalEmployees ?? 0} employees · roster date ${data?.rosterDate ?? '—'}`}
      />

      <section className="erp-filter-bar" aria-label="Shift roster filters">
        <div className="erp-filter-bar__top">
          <div className="erp-filter-bar__label">
            <FilterOutlined aria-hidden="true" /> Filters
          </div>
          <div className="erp-filter-bar__selects">
            <Tooltip title="Roster date — assignments are listed per day">
              <DatePicker
                size="small"
                style={{ width: 130 }}
                value={rosterDate}
                onChange={(v) => setRosterDate(v ?? dayjs())}
                allowClear={false}
                aria-label="Roster date filter"
              />
            </Tooltip>
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
              placeholder="Assignment"
              allowClear
              size="small"
              className="erp-filter-select"
              style={{ width: 130 }}
              aria-label="Assignment"
              value={assignmentStatus}
              onChange={(v) => setAssignmentStatus(v as AssignmentStatus | undefined)}
              options={HR_ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: ASSIGNMENT_LABELS[s] }))}
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
              <Tooltip title="Reset to today">
                <Button size="small" icon={<ReloadOutlined />} onClick={onReset}>
                  Reset
                </Button>
              </Tooltip>
              <Divider type="vertical" style={{ height: 22 }} />
              <Button
                type="default"
                size="small"
                icon={<PlusOutlined />}
                disabled={!canMutate}
                onClick={() => openAdd(undefined)}
                className="erp-roster-add-btn"
              >
                Assign Shift
              </Button>
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
          message="Shift roster is not available"
          description="Your ERP account has no default company set. Contact an administrator to configure your default company before viewing the shift roster."
          className="erp-alert-bar"
        />
      ) : loading && !data ? (
        <div className="erp-hr-kpi-grid">
          <EmptyState icon={<ScheduleOutlined />} title="Loading shift roster…" desc="Fetching roster assignments" />
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
              {activeView === 'unassigned' ? 'Unassigned Employees' : 'Shift Roster'}
              <span className="erp-sec-title__sub">
                {data.rosterDate} · {data.total} record{data.total === 1 ? '' : 's'} · {data.summary.assignedEmployeeCount} employee{data.summary.assignedEmployeeCount === 1 ? '' : 's'} assigned
              </span>
            </div>

            <div className="erp-roster-statusbar" role="tablist" aria-label="Roster views">
              <button
                type="button"
                className={`erp-roster-chip${activeView === 'all' ? ' erp-roster-chip--active' : ''}`}
                onClick={() => {
                  setActiveView('all');
                  setShiftId(undefined);
                  const filters = { rosterDate: data.rosterDate, page: 1, limit: applied.limit ?? 10 };
                  setApplied(filters);
                  load(filters);
                }}
              >
                ALL
                <span className="erp-roster-chip__count">{data.summary.assigned}</span>
              </button>
              {(data.shiftBreakdown ?? []).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`erp-roster-chip${activeView === s.id ? ' erp-roster-chip--active' : ''}`}
                  onClick={() => {
                    setActiveView(s.id);
                    setShiftId(s.id);
                    const filters = { rosterDate: data.rosterDate, shiftId: s.id, page: 1, limit: applied.limit ?? 10 };
                    setApplied(filters);
                    load(filters);
                  }}
                >
                  {s.name || s.code || 'Shift'}
                  <span className="erp-roster-chip__count">{s.assigned}</span>
                  {s.code ? <em className="erp-roster-chip__code">{s.code}</em> : null}
                </button>
              ))}
              <button
                type="button"
                className={`erp-roster-chip erp-roster-chip--unassigned${activeView === 'unassigned' ? ' erp-roster-chip--active' : ''}`}
                onClick={() => {
                  setActiveView('unassigned');
                  const filters: ShiftRosterFilters = { rosterDate: data.rosterDate, assignment: 'unassigned', page: 1, limit: applied.limit ?? 10 };
                  setApplied(filters);
                  load(filters);
                }}
              >
                UNASSIGNED
                <span className="erp-roster-chip__count">{data.summary.unassigned}</span>
              </button>
            </div>

            <Table
              size="small"
              rowKey={(rec) => rec.id ?? rec.employee.id}
              columns={columns}
              dataSource={data.records}
              loading={loading}
              scroll={{ x: 1500 }}
              pagination={{
                current: data.page,
                pageSize: data.limit,
                total: data.total,
                showSizeChanger: true,
                pageSizeOptions: [10, 20, 50, 100],
                onChange: onPageChange,
              }}
              locale={{ emptyText: emptyText ?? 'No shift roster records' }}
            />
          </div>
        </>
      ) : null}

      {canMutate && (
        <Modal
          open={addOpen}
          centered
          maskClosable={false}
          width={680}
          title={
            <Space>
              {DETAIL_ICON}
              {editing ? 'Edit Shift Assignment' : 'Assign Shift'}
            </Space>
          }
          footer={
            <Space>
              <Button onClick={closeAdd}>Cancel</Button>
              <Button type="primary" icon={editing ? <EditOutlined /> : <PlusOutlined />} loading={saving} disabled={saving} onClick={handleSave}>
                {editing ? 'Save Changes' : 'Create Assignment'}
              </Button>
            </Space>
          }
          onCancel={closeAdd}
        >
          {editing && (
            <Alert
              type="info"
              showIcon
              className="erp-alert-bar"
              message="Editing this assignment"
              description={`${editing.employee.firstName} ${editing.employee.lastName}` +
                (editing.shift && editing.shift.name ? ` · currently ${editing.shift.name}` : '') +
                ` on ${editing.rosterDate ?? '—'}`}
            />
          )}
          <Form form={form} layout="vertical">
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="employeeId"
                  label="Employee"
                  rules={[{ required: true, message: 'Select an employee from the Employee Master' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select employee"
                    aria-label="Assignment employee"
                    options={(options?.employees ?? []).map((e) => ({
                      value: e.id,
                      label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}`,
                    }))}
                    onChange={() => form.setFieldsValue({ shiftId: undefined })}
                  />
                </Form.Item>
                {renderOrgPreview()}
              </Col>
              <Col span={12}>
                <Form.Item
                  name="shiftId"
                  label="Shift"
                  rules={[{ required: true, message: 'Select a shift from the Shift Master' }]}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    placeholder="Select shift (from Shift Master)"
                    aria-label="Assignment shift"
                    options={(options?.shifts ?? []).map((s) => ({
                      value: s.id,
                      label: `${s.code ?? ''} — ${s.name ?? ''}${s.startTime ? ` (${s.startTime}–${s.endTime ?? ''})` : ''}`,
                    }))}
                  />
                </Form.Item>
                {renderShiftPreview()}
              </Col>
            </Row>
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="rosterDate"
                  label="Roster Date"
                  rules={[{ required: true, message: 'Select the roster date' }]}
                >
                  <DatePicker style={{ width: '100%' }} aria-label="Roster date" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="assignmentStatus" label="Assignment Status" initialValue="ASSIGNED">
                  <Select
                    aria-label="Assignment status"
                    options={HR_ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: ASSIGNMENT_LABELS[s] }))}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="remarks" label="Remarks">
              <Input.TextArea rows={2} placeholder="Optional remarks for this assignment" maxLength={500} showCount />
            </Form.Item>
          </Form>
        </Modal>
      )}

      <Modal
        open={viewOpen}
        centered
        maskClosable={false}
        width={720}
        title={
          <Space>
            <EyeOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Shift Assignment Detail
          </Space>
        }
        footer={
          <Button type="primary" onClick={() => setViewOpen(false)}>
            Close
          </Button>
        }
        onCancel={() => setViewOpen(false)}
      >
        {viewing && (
          <div className="erp-ar-detail">
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="Employee code">{viewing.employee.employeeCode ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Employee name">{`${viewing.employee.firstName} ${viewing.employee.lastName}`}</Descriptions.Item>
              <Descriptions.Item label="Designation">{viewing.employee.designation?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Employee status">{viewing.employee.status ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Division">{viewing.employee.department?.division?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Section">{viewing.employee.department?.section?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Department">{viewing.employee.department?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Roster date">{viewing.rosterDate ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Shift">
                {viewing.shift ? `${viewing.shift.name ?? viewing.shift.code ?? ''}${viewing.shift.code ? ` (${viewing.shift.code})` : ''}` : 'No shift set'}
              </Descriptions.Item>
              <Descriptions.Item label="Shift hours">
                {viewing.shift?.startTime ? `${viewing.shift.startTime} – ${viewing.shift.endTime ?? ''}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Assignment status">
                {viewing.assignmentStatus ? (
                  <Tag color={ASSIGNMENT_COLORS[viewing.assignmentStatus]}>{ASSIGNMENT_LABELS[viewing.assignmentStatus]}</Tag>
                ) : 'Unassigned'}
              </Descriptions.Item>
              <Descriptions.Item label="Attendance">
                {viewing.attendance ? ATTENDANCE_LABELS[viewing.attendance.status] ?? viewing.attendance.status : 'Not recorded'}
              </Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{viewing.remarks ?? '—'}</Descriptions.Item>
              {viewing.audit && (
                <>
                  <Descriptions.Item label="Created by">{viewing.audit.createdBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Created at">{viewing.audit.createdAt ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Updated by">{viewing.audit.updatedBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Updated at">{viewing.audit.updatedAt ?? '—'}</Descriptions.Item>
                </>
              )}
            </Descriptions>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(success)}
        onCancel={() => setSuccess(null)}
        centered
        closable={false}
        maskClosable={false}
        width={460}
        footer={null}
        style={{ borderRadius: 14, overflow: 'hidden' }}
      >
        {success && (
          <div style={{ textAlign: 'center', padding: '8px 8px 4px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)',
                color: 'var(--theme-success, #16a34a)',
                marginBottom: 14,
              }}
            >
              <CheckCircleOutlined style={{ fontSize: 52 }} />
            </div>
            <Typography.Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
              {success.mode === 'edit' ? 'Assignment Updated Successfully' : 'Shift Assigned Successfully'}
            </Typography.Title>
            <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12 }}>
              {success.mode === 'edit' ? 'The shift assignment has been updated.' : 'The shift assignment has been recorded.'}
            </Text>
            <Divider style={{ margin: '14px 0' }} />
            <div style={{ padding: '4px 8px 0', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Employee</Text>
                <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{success.employee}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Employee code</Text>
                <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{success.employeeCode}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Shift</Text>
                <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{success.shift}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Roster date</Text>
                <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{success.rosterDate}</Text>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Status</Text>
                <Text strong style={{ fontSize: 13, textAlign: 'right' }}>{ASSIGNMENT_LABELS[success.assignmentStatus]}</Text>
              </div>
            </div>
            <Divider style={{ margin: '14px 0 16px' }} />
            <Button type="primary" block size="large" style={{ padding: '0 8px' }} onClick={() => setSuccess(null)}>
              OK
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ShiftRoster;