import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Input, Modal, Pagination, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import apiService from '../../services/api';
import { EmptyState, LoadingState, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import {
  JOB_CARD_BASE, JOB_CARD_STATUSES, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES,
  JobCard, OrgOption,
  UUID_RE, rowsOf, uuidRowsOf, optionLabel, errorText, label, NEXT_ACTION_LABEL, ACTION_MAP,
} from './jobCards.types';
import { PageHeader } from '../../components/shared';
import { BuildOutlined, ArrowUpOutlined, CheckCircleOutlined, ClockCircleOutlined, ExclamationCircleOutlined, ThunderboltOutlined, PauseCircleOutlined, ToolOutlined } from '@ant-design/icons';

const QUEUES: Array<{ key: string; status: string; label: string; color: string; icon: React.ReactNode }> = [
  { key: 'open', status: 'OPEN', label: 'New Requests', color: '#1677ff', icon: <ExclamationCircleOutlined /> },
  { key: 'assigned', status: 'ASSIGNED', label: 'Assigned', color: '#13c2c2', icon: <ToolOutlined /> },
  { key: 'inProgress', status: 'IN_PROGRESS', label: 'In Progress', color: '#2f54eb', icon: <ThunderboltOutlined /> },
  { key: 'onHold', status: 'ON_HOLD', label: 'On Hold', color: '#faad14', icon: <PauseCircleOutlined /> },
  { key: 'waitingForParts', status: 'WAITING_FOR_PARTS', label: 'Waiting Parts', color: '#fa8c16', icon: <ClockCircleOutlined /> },
  { key: 'completed', status: 'COMPLETED', label: 'Completed', color: '#52c41a', icon: <CheckCircleOutlined /> },
  { key: 'pendingVerification', status: 'PENDING_VERIFICATION', label: 'Pending Verify', color: '#722ed1', icon: <ArrowUpOutlined /> },
  { key: 'approved', status: 'APPROVED', label: 'Approved', color: '#389e0d', icon: <CheckCircleOutlined /> },
];

const userName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.id)) || '—';
const technicianNames = (r: JobCard) => {
  const ts = (Array.isArray(r.technicians) ? r.technicians : []).slice().sort((a: any, b: any) => (a.role === 'PRIMARY' ? -1 : 1) - (b.role === 'PRIMARY' ? -1 : 1));
  return ts.length ? ts.map((t: any) => userName(t.technicianUser)).join(', ') : '—';
};
const machineName = (r: JobCard) => r.machine ? `${r.machine.machineCode || r.machine.machineNumber || ''} ${r.machine.name || r.machine.machineName || ''}`.trim() || 'Unnamed machine' : 'Unnamed machine';

