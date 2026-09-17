import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { getAuditColumns } from './orgUtils';

interface Company extends OrgAuditLike {
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
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

interface OrgAuditLike {
  createdAt: string;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

const CompanyManagement: React.FC = () => {
  const { message, modal } = App.useApp();
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
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch companies'),
      });
    } finally {
      setLoading(false);
    }
  }, [modal]);

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

  const handleDelete = (record: Company) => {
    modal.confirm({
      title: 'Delete Company',
      content: `Are you sure you want to delete company "${record.companyCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/companies/${record.id}`);
          message.success('Company deleted successfully');
          fetchCompanies(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete company'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Company) => {
    modal.confirm({
      title: 'Activate Company',
      content: `Are you sure you want to activate company "${record.companyCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/companies/${record.id}/activate`);
          message.success('Company activated successfully');
          fetchCompanies(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate company'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Company) => {
    modal.confirm({
      title: 'Deactivate Company',
      content: `Are you sure you want to deactivate company "${record.companyCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/companies/${record.id}/deactivate`);
          message.success('Company deactivated successfully');
          fetchCompanies(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate company'),
          });
        }
      },
    });
  };

  const handleSubmit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch (error: any) {
      const errorList = error?.errorFields?.flatMap((f: any) => f.errors) || ['Please check required fields'];
      modal.error({
        title: 'Validation Failed',
        content: (
          <div>
            <p style={{ marginBottom: 8, fontWeight: 500 }}>Please correct the following errors:</p>
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {errorList.map((msg: string, idx: number) => (
                <li key={idx} style={{ color: '#ff4d4f' }}>{msg}</li>
              ))}
            </ul>
          </div>
        ),
      });
      return;
    }

    modal.confirm({
      title: 'Save Confirmation',
      content: 'Are you sure you want to save these changes?',
      okText: 'Save',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
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
          modal.error({
            title: 'Save Failed',
            content: formatApiError(error, 'Operation failed'),
          });
        } finally {
          setSubmitting(false);
        }
      },
    });
  };

  const baseColumns: ColumnsType<Company> = [
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
  ];

  const columns: ColumnsType<Company> = [
    ...baseColumns,
    ...getAuditColumns<Company>(),
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit Company" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate Company" />
          ) : (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate Company" />
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete Company" />
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