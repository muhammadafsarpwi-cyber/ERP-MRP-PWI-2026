import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Descriptions, Form, Input, Modal, Row, Space, Table, Tabs, Tag, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, TeamOutlined, DeleteOutlined, EditOutlined, ToolOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { panelCard, shadowSm } from './maintTheme';
import { errorText } from './jobCards.types';
import './maintTheme.css';

const TEAMS_BASE = '/master-data/maintenance/teams';
const TECHS_BASE = '/master-data/maintenance/technicians';
type Team = Record<string, any>;
type Technician = Record<string, any>;

const techStatusColor = (status?: string) => (status === 'ACTIVE' ? 'green' : 'default');
const techLink = (t: Technician) => (t?.userId ? { linked: true, name: t.user?.displayName || t.user?.email || '' } : { linked: false, name: '' });

export const TeamsList: React.FC = () => {
  const { message } = AntApp.useApp();
  const { can } = usePermission();
  const [tab, setTab] = useState('teams');

  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techLoading, setTechLoading] = useState(true);
  const [techError, setTechError] = useState('');
  const [techModalOpen, setTechModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [techForm] = Form.useForm();
  const [techSaving, setTechSaving] = useState(false);

  const loadTeams = useCallback(async () => {
    setLoading(true); setError('');
    try { setTeams(await apiService.get<any[]>(TEAMS_BASE) || []); }
    catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, []);

  const loadTechnicians = useCallback(async () => {
    setTechLoading(true); setTechError('');
    try { setTechnicians(await apiService.get<any[]>(TECHS_BASE, { active: 'true' }) || []); }
    catch (e) { setTechError(errorText(e)); }
    finally { setTechLoading(false); }
  }, []);

  useEffect(() => { loadTeams(); }, [loadTeams]);
  useEffect(() => { loadTechnicians(); }, [loadTechnicians]);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    const canManageTeams = can('maintenance.team.manage');
    const canManageTechs = can('maintenance.technician.manage');
    const actions = [];
    if (tab === 'teams') {
      if (canManageTeams) {
        actions.push({ key: 'create-team', node: (<Button type="primary" icon={<PlusOutlined />} onClick={() => { teamForm.resetFields(); setCreateOpen(true); }}>Create Team</Button>) });
      }
      actions.push({ key: 'refresh-teams', node: (<Button icon={<ReloadOutlined />} onClick={loadTeams} loading={loading}>Refresh</Button>) });
    } else {
      if (canManageTechs) {
        actions.push({ key: 'create-tech', node: (<Button type="primary" icon={<PlusOutlined />} onClick={() => { techForm.resetFields(); setEditingTech(null); setTechModalOpen(true); }}>Add Technician</Button>) });
      }
      actions.push({ key: 'refresh-techs', node: (<Button icon={<ReloadOutlined />} onClick={loadTechnicians} loading={techLoading}>Refresh</Button>) });
    }
    setHeaderActions(actions);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, tab, can, loading, techLoading, loadTeams, loadTechnicians, teamForm, techForm]);

  const createTeam = async (values: any) => {
    setSaving(true);
    try {
      const memberUserIds = values.memberUserIds ? values.memberUserIds.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      await apiService.post(TEAMS_BASE, { ...values, memberUserIds });
      message.success('Team created');
      setCreateOpen(false);
      teamForm.resetFields();
      loadTeams();
    } catch (e) { message.error(errorText(e)); }
    finally { setSaving(false); }
  };

  const deleteTeam = async (id: string) => {
    try { await apiService.delete(`${TEAMS_BASE}/${id}`); message.success('Team deactivated'); loadTeams(); }
    catch (e) { message.error(errorText(e)); }
  };

  const viewTeam = async (id: string) => {
    try { setSelectedTeam(await apiService.get<any>(`${TEAMS_BASE}/${id}`)); setDetailOpen(true); }
    catch (e) { message.error(errorText(e)); }
  };

  const saveTechnician = async (values: any) => {
    setTechSaving(true);
    try {
      if (editingTech) {
        await apiService.patch(`${TECHS_BASE}/${editingTech.id}`, values);
        message.success('Technician updated');
      } else {
        await apiService.post(TECHS_BASE, values);
        message.success('Technician created');
      }
      setTechModalOpen(false);
      techForm.resetFields();
      loadTechnicians();
    } catch (e) { message.error(errorText(e)); }
    finally { setTechSaving(false); }
  };

  const deleteTechnician = async (id: string) => {
    try { await apiService.delete(`${TECHS_BASE}/${id}`); message.success('Technician deactivated'); loadTechnicians(); }
    catch (e) { message.error(errorText(e)); }
  };

  const openEditTechnician = (t: Technician) => {
    setEditingTech(t);
    techForm.setFieldsValue({
      employeeId: t.employeeId,
      technicianName: t.technicianName,
      department: t.department || 'Maintenance',
      skill: t.skill || undefined,
      shift: t.shift || undefined,
      status: t.status || 'ACTIVE',
      remarks: t.remarks || undefined,
    });
    setTechModalOpen(true);
  };

  const techColumns = [
    { title: 'Employee ID', dataIndex: 'employeeId', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Technician Name', dataIndex: 'technicianName' },
    { title: 'Department', dataIndex: 'department' },
    { title: 'Skill', dataIndex: 'skill', render: (v: string) => v || '—' },
    { title: 'Shift', dataIndex: 'shift', render: (v: string) => v || '—' },
    { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag color={techStatusColor(v)}>{v || '—'}</Tag> },
    { title: 'ERP User', render: (_: any, t: Technician) => { const { linked, name } = techLink(t); return linked ? <><Typography.Text>{name || 'Linked'}</Typography.Text> <Tag color="green">Linked</Tag></> : <Tag color="default">Not Linked</Tag>; } },
    { title: 'Remarks', dataIndex: 'remarks', render: (v: string) => v || '—', ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, t: Technician) => can('maintenance.technician.manage') ? (
        <Space wrap size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditTechnician(t)}>Edit</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: 'Deactivate this technician?', onOk: () => deleteTechnician(t.id) })} />
        </Space>
      ) : <Typography.Text type="secondary">No access</Typography.Text>,
    },
  ];

  const teamColumns = [
    { title: 'Code', dataIndex: 'code', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Department', render: (_: any, r: Team) => r.department?.name || '—' },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, r: Team) => (
        <Space wrap size={4}>
          <Button size="small" onClick={() => viewTeam(r.id)}>View</Button>
          {can('maintenance.team.manage') && (
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => Modal.confirm({ title: 'Deactivate this team?', onOk: () => deleteTeam(r.id) })} />
          )}
        </Space>
      ),
    },
  ];

  return (
    <div className="maint-table-scroll">
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'teams',
          label: (<Space size={6}><TeamOutlined />Teams</Space>),
          children: (
            <>
              {error && <Alert type="error" showIcon message="Unable to load teams" description={error} style={{ marginBottom: 16, borderRadius: 6 }} />}
              {loading ? <LoadingState /> : teams.length === 0 ? (
                <Card style={{ ...panelCard }}><EmptyState title="No teams" description="Create a maintenance team to get started." /></Card>
              ) : (
                <Card style={{ ...panelCard, boxShadow: shadowSm }} styles={{ body: { padding: 0 } }}>
                  <Table rowKey="id" columns={teamColumns} dataSource={teams} pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 760 }} />
                </Card>
              )}
            </>
          ),
        },
        {
          key: 'technicians',
          label: (<Space size={6}><ToolOutlined />Technicians</Space>),
          children: (
            <>
              {techError && <Alert type="error" showIcon message="Unable to load technicians" description={techError} style={{ marginBottom: 16, borderRadius: 6 }} />}
              {techLoading ? <LoadingState /> : technicians.length === 0 ? (
                <Card style={{ ...panelCard }}><EmptyState title="No technicians" description="Add a technician to the maintenance master." /></Card>
              ) : (
                <Card style={{ ...panelCard, boxShadow: shadowSm }} styles={{ body: { padding: 0 } }}>
                  <Table rowKey="id" columns={techColumns} dataSource={technicians} pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 980 }} />
                </Card>
              )}
            </>
          ),
        },
      ]} />

      <Modal title={<Space><TeamOutlined />Create Team</Space>} open={createOpen} confirmLoading={saving} onCancel={() => setCreateOpen(false)} onOk={() => teamForm.submit()} width={560}>
        <Form form={teamForm} layout="vertical" onFinish={createTeam}>
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
              <Table rowKey="id" size="small" pagination={false} dataSource={selectedTeam.members} columns={[{ title: 'Name', render: (_: any, r: any) => r.user?.displayName || r.user?.email || r.userId }, { title: 'Role', dataIndex: 'role', render: (v: string) => <Tag>{v}</Tag> }]} />
            ) : (
              <Typography.Text type="secondary">No members assigned</Typography.Text>
            )}
          </>
        )}
      </Modal>

      <Modal
        title={editingTech ? 'Edit Technician' : 'Add Technician'}
        open={techModalOpen}
        confirmLoading={techSaving}
        onCancel={() => setTechModalOpen(false)}
        onOk={() => techForm.submit()}
        width={620}
        destroyOnHidden
      >
        <Form form={techForm} layout="vertical" onFinish={saveTechnician}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="employeeId" label="Employee ID" rules={[{ required: true, message: 'Employee ID is required' }]}><Input placeholder="e.g. EMP008" /></Form.Item></Col>
            <Col span={12}><Form.Item name="technicianName" label="Technician Name" rules={[{ required: true, message: 'Technician name is required' }]}><Input placeholder="Full name" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="department" label="Department"><Input placeholder="Maintenance" /></Form.Item></Col>
            <Col span={12}><Form.Item name="skill" label="Skill"><Input placeholder="e.g. Mechanical, Electrical" /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="shift" label="Shift"><Input placeholder="e.g. General" /></Form.Item></Col>
            <Col span={12}><Form.Item name="status" label="Status"><Input placeholder="ACTIVE" /></Form.Item></Col>
          </Row>
          <Form.Item name="remarks" label="Remarks"><Input.TextArea rows={2} placeholder="Optional notes" /></Form.Item>
          <Typography.Text type="secondary">The ERP user link, when available, is managed separately and shown as "Linked" or "Not Linked".</Typography.Text>
        </Form>
      </Modal>
    </div>
  );
};

export default TeamsList;
