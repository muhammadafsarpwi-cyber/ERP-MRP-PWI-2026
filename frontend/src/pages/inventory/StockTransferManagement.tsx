import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

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
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StockTransfer | null>(null);
  const [form] = Form.useForm();

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
  }, [search, filterStatus, pageSize]);

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
    fetchTransfers(page);
  }, [page, fetchTransfers]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ quantity: 0 });
    setModalVisible(true);
  };

  const handleEdit = (record: StockTransfer) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/inventory/transfers/${editingItem.id}`, values);
        message.success('Transfer updated');
      } else {
        await apiService.post('/inventory/transfers', values);
        message.success('Transfer created');
      }
      setModalVisible(false);
      fetchTransfers(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns: ColumnsType<StockTransfer> = [
    { title: 'Transfer #', dataIndex: 'transferNumber', key: 'transferNumber', width: 150 },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'From Warehouse', dataIndex: 'fromWarehouseName', key: 'fromWarehouseName', width: 150 },
    { title: 'To Warehouse', dataIndex: 'toWarehouseName', key: 'toWarehouseName', width: 150 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
    {
      title: 'Actions', key: 'actions', width: 80, fixed: 'right',
      render: (_, record) => (
        <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
      ),
    },
  ];

  return (
    <Card title="Stock Transfers">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search transfers..."
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
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>New Transfer</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={transfers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />

      <Modal
        title={editingItem ? 'Edit Transfer' : 'New Transfer'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={650}
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
              <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="fromWarehouseId" label="From Warehouse" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="toWarehouseId" label="To Warehouse" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default StockTransferManagement;
