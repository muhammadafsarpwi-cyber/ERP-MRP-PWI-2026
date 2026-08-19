import React, { useState, useEffect } from 'react';
import { Table, Button, Space, Tag, Modal, Form, Input, Select, message, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

interface Company {
  id: string;
  companyCode: string;
  legalName: string;
}

interface Branch {
  id: string;
  branchCode: string;
  name: string;
  companyId: string;
  company?: Company;
  email: string;
  phone: string;
  city: string;
  country: string;
  status: string;
  createdAt: string;
}

const BranchManagement: React.FC = () => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [form] = Form.useForm();

  const fetchBranches = async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Branch[]; total: number }>('/branches', {
        page: pageNum,
        limit: 20,
      });
      setBranches(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch branches');
    } finally {
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error) {
      message.error('Failed to fetch companies');
    }
  };

  useEffect(() => {
    fetchBranches(page);
    fetchCompanies();
  }, [page]);

  const handleCreate = () => {
    setEditingBranch(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Branch) => {
    setEditingBranch(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/branches/${id}`);
      message.success('Branch deleted successfully');
      fetchBranches(page);
    } catch (error) {
      message.error('Failed to delete branch');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/branches/${id}/activate`);
      message.success('Branch activated successfully');
      fetchBranches(page);
    } catch (error) {
      message.error('Failed to activate branch');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/branches/${id}/deactivate`);
      message.success('Branch deactivated successfully');
      fetchBranches(page);
    } catch (error) {
      message.error('Failed to deactivate branch');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingBranch) {
        await apiService.patch(`/branches/${editingBranch.id}`, values);
        message.success('Branch updated successfully');
      } else {
        await apiService.post('/branches', values);
        message.success('Branch created successfully');
      }
      setModalVisible(false);
      fetchBranches(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const columns: ColumnsType<Branch> = [
    {
      title: 'Code',
      dataIndex: 'branchCode',
      key: 'branchCode',
      sorter: true,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Company',
      key: 'company',
      render: (_, record) => record.company?.legalName || '-',
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'red'}>{status}</Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' ? (
            <Popconfirm title="Deactivate this branch?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this branch?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this branch?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Branch Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Branch
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={branches}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          total,
          pageSize: 20,
          onChange: setPage,
        }}
      />

      <Modal
        title={editingBranch ? 'Edit Branch' : 'Create Branch'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="companyId"
            label="Company"
            rules={[{ required: true, message: 'Please select company' }]}
          >
            <Select placeholder="Select company">
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.legalName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="branchCode"
            label="Branch Code"
            rules={[{ required: true, message: 'Please enter branch code' }]}
          >
            <Input disabled={!!editingBranch} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="registrationNumber" label="Registration Number">
            <Input />
          </Form.Item>
          <Form.Item name="taxRegistrationNumber" label="Tax Registration Number">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="Address">
            <Input />
          </Form.Item>
          <Form.Item name="city" label="City">
            <Input />
          </Form.Item>
          <Form.Item name="stateProvince" label="State/Province">
            <Input />
          </Form.Item>
          <Form.Item name="postalCode" label="Postal Code">
            <Input />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default BranchManagement;
