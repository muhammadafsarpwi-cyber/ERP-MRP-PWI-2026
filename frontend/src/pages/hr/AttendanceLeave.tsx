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
  Row,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  HourglassOutlined,
  PlusOutlined,
  ReloadOutlined,
  StopOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import DraggableResizableModal from '../../components/shared/DraggableResizableModal';
import { describeRequestError } from '../../services/api';
import {
  fetchLeaveRequests,
  fetchLeaveRequestOptions,
  fetchLeaveRequestById,
  createLeaveRequest,
  updateLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  cancelLeaveRequest,
  deleteLeaveRequest,
  HR_LEAVE_STATUSES,
} from '../../services/hrLeaveService';
import type {
  LeaveRequestFilters,
  LeaveRequestOptions,
  LeaveRequestRecord,
  LeaveRequestsData,
  LeaveStatus,
} from '../../services/hrLeaveService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

function orgPath(rec: LeaveRequestRecord): string {
  const d = rec.employee.department;
  if (!d) return '—';
  return [d.division?.name, d.section?.name, d.name].filter(Boolean).join(' / ');
}

const renderEmployeeCell = (rec: LeaveRequestRecord) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{rec.employee.employeeCode}</div>
    <div className="erp-ar-emp__name">
      {rec.employee.firstName} {rec.employee.lastName}
    </div>
  </div>
);

