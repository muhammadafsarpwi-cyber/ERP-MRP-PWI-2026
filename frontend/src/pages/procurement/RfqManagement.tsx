import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine } from '../../components/shared';

interface Rfq {
  id: string;
  rfqCode: string;
  title?: string;
  supplierName?: string;
  issueDate?: string;
  dueDate?: string;
  status: string;
}

interface DropdownOption { id: string; name: string; }

const STATUS_OPTIONS = ['DRAFT', 'SENT', 'PARTIAL_RESPONSE', 'RESPONSE_RECEIVED', 'EVALUATED', 'CANCELLED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', SENT: 'blue', PARTIAL_RESPONSE: 'orange',
  RESPONSE_RECEIVED: 'cyan', EVALUATED: 'green', CANCELLED: 'red',
};

const RfqManagement: React.FC = () => {
  const { message } = App.useApp();
  const [data, setData] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Rfq | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
  const [suppliers, setSuppliers] = useState<DropdownOption[]>([]);
  const [lineItems, setLineItems] = useState<ERPLine[]>([]);
  const [companyId, setCompanyId] = useState('');

  useEffect(() => {
    const erpUser = localStorage.getItem('erp_user');
    if (erpUser) {
      try { const p = JSON.parse(erpUser); if (p?.defaultCompanyId) setCompanyId(p.defaultCompanyId); } catch { /* ignore */ }
    }
  }, []);

  const fetchData = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Rfq[]; total: number }>('/procurement/rfqs', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch RFQs');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchSuppliers = async () => {
    try {
      const res = await apiService.get<{ data: DropdownOption[] }>('/procurement/suppliers', { limit: 200 });
      setSuppliers(res.data);
    } catch (error) {
      message.error('Failed to load suppliers');
    }
  };

  useEffect(() => { fetchSuppliers(); }, []);
  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: Rfq) => {
    setEditingItem(record);
    form.setFieldsValue(record);
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
        lines: lineItems.map((l, i) => ({
          lineNumber: i + 1, itemId: l.itemId, uomId: l.uomId, quantity: l.quantity,
          notes: l.itemName || l.itemCode,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/rfqs/${editingItem.id}`, payload);
        message.success('RFQ updated');
      } else {
        await apiService.post('/procurement/rfqs', payload);
        message.success('RFQ created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      const msg: any = (error as any)?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : 'Failed to save RFQ');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/rfqs/${id}/${action}`);
      message.success(`RFQ ${action}ed successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} RFQ`);
    }
  };

  const columns: ColumnsType<Rfq> = [
    { title: 'Code', dataIndex: 'rfqCode', key: 'rfqCode', width: 120 },
    { title: 'Title', dataIndex: 'title', key: 'title', width: 250 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'Issue Date', dataIndex: 'issueDate', key: 'issueDate', width: 110 },
    { title: 'Due Date', dataIndex: 'dueDate', key: 'dueDate', width: 110 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 140,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'send')}>Send</Button>}
          {record.status !== 'CANCELLED' && record.status !== 'SENT' && <Button size="small" danger icon={<StopOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Request for Quotations" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create RFQ</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search RFQs..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
      <Modal title={editingItem ? 'Edit RFQ' : 'Create RFQ'} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rfqCode" label="RFQ Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="title" label="Title">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier" rules={[{ required: true }]}>
                <Select showSearch optionFilterProp="label"
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} label="RFQ Items" showDiscount={false} showTax={false} />
        </Form>
      </Modal>
    </Card>
  );
};

export default RfqManagement;
