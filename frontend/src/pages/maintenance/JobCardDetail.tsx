import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Row, Select, Space, Steps, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined, BuildOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import { LoadingState, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { JOB_CARD_BASE, JOB_CARD_FLOW, NEXT_ACTION_LABEL, STATUS_DESCRIPTION,
  JobCard, OrgOption, UUID_RE, uuidRowsOf, errorText, label, ACTION_MAP } from './jobCards.types';
import { PageHeader } from '../../components/shared';
import { MachineProfilePanel } from './MachineProfilePanel';
import { SparePartsPanel } from './SparePartsPanel';

const uName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.id)) || '—';
const companyName = (c: any) => (c && (c.legalName || c.tradeName || c.companyCode || c.name)) || 'Company unavailable';
const orLabel = (v: any, fb: string) => (v ? (v === 'N/A' ? fb : v) : fb);

type StepItem = {
  key: string;
  title: string;
  description: string;
  status: 'wait' | 'process' | 'finish' | 'error';
};

export const JobCardDetail: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [card, setCard] = useState<JobCard | null>(null);
  const [related, setRelated] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [prompt, setPrompt] = useState<null | { action: { label: string; endpoint: string; permission: string }; title: string; placeholder: string; required?: boolean }>(null);
  const [remarkValue, setRemarkValue] = useState('');
  const [categories, setCategories] = useState<OrgOption[]>([]);
  const [departments, setDepartments] = useState<OrgOption[]>([]);
  const [assignForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const [job, parts, logs, attachments, history, technicians] = await Promise.all([
        apiService.get<JobCard>(`${JOB_CARD_BASE}/${id}`),
        apiService.get<any[]>(`${JOB_CARD_BASE}/${id}/parts`),
        apiService.get<any[]>(`${JOB_CARD_BASE}/${id}/work-logs`),
        apiService.get<any[]>(`${JOB_CARD_BASE}/${id}/attachments`),
        apiService.get<any[]>(`${JOB_CARD_BASE}/${id}/history`),
        apiService.get<any[]>(`${JOB_CARD_BASE}/${id}/technicians`),
      ]);
      setCard(job); setRelated({ parts, logs, attachments, history, technicians });
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (card && searchParams.get('edit') === '1') setEditOpen(true); }, [card, searchParams]);
  useEffect(() => {
    if (!card) return;
    editForm.setFieldsValue({ complaint: card.complaint, complaintCategoryId: card.complaintCategoryId || undefined, assignedDepartmentId: card.assignedDepartmentId || undefined, description: card.description || undefined });
    const companyId = card.companyId; const divisionId = card.machine?.divisionId; const sectionId = card.machine?.sectionId;
    if (companyId) apiService.get<any>('/master-data/maintenance/categories/complaint', { companyId }).then(r => setCategories(uuidRowsOf(r))).catch(() => setCategories([]));
    if (companyId && divisionId && sectionId) apiService.get<any>('/departments', { companyId, divisionId, sectionId, limit: 100 }).then(r => setDepartments(uuidRowsOf(r))).catch(() => setDepartments([]));
  }, [card, editForm]);

  const run = async (action: { label: string; endpoint: string; permission: string }, body: any = {}) => {
    if (!id) return;
    setBusy(true);
    try { await apiService.post(`${JOB_CARD_BASE}/${id}/${action.endpoint}`, body); message.success(`${action.label} completed`); await load(); }
    catch (e) { message.error(errorText(e)); }
    finally { setBusy(false); }
  };

  const trigger = (action: { label: string; endpoint: string; permission: string }) => {
    if (action.endpoint === 'assign') { assignForm.resetFields(); setAssignOpen(true); return; }
    if (action.endpoint === 'reject') { setRemarkValue(''); setPrompt({ action, title: 'Reject this job card?', placeholder: 'Reason for rejection (required)', required: true }); return; }
    setRemarkValue('');
    setPrompt({ action, title: `${action.label} this job card?`, placeholder: 'Remarks (optional)' });
  };

  const confirm = async () => {
    if (!prompt) return;
    if (prompt.required && !remarkValue.trim()) { message.warning('Please provide a reason before continuing'); return; }
    const body = prompt.action.endpoint === 'reject' ? { reason: remarkValue.trim() || 'Rejected during review' } : (remarkValue.trim() ? { remarks: remarkValue.trim() } : {});
    setPrompt(null);
    await run(prompt.action, body);
  };

  const saveEdit = async (values: JobCard) => {
    if (!id) return;
    setBusy(true);
    try { await apiService.patch(`${JOB_CARD_BASE}/${id}`, { complaint: values.complaint, complaintCategoryId: values.complaintCategoryId || undefined, assignedDepartmentId: values.assignedDepartmentId || undefined, description: values.description || undefined }); message.success('Job card updated'); setEditOpen(false); await load(); }
    catch (e) { message.error(errorText(e)); }
    finally { setBusy(false); }
  };

  if (loading) return <LoadingState />;
  if (error) return <Alert type="error" message="Unable to load job card" description={error} action={<Button onClick={load}>Retry</Button>} />;
  if (!card) return <Empty description="Job card not found" />;

  const actions = (ACTION_MAP[card.currentStatus] || []).filter(a => can(a.permission));
  const primary = actions[0];
  const others = actions.slice(1);

  const buildSteps = (): StepItem[] => {
    const core: StepItem[] = [...JOB_CARD_FLOW].map(s => ({ key: s, title: label(s), description: STATUS_DESCRIPTION[s], status: 'wait' }));
    const cur = card.currentStatus;
    if (cur === 'REJECTED') {
      return core.concat([{ key: 'REJECTED', title: 'Rejected', description: STATUS_DESCRIPTION.REJECTED, status: 'error' }]);
    }
    if (cur === 'CANCELLED') {
      return core.concat([{ key: 'CANCELLED', title: 'Cancelled', description: STATUS_DESCRIPTION.CANCELLED, status: 'error' }]);
    }
    let list: StepItem[] = core;
    if (cur === 'ON_HOLD') {
      const ih = core.findIndex(s => s.key === 'IN_PROGRESS');
      list = [...core.slice(0, ih + 1), { key: 'ON_HOLD', title: label('ON_HOLD'), description: STATUS_DESCRIPTION.ON_HOLD, status: 'process' }, ...core.slice(ih + 1)];
    } else if (cur === 'WAITING_FOR_PARTS') {
      const ih = core.findIndex(s => s.key === 'IN_PROGRESS');
      list = [...core.slice(0, ih + 1), { key: 'WAITING_FOR_PARTS', title: label('WAITING_FOR_PARTS'), description: STATUS_DESCRIPTION.WAITING_FOR_PARTS, status: 'process' }, ...core.slice(ih + 1)];
    }
    const idx = list.findIndex(s => s.key === cur);
    if (idx < 0) return list;
    return list.map((s, i) => ({
      ...s,
      status: (i < idx ? 'finish' : i === idx ? 'process' : 'wait') as 'finish' | 'process' | 'wait',
    }));
  };
  const steps = buildSteps();

  const nextActionHeading = NEXT_ACTION_LABEL[card.currentStatus] || primary?.label || 'No pending action';
  const technicianRows = (related.technicians || []).slice().sort((a: any, b: any) => (a.role === 'PRIMARY' ? -1 : 1) - (b.role === 'PRIMARY' ? -1 : 1));
  const hasVerifiedActor = !!card.verifiedByUser || !!card.verifiedBy;
  const hasApprovedActor = !!card.approvedByUser || !!card.approvedBy;

  return <div>
    <PageHeader icon={<BuildOutlined />} title={card.jobCardNo || 'Maintenance Job Card'} subtitle="Maintenance work order" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs
      extra={<Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/maintenance/job-cards')}>Back</Button>} />
    <Row gutter={24}>
      <Col xs={24} lg={15}>
        <Card title={<>Job {card.jobCardNo || card.id}</>} style={{ marginBottom: 16 }} extra={<Space>{can('maintenance.job_card.update') && card.currentStatus !== 'APPROVED' && card.currentStatus !== 'CANCELLED' && <Button size="small" onClick={() => setEditOpen(true)}>Edit</Button>}<StatusBadge status={card.currentStatus} /></Space>}>
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label="Company">{companyName(card.company)}</Descriptions.Item>
            <Descriptions.Item label="Division">{card.division?.name || card.machine?.division?.name || 'Division unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Section">{card.section?.name || card.machine?.section?.name || 'Section unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Department">{card.machine?.department?.name || card.assignedDepartment?.name || 'Department unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Machine">{card.machine ? `${card.machine.machineCode || card.machine.machineNumber || ''} ${card.machine.name || ''}`.trim() || 'Machine unavailable' : 'Machine unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Priority"><StatusBadge status={card.priority} /></Descriptions.Item>
            <Descriptions.Item label="Type"><Tag color={card.maintenanceType === 'BREAKDOWN' ? 'red' : card.maintenanceType === 'PREVENTIVE' ? 'green' : card.maintenanceType === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(card.maintenanceType)}</Tag></Descriptions.Item>
            <Descriptions.Item label="Requested">{card.requestedAt ? new Date(card.requestedAt).toLocaleString() : '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="Workflow Steps" style={{ marginBottom: 16 }}>
          <Steps direction="vertical" size="small" current={steps.findIndex(s => s.status === 'process')} items={steps.map(s => ({ title: s.title, description: s.description, status: s.status }))} />
          {card.currentStatus === 'REJECTED' && <Alert style={{ marginTop: 12 }} type="error" showIcon message="Job card was rejected" description={(card.remarks || 'This job card was rejected during review and returned to the assignment workflow.')} />}
          {card.currentStatus === 'CANCELLED' && <Alert style={{ marginTop: 12 }} type="error" showIcon message="Job card cancelled" description={orLabel(card.remarks, 'This job card was cancelled and is no longer actionable.')} />}
        </Card>
        {card.machineId && <MachineProfilePanel machineId={card.machineId} compact />}
        <Card title="Complaint & Request" style={{ marginTop: 16, marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Complaint">{card.complaint}</Descriptions.Item>
            <Descriptions.Item label="Category">{card.complaintCategory?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Description">{card.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reported by">{uName(card.requestedByUser)}</Descriptions.Item>
            {card.diagnosis && <Descriptions.Item label="Diagnosis">{card.diagnosis}</Descriptions.Item>}
            {card.correctiveAction && <Descriptions.Item label="Corrective Action">{card.correctiveAction}</Descriptions.Item>}
            {card.preventiveAction && <Descriptions.Item label="Preventive Action">{card.preventiveAction}</Descriptions.Item>}
          </Descriptions>
        </Card>
        <Card style={{ marginBottom: 16 }}>
          <Tabs defaultActiveKey="history" items={[
            { key: 'history', label: 'Status History', children: (related.history || []).length ? <Timeline items={(related.history || []).map((h: any) => ({
              color: h.toStatus === 'REJECTED' || h.toStatus === 'CANCELLED' ? 'red' : h.toStatus === 'APPROVED' ? 'green' : 'blue',
              children: <div><Typography.Text strong>{label(h.fromStatus)} → {label(h.toStatus)}</Typography.Text>{h.remarks ? <div><Typography.Text type="secondary">{h.remarks}</Typography.Text></div> : null}<div><Typography.Text type="secondary">by {uName(h.changedByUser)} · {h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</Typography.Text></div></div>,
            }))} /> : <Empty description="No status history yet" /> },
            { key: 'parts', label: 'Parts', children: <SparePartsPanel jobCardId={card.id} companyId={card.companyId} isEditable={card.currentStatus !== 'APPROVED' && card.currentStatus !== 'CANCELLED'} onUpdate={load} /> },
            { key: 'logs', label: 'Work Logs', children: <Table rowKey="id" pagination={false} dataSource={related.logs || []} locale={{ emptyText: <Empty description="No work logs" /> }} columns={[{ title: 'Work', dataIndex: 'workDescription' }, { title: 'Remarks', dataIndex: 'remarks' }, { title: 'Created', dataIndex: 'createdAt', render: (v: string) => v && new Date(v).toLocaleString() }]} /> },
            { key: 'attachments', label: 'Attachments', children: related.attachments?.length ? <Table rowKey="id" pagination={false} dataSource={related.attachments} columns={[{ title: 'File', dataIndex: 'fileName' }, { title: 'Description', dataIndex: 'description' }, { title: 'Uploaded', dataIndex: 'createdAt', render: (v: string) => v && new Date(v).toLocaleString() }]} /> : <Empty description="No attachments" /> },
            { key: 'technicians', label: 'Technicians', children: related.technicians?.length ? <Table rowKey="id" pagination={false} dataSource={related.technicians} columns={[{ title: 'Technician', render: (_: any, r: any) => uName(r.technicianUser) }, { title: 'Role', dataIndex: 'role' }, { title: 'Assigned', dataIndex: 'assignedAt', render: (v: string) => v && new Date(v).toLocaleString() }]} /> : <Empty description="No technicians assigned yet" /> },
          ]} />
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        <Card title={<>Next Action <Tag color="geekblue">{nextActionHeading}</Tag></>} style={{ marginBottom: 16 }}>
          <Typography.Paragraph type="secondary">{STATUS_DESCRIPTION[card.currentStatus]}</Typography.Paragraph>
          {actions.length ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {primary && <Button type="primary" size="large" block disabled={busy} loading={busy} icon={primary.endpoint === 'verify' || primary.endpoint === 'approve' ? <CheckCircleFilled /> : undefined} onClick={() => trigger(primary)}>{primary.label}</Button>}
              {others.map(a => <Button key={a.endpoint} block disabled={busy} onClick={() => trigger(a)}>{a.label}</Button>)}
              {primary?.endpoint === 'approve' && <Button danger block disabled={busy} onClick={() => trigger({ label: 'Reject', endpoint: 'reject', permission: primary.permission })}>Reject</Button>}
            </Space>
          ) : (
            card.currentStatus === 'APPROVED' ? <Alert type="success" showIcon icon={<CheckCircleFilled />} message="Approved" description={<>Job card approved {hasApprovedActor ? `by ${uName(card.approvedByUser)}` : ''}{card.approvedAt ? ` on ${new Date(card.approvedAt).toLocaleString()}` : ''}. No further action required.</>} />
              : card.currentStatus === 'REJECTED' ? <Alert type="error" showIcon message="Rejected" description="Contact the assigner to correct and re-assign this job card." />
              : <Alert type="info" showIcon message="No actionable step" description="Either this job card is waiting on another party or you lack permission for the next step." />
          )}
        </Card>
        <Card title="Responsibilities & Actor Trail" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Assigned Technician">{technicianRows.length ? technicianRows.map((t: any) => <div key={t.id}>{(t.technicianUser && uName(t.technicianUser)) || t.technicianUserId} {t.role === 'PRIMARY' && <Tag>PRIMARY</Tag>}</div>) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Requested By">{uName(card.requestedByUser)}</Descriptions.Item>
            <Descriptions.Item label="Started By">{card.startedByUser ? `${uName(card.startedByUser)}${card.startedAt ? ' · ' + new Date(card.startedAt).toLocaleString() : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Completed By">{card.completedByUser ? `${uName(card.completedByUser)}${card.completedAt ? ' · ' + new Date(card.completedAt).toLocaleString() : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Closed By">{card.closedByUser ? `${uName(card.closedByUser)}${card.closedAt ? ' · ' + new Date(card.closedAt).toLocaleString() : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Verified By">{card.verifiedByUser ? `${uName(card.verifiedByUser)}${card.verifiedAt ? ' · ' + new Date(card.verifiedAt).toLocaleString() : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Approved By">{card.approvedByUser ? `${uName(card.approvedByUser)}${card.approvedAt ? ' · ' + new Date(card.approvedAt).toLocaleString() : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Remarks">{card.remarks || '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
        {card.currentStatus === 'PENDING_VERIFICATION' && <Card title="Verification" size="small" style={{ marginBottom: 16 }}><Alert type="warning" showIcon message="Awaiting verification" description={<>This job card was submitted for verification by the requester / responsible person{(card.verifiedByUser || hasVerifiedActor) ? '' : ' to confirm the completed work.'}</>} /></Card>}
      </Col>
    </Row>

    <Modal title="Edit job card" open={editOpen} confirmLoading={busy} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()}>
      <Form form={editForm} layout="vertical" onFinish={saveEdit}>
        <Form.Item name="complaint" label="Complaint" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="complaintCategoryId" label="Complaint category"><Select allowClear options={categories.map(category => ({ value: category.id, label: category.name || category.code || category.id }))} /></Form.Item>
        <Form.Item name="assignedDepartmentId" label="Department"><Select allowClear options={departments.map(department => ({ value: department.id, label: department.name || department.code || department.id }))} /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Assign technicians" open={assignOpen} confirmLoading={busy} onCancel={() => setAssignOpen(false)} onOk={() => assignForm.submit()}>
      <Form form={assignForm} layout="vertical" onFinish={async values => { await run({ label: 'Assignment', endpoint: 'assign', permission: 'maintenance.job_card.assign' }, { technicianUserIds: values.technicianUserIds.split(',').map((v: string) => v.trim()).filter(Boolean), teamCode: values.teamCode, remarks: values.remarks }); setAssignOpen(false); }}>
        <Form.Item name="technicianUserIds" label="Technician user IDs (comma separated)" rules={[{ required: true }]}><Input placeholder="UUID, UUID" /></Form.Item>
        <Form.Item name="teamCode" label="Team code"><Input /></Form.Item>
        <Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
    <Modal title={prompt?.title} open={!!prompt} confirmLoading={busy} onCancel={() => setPrompt(null)} onOk={confirm} okText={prompt?.action.label} okButtonProps={{ danger: prompt?.action.endpoint === 'reject' }}>
      <Input.TextArea rows={3} placeholder={prompt?.placeholder} value={remarkValue} onChange={e => setRemarkValue(e.target.value)} autoFocus />
    </Modal>
  </div>;
};

export default JobCardDetail;