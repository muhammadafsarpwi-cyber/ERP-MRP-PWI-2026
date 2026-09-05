import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Card } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';

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
}

const DivisionManagement: React.FC = () => {
  const { message } = App.useApp();
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
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    } finally {
      setLoading(false);
    }
  }, [message]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    }
  }, [message]);

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

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/divisions/${id}`);
      message.success('Division deleted successfully');
      fetchDivisions(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete division'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/divisions/${id}/activate`);
      message.success('Division activated successfully');
      fetchDivisions(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate division'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/divisions/${id}/deactivate`);
      message.success('Division deactivated successfully');
      fetchDivisions(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate division'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingDivision) {
        const { divisionCode: _dc, companyId: _co, ...editable } = values;
        await apiService.patch(`/divisions/${editingDivision.id}`, editable);
        message.success('Division updated successfully');
      } else {
        await apiService.post('/divisions', values);
        message.success('Division created successfully');
      }
      setModalVisible(false);
      fetchDivisions(page);
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

  const columns: ColumnsType<Division> = [
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
    {
      title: 'Actions',
      key: 'actions',
      render: (_, record) => (
        <Space size="small">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' ? (
            <Popconfirm title="Deactivate this division?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this division?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this division?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
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
