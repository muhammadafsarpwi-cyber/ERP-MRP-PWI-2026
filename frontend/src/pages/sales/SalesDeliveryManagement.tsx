import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  Row, Col, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined, CarOutlined, InboxOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import dayjs from 'dayjs';

interface SalesDelivery {
  id: string;
  deliveryNumber: string;
  salesOrderId: string;
  customerId: string;
  companyName?: string;
  deliveryDate: string;
  expectedDate: string;
  warehouseId: string;
  carrier: string;
  trackingNumber: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  lines?: any[];
}

const STATUS_OPTIONS = ['DRAFT', 'SHIPPED', 'DELIVERED', 'CONFIRMED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', SHIPPED: 'blue', DELIVERED: 'cyan', CONFIRMED: 'green', CANCELLED: 'red',
};

const SalesDeliveryManagement: React.FC = () => {
  const [data, setData] = useState<SalesDelivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesDelivery | null>(null);
  const [editingItem, setEditingItem] = useState<SalesDelivery | null>(null);
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
      const response = await apiService.get<{ data: SalesDelivery[]; total: number }>('/sales/deliveries', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch deliveries');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      subtotal: 0, taxAmount: 0, totalAmount: 0,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: SalesDelivery) => {
    setEditingItem(record);
    form.setFieldsValue({
      salesOrderId: record.salesOrderId,
      customerId: record.customerId,
      deliveryDate: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : undefined,
      expectedDate: record.expectedDate ? dayjs(record.expectedDate).format('YYYY-MM-DD') : undefined,
      warehouseId: record.warehouseId,
      carrier: record.carrier,
      trackingNumber: record.trackingNumber,
      notes: record.notes,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesDelivery) => {
    try {
      const response = await apiService.get<SalesDelivery>(`/sales/deliveries/${record.id}`);
      setDetailItem(response);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to fetch delivery details');
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/sales/deliveries/${editingItem.id}`, values);
        message.success('Delivery updated');
      } else {
        await apiService.post('/sales/deliveries', values);
        message.success('Delivery created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to save delivery');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/sales/deliveries/${id}/${action}`);
      message.success(`Delivery ${action} successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} delivery`);
    }
  };

  const columns: ColumnsType<SalesDelivery> = [
    { title: 'Delivery #', dataIndex: 'deliveryNumber', key: 'deliveryNumber', width: 150 },
    { title: 'Customer', dataIndex: 'companyName', key: 'companyName', width: 180, render: (v: unknown, record: SalesDelivery) => v || record.customerId },
    { title: 'Delivery Date', dataIndex: 'deliveryDate', key: 'deliveryDate', width: 130 },
    { title: 'Total Amount', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 350,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<CarOutlined />} onClick={() => handleAction(record.id, 'ship')}>Ship</Button>}
          {record.status === 'SHIPPED' && <Button size="small" type="primary" icon={<InboxOutlined />} onClick={() => handleAction(record.id, 'deliver')}>Deliver</Button>}
          {record.status === 'DELIVERED' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'confirm')}>Confirm</Button>}
          {record.status !== 'CANCELLED' && record.status !== 'CONFIRMED' && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Sales Deliveries" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Delivery</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search deliveries..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
        title={editingItem ? 'Edit Delivery' : 'Create Delivery'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => setModalVisible(false)}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="salesOrderId" label="Sales Order ID" rules={[{ required: true }]}>
                <Input placeholder="Enter Sales Order UUID" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer ID" rules={[{ required: true }]}>
                <Input placeholder="Enter Customer UUID" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="deliveryDate" label="Delivery Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="expectedDate" label="Expected Date">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse ID">
                <Input placeholder="Enter Warehouse UUID" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="carrier" label="Carrier">
                <Input placeholder="Carrier name" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="trackingNumber" label="Tracking Number">
                <Input placeholder="Tracking number" />
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
        title="Delivery Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {detailItem && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Delivery #">{detailItem.deliveryNumber}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={statusColorMap[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Customer">{detailItem.companyName || detailItem.customerId}</Descriptions.Item>
              <Descriptions.Item label="Sales Order">{detailItem.salesOrderId}</Descriptions.Item>
              <Descriptions.Item label="Delivery Date">{detailItem.deliveryDate}</Descriptions.Item>
              <Descriptions.Item label="Expected Date">{detailItem.expectedDate}</Descriptions.Item>
              <Descriptions.Item label="Carrier">{detailItem.carrier}</Descriptions.Item>
              <Descriptions.Item label="Tracking #">{detailItem.trackingNumber}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatDecimal(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Tax">{formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Total" span={2}>{formatDecimal(detailItem.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detailItem.notes}</Descriptions.Item>
            </Descriptions>
            {detailItem.lines && detailItem.lines.length > 0 && (
              <>
                <Divider orientation="left">Delivery Lines</Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.lines}
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

export default SalesDeliveryManagement;
