import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, App, Row, Col,
  InputNumber, Drawer, Descriptions, Divider, Typography,
} from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, SendOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader } from '../../components/shared';

interface ProductionOrder {
  id: string;
  orderNumber?: string;
  status: string;
  productId?: string;
  plannedQuantity?: number;
  producedQuantity?: number;
  scrapQuantity?: number;
  orderDate?: string;
}

interface RoutingOption {
  id: string;
  routingCode: string;
  name: string;
  productId: string;
  status: string;
}

interface UomOption {
  id: string;
  code: string;
  symbol?: string;
}

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  baseUomId?: string;
  isManufacturable?: boolean;
}

interface BomOption {
  id: string;
  bomCode: string;
  name: string;
  productId: string;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const PRIORITY_OPTIONS = ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RELEASED: 'blue', IN_PROGRESS: 'orange',
  COMPLETED: 'green', CANCELLED: 'red',
};

/**
 * Builds the POST /production/orders body from the create form values.
 * Deliberately emits only fields declared by CreateProductionOrderDto so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) accepts the payload.
 * companyId is intentionally omitted — it is derived server-side from the
 * authenticated user's org scope, never from the request body.
 */
export function buildCreateOrderPayload(values: {
  productId?: string;
  routingId?: string;
  bomId?: string;
  plannedQuantity?: number;
  uomId?: string;
  priority?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  dueDate?: string;
}): Record<string, unknown> {
  return {
    productId: values.productId,
    routingId: values.routingId,
    ...(values.bomId ? { bomId: values.bomId } : {}),
    plannedQuantity: values.plannedQuantity,
    uomId: values.uomId,
    priority: values.priority ?? 'NORMAL',
    ...(values.plannedStartDate ? { plannedStartDate: values.plannedStartDate } : {}),
    ...(values.plannedEndDate ? { plannedEndDate: values.plannedEndDate } : {}),
    ...(values.dueDate ? { dueDate: values.dueDate } : {}),
  };
}

