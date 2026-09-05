import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';

interface Company {
  id: string;
  companyCode: string;
  legalName: string;
  tradeName: string;
  email: string;
  phone: string;
  country: string;
  baseCurrency: string;
  status: string;
  createdAt: string;
}

const CompanyManagement: React.FC = () => {
  const { message } = App.useApp();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchCompanies = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Company[]; total: number }>('/companies', {
        page: pageNum,
        limit: 20,
      });
      setCompanies(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchCompanies(page);
  }, [page, fetchCompanies]);

  const handleCreate = () => {
    setEditingCompany(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Company) => {
    setEditingCompany(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/companies/${id}`);
      message.success('Company deleted successfully');
      fetchCompanies(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete company'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/companies/${id}/activate`);
      message.success('Company activated successfully');
      fetchCompanies(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate company'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/companies/${id}/deactivate`);
      message.success('Company deactivated successfully');
      fetchCompanies(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate company'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingCompany) {
        await apiService.patch(`/companies/${editingCompany.id}`, values);
        message.success('Company updated successfully');
      } else {
        await apiService.post('/companies', values);
        message.success('Company created successfully');
      }
      setModalVisible(false);
      fetchCompanies(page);
    } catch (error: any) {
      if (error?.errorFields) {
        message.error('Please complete all required fields.');
      } else {
        message.error(formatApiError(error, 'Operation failed'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const columns: ColumnsType<Company> = [
    {
      title: 'Code',
      dataIndex: 'companyCode',
      key: 'companyCode',
      sorter: true,
    },
    {
      title: 'Legal Name',
      dataIndex: 'legalName',
      key: 'legalName',
    },
    {
      title: 'Trade Name',
      dataIndex: 'tradeName',
      key: 'tradeName',
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
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
    },
    {
      title: 'Currency',
      dataIndex: 'baseCurrency',
      key: 'baseCurrency',
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
            <Popconfirm title="Deactivate this company?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this company?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this company?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Company Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Company
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={companies}
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
        title={editingCompany ? 'Edit Company' : 'Create Company'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={800}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="companyCode"
            label="Company Code"
            rules={[{ required: true, message: 'Please enter company code' }]}
          >
            <Input disabled={!!editingCompany} />
          </Form.Item>
          <Form.Item
            name="legalName"
            label="Legal Name"
            rules={[{ required: true, message: 'Please enter legal name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="tradeName" label="Trade Name">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="Phone">
            <Input />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input />
          </Form.Item>
          <Form.Item name="addressLine1" label="Address Line 1">
            <Input />
          </Form.Item>
          <Form.Item name="addressLine2" label="Address Line 2">
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
          <Form.Item
            name="country"
            label="Country"
            rules={[{ required: true, message: 'Please enter country' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="baseCurrency"
            label="Base Currency"
            rules={[{ required: true, message: 'Please enter base currency' }]}
          >
            <Input maxLength={3} />
          </Form.Item>
          <Form.Item
            name="fiscalYearStart"
            label="Fiscal Year Start (MM-DD)"
            rules={[{ required: true, message: 'Please enter fiscal year start' }]}
          >
            <Input maxLength={5} placeholder="01-01" />
          </Form.Item>
          <Form.Item
            name="timezone"
            label="Timezone"
            rules={[{ required: true, message: 'Please enter timezone' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="dateFormat" label="Date Format">
            <Input />
          </Form.Item>
          <Form.Item name="numberFormat" label="Number Format">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CompanyManagement;
