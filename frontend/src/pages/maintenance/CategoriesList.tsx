import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Form, Input, InputNumber, Modal, Table, Tabs, Typography } from 'antd';
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import apiService from '../../services/api';
import { EmptyState, LoadingState } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { panelCard, shadowSm } from './maintTheme';
import { errorText } from './jobCards.types';
import './maintTheme.css';

type Category = Record<string, any>;

const TAB_DEFS: Array<{ key: string; label: string; noun: string; apiPath: string }> = [
  { key: 'complaint', label: 'Complaint Categories', noun: 'Complaint Category', apiPath: '/master-data/maintenance/categories/complaint' },
  { key: 'root-cause', label: 'Root Cause Categories', noun: 'Root Cause Category', apiPath: '/master-data/maintenance/categories/root-cause' },
  { key: 'failure', label: 'Failure Categories', noun: 'Failure Category', apiPath: '/master-data/maintenance/categories/failure' },
];

export const CategoriesList: React.FC = () => {
  const { can } = usePermission();
  const [activeKey, setActiveKey] = useState('complaint');
  const [createOpen, setCreateOpen] = useState(false);
  const createSeq = useRef(0);

  const activeDef = TAB_DEFS.find(d => d.key === activeKey) || TAB_DEFS[0];
  const canManage = can('maintenance.category.manage');
  const refreshSeq = useRef(0);

  const triggerCreate = useCallback(() => {
    createSeq.current += 1;
    setCreateOpen(true);
  }, []);

  const triggerRefresh = useCallback(() => {
    refreshSeq.current += 1;
  }, []);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      ...(canManage
        ? [{
            key: 'create-category',
            node: (
              <Button type="primary" icon={<PlusOutlined />} onClick={triggerCreate}>
                Add {activeDef.noun}
              </Button>
            ),
          }]
        : []),
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={triggerRefresh}>Refresh</Button>) },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, canManage, activeDef.noun, triggerCreate, triggerRefresh]);

  return (
    <div>
      <Card style={{ ...panelCard, boxShadow: shadowSm }}>
        <Tabs
          activeKey={activeKey}
          onChange={setActiveKey}
          items={TAB_DEFS.map(def => ({
            key: def.key,
            label: def.label,
            children: (
              <CategoryTab
                def={def}
                canManage={canManage}
                createOpen={activeKey === def.key && createOpen}
                openCreate={triggerCreate}
                closeCreate={() => setCreateOpen(false)}
                createSeq={createSeq.current}
                refreshSeq={refreshSeq.current}
              />
            ),
          }))}
        />
      </Card>
    </div>
  );
};

const CategoryTab: React.FC<{
  def: { key: string; label: string; noun: string; apiPath: string };
  canManage: boolean;
  createOpen: boolean;
  openCreate: () => void;
  closeCreate: () => void;
  createSeq: number;
  refreshSeq: number;
}> = ({ def, canManage, createOpen, openCreate, closeCreate, createSeq, refreshSeq }) => {
  const { message } = AntApp.useApp();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await apiService.get<any[]>(def.apiPath);
      setItems(result || []);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [def.apiPath]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (refreshSeq > 0) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSeq]);

  useEffect(() => {
    if (createSeq > 0) openCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createSeq]);

  useEffect(() => {
    if (createOpen) form.resetFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen]);

  const createItem = async (values: any) => {
    setSaving(true);
    try {
      await apiService.post(def.apiPath, values);
      message.success(`${def.noun} created`);
      closeCreate();
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
      {error && <Alert type="error" showIcon message={`Unable to load ${def.noun.toLowerCase()}s`} description={error} style={{ marginBottom: 16, borderRadius: 6 }} />}
      {loading ? <LoadingState /> : items.length === 0 ? (
        <EmptyState title={`No ${def.noun.toLowerCase()}s`} description={`Create a ${def.noun.toLowerCase()} classification to get started.`} />
      ) : (
        <Card styles={{ body: { padding: 0 } }} style={{ ...panelCard, marginTop: 4 }}>
          <Table rowKey="id" columns={columns} dataSource={items} pagination={{ pageSize: 20, showSizeChanger: true }} size="middle" scroll={{ x: 640 }} />
        </Card>
      )}

      <Modal title={`Add ${def.noun}`} open={createOpen} confirmLoading={saving} onCancel={closeCreate} onOk={() => form.submit()}>
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

export default CategoriesList;
