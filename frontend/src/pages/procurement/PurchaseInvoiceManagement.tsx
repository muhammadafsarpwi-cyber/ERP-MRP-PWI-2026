import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col, DatePicker, Segmented,
} from 'antd';
import {
  PlusOutlined, SearchOutlined, CheckOutlined, ReloadOutlined,
  ApartmentOutlined, GlobalOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { DraggableResizableModal } from '../../components/shared';

interface PurchaseInvoice {
  id: string;
  invoiceCode: string;
  supplierInvoiceNumber: string;
  poCode?: string;
  supplierName?: string;
  supplierId?: string;
  divisionId?: string;
  divisionName?: string;
  purchaseType?: string;
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

interface DivisionOption { id: string; code?: string; name: string; }

const DEFAULT_DIVISIONS: DivisionOption[] = [
  { id: 'div-wd', code: 'WD', name: 'Wire Drawing Division' },
  { id: 'div-galv', code: 'GALV', name: 'Galvanizing Division' },
  { id: 'div-spk', code: 'SPK', name: 'Spoke Plant Division' },
  { id: 'div-ccd', code: 'CCD', name: 'Control Cable Division' },
  { id: 'div-nail', code: 'NAIL', name: 'Nail & Fastener Division' },
  { id: 'div-corp', code: 'CORP', name: 'Corporate & Master Store' },
];

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
  const { message } = App.useApp();
  const [data, setData] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [paymentVisible, setPaymentVisible] = useState(false);
  const [paymentInvoice, setPaymentInvoice] = useState<PurchaseInvoice | null>(null);
  const [paymentForm] = Form.useForm();
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [divisions, setDivisions] = useState<DivisionOption[]>(DEFAULT_DIVISIONS);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const s = await apiService.get<{ data: Array<{ id: string; name: string }> }>('/procurement/suppliers', { limit: 200 });
        setSuppliers(s.data || []);
      } catch { /* ignore */ }
      try {
        const d = await apiService.get<any>('/divisions', { limit: 50 });
        const divItems = Array.isArray(d) ? d : d?.data?.items || d?.data || [];
        if (divItems.length > 0) {
          setDivisions(divItems.map((x: any) => ({ id: x.id, code: x.divisionCode, name: x.name })));
        }
      } catch { /* keep defaults */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseInvoice[]; total: number }>('/procurement/invoices', params);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch {
      message.error('Failed to fetch purchase invoices');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const generateInvoiceCode = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const nextSeq = (total || data.length || 0) + 1;
    return `PINV-${currentYear}-${String(nextSeq).padStart(4, '0')}`;
  }, [total, data.length]);

  const handleCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      invoiceCode: generateInvoiceCode(),
      companyId,
      currencyCode: 'PKR',
      purchaseType: 'LOCAL',
      taxPercent: 18,
      discountAmount: 0,
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await apiService.post('/procurement/invoices', {
        ...values,
        companyId: companyId || values.companyId,
      });
      message.success(`Purchase Invoice ${values.invoiceCode} created`);
      setModalVisible(false);
      fetchData(page);
    } catch (error: any) {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create purchase invoice');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/invoices/${id}/${action}`);
      message.success(`Purchase invoice ${action}d successfully`);
      fetchData(page);
    } catch {
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
    } catch {
      message.error('Failed to record payment');
    }
  };

  const columns: ColumnsType<PurchaseInvoice> = [
    {
      title: 'Invoice Code',
      dataIndex: 'invoiceCode',
      key: 'invoiceCode',
      width: 140,
      render: (code) => <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#38bdf8' }}>{code}</span>,
    },
    { title: 'Supplier Inv #', dataIndex: 'supplierInvoiceNumber', key: 'supplierInvoiceNumber', width: 140 },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 160 },
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
      render: (s: string) => <Tag color={paymentStatusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Matching', dataIndex: 'matchingStatus', key: 'matchingStatus', width: 130,
      render: (s: string, record) => (
        <Space size={0} direction="vertical">
          <Tag color={matchingStatusColorMap[s] || 'default'}>{s}</Tag>
          {record.varianceAmount != null && Number(record.varianceAmount) !== 0 && (
            <span style={{ fontSize: 11, color: '#888' }}>var {formatDecimal(record.varianceAmount)}</span>
          )}
        </Space>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 190,
      render: (_, record) => (
        <Space size="small">
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
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileTextOutlined style={{ fontSize: 20, color: '#38bdf8' }} />
          <span>Purchase Invoices</span>
        </div>
      }
      extra={
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(page)}>Refresh</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate} style={{ fontWeight: 600 }}>Create Invoice</Button>
        </Space>
      }
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search invoices, PO, supplier..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} allowClear />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button type="primary" onClick={() => fetchData(1)}>Search</Button>
        </Col>
      </Row>

      <Table columns={columns} dataSource={data} rowKey="id" loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }} />

      <DraggableResizableModal
        title="Create Purchase Invoice"
        subtitle="🧾 Enter vendor bill details with 3-way matching, PO receipt link & division routing"
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={980}
        height={620}
        footer={[
          <Button key="cancel" onClick={() => setModalVisible(false)}>Cancel</Button>,
          <Button key="submit" type="primary" loading={submitting} onClick={handleSubmit} style={{ fontWeight: 600 }}>
            Create & Save Invoice
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>

          <Card size="small" style={{ marginBottom: 14, background: 'rgba(255, 255, 255, 0.02)', borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="invoiceCode" label={<span style={{ fontWeight: 600 }}>Invoice Code <Tag color="blue">Auto PINV</Tag></span>} rules={[{ required: true }]}>
                  <Input style={{ fontWeight: 700, fontFamily: 'monospace' }} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierInvoiceNumber" label={<span style={{ fontWeight: 600 }}>Supplier Bill #</span>} rules={[{ required: true }]}>
                  <Input placeholder="Vendor physical invoice #" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="supplierId" label={<span style={{ fontWeight: 600 }}>Supplier</span>} rules={[{ required: true }]}>
                  <Select showSearch optionFilterProp="label" placeholder="Select supplier..." options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="purchaseType" label={<span style={{ fontWeight: 600 }}><GlobalOutlined style={{ marginRight: 4 }} />Origin</span>} initialValue="LOCAL">
                  <Segmented block options={[{ label: 'Local', value: 'LOCAL' }, { label: 'Import', value: 'IMPORT' }]} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={6}>
                <Form.Item name="divisionId" label={<span style={{ fontWeight: 600 }}><ApartmentOutlined style={{ marginRight: 4, color: '#10b981' }} />Division</span>}>
                  <Select placeholder="Select division..." allowClear options={divisions.map((d) => ({ value: d.id, label: `${d.code ? `[${d.code}] ` : ''}${d.name}` }))} />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="poId" label={<span style={{ fontWeight: 600 }}>PO Reference ID</span>} rules={[{ required: true }]}>
                  <Input placeholder="Linked PO ID or Code" />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="currencyCode" label={<span style={{ fontWeight: 600 }}>Currency</span>} initialValue="PKR">
                  <Input />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item name="subtotal" label={<span style={{ fontWeight: 600 }}>Subtotal</span>} rules={[{ required: true }]}>
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="taxPercent" label={<span style={{ fontWeight: 600 }}>Tax %</span>} initialValue={18}>
                  <InputNumber style={{ width: '100%' }} min={0} max={100} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="discountAmount" label={<span style={{ fontWeight: 600 }}>Discount Amount</span>} initialValue={0}>
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="notes" label={<span style={{ fontWeight: 600 }}>Notes / Remarks</span>}>
                  <Input placeholder="Additional invoice notes..." />
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </Form>
      </DraggableResizableModal>

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
