import React, { useCallback, useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Col, Form, Input, InputNumber, Modal, Row, Space, Table, Tabs, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined, TagsOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState, PageHeader } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { errorText } from './jobCards.types';

type Category = Record<string, any>;

const CategoryTab: React.FC<{
  title: string;
  apiPath: string;
  canManage: boolean;
}> = ({ title, apiPath, canManage }) => {
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiService.get<any[]>(apiPath);
      setItems(result || []);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [apiPath]);

  useEffect(() => { load(); }, [load]);

  const createItem = async (values: any) => {
    setSaving(true);
    try {
      await apiService.post(apiPath, values);
      message.success(`${title} created`);
      setCreateOpen(false);
      form.resetFields();
      load();
    } catch (e) { message.error(errorText(e)); }
    finally { setSaving(false); }
  };

  const columns = [
    { title: 'Code', dataIndex: 'code', render: (v: string) => v ? <Typography.Text code>{v}</Typography.Text> : '—' },
    { title: 'Name', dataIndex: 'name' },
    { title: 'Description', dataIndex: 'description', ellipsis: true },
    { title: 'Sort Order', dataIndex: 'sortOrder', width: 100 },
  ];

  return (
    <>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>Refresh</Button>
          {canManage && <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setCreateOpen(true); }}>Add {title}</Button>}
        </Space>
      </div>
      {error && <Alert type="error" showIcon message={`Unable to load ${title.toLowerCase()}`} description={error} style={{ marginBottom: 16 }} />}
      {loading ? <LoadingState /> : items.length === 0 ? (
        <EmptyState title={`No ${title.toLowerCase()}`} description={`Create a ${title.toLowerCase()} classification to get started.`} />
      ) : (
        <Table rowKey="id" columns={columns} dataSource={items} pagination={{ pageSize: 20 }} size="small" />
      )}
      <Modal title={`Add ${title}`} open={createOpen} confirmLoading={saving} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()}>
        <Form form={form} layout="vertical" onFinish={createItem}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="code" label="Code"><Input /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="sortOrder" label="Sort Order"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export const CategoriesList: React.FC = () => {
  const { can } = usePermission();

  return (
    <div>
      <PageHeader icon={<TagsOutlined />} title="Maintenance Categories" subtitle="Complaint, root-cause, and failure classifications" gradient="linear-gradient(135deg, #1f6f78 0%, #2e8b8b 100%)" showBreadcrumbs />
      <Card>
        <Tabs items={[
          {
            key: 'complaint',
            label: 'Complaint Categories',
            children: <CategoryTab title="Complaint Category" apiPath="/master-data/maintenance/categories/complaint" canManage={can('maintenance.category.manage')} />,
          },
          {
            key: 'root-cause',
            label: 'Root Cause Categories',
            children: <CategoryTab title="Root Cause Category" apiPath="/master-data/maintenance/categories/root-cause" canManage={can('maintenance.category.manage')} />,
          },
          {
            key: 'failure',
            label: 'Failure Categories',
            children: <CategoryTab title="Failure Category" apiPath="/master-data/maintenance/categories/failure" canManage={can('maintenance.category.manage')} />,
          },
        ]} />
      </Card>
    </div>
  );
};

export default CategoriesList;
