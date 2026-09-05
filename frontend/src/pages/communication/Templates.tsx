import React, { useEffect, useState } from 'react';
import { Card, Table, Button, Space, Tag, Modal, Form, Input, Select, App, Popconfirm, Typography, Divider, Alert, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, MailOutlined, WhatsAppOutlined, BellOutlined } from '@ant-design/icons';
import apiService from '../../services/api';

const { Text } = Typography;
const { TextArea } = Input;

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  EMAIL: <MailOutlined />,
  WHATSAPP: <WhatsAppOutlined />,
  IN_APP: <BellOutlined />,
};

const COMMON_VARS = ['jobCardNumber','machineCode','machineName','department','priority','status','createdBy','createdAt','link'];

interface TemplateRow {
  id: string;
  templateCode: string;
  templateName: string;
  module: string;
  eventCode: string | null;
  channel: 'EMAIL' | 'WHATSAPP' | 'IN_APP';
  subject: string | null;
  body: string;
  variables: string[] | null;
  isActive: boolean;
}

const TemplatesPage: React.FC<{ channel: 'EMAIL' | 'WHATSAPP' | 'IN_APP'; title: string }> = ({ channel, title }) => {
  const { message } = App.useApp();
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiService.get<any>('/notifications/admin/templates');
      setRows((res.data || []).filter((t: TemplateRow) => t.channel === channel));
    } catch { message.error('Unable to load templates'); }
    setLoading(false);
  };
  const loadEvents = async () => {
    try {
      const res = await apiService.get<any>('/notifications/admin/events');
      setEvents(res.data || []);
    } catch { /* ignore */ }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); loadEvents(); }, []);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ channel, variables: COMMON_VARS });
    setModalOpen(true);
  };
  const openEdit = (row: TemplateRow) => {
    setEditing(row);
    form.setFieldsValue({ ...row });
    setModalOpen(true);
  };

  const save = async (values: any) => {
    setSaving(true);
    try {
      const payload = { ...values, channel };
      if (editing) await apiService.patch(`/notifications/admin/templates/${editing.id}`, payload);
      else await apiService.post('/notifications/admin/templates', payload);
      message.success('Template saved');
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e?.response?.data?.message || 'Failed to save template'); }
    setSaving(false);
  };

  const remove = async (id: string) => {
    try {
      await apiService.delete(`/notifications/admin/templates/${id}`);
      message.success('Template deleted');
      load();
    } catch { message.error('Failed to delete template'); }
  };

  const columns: any[] = [
    { title: 'Template Code', dataIndex: 'templateCode', width: 200, render: (v: string) => <Text code>{v}</Text> },
    { title: 'Name', dataIndex: 'templateName', width: 220 },
    { title: 'Event', dataIndex: 'eventCode', width: 220, render: (v: string | null) => v ? <Tag>{v}</Tag> : '—' },
    { title: 'Channel', dataIndex: 'channel', width: 100, render: (v: string) => <Tag icon={CHANNEL_ICONS[v]} color={v === 'EMAIL' ? 'blue' : v === 'WHATSAPP' ? 'green' : 'purple'}>{v}</Tag> },
    { title: 'Variables', dataIndex: 'variables', render: (v: string[] | null) => (v || []).slice(0, 4).map(x => <Tag key={x} style={{ fontSize: 11 }}>{x}</Tag>) },
    { title: 'Active', dataIndex: 'isActive', width: 80, render: (v: boolean) => v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag> },
    {
      title: 'Actions', width: 120, fixed: 'right',
      render: (_: any, r: TemplateRow) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm title="Delete this template?" onConfirm={() => remove(r.id)}><Button size="small" danger icon={<DeleteOutlined />} /></Popconfirm>
        </Space>
      ),
    },
  ];

  const watchBody = Form.useWatch('body', form);

  return (
    <Card title={title} extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>New Template</Button>}>
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Templates use {{variable}} placeholders. Never include executable HTML/scripts — bodies are rendered as plain text with safe substitution." />
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 1100 }} />

      <Modal
        title={editing ? 'Edit Template' : 'New Template'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        width={720}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="templateCode" label="Template Code" rules={[{ required: true, message: 'Required' }]}>
                <Input disabled={!!editing} placeholder="JOB_CARD_CREATED_EMAIL" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="templateName" label="Template Name" rules={[{ required: true, message: 'Required' }]}>
                <Input placeholder="Job Card Created [EMAIL]" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="module" label="Module" rules={[{ required: true, message: 'Required' }]}>
                <Select options={['maintenance','procurement','sales','inventory','manufacturing','qc','hr','finance'].map(m => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="eventCode" label="Event">
                <Select showSearch optionFilterProp="label" allowClear placeholder="Select event"
                  options={events.map((e: any) => ({ value: e.eventCode, label: `${e.eventCode} — ${e.eventName}` }))} />
              </Form.Item>
            </Col>
          </Row>
          {channel === 'EMAIL' && (
            <Form.Item name="subject" label="Subject" rules={[{ required: true, message: 'Subject is required for email' }]}>
              <Input placeholder="New Maintenance Job Card {{jobCardNumber}}" />
            </Form.Item>
          )}
          <Form.Item name="body" label="Body" rules={[{ required: true, message: 'Body is required' }]}>
            <TextArea rows={8} placeholder="Job Card {{jobCardNumber}} created for machine {{machineCode}}…" />
          </Form.Item>
          <Divider style={{ margin: '8px 0' }} />
          <Text type="secondary">Available variables:</Text>
          <div style={{ marginTop: 8, marginBottom: 12 }}>
            {COMMON_VARS.map(v => <Tag key={v} style={{ fontSize: 11 }}>{v}</Tag>)}
          </div>
          {watchBody && (
            <>
              <Divider orientation="left" plain style={{ margin: '8px 0' }}><Text type="secondary">Preview</Text></Divider>
              <Alert type="info" showIcon message="Rendered preview" description={watchBody.replace(/\{\{(\w+)\}\}/g, '<value>')} />
            </>
          )}
        </Form>
      </Modal>
    </Card>
  );
};

export default TemplatesPage;