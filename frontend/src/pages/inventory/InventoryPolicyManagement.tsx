import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Card,
  InputNumber, Switch, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

const TRACKING_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'SERIAL', label: 'Serial' },
];

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'];

interface InventoryPolicy {
  id: string;
  policyCode: string;
  companyId: string;
  companyName?: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  safetyStock: number;
  leadTimeDays: number;
  preferredLocationId: string;
  preferredLocationName?: string;
  trackingType: string;
  allowNegativeStock: boolean;
  status: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

const InventoryPolicyManagement: React.FC = () => {
  const [policies, setPolicies] = useState<InventoryPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryPolicy | null>(null);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterTrackingType, setFilterTrackingType] = useState<string | undefined>(undefined);

  const [companies, setCompanies] = useState<DropdownOption[]>([]);
  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [locations, setLocations] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchPolicies = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterStatus) params.status = filterStatus;
      if (filterTrackingType) params.trackingType = filterTrackingType;
      const response = await apiService.get<{ data: InventoryPolicy[]; total: number }>('/inventory/policies', params);
      setPolicies(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch inventory policies');
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, filterStatus, filterTrackingType, pageSize]);

  const fetchDropdowns = async () => {
    try {
      const [companyRes, itemRes, warehouseRes, locationRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/organization/companies', { limit: 100 }),
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/organization/warehouses', { limit: 100 }),
        apiService.get<{ data: DropdownOption[] }>('/organization/locations', { limit: 200 }),
      ]);
      setCompanies(companyRes.data);
      setItems(itemRes.data);
      setWarehouses(warehouseRes.data);
      setLocations(locationRes.data);
    } catch (error) {
      message.error('Failed to load dropdown data');
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchPolicies(page);
  }, [page, fetchPolicies]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      minimumStock: 0,
      maximumStock: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      safetyStock: 0,
      leadTimeDays: 0,
      trackingType: 'NONE',
      allowNegativeStock: false,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: InventoryPolicy) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/inventory/policies/${editingItem.id}`, values);
        message.success('Policy updated');
      } else {
        await apiService.post('/inventory/policies', values);
        message.success('Policy created');
      }
      setModalVisible(false);
      fetchPolicies(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/activate`);
      message.success('Policy activated');
      fetchPolicies(page);
    } catch (error) {
      message.error('Failed to activate policy');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/deactivate`);
      message.success('Policy deactivated');
      fetchPolicies(page);
    } catch (error) {
      message.error('Failed to deactivate policy');
    }
  };

  const columns: ColumnsType<InventoryPolicy> = [
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'Warehouse', dataIndex: 'warehouseName', key: 'warehouseName', width: 150 },
    { title: 'Min Stock', dataIndex: 'minimumStock', key: 'minimumStock', width: 100, align: 'right' },
    { title: 'Max Stock', dataIndex: 'maximumStock', key: 'maximumStock', width: 100, align: 'right' },
    { title: 'Reorder Level', dataIndex: 'reorderLevel', key: 'reorderLevel', width: 110, align: 'right' },
    {
      title: 'Tracking Type', dataIndex: 'trackingType', key: 'trackingType', width: 120,
      render: (v: string) => TRACKING_TYPES.find(t => t.value === v)?.label || v,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 160, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' && (
            <Popconfirm title="Deactivate this policy?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger>Deactivate</Button>
            </Popconfirm>
          )}
          {record.status === 'INACTIVE' && (
            <Popconfirm title="Activate this policy?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Inventory Policies">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search policies..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 250 }}
          allowClear
        />
        <Select
          placeholder="Warehouse"
          value={filterWarehouse}
          onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
          style={{ width: 180 }}
          allowClear
          showSearch
          optionFilterProp="label"
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
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
        <Select
          placeholder="Tracking Type"
          value={filterTrackingType}
          onChange={(v) => { setFilterTrackingType(v); setPage(1); }}
          style={{ width: 150 }}
          allowClear
          options={TRACKING_TYPES}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Policy</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={policies}
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
        title={editingItem ? 'Edit Policy' : 'Create Policy'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                />
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
              <Form.Item name="preferredLocationId" label="Preferred Location">
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={locations.map(l => ({ value: l.id, label: l.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="minimumStock" label="Minimum Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maximumStock" label="Maximum Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderLevel" label="Reorder Level">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderQuantity" label="Reorder Quantity">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safetyStock" label="Safety Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="trackingType" label="Tracking Type" rules={[{ required: true }]}>
                <Select options={TRACKING_TYPES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="allowNegativeStock" label="Allow Negative Stock" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </Card>
  );
};

export default InventoryPolicyManagement;
