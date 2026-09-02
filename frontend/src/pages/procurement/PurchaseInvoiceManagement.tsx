import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

interface PurchaseInvoice {
  id: string;
  invoiceCode: string;
  supplierInvoiceNumber: string;
  poCode?: string;
  supplierName?: string;
  invoiceDate?: string;
  totalAmount: number;
  paidAmount?: number;
  paymentStatus: string;
  matchingStatus: string;
  varianceAmount?: number | null;
  status: string;
  poTotalAmount?: number;
  poReceivedAmount?: number;
  poInvoicedAmount?: number;
  remainingAmount?: number;
}

const STATUS_OPTIONS = ['DRAFT', 'APPROVED', 'POSTED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'green', POSTED: 'purple', CANCELLED: 'red',
};

const paymentStatusColorMap: Record<string, string> = {
  UNPAID: 'red', PARTIAL: 'orange', PAID: 'green', OVERPAID: 'blue',
};

const matchingStatusColorMap: Record<string, string> = {
  PENDING: 'default',
  MATCHED: 'green',
  PARTIALLY_MATCHED: 'blue',
  OVER_INVOICED: 'red',
  OVER_RECEIVED: 'orange',
  UNRECEIVED: 'gold',
  VARIANCE: 'orange',
  EXCEPTION: 'red',
};

const PurchaseInvoiceManagement: React.FC = () => {
  const [data, setData] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<PurchaseInvoice | null>(null);
  const [paymentForm] = Form.useForm();

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseInvoice[]; total: number }>('/procurement/invoices', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch purchase invoices');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({ currencyCode: 'PKR', taxPercent: 0, discountAmount: 0 });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      await apiService.post('/procurement/invoices', values);
      message.success('Purchase invoice created');
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to create purchase invoice');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/invoices/${id}/${action}`);
      message.success(`Purchase invoice ${action}d successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} purchase invoice`);
    }
  };

  const handlePayment = (invoice: PurchaseInvoice) => {
    const balance = Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount || 0));
    setPaymentInvoice(invoice);
    paymentForm.setFieldsValue({ paidAmount: balance });
    setPaymentVisible(true);
  };

  const handlePaymentSubmit = async () => {
    if (!paymentInvoice) return;
    try {
      const values = await paymentForm.validateFields();
      await apiService.patch(`/procurement/invoices/${paymentInvoice.id}/record-payment`, { paidAmount: values.paidAmount });
      message.success('Payment recorded successfully');
      setPaymentVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to record payment');
    }
  };

  const columns: ColumnsType<PurchaseInvoice> = [
    { title: 'Code', dataIndex: 'invoiceCode', key: 'invoiceCode', width: 120 },
    { title: 'Supplier Inv #', dataIndex: 'supplierInvoiceNumber', key: 'supplierInvoiceNumber', width: 140 },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Date', dataIndex: 'invoiceDate', key: 'invoiceDate', width: 110 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'PO Total', dataIndex: 'poTotalAmount', key: 'poTotalAmount', width: 110,
      render: (v: unknown) => formatDecimal(v),
    },
    {
      title: 'PO Recv', dataIndex: 'poReceivedAmount', key: 'poReceivedAmount', width: 110, align: 'right',
      render: (v: unknown) => formatDecimal(v),
    },
    {
      title: 'PO Invd', dataIndex: 'poInvoicedAmount', key: 'poInvoicedAmount', width: 110, align: 'right',
      render: (v: unknown) => formatDecimal(v),
    },
    {
      title: 'Remaining', dataIndex: 'remainingAmount', key: 'remainingAmount', width: 110, align: 'right',
      render: (v: unknown) => formatDecimal(v),
    },
    {
      title: 'Payment', dataIndex: 'paymentStatus', key: 'paymentStatus', width: 100,
      render: (s: string) => <Tag color={paymentStatusColorMap[s]}>{s}</Tag>,
    },
    {
      title: 'Matching', dataIndex: 'matchingStatus', key: 'matchingStatus', width: 130,
      render: (s: string, record) => (
        <Space size={0} direction="vertical">
          <Tag color={matchingStatusColorMap[s]}>{s}</Tag>
          {record.varianceAmount != null && Number(record.varianceAmount) !== 0 && (
            <span style={{ fontSize: 11, color: '#888' }}>var {formatDecimal(record.varianceAmount)}</span>
          )}
        </Space>
      ),
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 190,
      render: (_, record) => (
        <Space>
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>}
          {record.status === 'APPROVED' && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'post')}>Post</Button>}
          {record.status === 'POSTED' && record.paymentStatus !== 'PAID' && (
            <Button size="small" onClick={() => handlePayment(record)}>Pay</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Purchase Invoices" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Invoice</Button>}>
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
      <Modal title="Create Purchase Invoice" open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="invoiceCode" label="Invoice Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="supplierInvoiceNumber" label="Supplier Invoice #" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="poId" label="PO ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="currencyCode" label="Currency">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="subtotal" label="Subtotal">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxPercent" label="Tax %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discountAmount" label="Discount">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="Record Supplier Payment" open={paymentVisible}
        onOk={handlePaymentSubmit} onCancel={() => setPaymentVisible(false)} width={480}>
        {paymentInvoice && (
          <Form form={paymentForm} layout="vertical">
            <p style={{ marginBottom: 12 }}>
              Invoice <b>{paymentInvoice.invoiceCode}</b> — Total {formatDecimal(paymentInvoice.totalAmount)},
              Paid {formatDecimal(paymentInvoice.paidAmount ?? 0)}, Remaining{' '}
              {formatDecimal(Math.max(0, Number(paymentInvoice.totalAmount) - Number(paymentInvoice.paidAmount || 0)))}
            </p>
            <Form.Item name="paidAmount" label="Paid Amount" rules={[{ required: true }]}>
              <InputNumber style={{ width: '100%' }} min={0} precision={2} />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Card>
  );
};

export default PurchaseInvoiceManagement;
