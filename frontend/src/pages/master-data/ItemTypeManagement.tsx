import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, Popconfirm, Card,
} from 'antd';
import { PlusOutlined, EditOutlined, ProfileOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { PageHeader, StatusBadge, EmptyState, PageToolbar } from '../../components/shared';

interface ItemType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder?: number;
  status: string;
  usageCount?: number;
  companyId: string;
}

const ItemTypeManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ItemType | null>(null);
  const [saving, setSaving] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [result, setResult] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');

  const resolveCompanyId = useCallback(async (): Promise<string | null> => {
    try {
      const stored = localStorage.getItem('erp_user');
      const user = stored ? JSON.parse(stored) : null;
      if (user?.defaultCompanyId) return user.defaultCompanyId as string;
    } catch { /* ignore */ }
    try {
      const res = await apiService.get<{ data: Array<{ id: string }> }>('/companies', { limit: 1 });
      return res.data?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    resolveCompanyId().then(setCompanyId);
  }, [resolveCompanyId]);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: pageNum, limit: pageSize };
      if (companyId) params.companyId = companyId;
      if (search) params.search = search;
      const res = await apiService.get<{ data: ItemType[]; total: number }>('/master-data/item-types', params);
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load item types');
    } finally {
      setLoading(false);
    }
  }, [pageSize, search, companyId, message]);

  useEffect(() => { void fetchData(1); }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (record: ItemType) => {
    setEditing(record);
    form.setFieldsValue({
      code: record.code,
      name: record.name,
      description: record.description ?? undefined,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    if (saving) return;
    let raw: any;
    try {
      raw = await form.validateFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(describeRequestError(err));
      return;
    }
    const payload: Record<string, unknown> = { ...raw };
    if (!editing && companyId) payload.companyId = companyId;
    setSaving(true);
    setResultPhase('loading');
    setResultOpen(true);
    try {
      let saved: { code?: string; name?: string } | undefined;
      if (editing) {
        const res = (await apiService.patch(`/master-data/item-types/${editing.id}`, payload)) as {
          data?: { data?: { code?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { code?: string; name?: string } | undefined;
      } else {
        const res = (await apiService.post('/master-data/item-types', payload)) as {
          data?: { data?: { code?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { code?: string; name?: string } | undefined;
      }
      setResult({
        title: editing ? 'Item Type Updated Successfully' : 'Item Type Saved Successfully',
        recordType: 'Item Type',
        recordCode: saved?.code != null ? String(saved.code) : undefined,
        recordName: saved?.name != null ? String(saved.name) : undefined,
      });
      setResultPhase('success');
      setModalVisible(false);
      void fetchData(page);
    } catch (err: any) {
      setResultError(describeRequestError(err));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (record: ItemType) => {
    try {
      const action = record.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await apiService.patch(`/master-data/item-types/${record.id}/${action}`, {});
      message.success(`Item type ${record.code} ${record.status === 'ACTIVE' ? 'deactivated' : 'activated'}`);
      void fetchData(page);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Status change failed');
    }
  };

  const columns: ColumnsType<ItemType> = [
    { title: 'Code', dataIndex: 'code', key: 'code', width: 190 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    {
      title: 'Items', dataIndex: 'usageCount', key: 'usageCount', width: 90,
      render: (v: number | undefined) => v ?? 0,
    },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || <span style={{ color: '#999' }}>—</span> },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <StatusBadge status={v} colorMap={{ ACTIVE: 'green', INACTIVE: 'red' }} />,
    },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm
            title={
              r.status === 'ACTIVE'
                ? `Deactivate item type '${r.code}'?${(r.usageCount ?? 0) > 0 ? ` It is used by ${r.usageCount} item(s). Inactive types can still be assigned to existing items but cannot be chosen for new ones.` : ''}`
                : `Activate item type '${r.code}'?`
            }
            icon={<ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />}
            onConfirm={() => toggleStatus(r)}
            okText="Yes"
          >
            <Button type="link" size="small" danger={r.status === 'ACTIVE'}>
              {r.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="erp-dashboard">
      <PageHeader
        title="Item Types"
        subtitle="Item classification master — drives Item Type assignment in Item Management"
        icon={<ProfileOutlined />}
      />
      <Card className="erp-section-card">
        <PageToolbar
          searchPlaceholder="Search item type..."
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Item Type</Button>}
        />
        {data.length === 0 && !loading ? (
          <EmptyState title="No item types found" description="Click Add Item Type to create one." />
        ) : (
          <Table
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            pagination={{ current: page, total, pageSize, showSizeChanger: true, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          />
        )}
      </Card>

      <Modal
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        title={editing ? `Edit Item Type — ${editing.code}` : 'Add Item Type'}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)} disabled={saving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSubmit} loading={saving} disabled={saving}>Save</Button>,
        ]}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="code" label="Item Type Code" rules={[
              { required: true, message: 'Item Type Code is required' },
              { pattern: /^[A-Z0-9_]+$/, message: 'Uppercase letters, numbers and underscores only' },
            ]}
            extra="Uppercase letters, numbers and underscores. Cannot be changed after creation."
          >
            <Input placeholder="e.g. REWORK" maxLength={50} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="Item Type Name" rules={[{ required: true, message: 'Item Type Name is required' }]}>
            <Input placeholder="e.g. Rework / rectified goods" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={1000} placeholder="Short description of this item type" />
          </Form.Item>
        </Form>
      </Modal>

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={result}
        errorMessage={resultError}
        onRetry={handleSubmit}
        onClose={() => setResultOpen(false)}
      />
    </div>
  );
};

export default ItemTypeManagement;