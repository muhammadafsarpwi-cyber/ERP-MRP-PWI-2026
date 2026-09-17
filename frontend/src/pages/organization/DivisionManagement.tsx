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

interface Division {
  id: string;
  divisionCode: string;
  name: string;
  companyId: string;
  company?: Company;
  description: string;
  status: string;
  sections?: any[];
  createdAt: string;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

const DivisionManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchDivisions = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Division[]; total: number }>('/divisions', {
        page: pageNum,
        limit: 20,
      });
      setDivisions(response.data);
      setTotal(response.total);
    } catch (error: any) {
      modal.error({
        title: 'Load Failed',
        content: formatApiError(error, 'Failed to fetch divisions'),
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
    fetchDivisions(page);
    fetchCompanies();
  }, [page, fetchDivisions, fetchCompanies]);

  const handleCreate = () => {
    setEditingDivision(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Division) => {
    setEditingDivision(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record: Division) => {
    modal.confirm({
      title: 'Delete Division',
      content: `Are you sure you want to delete division "${record.divisionCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/divisions/${record.id}`);
          message.success('Division deleted successfully');
          fetchDivisions(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete division'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Division) => {
    modal.confirm({
      title: 'Activate Division',
      content: `Are you sure you want to activate division "${record.divisionCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/divisions/${record.id}/activate`);
          message.success('Division activated successfully');
          fetchDivisions(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate division'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Division) => {
    modal.confirm({
      title: 'Deactivate Division',
      content: `Are you sure you want to deactivate division "${record.divisionCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/divisions/${record.id}/deactivate`);
          message.success('Division deactivated successfully');
          fetchDivisions(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate division'),
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
          if (editingDivision) {
            const { divisionCode: _dc, ...editable } = values;
            await apiService.patch(`/divisions/${editingDivision.id}`, editable);
            message.success('Division updated successfully');
          } else {
            await apiService.post('/divisions', values);
            message.success('Division created successfully');
          }
          setModalVisible(false);
          fetchDivisions(page);
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

  const baseColumns: ColumnsType<Division> = [
    {
      title: 'Code',
      dataIndex: 'divisionCode',
      key: 'divisionCode',
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
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Sections',
      key: 'sections',
      render: (_, record) => record.sections?.length || 0,
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

  const columns: ColumnsType<Division> = [
    ...baseColumns,
    ...getAuditColumns<Division>(),
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit Division" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate Division" />
          ) : (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate Division" />
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete Division" />
        </Space>
      ),
    },
  ];

  return (
    <Card title="Division Management">
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Division
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={divisions}
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
        title={editingDivision ? 'Edit Division' : 'Create Division'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={600}
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
            name="divisionCode"
            label="Division Code"
            rules={[{ required: true, message: 'Please enter division code' }]}
          >
            <Input disabled={!!editingDivision} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, message: 'Please enter name' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default DivisionManagement;