import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { ERPLineItems, ERPLine } from '../../components/shared';

interface PurchaseOrder {
  id: string;
  poCode: string;
  supplierName?: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  totalAmount: number;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CLOSED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', SUBMITTED: 'blue', APPROVED: 'green',
  PARTIALLY_RECEIVED: 'orange', FULLY_RECEIVED: 'cyan',
  CLOSED: 'purple', CANCELLED: 'red',
};

const PurchaseOrderManagement: React.FC = () => {
  const [data, setData] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseOrder | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; supplierCode: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);
  const [lines, setLines] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: PurchaseOrder[]; total: number }>('/procurement/orders', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch purchase orders');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try {
        const parsed = JSON.parse(erpUser);
        if (parsed?.defaultCompanyId) setCompanyId(parsed.defaultCompanyId);
      } catch { /* ignore */ }
    }
    (async () => {
      try {
        const sup = await apiService.get<{ data: Array<{ id: string; supplierCode: string; name: string }> }>('/procurement/suppliers', { limit: 100 });
        setSuppliers(sup.data || []);
      } catch { /* ignore */ }
      try {
        const wh = await apiService.get<{ data: Array<{ id: string; warehouseCode: string; name: string }> }>('/warehouses', { limit: 100 });
        setWarehouses(wh.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ currencyCode: 'PKR', taxPercent: 0, discountPercent: 0, shippingCost: 0, companyId });
    setLines([]);
    setModalVisible(true);
  };

  const handleEdit = (record: PurchaseOrder) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setLines([]);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lines.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        ...values,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          uomId: undefined,
          quantity: l.quantity,
          unitPrice: l.rate,
          discountPercent: l.discountPercent,
          lineTotal: l.lineTotal,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/orders/${editingItem.id}`, payload);
        message.success('Purchase order updated');
      } else {
        await apiService.post('/procurement/orders', payload);
        message.success('Purchase order created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save purchase order');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/orders/${id}/${action}`);
      message.success(`Purchase order ${action}ed successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} purchase order`);
    }
  };

  const columns: ColumnsType<PurchaseOrder> = [
    { title: 'Code', dataIndex: 'poCode', key: 'poCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Order Date', dataIndex: 'orderDate', key: 'orderDate', width: 110 },
    { title: 'Delivery Date', dataIndex: 'expectedDeliveryDate', key: 'expectedDeliveryDate', width: 120 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 150,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 250,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'submit')}>Submit</Button>}
          {record.status === 'SUBMITTED' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>}
          {record.status !== 'CANCELLED' && record.status !== 'CLOSED' && <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Purchase Orders" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create PO</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search POs..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
      <Modal title={editingItem ? 'Edit Purchase Order' : 'Create Purchase Order'} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={900}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" label="Company" hidden>
            <Input />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="poCode" label="PO Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={suppliers.map((s) => ({ value: s.id, label: `${s.supplierCode} — ${s.name}` }))}
                  placeholder="Select supplier" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="paymentTerms" label="Payment Terms">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="taxPercent" label="Tax %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discountPercent" label="Discount %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="shippingCost" label="Shipping Cost">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="deliveryAddress" label="Delivery Address">
            <Input.TextArea rows={1} />
          </Form.Item>
          <ERPLineItems companyId={companyId} value={lines} onChange={setLines}
            warehouses={warehouses} showWarehouse />
        </Form>
      </Modal>
    </Card>
  );
};

export default PurchaseOrderManagement;