const LeaveManagement: React.FC = () => {
  const { message, modal } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LeaveRequestsData | null>(null);
  const [options, setOptions] = useState<LeaveRequestOptions | null>(null);

  const [dateFrom, setDateFrom] = useState<Dayjs | null>(null);
  const [dateTo, setDateTo] = useState<Dayjs | null>(null);
  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [leaveTypeId, setLeaveTypeId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<LeaveStatus | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState<LeaveRequestFilters>({ page: 1, limit: 20 });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequestRecord | null>(null);
  const [viewing, setViewing] = useState<LeaveRequestRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (filters: LeaveRequestFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLeaveRequests(filters);
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
    fetchLeaveRequestOptions()
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    load(applied);
  }, [load, applied]);

  const buildFilters = (overrides: Partial<LeaveRequestFilters> = {}): LeaveRequestFilters => {
    const next: LeaveRequestFilters = { page: 1, limit: 20 };
    if (dateFrom) next.dateFrom = dateFrom.format('YYYY-MM-DD');
    if (dateTo) next.dateTo = dateTo.format('YYYY-MM-DD');
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (leaveTypeId) next.leaveTypeId = leaveTypeId;
    if (status) next.status = status;
    if (employeeId) next.employeeId = employeeId;
    if (search) next.search = search;
    Object.assign(next, overrides);
    return next;
  };

  const applyFilters = () => setApplied(buildFilters());

  const resetFilters = () => {
    setDateFrom(null);
    setDateTo(null);
    setDivisionId(undefined);
    setSectionId(undefined);
    setDepartmentId(undefined);
    setLeaveTypeId(undefined);
    setStatus(undefined);
    setEmployeeId(undefined);
    setSearch('');
    setApplied({ page: 1, limit: 20 });
  };

  const applyCascade = (next: Partial<LeaveRequestFilters>) => setApplied((prev) => ({ ...prev, ...next, page: 1 }));

  const kpis: Kpi[] = data
    ? [
        { key: 'pending', icon: <HourglassOutlined />, tone: 'warning', label: 'Pending', value: data.summary.pending, detail: 'Awaiting decision' },
        { key: 'approved', icon: <CheckCircleOutlined />, tone: 'success', label: 'Approved', value: data.summary.approved },
        { key: 'rejected', icon: <CloseCircleOutlined />, tone: 'danger', label: 'Rejected', value: data.summary.rejected },
        { key: 'onLeaveToday', icon: <CalendarOutlined />, tone: 'info', label: 'On Leave Today', value: data.summary.onLeaveToday, detail: 'From attendance' },
      ]
    : [];

  const handleCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      if (editing) {
        await updateLeaveRequest(editing.id, {
          leaveTypeId: v.leaveTypeId,
          startDate: v.startDate?.format('YYYY-MM-DD'),
          endDate: v.endDate?.format('YYYY-MM-DD'),
          reason: v.reason || null,
        });
        message.success('Leave request updated');
      } else {
        await createLeaveRequest({
          employeeId: v.employeeId || undefined,
          leaveTypeId: v.leaveTypeId,
          startDate: v.startDate?.format('YYYY-MM-DD'),
          endDate: v.endDate?.format('YYYY-MM-DD'),
          reason: v.reason || null,
        });
        message.success('Leave request submitted');
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
    if (options?.self.employeeId) form.setFieldsValue({ employeeId: options.self.employeeId });
    setAddOpen(true);
  };

  const openEdit = (rec: LeaveRequestRecord) => {
    setEditing(rec);
    form.setFieldsValue({
      employeeId: rec.employee.id,
      leaveTypeId: rec.leaveType?.id,
      startDate: rec.startDate ? dayjs(rec.startDate) : undefined,
      endDate: rec.endDate ? dayjs(rec.endDate) : undefined,
      reason: rec.reason ?? '',
    });
    setAddOpen(true);
  };

  const openDecision = (id: string, action: 'approve' | 'reject') => {
    setDecisionTarget({ id, action });
    setDecisionRemarks('');
  };

  const executeDecision = async () => {
    if (!decisionTarget) return;
    setDecisionSaving(true);
    try {
      if (decisionTarget.action === 'approve') {
        await approveLeaveRequest(decisionTarget.id, { remarks: decisionRemarks || undefined });
        message.success('Leave approved');
      } else {
        await rejectLeaveRequest(decisionTarget.id, { remarks: decisionRemarks || undefined });
        message.success('Leave rejected');
      }
      setDecisionTarget(null);
      load(applied);
    } catch (err) {
      message.error(describeRequestError(err));
    } finally {
      setDecisionSaving(false);
    }
  };

  const handleCancel = (id: string) => {
    modal.confirm({
      title: 'Cancel leave request',
      icon: <WarningOutlined style={{ color: 'var(--theme-accent, #faad14)' }} />,
      content: 'This will cancel the pending leave request. Continue?',
      okText: 'Yes, cancel',
      okButtonProps: { danger: true },
      cancelText: 'No',
      onOk: async () => {
        try {
          await cancelLeaveRequest(id);
          message.success('Leave cancelled');
          load(applied);
        } catch (err) {
          message.error(describeRequestError(err));
        }
      },
    });
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: 'Remove leave request',
      icon: <DeleteOutlined style={{ color: 'var(--theme-accent, #ff4d4f)' }} />,
      content: 'This will remove the leave record from view. This action cannot be undone. Continue?',
      okText: 'Yes, remove',
      okButtonProps: { danger: true },
      cancelText: 'No',
      onOk: async () => {
        try {
          await deleteLeaveRequest(id);
          message.success('Leave request removed');
          load(applied);
        } catch (err) {
          message.error(describeRequestError(err));
        }
      },
    });
  };

  const cols: ColumnsType<LeaveRequestRecord> = [
    {
      title: 'Employee',
      key: 'employee',
      render: (_, r) => renderEmployeeCell(r),
      sorter: (a, b) => (a.employee.employeeCode ?? '').localeCompare(b.employee.employeeCode ?? ''),
    },
    {
      title: 'Leave Type',
      key: 'leaveType',
      render: (_, r) => r.leaveType?.name ?? '—',
      width: 160,
    },
    { title: 'From', dataIndex: 'startDate', key: 'from', width: 110 },
    { title: 'To', dataIndex: 'endDate', key: 'to', width: 110 },
    { title: 'Days', dataIndex: 'days', key: 'days', width: 70, align: 'center' },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? 'default'}>{STATUS_LABELS[s] ?? s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 240,
      render: (_, r) => (
        <Space size={4}>
          <Tooltip title="View details">
            <Button size="small" icon={<EyeOutlined />} onClick={async () => {
              try {
                const rec = await fetchLeaveRequestById(r.id);
                setViewing(rec);
                setViewOpen(true);
              } catch (err) {
                message.error(describeRequestError(err));
              }
            }} />
          </Tooltip>
          {r.status === 'PENDING' && (
            <>
              <Tooltip title="Edit">
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
              </Tooltip>
              <Tooltip title="Approve">
                <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => openDecision(r.id, 'approve')} />
              </Tooltip>
              <Tooltip title="Reject">
                <Button size="small" danger icon={<CloseOutlined />} onClick={() => openDecision(r.id, 'reject')} />
              </Tooltip>
              <Tooltip title="Cancel">
                <Button size="small" icon={<StopOutlined />} onClick={() => handleCancel(r.id)} />
              </Tooltip>
            </>
          )}
          <Tooltip title="Remove record">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.id)} />
          </Tooltip>
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
        icon={<FilterOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />}
        title="Leave Requests"
        subtitle="Manage employee leave requests, approvals and decisions"
        showBreadcrumbs
      />
      <Card style={{ marginTop: 12 }}>
        {error && <Alert type="error" showIcon closable message={error} style={{ marginBottom: 12 }} />}
        <div className="erp-filter-bar">
          <DatePicker.RangePicker
            value={dateFrom && dateTo ? [dateFrom, dateTo] : null}
            onChange={(d) => {
              setDateFrom(d?.[0] ?? null);
              setDateTo(d?.[1] ?? null);
            }}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="Division"
            allowClear
            style={{ width: 160 }}
            value={divisionId}
            onChange={(v) => {
              setDivisionId(v);
              setSectionId(undefined);
              setDepartmentId(undefined);
              setEmployeeId(undefined);
            }}
            options={uniqueDivisions.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            placeholder="Section"
            allowClear
            style={{ width: 160 }}
            value={sectionId}
            onChange={(v) => {
              setSectionId(v);
              setDepartmentId(undefined);
              setEmployeeId(undefined);
            }}
            options={filteredSections.map((s) => ({ value: s.id, label: s.name }))}
          />
          <Select
            placeholder="Department"
            allowClear
            style={{ width: 170 }}
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setEmployeeId(undefined);
            }}
            options={filteredDepartments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <Select
            placeholder="Leave Type"
            allowClear
            style={{ width: 160 }}
            value={leaveTypeId}
            onChange={setLeaveTypeId}
            options={(options?.leaveTypes ?? []).map((t) => ({ value: t.id, label: `${t.code} — ${t.name}` }))}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 130 }}
            value={status}
            onChange={(v) => setStatus(v as LeaveStatus | undefined)}
            options={HR_LEAVE_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
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
            onPressEnter={() => applyCascade({ search: search || undefined })}
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
        title="Leave Request Records"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Request Leave
          </Button>
        }
        style={{ marginTop: 12 }}
      >
        <Table<LeaveRequestRecord>
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
          locale={{ emptyText: <EmptyState title="No leave requests" desc="Use Reset filters or request a new leave." /> }}
          scroll={{ x: 800 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <DraggableResizableModal
        title={editing ? 'Edit Leave Request' : 'Request Leave'}
        open={addOpen}
        onCancel={() => { setAddOpen(false); setEditing(null); }}
        onOk={handleCreate}
        okText={editing ? 'Save' : 'Submit'}
        confirmLoading={saving}
        width={520}
        height={480}
      >
        <Form form={form} layout="vertical">
          {editing || options?.self.employeeId ? (
            <Form.Item label="Employee">
              <Input
                value={
                  editing
                    ? `${editing.employee.firstName} ${editing.employee.lastName} (${editing.employee.employeeCode ?? ''})`
                    : `${options?.self.name ?? ''} (${options?.self.employeeCode ?? ''})`
                }
                disabled
              />
            </Form.Item>
          ) : (
            <Form.Item name="employeeId" label="Employee" rules={[{ required: true, message: 'Select an employee' }]}>
              <Select
                showSearch
                optionFilterProp="label"
                placeholder="Select employee"
                options={(options?.employees ?? []).map((e) => ({
                  value: e.id,
                  label: `${e.employeeCode} — ${e.firstName} ${e.lastName ?? ''}`,
                }))}
              />
            </Form.Item>
          )}
          <Form.Item name="leaveTypeId" label="Leave Type" rules={[{ required: true, message: 'Select a leave type' }]}>
            <Select
              placeholder="Select leave type"
              options={(options?.leaveTypes ?? []).map((t) => ({
                value: t.id,
                label: `${t.code} — ${t.name}`,
              }))}
            />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="startDate" label="From" rules={[{ required: true, message: 'Start date required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="endDate" label="To" rules={[{ required: true, message: 'End date required' }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="reason" label="Reason">
            <Input.TextArea rows={3} placeholder="Reason for leave (optional)" />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* View Modal */}
      <DraggableResizableModal
        title="Leave Request Details"
        open={viewOpen}
        onCancel={() => { setViewOpen(false); setViewing(null); }}
        footer={<Button onClick={() => { setViewOpen(false); setViewing(null); }}>Close</Button>}
        width={640}
        height={560}
      >
        {viewing && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Employee" span={2}>
                {viewing.employee.employeeCode} — {viewing.employee.firstName} {viewing.employee.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Department">
                {viewing.employee.department?.name ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Organization">
                {orgPath(viewing)}
              </Descriptions.Item>
              <Descriptions.Item label="Leave Type">
                {viewing.leaveType?.name ?? '—'} {viewing.leaveType?.daysPerYear != null ? `(${viewing.leaveType.daysPerYear} days/yr)` : ''}
              </Descriptions.Item>
              <Descriptions.Item label="Paid">{viewing.leaveType?.isPaid === true ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="From">{viewing.startDate}</Descriptions.Item>
              <Descriptions.Item label="To">{viewing.endDate}</Descriptions.Item>
              <Descriptions.Item label="Duration">{viewing.days} day{viewing.days !== 1 ? 's' : ''}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[viewing.status] ?? 'default'}>{STATUS_LABELS[viewing.status] ?? viewing.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Reason" span={2}>
                {viewing.reason || '—'}
              </Descriptions.Item>
              {viewing.remarks && (
                <Descriptions.Item label="Decision Remarks" span={2}>
                  {viewing.remarks}
                </Descriptions.Item>
              )}
              <Descriptions.Item label="Created By">{viewing.audit?.createdBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Created At">{viewing.audit?.createdAt ?? '—'}</Descriptions.Item>
              {viewing.audit?.approvedAt && (
                <>
                  <Descriptions.Item label="Decision By">{viewing.audit.approvedBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Decision At">{viewing.audit.approvedAt}</Descriptions.Item>
                </>
              )}
            </Descriptions>
          </>
        )}
      </DraggableResizableModal>

      {/* Decision Modal (Approve / Reject) */}
      <DraggableResizableModal
        title={decisionTarget?.action === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
        open={!!decisionTarget}
        onCancel={() => setDecisionTarget(null)}
        onOk={executeDecision}
        okText={decisionTarget?.action === 'approve' ? 'Approve' : 'Reject'}
        okButtonProps={{ danger: decisionTarget?.action === 'reject' }}
        confirmLoading={decisionSaving}
        width={440}
        height={260}
      >
        <Form layout="vertical">
          <Form.Item label="Decision Remarks">
            <Input.TextArea
              rows={3}
              value={decisionRemarks}
              onChange={(e) => setDecisionRemarks(e.target.value)}
              placeholder="Optional remarks for this decision"
            />
          </Form.Item>
        </Form>
      </DraggableResizableModal>
    </div>
  );
};

export default LeaveManagement;