import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App, Space, Popconfirm,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { ERPTable, TableToolbar } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';

const STATUS_OPTIONS = ['IN_STOCK', 'ALLOCATED', 'SOLD', 'SCRAPPED'];

const statusColorMap: Record<string, string> = {
  IN_STOCK: 'green',
  ALLOCATED: 'blue',
  SOLD: 'purple',
  SCRAPPED: 'red',
};

interface SerialNumberRecord {
  id: string;
  serialNumber: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  warehouseId: string;
  warehouseName?: string;
  status: string;
  batchNumber?: string;
  referenceType?: string;
  notes?: string;
  createdAt: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const SerialNumberManagement: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canManage = can('inventory.serial.manage');

  const [serialNumbers, setSerialNumbers] = useState<SerialNumberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);

  const user = JSON.parse(localStorage.getItem('erp_user') || '{}');
  const companyId = user?.defaultCompanyId;

  const fetchSerialNumbers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (companyId) params.companyId = companyId;
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: SerialNumberRecord[]; total: number }>('/inventory/serial-numbers', params);
      setSerialNumbers(response.data);
      setTotal(response.total);
    } catch {
      message.error('Failed to fetch serial numbers');
    } finally {
      setLoading(false);
    }
  }, [companyId, search, filterStatus, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch {
      // dropdowns are best-effort
    }
  }, []);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);
  useEffect(() => { fetchSerialNumbers(page); }, [page, fetchSerialNumbers]);

  const handleCreate = async () => {
    try {
      const values = await form.validateFields();
      await apiService.post('/inventory/serial-numbers', {
        ...values,
        companyId,
      });
      message.success('Serial number created');
      setModalVisible(false);
      form.resetFields();
      fetchSerialNumbers(1);
      setPage(1);
    } catch (err: any) {
      if (err?.response?.data?.message) {
        message.error(err.response.data.message);
      }
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/serial-numbers/${id}/deactivate`);
      message.success('Serial number deactivated');
      fetchSerialNumbers(page);
    } catch {
      message.error('Failed to deactivate');
    }
  };

  const columns: ColumnsType<SerialNumberRecord> = [
    {
      title: 'Serial Number',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 180,
      render: (v: string) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: 'Item',
      key: 'item',
      render: (_, r) => (
        <span>{r.itemCode ? `${r.itemCode} ` : ''}{r.itemName || '—'}</span>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      render: (v: string) => v || '—',
    },
    {
      title: 'Batch',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      render: (v: string) => v || '—',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (v: string) => (
        <Tag color={statusColorMap[v] || 'default'}>{v?.replace(/_/g, ' ')}</Tag>
      ),
    },
    {
      title: 'Reference',
      dataIndex: 'referenceType',
      key: 'referenceType',
      render: (v: string) => v || '—',
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '—',
    },
    ...(canManage
      ? [
          {
            title: '',
            key: 'actions',
            width: 60,
            render: (_: unknown, record: SerialNumberRecord) => (
              <Space size="small">
                {record.status !== 'SCRAPPED' && (
                  <Popconfirm
                    title="Deactivate this serial number?"
                    onConfirm={() => handleDeactivate(record.id)}
                  >
                    <Button type="link" danger size="small">Deactivate</Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Serial Numbers</h2>
        <p style={{ margin: '4px 0 0', color: 'var(--theme-text-muted)', fontSize: 13 }}>
          Track and manage individual serial numbers for inventory items
        </p>
      </div>

      <TableToolbar
        searchPlaceholder="Search serial numbers..."
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            options: STATUS_OPTIONS.map(s => ({ value: s, label: s.replace(/_/g, ' ') })),
            onChange: (v) => { setFilterStatus(v as string); setPage(1); },
            width: 140,
          },
        ]}
        onRefresh={() => fetchSerialNumbers(page)}
        actions={
          canManage ? (
            <Button icon={<PlusOutlined />} type="primary" onClick={() => setModalVisible(true)}>
              New Serial Number
            </Button>
          ) : undefined
        }
      />

      <ERPTable
        columns={columns}
        dataSource={serialNumbers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 900 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t, r) => `Showing ${r[0]}–${r[1]} of ${t} entries`,
        }}
      />

      <Modal
        title="Create Serial Number"
        open={modalVisible}
        onCancel={() => { setModalVisible(false); form.resetFields(); }}
        onOk={handleCreate}
        okText="Create"
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="itemId" label="Item" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select item"
              options={items.map(i => ({ value: i.id, label: `${i.code || ''} ${i.name}`.trim() }))}
            />
          </Form.Item>
          <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select warehouse"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item name="serialNumber" label="Serial Number" rules={[{ required: true }]}>
            <Input placeholder="Enter serial number" />
          </Form.Item>
          <Form.Item name="batchId" label="Batch ID (optional)">
            <Input placeholder="Enter batch ID" />
          </Form.Item>
          <Form.Item name="status" label="Status" initialValue="IN_STOCK">
            <Select options={STATUS_OPTIONS.map(s => ({ value: s, label: s.replace(/_/g, ' ') }))} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} placeholder="Optional notes" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default SerialNumberManagement;
