import React, { useState, useEffect, useCallback } from 'react';
import { App, Table, Button, Space, Tag, Modal, Form, Input, Select, Popconfirm, Card, Tree } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseCircleOutlined, CheckCircleOutlined, ApartmentOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';

interface Department {
  id: string;
  departmentCode: string;
  name: string;
  companyId: string;
  branchId?: string;
  businessUnitId?: string;
  divisionId?: string;
  sectionId?: string;
  parentDepartmentId?: string;
  parentDepartment?: Department;
  company?: Company;
  branch?: any;
  businessUnit?: any;
  division?: Division;
  section?: Section;
  children?: Department[];
  divisionScopes?: DivisionScope[];
  status: string;
  createdAt: string;
}

interface DivisionScope {
  id: string;
  departmentId: string;
  divisionId: string;
  division?: Division;
}

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
}

const DepartmentManagement: React.FC = () => {
  const { message } = App.useApp();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hierarchy, setHierarchy] = useState<Department[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>();
  const [filterDivisionId, setFilterDivisionId] = useState<string | undefined>();
  const [filterSectionId, setFilterSectionId] = useState<string | undefined>();
  const [filterType, setFilterType] = useState<'all' | 'centralized' | 'production'>('all');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [formDivisions, setFormDivisions] = useState<Division[]>([]);
  const [formSections, setFormSections] = useState<Section[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const watchCompanyId = Form.useWatch('companyId', form);
  const watchDivisionId = Form.useWatch('divisionId', form);

  const fetchDepartments = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 50 };
      if (filterCompanyId) params.companyId = filterCompanyId;
      if (filterDivisionId) params.divisionId = filterDivisionId;
      if (filterSectionId) params.sectionId = filterSectionId;
      if (filterType === 'centralized') params.centralizedOnly = 'true';
      if (filterType === 'production') params.productionOnly = 'true';
      const response = await apiService.get<{ data: Department[]; total: number }>('/departments', params);
      setDepartments(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch departments'));
    } finally {
      setLoading(false);
    }
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType, message]);

  const fetchHierarchy = useCallback(async () => {
    try {
      const params: any = {};
      if (filterCompanyId) params.companyId = filterCompanyId;
      const response = await apiService.get<{ data: Department[] }>('/departments/hierarchy', params);
      setHierarchy(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch department hierarchy'));
    }
  }, [filterCompanyId, message]);

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
      const params: any = { limit: 100, status: 'ACTIVE' };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data: Division[] }>('/divisions', params);
      setDivisions(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    }
  }, [message]);

  const fetchSections = useCallback(async (divisionId?: string) => {
    try {
      const params: any = { limit: 100 };
      if (divisionId) params.divisionId = divisionId;
      const response = await apiService.get<{ data: Section[] }>('/sections', params);
      setSections(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch sections'));
    }
  }, [message]);

  const loadFormDivisions = useCallback(async (companyId?: string) => {
    try {
      const params: any = { limit: 100, status: 'ACTIVE' };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data: Division[] }>('/divisions', params);
      setFormDivisions(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    }
  }, [message]);

  const loadFormSections = useCallback(async (divisionId?: string) => {
    try {
      const params: any = { limit: 100, status: 'ACTIVE' };
      if (divisionId) params.divisionId = divisionId;
      const response = await apiService.get<{ data: Section[] }>('/sections', params);
      setFormSections(response.data);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch sections'));
    }
  }, [message]);

  useEffect(() => {
    fetchDepartments(page);
    fetchHierarchy();
    fetchCompanies();
    fetchDivisions();
  }, [page, fetchDepartments, fetchHierarchy, fetchCompanies, fetchDivisions]);

  useEffect(() => {
    if (filterCompanyId) {
      fetchDivisions(filterCompanyId);
      setFilterDivisionId(undefined);
      setFilterSectionId(undefined);
    }
  }, [filterCompanyId, fetchDivisions]);

  useEffect(() => {
    if (filterDivisionId) {
      fetchSections(filterDivisionId);
      setFilterSectionId(undefined);
    }
  }, [filterDivisionId, fetchSections]);

  useEffect(() => {
    fetchDepartments(1);
    fetchHierarchy();
    setPage(1);
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType, fetchDepartments, fetchHierarchy]);

  const handleCreate = () => {
    setEditingDepartment(null);
    form.resetFields();
    setFormSections([]);
    const defaultCompany = filterCompanyId || undefined;
    if (defaultCompany) {
      form.setFieldValue('companyId', defaultCompany);
      loadFormDivisions(defaultCompany);
      if (filterDivisionId) form.setFieldValue('divisionId', filterDivisionId);
      if (filterSectionId) form.setFieldValue('sectionId', filterSectionId);
    } else {
      setFormDivisions([]);
    }
    setModalVisible(true);
  };

  const handleEdit = (record: Department) => {
    setEditingDepartment(record);
    form.setFieldsValue(record);
    loadFormDivisions(record.companyId);
    if (record.divisionId) {
      loadFormSections(record.divisionId);
    } else {
      setFormSections([]);
    }
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/departments/${id}`);
      message.success('Department deleted successfully');
      fetchDepartments(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to delete department'));
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/departments/${id}/activate`);
      message.success('Department activated successfully');
      fetchDepartments(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to activate department'));
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/departments/${id}/deactivate`);
      message.success('Department deactivated successfully');
      fetchDepartments(page);
      fetchHierarchy();
    } catch (error) {
      message.error(formatApiError(error, 'Failed to deactivate department'));
    }
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const values = await form.validateFields();
      if (editingDepartment) {
        const { companyId: _co, ...editable } = values;
        await apiService.patch(`/departments/${editingDepartment.id}`, editable);
        message.success('Department updated successfully');
      } else {
        await apiService.post('/departments', values);
        message.success('Department created successfully');
      }
      setModalVisible(false);
      fetchDepartments(page);
      fetchHierarchy();
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

  const convertToTreeData = (departments: Department[]): any[] => {
    return departments.map((dept) => ({
      key: dept.id,
      title: `${dept.departmentCode} - ${dept.name}`,
      children: dept.children ? convertToTreeData(dept.children) : [],
    }));
  };

  const columns: ColumnsType<Department> = [
    {
      title: 'Code',
      dataIndex: 'departmentCode',
      key: 'departmentCode',
      sorter: true,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Type',
      key: 'type',
      render: (_, record) => (
        <Tag color={record.divisionId ? 'blue' : 'purple'}>
          {record.divisionId ? 'Production' : 'Centralized'}
        </Tag>
      ),
    },
    {
      title: 'Division',
      key: 'division',
      render: (_, record) => {
        if (record.division?.name) return record.division.name;
        if (record.divisionScopes && record.divisionScopes.length > 0) {
          return record.divisionScopes
            .map((s) => s.division?.name || s.divisionId)
            .join(', ');
        }
        return '-';
      },
    },
    {
      title: 'Section',
      key: 'section',
      render: (_, record) => record.section?.name || '-',
    },
    {
      title: 'Parent Department',
      key: 'parentDepartment',
      render: (_, record) => record.parentDepartment?.name || '-',
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
            <Popconfirm title="Deactivate this department?" onConfirm={() => handleDeactivate(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />} />
            </Popconfirm>
          ) : (
            <Popconfirm title="Activate this department?" onConfirm={() => handleActivate(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} />
            </Popconfirm>
          )}
          <Popconfirm title="Delete this department?" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Department Management"
      extra={
        <Space>
          <Button
            type={viewMode === 'table' ? 'primary' : 'default'}
            onClick={() => setViewMode('table')}
          >
            Table View
          </Button>
          <Button
            type={viewMode === 'tree' ? 'primary' : 'default'}
            icon={<ApartmentOutlined />}
            onClick={() => setViewMode('tree')}
          >
            Tree View
          </Button>
        </Space>
      }
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Filter by company"
          allowClear
          style={{ width: 200 }}
          value={filterCompanyId}
          onChange={setFilterCompanyId}
        >
          {companies.map((company) => (
            <Select.Option key={company.id} value={company.id}>
              {company.legalName}
            </Select.Option>
          ))}
        </Select>
        <Select
          placeholder="Department type"
          allowClear
          style={{ width: 160 }}
          value={filterType}
          onChange={(v) => setFilterType(v || 'all')}
        >
          <Select.Option value="all">All Types</Select.Option>
          <Select.Option value="centralized">Centralized</Select.Option>
          <Select.Option value="production">Production</Select.Option>
        </Select>
        <Select
          placeholder="Filter by division"
          allowClear
          style={{ width: 200 }}
          value={filterDivisionId}
          onChange={setFilterDivisionId}
          disabled={!filterCompanyId}
        >
          {divisions.map((division) => (
            <Select.Option key={division.id} value={division.id}>
              {division.divisionCode} - {division.name}
            </Select.Option>
          ))}
        </Select>
        <Select
          placeholder="Filter by section"
          allowClear
          style={{ width: 200 }}
          value={filterSectionId}
          onChange={setFilterSectionId}
          disabled={!filterDivisionId}
        >
          {sections.map((section) => (
            <Select.Option key={section.id} value={section.id}>
              {section.sectionCode} - {section.name}
            </Select.Option>
          ))}
        </Select>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
          Add Department
        </Button>
      </Space>

      {viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={departments}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 20,
            onChange: setPage,
          }}
        />
      ) : (
        <Tree
          treeData={convertToTreeData(hierarchy)}
          defaultExpandAll
          showLine
        />
      )}

      <Modal
        title={editingDepartment ? 'Edit Department' : 'Create Department'}
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
                form.setFieldsValue({ divisionId: undefined, sectionId: undefined, parentDepartmentId: undefined });
                loadFormDivisions(value);
                setFormSections([]);
              }}
            >
              {companies.map((company) => (
                <Select.Option key={company.id} value={company.id}>
                  {company.legalName}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="divisionId" label="Division">
            <Select
              placeholder="Select division (optional)"
              allowClear
              disabled={!watchCompanyId}
              onChange={(value) => {
                form.setFieldsValue({ sectionId: undefined });
                if (value) {
                  loadFormSections(value);
                } else {
                  setFormSections([]);
                }
              }}
            >
              {formDivisions.map((division) => (
                <Select.Option key={division.id} value={division.id}>
                  {division.divisionCode} - {division.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="sectionId" label="Section">
            <Select
              placeholder="Select section (optional)"
              allowClear
              disabled={!watchDivisionId}
            >
              {formSections.map((section) => (
                <Select.Option key={section.id} value={section.id}>
                  {section.sectionCode} - {section.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="departmentCode"
            label="Department Code"
            rules={[{ required: true, message: 'Please enter department code' }]}
          >
            <Input disabled={!!editingDepartment} />
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
          <Form.Item name="parentDepartmentId" label="Parent Department">
            <Select placeholder="Select parent department (optional)" allowClear>
              {departments.map((dept) => (
                <Select.Option key={dept.id} value={dept.id}>
                  {dept.departmentCode} - {dept.name}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default DepartmentManagement;
