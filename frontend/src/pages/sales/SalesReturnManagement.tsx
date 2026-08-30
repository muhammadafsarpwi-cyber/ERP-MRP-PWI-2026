import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col, Descriptions, Divider,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, EyeOutlined, CheckOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine } from '../../components/shared';
import dayjs from 'dayjs';

interface SalesReturn {
  id: string;
  returnNumber: string;
  salesOrderId: string;
  salesInvoiceId: string;
  customerId: string;
  companyName?: string;
  returnDate: string;
  reason: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  notes?: string;
  lines?: any[];
}

const STATUS_OPTIONS = ['DRAFT', 'APPROVED', 'RECEIVED', 'REFUNDED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'blue', RECEIVED: 'cyan', REFUNDED: 'green', CANCELLED: 'red',
};

const SalesReturnManagement: React.FC = () => {
  const [data, setData] = useState<SalesReturn[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailItem, setDetailItem] = useState<SalesReturn | null>(null);
  const [editingItem, setEditingItem] = useState<SalesReturn | null>(null);
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
      const response = await apiService.get<{ data: SalesReturn[]; total: number }>('/sales/returns', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch returns');
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
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: SalesReturn) => {
    setEditingItem(record);
    form.setFieldsValue({
      salesOrderId: record.salesOrderId,
      salesInvoiceId: record.salesInvoiceId,
      customerId: record.customerId,
      returnDate: record.returnDate ? dayjs(record.returnDate).format('YYYY-MM-DD') : undefined,
      reason: record.reason,
      notes: record.notes,
      subtotal: record.subtotal,
      taxAmount: record.taxAmount,
      totalAmount: record.totalAmount,
    });
    setModalVisible(true);
  };

  const handleViewDetail = async (record: SalesReturn) => {
    try {
      const response = await apiService.get<SalesReturn>(`/sales/returns/${record.id}`);
      setDetailItem(response);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to fetch return details');
    }
  };

  const handleSubmitForm = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        ...values,
        lines: lineItems.map((l) => ({
          itemId: l.itemId, description: l.itemName, quantity: l.quantity,
          uomId: l.uomId, unitPrice: l.rate, taxAmount: 0, lineTotal: l.lineTotal, reason: l.itemName,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/sales/returns/${editingItem.id}`, payload);
        message.success('Return updated');
      } else {
        await apiService.post('/sales/returns', payload);
        message.success('Return created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save return');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/sales/returns/${id}/${action}`);
      message.success(`Return ${action} successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} return`);
    }
  };

  const columns: ColumnsType<SalesReturn> = [
    { title: 'Return #', dataIndex: 'returnNumber', key: 'returnNumber', width: 150 },
    {
      title: 'Customer', key: 'customer', width: 180,
      render: (_, record) => record.companyName || record.customerId,
    },
    { title: 'Return Date', dataIndex: 'returnDate', key: 'returnDate', width: 120 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 350,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)} />
          {record.status === 'DRAFT' && <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />}
          {record.status === 'DRAFT' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>
          )}
          {record.status === 'APPROVED' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'receive')}>Receive</Button>
          )}
          {record.status === 'RECEIVED' && (
            <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'refund')}>Refund</Button>
          )}
          {!['REFUNDED', 'CANCELLED'].includes(record.status) && (
            <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>
          )}
        </Space>
      ),
    },
  ];

  const lineColumns: ColumnsType<any> = [
    { title: 'Description', dataIndex: 'description', key: 'description' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 80 },
    { title: 'Unit Price', dataIndex: 'unitPrice', key: 'unitPrice', width: 120, render: (v: unknown) => formatDecimal(v) },
    { title: 'Total', dataIndex: 'lineTotal', key: 'lineTotal', width: 120, render: (v: unknown) => formatDecimal(v) },
    { title: 'Reason', dataIndex: 'reason', key: 'reason' },
  ];

  return (
    <Card title="Sales Returns" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Return</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search returns..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
        title={editingItem ? 'Edit Return' : 'Create Return'}
        open={modalVisible}
        onOk={handleSubmitForm}
        onCancel={() => setModalVisible(false)}
        width={900}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customerId" label="Customer" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={customers.map((c) => ({ value: c.id, label: `${c.customerCode || ''} ${c.companyName || c.id}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="returnDate" label="Return Date" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} label="Return Items" />
          <Row gutter={16} style={{ marginTop: 12 }}>
            <Col span={6}>
              <Form.Item name="subtotal" label="Subtotal">
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
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Detail Modal */}
      <Modal
        title="Return Details"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={750}
      >
        {detailItem && (
          <>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Return #">{detailItem.returnNumber}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={statusColorMap[detailItem.status]}>{detailItem.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Customer">{detailItem.companyName || detailItem.customerId}</Descriptions.Item>
              <Descriptions.Item label="Sales Order">{detailItem.salesOrderId}</Descriptions.Item>
              <Descriptions.Item label="Sales Invoice">{detailItem.salesInvoiceId}</Descriptions.Item>
              <Descriptions.Item label="Return Date">{detailItem.returnDate}</Descriptions.Item>
              <Descriptions.Item label="Subtotal">{formatDecimal(detailItem.subtotal)}</Descriptions.Item>
              <Descriptions.Item label="Tax">{formatDecimal(detailItem.taxAmount)}</Descriptions.Item>
              <Descriptions.Item label="Total">{formatDecimal(detailItem.totalAmount)}</Descriptions.Item>
              <Descriptions.Item label="Reason">{detailItem.reason}</Descriptions.Item>
              <Descriptions.Item label="Notes" span={2}>{detailItem.notes}</Descriptions.Item>
            </Descriptions>
            {detailItem.lines && detailItem.lines.length > 0 && (
              <>
                <Divider orientation="left">Return Lines</Divider>
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={detailItem.lines}
                  columns={lineColumns}
                />
              </>
            )}
          </>
        )}
      </Modal>
    </Card>
  );
};

export default SalesReturnManagement;
