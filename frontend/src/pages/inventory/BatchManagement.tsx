import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

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
  const [form] = Form.useForm();

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
    fetchBatches(page);
  }, [page, fetchBatches]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Batch) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/inventory/batches/${editingItem.id}`, values);
        message.success('Batch updated');
      } else {
        await apiService.post('/inventory/batches', values);
        message.success('Batch created');
      }
      setModalVisible(false);
      fetchBatches(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns: ColumnsType<Batch> = [
    { title: 'Batch Number', dataIndex: 'batchNumber', key: 'batchNumber', width: 150 },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uomCode', width: 70 },
    {
      title: 'Mfg Date', dataIndex: 'manufacturingDate', key: 'manufacturingDate', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
    },
    {
      title: 'Expiry Date', dataIndex: 'expiryDate', key: 'expiryDate', width: 120,
      render: (v: string) => v ? new Date(v).toLocaleDateString() : '-',
    },
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
    <Card title="Batch Tracking">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search batches..."
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
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Batch</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={batches}
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
        title={editingItem ? 'Edit Batch' : 'Create Batch'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={600}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="batchNumber" label="Batch Number" rules={[{ required: true }]}>
                <Input disabled={!!editingItem} />
              </Form.Item>
            </Col>
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
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default BatchManagement;
