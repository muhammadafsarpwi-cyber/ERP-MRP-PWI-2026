import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  App as AntApp,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Tooltip,
} from 'antd';
import {
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  FilterOutlined,
  HourglassOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import DraggableResizableModal from '../../components/shared/DraggableResizableModal';
import { describeRequestError } from '../../services/api';
import {
  fetchOvertimeRequests,
  fetchOvertimeOptions,
  fetchOvertimeById,
  createOvertimeRequest,
  updateOvertimeRequest,
  approveOvertimeRequest,
  rejectOvertimeRequest,
  deleteOvertimeRequest,
  HR_OVERTIME_STATUSES,
} from '../../services/hrOvertimeService';
import type {
  OvertimeFilters,
  OvertimeOptions,
  OvertimeRecord,
  OvertimeDetail,
  OvertimesData,
  OvertimeStatus,
} from '../../services/hrOvertimeService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'processing',
  APPROVED: 'green',
  REJECTED: 'red',
};

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

function orgPath(rec: OvertimeRecord): string {
  const d = rec.employee.department;
  if (!d) return '—';
  return [d.division?.name, d.section?.name, d.name].filter(Boolean).join(' / ');
}

function fmtHours(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${Number(v).toFixed(2)} h`;
}

function fmtMinutes(m: number | null | undefined): string {
  if (m == null) return '—';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return `${h}:${String(mm).padStart(2, '0')}`;
}

const renderEmployeeCell = (rec: OvertimeRecord) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{rec.employee.employeeCode}</div>
    <div className="erp-ar-emp__name">
      {rec.employee.firstName} {rec.employee.lastName}
    </div>
  </div>
);

const OvertimeApproval: React.FC = () => {
  const { message, modal } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OvertimesData | null>(null);
  const [options, setOptions] = useState<OvertimeOptions | null>(null);

  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [shiftId, setShiftId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<OvertimeStatus | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [applied, setApplied] = useState<OvertimeFilters>({ page: 1, limit: 20 });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<OvertimeRecord | null>(null);
  const [viewing, setViewing] = useState<OvertimeDetail | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{ rec: OvertimeRecord; action: 'approve' | 'reject' } | null>(null);
  const [approvedHours, setApprovedHours] = useState<number | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (filters: OvertimeFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOvertimeRequests(filters);
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
    fetchOvertimeOptions()
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    load(applied);
  }, [load, applied]);

  const buildFilters = (overrides: Partial<OvertimeFilters> = {}): OvertimeFilters => {
    const next: OvertimeFilters = { page: 1, limit: 20 };
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (shiftId) next.shiftId = shiftId;
    if (status) next.status = status;
    if (employeeId) next.employeeId = employeeId;
    if (search) next.search = search;
    if (dateFrom) next.dateFrom = dateFrom;
    if (dateTo) next.dateTo = dateTo;
    Object.assign(next, overrides);
    return next;
  };

  const applyFilters = () => setApplied(buildFilters());

  const resetFilters = () => {
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setShiftId(undefined);
    setStatus(undefined);
    setEmployeeId(undefined);
    setSearch('');
    setDateFrom(undefined);
    setDateTo(undefined);
    setApplied({ page: 1, limit: 20 });
  };

  const kpis: Kpi[] = data
    ? [
        { key: 'pending', icon: <HourglassOutlined />, tone: 'warning', label: 'Pending', value: data.summary.pending, detail: 'Awaiting decision' },
        { key: 'approved', icon: <CheckCircleOutlined />, tone: 'success', label: 'Approved', value: data.summary.approved },
        { key: 'rejected', icon: <CloseCircleOutlined />, tone: 'danger', label: 'Rejected', value: data.summary.rejected },
        { key: 'requestedHrs', icon: <FieldTimeOutlined />, tone: 'info', label: 'Requested Hrs', value: data.summary.totalRequestedHours, detail: 'Total requested' },
        { key: 'approvedHrs', icon: <ClockCircleOutlined />, tone: 'info', label: 'Approved Hrs', value: data.summary.totalApprovedHours, detail: 'Total approved' },
      ]
    : [];

  const handleCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload: any = {
        overtimeDate: v.overtimeDate?.format('YYYY-MM-DD'),
        requestedHours: v.requestedHours,
        reason: v.reason,
        remarks: v.remarks || null,
      };
      const targetPerson = v.employeeId ?? options?.self?.employeeId;
      if (!targetPerson && !editing) {
        message.error('Select an employee for this overtime request');
        return;
      }
      if (targetPerson) payload.employeeId = targetPerson;
      if (v.shiftId) payload.shiftId = v.shiftId;

      if (editing) {
        await updateOvertimeRequest(editing.id, {
          shiftId: payload.shiftId,
          requestedHours: v.requestedHours,
          reason: v.reason,
          remarks: payload.remarks,
        });
        message.success('Overtime request updated');
      } else {
        await createOvertimeRequest(payload);
        message.success('Overtime request submitted successfully.');
      }
      setAddOpen(false);
      setEditing(null);
      form.resetFields();
      load(applied);
    } catch (err) {
      const msg: any = (err as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : describeRequestError(err));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setAddOpen(true);
  };

  const openEdit = (rec: OvertimeRecord) => {
    setEditing(rec);
    form.setFieldsValue({
      overtimeDate: rec.overtimeDate ? dayjs(rec.overtimeDate) : undefined,
      shiftId: rec.shift?.id ?? undefined,
      requestedHours: rec.requestedHours,
      reason: rec.reason,
      remarks: rec.remarks ?? '',
    });
    setAddOpen(true);
  };

  const openView = async (id: string) => {
    try {
      const rec = await fetchOvertimeById(id);
      setViewing(rec);
      setViewOpen(true);
    } catch (err) {
      message.error(describeRequestError(err));
    }
  };

  const openDecision = (rec: OvertimeRecord, action: 'approve' | 'reject') => {
    setDecisionTarget({ rec, action });
    setApprovedHours(rec.requestedHours);
    setDecisionRemarks('');
  };

  const executeDecision = async () => {
    if (!decisionTarget) return;
    if (decisionTarget.action === 'reject' && decisionRemarks.trim().length < 3) {
      message.error('Rejection requires a reason (min 3 characters)');
      return;
    }
    setDecisionSaving(true);
    try {
      if (decisionTarget.action === 'approve') {
        await approveOvertimeRequest(decisionTarget.rec.id, {
          approvedHours: approvedHours ?? decisionTarget.rec.requestedHours,
          remarks: decisionRemarks || null,
        });
        message.success('Overtime approved successfully.');
      } else {
        await rejectOvertimeRequest(decisionTarget.rec.id, { remarks: decisionRemarks });
        message.success('Overtime rejected.');
      }
      setDecisionTarget(null);
      load(applied);
    } catch (err) {
      message.error(describeRequestError(err));
    } finally {
      setDecisionSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: 'Remove overtime request',
      icon: <DeleteOutlined style={{ color: 'var(--theme-accent, #ff4d4f)' }} />,
      content: 'This will remove the overtime request. This action cannot be undone. Continue?',
      okText: 'Yes, remove',
      okButtonProps: { danger: true },
      cancelText: 'No',
      onOk: async () => {
        try {
          await deleteOvertimeRequest(id);
          message.success('Overtime request removed');
          load(applied);
        } catch (err) {
          message.error(describeRequestError(err));
        }
      },
    });
  };

  const cols: ColumnsType<OvertimeRecord> = [
    {
      title: 'Ref No',
      dataIndex: 'refNo',
      key: 'refNo',
      width: 130,
    },
    {
      title: 'Employee',
      key: 'employee',
      render: (_, r) => renderEmployeeCell(r),
      sorter: (a, b) => (a.employee.employeeCode ?? '').localeCompare(b.employee.employeeCode ?? ''),
    },
    {
      title: 'Division',
      key: 'division',
      width: 160,
      render: (_, r) => r.employee.department?.division?.name ?? '—',
    },
    {
      title: 'Department',
      key: 'department',
      width: 160,
      render: (_, r) => r.employee.department?.name ?? '—',
    },
    {
      title: 'Date',
      dataIndex: 'overtimeDate',
      key: 'overtimeDate',
      width: 120,
    },
    {
      title: 'Shift',
      key: 'shift',
      width: 130,
      render: (_, r) => (r.shift ? `${r.shift.name ?? r.shift.code ?? ''} (${r.shift.startTime ?? '—'}–${r.shift.endTime ?? '—'})` : '—'),
    },
    {
      title: 'Scheduled Hrs',
      key: 'scheduledHours',
      width: 110,
      align: 'right',
      render: (_, r) => fmtHours(r.shift?.workingHours),
    },
    {
      title: 'Working Hrs',
      key: 'workingHours',
      width: 110,
      align: 'right',
      render: (_, r) => fmtMinutes(r.attendance?.durationMinutes),
    },
    {
      title: 'Candidate OT',
      key: 'candidateOt',
      width: 110,
      align: 'right',
      render: (_, r) => (
        <Tooltip title="Computed from check-out vs scheduled shift end (display only)">
          <span>{fmtMinutes(r.attendance?.candidateOvertimeMinutes)}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Requested OT',
      key: 'requestedHours',
      width: 110,
      align: 'right',
      render: (_, r) => fmtHours(r.requestedHours),
    },
    {
      title: 'Approved OT',
      key: 'approvedHours',
      width: 110,
      align: 'right',
      render: (_, r) => fmtHours(r.approvedHours),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? 'default'}>{STATUS_LABELS[s] ?? s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View details">
            <Button size="small" icon={<EyeOutlined />} onClick={() => openView(r.id)} />
          </Tooltip>
          {r.status === 'PENDING' && (
            <>
              <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
              </Tooltip>
              <Tooltip title="Approve">
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openDecision(r, 'approve')} />
              </Tooltip>
              <Tooltip title="Reject">
                <Button size="small" danger icon={<CloseOutlined />} onClick={() => openDecision(r, 'reject')} />
              </Tooltip>
            </>
          )}
          {r.status === 'PENDING' && (
            <Tooltip title="Remove request">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const uniqueDivisions = options?.divisions ?? [];
  const filteredSections = options?.sections?.filter((s) => !divisionId || s.divisionId === divisionId) ?? [];
  const filteredDepartments = options?.departments?.filter((d) => {
    if (divisionId && d.divisionId !== divisionId) return false;
    if (sectionId && d.sectionId !== sectionId) return false;
    return true;
  }) ?? [];
  const filteredEmployees = options?.employees?.filter((e) => {
    if (departmentId && e.departmentId !== departmentId) return false;
    return true;
  }) ?? [];

  return (
    <div>
      <PageHeader
        icon={<FieldTimeOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />}
        title="Overtime Approval"
        subtitle="Manage and approve overtime requests"
        showBreadcrumbs
      />
      <Card style={{ marginTop: 12 }}>
        {error && <Alert type="error" showIcon closable message={error} style={{ marginBottom: 12 }} />}
        <div className="erp-filter-bar">
          <Select
            placeholder="Division"
            allowClear
            style={{ width: 160 }}
            value={divisionId}
            onChange={(v) => { setDivisionId(v); setSectionId(undefined); setDepartmentId(undefined); setEmployeeId(undefined); }}
            options={uniqueDivisions.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            placeholder="Section"
            allowClear
            style={{ width: 160 }}
            value={sectionId}
            onChange={(v) => { setSectionId(v); setDepartmentId(undefined); setEmployeeId(undefined); }}
            options={filteredSections.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            placeholder="Department"
            allowClear
            style={{ width: 170 }}
            value={departmentId}
            onChange={(v) => { setDepartmentId(v); setEmployeeId(undefined); }}
            options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            placeholder="Shift"
            allowClear
            style={{ width: 150 }}
            value={shiftId}
            onChange={(v) => setShiftId(v)}
            options={(options?.shifts ?? []).map((s) => ({ value: s.id, label: `${s.code ?? ''} — ${s.name ?? ''}` }))}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 130 }}
            value={status}
            onChange={(v) => setStatus(v as OvertimeStatus | undefined)}
            options={HR_OVERTIME_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
          />
          <Select
            placeholder="Employee"
            showSearch
            allowClear
            optionFilterProp="label"
            style={{ width: 200 }}
            value={employeeId}
            onChange={setEmployeeId}
            options={filteredEmployees.map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}` }))}
          />
          <Input
            placeholder="Search employee"
            prefix={<FilterOutlined />}
            allowClear
            style={{ width: 170 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={() => applyFilters()}
          />
          <Button type="primary" icon={<ReloadOutlined />} onClick={applyFilters}>
            Apply
          </Button>
          <Button onClick={resetFilters}>Reset</Button>
        </div>
      </Card>

      <div className="erp-hr-kpi-grid">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} />
        ))}
      </div>

      <Card
        className="erp-section-card"
        title="Overtime Requests"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Request Overtime
          </Button>
        }
        style={{ marginTop: 12 }}
      >
        <Table<OvertimeRecord>
          size="small"
          rowKey="id"
          columns={cols}
          dataSource={data?.records ?? []}
          loading={loading}
          pagination={
            data
              ? {
                  current: data.page,
                  pageSize: data.limit,
                  total: data.total,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100'],
                  showTotal: (t) => `${t} record${t !== 1 ? 's' : ''}`,
                  onChange: (p, ps) => setApplied((prev) => ({ ...prev, page: p, limit: ps })),
                }
              : false
          }
          locale={{ emptyText: <EmptyState title="No overtime requests" desc="Submit an overtime approval request to get started." /> }}
          scroll={{ x: 1900 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <DraggableResizableModal
        title={editing ? 'Edit Overtime Request' : 'Request Overtime'}
        open={addOpen}
        onCancel={() => { setAddOpen(false); setEditing(null); form.resetFields(); }}
        onOk={handleCreate}
        okText={editing ? 'Save' : 'Submit'}
        confirmLoading={saving}
        width={520}
        height={520}
      >
        <Form form={form} layout="vertical">
          {!options?.self?.employeeId && !editing && (
            <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Select employee' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select employee"
                options={(options?.employees ?? []).map((e) => ({ value: e.id, label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}` }))}
              />
            </Form.Item>
          )}
          <Form.Item name="overtimeDate" label="Overtime Date" rules={[{ required: true, message: 'Select date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="shiftId" label="Shift">
                <Select
                  allowClear
                  placeholder="Resolve from attendance"
                  options={(options?.shifts ?? []).map((s) => ({ value: s.id, label: `${s.code ?? ''} — ${s.name ?? ''}` }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="requestedHours" label="Requested Hours" rules={[{ required: true, message: 'Enter hours' }]}>
                <InputNumber min={0.01} max={24} step={0.5} style={{ width: '100%' }} placeholder="0.5 – 24" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 3, max: 255, message: 'Enter a reason (min 3 characters)' }]}>
            <Input placeholder="e.g. Overtime duty for urgent production run" />
          </Form.Item>
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} placeholder="Additional remarks (optional)" />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* View Modal */}
      <DraggableResizableModal
        title="Overtime Request Details"
        open={viewOpen}
        onCancel={() => { setViewOpen(false); setViewing(null); }}
        footer={<Button onClick={() => { setViewOpen(false); setViewing(null); }}>Close</Button>}
        width={720}
        height={640}
      >
        {viewing && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Ref No">{viewing.refNo}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[viewing.status] ?? 'default'}>{STATUS_LABELS[viewing.status] ?? viewing.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Employee" span={2}>
                {viewing.employee.employeeCode} — {viewing.employee.firstName} {viewing.employee.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Organization">{orgPath(viewing)}</Descriptions.Item>
              <Descriptions.Item label="Date">{viewing.overtimeDate}</Descriptions.Item>
              <Descriptions.Item label="Shift">
                {viewing.shift ? `${viewing.shift.name ?? viewing.shift.code ?? '—'} (${viewing.shift.startTime ?? '—'}–${viewing.shift.endTime ?? '—'})` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Scheduled Hours">{fmtHours(viewing.shift?.workingHours)}</Descriptions.Item>
              <Descriptions.Item label="Check In">{viewing.attendance?.checkIn ? new Date(viewing.attendance.checkIn).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Check Out">{viewing.attendance?.checkOut ? new Date(viewing.attendance.checkOut).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—'}</Descriptions.Item>
              <Descriptions.Item label="Working Hours">{fmtMinutes(viewing.attendance?.durationMinutes)}</Descriptions.Item>
              <Descriptions.Item label="Candidate OT">
                <Tooltip title="Computed from check-out vs scheduled shift end (display only)">
                  <span>{fmtMinutes(viewing.attendance?.candidateOvertimeMinutes)}</span>
                </Tooltip>
              </Descriptions.Item>
              <Descriptions.Item label="Requested OT">{fmtHours(viewing.requestedHours)}</Descriptions.Item>
              <Descriptions.Item label="Approved OT">{fmtHours(viewing.approvedHours)}</Descriptions.Item>
              <Descriptions.Item label="Reason" span={2}>{viewing.reason}</Descriptions.Item>
              <Descriptions.Item label="Remarks" span={2}>{viewing.remarks || '—'}</Descriptions.Item>
              {viewing.decisionRemarks && (
                <Descriptions.Item label="Decision Remarks" span={2}>{viewing.decisionRemarks}</Descriptions.Item>
              )}
              <Descriptions.Item label="Submitted By">{viewing.audit?.submittedBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Submitted At">{viewing.audit?.submittedAt ?? '—'}</Descriptions.Item>
              {viewing.audit?.decidedAt && (
                <>
                  <Descriptions.Item label="Decided By">{viewing.audit?.decidedBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Decided At">{viewing.audit?.decidedAt ?? '—'}</Descriptions.Item>
                </>
              )}
            </Descriptions>
            {viewing.history && viewing.history.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Decision History</div>
                <Timeline
                  items={viewing.history.map((h) => ({
                    color: h.toStatus === 'APPROVED' ? 'green' : h.toStatus === 'REJECTED' ? 'red' : 'blue',
                    children: (
                      <div>
                        <span>
                          {h.fromStatus ? `${STATUS_LABELS[h.fromStatus] ?? h.fromStatus} → ` : ''}
                          <Tag color={STATUS_COLORS[h.toStatus] ?? 'default'}>{STATUS_LABELS[h.toStatus] ?? h.toStatus}</Tag>
                        </span>
                        <div style={{ fontSize: 12, color: 'var(--theme-muted, #888)' }}>
                          {h.createdAt ?? ''} · {h.createdBy ?? '—'}
                          {h.remarks ? ` · ${h.remarks}` : ''}
                          {h.approvedHours != null ? ` · Approved ${h.approvedHours} h` : ''}
                        </div>
                      </div>
                    ),
                  }))}
                />
              </div>
            )}
          </>
        )}
      </DraggableResizableModal>

      {/* Decision Modal */}
      <DraggableResizableModal
        title={decisionTarget?.action === 'approve' ? 'Approve Overtime Request' : 'Reject Overtime Request'}
        open={!!decisionTarget}
        onCancel={() => setDecisionTarget(null)}
        onOk={executeDecision}
        okText={decisionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: decisionTarget?.action === 'reject' }}
        confirmLoading={decisionSaving}
        width={460}
        height={330}
      >
        {decisionTarget && (
          <Form layout="vertical">
            <Descriptions size="small" column={2} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Employee">
                {decisionTarget.rec.employee.employeeCode} — {decisionTarget.rec.employee.firstName} {decisionTarget.rec.employee.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Date">{decisionTarget.rec.overtimeDate}</Descriptions.Item>
              <Descriptions.Item label="Requested OT">{fmtHours(decisionTarget.rec.requestedHours)}</Descriptions.Item>
              <Descriptions.Item label="Candidate OT">{fmtMinutes(decisionTarget.rec.attendance?.candidateOvertimeMinutes)}</Descriptions.Item>
            </Descriptions>
            {decisionTarget.action === 'approve' ? (
              <>
                <Form.Item label="Approved Hours">
                  <InputNumber
                    min={0.01}
                    max={24}
                    step={0.5}
                    style={{ width: '100%' }}
                    value={approvedHours ?? undefined}
                    onChange={(v) => setApprovedHours(v)}
                  />
                </Form.Item>
                <Form.Item label="Decision Remarks">
                  <Input.TextArea
                    rows={2}
                    value={decisionRemarks}
                    onChange={(e) => setDecisionRemarks(e.target.value)}
                    placeholder="Optional remarks for this decision"
                  />
                </Form.Item>
              </>
            ) : (
              <Form.Item label="Rejection Reason" required>
                <Input.TextArea
                  rows={3}
                  value={decisionRemarks}
                  onChange={(e) => setDecisionRemarks(e.target.value)}
                  placeholder="Required — why is this overtime request being rejected?"
                />
              </Form.Item>
            )}
          </Form>
        )}
      </DraggableResizableModal>
    </div>
  );
};

export default OvertimeApproval;