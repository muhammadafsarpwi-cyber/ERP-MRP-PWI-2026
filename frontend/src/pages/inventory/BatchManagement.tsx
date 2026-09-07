import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableToolbar, TableActions } from '../../components/shared';

const STATUS_OPTIONS = ['ACTIVE', 'EXPIRED', 'CONSUMED', 'QUARANTINE'];

interface Batch {
  id: string;
  batchNumber: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  manufacturingDate: string;
  expiryDate: string;
  quantity: number;
  uomCode?: string;
  status: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  EXPIRED: 'red',
  CONSUMED: 'blue',
  QUARANTINE: 'orange',
};

const BatchManagement: React.FC = () => {
  const { message } = App.useApp();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Batch | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchBatches = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Batch[]; total: number }>('/inventory/batches', params);
      setBatches(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch batches');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load batch dropdowns';
      message.error(`Unable to load batch options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchBatches(page);
  }, [page, fetchBatches]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: Batch) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<Batch> = [
    {
      title: 'Batch Number',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 160,
      render: (text) => <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{text}</span>,
    },
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (name) => <span>{name || '—'}</span>,
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 150,
      render: (wh) => <span>{wh || '—'}</span>,
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(v, 4)}
        </span>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 75,
      render: (uom) => <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>{uom || '—'}</span>,
    },
    {
      title: 'Mfg Date',
      dataIndex: 'manufacturingDate',
      key: 'manufacturingDate',
      width: 120,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleDateString() : '—'}</span>,
    },
    {
      title: 'Expiry Date',
      dataIndex: 'expiryDate',
      key: 'expiryDate',
      width: 120,
      render: (v: string) => <span style={{ fontSize: 12 }}>{v ? new Date(v).toLocaleDateString() : '—'}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      fixed: 'right',
      align: 'center' as const,
      render: (_, record) => (
        <TableActions
          actions={[
            {
              key: 'edit',
              label: 'Edit Batch',
              icon: <EditOutlined />,
              onClick: () => handleEdit(record),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--theme-text)' }}>Batch Tracking</h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Track raw material and finished goods batches, expiry dates, and lot numbers
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search batches..."
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            options: STATUS_OPTIONS.map(s => ({ value: s, label: s })),
            onChange: (v) => { setFilterStatus(v as string); setPage(1); },
            width: 140,
          },
        ]}
        onRefresh={() => fetchBatches(page)}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Batch
          </Button>
        }
      />

      <ERPTable
        columns={columns}
        dataSource={batches}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1050 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t, r) => `Showing ${r[0]}–${r[1]} of ${t} entries`,
        }}
      />

      <BatchModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchBatches(page);
        }}
      />
    </div>
  );
};

interface BatchModalProps {
  open: boolean;
  editingItem: Batch | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const BatchModal: React.FC<BatchModalProps> = ({
  open,
  editingItem,
  items,
  warehouses,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.setFieldsValue({
          batchNumber: editingItem.batchNumber,
          itemId: editingItem.itemId,
          warehouseId: editingItem.warehouseId,
          status: editingItem.status,
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ status: 'ACTIVE' });
      }
    }
  }, [open, editingItem, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/batches/${editingItem.id}`, {
          batchNumber: values.batchNumber,
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          status: values.status,
        });
        message.success('Batch updated');
      } else {
        await apiService.post('/inventory/batches', {
          batchNumber: values.batchNumber,
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          status: values.status,
        });
        message.success('Batch created');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={editingItem ? 'Edit Batch' : 'Create Batch'}
      open={open}
      onOk={handleSubmit}
      confirmLoading={submitting}
      onCancel={onCancel}
      width={600}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="batchNumber" label="Batch Number" rules={[{ required: true, message: 'Batch number is required' }]}>
              <Input disabled={!!editingItem} placeholder="e.g. BATCH-001" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="itemId" label="Item" rules={[{ required: true, message: 'Please select an item' }]}>
              <Select
                showSearch
                placeholder="Select item"
                optionFilterProp="label"
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: 'Please select warehouse' }]}>
              <Select
                showSearch
                placeholder="Select warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="Status" rules={[{ required: true }]}>
              <Select options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default BatchManagement;
