import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Descriptions,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, DollarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import dayjs from 'dayjs';

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  salesOrderId: string;
  customerId: string;
  companyName?: string;
  invoiceDate: string;
  dueDate: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  balance: number;
  status: string;
  notes?: string;
  createdAt: string;
}

const STATUS_OPTIONS = ['Pending', 'Posted', 'Partial', 'Paid', 'Cancelled'];

const statusColorMap: Record<string, string> = {
  Pending: 'default', Posted: 'blue', Partial: 'orange', Paid: 'green', Cancelled: 'red',
};

const SalesInvoiceManagement: React.FC = () => {
  const [data, setData] = useState<SalesInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesInvoice | null>(null);
  const [editingItem, setEditingItem] = useState<SalesInvoice | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<SalesInvoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: SalesInvoice[]; total: number }>('/sales/invoices', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch invoices');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: SalesInvoice) => {
    setEditingItem(record);
    form.setFieldsValue({
      salesOrderId: record.salesOrderId,
      customerId: record.customerId,
      invoiceDate: record.invoiceDate ? dayjs(record.invoiceDate).format('YYYY-MM-DD') : undefined,
      dueDate: record.dueDate ? dayjs(record.dueDate).format('YYYY-MM-DD') : undefined,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesInvoice) => {
    try {
      const response = await apiService.get<SalesInvoice>(`/sales/invoices/${record.id}`);
      setDetailItem(response);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to fetch invoice details');
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/sales/invoices/${editingItem.id}`, values);
        message.success('Invoice updated');
      } else {
        await apiService.post('/sales/invoices', values);
        message.success('Invoice created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to save invoice');
    }
  };

  const handleRecordPayment = (record: SalesInvoice) => {
    setPaymentInvoice(record);
    setPaymentAmount(0);
    setPaymentVisible(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentInvoice) return;
    if (paymentAmount <= 0) {
      message.error('Payment amount must be greater than 0');
      return;
    }
    try {
      await apiService.patch(`/sales/invoices/${paymentInvoice.id}/record-payment`, { paidAmount: paymentAmount });
      message.success('Payment recorded');
      setPaymentVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to record payment');
    }
  };

  const columns: ColumnsType<SalesInvoice> = [
    { title: 'Invoice #', dataIndex: 'invoiceNo', key: 'invoiceNo', width: 150 },
    {
      title: 'Customer', key: 'customer', width: 180,
      render: (_, record) => record.companyName || record.customerId,
    },
    { title: 'Invoice Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 120 },
    { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 120 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    { title: 'Paid', dataIndex: 'paidAmount', key: 'paidAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    { title: 'Balance', dataIndex: 'balance', key: 'balance', width: 120, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status === 'Cancelled' || record.status === 'Paid'} />
          {['Pending', 'Partial', 'Posted'].includes(record.status) && (
            <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => handleRecordPayment(record)}>Pay</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Sales Invoices" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Invoice</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search invoices..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
        title={editingItem ? 'Edit Invoice' : 'Create Invoice'}
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
              <Form.Item name="invoiceDate" label="Invoice Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="dueDate" label="Due Date" rules={[{ required: true }]}>
                <Input type="date" />
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
              <Form.Item name="totalAmount" label="Total">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title="Invoice Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {detailItem && (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="Invoice #">{detailItem.invoiceNo}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={statusColorMap[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Customer">{detailItem.companyName || detailItem.customerId}</Descriptions.Item>
            <Descriptions.Item label="Sales Order">{detailItem.salesOrderId}</Descriptions.Item>
            <Descriptions.Item label="Invoice Date">{detailItem.invoiceDate}</Descriptions.Item>
            <Descriptions.Item label="Due Date">{detailItem.dueDate}</Descriptions.Item>
            <Descriptions.Item label="Subtotal">{formatDecimal(detailItem.subtotal)}</Descriptions.Item>
            <Descriptions.Item label="Discount">{formatDecimal(detailItem.discountAmount)}</Descriptions.Item>
            <Descriptions.Item label="Tax">{formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
            <Descriptions.Item label="Total">{formatDecimal(detailItem.totalAmount)}</Descriptions.Item>
            <Descriptions.Item label="Paid">{formatDecimal(detailItem.paidAmount)}</Descriptions.Item>
            <Descriptions.Item label="Balance">{formatDecimal(detailItem.balance)}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        title="Record Payment"
        open={paymentVisible}
        onOk={handlePaymentSubmit}
        onCancel={() => setPaymentVisible(false)}
        width={450}
      >
        {paymentInvoice && (
          <>
            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Invoice #">{paymentInvoice.invoiceNo}</Descriptions.Item>
              <Descriptions.Item label="Total Amount">{formatDecimal(paymentInvoice.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Already Paid">{formatDecimal(paymentInvoice.paidAmount)}</Descriptions.Item>
              <Descriptions.Item label="Balance Due">{formatDecimal(paymentInvoice.balance)}</Descriptions.Item>
            </Descriptions>
            <Form layout="vertical">
              <Form.Item label="Payment Amount" required>
                <InputNumber
                  style={{ width: '100%' }}
                  min={0}
                  max={paymentInvoice.balance}
                  precision={2}
                  value={paymentAmount}
                  onChange={(v) => setPaymentAmount(v ?? 0)}
                />
              </Form.Item>
            </Form>
          </>
        )}
      </Modal>
    </Card>
  );
};

export default SalesInvoiceManagement;
