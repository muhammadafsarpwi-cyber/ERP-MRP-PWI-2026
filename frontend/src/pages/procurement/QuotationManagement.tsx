import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, message, Card,
  InputNumber, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

interface Quotation {
  id: string;
  quotationCode: string;
  supplierName?: string;
  rfqCode?: string;
  quotationDate?: string;
  validUntil?: string;
  totalAmount: number;
  status: string;
}

const STATUS_OPTIONS = ['DRAFT', 'RECEIVED', 'EVALUATED', 'SELECTED', 'REJECTED', 'EXPIRED'];

const statusColorMap: Record<string, string> = {
  DRAFT: 'default', RECEIVED: 'blue', EVALUATED: 'purple',
  SELECTED: 'green', REJECTED: 'red', EXPIRED: 'orange',
};

const QuotationManagement: React.FC = () => {
  const [data, setData] = useState<Quotation[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Quotation | null>(null);
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
      const response = await apiService.get<{ data: Quotation[]; total: number }>('/procurement/quotations', params);
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
    setModalVisible(true);
  };

  const handleEdit = (record: Quotation) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/procurement/quotations/${editingItem.id}`, values);
        message.success('Quotation updated');
      } else {
        await apiService.post('/procurement/quotations', values);
        message.success('Quotation created');
      }
      setModalVisible(false);
      fetchData(page);
    } catch (error) {
      message.error('Failed to save quotation');
    }
  };

  const handleAction = async (id: string, action: string) => {
    try {
      await apiService.patch(`/procurement/quotations/${id}/${action}`);
      message.success(`Quotation ${action}d successfully`);
      fetchData(page);
    } catch (error) {
      message.error(`Failed to ${action} quotation`);
    }
  };

  const columns: ColumnsType<Quotation> = [
    { title: 'Code', dataIndex: 'quotationCode', key: 'quotationCode', width: 120 },
    { title: 'Supplier', dataIndex: 'supplierName', key: 'supplierName', width: 150 },
    { title: 'RFQ', dataIndex: 'rfqCode', key: 'rfqCode', width: 120 },
    { title: 'Date', dataIndex: 'quotationDate', key: 'quotationDate', width: 110 },
    { title: 'Valid Until', dataIndex: 'validUntil', key: 'validUntil', width: 110 },
    { title: 'Total', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, render: (v: unknown) => formatDecimal(v) },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 200,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'RECEIVED' && <Button size="small" type="primary" onClick={() => handleAction(record.id, 'evaluate')}>Evaluate</Button>}
          {record.status === 'EVALUATED' && <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleAction(record.id, 'select')}>Select</Button>}
          {(record.status === 'RECEIVED' || record.status === 'EVALUATED') && <Button size="small" danger icon={<CloseOutlined />} onClick={() => handleAction(record.id, 'reject')}>Reject</Button>}
        </Space>
      ),
    },
  ];

  return (
    <Card title="Supplier Quotations" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Create Quotation</Button>}>
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
      <Modal title={editingItem ? 'Edit Quotation' : 'Create Quotation'} open={modalVisible}
        onOk={handleSubmit} onCancel={() => setModalVisible(false)} width={700}>
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quotationCode" label="Quotation Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rfqId" label="RFQ ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplierId" label="Supplier ID" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="totalAmount" label="Total Amount">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="discountPercent" label="Discount %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxPercent" label="Tax %">
                <InputNumber style={{ width: '100%' }} min={0} max={100} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default QuotationManagement;
