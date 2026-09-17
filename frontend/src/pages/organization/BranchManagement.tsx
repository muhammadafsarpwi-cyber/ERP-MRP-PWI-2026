import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Select, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { getAuditColumns } from './orgUtils';

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
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

const BranchManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchBranches = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Branch[]; total: number }>('/branches', {
        page: pageNum,
        limit: 20,
      });
      setBranches(response.data);
      setTotal(response.total);
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch branches'),
      });
    } finally {
      setLoading(false);
    }
  }, [modal]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch companies'),
      });
    }
  }, [modal]);

  useEffect(() => {
    fetchBranches(page);
    fetchCompanies();
  }, [page, fetchBranches, fetchCompanies]);

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

  const handleDelete = (record: Branch) => {
    modal.confirm({
      title: 'Delete Branch',
      content: `Are you sure you want to delete branch "${record.branchCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/branches/${record.id}`);
          message.success('Branch deleted successfully');
          fetchBranches(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete branch'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Branch) => {
    modal.confirm({
      title: 'Activate Branch',
      content: `Are you sure you want to activate branch "${record.branchCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/branches/${record.id}/activate`);
          message.success('Branch activated successfully');
          fetchBranches(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate branch'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Branch) => {
    modal.confirm({
      title: 'Deactivate Branch',
      content: `Are you sure you want to deactivate branch "${record.branchCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/branches/${record.id}/deactivate`);
          message.success('Branch deactivated successfully');
          fetchBranches(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate branch'),
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
          if (editingBranch) {
            const { companyId: _co, ...editable } = values;
            await apiService.patch(`/branches/${editingBranch.id}`, editable);
            message.success('Branch updated successfully');
          } else {
            await apiService.post('/branches', values);
            message.success('Branch created successfully');
          }
          setModalVisible(false);
          fetchBranches(page);
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

  const baseColumns: ColumnsType<Branch> = [
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
  ];

  const columns: ColumnsType<Branch> = [
    ...baseColumns,
    ...getAuditColumns<Branch>(),
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit Branch" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate Branch" />
          ) : (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate Branch" />
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete Branch" />
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
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
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