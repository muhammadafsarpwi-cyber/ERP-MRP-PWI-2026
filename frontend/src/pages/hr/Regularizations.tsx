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
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FilterOutlined,
  HourglassOutlined,
  PlusOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import PageHeader from '../../components/shared/PageHeader';
import { EmptyState, KpiCard } from '../../components/dashboard/dashboardShared';
import DraggableResizableModal from '../../components/shared/DraggableResizableModal';
import { describeRequestError } from '../../services/api';
import {
  fetchRegularizations,
  fetchRegularizationOptions,
  fetchRegularizationById,
  createRegularization,
  updateRegularization,
  approveRegularization,
  rejectRegularization,
  deleteRegularization,
  HR_REGULARIZATION_STATUSES,
  HR_REGULARIZATION_TYPES,
  HR_REGULARIZATION_REASONS,
} from '../../services/hrRegularizationService';
import type {
  RegularizationFilters,
  RegularizationOptions,
  RegularizationRecord,
  RegularizationsData,
  RegularizationStatus,
  RegularizationType,
  RegularizationReason,
} from '../../services/hrRegularizationService';
import '../dashboard/dashboard.css';
import './hr-dashboard.css';

const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'processing',
  APPROVED: 'green',
  REJECTED: 'red',
};

const TYPE_LABELS: Record<string, string> = {
  CHECK_IN: 'Check In',
  CHECK_OUT: 'Check Out',
  CHECK_IN_OUT: 'Check In & Out',
  STATUS: 'Status',
};

const REASON_LABELS: Record<string, string> = {
  MISSING_CHECK_IN: 'Missing Check In',
  MISSING_CHECK_OUT: 'Missing Check Out',
  WRONG_CHECK_IN: 'Wrong Check In',
  WRONG_CHECK_OUT: 'Wrong Check Out',
  STATUS_ERROR: 'Status Error',
  FORGOT_TO_PUNCH: 'Forgot to Punch',
  DEVICE_ISSUE: 'Device Issue',
  OFFICIAL_DUTY: 'Official Duty',
  OTHER: 'Other',
};

const STATUS_OPTIONS: Record<string, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  WEEKEND: 'Weekend',
  HOLIDAY: 'Holiday',
  HALF_DAY: 'Half Day',
  LATE: 'Late',
  EARLY: 'Early',
};

interface Kpi {
  key: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
  label: string;
  value: number;
  detail?: string;
}

function orgPath(rec: RegularizationRecord): string {
  const d = rec.employee.department;
  if (!d) return '—';
  return [d.division?.name, d.section?.name, d.name].filter(Boolean).join(' / ');
}

function fmtTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const renderEmployeeCell = (rec: RegularizationRecord) => (
  <div className="erp-ar-emp">
    <div className="erp-ar-emp__code">{rec.employee.employeeCode}</div>
    <div className="erp-ar-emp__name">
      {rec.employee.firstName} {rec.employee.lastName}
    </div>
  </div>
);

