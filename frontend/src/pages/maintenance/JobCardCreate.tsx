import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Form, Input, Modal, Row, Select, Space, Typography } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';
import {
  JOB_CARD_BASE, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES,
  JobCard, OrgOption, JobCardContext,
  normalizeOptionalUuid, uuidRowsOf, optionLabel, categoryLabel, errorText, label,
} from './jobCards.types';
import { ScanOutlined } from '@ant-design/icons';

const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const machineLabel = (m: OrgOption) =>
  `${m.machineCode || m.machineId || '—'} — ${m.machineName || m.name || m.machineId || 'Unnamed machine'}`;

export const JobCardCreate: React.FC = () => {
  const navigate = useNavigate(); const location = useLocation(); const { message } = AntApp.useApp();
  const context = (location.state as { context?: JobCardContext } | null)?.context;
  const [form] = Form.useForm(); const [categoryForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [lookupCode, setLookupCode] = useState(''); const [lookupLoading, setLookupLoading] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<JobCard | null>(null);
  const [machines, setMachines] = useState<OrgOption[]>([]); const [machinesLoading, setMachinesLoading] = useState(false); const [machinesError, setMachinesError] = useState('');
  const [categories, setCategories] = useState<OrgOption[]>([]); const [rootCategories, setRootCategories] = useState<OrgOption[]>([]); const [failureCategories, setFailureCategories] = useState<OrgOption[]>([]);
  const [categoryError, setCategoryError] = useState(''); const [relatedCategoryError, setRelatedCategoryError] = useState('');
  const [categoryModalOpen, setCategoryModalOpen] = useState(false); const [categorySaving, setCategorySaving] = useState(false);
  const [org, setOrg] = useState<{ divisions: OrgOption[]; sections: OrgOption[]; departments: OrgOption[] }>({ divisions: [], sections: [], departments: [] });
  const companyId = Form.useWatch('companyId', form); const divisionId = Form.useWatch('divisionId', form); const sectionId = Form.useWatch('sectionId', form); const departmentId = Form.useWatch('assignedDepartmentId', form); const { user, can } = usePermission();
  useEffect(() => { if (companyId) apiService.get<any>('/divisions', { companyId, limit: 100 }).then(r => setOrg(v => ({ ...v, divisions: uuidRowsOf(r) }))).catch(() => undefined); }, [companyId]);
  useEffect(() => { if (divisionId) apiService.get<any>('/sections', { companyId, divisionId, limit: 100 }).then(r => setOrg(v => ({ ...v, sections: uuidRowsOf(r) }))).catch(() => undefined); else setOrg(v => ({ ...v, sections: [] })); }, [companyId, divisionId]);
  useEffect(() => { if (sectionId) apiService.get<any>('/departments', { companyId, divisionId, sectionId, limit: 100 }).then(r => setOrg(v => ({ ...v, departments: uuidRowsOf(r) }))).catch(() => undefined); else setOrg(v => ({ ...v, departments: [] })); }, [companyId, divisionId, sectionId]);
  useEffect(() => {
    if (!companyId) { setMachines([]); return; }
    let cancelled = false;
    setMachinesLoading(true);
    const params: Record<string, any> = { limit: 1000, sortBy: 'machineCode' };
    if (divisionId) params.divisionId = divisionId;
    if (sectionId) params.sectionId = sectionId;
    if (departmentId) params.departmentId = departmentId;
    apiService.get<any>('/machines', params)
      .then(r => { if (!cancelled) { setMachines(uuidRowsOf(r)); setMachinesError(''); } })
      .catch(e => { if (!cancelled) { setMachines([]); setMachinesError(errorText(e)); } })
      .finally(() => { if (!cancelled) setMachinesLoading(false); });
    return () => { cancelled = true; };
  }, [companyId, divisionId, sectionId, departmentId]);
  const loadCategories = useCallback(async () => { if (!companyId) { setCategories([]); setCategoryError(''); return; } setCategoryError(''); try { const response = await apiService.get<any>('/master-data/maintenance/categories/complaint', { companyId }); setCategories(uuidRowsOf(response)); } catch (error) { setCategories([]); setCategoryError(errorText(error)); } }, [companyId]);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  const loadRelatedCategories = useCallback(async () => { if (!companyId) { setFailureCategories([]); setRootCategories([]); setRelatedCategoryError(''); return; } setRelatedCategoryError(''); Promise.all([apiService.get<any>('/master-data/maintenance/categories/failure', { companyId }), apiService.get<any>('/master-data/maintenance/categories/root-cause', { companyId })]).then(([failure, root]) => { setFailureCategories(uuidRowsOf(failure)); setRootCategories(uuidRowsOf(root)); }).catch(error => { setFailureCategories([]); setRootCategories([]); setRelatedCategoryError(errorText(error)); }); }, [companyId]);
  useEffect(() => { loadRelatedCategories(); }, [loadRelatedCategories]);
  const saveCategory = async (values: any) => { if (!companyId) return; setCategorySaving(true); try { const created = await apiService.post<any>('/master-data/maintenance/categories/complaint', { ...values, companyId }); const category = created?.data || created; await loadCategories(); if (category?.id) form.setFieldValue('complaintCategoryId', category.id); setCategoryModalOpen(false); categoryForm.resetFields(); message.success('Complaint category added'); } catch (error) { message.error(errorText(error)); } finally { setCategorySaving(false); } };
  const clearMachine = () => { setSelectedMachine(null); form.setFieldsValue({ machineId: undefined, machineNumber: undefined, machineBarcode: undefined }); };
  const handleMachineChange = (value: string) => {
    const machine = machines.find(m => m.id === value) || null;
    setSelectedMachine(machine);
    if (machine) form.setFieldsValue({ machineId: machine.id, machineBarcode: (machine as any).qrPayload || machine.machineCode || '' });
    else form.setFieldsValue({ machineId: undefined, machineBarcode: undefined });
  };
  const lookupMachine = async () => {
    if (!lookupCode.trim()) return; setLookupLoading(true);
    try {
      const machine = await apiService.get<JobCard>(`/machines/by-code/${encodeURIComponent(lookupCode.trim())}`);
      if ((companyId && machine.companyId !== companyId) || (divisionId && machine.divisionId !== divisionId) || (sectionId && machine.sectionId !== sectionId) || (departmentId && machine.departmentId !== departmentId)) throw new Error('Machine is outside the selected organizational context');
      setSelectedMachine(machine); form.setFieldValue('machineId', machine.id); form.setFieldValue('machineBarcode', machine.qrPayload || machine.machineCode || ''); form.setFieldValue('machineNumber', machine.id);
      message.success(`Machine found: ${machine.machineName || machine.name || machine.machineCode || machine.id}`);
    } catch (e) { setSelectedMachine(null); message.error(errorText(e)); } finally { setLookupLoading(false); }
  };
  const submit = async (values: JobCard) => {
    try {
      const companyId = normalizeOptionalUuid(values.companyId || user?.defaultCompanyId);
      if (!companyId) { message.error('Company selection is invalid. Please select a company again.'); return; }
      const divisionId = normalizeOptionalUuid(values.divisionId);
      if (!divisionId) { message.error('Division selection is invalid. Please select a division again.'); return; }
      const sectionId = normalizeOptionalUuid(values.sectionId);
      if (!sectionId) { message.error('Section selection is invalid. Please select a section again.'); return; }
      const machineId = normalizeOptionalUuid(values.machineId);
      if (!machineId) { message.error('Machine selection is invalid. Please select a machine again.'); return; }

      const assignedDepartmentId = normalizeOptionalUuid(values.assignedDepartmentId);
      const complaintCategoryId = normalizeOptionalUuid(values.complaintCategoryId);
      const rootCauseCategoryId = normalizeOptionalUuid(values.rootCauseCategoryId);
      const failureCategoryId = normalizeOptionalUuid(values.failureCategoryId);

      const maintenanceType = MAINTENANCE_TYPES.includes(values.maintenanceType) ? values.maintenanceType : 'BREAKDOWN';
      const priority = JOB_CARD_PRIORITIES.includes(values.priority) ? values.priority : 'MEDIUM';

      const payload: Record<string, any> = {
        companyId,
        divisionId,
        sectionId,
        machineId,
        complaint: values.complaint,
        priority,
        maintenanceType,
      };
      if (assignedDepartmentId) payload.assignedDepartmentId = assignedDepartmentId;
      if (complaintCategoryId) payload.complaintCategoryId = complaintCategoryId;
      if (rootCauseCategoryId) payload.rootCauseCategoryId = rootCauseCategoryId;
      if (failureCategoryId) payload.failureCategoryId = failureCategoryId;
      if (values.description) payload.description = values.description;

      setLoading(true);
      const created = await apiService.post<JobCard>(JOB_CARD_BASE, payload);
      message.success('Job card created');
      navigate(`/maintenance/job-cards/${created.id}`, { replace: true });
    } catch (e) {
      message.error(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  const initialValues = context ? { priority: 'MEDIUM', maintenanceType: 'BREAKDOWN', companyId: context.companyId, divisionId: context.divisionId, sectionId: context.sectionId, assignedDepartmentId: context.departmentId, machineId: context.machineId } : { priority: 'MEDIUM', maintenanceType: 'BREAKDOWN', companyId: user?.defaultCompanyId };
  return <div><Card><Form form={form} layout="vertical" onFinish={submit} initialValues={initialValues}>
    <Typography.Title level={5}>Organization &amp; Asset</Typography.Title>
    {context ? <Descriptions bordered size="small" column={{ xs: 1, md: 3 }} style={{ marginBottom: 16 }}><Descriptions.Item label="Division">{context.divisionName}</Descriptions.Item><Descriptions.Item label="Section">{context.sectionName}</Descriptions.Item><Descriptions.Item label="Department">{context.departmentName}</Descriptions.Item><Descriptions.Item label="Machine">{context.machineName}{context.machineCode ? ` (${context.machineCode})` : ''}</Descriptions.Item></Descriptions> : <>
      <Row gutter={16}><Col xs={24} md={8}><Form.Item name="divisionId" label="Division" rules={[{ required: true, message: 'Division is required' }]}><Select showSearch optionFilterProp="label" options={org.divisions.map(v => ({ value: v.id, label: optionLabel(v) }))} onChange={() => { form.resetFields(['sectionId', 'assignedDepartmentId']); clearMachine(); }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="sectionId" label="Section" rules={[{ required: true, message: 'Section is required' }]}><Select showSearch disabled={!divisionId} options={org.sections.map(v => ({ value: v.id, label: optionLabel(v) }))} onChange={() => { form.resetFields(['assignedDepartmentId']); clearMachine(); }} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="assignedDepartmentId" label="Department"><Select showSearch disabled={!sectionId} options={org.departments.map(v => ({ value: v.id, label: optionLabel(v) }))} onChange={() => clearMachine()} /></Form.Item></Col></Row>
      <Row gutter={16}><Col xs={24} md={16}><Form.Item name="machineNumber" label="Machine Number" rules={[{ required: true, message: 'Machine is required' }]}><Select showSearch allowClear placeholder="Search / select machine number" optionFilterProp="label" filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())} loading={machinesLoading} disabled={!companyId || machinesLoading} options={machines.map(m => ({ value: m.id, label: machineLabel(m), title: machineLabel(m) }))} notFoundContent={machinesLoading ? 'Loading machines...' : (machinesError || 'No machines available for the selected organization')} onChange={handleMachineChange} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="machineBarcode" label="Machine Barcode" tooltip="Automatically populated from the selected machine"><Input readOnly placeholder="Auto-populated from machine" suffix={<ScanOutlined style={{ color: 'var(--theme-text-muted)' }} />} /></Form.Item></Col></Row>
    </>}
    {context && <><Form.Item name="divisionId" hidden><Input /></Form.Item><Form.Item name="sectionId" hidden><Input /></Form.Item><Form.Item name="assignedDepartmentId" hidden><Input /></Form.Item></>}
    <Form.Item name="companyId" hidden><Input /></Form.Item>
    <Form.Item name="machineId" hidden rules={[{ required: true, message: 'Machine is required' }]}><Input /></Form.Item>
    <Row gutter={16} align="bottom"><Col xs={24} md={16}><Form.Item label="Machine (Scan QR / Enter Code)"><Input placeholder="Scan QR code or enter machine code, then press Enter" value={lookupCode} onChange={e => setLookupCode(e.target.value)} onPressEnter={lookupMachine} suffix={<ScanOutlined style={{ color: 'var(--theme-text-muted)' }} />} /></Form.Item></Col><Col xs={24} md={8}><Form.Item><Button type="primary" icon={<ScanOutlined />} loading={lookupLoading} onClick={lookupMachine} block>Lookup Machine</Button></Form.Item></Col></Row>
    {selectedMachine && <Alert type="success" showIcon message={`Machine: ${selectedMachine.machineName || selectedMachine.name || selectedMachine.machineCode || selectedMachine.id}`} description={<Space size="large"><span>Code: {selectedMachine.machineCode || '—'}</span><span>Type: {selectedMachine.machineType || '—'}</span><span>Location: {selectedMachine.location || '—'}</span></Space>} style={{ marginBottom: 16 }} closable onClose={clearMachine} />}
    <Row gutter={16}><Col xs={24} md={16}><Form.Item name="complaint" label="Complaint" rules={[{ required: true, message: 'Complaint is required' }]}><Input.TextArea rows={3} /></Form.Item></Col><Col xs={24} md={8}><Form.Item name="priority" label="Priority"><Select options={priorities.map(v => ({ value: v, label: label(v) }))} /></Form.Item></Col></Row>
    <Row gutter={16}><Col xs={24} md={12}><Form.Item name="maintenanceType" label="Maintenance Type"><Select options={MAINTENANCE_TYPES.map(v => ({ value: v, label: label(v) }))} /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="complaintCategoryId" label="Complaint category"><Select allowClear showSearch optionFilterProp="label" options={categories.map(category => ({ value: category.id, label: categoryLabel(category) }))} placeholder="Select complaint category" notFoundContent="No complaint categories available" /></Form.Item></Col></Row>
    <Row gutter={16}><Col xs={24} md={12}><Form.Item name="rootCauseCategoryId" label="Root cause category"><Select allowClear showSearch optionFilterProp="label" options={rootCategories.map(category => ({ value: category.id, label: categoryLabel(category) }))} placeholder="Select root cause category" notFoundContent="No root cause categories available" /></Form.Item></Col><Col xs={24} md={12}><Form.Item name="failureCategoryId" label="Failure category"><Select allowClear showSearch optionFilterProp="label" options={failureCategories.map(category => ({ value: category.id, label: categoryLabel(category) }))} placeholder="Select failure category" notFoundContent="No failure categories available" /></Form.Item></Col></Row>
    <Form.Item name="description" label="Description"><Input.TextArea rows={4} /></Form.Item>
    {categoryError && <Alert type="error" showIcon message="Unable to load complaint categories" description={categoryError} action={<Button size="small" onClick={loadCategories}>Retry</Button>} style={{ marginBottom: 16 }} />}{relatedCategoryError && <Alert type="error" showIcon message="Unable to load root cause/failure categories" description={relatedCategoryError} action={<Button size="small" onClick={loadRelatedCategories}>Retry</Button>} style={{ marginBottom: 16 }} />}
    {can('maintenance.category.manage') && <Button type="link" onClick={() => setCategoryModalOpen(true)} style={{ paddingLeft: 0 }}>+ Add Complaint Category</Button>}
    <Form.Item><Button onClick={() => navigate('/maintenance/job-cards')}>Cancel</Button> <Button type="primary" htmlType="submit" loading={loading}>Create Job Card</Button></Form.Item>
  </Form><Modal title="Add Complaint Category" open={categoryModalOpen} confirmLoading={categorySaving} onCancel={() => { setCategoryModalOpen(false); categoryForm.resetFields(); }} onOk={() => categoryForm.submit()}><Form form={categoryForm} layout="vertical" onFinish={saveCategory}><Form.Item name="name" label="Category name" rules={[{ required: true, message: 'Category name is required' }]}><Input /></Form.Item><Form.Item name="code" label="Category code"><Input /></Form.Item><Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item></Form></Modal></Card></div>;
};

export default JobCardCreate;
