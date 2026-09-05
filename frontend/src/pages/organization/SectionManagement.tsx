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
}

interface Section {
  id: string;
  sectionCode: string;
  name: string;
  companyId: string;
  company?: Company;
  divisionId: string;
  division?: Division;
  description: string;
  status: string;
  departments?: any[];
  createdAt: string;
}

const SectionManagement: React.FC = () => {
  const { message } = App.useApp();
  const [sections, setSections] = useState<Section[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchSections = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      if (selectedCompanyId) params.companyId = selectedCompanyId;
      const response = await apiService.get<{ data: Section[]; total: number }>('/sections', params);
      setSections(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch sections'));
    } finally {
      setLoading(false);
    }
  }, [selectedCompanyId, message]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    }
  }, [message]);

  const fetchDivisions = useCallback(async (companyId?: string) => {
    try {
      const params: any = { limit: 100 };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data: Division[] }>('/divisions', params);
      setDivisions(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    }
  }, [message]);

  useEffect(() => {
    fetchSections(page);
    fetchCompanies();
    fetchDivisions();
  }, [page, fetchSections, fetchCompanies, fetchDivisions]);

  useEffect(() => {
    if (selectedCompanyId) {
      fetchDivisions(selectedCompanyId);
    }
  }, [selectedCompanyId, fetchDivisions]);

  const handleCreate = () => {
    setEditingSection(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Section) => {
    setEditingSection(record);
    form.setFieldsValue(record);
    setSelectedCompanyId(record.companyId);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/sections/${id}`);
      message.success('Section deleted successfully');
      fetchSections(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete section'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/sections/${id}/activate`);
      message.success('Section activated successfully');
      fetchSections(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate section'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/sections/${id}/deactivate`);
      message.success('Section deactivated successfully');
      fetchSections(page);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate section'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingSection) {
        const { sectionCode: _sc, companyId: _co, ...editable } = values;
        await apiService.patch(`/sections/${editingSection.id}`, editable);
        message.success('Section updated successfully');
      } else {
        await apiService.post('/sections', values);
        message.success('Section created successfully');
      }
      setModalVisible(false);
      fetchSections(page);
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

  const columns: ColumnsType<Section> = [
    {
      title: 'Code',
      dataIndex: 'sectionCode',
      key: 'sectionCode',
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
      title: 'Division',
      key: 'division',
      render: (_, record) => record.division?.name || '-',
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'Departments',
      key: 'departments',
      render: (_, record) => record.departments?.length || 0,
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
            <Popconfirm title="Deactivate this section?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this section?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this section?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card title="Section Management">
      <Space style={{ marginBottom: 16 }}>
        <Select
          placeholder="Filter by company"
          allowClear
          style={{ width: 200 }}
          onChange={(value) => {
            setSelectedCompanyId(value);
            setPage(1);
          }}
        >
          {companies.map((company) => (
            <Select.Option key={company.id} value={company.id}>
              {company.legalName}
            </Select.Option>
          ))}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Section
        </Button>
      </Space>

      <Table
        columns={columns}
        dataSource={sections}
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
        title={editingSection ? 'Edit Section' : 'Create Section'}
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
            <Select
              placeholder="Select company"
              onChange={(value) => {
                setSelectedCompanyId(value);
                form.setFieldValue('divisionId', undefined);
                fetchDivisions(value);
              }}
            >
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.legalName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="divisionId"
            label="Division"
            rules={[{ required: true, message: 'Please select division' }]}
          >
            <Select placeholder="Select division">
              {divisions.map((division) => (
                <Select.Option key={division.id} value={division.id}>
                  {division.divisionCode} - {division.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="sectionCode"
            label="Section Code"
            rules={[{ required: true, message: 'Please enter section code' }]}
          >
            <Input disabled={!!editingSection} />
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

export default SectionManagement;
