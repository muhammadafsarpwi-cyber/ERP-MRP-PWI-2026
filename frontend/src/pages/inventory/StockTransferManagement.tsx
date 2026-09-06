import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const STATUS_OPTIONS = ['DRAFT', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];

interface StockTransfer {
  id: string;
  transferNumber: string;
  itemId: string;
  itemName?: string;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  quantity: number;
  uomCode?: string;
  status: string;
  notes: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  IN_TRANSIT: 'blue',
  COMPLETED: 'green',
  CANCELLED: 'red',
};

const StockTransferManagement: React.FC = () => {
  const { message } = App.useApp();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StockTransfer | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchTransfers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: StockTransfer[]; total: number }>('/inventory/transfers', params);
      setTransfers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch transfers');
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
      const msg = error?.response?.data?.message || error?.message || 'Failed to load transfer dropdowns';
      message.error(`Unable to load transfer options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchTransfers(page);
  }, [page, fetchTransfers]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: StockTransfer) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<StockTransfer> = [
    { title: 'Transfer #', dataIndex: 'transferNumber', key: 'transferNumber', width: 140, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'From Warehouse', dataIndex: 'fromWarehouseName', key: 'fromWarehouseName', width: 150 },
    { title: 'To Warehouse', dataIndex: 'toWarehouseName', key: 'toWarehouseName', width: 150 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const, render: (v: unknown) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatNumber(v, 4)}</span> },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span> },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'} className="erp-table-tag">{s}</Tag>,
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
    {
      title: 'Actions', key: 'actions', width: 70, fixed: 'right', align: 'center',
      render: (_, record) => (
        <TableActions>
          <Tooltip title="Edit Transfer">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
          Stock Transfers
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Manage inter-warehouse inventory transfers and status tracking.
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search transfers..."
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            onChange: (v) => { setFilterStatus(v); setPage(1); },
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
          },
        ]}
        onRefresh={() => fetchTransfers(page)}
        primaryAction={{
          label: 'New Transfer',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={transfers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1050 }}
        emptyTitle="No stock transfers found"
        emptyDescription="No transfer records match your current criteria."
        emptyActionLabel="Create Transfer"
        onEmptyAction={handleCreate}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      <StockTransferModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchTransfers(page);
        }}
      />
    </div>
  );
};

interface StockTransferModalProps {
  open: boolean;
  editingItem: StockTransfer | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({
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

  // Set scalar values only when modal is open and form is mounted (prevents useForm warning & circular refs)
  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.setFieldsValue({
          itemId: editingItem.itemId,
          quantity: Number(editingItem.quantity),
          fromWarehouseId: editingItem.fromWarehouseId,
          toWarehouseId: editingItem.toWarehouseId,
          notes: editingItem.notes ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ quantity: 0 });
      }
    }
  }, [open, editingItem, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/transfers/${editingItem.id}`, {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
        message.success('Transfer updated');
      } else {
        await apiService.post('/inventory/transfers', {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
        });
        message.success('Transfer created');
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
      title={editingItem ? 'Edit Transfer' : 'New Transfer'}
      open={open}
      onOk={handleSubmit}
      confirmLoading={submitting}
      onCancel={onCancel}
      width={650}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
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
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Please enter quantity' }]}>
              <InputNumber min={0.0001} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true, message: 'Please select source warehouse' }]}>
              <Select
                showSearch
                placeholder="Select source warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true, message: 'Please select destination warehouse' }]}>
              <Select
                showSearch
                placeholder="Select destination warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={2} placeholder="Optional notes" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default StockTransferManagement;