const ProductionOrders: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [boms, setBoms] = useState<BomOption[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [routings, setRoutings] = useState<RoutingOption[]>([]);
  const [uoms, setUoms] = useState<UomOption[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [detail, setDetail] = useState<ProductionOrder | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [requirements, setRequirements] = useState<any[]>([]);

  const fetchData = useCallback(async (pageNum = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const res = await apiService.get<{ data: ProductionOrder[]; total: number }>('/production/orders', params);
      setData(res.data);
      setTotal(res.total);
    } catch {
      message.error('Failed to fetch production orders');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  useEffect(() => {
    (async () => {
      const [b, it, rt, uo] = await Promise.all([
        apiService
          .get<{ data: BomOption[] }>('/bom', { limit: 200 })
          .then((r) => r.data || [])
          .catch(() => []),
        apiService
          .get<{ data: ItemOption[] }>('/master-data/items', { limit: 500 })
          .then((r) => r.data || [])
          .catch(() => []),
        apiService
          .get<{ data: RoutingOption[] }>('/production/routings')
          .then((r) => r.data || [])
          .catch(() => []),
        apiService
          .get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 })
          .then((r) => r.data || [])
          .catch(() => []),
      ]);
      const onlyManufacturable = it.filter((i) => i.isManufacturable !== false);
      setBoms(b.filter((bm) => bm.status === 'ACTIVE'));
      setItems(onlyManufacturable);
      setRoutings(rt);
      setUoms(uo);
    })();
  }, []);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ plannedQuantity: 1, priority: 'NORMAL' });
    setModalVisible(true);
  };

  const routingsForProduct = (productId?: string) =>
    (productId ? routings.filter((r) => r.productId === productId) : []).sort((a, b) => {
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
      if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
      return a.routingCode.localeCompare(b.routingCode);
    });

  const bomsForProduct = (productId?: string) =>
    productId ? boms.filter((bm) => bm.productId === productId) : [];

  const handleProductChange = (productId?: string) => {
    const product = items.find((i) => i.id === productId);
    if (product?.baseUomId) {
      form.setFieldValue('uomId', product.baseUomId);
    }
    const productRoutings = routingsForProduct(productId);
    const active = productRoutings.find((r) => r.status === 'ACTIVE') || productRoutings[0];
    form.setFieldValue('routingId', active?.id);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = buildCreateOrderPayload(values);
      await apiService.post('/production/orders', payload);
      message.success('Production order created');
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create production order');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.post(`/production/orders/${id}/${action}`);
      message.success(`Production order ${action}d`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} production order`);
    }
  };

  const showDetail = async (record: ProductionOrder) => {
    setDetail(record);
    setDetailVisible(true);
    try {
      const req = await apiService.get(`/production/orders/${record.id}/requirements`);
      setRequirements((req as any).data || []);
    } catch {
      setRequirements([]);
    }
  };

  const columns: ColumnsType<ProductionOrder> = [
    { title: 'Order #', dataIndex: 'orderNumber', key: 'orderNumber', width: 130 },
    { title: 'Product', dataIndex: 'productName', key: 'product', width: 180 },
    { title: 'Planned Qty', dataIndex: 'plannedQuantity', key: 'planned', width: 110 },
    { title: 'Produced', dataIndex: 'producedQuantity', key: 'produced', width: 100 },
    { title: 'Scrap', dataIndex: 'scrapQuantity', key: 'scrap', width: 90 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (s: string) => <Tag color={statusColorMap[s]}>{s}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 260,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => showDetail(record)}>Detail</Button>
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'release')}>Release</Button>}
          {record.status !== 'CANCELLED' && record.status !== 'COMPLETED' && <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  const selectedProductId = Form.useWatch('productId', form);

  return (
    <div>
      <PageHeader icon={<PlusOutlined />} title="Production Orders" showBreadcrumbs
        subtitle="Plan and manage manufacturing orders"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Order</Button>} />
      <Card style={{ marginTop: 12 }}>
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Input placeholder="Search orders..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
          </Col>
          <Col span={6}>
            <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
              {STATUS_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
            </Select>
          </Col>
          <Col span={4}><Button onClick={() => fetchData(1)}>Search</Button></Col>
        </Row>
        <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
          pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />
      </Card>

      <Modal title="Create Production Order" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={760}>
        <Form form={form} layout="vertical" onValuesChange={(changed) => {
          if (changed.productId) handleProductChange(changed.productId);
        }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="productId" label="Product" rules={[{ required: true, message: 'Select the product to manufacture' }]}>
                <Select showSearch optionFilterProp="label"
                  options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))}
                  placeholder="Select product" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="routingId" label="Routing" rules={[{ required: true, message: 'Select a routing for this product' }]}>
                <Select showSearch optionFilterProp="label"
                  options={routingsForProduct(selectedProductId).map((r) => ({
                    value: r.id,
                    label: `${r.routingCode} — ${r.name}${r.status === 'ACTIVE' ? '' : ` (${r.status})`}`,
                  }))}
                  placeholder="Select routing" notFoundContent="No routing defined for this product" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bomId" label="BOM (optional)">
                <Select showSearch optionFilterProp="label" allowClear
                  options={bomsForProduct(selectedProductId).map((bm) => ({
                    value: bm.id,
                    label: `${bm.bomCode} — ${bm.name}`,
                  }))}
                  placeholder="Select BOM" notFoundContent="No BOM defined for this product" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="plannedQuantity" label="Planned Quantity" rules={[{ required: true, message: 'Enter the planned quantity' }]}>
                <InputNumber style={{ width: '100%' }} min={0.0001} step={1} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="uomId" label="UOM" rules={[{ required: true, message: 'Select the production UOM' }]}
                extra="Automatically set to the product base UOM; change if needed.">
                <Select showSearch optionFilterProp="label"
                  options={uoms.map((u) => ({ value: u.id, label: `${u.code}${u.symbol && u.symbol !== u.code ? ` (${u.symbol})` : ''}` }))}
                  placeholder="Select UOM" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="priority" label="Priority">
                <Select options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: p }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="plannedStartDate" label="Planned Start">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="plannedEndDate" label="Planned End">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="dueDate" label="Due Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      <Drawer title={`Production Order ${detail?.orderNumber ?? ''}`} open={detailVisible} onClose={() => setDetailVisible(false)} width={560}>
        {detail && (
          <>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Status"><Tag color={statusColorMap[detail.status]}>{detail.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Planned Quantity">{detail.plannedQuantity}</Descriptions.Item>
              <Descriptions.Item label="Produced Quantity">{detail.producedQuantity ?? 0}</Descriptions.Item>
              <Descriptions.Item label="Scrap Quantity">{detail.scrapQuantity ?? 0}</Descriptions.Item>
            </Descriptions>
            <Divider />
            <Typography.Text strong>Material Requirements</Typography.Text>
            <Table
              size="small" style={{ marginTop: 8 }}
              dataSource={requirements}
              rowKey={(r: any) => r.id ?? r.itemId}
              pagination={false}
              columns={[
                { title: 'Item', dataIndex: 'itemName', key: 'item' },
                { title: 'Required', dataIndex: 'requiredQuantity', key: 'req' },
                { title: 'Issued', dataIndex: 'issuedQuantity', key: 'issued' },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
};

export default ProductionOrders;
