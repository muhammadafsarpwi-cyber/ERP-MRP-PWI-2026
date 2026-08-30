import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Table, Button, Space, Tag, Modal, Form, Input, Select, message, Row, Col,
  InputNumber, Drawer, Descriptions, Divider, Typography,
} from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, SendOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, ERPLineItems, ERPLine } from '../../components/shared';

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

const STATUS_OPTIONS = ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RELEASED: 'blue', IN_PROGRESS: 'orange',
  COMPLETED: 'green', CANCELLED: 'red',
};

const ProductionOrders: React.FC = () => {
  const [data, setData] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [companyId, setCompanyId] = useState('');
  const [boms, setBoms] = useState<Array<{ id: string; bomCode: string; name: string }>>([]);
  const [items, setItems] = useState<Array<{ id: string; itemCode: string; name: string }>>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [lines, setLines] = useState<ERPLine[]>([]);
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
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const b = await apiService.get<{ data: Array<{ id: string; bomCode: string; name: string }> }>('/bom', { limit: 100 });
        setBoms(b.data || []);
      } catch { /* ignore */ }
      try {
        const it = await apiService.get<{ data: Array<{ id: string; itemCode: string; name: string }> }>('/master-data/items', { limit: 100 });
        setItems(it.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ companyId, plannedQuantity: 1 });
    setLines([]);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
        })),
      };
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

      <Modal title="Create Production Order" open={modalVisible} onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={850}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="bomId" label="BOM" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={boms.map((b) => ({ value: b.id, label: `${b.bomCode} — ${b.name}` }))} placeholder="Select BOM" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="productId" label="Product" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label" options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))} placeholder="Select product" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="plannedQuantity" label="Planned Quantity" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="orderDate" label="Order Date">
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="expectedCompletionDate" label="Expected Completion">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems companyId={companyId} value={lines} onChange={setLines} showDiscount={false} showTax={false} label="Component Materials (optional)" />
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