import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Input, Modal, Pagination, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { EmptyState, LoadingState, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import {
  JOB_CARD_BASE, JOB_CARD_STATUSES, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES,
  JobCard, OrgOption, JobCardContext,
  UUID_RE, rowsOf, uuidRowsOf, optionLabel, errorText, label,
} from './jobCards.types';
import { PageHeader } from '../../components/shared';
import { BuildOutlined } from '@ant-design/icons';

export const JobCardList: React.FC = () => {
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const { user, can } = usePermission();
  const [rows, setRows] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ companyId: user?.defaultCompanyId || undefined as string | undefined, divisionId: undefined as string | undefined, sectionId: undefined as string | undefined, assignedDepartmentId: undefined as string | undefined, machineId: undefined as string | undefined, search: '', currentStatus: undefined as string | undefined, priority: undefined as string | undefined, maintenanceType: undefined as string | undefined });
  const [org, setOrg] = useState<{ companies: OrgOption[]; divisions: OrgOption[]; sections: OrgOption[]; departments: OrgOption[]; machines: OrgOption[] }>({ companies: [], divisions: [], sections: [], departments: [], machines: [] });
  useEffect(() => { apiService.get<any>('/companies', { limit: 100 }).then(r => setOrg(v => ({ ...v, companies: uuidRowsOf(r) }))).catch(() => undefined); }, []);
  useEffect(() => { if (!filters.companyId) return; apiService.get<any>('/divisions', { companyId: filters.companyId, limit: 100 }).then(r => setOrg(v => ({ ...v, divisions: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.companyId]);
  useEffect(() => { if (!filters.divisionId) { setOrg(v => ({ ...v, sections: [], departments: [], machines: [] })); return; } apiService.get<any>('/sections', { companyId: filters.companyId, divisionId: filters.divisionId, limit: 100 }).then(r => setOrg(v => ({ ...v, sections: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.companyId, filters.divisionId]);
  useEffect(() => { if (!filters.sectionId) { setOrg(v => ({ ...v, departments: [], machines: [] })); return; } Promise.all([apiService.get<any>('/departments', { companyId: filters.companyId, divisionId: filters.divisionId, sectionId: filters.sectionId, limit: 100 }), apiService.get<any>('/machines', { divisionId: filters.divisionId, sectionId: filters.sectionId, limit: 100 })]).then(([d, m]) => setOrg(v => ({ ...v, departments: uuidRowsOf(d), machines: uuidRowsOf(m) }))).catch(() => undefined); }, [filters.companyId, filters.divisionId, filters.sectionId]);
  useEffect(() => { if (!filters.assignedDepartmentId || !filters.divisionId) return; apiService.get<any>('/machines', { divisionId: filters.divisionId, sectionId: filters.sectionId, departmentId: filters.assignedDepartmentId, limit: 100 }).then(r => setOrg(v => ({ ...v, machines: uuidRowsOf(r) }))).catch(() => undefined); }, [filters.assignedDepartmentId, filters.divisionId, filters.sectionId]);

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

  const remove = async (id: string) => {
    try { await apiService.delete(`${JOB_CARD_BASE}/${id}`); message.success('Job card deleted'); load(); }
    catch (e) { message.error(errorText(e)); }
  };
  const columns = [
    { title: 'Job Card', dataIndex: 'jobCardNo', render: (v: string, r: JobCard) => <a onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}>{v || r.id}</a> },
    { title: 'Machine', render: (_: any, r: JobCard) => r.machine ? `${r.machine.machineCode || r.machine.machineNumber || ''} ${r.machine.name || r.machine.machineName || ''}`.trim() || 'Unnamed machine' : 'Unnamed machine' },
    { title: 'Type', dataIndex: 'maintenanceType', render: (v: string) => <Tag color={v === 'BREAKDOWN' ? 'red' : v === 'PREVENTIVE' ? 'green' : v === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(v)}</Tag> },
    { title: 'Complaint', dataIndex: 'complaint', ellipsis: true },
    { title: 'Status', dataIndex: 'currentStatus', render: (v: string) => <StatusBadge status={v} /> },
    { title: 'Priority', dataIndex: 'priority', render: (v: string) => <Tag color={v === 'CRITICAL' ? 'red' : v === 'HIGH' ? 'orange' : 'blue'}>{label(v)}</Tag> },
    { title: 'Requested', dataIndex: 'requestedAt', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    { title: 'Actions', key: 'actions', render: (_: any, r: JobCard) => <Space wrap><Button size="small" onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}>View</Button>{can('maintenance.job_card.update') && r.currentStatus !== 'APPROVED' && <Button size="small" onClick={() => navigate(`/maintenance/job-cards/${r.id}?edit=1`)}>Edit</Button>}{can('maintenance.job_card.delete') && r.currentStatus === 'OPEN' && <Button size="small" danger onClick={() => Modal.confirm({ title: 'Are you sure you want to delete this Job Card?', onOk: () => remove(r.id) })}>Delete</Button>}</Space> },
  ];
  return <div><PageHeader icon={<BuildOutlined />} title="Job Cards" subtitle="Maintenance work orders and service history" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs />
    <Card style={{ marginBottom: 16 }}><Space wrap>
      <Select allowClear placeholder="Company" value={filters.companyId} onChange={v => { setPage(1); setFilters({ ...filters, companyId: v, divisionId: undefined, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined }); }} options={org.companies.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Division" value={filters.divisionId} disabled={!filters.companyId} onChange={v => { setPage(1); setFilters({ ...filters, divisionId: v, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined }); }} options={org.divisions.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Section" value={filters.sectionId} disabled={!filters.divisionId} onChange={v => { setPage(1); setFilters({ ...filters, sectionId: v, assignedDepartmentId: undefined, machineId: undefined }); }} options={org.sections.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Department" value={filters.assignedDepartmentId} disabled={!filters.sectionId} onChange={v => { setPage(1); setFilters({ ...filters, assignedDepartmentId: v, machineId: undefined }); }} options={org.departments.map(v => ({ value: v.id, label: optionLabel(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Machine" value={filters.machineId} disabled={!filters.sectionId} onChange={v => { setPage(1); setFilters({ ...filters, machineId: v }); }} options={org.machines.map(v => ({ value: v.id, label: `${v.machineNumber || v.machineId || ''} ${v.machineCode || ''} ${v.name || ''}`.trim() }))} style={{ width: 200 }} />
      <Input prefix={<SearchOutlined />} allowClear placeholder="Search job card or complaint" value={filters.search} onChange={e => { setPage(1); setFilters({ ...filters, search: e.target.value }); }} style={{ width: 280 }} />
      <Select allowClear placeholder="Status" value={filters.currentStatus} onChange={v => { setPage(1); setFilters({ ...filters, currentStatus: v }); }} options={JOB_CARD_STATUSES.map(v => ({ value: v, label: label(v) }))} style={{ width: 180 }} />
      <Select allowClear placeholder="Priority" value={filters.priority} onChange={v => { setPage(1); setFilters({ ...filters, priority: v }); }} options={JOB_CARD_PRIORITIES.map(v => ({ value: v, label: label(v) }))} style={{ width: 150 }} />
      <Select allowClear placeholder="Maintenance Type" value={filters.maintenanceType} onChange={v => { setPage(1); setFilters({ ...filters, maintenanceType: v }); }} options={MAINTENANCE_TYPES.map(v => ({ value: v, label: label(v) }))} style={{ width: 160 }} />
      <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
      {can('maintenance.job_card.create') && <Button type="primary" icon={<PlusOutlined />} onClick={() => {
        const company = org.companies.find(v => v.id === filters.companyId); const division = org.divisions.find(v => v.id === filters.divisionId); const section = org.sections.find(v => v.id === filters.sectionId); const department = org.departments.find(v => v.id === filters.assignedDepartmentId); const machine = org.machines.find(v => v.id === filters.machineId);
        const context = company && division && section && department && machine && [company.id, division.id, section.id, department.id, machine.id].every(value => UUID_RE.test(String(value))) ? { companyId: company.id, companyName: optionLabel(company), divisionId: division.id, divisionName: optionLabel(division), sectionId: section.id, sectionName: optionLabel(section), departmentId: department.id, departmentName: optionLabel(department), machineId: machine.id, machineName: optionLabel(machine), machineCode: machine.machineCode } : undefined;
        navigate('/maintenance/job-cards/new', { state: { context } });
      }}>Create Job Card</Button>}
    </Space></Card>
    {error && <Alert type="error" showIcon message="Unable to load job cards" description={error} action={<Button onClick={load}>Retry</Button>} style={{ marginBottom: 16 }} />}
    {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState title="No job cards found" description="Create a job card or adjust the filters." /> : <><Table rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1200 }} /><Pagination current={page} pageSize={20} total={total} onChange={setPage} showSizeChanger={false} style={{ marginTop: 16, textAlign: 'right' }} /></>}
  </div>;
};

export default JobCardList;
