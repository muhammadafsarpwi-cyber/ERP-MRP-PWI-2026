import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Descriptions, Form, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { ReloadOutlined, CalendarOutlined, ThunderboltOutlined, CheckCircleOutlined, StopOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { panelCard, shadowSm } from './maintTheme';
import { errorText, label } from './jobCards.types';
import './maintTheme.css';

const PM_BASE = '/master-data/maintenance/pm';
type PmSchedule = Record<string, any>;
type PmPlan = Record<string, any>;

const rowsOf = (r: any): any[] => r?.data?.data || r?.data || r || [];

const statusColor = (status: string) => {
  switch (status) {
    case 'SCHEDULED': return 'blue';
    case 'DUE': return 'orange';
    case 'OVERDUE': return 'red';
    case 'COMPLETED': return 'green';
    case 'SKIPPED': return 'default';
    default: return 'default';
  }
};

export const PmSchedules: React.FC = () => {
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [schedules, setSchedules] = useState<PmSchedule[]>([]);
  const [plans, setPlans] = useState<PmPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [filterPlanId, setFilterPlanId] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const loadSchedules = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiService.get<any[]>(PM_BASE + '/schedules');
      setSchedules(rowsOf(result));
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  const loadPlans = useCallback(async () => {
    try {
      const result = await apiService.get<any[]>(PM_BASE + '/plans');
      setPlans(rowsOf(result));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadSchedules(); loadPlans(); }, [loadSchedules, loadPlans]);

  const generateSchedules = async (values: { monthsAhead: number }) => {
    if (!selectedPlanId) { message.error('Select a PM plan first'); return; }
    setGenerating(true);
    try {
      await apiService.post(`${PM_BASE}/plans/${selectedPlanId}/generate-schedules`, { monthsAhead: values.monthsAhead });
      message.success('PM schedules generated successfully');
      setGenerateOpen(false);
      loadSchedules();
    } catch (e) { message.error(errorText(e)); }
    finally { setGenerating(false); }
  };

  const filtered = schedules.filter(s => {
    if (filterPlanId && s.pmPlanId !== filterPlanId) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    return true;
  }).sort((a, b) => {
    const aDone = a.status === 'COMPLETED' || a.status === 'SKIPPED';
    const bDone = b.status === 'COMPLETED' || b.status === 'SKIPPED';
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
  });

  const hasActiveFilter = !!(filterPlanId || filterStatus);
  const openGenerate = () => { setSelectedPlanId(''); setGenerateOpen(true); };

  const completeSchedule = async (scheduleId: string) => {
    try {
      await apiService.post(`${PM_BASE}/schedules/${scheduleId}/complete`);
      message.success('Schedule marked as completed');
      loadSchedules();
    } catch (e) { message.error(errorText(e)); }
  };

  const skipSchedule = async (scheduleId: string) => {
    try {
      await apiService.post(`${PM_BASE}/schedules/${scheduleId}/skip`);
      message.success('Schedule skipped');
      loadSchedules();
    } catch (e) { message.error(errorText(e)); }
  };

  const canManage = can('maintenance.pm.manage');

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      ...(canManage
        ? [{
            key: 'generate',
            node: (
              <Button type="primary" icon={<ThunderboltOutlined />} onClick={openGenerate}>
                Generate Schedules
              </Button>
            ),
          }]
        : []),
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={loadSchedules} loading={loading}>Refresh</Button>) },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, canManage, loading, loadSchedules]);

  const columns = [
    {
      title: 'Plan',
      render: (_: any, r: PmSchedule) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{r.pmPlan?.planCode || r.pmPlanId}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{r.pmPlan?.planName || ''}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Machine',
      render: (_: any, r: PmSchedule) => r.machine ? `${r.machine.machineCode || ''} ${r.machine.name || ''}`.trim() || '—' : '—',
    },
    { title: 'Scheduled Date', dataIndex: 'scheduledDate', render: (v: string) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v: string) => <Tag color={statusColor(v)}>{label(v)}</Tag>,
    },
    {
      title: 'Job Card',
      render: (_: any, r: PmSchedule) => r.generatedJobCard
        ? <a href={`/maintenance/job-cards/${r.generatedJobCardId}`}>{r.generatedJobCard.jobCardNo || 'View'}</a>
        : '—',
    },
    {
      title: 'Completed At',
      dataIndex: 'completedAt',
      render: (v: string) => v ? new Date(v).toLocaleString() : '—',
    },
    ...(canManage ? [{
      title: 'Actions',
      render: (_: any, r: PmSchedule) => r.status === 'COMPLETED' || r.status === 'SKIPPED' ? <Tag color={r.status === 'COMPLETED' ? 'green' : 'default'}>{label(r.status)}</Tag> : (
        <Space wrap size={4}>
          <Popconfirm title="Mark this schedule as completed?" onConfirm={() => completeSchedule(r.id)} okText="Complete" cancelText="Cancel">
            <Button size="small" type="primary" icon={<CheckCircleOutlined />}>Complete</Button>
          </Popconfirm>
          <Popconfirm title="Skip this schedule?" onConfirm={() => skipSchedule(r.id)} okText="Skip" cancelText="Cancel">
            <Button size="small" danger icon={<StopOutlined />}>Skip</Button>
          </Popconfirm>
        </Space>
      ),
    }] : []),
  ];

  return (
    <div className="maint-table-scroll" style={{ width: '100%' }}>
      <Card style={{ ...panelCard, marginBottom: 12, boxShadow: shadowSm }}>
        <Space wrap>
          <Select
            allowClear
            placeholder="Filter by Plan"
            value={filterPlanId}
            onChange={setFilterPlanId}
            options={plans.map(p => ({ value: p.id, label: `${p.planCode} - ${p.planName}` }))}
            style={{ minWidth: 220 }}
          />
          <Select
            allowClear
            placeholder="Filter by Status"
            value={filterStatus}
            onChange={setFilterStatus}
            options={['SCHEDULED', 'DUE', 'OVERDUE', 'COMPLETED', 'SKIPPED'].map(s => ({ value: s, label: label(s) }))}
            style={{ minWidth: 160 }}
          />
          {hasActiveFilter && <Button type="text" onClick={() => { setFilterPlanId(undefined); setFilterStatus(undefined); }}>Clear</Button>}
        </Space>
      </Card>

      {error && <Alert type="error" showIcon message="Unable to load schedules" description={error} style={{ marginBottom: 16, borderRadius: 6 }} />}
      {loading ? <LoadingState /> : filtered.length === 0 ? (
        <Card style={{ ...panelCard }}><EmptyState title="No PM schedules" description="Generate schedules from a PM plan." /></Card>
      ) : (
        <Card style={{ ...panelCard, boxShadow: shadowSm }} styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" columns={columns} dataSource={filtered} pagination={{ pageSize: 50, showSizeChanger: true }} scroll={{ x: 900 }} />
        </Card>
      )}

      <Modal
        title={<Space><CalendarOutlined />Generate PM Schedules</Space>}
        open={generateOpen}
        destroyOnHidden
        confirmLoading={generating}
        onCancel={() => setGenerateOpen(false)}
        onOk={() => {
          const form = document.querySelector('#generate-schedule-form') as HTMLFormElement;
          if (form) form.requestSubmit();
        }}
      >
        <Form id="generate-schedule-form" layout="vertical" onFinish={generateSchedules}>
          <Form.Item label="PM Plan" required>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a PM plan"
              value={selectedPlanId || undefined}
              onChange={(v) => setSelectedPlanId(v)}
              options={plans.map(p => ({ value: p.id, label: `${p.planCode} - ${p.planName}` }))}
            />
          </Form.Item>
          <Form.Item name="monthsAhead" label="Months Ahead" initialValue={3} rules={[{ required: true, message: 'Enter number of months' }]}>
            <InputNumber min={1} max={24} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
        {selectedPlanId && (() => {
          const plan = plans.find(p => p.id === selectedPlanId);
          return plan ? (
            <Descriptions column={2} size="small" bordered style={{ marginTop: 16 }}>
              <Descriptions.Item label="Machine">{plan.machine?.name || plan.machineId}</Descriptions.Item>
              <Descriptions.Item label="Frequency">{plan.frequencyValue}x {label(plan.frequencyType)}</Descriptions.Item>
              <Descriptions.Item label="Start Date">{plan.startDate || 'Not set'}</Descriptions.Item>
              <Descriptions.Item label="Team">{plan.assignedTeam?.name || '—'}</Descriptions.Item>
            </Descriptions>
          ) : null;
        })()}
      </Modal>
    </div>
  );
};

export default PmSchedules;
