import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, Popconfirm, Card,
} from 'antd';
import { PlusOutlined, EditOutlined, TagsOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService, { describeRequestError } from '../../services/api';
import SaveResultDialog, { SaveResultData, SaveResultPhase } from '../../components/shared/SaveResultDialog';
import { PageHeader, StatusBadge, EmptyState, PageToolbar } from '../../components/shared';

interface RouteType {
  id: string;
  routeCode: string;
  name: string;
  description: string | null;
  status: string;
  companyId: string;
}

const RouteTypeManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<RouteType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<RouteType | null>(null);
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
      const res = await apiService.get<{ data: RouteType[]; total: number }>('/master-data/route-types', params);
      setData(res.data || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Failed to load route types');
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

  const openEdit = (record: RouteType) => {
    setEditing(record);
    form.setFieldsValue({
      routeCode: record.routeCode,
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
      let saved: { routeCode?: string; name?: string } | undefined;
      if (editing) {
        const res = (await apiService.patch(`/master-data/route-types/${editing.id}`, payload)) as {
          data?: { data?: { routeCode?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { routeCode?: string; name?: string } | undefined;
      } else {
        const res = (await apiService.post('/master-data/route-types', payload)) as {
          data?: { data?: { routeCode?: string; name?: string } };
        };
        saved = res?.data?.data ?? res?.data as { routeCode?: string; name?: string } | undefined;
      }
      setResult({
        title: editing ? 'Route Type Updated Successfully' : 'Route Type Saved Successfully',
        recordType: 'Route Code',
        recordCode: saved?.routeCode != null ? String(saved.routeCode) : undefined,
        recordName: saved?.name != null ? String(saved.name) : undefined,
      });
      setResultPhase('success');
      setModalVisible(false);
      void fetchData(page);
    } catch (err: any) {
      // Persistent error phase: the dialog stays open (with the normalized
      // error) until dismissed or retried — a failed request never becomes success.
      setResultError(describeRequestError(err));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (record: RouteType) => {
    try {
      const action = record.status === 'ACTIVE' ? 'deactivate' : 'activate';
      await apiService.patch(`/master-data/route-types/${record.id}/${action}`, {});
      message.success(`Route type ${record.routeCode} ${record.status === 'ACTIVE' ? 'deactivated' : 'activated'}`);
      void fetchData(page);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Status change failed');
    }
  };

  const columns: ColumnsType<RouteType> = [
    { title: 'Route Code', dataIndex: 'routeCode', key: 'routeCode', width: 160 },
    { title: 'Name', dataIndex: 'name', key: 'name' },
    { title: 'Description', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: string) => v || <span style={{ color: '#999' }}>—</span> },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (v: string) => <StatusBadge status={v} colorMap={{ ACTIVE: 'green', INACTIVE: 'red' }} />,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, r) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} />
          <Popconfirm
            title={r.status === 'ACTIVE' ? 'Deactivate this route type?' : 'Activate this route type?'}
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
        title="Route Types"
        subtitle="Manufacturing route master — used in Item Classification"
        icon={<TagsOutlined />}
      />
      <Card className="erp-section-card">
        <PageToolbar
          searchPlaceholder="Search route type..."
          searchValue={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          extra={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Add Route Type</Button>}
        />
        {data.length === 0 && !loading ? (
          <EmptyState title="No route types found" description="Click Add Route Type to create one." />
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
        title={editing ? `Edit Route Type — ${editing.routeCode}` : 'Add Route Type'}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)} disabled={saving}>Cancel</Button>,
          <Button key="save" type="primary" onClick={handleSubmit} loading={saving} disabled={saving}>Save</Button>,
        ]}
      >
        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="routeCode" label="Route Code" rules={[
              { required: true, message: 'Route Code is required' },
              { pattern: /^[A-Z0-9_]+$/, message: 'Uppercase letters, numbers and underscores only' },
            ]}
            extra="Uppercase letters, numbers and underscores"
          >
            <Input placeholder="e.g. ROUTE_001" maxLength={50} disabled={!!editing} />
          </Form.Item>
          <Form.Item name="name" label="Route Name" rules={[{ required: true, message: 'Route Name is required' }]}>
            <Input placeholder="e.g. Primary manufacturing route" maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} maxLength={1000} placeholder="Short description of this route type" />
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

export default RouteTypeManagement;