import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, SendOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { ERPLineItems, ERPLine } from '../../components/shared';

interface PurchaseRequisition {
  id: string;
  requisitionCode: string;
  title?: string;
  description?: string;
  requestType: string;
  requestedDeliveryDate?: string;
  department?: string;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'];
const REQUEST_TYPES = ['STANDARD', 'URGENT', 'BLANKET', 'RECURRING'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  APPROVED: 'green',
  CANCELLED: 'red',
};

const PurchaseRequisitionManagement: React.FC = () => {
  const [data, setData] = useState<PurchaseRequisition[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<PurchaseRequisition | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);
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
      const response = await apiService.get<{ data: PurchaseRequisition[]; total: number }>('/procurement/requisitions', params);
      setData(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch purchase requisitions');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize]);

  useEffect(() => { fetchData(page); }, [page, fetchData]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ requestType: 'STANDARD' });
    setLineItems([]);
    setModalVisible(true);
  };

  const handleEdit = (record: PurchaseRequisition) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        lines: lineItems.map((l) => ({
          itemId: l.itemId, description: l.itemName, quantity: l.quantity,
          uomId: l.uomId, unitPrice: l.rate, estimatedAmount: l.lineTotal,
        })),
      };
      if (editingItem) {
        await apiService.patch(`/procurement/requisitions/${editingItem.id}`, payload);
        message.success('Purchase requisition updated');
      } else {
        await apiService.post('/procurement/requisitions', payload);
        message.success('Purchase requisition created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to save purchase requisition');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/requisitions/${id}/${action}`);
      message.success(`Purchase requisition ${action}ed successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} purchase requisition`);
    }
  };

  const columns: ColumnsType<PurchaseRequisition> = [
    { title: 'Code', dataIndex: 'requisitionCode', key: 'requisitionCode', width: 120 },
    { title: 'Title', dataIndex: 'title', key: 'title', width: 250 },
    { title: 'Type', dataIndex: 'requestType', key: 'requestType', width: 100 },
    { title: 'Department', dataIndex: 'department', key: 'department', width: 120 },
    { title: 'Delivery Date', dataIndex: 'requestedDeliveryDate', key: 'requestedDeliveryDate', width: 120 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} disabled={record.status !== 'DRAFT'} />
          {record.status === 'DRAFT' && <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleAction(record.id, 'submit')}>Submit</Button>}
          {record.status === 'SUBMITTED' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'approve')}>Approve</Button>}
          {(record.status === 'DRAFT' || record.status === 'SUBMITTED') && <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'cancel')}>Cancel</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Purchase Requisitions" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create PR</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search requisitions..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchData(1)} />
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
      <Modal title={editingItem ? 'Edit Purchase Requisition' : 'Create Purchase Requisition'} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Form.Item name="companyId" hidden><Input /></Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="requisitionCode" label="Requisition Code" rules={[{ required: true }]}>
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
              <Form.Item name="requestType" label="Request Type">
                <Select>
                  {REQUEST_TYPES.map(t => <Select.Option key={t} value={t}>{t}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="department" label="Department">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="projectCode" label="Project Code">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <ERPLineItems companyId={companyId} value={lineItems} onChange={setLineItems} label="Requisition Items" />
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default PurchaseRequisitionManagement;
