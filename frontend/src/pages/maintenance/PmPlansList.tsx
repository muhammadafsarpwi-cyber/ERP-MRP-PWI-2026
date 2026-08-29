import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Form, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { panelCard, shadowSm } from './maintTheme';
import { errorText, label } from './jobCards.types';
import './maintTheme.css';

const BASE = '/master-data/maintenance/pm';
type PmPlan = Record<string, any>;
type OrgOption = { id: string; name?: string; code?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rowsOf = (r: any): any[] => r?.data?.data || r?.data || r || [];
const uuidRowsOf = (r: any): OrgOption[] => rowsOf(r).filter((i: any) => i && UUID_RE.test(String(i.id)));
const optionLabel = (o: OrgOption) => o.name || o.code || o.id;

const frequencyLabel = (r: PmPlan) => `${r.frequencyValue}x ${label(r.frequencyType)}`;

const FREQUENCY_OPTIONS = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL', 'HOURS'];

const STATUS_COLOR: Record<string, string> = {
  SCHEDULED: 'blue',
  DUE: 'orange',
  OVERDUE: 'red',
  COMPLETED: 'green',
  SKIPPED: 'default',
};

export const PmPlansList: React.FC = () => {
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [plans, setPlans] = useState<PmPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PmPlan | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [machines, setMachines] = useState<OrgOption[]>([]);
  const [teams, setTeams] = useState<OrgOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiService.get<any[]>(BASE + '/plans');
      setPlans(rowsOf(result));
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { apiService.get<any>('/machines', { limit: 200 }).then(r => setMachines(uuidRowsOf(r))).catch(() => {}); }, []);
  useEffect(() => { apiService.get<any>('/master-data/maintenance/teams', { limit: 200 }).then(r => setTeams(uuidRowsOf(r))).catch(() => {}); }, []);

  const createPlan = async (values: any) => {
    setSaving(true);
    try {
      await apiService.post(BASE + '/plans', values);
      message.success('PM plan created');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e) { message.error(errorText(e)); }
    finally { setSaving(false); }
  };

  const deletePlan = async (id: string) => {
    try { await apiService.delete(`${BASE}/plans/${id}`); message.success('PM plan deactivated'); load(); }
    catch (e) { message.error(errorText(e)); }
  };

  const viewPlan = async (id: string) => {
    try {
      const plan = await apiService.get<any>(`${BASE}/plans/${id}`);
      setSelectedPlan(plan);
      setDetailOpen(true);
    } catch (e) { message.error(errorText(e)); }
  };

  const canManage = can('maintenance.pm.manage');

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      ...(canManage
        ? [{
            key: 'create-plan',
            node: (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>
                Create PM Plan
              </Button>
            ),
          }]
        : []),
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={load} loading={loading}>Refresh</Button>) },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, canManage, loading, load]);

  const columns = [
    { title: 'Code', dataIndex: 'planCode', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Plan Name', dataIndex: 'planName' },
    {
      title: 'Machine',
      render: (_: any, r: PmPlan) => r.machine ? `${r.machine.machineCode || ''} ${r.machine.name || ''}`.trim() || '—' : '—',
    },
    { title: 'Frequency', render: (_: any, r: PmPlan) => <Tag color={STATUS_COLOR.SCHEDULED}>{frequencyLabel(r)}</Tag> },
    {
      title: 'Team',
      render: (_: any, r: PmPlan) => r.assignedTeam?.name || '—',
    },
    { title: 'Start Date', dataIndex: 'startDate', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    { title: 'Next Due', dataIndex: 'nextDueDate', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: PmPlan) => (
        <Space wrap size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => viewPlan(r.id)}>View</Button>
          {canManage && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({
              title: 'Deactivate this PM plan?',
              onOk: () => deletePlan(r.id),
            })} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="maint-table-scroll">
      {error && <Alert type="error" showIcon message="Unable to load PM plans" description={error} style={{ marginBottom: 16, borderRadius: 6 }} />}
      {loading ? <LoadingState /> : plans.length === 0 ? (
        <Card style={{ ...panelCard }}><EmptyState title="No PM plans" description="Create a preventive maintenance plan to get started." /></Card>
      ) : (
        <Card style={{ ...panelCard, boxShadow: shadowSm }} styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" columns={columns} dataSource={plans} pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 1080 }} />
        </Card>
      )}

      <Modal title="Create PM Plan" open={createOpen} confirmLoading={saving} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} width={640}>
        <Form form={form} layout="vertical" onFinish={createPlan}>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="companyId" label="Company ID" rules={[{ required: true }]}><Input placeholder="UUID" /></Form.Item></Col>
            <Col span={8}><Form.Item name="planCode" label="Plan Code" rules={[{ required: true }]}><Input placeholder="e.g. PM-001" /></Form.Item></Col>
            <Col span={8}><Form.Item name="planName" label="Plan Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="machineId" label="Machine" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={machines.map(m => ({ value: m.id, label: optionLabel(m) }))} /></Form.Item></Col>
            <Col span={12}><Form.Item name="assignedTeamId" label="Assigned Team"><Select allowClear options={teams.map(t => ({ value: t.id, label: optionLabel(t) }))} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="frequencyType" label="Frequency" rules={[{ required: true }]}><Select options={FREQUENCY_OPTIONS.map(f => ({ value: f, label: f }))} /></Form.Item></Col>
            <Col span={8}><Form.Item name="frequencyValue" label="Value" rules={[{ required: true }]}><InputNumber min={1} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="startDate" label="Start Date"><Input type="date" /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      <Modal title="PM Plan Details" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {selectedPlan && (
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="Code">{selectedPlan.planCode}</Descriptions.Item>
            <Descriptions.Item label="Name">{selectedPlan.planName}</Descriptions.Item>
            <Descriptions.Item label="Description" span={2}>{selectedPlan.description || '—'}</Descriptions.Item>
            <Descriptions.Item label="Machine">{selectedPlan.machine ? `${selectedPlan.machine.machineCode || ''} ${selectedPlan.machine.name || ''}`.trim() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Frequency">{frequencyLabel(selectedPlan)}</Descriptions.Item>
            <Descriptions.Item label="Team">{selectedPlan.assignedTeam?.name || '—'}</Descriptions.Item>
            <Descriptions.Item label="Start Date">{selectedPlan.startDate ? new Date(selectedPlan.startDate).toLocaleDateString() : '—'}</Descriptions.Item>
            <Descriptions.Item label="Next Due">{selectedPlan.nextDueDate ? new Date(selectedPlan.nextDueDate).toLocaleDateString() : '—'}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default PmPlansList;
