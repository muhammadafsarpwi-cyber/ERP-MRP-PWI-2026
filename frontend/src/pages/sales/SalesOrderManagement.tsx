import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined, CarOutlined, InboxOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import dayjs from 'dayjs';

interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  companyName?: string;
  orderDate: string;
  deliveryDate: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  freightAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  items?: any[];
}

const STATUS_OPTIONS = ['Draft', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Closed', 'Cancelled'];

const statusColorMap: Record<string, string> = {
  Draft: 'default', Confirmed: 'blue', Processing: 'cyan', Shipped: 'geekblue', Delivered: 'green', Closed: 'green', Cancelled: 'red',
};

const SalesOrderManagement: React.FC = () => {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesOrder | null>(null);
  const [editingItem, setEditingItem] = useState<SalesOrder | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: SalesOrder[]; total: number }>('/sales/orders', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch orders');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      currency: 'USD', subtotal: 0, discountAmount: 0, taxAmount: 0, freightAmount: 0, totalAmount: 0,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: SalesOrder) => {
    setEditingItem(record);
    form.setFieldsValue({
      customerId: record.customerId,
      orderDate: record.orderDate ? dayjs(record.orderDate).format('YYYY-MM-DD') : undefined,
      deliveryDate: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : undefined,
      currency: record.currency,
      notes: record.notes,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      freightAmount: record.freightAmount,
      totalAmount: record.totalAmount,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesOrder) => {
    try {
      const response = await apiService.get<SalesOrder>(`/sales/orders/${record.id}`);
      setDetailItem(response);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to fetch order details');
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/sales/orders/${editingItem.id}`, values);
        message.success('Order updated');
      } else {
        await apiService.post('/sales/orders', values);
        message.success('Order created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to save order');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/sales/orders/${id}/${action}`);
      message.success(`Order ${action} successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} order`);
    }
  };

  const columns: ColumnsType<SalesOrder> = [
    { title: 'Order #', dataIndex: 'orderNumber', key: 'orderNumber', width: 150 },
    { title: 'Customer', key: 'customer', width: 180, render: (_, record) => record.companyName || record.customerId },
    { title: 'Order Date', dataIndex: 'orderDate', key: 'orderDate', width: 110 },
    { title: 'Delivery Date', dataIndex: 'deliveryDate', key: 'deliveryDate', width: 120 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 350,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'Draft'} />
          {record.status === 'Draft' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'confirm')}>Confirm</Button>}
          {record.status === 'Confirmed' && <Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => handleAction(record.id, 'process')}>Process</Button>}
          {record.status === 'Processing' && <Button size="small" type="primary" icon={<CarOutlined />} onClick={() => handleAction(record.id, 'ship')}>Ship</Button>}
          {record.status === 'Shipped' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'deliver')}>Deliver</Button>}
          {record.status === 'Delivered' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'close')}>Close</Button>}
          {record.status !== 'Cancelled' && record.status !== 'Closed' && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Sales Orders" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Order</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search orders..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>
      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />

      {/* Create/Edit Modal */}
      <Modal
        title={editingItem ? 'Edit Order' : 'Create Order'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => setModalVisible(false)}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer ID" rules={[{ required: true }]}>
                <Input placeholder="Enter Customer UUID" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currency" label="Currency">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orderDate" label="Order Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="deliveryDate" label="Delivery Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="shipToAddress" label="Ship To Address">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="billToAddress" label="Bill To Address">
                <Input.TextArea rows={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="subtotal" label="Subtotal">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="discountAmount" label="Discount">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="taxAmount" label="Tax">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="freightAmount" label="Freight">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item name="totalAmount" label="Total">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title="Order Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {detailItem && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Order #">{detailItem.orderNumber}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={statusColorMap[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Customer">{detailItem.companyName || detailItem.customerId}</Descriptions.Item>
              <Descriptions.Item label="Currency">{detailItem.currency}</Descriptions.Item>
              <Descriptions.Item label="Order Date">{detailItem.orderDate}</Descriptions.Item>
              <Descriptions.Item label="Delivery Date">{detailItem.deliveryDate}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatDecimal(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{formatDecimal(detailItem.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Tax">{formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Freight">{formatDecimal(detailItem.freightAmount)}</Descriptions.Item>
              <Descriptions.Item label="Total">{formatDecimal(detailItem.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detailItem.notes}</Descriptions.Item>
            </Descriptions>
            {detailItem.items && detailItem.items.length > 0 && (
              <>
                <Divider orientation="left">Order Items</Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.items}
                  columns={[
                    { title: 'Description', dataIndex: 'description', key: 'description' },
                    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80 },
                    { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, render: (v: unknown) => formatDecimal(v) },
                    { title: 'Total', dataIndex: 'lineTotal', key: 'lineTotal', width: 120, render: (v: unknown) => formatDecimal(v) },
                  ]}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
};

export default SalesOrderManagement;
