import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Card,
  InputNumber, Switch, Tabs, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

const ITEM_TYPES = [
  { value: 'RAW_MATERIAL', label: 'Raw Material' },
  { value: 'PACKAGING_MATERIAL', label: 'Packaging Material' },
  { value: 'CONSUMABLE', label: 'Consumable' },
  { value: 'SEMI_FINISHED', label: 'Semi-Finished' },
  { value: 'FINISHED_GOOD', label: 'Finished Good' },
  { value: 'SPARE_PART', label: 'Spare Part' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'ASSET', label: 'Asset' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'DISCONTINUED'];

interface Item {
  id: string;
  itemCode: string;
  sku: string;
  name: string;
  shortName: string;
  description: string;
  itemType: string;
  categoryId: string;
  categoryName?: string;
  barcode: string;
  manufacturerPartNumber: string;
  brand: string;
  model: string;
  baseUomId: string;
  baseUomName?: string;
  purchaseUomId: string;
  salesUomId: string;
  trackInventory: boolean;
  batchTracked: boolean;
  serialTracked: boolean;
  expiryTracked: boolean;
  isPurchasable: boolean;
  isSellable: boolean;
  isManufacturable: boolean;
  isStockItem: boolean;
  minimumStockLevel: number;
  maximumStockLevel: number;
  reorderLevel: number;
  safetyStockLevel: number;
  leadTimeDays: number;
  status: string;
}

interface UomOption {
  id: string;
  code: string;
  name: string;
}

interface CategoryOption {
  id: string;
  code: string;
  name: string;
  children?: CategoryOption[];
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  DISCONTINUED: 'orange',
};

const ItemManagement: React.FC = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterItemType, setFilterItemType] = useState<string | undefined>(undefined);
  const [filterCategory, setFilterCategory] = useState<string | undefined>(undefined);

  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [pageSize] = useState(20);

  const fetchItems = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      if (filterItemType) params.itemType = filterItemType;
      if (filterCategory) params.categoryId = filterCategory;
      const response = await apiService.get<{ data: Item[]; total: number }>('/master-data/items', params);
      setItems(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch items');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, filterItemType, filterCategory, pageSize]);

  const fetchDropdowns = async () => {
    try {
      const [uomRes, catRes] = await Promise.all([
        apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 }),
        apiService.get<{ data: CategoryOption[] }>('/master-data/categories', { limit: 500 }),
      ]);
      setUoms(uomRes.data);
      setCategories(catRes.data);
    } catch (error) {
      message.error('Failed to load dropdown data');
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, []);

  useEffect(() => {
    fetchItems(page);
  }, [page, fetchItems]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      trackInventory: false,
      batchTracked: false,
      serialTracked: false,
      expiryTracked: false,
      isPurchasable: true,
      isSellable: true,
      isManufacturable: false,
      isStockItem: true,
      minimumStockLevel: 0,
      maximumStockLevel: 0,
      reorderLevel: 0,
      safetyStockLevel: 0,
      leadTimeDays: 0,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: Item) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/master-data/items/${editingItem.id}`, values);
        message.success('Item updated');
      } else {
        await apiService.post('/master-data/items', values);
        message.success('Item created');
      }
      setModalVisible(false);
      fetchItems(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/items/${id}/activate`);
      message.success('Item activated');
      fetchItems(page);
    } catch (error) {
      message.error('Failed to activate item');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/master-data/items/${id}/deactivate`);
      message.success('Item deactivated');
      fetchItems(page);
    } catch (error) {
      message.error('Failed to deactivate item');
    }
  };

  const handleDiscontinue = async (id: string) => {
    try {
      await apiService.patch(`/master-data/items/${id}/discontinue`);
      message.success('Item discontinued');
      fetchItems(page);
    } catch (error) {
      message.error('Failed to discontinue item');
    }
  };

  const flagTag = (label: string, value: boolean) =>
    value ? <Tag color="blue">{label}</Tag> : null;

  const columns: ColumnsType<Item> = [
    { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 130 },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: 'Type', dataIndex: 'itemType', key: 'itemType', width: 140,
      render: (v: string) => ITEM_TYPES.find(t => t.value === v)?.label || v,
    },
    { title: 'Category', dataIndex: 'categoryName', key: 'categoryName', width: 130 },
    { title: 'Base UOM', dataIndex: 'baseUomName', key: 'baseUomName', width: 100 },
    {
      title: 'Flags', key: 'flags', width: 220,
      render: (_, r) => (
        <Space size={2} wrap>
          {flagTag('Stock', r.isStockItem)}
          {flagTag('Purchase', r.isPurchasable)}
          {flagTag('Sell', r.isSellable)}
          {flagTag('Mfg', r.isManufacturable)}
        </Space>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 180, fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' && (
            <>
              <Popconfirm title="Deactivate this item?" onConfirm={() => handleDeactivate(record.id)}>
                <Button type="link" danger>Deactivate</Button>
              </Popconfirm>
              <Popconfirm title="Discontinue this item?" onConfirm={() => handleDiscontinue(record.id)}>
                <Button type="link" danger style={{ color: 'orange' }}>Discontinue</Button>
              </Popconfirm>
            </>
          )}
          {record.status === 'INACTIVE' && (
            <Popconfirm title="Activate this item?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link">Activate</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Item Master">
      <Space style={{ marginBottom: 16 }} wrap>
        <Input
          placeholder="Search items..."
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
        <Select
          placeholder="Item Type"
          value={filterItemType}
          onChange={(v) => { setFilterItemType(v); setPage(1); }}
          style={{ width: 170 }}
          allowClear
          options={ITEM_TYPES}
        />
        <Select
          placeholder="Category"
          value={filterCategory}
          onChange={(v) => { setFilterCategory(v); setPage(1); }}
          style={{ width: 170 }}
          allowClear
          showSearch
          optionFilterProp="label"
          options={categories.map(c => ({ value: c.id, label: c.name }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Item</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={items}
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
        title={editingItem ? 'Edit Item' : 'Create Item'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={900}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Tabs
            defaultActiveKey="basic"
            items={[
              {
                key: 'basic',
                label: 'Basic Info',
                children: (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="itemCode" label="Item Code" rules={[{ required: true }]}>
                        <Input disabled={!!editingItem} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="sku" label="SKU" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="shortName" label="Short Name">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={24}>
                      <Form.Item name="description" label="Description">
                        <Input.TextArea rows={2} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="itemType" label="Item Type" rules={[{ required: true }]}>
                        <Select options={ITEM_TYPES} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="categoryId" label="Category">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={categories.map(c => ({ value: c.id, label: c.name }))}
                          allowClear
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'identification',
                label: 'Identification',
                children: (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item name="barcode" label="Barcode">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="manufacturerPartNumber" label="Manufacturer Part Number">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="brand" label="Brand">
                        <Input />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item name="model" label="Model">
                        <Input />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'units',
                label: 'Units',
                children: (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="baseUomId" label="Base UOM" rules={[{ required: true }]}>
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="purchaseUomId" label="Purchase UOM">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                          allowClear
                        />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="salesUomId" label="Sales UOM">
                        <Select
                          showSearch
                          optionFilterProp="label"
                          options={uoms.map(u => ({ value: u.id, label: `${u.name} (${u.code})` }))}
                          allowClear
                        />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
              {
                key: 'flags',
                label: 'Operational Flags',
                children: (
                  <Row gutter={[24, 16]}>
                    <Col span={6}><Form.Item name="trackInventory" label="Track Inventory" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="batchTracked" label="Batch Tracked" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="serialTracked" label="Serial Tracked" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="expiryTracked" label="Expiry Tracked" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="isPurchasable" label="Purchasable" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="isSellable" label="Sellable" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="isManufacturable" label="Manufacturable" valuePropName="checked"><Switch /></Form.Item></Col>
                    <Col span={6}><Form.Item name="isStockItem" label="Stock Item" valuePropName="checked"><Switch /></Form.Item></Col>
                  </Row>
                ),
              },
              {
                key: 'stock',
                label: 'Stock Planning',
                children: (
                  <Row gutter={16}>
                    <Col span={8}>
                      <Form.Item name="minimumStockLevel" label="Min Stock Level">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="maximumStockLevel" label="Max Stock Level">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="reorderLevel" label="Reorder Level">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="safetyStockLevel" label="Safety Stock Level">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col span={8}>
                      <Form.Item name="leadTimeDays" label="Lead Time (Days)">
                        <InputNumber min={0} style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </Form>
      </Modal>
    </Card>
  );
};

export default ItemManagement;
