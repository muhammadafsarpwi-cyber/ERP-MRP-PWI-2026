import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip,
} from 'antd';
import { PlusOutlined, EditOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const ADJUSTMENT_TYPES = [
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out' },
];

const STATUS_OPTIONS = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];

interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  adjustmentType: string;
  quantity: number;
  uomCode?: string;
  reason: string;
  status: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
};

const StockAdjustmentManagement: React.FC = () => {
  const { message } = App.useApp();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StockAdjustment | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchAdjustments = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: StockAdjustment[]; total: number }>('/inventory/adjustments', params);
      setAdjustments(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch adjustments');
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
      const msg = error?.response?.data?.message || error?.message || 'Failed to load adjustment dropdowns';
      message.error(`Unable to load adjustment options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchAdjustments(page);
  }, [page, fetchAdjustments]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: StockAdjustment) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<StockAdjustment> = [
    { title: 'Adj #', dataIndex: 'adjustmentNumber', key: 'adjustmentNumber', width: 140, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    {
      title: 'Type', dataIndex: 'adjustmentType', key: 'adjustmentType', width: 140,
      render: (v: string) => <Tag color={v === 'ADJUSTMENT_IN' ? 'green' : 'red'} className="erp-table-tag">{ADJUSTMENT_TYPES.find(t => t.value === v)?.label || v}</Tag>,
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const, render: (v: unknown) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatNumber(v, 4)}</span> },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70, render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span> },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'} className="erp-table-tag">{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 70, fixed: 'right', align: 'center',
      render: (_, record) => (
        <TableActions>
          <Tooltip title={record.status === 'DRAFT' ? "Edit Adjustment" : "View Details"}>
            <Button
              type="text"
              size="small"
              icon={record.status === 'DRAFT' ? <EditOutlined /> : <EyeOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
          Stock Adjustments
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Reconcile warehouse discrepancies, stock counting corrections, and inventory adjustments.
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search adjustments..."
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
        onRefresh={() => fetchAdjustments(page)}
        primaryAction={{
          label: 'New Adjustment',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={adjustments}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1050 }}
        emptyTitle="No stock adjustments found"
        emptyDescription="No adjustment records match your current criteria."
        emptyActionLabel="Create Adjustment"
        onEmptyAction={handleCreate}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      <StockAdjustmentModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchAdjustments(page);
        }}
      />
    </div>
  );
};

interface StockAdjustmentModalProps {
  open: boolean;
  editingItem: StockAdjustment | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
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
          itemId: editingItem.itemId,
          warehouseId: editingItem.warehouseId,
          adjustmentType: editingItem.adjustmentType,
          quantity: Number(editingItem.quantity),
          reason: editingItem.reason ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ quantity: 0, adjustmentType: 'PHYSICAL_COUNT' });
      }
    }
  }, [open, editingItem, form]);

  const isReadOnly = Boolean(editingItem && editingItem.status !== 'DRAFT');

  const handleSubmit = async () => {
    if (isReadOnly) {
      onCancel();
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/adjustments/${editingItem.id}`, {
          warehouseId: values.warehouseId,
          adjustmentType: values.adjustmentType,
          reason: values.reason,
        });
        message.success('Adjustment updated');
      } else {
        await apiService.post('/inventory/adjustments', {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          adjustmentType: values.adjustmentType,
          quantity: Number(values.quantity),
          reason: values.reason,
        });
        message.success('Adjustment created');
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
      title={editingItem ? (isReadOnly ? `View Adjustment (${editingItem.status})` : 'Edit Adjustment') : 'New Adjustment'}
      open={open}
      onOk={isReadOnly ? onCancel : handleSubmit}
      confirmLoading={submitting}
      onCancel={onCancel}
      width={600}
      destroyOnHidden
      footer={isReadOnly ? [
        <Button key="close" type="primary" onClick={onCancel}>Close</Button>
      ] : undefined}
    >
      <Form form={form} layout="vertical" disabled={isReadOnly}>
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
            <Form.Item name="adjustmentType" label="Adjustment Type" rules={[{ required: true, message: 'Select adjustment type' }]}>
              <Select options={ADJUSTMENT_TYPES} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true, message: 'Please enter quantity' }]}>
              <InputNumber min={0.0001} step={1} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item name="reason" label="Reason" rules={[{ required: true, message: 'Reason is required' }]}>
              <Input.TextArea rows={2} placeholder="Explain reason for stock adjustment" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default StockAdjustmentManagement;
