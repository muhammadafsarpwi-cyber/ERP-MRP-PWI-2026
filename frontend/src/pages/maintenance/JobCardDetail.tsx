import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Empty, Form, Input, Modal, Radio, Row, Select, Space, Steps, Table, Tabs, Tag, Timeline, Typography } from 'antd';
import { ArrowLeftOutlined, EditOutlined, FileProtectOutlined, ReloadOutlined, TeamOutlined, CheckCircleFilled, PlayCircleFilled } from '@ant-design/icons';
import type { HeaderAction } from '../../components/layout/headerActionsStore';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import { LoadingState, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { JOB_CARD_BASE, JOB_CARD_FLOW, NEXT_ACTION_LABEL, STATUS_DESCRIPTION,
  JobCard, OrgOption, uuidRowsOf, rowsOf, errorText, label, categoryLabel, ACTION_MAP } from './jobCards.types';
import { MachineProfilePanel } from './MachineProfilePanel';
import { SparePartsPanel } from './SparePartsPanel';

const uName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.userName)) || '—';
const companyName = (c: any) => (c && (c.legalName || c.tradeName || c.companyCode || c.name)) || 'Company unavailable';
const orLabel = (v: any, fb: string) => (v ? (v === 'N/A' ? fb : v) : fb);

const techLabel = (r: any) => {
  const master = r?.technician;
  if (master) {
    const name = master.technicianName || '';
    const id = master.employeeId || '';
    return id ? `${name} — ${id}` : (name || 'Technician');
  }
  return uName(r?.technicianUser);
};

const fmtDt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

