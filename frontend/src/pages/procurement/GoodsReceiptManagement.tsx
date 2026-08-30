import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  Row, Col,
} from 'antd';
import { PlusOutlined, SearchOutlined, CheckOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine } from '../../components/shared';

interface GoodsReceipt {
  id: string;
  receiptCode: string;
  poCode?: string;
  supplierName?: string;
  receiptDate?: string;
  grnNumber?: string;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'INSPECTION', 'ACCEPTED', 'REJECTED', 'POSTED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RECEIVED: 'blue', INSPECTION: 'orange',
  ACCEPTED: 'green', REJECTED: 'red', POSTED: 'purple',
};

const GoodsReceiptManagement: React.FC = () => {
  const [data, setData] = useState<GoodsReceipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; warehouseCode: string; name: string }>>([]);

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
        const w = await apiService.get<{ data: Array<{ id: string; warehouseCode: string; name: string }> }>('/warehouses', { limit: 100 });
        setWarehouses(w.data || []);
      } catch { /* ignore */ }
    })();
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: GoodsReceipt[]; total: number }>('/procurement/receipts', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch goods receipts');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    form.resetFields();
    setLineItems([]);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (lineItems.length === 0) {
        message.warning('Add at least one line item');
        return;
      }
      const payload = {
        ...values,
        lines: lineItems.map((l) => ({
          itemId: l.itemId, uomId: l.uomId, quantityOrdered: l.quantity, quantityReceived: l.quantity,
          quantityAccepted: l.quantity, quantityRejected: 0, unitPrice: l.rate,
          conditionNotes: l.itemName || l.itemCode,
        })),
      };
      await apiService.post('/procurement/receipts', payload);
      message.success('Goods receipt created');
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to create goods receipt');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/receipts/${id}/${action}`);
      message.success(`Goods receipt ${action}ed successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} goods receipt`);
    }
  };

  const columns: ColumnsType<GoodsReceipt> = [
    { title: 'Code', dataIndex: 'receiptCode', key: 'receiptCode', width: 120 },
    { title: 'PO', dataIndex: 'poCode', key: 'poCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Date', dataIndex: 'receiptDate', key: 'receiptDate', width: 110 },
    { title: 'GRN', dataIndex: 'grnNumber', key: 'grnNumber', width: 110 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 300,
      render: (_, record) => (
        <Space>
          {record.status === 'RECEIVED' && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'inspect')}>Inspect</Button>}
          {record.status === 'INSPECTION' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'accept')}>Accept</Button>}
          {record.status === 'INSPECTION' && <Button size="small" danger onClick={() => handleAction(record.id, 'reject')}>Reject</Button>}
          {(record.status === 'ACCEPTED') && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'post')}>Post</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Goods Receipts" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Receipt</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search receipts..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
      <Modal title="Create Goods Receipt" open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="receiptCode" label="Receipt Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
                <Select options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="grnNumber" label="GRN Number">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} showWarehouse={false} label="Receipt Items" />
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default GoodsReceiptManagement;
