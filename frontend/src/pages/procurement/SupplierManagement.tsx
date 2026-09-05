import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, App, Card,
  InputNumber, Row, Col, Rate, Descriptions,
} from 'antd';
import { PlusOutlined, EditOutlined, SearchOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

interface Supplier {
  id: string;
  supplierCode: string;
  name: string;
  shortName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  currencyCode: string;
  paymentTerms?: string;
  creditLimit: number;
  leadTimeDays: number;
  rating: number;
  status: string;
}

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED'];

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'default',
  SUSPENDED: 'orange',
  BLACKLISTED: 'red',
};

const SupplierManagement: React.FC = () => {
  const { message } = App.useApp();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [detailVisible, setDetailVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Supplier | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [form] = Form.useForm();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [pageSize] = useState(20);

  const fetchSuppliers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: Supplier[]; total: number }>('/procurement/suppliers', params);
      setSuppliers(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch suppliers');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  useEffect(() => { fetchSuppliers(page); }, [page, fetchSuppliers]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ currencyCode: 'PKR', creditLimit: 0, leadTimeDays: 0, rating: 0 });
    setModalVisible(true);
  };

  const handleEdit = (record: Supplier) => {
    setEditingItem(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleView = async (record: Supplier) => {
    try {
      const res = await apiService.get<{ data: Supplier }>(`/procurement/suppliers/${record.id}`);
      setSelectedSupplier(res.data);
      setDetailVisible(true);
    } catch (error) {
      message.error('Failed to load supplier details');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/procurement/suppliers/${editingItem.id}`, values);
        message.success('Supplier updated successfully');
      } else {
        await apiService.post('/procurement/suppliers', values);
        message.success('Supplier created successfully');
      }
      setModalVisible(false);
      fetchSuppliers(page);
    } catch (error) {
      message.error('Failed to save supplier');
    }
  };

  const handleDelete = async (record: Supplier) => {
    Modal.confirm({
      title: 'Confirm Delete',
      content: `Are you sure you want to delete supplier "${record.name}"?`,
      onOk: async () => {
        try {
          await apiService.delete(`/procurement/suppliers/${record.id}`);
          message.success('Supplier deleted successfully');
          fetchSuppliers(page);
        } catch (error) {
          message.error('Failed to delete supplier');
        }
      },
    });
  };

  const columns: ColumnsType<Supplier> = [
    { title: 'Code', dataIndex: 'supplierCode', key: 'supplierCode', width: 120 },
    { title: 'Name', dataIndex: 'name', key: 'name', width: 200 },
    { title: 'Contact', dataIndex: 'contactPerson', key: 'contactPerson', width: 150 },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 200 },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: 'City', dataIndex: 'city', key: 'city', width: 120 },
    { title: 'Rating', dataIndex: 'rating', key: 'rating', width: 150, render: (v: number) => <Rate disabled value={v} /> },
    { title: 'Currency', dataIndex: 'currencyCode', key: 'currencyCode', width: 80 },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 100,
      render: (status: string) => <Tag color={statusColorMap[status]}>{status}</Tag>,
    },
    {
      title: 'Actions', key: 'actions', width: 150,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handleView(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  return (
    <Card title="Supplier Management" extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Supplier</Button>}>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Input placeholder="Search suppliers..." prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={() => fetchSuppliers(1)} />
        </Col>
        <Col span={6}>
          <Select placeholder="Filter by status" allowClear style={{ width: '100%' }} value={filterStatus} onChange={setFilterStatus}>
            {STATUS_OPTIONS.map(s => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
        </Col>
        <Col span={4}>
          <Button onClick={() => fetchSuppliers(1)}>Search</Button>
        </Col>
      </Row>
      <Table
        columns={columns}
        dataSource={suppliers}
        rowKey="id"
        loading={loading}
        pagination={{ current: page, total, pageSize, onChange: setPage, showSizeChanger: false }}
      />
      <Modal
        title={editingItem ? 'Edit Supplier' : 'Create Supplier'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company ID" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="supplierCode" label="Supplier Code" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Required' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="shortName" label="Short Name">
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="Contact Person">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email">
                <Input type="email" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="phone" label="Phone">
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
            <Col span={12}>
              <Form.Item name="paymentTerms" label="Payment Terms">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="creditLimit" label="Credit Limit">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rating" label="Rating">
                <Rate />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal title="Supplier Details" open={detailVisible} onCancel={() => setDetailVisible(false)} footer={null} width={700}>
        {selectedSupplier && (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="Code">{selectedSupplier.supplierCode}</Descriptions.Item>
            <Descriptions.Item label="Name">{selectedSupplier.name}</Descriptions.Item>
            <Descriptions.Item label="Contact">{selectedSupplier.contactPerson}</Descriptions.Item>
            <Descriptions.Item label="Email">{selectedSupplier.email}</Descriptions.Item>
            <Descriptions.Item label="Phone">{selectedSupplier.phone}</Descriptions.Item>
            <Descriptions.Item label="City">{selectedSupplier.city}</Descriptions.Item>
            <Descriptions.Item label="Currency">{selectedSupplier.currencyCode}</Descriptions.Item>
            <Descriptions.Item label="Payment Terms">{selectedSupplier.paymentTerms}</Descriptions.Item>
            <Descriptions.Item label="Credit Limit">{selectedSupplier.creditLimit}</Descriptions.Item>
            <Descriptions.Item label="Lead Time">{selectedSupplier.leadTimeDays} days</Descriptions.Item>
            <Descriptions.Item label="Rating"><Rate disabled value={selectedSupplier.rating} /></Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={statusColorMap[selectedSupplier.status]}>{selectedSupplier.status}</Tag></Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default SupplierManagement;
