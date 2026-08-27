import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Form, Input, Modal, Row, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, TeamOutlined, DeleteOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState, PageHeader } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { errorText, label } from './jobCards.types';

const BASE = '/master-data/maintenance/teams';
type Team = Record<string, any>;

export const TeamsList: React.FC = () => {
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiService.get<any[]>(BASE);
      setTeams(result || []);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTeam = async (values: any) => {
    setSaving(true);
    try {
      const memberUserIds = values.memberUserIds ? values.memberUserIds.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      await apiService.post(BASE, { ...values, memberUserIds });
      message.success('Team created');
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e) { message.error(errorText(e)); }
    finally { setSaving(false); }
  };

  const deleteTeam = async (id: string) => {
    try { await apiService.delete(`${BASE}/${id}`); message.success('Team deactivated'); load(); }
    catch (e) { message.error(errorText(e)); }
  };

  const viewTeam = async (id: string) => {
    try {
      const team = await apiService.get<any>(`${BASE}/${id}`);
      setSelectedTeam(team);
      setDetailOpen(true);
    } catch (e) { message.error(errorText(e)); }
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    {
      title: 'Department',
      render: (_: any, r: Team) => r.department?.name || '—',
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Team) => (
        <Space>
          <Button size="small" onClick={() => viewTeam(r.id)}>View</Button>
          {can('maintenance.team.manage') && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({
              title: 'Deactivate this team?',
              onOk: () => deleteTeam(r.id),
            })} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader icon={<TeamOutlined />} title="Maintenance Teams" subtitle="Teams and technician assignments" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs />
      {error && <Alert type="error" showIcon message="Unable to load teams" description={error} style={{ marginBottom: 16 }} />}
      {loading ? <LoadingState /> : (
        <>
          <div style={{ marginBottom: 16, textAlign: 'right' }}>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
              {can('maintenance.team.manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>Create Team</Button>}
            </Space>
          </div>
          {teams.length === 0 ? <EmptyState title="No teams" description="Create a maintenance team to get started." /> : (
            <Table rowKey="id" columns={columns} dataSource={teams} pagination={{ pageSize: 20 }} />
          )}
        </>
      )}

      <Modal title="Create Team" open={createOpen} confirmLoading={saving} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} width={560}>
        <Form form={form} layout="vertical" onFinish={createTeam}>
          <Row gutter={16}>
            <Col span={8}><Form.Item name="companyId" label="Company ID" rules={[{ required: true }]}><Input placeholder="UUID" /></Form.Item></Col>
            <Col span={8}><Form.Item name="code" label="Team Code" rules={[{ required: true }]}><Input placeholder="e.g. MAINT-01" /></Form.Item></Col>
            <Col span={8}><Form.Item name="name" label="Team Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="departmentId" label="Department ID"><Input placeholder="UUID (optional)" /></Form.Item>
          <Form.Item name="memberUserIds" label="Member User IDs (comma separated)"><Input placeholder="UUID, UUID, ..." /></Form.Item>
        </Form>
      </Modal>

      <Modal title="Team Details" open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={640}>
        {selectedTeam && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Code">{selectedTeam.code}</Descriptions.Item>
              <Descriptions.Item label="Name">{selectedTeam.name}</Descriptions.Item>
              <Descriptions.Item label="Description" span={2}>{selectedTeam.description || '—'}</Descriptions.Item>
              <Descriptions.Item label="Department">{selectedTeam.department?.name || '—'}</Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5} style={{ marginTop: 16 }}>Members</Typography.Title>
            {selectedTeam.members?.length > 0 ? (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={selectedTeam.members}
                columns={[
                  { title: 'Name', render: (_: any, r: any) => r.user?.displayName || r.user?.email || r.userId },
                  { title: 'Role', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> },
                ]}
              />
            ) : (
              <Typography.Text type="secondary">No members assigned</Typography.Text>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};

export default TeamsList;
