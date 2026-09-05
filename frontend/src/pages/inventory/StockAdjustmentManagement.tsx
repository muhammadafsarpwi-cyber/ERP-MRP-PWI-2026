import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

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
  const [form] = Form.useForm();

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

  const fetchDropdowns = async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/organization/warehouses', { limit: 100 }),
      ]);
      setItems(itemRes.data);
      setWarehouses(warehouseRes.data);
    } catch (error) {
      message.error('Failed to load dropdown data');
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchAdjustments(page);
  }, [page, fetchAdjustments]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ quantity: 0 });
    setModalVisible(true);
  };

  const handleEdit = (record: StockAdjustment) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/inventory/adjustments/${editingItem.id}`, values);
        message.success('Adjustment updated');
      } else {
        await apiService.post('/inventory/adjustments', values);
        message.success('Adjustment created');
      }
      setModalVisible(false);
      fetchAdjustments(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns: ColumnsType<StockAdjustment> = [
    { title: 'Adj #', dataIndex: 'adjustmentNumber', key: 'adjustmentNumber', width: 150 },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    {
      title: 'Type', dataIndex: 'adjustmentType', key: 'adjustmentType', width: 140,
      render: (v: string) => <Tag color={v === 'ADJUSTMENT_IN' ? 'green' : 'red'}>{ADJUSTMENT_TYPES.find(t => t.value === v)?.label || v}</Tag>,
    },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70 },
    { title: 'Reason', dataIndex: 'reason', key: 'reason', ellipsis: true },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
      ),
    },
  ];

  return (
    <Card title="Stock Adjustments">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search adjustments..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          placeholder="Status"
          value={filterStatus}
          onChange={(v) => { setFilterStatus(v); setPage(1); }}
          style={{ width: 140 }}
          allowClear
        >
          {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Adjustment</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={adjustments}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />

      <Modal
        title={editingItem ? 'Edit Adjustment' : 'New Adjustment'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="itemId" label="Item" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={items.map(i => ({ value: i.id, label: i.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="adjustmentType" label="Adjustment Type" rules={[{ required: true }]}>
                <Select options={ADJUSTMENT_TYPES} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default StockAdjustmentManagement;
