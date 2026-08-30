import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, Switch, message, Popconfirm, Typography, Row, Col, Alert } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SettingOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

const { Text } = Typography;

const RECIPIENT_TYPES = ['ROLE','DEPARTMENT','DIVISION','SECTION','USER','COMPANY','CREATOR','ASSIGNEE','APPROVER','MANAGER'];
const SEVERITIES = ['INFO','NORMAL','HIGH','CRITICAL'];
const MODULES = ['maintenance','procurement','sales','inventory','manufacturing','qc','hr','finance','system'];

interface RuleRow {
  id: string;
  ruleCode: string;
  ruleName: string;
  eventCode: string;
  module: string;
  inApp: boolean;
  email: boolean;
  whatsapp: boolean;
  severity: string;
  recipientType: string;
  recipientRoles: string[] | null;
  recipientUserIds: string[] | null;
  recipientEmails: string[] | null;
  templateCode: string | null;
  enabled: boolean;
}

const NotificationRulesPage: React.FC = () => {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RuleRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/notifications/admin/rules');
      setRows(res.data || []);
    } catch { message.error('Unable to load rules'); }
    setLoading(false);
  };
  const loadMeta = async () => {
    try {
      const [e, t] = await Promise.all([
        apiService.get<any>('/notifications/admin/events'),
        apiService.get<any>('/notifications/admin/templates'),
      ]);
      setEvents(e.data || []);
      setTemplates(t.data || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { load(); loadMeta(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ inApp: true, email: false, whatsapp: false, enabled: true, recipientType: 'ROLE', severity: 'INFO', retryCount: 3, recipientRoles: [] });
    setModalOpen(true);
  };
  const openEdit = (row: RuleRow) => {
    setEditing(row);
    form.setFieldsValue({ ...row, recipientRoles: row.recipientRoles || [], recipientEmails: row.recipientEmails || [] });
    setModalOpen(true);
  };

  const save = async (values: any) => {
    setSaving(true);
    try {
      const payload = {
        ...values,
        recipientRoles: Array.isArray(values.recipientRoles) ? values.recipientRoles : [],
        recipientEmails: Array.isArray(values.recipientEmails) ? values.recipientEmails : [],
      };
      if (editing) await apiService.patch(`/notifications/admin/rules/${editing.id}`, payload);
      else await apiService.post('/notifications/admin/rules', payload);
      message.success('Rule saved');
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e?.response?.data?.message || 'Failed to save rule'); }
    setSaving(false);
  };

  const remove = async (id: string) => {
    try {
      await apiService.delete(`/notifications/admin/rules/${id}`);
      message.success('Rule deleted');
      load();
    } catch { message.error('Failed to delete rule'); }
  };

  const columns: any[] = [
    { title: 'Rule', dataIndex: 'ruleCode', width: 170, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Event', dataIndex: 'eventCode', width: 220, render: (v: string) => <Tag color="blue">{v}</Tag> },
    { title: 'Recipients', key: 'recipients', width: 180, render: (_: any, r: RuleRow) => {
        if (r.recipientType === 'ROLE') return (r.recipientRoles || []).map(x => <Tag key={x}>{x}</Tag>);
        if (r.recipientType === 'USER') return <Tag>{r.recipientUserIds?.length || 0} users</Tag>;
        return <Tag>{r.recipientType}</Tag>;
      } },
    { title: 'Channels', key: 'channels', width: 150, render: (_: any, r: RuleRow) => (
        <Space size={4}>
          {r.inApp && <Tag color="purple">IN-APP</Tag>}
          {r.email && <Tag color="blue">EMAIL</Tag>}
          {r.whatsapp && <Tag color="green">WHATSAPP</Tag>}
        </Space>
      ) },
    { title: 'Severity', dataIndex: 'severity', width: 90, render: (v: string) => <Tag color={v === 'CRITICAL' ? 'red' : v === 'HIGH' ? 'orange' : v === 'NORMAL' ? 'blue' : 'default'}>{v}</Tag> },
    { title: 'Enabled', dataIndex: 'enabled', width: 90, render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    { title: 'Actions', width: 120, fixed: 'right', render: (_: any, r: RuleRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this rule?" onConfirm={() => remove(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ) },
  ];

  return (
    <Card title={<Space><SettingOutlined />Notification Rules</Space>} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Rule</Button>}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Rules connect business events to recipients and channels. Recipients are resolved from actual ERP users/roles — no fabricated recipients." />
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 1200 }} />

      <Modal title={editing ? 'Edit Rule' : 'New Rule'} open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} confirmLoading={saving} width={760}>
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="ruleCode" label="Rule Code" rules={[{ required: true, message: 'Required' }]}>
                <Input disabled={!!editing} placeholder="RULE-MAINT-JCC" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="ruleName" label="Rule Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Job Card Created Notification" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="eventCode" label="Event" rules={[{ required: true, message: 'Required' }]}>
                <Select showSearch optionFilterProp="label" options={events.map((e: any) => ({ value: e.eventCode, label: `${e.eventCode} — ${e.eventName}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="module" label="Module" rules={[{ required: true, message: 'Required' }]}>
                <Select options={MODULES.map(m => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="recipientType" label="Recipient Type" rules={[{ required: true }]}>
                <Select options={RECIPIENT_TYPES.map(t => ({ value: t, label: t }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="severity" label="Severity">
                <Select options={SEVERITIES.map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item noStyle shouldUpdate={(p, c) => p.recipientType !== c.recipientType}>
            {({ getFieldValue }) => getFieldValue('recipientType') === 'ROLE' ? (
              <Form.Item name="recipientRoles" label="Recipient Roles">
                <Select mode="tags" placeholder="Maintenance Supervisor, Maintenance Manager…" />
              </Form.Item>
            ) : getFieldValue('recipientType') === 'USER' ? (
              <Form.Item name="recipientUserIds" label="Recipient User IDs">
                <Select mode="tags" placeholder="Paste ERP user UUIDs" />
              </Form.Item>
            ) : (
              <Form.Item name="recipientEmails" label="Explicit Recipient Emails">
                <Select mode="tags" placeholder="maintenance.manager@company.com" />
              </Form.Item>
            )}
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}><Form.Item name="inApp" label="In-App" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="email" label="Email" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="whatsapp" label="WhatsApp" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="templateCode" label="Template">
                <Select allowClear showSearch optionFilterProp="label" placeholder="Select template"
                  options={templates.map((t: any) => ({ value: t.templateCode, label: `${t.templateCode} [${t.channel}]` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="enabled" label="Enabled" valuePropName="checked"><Switch /></Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default NotificationRulesPage;