export const JobCardList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = AntApp.useApp();
  const { user, can } = usePermission();
  const [rows, setRows] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ companyId: user?.defaultCompanyId || undefined as string | undefined, divisionId: undefined as string | undefined, sectionId: undefined as string | undefined, assignedDepartmentId: undefined as string | undefined, machineId: undefined as string | undefined, search: '', currentStatus: undefined as string | undefined, priority: undefined as string | undefined, maintenanceType: undefined as string | undefined, dateFrom: undefined as string | undefined, dateTo: undefined as string | undefined });
  const [org, setOrg] = useState<{ companies: OrgOption[]; divisions: OrgOption[]; sections: OrgOption[]; departments: OrgOption[]; machines: OrgOption[] }>({ companies: [], divisions: [], sections: [], departments: [], machines: [] });

  useEffect(() => {
    const s = searchParams.get('status');
    if (s && JOB_CARD_STATUSES.includes(s)) setFilters(f => ({ ...f, currentStatus: s }));
  }, [searchParams]);

  useEffect(() => { apiService.get<any>('/companies', { limit: 100 }).then(r => setOrg(v => ({ ...v, companies: uuidRowsOf(r) }))).catch(() => undefined); }, []);
  useEffect(() => { if (!filters.companyId) return; apiService.get<any>('/divisions', { companyId: filters.companyId, limit: 100 }).then(r => setOrg(v => ({ ...v, divisions: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.companyId]);
  useEffect(() => { if (!filters.divisionId) { setOrg(v => ({ ...v, sections: [], departments: [], machines: [] })); return; } apiService.get<any>('/sections', { companyId: filters.companyId, divisionId: filters.divisionId, limit: 100 }).then(r => setOrg(v => ({ ...v, sections: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.companyId, filters.divisionId]);
  useEffect(() => { if (!filters.sectionId) { setOrg(v => ({ ...v, departments: [], machines: [] })); return; } Promise.all([apiService.get<any>('/departments', { companyId: filters.companyId, divisionId: filters.divisionId, sectionId: filters.sectionId, limit: 100 }), apiService.get<any>('/machines', { divisionId: filters.divisionId, sectionId: filters.sectionId, limit: 100 })]).then(([d, m]) => setOrg(v => ({ ...v, departments: uuidRowsOf(d), machines: uuidRowsOf(m) }))).catch(() => undefined); }, [filters.companyId, filters.divisionId, filters.sectionId]);
  useEffect(() => { if (!filters.assignedDepartmentId || !filters.divisionId) return; apiService.get<any>('/machines', { divisionId: filters.divisionId, sectionId: filters.sectionId, departmentId: filters.assignedDepartmentId, limit: 100 }).then(r => setOrg(v => ({ ...v, machines: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.assignedDepartmentId, filters.divisionId, filters.sectionId]);

  const companyId = filters.companyId || user?.defaultCompanyId;
  const loadQueue = useCallback(async () => {
    if (!companyId) return;
    try {
      const d = await apiService.get<any>('/master-data/maintenance/job-cards/dashboard', { companyId });
      if (d && typeof d === 'object') setQueue(d);
    } catch { /* queue counts are best-effort */ }
  }, [companyId]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const query = Object.fromEntries(Object.entries({ page, limit: 20, ...filters }).filter(([key, value]) => value !== undefined && value !== '' && (['companyId', 'divisionId', 'sectionId', 'assignedDepartmentId', 'machineId'].includes(key) ? UUID_RE.test(String(value)) : true)));
      const result = await apiService.get<{ data: JobCard[]; total: number }>(JOB_CARD_BASE, query);
      setRows(result.data || []); setTotal(result.total || 0);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [filters, page]);
  useEffect(() => { load(); }, [load]);

  const setFilter = (patch: Record<string, any>) => { setPage(1); setFilters(f => ({ ...f, ...patch })); };

  const remove = async (id: string) => {
    try { await apiService.delete(`${JOB_CARD_BASE}/${id}`); message.success('Job card deleted'); load(); loadQueue(); }
    catch (e) { message.error(errorText(e)); }
  };

  const runQuick = async (r: JobCard, action: { label: string; endpoint: string; permission: string }) => {
    if (action.endpoint === 'assign' || action.endpoint === 'complete') { navigate(`/maintenance/job-cards/${r.id}`); return; }
    Modal.confirm({
      title: `${action.label} this job card?`,
      content: `${r.jobCardNo || r.id}`,
      onOk: async () => {
        try {
          await apiService.post(`${JOB_CARD_BASE}/${r.id}/${action.endpoint}`, action.endpoint === 'reject' ? { reason: 'Rejected during review' } : {});
          message.success(`${action.label} completed`);
          load(); loadQueue();
        } catch (e) { message.error(errorText(e)); throw e; }
      },
    });
  };

  const nextActionOf = (r: JobCard) => (ACTION_MAP[r.currentStatus] || []).find(a => can(a.permission));

  const columns = [
    { title: 'Job Card', dataIndex: 'jobCardNo', render: (v: string, r: JobCard) => <a onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}>{v || r.id}</a> },
    { title: 'Machine', render: (_: any, r: JobCard) => machineName(r) },
    { title: 'Type', dataIndex: 'maintenanceType', render: (v: string) => <Tag color={v === 'BREAKDOWN' ? 'red' : v === 'PREVENTIVE' ? 'green' : v === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(v)}</Tag> },
    { title: 'Complaint', dataIndex: 'complaint', ellipsis: true },
    { title: 'Requested By', render: (_: any, r: JobCard) => userName(r.requestedByUser) },
    { title: 'Assigned To', render: (_: any, r: JobCard) => technicianNames(r) },
    { title: 'Department', render: (_: any, r: JobCard) => (r.assignedDepartment && (r.assignedDepartment.name || r.assignedDepartment.departmentCode)) || '—' },
    { title: 'Status', dataIndex: 'currentStatus', render: (v: string) => <StatusBadge status={v} /> },
    { title: 'Priority', dataIndex: 'priority', render: (v: string) => <Tag color={v === 'CRITICAL' ? 'red' : v === 'HIGH' ? 'orange' : 'blue'}>{label(v)}</Tag> },
    { title: 'Requested', dataIndex: 'requestedAt', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      title: 'Next Action', key: 'next', render: (_: any, r: JobCard) => {
        const action = nextActionOf(r);
        return <Space wrap size={4}>
          {action && <Button type="primary" size="small" onClick={() => runQuick(r, action)}>{NEXT_ACTION_LABEL[r.currentStatus] || action.label}</Button>}
          {!action && r.currentStatus !== 'APPROVED' && r.currentStatus !== 'CANCELLED' && <Button size="small" onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}>{NEXT_ACTION_LABEL[r.currentStatus] || ''} ›</Button>}
          {(!action && (r.currentStatus === 'APPROVED' || r.currentStatus === 'CANCELLED')) && <Typography.Text type="secondary">{NEXT_ACTION_LABEL[r.currentStatus]}</Typography.Text>}
          <Button size="small" onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}>View</Button>
        </Space>;
      },
    },
    {
      title: 'Actions', key: 'actions', render: (_: any, r: JobCard) => <Space wrap>
        {can('maintenance.job_card.update') && r.currentStatus !== 'APPROVED' && <Button size="small" onClick={() => navigate(`/maintenance/job-cards/${r.id}?edit=1`)}>Edit</Button>}
        {can('maintenance.job_card.delete') && r.currentStatus === 'OPEN' && <Button size="small" danger onClick={() => Modal.confirm({ title: 'Are you sure you want to delete this Job Card?', onOk: () => remove(r.id) })}>Delete</Button>}
      </Space>,
    },
  ];

  return <div><PageHeader icon={<BuildOutlined />} title="Job Cards" subtitle="Maintenance work queue — every job card from request to approval" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs
    extra={can('maintenance.job_card.create') && <Button type="primary" ghost icon={<PlusOutlined />} onClick={() => {
      const company = org.companies.find(v => v.id === filters.companyId); const division = org.divisions.find(v => v.id === filters.divisionId); const section = org.sections.find(v => v.id === filters.sectionId); const department = org.departments.find(v => v.id === filters.assignedDepartmentId); const machine = org.machines.find(v => v.id === filters.machineId);
      const context = company && division && section && department && machine && [company.id, division.id, section.id, department.id, machine.id].every(value => UUID_RE.test(String(value))) ? { companyId: company.id, companyName: optionLabel(company), divisionId: division.id, divisionName: optionLabel(division), sectionId: section.id, sectionName: optionLabel(section), departmentId: department.id, departmentName: optionLabel(department), machineId: machine.id, machineName: optionLabel(machine), machineCode: machine.machineCode } : undefined;
      navigate('/maintenance/job-cards/new', { state: { context } });
    }}>Create Job Card</Button>}
  />
    <Card style={{ marginBottom: 16 }}>
      <Row gutter={[8, 8]}>
        {QUEUES.map(q => {
          const count = Number(queue[q.key as keyof typeof queue] ?? 0);
          const active = filters.currentStatus === q.status;
          return (
            <Col xs={12} sm={12} md={6} lg={3} key={q.key}>
              <div onClick={() => { setFilter(active ? { currentStatus: undefined } : { currentStatus: q.status }); setSearchParams(active ? {} : { status: q.status }); }}
                style={{ cursor: 'pointer', borderRadius: 8, border: active ? `2px solid ${q.color}` : '1px solid #f0f0f0', padding: '10px 12px', background: active ? `${q.color}14` : '#fff', transition: 'all .15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography.Text style={{ fontSize: 12, color: active ? q.color : '#888', fontWeight: 600 }}>{q.label}</Typography.Text>
                  <span style={{ color: q.color }}>{q.icon}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: active ? q.color : '#333', lineHeight: 1.2 }}>{count}</div>
              </div>
            </Col>
          );
        })}
      </Row>
    </Card>
    <Card style={{ marginBottom: 16 }}><Space wrap>
      <Select allowClear placeholder="Company" value={filters.companyId} onChange={v => setFilter({ companyId: v, divisionId: undefined, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined })} options={org.companies.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Division" value={filters.divisionId} disabled={!filters.companyId} onChange={v => setFilter({ divisionId: v, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined })} options={org.divisions.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Section" value={filters.sectionId} disabled={!filters.divisionId} onChange={v => setFilter({ sectionId: v, assignedDepartmentId: undefined, machineId: undefined })} options={org.sections.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Department" value={filters.assignedDepartmentId} disabled={!filters.sectionId} onChange={v => setFilter({ assignedDepartmentId: v, machineId: undefined })} options={org.departments.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Machine" value={filters.machineId} disabled={!filters.sectionId} onChange={v => setFilter({ machineId: v })} options={org.machines.map(v => ({ value: v.id, label: `${v.machineNumber || v.machineId || ''} ${v.machineCode || ''} ${v.name || ''}`.trim() }))} style={{ width: 200 }} />
      <Input prefix={<SearchOutlined />} allowClear placeholder="Search job card or complaint" value={filters.search} onChange={e => setFilter({ search: e.target.value })} style={{ width: 250 }} />
      <Select allowClear placeholder="Status" value={filters.currentStatus} onChange={v => setFilter({ currentStatus: v })} options={JOB_CARD_STATUSES.map(v => ({ value: v, label: label(v) }))} style={{ width: 190 }} />
      <Select allowClear placeholder="Priority" value={filters.priority} onChange={v => setFilter({ priority: v })} options={JOB_CARD_PRIORITIES.map(v => ({ value: v, label: label(v) }))} style={{ width: 150 }} />
      <Select allowClear placeholder="Maintenance Type" value={filters.maintenanceType} onChange={v => setFilter({ maintenanceType: v })} options={MAINTENANCE_TYPES.map(v => ({ value: v, label: label(v) }))} style={{ width: 160 }} />
      <Input type="date" value={filters.dateFrom} onChange={e => setFilter({ dateFrom: e.target.value || undefined })} style={{ width: 150 }} />
      <Input type="date" value={filters.dateTo} onChange={e => setFilter({ dateTo: e.target.value || undefined })} style={{ width: 150 }} />
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
    </Space></Card>
    {error && <Alert type="error" showIcon message="Unable to load job cards" description={error} action={<Button onClick={load}>Retry</Button>} style={{ marginBottom: 16 }} />}
    {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState title="No job cards found" description="Create a job card or adjust the filters." /> : <><Table rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1400 }} /><Pagination current={page} pageSize={20} total={total} onChange={setPage} showSizeChanger={false} style={{ marginTop: 16, textAlign: 'right' }} /></>}
  </div>;
};

export default JobCardList;