const Regularizations: React.FC = () => {
  const { message, modal } = AntApp.useApp();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RegularizationsData | null>(null);
  const [options, setOptions] = useState<RegularizationOptions | null>(null);

  const [divisionId, setDivisionId] = useState<string | undefined>(undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<RegularizationStatus | undefined>(undefined);
  const [correctionType, setCorrectionType] = useState<RegularizationType | undefined>(undefined);
  const [employeeId, setEmployeeId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined);
  const [dateTo, setDateTo] = useState<string | undefined>(undefined);
  const [applied, setApplied] = useState<RegularizationFilters>({ page: 1, limit: 20 });

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<RegularizationRecord | null>(null);
  const [viewing, setViewing] = useState<RegularizationRecord | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [decisionRemarks, setDecisionRemarks] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (filters: RegularizationFilters) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchRegularizations(filters);
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
    fetchRegularizationOptions()
      .then((opts) => { if (mounted) setOptions(opts); })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    load(applied);
  }, [load, applied]);

  const buildFilters = (overrides: Partial<RegularizationFilters> = {}): RegularizationFilters => {
    const next: RegularizationFilters = { page: 1, limit: 20 };
    if (divisionId) next.divisionId = divisionId;
    if (sectionId) next.sectionId = sectionId;
    if (departmentId) next.departmentId = departmentId;
    if (status) next.status = status;
    if (correctionType) next.correctionType = correctionType;
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
    setStatus(undefined);
    setCorrectionType(undefined);
    setEmployeeId(undefined);
    setSearch('');
    setDateFrom(undefined);
    setDateTo(undefined);
    setApplied({ page: 1, limit: 20 });
  };

  const kpis: Kpi[] = data
    ? [
        { key: 'submitted', icon: <HourglassOutlined />, tone: 'warning', label: 'Submitted', value: data.summary.submitted, detail: 'Awaiting decision' },
        { key: 'approved', icon: <CheckCircleOutlined />, tone: 'success', label: 'Approved', value: data.summary.approved },
        { key: 'rejected', icon: <CloseCircleOutlined />, tone: 'danger', label: 'Rejected', value: data.summary.rejected },
        { key: 'today', icon: <ClockCircleOutlined />, tone: 'info', label: 'Today', value: data.summary.today, detail: 'Submitted today' },
      ]
    : [];

  const needsCheckIn = (type: string | undefined) =>
    type === 'CHECK_IN' || type === 'CHECK_IN_OUT';
  const needsCheckOut = (type: string | undefined) =>
    type === 'CHECK_OUT' || type === 'CHECK_IN_OUT';
  const needsStatus = (type: string | undefined) =>
    type === 'STATUS';

  const handleCreate = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      const payload: any = {
        attendanceDate: v.attendanceDate?.format('YYYY-MM-DD'),
        correctionType: v.correctionType,
        reason: v.reason,
        remarks: v.remarks || null,
      };
      if (!options?.self?.employeeId) {
        payload.employeeId = v.employeeId;
      }
      const attDate = v.attendanceDate?.format('YYYY-MM-DD') || '';
      if (needsCheckIn(v.correctionType) && v.requestedCheckIn) {
        payload.requestedCheckIn = `${attDate}T${v.requestedCheckIn.format('HH:mm:ss')}`;
      }
      if (needsCheckOut(v.correctionType) && v.requestedCheckOut) {
        payload.requestedCheckOut = `${attDate}T${v.requestedCheckOut.format('HH:mm:ss')}`;
      }
      if (needsStatus(v.correctionType)) payload.requestedStatus = v.requestedStatus || null;

      if (editing) {
        await updateRegularization(editing.id, {
          correctionType: v.correctionType,
          reason: v.reason,
          requestedCheckIn: payload.requestedCheckIn,
          requestedCheckOut: payload.requestedCheckOut,
          requestedStatus: payload.requestedStatus,
          remarks: payload.remarks,
        });
        message.success('Regularization updated');
      } else {
        await createRegularization(payload);
        message.success('Regularization submitted successfully.');
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

  const openEdit = (rec: RegularizationRecord) => {
    setEditing(rec);
    form.setFieldsValue({
      correctionType: rec.correctionType,
      reason: rec.reason,
      attendanceDate: rec.attendanceDate ? dayjs(rec.attendanceDate) : undefined,
      requestedCheckIn: rec.requestedCheckIn ? dayjs(rec.requestedCheckIn) : undefined,
      requestedCheckOut: rec.requestedCheckOut ? dayjs(rec.requestedCheckOut) : undefined,
      requestedStatus: rec.requestedStatus ?? undefined,
      remarks: rec.remarks ?? '',
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
        await approveRegularization(decisionTarget.id, { remarks: decisionRemarks || undefined });
        message.success('Regularization approved successfully.');
      } else {
        await rejectRegularization(decisionTarget.id, { remarks: decisionRemarks || undefined });
        message.success('Regularization rejected.');
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
      title: 'Remove regularization',
      icon: <DeleteOutlined style={{ color: 'var(--theme-accent, #ff4d4f)' }} />,
      content: 'This will remove the regularization record. This action cannot be undone. Continue?',
      okText: 'Yes, remove',
      okButtonProps: { danger: true },
      cancelText: 'No',
      onOk: async () => {
        try {
          await deleteRegularization(id);
          message.success('Regularization removed');
          load(applied);
        } catch (err) {
          message.error(describeRequestError(err));
        }
      },
    });
  };

  const cols: ColumnsType<RegularizationRecord> = [
    {
      title: 'Request No',
      dataIndex: 'requestNo',
      key: 'requestNo',
      width: 140,
    },
    {
      title: 'Employee',
      key: 'employee',
      render: (_, r) => renderEmployeeCell(r),
      sorter: (a, b) => (a.employee.employeeCode ?? '').localeCompare(b.employee.employeeCode ?? ''),
    },
    {
      title: 'Date',
      dataIndex: 'attendanceDate',
      key: 'attendanceDate',
      width: 110,
    },
    {
      title: 'Type',
      dataIndex: 'correctionType',
      key: 'correctionType',
      width: 120,
      render: (s: string) => TYPE_LABELS[s] ?? s,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      width: 140,
      render: (s: string) => REASON_LABELS[s] ?? s,
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
            <Button size="small" icon={<EyeOutlined />} onClick={async () => {
              try {
                const rec = await fetchRegularizationById(r.id);
                setViewing(rec);
                setViewOpen(true);
              } catch (err) {
                message.error(describeRequestError(err));
              }
            }} />
          </Tooltip>
          {r.status === 'SUBMITTED' && (
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
            </>
          )}
          {r.status === 'SUBMITTED' && (
            <Tooltip title="Remove record">
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

  const selectedCorrectionType = Form.useWatch('correctionType', form) as string | undefined;

  return (
    <div>
      <PageHeader
        icon={<EditOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />}
        title="Regularizations"
        subtitle="Manage attendance regularization requests and approvals"
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
            placeholder="Correction Type"
            allowClear
            style={{ width: 150 }}
            value={correctionType}
            onChange={(v) => setCorrectionType(v as RegularizationType | undefined)}
            options={HR_REGULARIZATION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
          />
          <Select
            placeholder="Status"
            allowClear
            style={{ width: 130 }}
            value={status}
            onChange={(v) => setStatus(v as RegularizationStatus | undefined)}
            options={HR_REGULARIZATION_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s }))}
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
        title="Regularization Records"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Submit Regularization
          </Button>
        }
        style={{ marginTop: 12 }}
      >
        <Table<RegularizationRecord>
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
          locale={{ emptyText: <EmptyState title="No regularization requests" desc="Submit a new regularization request to get started." /> }}
          scroll={{ x: 900 }}
        />
      </Card>

      {/* Create / Edit Modal */}
      <DraggableResizableModal
        title={editing ? 'Edit Regularization' : 'Submit Regularization'}
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
          <Form.Item name="attendanceDate" label="Attendance Date" rules={[{ required: true, message: 'Select date' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="correctionType" label="Correction Type" rules={[{ required: true, message: 'Select type' }]}>
                <Select
                  placeholder="Select type"
                  options={HR_REGULARIZATION_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] ?? t }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Select reason' }]}>
                <Select
                  placeholder="Select reason"
                  options={HR_REGULARIZATION_REASONS.map((r) => ({ value: r, label: REASON_LABELS[r] ?? r }))}
                />
              </Form.Item>
            </Col>
          </Row>
          {needsCheckIn(selectedCorrectionType) && (
            <Form.Item name="requestedCheckIn" label="Requested Check In">
              <DatePicker picker="time" format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          )}
          {needsCheckOut(selectedCorrectionType) && (
            <Form.Item name="requestedCheckOut" label="Requested Check Out">
              <DatePicker picker="time" format="HH:mm" style={{ width: '100%' }} />
            </Form.Item>
          )}
          {needsStatus(selectedCorrectionType) && (
            <Form.Item name="requestedStatus" label="Requested Status" rules={[{ required: true, message: 'Select status' }]}>
              <Select
                placeholder="Select status"
                options={Object.entries(STATUS_OPTIONS).map(([k, v]) => ({ value: k, label: v }))}
              />
            </Form.Item>
          )}
          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={3} placeholder="Additional remarks (optional)" />
          </Form.Item>
        </Form>
      </DraggableResizableModal>

      {/* View Modal */}
      <DraggableResizableModal
        title="Regularization Details"
        open={viewOpen}
        onCancel={() => { setViewOpen(false); setViewing(null); }}
        footer={<Button onClick={() => { setViewOpen(false); setViewing(null); }}>Close</Button>}
        width={680}
        height={600}
      >
        {viewing && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Request No">{viewing.requestNo}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={STATUS_COLORS[viewing.status] ?? 'default'}>{STATUS_LABELS[viewing.status] ?? viewing.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Employee" span={2}>
                {viewing.employee.employeeCode} — {viewing.employee.firstName} {viewing.employee.lastName}
              </Descriptions.Item>
              <Descriptions.Item label="Organization">{orgPath(viewing)}</Descriptions.Item>
              <Descriptions.Item label="Date">{viewing.attendanceDate}</Descriptions.Item>
              <Descriptions.Item label="Type">{TYPE_LABELS[viewing.correctionType] ?? viewing.correctionType}</Descriptions.Item>
              <Descriptions.Item label="Reason">{REASON_LABELS[viewing.reason] ?? viewing.reason}</Descriptions.Item>
              <Descriptions.Item label="Current Check In">{fmtTime(viewing.currentCheckIn)}</Descriptions.Item>
              <Descriptions.Item label="Current Check Out">{fmtTime(viewing.currentCheckOut)}</Descriptions.Item>
              <Descriptions.Item label="Current Status">{viewing.currentStatus ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Requested Check In">{fmtTime(viewing.requestedCheckIn)}</Descriptions.Item>
              <Descriptions.Item label="Requested Check Out">{fmtTime(viewing.requestedCheckOut)}</Descriptions.Item>
              <Descriptions.Item label="Requested Status">{viewing.requestedStatus ?? '—'}</Descriptions.Item>
              {viewing.status === 'APPROVED' && (
                <>
                  <Descriptions.Item label="Approved Check In">{fmtTime(viewing.approvedCheckIn)}</Descriptions.Item>
                  <Descriptions.Item label="Approved Check Out">{fmtTime(viewing.approvedCheckOut)}</Descriptions.Item>
                  <Descriptions.Item label="Approved Status" span={2}>{viewing.approvedStatus ?? '—'}</Descriptions.Item>
                </>
              )}
              <Descriptions.Item label="Remarks" span={2}>{viewing.remarks || '—'}</Descriptions.Item>
              {viewing.decisionRemarks && (
                <Descriptions.Item label="Decision Remarks" span={2}>{viewing.decisionRemarks}</Descriptions.Item>
              )}
              <Descriptions.Item label="Submitted By">{viewing.audit?.createdBy ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Submitted At">{viewing.submittedAt ?? '—'}</Descriptions.Item>
              {viewing.decidedAt && (
                <>
                  <Descriptions.Item label="Decided By">{viewing.audit?.decidedBy ?? '—'}</Descriptions.Item>
                  <Descriptions.Item label="Decided At">{viewing.decidedAt}</Descriptions.Item>
                </>
              )}
            </Descriptions>
          </>
        )}
      </DraggableResizableModal>

      {/* Decision Modal */}
      <DraggableResizableModal
        title={decisionTarget?.action === 'approve' ? 'Approve Regularization' : 'Reject Regularization'}
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

export default Regularizations;
