import React, { useState, useEffect, useCallback } from 'react';
import {
  App, Table, Button, Space, Modal, Form, Input, InputNumber, Popconfirm, Card,
} from 'antd';
import { PlusOutlined, EditOutlined, SettingOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, StatusBadge, EmptyState, PageToolbar, FilterBar } from '../../components/shared';
import type { FilterOption } from '../../components/shared/FilterBar';

interface Operation {
  id: string;
  operationCode: string;
  operationName: string;
  description: string | null;
  setupTimeMinutes: number;
  runTimeMinutes: number;
  queueTimeMinutes: number;
  waitTimeMinutes: number;
  status: string;
}

const OperationManagement: React.FC = () => {
  const { message } = App.useApp();
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingOp, setEditingOp] = useState<Operation | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  const fetchOperations = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Operation[]; total: number }>('/master-data/operations', params);
      setOperations(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch operations');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => {
    fetchOperations(page);
  }, [page, fetchOperations]);

  const handleCreate = () => {
    setEditingOp(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Operation) => {
    setEditingOp(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingOp) {
        await apiService.patch(`/master-data/operations/${editingOp.id}`, values);
        message.success('Operation updated');
      } else {
        await apiService.post('/master-data/operations', values);
        message.success('Operation created');
      }
      setModalVisible(false);
      fetchOperations(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/operations/${id}/status`, { status: 'ACTIVE' });
      message.success('Operation activated');
      fetchOperations(page);
    } catch (error) {
      message.error('Failed to activate operation');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/operations/${id}/status`, { status: 'INACTIVE' });
      message.success('Operation deactivated');
      fetchOperations(page);
    } catch (error) {
      message.error('Failed to deactivate operation');
    }
  };

  const filters: FilterOption[] = [
    {
      key: 'status',
      placeholder: 'Status',
      value: filterStatus,
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INACTIVE', label: 'Inactive' },
      ],
      onChange: (v) => { setFilterStatus(v); setPage(1); },
    },
  ];

  const activeFilterCount = filterStatus ? 1 : 0;

  const columns: ColumnsType<Operation> = [
    { title: 'Code', dataIndex: 'operationCode', key: 'operationCode', width: 120 },
    { title: 'Name', dataIndex: 'operationName', key: 'operationName', width: 200 },
    { title: 'Description', dataIndex: 'description', key: 'description', width: 200, ellipsis: true },
    { title: 'Setup (min)', dataIndex: 'setupTimeMinutes', key: 'setupTimeMinutes', width: 100, align: 'right' },
    { title: 'Run (min)', dataIndex: 'runTimeMinutes', key: 'runTimeMinutes', width: 100, align: 'right' },
    { title: 'Queue (min)', dataIndex: 'queueTimeMinutes', key: 'queueTimeMinutes', width: 100, align: 'right' },
    { title: 'Wait (min)', dataIndex: 'waitTimeMinutes', key: 'waitTimeMinutes', width: 100, align: 'right' },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <StatusBadge status={s} />,
    },
    {
      title: 'Actions', key: 'actions', width: 140,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'INACTIVE' ? (
            <Popconfirm title="Activate this operation?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          ) : (
            <Popconfirm title="Deactivate this operation?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<SettingOutlined />}
        title="Operations"
        subtitle={`Manufacturing operation definitions · ${total} records`}
        showBreadcrumbs
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Operation</Button>
        }
      />

      <PageToolbar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search operations..."
        filterCount={activeFilterCount}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((v) => !v)}
        onClearFilters={() => { setFilterStatus(undefined); setPage(1); }}
        hasActiveFilters={activeFilterCount > 0}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Operation</Button>
        }
      />

      <FilterBar filters={filters} visible={showFilters} />

      <Card styles={{ body: { padding: '8px 0 0' } }}>
        <Table
          columns={columns}
          dataSource={operations}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            pageSize,
            total,
            onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} operations`,
          }}
          locale={{
            emptyText: (
              <EmptyState
                title={search || filterStatus ? 'No operations match your search' : 'No operations found'}
                description={search || filterStatus ? 'Try adjusting your search criteria.' : 'Get started by adding your first manufacturing operation.'}
                actionLabel="Add Operation"
                onAction={handleCreate}
              />
            ),
          }}
        />
      </Card>

      <Modal
        title={editingOp ? 'Edit Operation' : 'Create Operation'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="operationCode" label="Operation Code" rules={[{ required: true }]}>
            <Input disabled={!!editingOp} maxLength={50} />
          </Form.Item>
          <Form.Item name="operationName" label="Operation Name" rules={[{ required: true }]}>
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="setupTimeMinutes" label="Setup Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="runTimeMinutes" label="Run Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
          <Space size="middle" style={{ width: '100%' }}>
            <Form.Item name="queueTimeMinutes" label="Queue Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="waitTimeMinutes" label="Wait Time (min)" initialValue={0}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default OperationManagement;
