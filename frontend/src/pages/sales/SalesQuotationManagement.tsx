import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, SendOutlined, CheckOutlined, StopOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine } from '../../components/shared';
import dayjs from 'dayjs';

interface SalesQuotation {
  id: string;
  quotationNumber: string;
  customerId: string;
  customerName?: string;
  companyName?: string;
  quotationDate: string;
  validUntil: string;
  currency: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  notes?: string;
  status: string;
  items?: any[];
}

const STATUS_OPTIONS = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Cancelled'];

const statusColorMap: Record<string, string> = {
  Draft: 'default', Sent: 'blue', Accepted: 'green', Rejected: 'red', Cancelled: 'orange',
};

export function buildSalesQuotationPayload(values: any, lineItems: ERPLine[]): any {
  return {
    ...values,
    items: lineItems.map((l) => ({
      itemId: l.itemId, description: l.itemName, quantity: l.quantity,
      uomId: l.uomId, unitPrice: l.rate, discountPercent: l.discountPercent, lineTotal: l.lineTotal,
    })),
  };
}

const SalesQuotationManagement: React.FC = () => {
  const [data, setData] = useState<SalesQuotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesQuotation | null>(null);
  const [editingItem, setEditingItem] = useState<SalesQuotation | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [customers, setCustomers] = useState<Array<{ id: string; companyName?: string; customerCode?: string }>>([]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
    (async () => {
      try {
        const c = await apiService.get<{ data: Array<{ id: string; companyName?: string; customerCode?: string }> }>('/customer/customers', { limit: 100 });
        setCustomers(c.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: SalesQuotation[]; total: number }>('/sales/quotations', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch quotations');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      currency: 'PKR', subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0,
    });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: SalesQuotation) => {
    setEditingItem(record);
    form.setFieldsValue({
      customerId: record.customerId,
      quotationDate: record.quotationDate ? dayjs(record.quotationDate).format('YYYY-MM-DD') : undefined,
      validUntil: record.validUntil ? dayjs(record.validUntil).format('YYYY-MM-DD') : undefined,
      currency: record.currency,
      notes: record.notes,
      subtotal: record.subtotal,
      discountAmount: record.discountAmount,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesQuotation) => {
    try {
      const response = await apiService.get<SalesQuotation>(`/sales/quotations/${record.id}`);
      setDetailItem(response);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to fetch quotation details');
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = buildSalesQuotationPayload(values, lineItems);
      if (editingItem) {
        await apiService.patch(`/sales/quotations/${editingItem.id}`, payload);
        message.success('Quotation updated');
      } else {
        await apiService.post('/sales/quotations', payload);
        message.success('Quotation created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save quotation');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/sales/quotations/${id}/${action}`);
      message.success(`Quotation ${action} successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} quotation`);
    }
  };

  const columns: ColumnsType<SalesQuotation> = [
    { title: 'Quotation #', dataIndex: 'quotationNumber', key: 'quotationNumber', width: 150 },
    { title: 'Customer', dataIndex: 'companyName', key: 'companyName', width: 180 },
    { title: 'Date', dataIndex: 'quotationDate', key: 'quotationDate', width: 110 },
    { title: 'Valid Until', dataIndex: 'validUntil', key: 'validUntil', width: 120 },
    { title: 'Total Amount', dataIndex: 'totalAmount', key: 'totalAmount', width: 130, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 300,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'Draft'} />
          {record.status === 'Draft' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'submit')}>Submit</Button>}
          {record.status === 'Sent' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'accept')}>Accept</Button>}
          {record.status === 'Sent' && <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'reject')}>Reject</Button>}
          {record.status !== 'Cancelled' && record.status !== 'Accepted' && record.status !== 'Rejected' && (
            <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Sales Quotations" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Quotation</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search quotations..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
        title={editingItem ? 'Edit Quotation' : 'Create Quotation'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => setModalVisible(false)}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
                <Select
                  showSearch optionFilterProp="label" placeholder="Select customer"
                  options={customers.map((c) => ({ value: c.id, label: `${c.customerCode || ''} ${c.companyName || c.id}` }))}
                />
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
              <Form.Item name="quotationDate" label="Quotation Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="validUntil" label="Valid Until">
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} label="Quotation Items" />
          <Row gutter={16} style={{ marginTop: 12 }}>
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
              <Form.Item name="totalAmount" label="Total (auto)">
                <InputNumber style={{ width: '100%' }} min={0} precision={2} disabled />
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
        title="Quotation Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={700}
      >
        {detailItem && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Quotation #">{detailItem.quotationNumber}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={statusColorMap[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Customer">{detailItem.companyName || detailItem.customerId}</Descriptions.Item>
              <Descriptions.Item label="Currency">{detailItem.currency}</Descriptions.Item>
              <Descriptions.Item label="Quotation Date">{detailItem.quotationDate}</Descriptions.Item>
              <Descriptions.Item label="Valid Until">{detailItem.validUntil}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatDecimal(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Discount">{formatDecimal(detailItem.discountAmount)}</Descriptions.Item>
              <Descriptions.Item label="Tax">{formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Total">{formatDecimal(detailItem.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detailItem.notes}</Descriptions.Item>
            </Descriptions>
            {detailItem.items && detailItem.items.length > 0 && (
              <>
                <Divider orientation="left">Quotation Items</Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.items}
                  columns={[
                    { title: 'Item', dataIndex: 'itemName', key: 'itemName' },
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

export default SalesQuotationManagement;