const durText = (from?: string, toMs?: number) => {
  if (!from) return '—';
  const f = new Date(from).getTime();
  if (Number.isNaN(f) || toMs === undefined || toMs === null || toMs < f) return '—';
  const mins = Math.round((toMs - f) / 60000);
  if (mins < 1) return '<1m';
  const d = Math.floor(mins / 1440); const h = Math.floor((mins % 1440) / 60); const m = mins % 60;
  return [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || `${mins}m`;
};

const HEADER_EP: Record<string, string> = {
  OPEN: 'start',
  ASSIGNED: 'start',
  IN_PROGRESS: 'complete',
  ON_HOLD: 'resume',
  WAITING_FOR_PARTS: 'resume',
  COMPLETED: 'close',
  CLOSED: 'submit-for-verification',
  PENDING_VERIFICATION: 'verify',
  VERIFIED: 'approve',
  REJECTED: 'submit-for-verification',
};

const HEADER_LABEL: Record<string, string> = {
  assign: 'Assign',
  start: 'Start Job',
  complete: 'Close Job',
  resume: 'Resume',
  close: 'Close (Final)',
  'submit-for-verification': 'Submit for Review',
  verify: 'Review',
  approve: 'Approve',
};

const actIcon = (endpoint: string) => {
  if (endpoint === 'assign') return <TeamOutlined />;
  if (endpoint === 'start' || endpoint === 'resume') return <PlayCircleFilled />;
  if (endpoint === 'complete' || endpoint === 'verify' || endpoint === 'approve') return <CheckCircleFilled />;
  return undefined;
};

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
  const [startForm] = Form.useForm();
  const [completeForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [technicianOptions, setTechnicianOptions] = useState<any[]>([]);
  const [teamOptions, setTeamOptions] = useState<OrgOption[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<null | { label: string; endpoint: string; permission: string }>(null);
  const [rootCategories, setRootCategories] = useState<OrgOption[]>([]);
  const [failureCategories, setFailureCategories] = useState<OrgOption[]>([]);

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

  const loadAssignOptions = useCallback(async () => {
    if (!card) return;
    const tasks: Promise<any>[] = [];
    if (!technicianOptions.length) {
      tasks.push(apiService.get<any>('/master-data/maintenance/technicians', { active: 'true' }).then(list => setTechnicianOptions((rowsOf(list) || []).filter((t: any) => t && t.id))));
    }
    if (!teamOptions.length && card.companyId) {
      tasks.push(apiService.get<any>('/master-data/maintenance/teams', { companyId: card.companyId, limit: 200 }).then(ts => setTeamOptions(uuidRowsOf(ts))));
    }
    if (!tasks.length) return;
    setAssignLoading(true);
    try { await Promise.all(tasks); }
    catch (e) { message.warning(`Could not load assignment options: ${errorText(e)}`); }
    finally { setAssignLoading(false); }
  }, [card, technicianOptions.length, teamOptions.length, message]);

  const openAssign = useCallback(async () => {
    if (!card) return;
    assignForm.resetFields();
    await loadAssignOptions();
    const existing = (related.technicians || []).map((t: any) => t.technicianId).filter(Boolean);
    assignForm.setFieldsValue({ technicianIds: existing, remarks: undefined });
    setAssignOpen(true);
  }, [card, related.technicians, assignForm, loadAssignOptions]);

  const openStart = useCallback(async () => {
    if (!card) return;
    startForm.resetFields();
    await loadAssignOptions();
    const existing = (related.technicians || []).map((t: any) => t.technicianId).filter(Boolean);
    const previousRemarks = (related.technicians || []).find((t: any) => t.remarks)?.remarks;
    startForm.setFieldsValue({
      technicianIds: existing,
      teamCode: card.team?.code || undefined,
      remarks: previousRemarks || card.remarks || undefined,
    });
    setStartOpen(true);
  }, [card, related.technicians, startForm, loadAssignOptions]);

  const openComplete = useCallback(() => {
    if (!card) return;
    completeForm.resetFields();
    completeForm.setFieldsValue({
      rootCauseCategoryId: card.rootCauseCategoryId || undefined,
      failureCategoryId: card.failureCategoryId || undefined,
      diagnosis: card.diagnosis || undefined,
      correctiveAction: card.correctiveAction || undefined,
      preventiveAction: card.preventiveAction || undefined,
    });
    if (card.companyId && (!rootCategories.length || !failureCategories.length)) {
      apiService.get<any>('/master-data/maintenance/categories/root-cause', { companyId: card.companyId }).then(r => setRootCategories(uuidRowsOf(r))).catch(() => setRootCategories([]));
      apiService.get<any>('/master-data/maintenance/categories/failure', { companyId: card.companyId }).then(r => setFailureCategories(uuidRowsOf(r))).catch(() => setFailureCategories([]));
    }
    setCompleteOpen(true);
  }, [card, completeForm, rootCategories.length, failureCategories.length]);

  const openReview = useCallback((action: { label: string; endpoint: string; permission: string }) => {
    reviewForm.setFieldsValue({ remarks: '' });
    setReviewAction(action);
    setReviewOpen(true);
  }, [reviewForm]);

  const openFor = useCallback((action: { label: string; endpoint: string; permission: string }) => {
    if (action.endpoint === 'assign') { void openAssign(); return; }
    if (action.endpoint === 'start') { void openStart(); return; }
    if (action.endpoint === 'complete') { openComplete(); return; }
    if (action.endpoint === 'verify' || action.endpoint === 'reject') { openReview(action); return; }
    setRemarkValue('');
    setPrompt({ action, title: `${action.label} this job card?`, placeholder: 'Remarks (optional)' });
  }, [openAssign, openStart, openComplete, openReview]);

  useEffect(() => {
    const { setHeaderTitle } = useHeaderActions.getState();
    setHeaderTitle(card?.jobCardNo ? `Maintenance Job Card ${card.jobCardNo}` : 'Maintenance Job Card', <FileProtectOutlined />);
    return () => { useHeaderActions.getState().clearHeaderTitle(); };
  }, [card?.jobCardNo]);

  useEffect(() => {
    const { setHeaderActions } = useHeaderActions.getState();
    const editable = card && card.currentStatus !== 'APPROVED' && card.currentStatus !== 'CANCELLED';
    const canEdit = editable && can('maintenance.job_card.update');
    const statusActions = (ACTION_MAP[card?.currentStatus || ''] || []).filter(a => can(a.permission));
    const headerAction = card ? statusActions.find(a => a.endpoint === HEADER_EP[card.currentStatus]) : null;
    const headerLabel = headerAction ? ((card?.currentStatus === 'REJECTED' && headerAction.endpoint === 'submit-for-verification')
      ? 'Resubmit for Review'
      : (HEADER_LABEL[headerAction.endpoint] || headerAction.label)) : null;
    const list: HeaderAction[] = [
      { key: 'back', node: <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/maintenance/job-cards')}>Back</Button> },
      ...(headerAction && headerLabel ? [{ key: headerAction.endpoint, node: <Button type="primary" icon={actIcon(headerAction.endpoint)} onClick={() => openFor(headerAction)}>{headerLabel}</Button> }] : []),
      ...(canEdit ? [{ key: 'edit', node: <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>Edit</Button> }] : []),
      { key: 'refresh', node: <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>Refresh</Button> },
    ];
    setHeaderActions(list);
    return () => { useHeaderActions.getState().clearHeaderActions(); };
  }, [card, can, loading, load, navigate, openFor]);

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

  const pendingSince = (related.history || [])
    .filter((h: any) => h && h.toStatus === 'PENDING_VERIFICATION')
    .map((h: any) => h.changedAt)
    .filter(Boolean)
    .sort()
    .pop() as string | undefined;
  const sparePartsText = (() => {
    const partsUsed = related.parts || [];
    if (!partsUsed.length) return '—';
    return partsUsed.map((p: any) => {
      const item = p.item || p;
      const code = item.itemCode || item.item_code || '';
      const name = item.name || p.itemName || p.item_name || '';
      const part = `${code ? `${code} ` : ''}${name}`.trim() || 'Part';
      return typeof p.quantity !== 'undefined' && p.quantity !== null ? `${part} × ${p.quantity}` : part;
    }).join(', ');
  })();
  const technicianRemarks = (related.technicians || []).map((t: any) => t.remarks).filter(Boolean) as string[];

  const submitStart = async (values: any) => {
    const technicianIds = Array.from(new Set((values.technicianIds || []).map((v: string) => String(v).trim()).filter(Boolean)));
    await run({ label: 'Start Job', endpoint: 'start', permission: 'maintenance.job_card.start' }, { technicianIds, teamCode: values.teamCode || undefined, remarks: values.remarks || undefined });
    setStartOpen(false);
  };

  const submitComplete = async (values: any) => {
    await run({ label: 'Complete', endpoint: 'complete', permission: 'maintenance.job_card.complete' }, {
      rootCauseCategoryId: values.rootCauseCategoryId ? String(values.rootCauseCategoryId).trim() : undefined,
      failureCategoryId: values.failureCategoryId ? String(values.failureCategoryId).trim() : undefined,
      diagnosis: values.diagnosis || undefined,
      correctiveAction: values.correctiveAction || undefined,
      preventiveAction: values.preventiveAction || undefined,
      remarks: values.remarks || undefined,
    });
    setCompleteOpen(false);
  };

  const submitReview = async (values: any) => {
    if (!reviewAction) return;
    const text = ((values.remarks || '') as string).trim();
    if (reviewAction.endpoint === 'reject') {
      await run({ label: 'Return to Technician', endpoint: 'reject', permission: reviewAction.permission }, { reason: text });
    } else {
      await run({ label: 'Approve Work', endpoint: 'verify', permission: reviewAction.permission }, text ? { remarks: text } : {});
    }
    setReviewOpen(false);
  };

  return <div>
    <Row gutter={24}>
      <Col xs={24} lg={15}>
        <Card title={card.jobCardNo ? `Job ${card.jobCardNo}` : 'Job Card'} style={{ marginBottom: 16 }} extra={<StatusBadge status={card.currentStatus} />}>
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }}>
            <Descriptions.Item label="Company">{companyName(card.company)}</Descriptions.Item>
            <Descriptions.Item label="Division">{card.division?.name || card.machine?.division?.name || 'Division unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Section">{card.section?.name || card.machine?.section?.name || 'Section unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Department">{card.machine?.department?.name || card.assignedDepartment?.name || 'Department unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Maintenance Team">{card.team?.name ? `${card.team.name}${card.team.code ? ` (${card.team.code})` : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Machine">{card.machine ? `${card.machine.machineCode || card.machine.machineNumber || ''} ${card.machine.name || ''}`.trim() || 'Machine unavailable' : 'Machine unavailable'}</Descriptions.Item>
            <Descriptions.Item label="Priority"><StatusBadge status={card.priority} /></Descriptions.Item>
            <Descriptions.Item label="Type"><Tag color={card.maintenanceType === 'BREAKDOWN' ? 'red' : card.maintenanceType === 'PREVENTIVE' ? 'green' : card.maintenanceType === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(card.maintenanceType)}</Tag></Descriptions.Item>
            <Descriptions.Item label="Requested">{card.requestedAt ? new Date(card.requestedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Assigned">{card.assignedAt ? new Date(card.assignedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Started">{card.startedAt ? new Date(card.startedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Completed">{card.completedAt ? new Date(card.completedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Verified">{card.verifiedAt ? new Date(card.verifiedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Approved">{card.approvedAt ? new Date(card.approvedAt).toLocaleString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Closed">{card.closedAt ? new Date(card.closedAt).toLocaleString() : '—'}</Descriptions.Item>
          </Descriptions>
        </Card>
        <Card title="Workflow" style={{ marginBottom: 16 }}>
          <Steps
            size="small"
            responsive
            direction="horizontal"
            current={steps.findIndex(s => s.status === 'process')}
            items={steps.map(s => ({ title: s.title, status: s.status }))}
          />
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--theme-surface-alt)', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Typography.Text strong>Current step: <StatusBadge status={card.currentStatus} /></Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>{STATUS_DESCRIPTION[card.currentStatus]}</Typography.Text>
          </div>
          {card.currentStatus === 'REJECTED' && <Alert style={{ marginTop: 12 }} type="error" showIcon message="Job card was returned" description={(card.remarks || 'This job card was returned during review. Do the rework and resubmit — it will return to Pending Review.')} />}
          {card.currentStatus === 'CANCELLED' && <Alert style={{ marginTop: 12 }} type="error" showIcon message="Job card cancelled" description={orLabel(card.remarks, 'This job card was cancelled and is no longer actionable.')} />}
        </Card>
        {card.machineId && <MachineProfilePanel machineId={card.machineId} compact />}
        <Card title="Complaint & Request" style={{ marginTop: 16, marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, md: 2 }}>
            <Descriptions.Item label="Complaint">{card.complaint}</Descriptions.Item>
            <Descriptions.Item label="Category">{card.complaintCategory?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Root Cause Category">{card.rootCauseCategory?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Failure Category">{card.failureCategory?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Description">{card.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Reported by">{uName(card.requestedByUser)}</Descriptions.Item>
            {card.diagnosis && <Descriptions.Item label="Diagnosis">{card.diagnosis}</Descriptions.Item>}
            {card.correctiveAction && <Descriptions.Item label="Corrective Action">{card.correctiveAction}</Descriptions.Item>}
            {card.preventiveAction && <Descriptions.Item label="Preventive Action">{card.preventiveAction}</Descriptions.Item>}
          </Descriptions>
        </Card>
        <Card style={{ marginBottom: 16 }}>
          <Tabs defaultActiveKey="history" items={[
            { key: 'history', label: 'Activity Timeline', children: (() => {
              const hist = (related.history || []).slice().sort((a: any, b: any) => new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime());
              if (!hist.length) return <Empty description="No status history yet" />;
              return <Timeline items={hist.map((h: any, i: number) => {
                const ts = h.changedAt ? new Date(h.changedAt).getTime() : null;
                const nextTs = i < hist.length - 1 ? (hist[i + 1].changedAt ? new Date(hist[i + 1].changedAt).getTime() : null) : null;
                const isLast = i === hist.length - 1;
                const terminal = ['APPROVED', 'CLOSED', 'REJECTED', 'CANCELLED'].includes(h.toStatus);
                const isActive = isLast && !terminal;
                const startTs = ts;
                const endTs = isActive ? (Date.now()) : nextTs;
                let dur = '';
                if (startTs !== null && endTs !== null && endTs >= startTs) {
                  const mins = Math.round((endTs - startTs) / 60000);
                  if (mins >= 1) {
                    const d = Math.floor(mins / 1440); const rem = mins % 1440;
                    const hh = Math.floor(rem / 60); const mm = rem % 60;
                    const parts: string[] = [];
                    if (d > 0) parts.push(`${d}d`);
                    if (hh > 0) parts.push(`${hh}h`);
                    if (mm > 0) parts.push(`${mm}m`);
                    dur = parts.join(' ') || `${mins}m`;
                  } else { dur = `${mins}m`; }
                }
                return {
                  color: h.toStatus === 'REJECTED' || h.toStatus === 'CANCELLED' ? 'red' : h.toStatus === 'APPROVED' ? 'green' : 'blue',
                  children: (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
                        <Typography.Text strong>{label(h.fromStatus)} → {label(h.toStatus)}</Typography.Text>
                        {isActive ? <Tag style={{ marginInlineEnd: 0 }} color="green">Active</Tag> : dur ? <Tag style={{ marginInlineEnd: 0 }} color="geekblue">{dur}</Tag> : null}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4, fontSize: 12 }}>
                        <span><Typography.Text type="secondary">Start:</Typography.Text> {h.changedAt ? new Date(h.changedAt).toLocaleString() : '—'}</span>
                        <span><Typography.Text type="secondary">End:</Typography.Text> {isActive ? <Typography.Text strong style={{ color: 'var(--theme-text)' }}>Active (now)</Typography.Text> : (nextTs ? new Date(nextTs).toLocaleString() : (terminal ? new Date(h.changedAt).toLocaleString() : '—'))}</span>
                        <span><Typography.Text type="secondary">Duration:</Typography.Text> {isActive ? <Typography.Text strong style={{ color: 'var(--theme-text)' }}>{dur}</Typography.Text> : (dur || '—')}</span>
                      </div>
                      {h.remarks ? <div style={{ marginTop: 4 }}><Typography.Text type="secondary" italic>Notes: {h.remarks}</Typography.Text></div> : null}
                      <div style={{ marginTop: 2 }}><Typography.Text type="secondary">by {uName(h.changedByUser)}</Typography.Text></div>
                    </div>
                  ),
                };
              })} />;
            })() },
            { key: 'parts', label: 'Parts', children: <SparePartsPanel jobCardId={card.id} companyId={card.companyId} isEditable={card.currentStatus !== 'APPROVED' && card.currentStatus !== 'CANCELLED'} onUpdate={load} /> },
            { key: 'logs', label: 'Work Logs', children: <Table rowKey="id" pagination={false} dataSource={related.logs || []} locale={{ emptyText: <Empty description="No work logs" /> }} columns={[{ title: 'Work', dataIndex: 'workDescription' }, { title: 'Remarks', dataIndex: 'remarks' }, { title: 'Created', dataIndex: 'createdAt', render: (v: string) => v && new Date(v).toLocaleString() }]} /> },
            { key: 'attachments', label: 'Attachments', children: related.attachments?.length ? <Table rowKey="id" pagination={false} dataSource={related.attachments} columns={[{ title: 'File', dataIndex: 'fileName' }, { title: 'Description', dataIndex: 'description' }, { title: 'Uploaded', dataIndex: 'createdAt', render: (v: string) => v && new Date(v).toLocaleString() }]} /> : <Empty description="No attachments" /> },
            { key: 'technicians', label: 'Technicians', children: related.technicians?.length ? <Table rowKey="id" pagination={false} dataSource={related.technicians} columns={[
              { title: 'Technician', render: (_: any, r: any) => techLabel(r) },
              { title: 'ERP User', render: (_: any, r: any) => r.technicianUserId ? <>{uName(r.technicianUser)} <Tag color="green">Linked</Tag></> : <Tag color="default">Not Linked</Tag> },
              { title: 'Skill', render: (_: any, r: any) => r.technician?.skill || '—' },
              { title: 'Shift', render: (_: any, r: any) => r.technician?.shift || '—' },
              { title: 'Status', render: (_: any, r: any) => (r.technician?.status ? <Tag color={r.technician.status === 'ACTIVE' ? 'green' : 'default'}>{r.technician.status}</Tag> : '—') },
              { title: 'Role', dataIndex: 'role', render: (v: string) => v ? <Tag>{v}</Tag> : '—' },
              { title: 'Assigned', dataIndex: 'assignedAt', render: (v: string) => v && new Date(v).toLocaleString() },
              { title: 'Remarks', dataIndex: 'remarks', render: (v: string) => v || '—' },
            ]} /> : <Empty description="No technicians assigned yet" /> },
          ]} />
        </Card>
      </Col>
      <Col xs={24} lg={9}>
        <Card title={<>Next Action <Tag color="geekblue">{nextActionHeading}</Tag></>} style={{ marginBottom: 16 }}>
          <Typography.Paragraph type="secondary">{STATUS_DESCRIPTION[card.currentStatus]}</Typography.Paragraph>
          {actions.length ? (
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              {primary && <Button type="primary" size="large" block disabled={busy} loading={busy} icon={primary.endpoint === 'verify' || primary.endpoint === 'approve' ? <CheckCircleFilled /> : undefined} onClick={() => openFor(primary)}>{primary.label}</Button>}
              {others.map(a => <Button key={a.endpoint} block disabled={busy} onClick={() => openFor(a)}>{a.label}</Button>)}
            </Space>
          ) : (
            card.currentStatus === 'APPROVED' ? <Alert type="success" showIcon icon={<CheckCircleFilled />} message="Approved" description={<>Job card approved {hasApprovedActor ? `by ${uName(card.approvedByUser)}` : ''}{card.approvedAt ? ` on ${new Date(card.approvedAt).toLocaleString()}` : ''}. No further action required.</>} />
              : card.currentStatus === 'REJECTED' ? <Alert type="error" showIcon message="Returned" description="Complete the rework and resubmit — the job card returns to Pending Review." />
              : <Alert type="info" showIcon message="No actionable step" description="Either this job card is waiting on another party or you lack permission for the next step." />
          )}
        </Card>
        <Card title="Responsibilities & Actor Trail" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="Maintenance Team">{card.team?.name ? `${card.team.name}${card.team.code ? ` (${card.team.code})` : ''}` : '—'}</Descriptions.Item>
            <Descriptions.Item label="Assigned Technician">{technicianRows.length ? technicianRows.map((t: any) => <div key={t.id} style={{ marginBottom: 2 }}>{techLabel(t)} {t.role === 'PRIMARY' && <Tag>PRIMARY</Tag>}{t.technicianUserId ? <Tag color="green">Linked</Tag> : <Tag>No ERP link</Tag>}</div>) : '—'}</Descriptions.Item>
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

    <Modal title="Edit job card" open={editOpen} confirmLoading={busy} onCancel={() => setEditOpen(false)} onOk={() => editForm.submit()} forceRender>
      <Form form={editForm} layout="vertical" onFinish={saveEdit}>
        <Form.Item name="complaint" label="Complaint" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
        <Form.Item name="complaintCategoryId" label="Complaint category"><Select allowClear options={categories.map(category => ({ value: category.id, label: category.name || category.code || 'Unnamed complaint category' }))} /></Form.Item>
        <Form.Item name="assignedDepartmentId" label="Department"><Select allowClear options={departments.map(department => ({ value: department.id, label: department.name || department.code || 'Unnamed department' }))} /></Form.Item>
        <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
      </Form>
    </Modal>
    <Modal title="Assign technicians" open={assignOpen} confirmLoading={busy} onCancel={() => setAssignOpen(false)} onOk={() => assignForm.submit()}>
      <Form form={assignForm} layout="vertical" onFinish={async values => {
        const technicianIds: string[] = (values.technicianIds || []).map((v: string) => String(v).trim()).filter(Boolean);
        await run({ label: 'Assignment', endpoint: 'assign', permission: 'maintenance.job_card.assign' }, { technicianIds, teamCode: values.teamCode || undefined, remarks: values.remarks || undefined });
        setAssignOpen(false);
      }}>
        <Form.Item
          name="technicianIds"
          label="Assigned Technicians"
          extra="Select one or more technicians (primary is selected first)."
          rules={[{ required: true, message: 'Select at least one technician' }]}
        >
          <Select
            mode="multiple"
            placeholder="Search technician by name, employee ID or skill..."
            loading={assignLoading}
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            options={technicianOptions.map((t: any) => ({
              value: t.id,
              label: `${t.technicianName} — ${t.employeeId}${t.skill ? ` — ${t.skill}` : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="teamCode" label="Maintenance Team">
          <Select allowClear showSearch optionFilterProp="label" placeholder="Select a team (optional)" options={teamOptions.map(t => ({ value: t.code, label: t.name ? `${t.name}${t.code ? ` (${t.code})` : ''}` : (t.code || 'Unnamed team') }))} />
        </Form.Item>
        <Form.Item name="remarks" label="Initial / Assignment Remarks"><Input.TextArea rows={2} placeholder="Optional remarks for this assignment" /></Form.Item>
      </Form>
    </Modal>
    <Modal title={prompt?.title} open={!!prompt} confirmLoading={busy} onCancel={() => setPrompt(null)} onOk={confirm} okText={prompt?.action.label} okButtonProps={{ danger: prompt?.action.endpoint === 'reject' }}>
      <Input.TextArea rows={3} placeholder={prompt?.placeholder} value={remarkValue} onChange={e => setRemarkValue(e.target.value)} autoFocus />
    </Modal>
    <Modal
      title={`Start Job — ${card.jobCardNo || 'Job Card'}`}
      open={startOpen}
      confirmLoading={busy}
      onCancel={() => setStartOpen(false)}
      onOk={() => startForm.submit()}
      okText="Start Job"
    >
      <Form form={startForm} layout="vertical" onFinish={submitStart}>
        <Alert
          type="info"
          showIcon
          icon={<PlayCircleFilled />}
          style={{ marginBottom: 16 }}
          message="Waiting time"
          description={<>Opened: <Typography.Text strong>{fmtDt(card.requestedAt || card.createdAt)}</Typography.Text><span style={{ margin: '0 8px' }}>·</span>Waiting: <Typography.Text strong>{durText(card.requestedAt || card.createdAt, card.startedAt ? new Date(card.startedAt).getTime() : Date.now())}</Typography.Text></>}
        />
        <Form.Item
          name="technicianIds"
          label="Assigned Technicians"
          extra="Select one or more technicians (primary is selected first)."
          rules={[{ required: true, message: 'Select at least one technician' }]}
        >
          <Select
            mode="multiple"
            placeholder="Search technician by name, employee ID or skill..."
            loading={assignLoading}
            showSearch
            optionFilterProp="label"
            maxTagCount="responsive"
            options={technicianOptions.map((t: any) => ({
              value: t.id,
              label: `${t.technicianName} — ${t.employeeId}${t.skill ? ` — ${t.skill}` : ''}`,
            }))}
          />
        </Form.Item>
        <Form.Item name="teamCode" label="Maintenance Team">
          <Select allowClear showSearch optionFilterProp="label" placeholder="Select a team (optional)" options={teamOptions.map(t => ({ value: t.code, label: t.name ? `${t.name}${t.code ? ` (${t.code})` : ''}` : (t.code || 'Unnamed team') }))} />
        </Form.Item>
        <Form.Item name="remarks" label="Initial Remarks">
          <Input.TextArea rows={3} placeholder="Initial remarks for the technician(s)... (optional)" />
        </Form.Item>
      </Form>
    </Modal>
    <Modal
      title={`Close Job — ${card.jobCardNo || 'Job Card'}`}
      open={completeOpen}
      confirmLoading={busy}
      onCancel={() => setCompleteOpen(false)}
      onOk={() => completeForm.submit()}
      okText="Close Job"
      width={720}
    >
      <Form form={completeForm} layout="vertical" onFinish={submitComplete}>
        <Card size="small" title="Time Summary" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Opened">{fmtDt(card.requestedAt || card.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Started">{fmtDt(card.startedAt)}</Descriptions.Item>
            <Descriptions.Item label="Waiting Time">{durText(card.requestedAt || card.createdAt, card.startedAt ? new Date(card.startedAt).getTime() : Date.now())}</Descriptions.Item>
            <Descriptions.Item label="Working Time">{durText(card.startedAt || card.requestedAt || card.createdAt, Date.now())}</Descriptions.Item>
            <Descriptions.Item label="Total Downtime">{durText(card.downtimeStart || card.startedAt || card.requestedAt || card.createdAt, Date.now())}</Descriptions.Item>
            <Descriptions.Item label="Department">{card.machine?.department?.name || card.assignedDepartment?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Breakdown Type"><Tag color={card.maintenanceType === 'BREAKDOWN' ? 'red' : card.maintenanceType === 'PREVENTIVE' ? 'green' : card.maintenanceType === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(card.maintenanceType)}</Tag></Descriptions.Item>
          </Descriptions>
        </Card>
        <Row gutter={16}>
          <Col xs={24} md={12}><Form.Item name="rootCauseCategoryId" label="Root Cause Category"><Select allowClear showSearch optionFilterProp="label" placeholder="Select root cause category" options={rootCategories.map(c => ({ value: c.id, label: categoryLabel(c) }))} notFoundContent="No root cause categories available" /></Form.Item></Col>
          <Col xs={24} md={12}><Form.Item name="failureCategoryId" label="Failure Category"><Select allowClear showSearch optionFilterProp="label" placeholder="Select failure category" options={failureCategories.map(c => ({ value: c.id, label: categoryLabel(c) }))} notFoundContent="No failure categories available" /></Form.Item></Col>
        </Row>
        <Form.Item name="diagnosis" label="Root Cause" rules={[{ required: true, message: 'Describe the root cause of the fault' }]}><Input.TextArea rows={2} placeholder="Describe the root cause of the fault..." /></Form.Item>
        <Form.Item name="correctiveAction" label="Corrective Action" rules={[{ required: true, message: 'Describe the corrective action taken' }]}><Input.TextArea rows={2} placeholder="Describe the corrective action taken..." /></Form.Item>
        <Form.Item name="preventiveAction" label="Preventive Action"><Input.TextArea rows={2} placeholder="Preventive measures taken (optional)..." /></Form.Item>
        <Form.Item name="remarks" label="Final Remarks"><Input.TextArea rows={2} placeholder="Final remarks / summary (optional)" /></Form.Item>
        <Alert type="info" showIcon message="Spare parts used are recorded in the Parts tab where supported." />
      </Form>
    </Modal>
    <Modal
      title={`Review — ${card.jobCardNo || 'Job Card'}`}
      open={reviewOpen}
      confirmLoading={busy}
      onCancel={() => setReviewOpen(false)}
      onOk={() => reviewForm.submit()}
      okText={reviewAction?.endpoint === 'reject' ? 'Return to Technician' : 'Approve Job Card'}
      okButtonProps={{ danger: reviewAction?.endpoint === 'reject' }}
      width={720}
    >
      <Form form={reviewForm} layout="vertical" onFinish={submitReview}>
        <Radio.Group
          buttonStyle="solid"
          value={reviewAction?.endpoint === 'reject' ? 'return' : 'approve'}
          onChange={e => {
            const isReturn = e.target.value === 'return';
            setReviewAction(isReturn
              ? { label: 'Return to Technician', endpoint: 'reject', permission: reviewAction?.permission || 'maintenance.job_card.verify' }
              : { label: 'Approve Job Card', endpoint: 'verify', permission: reviewAction?.permission || 'maintenance.job_card.verify' });
          }}
          style={{ marginBottom: 16 }}
        >
          <Radio.Button value="approve">Approve</Radio.Button>
          <Radio.Button value="return">Return to Technician</Radio.Button>
        </Radio.Group>
        <Card size="small" title="Job Details" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Machine">{card.machine?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Asset">{card.machine ? `${card.machine.machineCode || card.machine.machineNumber || ''}`.trim() || '—' : '—'}</Descriptions.Item>
            <Descriptions.Item label="Department">{card.machine?.department?.name || card.assignedDepartment?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Section">{card.machine?.section?.name || card.section?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Priority">{label(card.priority)}</Descriptions.Item>
            <Descriptions.Item label="Maintenance Team">{card.team?.name ? `${card.team.name}${card.team.code ? ` (${card.team.code})` : ''}` : '—'}</Descriptions.Item>
          </Descriptions>
          <div style={{ marginTop: 8 }}><Typography.Text type="secondary">Complaint: </Typography.Text>{card.complaint}</div>
          <div style={{ marginTop: 4 }}><Typography.Text type="secondary">Assigned Technician(s): </Typography.Text>{technicianRows.length ? technicianRows.map((t: any) => <Tag key={t.id} style={{ marginInlineEnd: 4 }}>{techLabel(t)}</Tag>) : '—'}</div>
        </Card>
        <Card size="small" title="Time Summary" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Opened">{fmtDt(card.requestedAt || card.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="Started">{fmtDt(card.startedAt)}</Descriptions.Item>
            <Descriptions.Item label="Closed On">{fmtDt(card.closedAt)}</Descriptions.Item>
            <Descriptions.Item label="Pending Since">{pendingSince ? fmtDt(pendingSince) : '—'}</Descriptions.Item>
            <Descriptions.Item label="Waiting Time">{durText(card.requestedAt || card.createdAt, card.startedAt ? new Date(card.startedAt).getTime() : Date.now())}</Descriptions.Item>
            <Descriptions.Item label="Working Time">{card.completedAt ? durText(card.startedAt || card.requestedAt || card.createdAt, new Date(card.completedAt).getTime()) : durText(card.startedAt || card.requestedAt || card.createdAt, Date.now())}</Descriptions.Item>
            <Descriptions.Item label="Total Downtime">{card.completedAt ? durText(card.downtimeStart || card.startedAt || card.requestedAt || card.createdAt, new Date(card.completedAt).getTime()) : durText(card.downtimeStart || card.startedAt || card.requestedAt || card.createdAt, Date.now())}</Descriptions.Item>
          </Descriptions>
        </Card>
        {(card.diagnosis || card.correctiveAction || card.preventiveAction || sparePartsText !== '—' || technicianRemarks.length) && <Card size="small" title="Work Details" style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={1}>
            {card.diagnosis && <Descriptions.Item label="Root Cause">{card.diagnosis}</Descriptions.Item>}
            {card.correctiveAction && <Descriptions.Item label="Corrective Action">{card.correctiveAction}</Descriptions.Item>}
            {card.preventiveAction && <Descriptions.Item label="Preventive Action">{card.preventiveAction}</Descriptions.Item>}
            <Descriptions.Item label="Spare Parts">{sparePartsText}</Descriptions.Item>
            <Descriptions.Item label="Technician Remarks">{technicianRemarks.length ? technicianRemarks.map((r, i) => <div key={i} style={{ marginBottom: 2 }}>{r}</div>) : '—'}</Descriptions.Item>
          </Descriptions>
        </Card>}
        <Card size="small" title="Supervisor Review" style={{ marginBottom: 16 }}>
          <Form.Item name="remarks" label={reviewAction?.endpoint === 'reject' ? 'Reason for returning' : 'Supervisor Remarks'} rules={reviewAction?.endpoint === 'reject' ? [{ required: true, message: 'Provide a reason before returning this job card' }] : []} style={{ marginBottom: 0 }}>
            <Input.TextArea rows={3} placeholder={reviewAction?.endpoint === 'reject' ? 'Why is this work being returned to the technician?' : 'Optional remarks for the record...'} />
          </Form.Item>
        </Card>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Decision: {reviewAction?.endpoint === 'reject' ? 'Return to Technician — the job card returns to the assignment workflow for correction.' : 'Approve — marks the work as verified and moves the card toward final approval.'}</Typography.Text>
      </Form>
    </Modal>
  </div>;
};

export default JobCardDetail;