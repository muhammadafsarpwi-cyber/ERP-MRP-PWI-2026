import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Table, Button, Space, Tag, Form, Input, Select, Card, Tree, Tooltip, Dropdown, Checkbox } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CloseCircleOutlined, CheckCircleOutlined, ApartmentOutlined, ReloadOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { TabKeepAlive, GlobalLoading, DraggableResizableModal } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

interface Department {
  id: string;
  departmentCode: string;
  name: string;
  description?: string;
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
  updatedAt?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
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

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  departmentCode: { label: 'Department Code' },
  name: { label: 'Name & Type' },
  division: { label: 'Division' },
  section: { label: 'Section' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_DEPARTMENTS_TAB_ID = '/organization/departments';

interface DepartmentTabCache {
  departments: Department[];
  hierarchy: Department[];
  companies: Company[];
  divisions: Division[];
  sections: Section[];
  total: number;
  page: number;
  filters: {
    filterCompanyId?: string;
    filterDivisionId?: string;
    filterSectionId?: string;
    filterType: 'all' | 'centralized' | 'production';
  };
}

const DepartmentManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const cachedMaster = useMemo(() => tabSessionCache.get<DepartmentTabCache>(ORGANIZATION_DEPARTMENTS_TAB_ID), []);

  const [departments, setDepartments] = useState<Department[]>(() => cachedMaster?.departments ?? []);
  const [hierarchy, setHierarchy] = useState<Department[]>(() => cachedMaster?.hierarchy ?? []);
  const [companies, setCompanies] = useState<Company[]>(() => cachedMaster?.companies ?? []);
  const [divisions, setDivisions] = useState<Division[]>(() => cachedMaster?.divisions ?? []);
  const [sections, setSections] = useState<Section[]>(() => cachedMaster?.sections ?? []);
  const [filterCompanyId, setFilterCompanyId] = useState<string | undefined>(() => cachedMaster?.filters?.filterCompanyId);
  const [filterDivisionId, setFilterDivisionId] = useState<string | undefined>(() => cachedMaster?.filters?.filterDivisionId);
  const [filterSectionId, setFilterSectionId] = useState<string | undefined>(() => cachedMaster?.filters?.filterSectionId);
  const [filterType, setFilterType] = useState<'all' | 'centralized' | 'production'>(() => cachedMaster?.filters?.filterType ?? 'all');
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.departments || cachedMaster.departments.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>('table');
  const [formDivisions, setFormDivisions] = useState<Division[]>([]);
  const [formSections, setFormSections] = useState<Section[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const watchCompanyId = Form.useWatch('companyId', form);
  const watchDivisionId = Form.useWatch('divisionId', form);

  // ── Enterprise column visibility toggle state ─────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    departmentCode: true,
    name: true,
    division: true,
    section: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchDepartmentsRef = useRef(async (pageNum: number = 1) => {
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
      tabSessionCache.set<DepartmentTabCache>(ORGANIZATION_DEPARTMENTS_TAB_ID, {
        departments: response.data, hierarchy, companies, divisions, sections, total: response.total, page: pageNum,
        filters: { filterCompanyId, filterDivisionId, filterSectionId, filterType },
      });
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch departments'));
    } finally {
      setLoading(false);
    }
  });

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
    if (!cachedMaster || !cachedMaster.departments || cachedMaster.departments.length === 0) void fetchDepartmentsRef.current(page);
    if (!cachedMaster || !cachedMaster.hierarchy || cachedMaster.hierarchy.length === 0) void fetchHierarchy();
    if (!cachedMaster || !cachedMaster.companies || cachedMaster.companies.length === 0) void fetchCompanies();
    if (!cachedMaster || !cachedMaster.divisions || cachedMaster.divisions.length === 0) void fetchDivisions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_DEPARTMENTS_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_DEPARTMENTS_TAB_ID);
        void fetchDepartmentsRef.current(page);
        void fetchHierarchy();
        void fetchCompanies();
        void fetchDivisions();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
    fetchDepartmentsRef.current(1);
    fetchHierarchy();
    setPage(1);
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType]);

  const handleCreate = () => {
    setEditingDepartment(null);
    form.resetFields();
    setFormSections([]);
    const defaultCompany = filterCompanyId || (companies.length > 0 ? companies[0].id : undefined);
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
    form.setFieldsValue({
      companyId: record.companyId,
      divisionId: record.divisionId || undefined,
      sectionId: record.sectionId || undefined,
      departmentCode: record.departmentCode,
      name: record.name,
      description: record.description,
      parentDepartmentId: record.parentDepartmentId || undefined,
    });
    loadFormDivisions(record.companyId);
    if (record.divisionId) {
      loadFormSections(record.divisionId);
    } else {
      setFormSections([]);
    }
    setModalVisible(true);
  };

  const handleDelete = (record: Department) => {
    modal.confirm({
      title: 'Delete Department',
      content: `Are you sure you want to delete department "${record.name}" (${record.departmentCode})? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/departments/${record.id}`);
          message.success('Department deleted successfully');
          fetchDepartmentsRef.current(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete department'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Department) => {
    modal.confirm({
      title: 'Activate Department',
      content: `Are you sure you want to activate department "${record.name}"?`,
      okText: 'Activate',
      onOk: async () => {
        try {
          await apiService.patch(`/departments/${record.id}/activate`);
          message.success('Department activated successfully');
          fetchDepartmentsRef.current(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate department'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Department) => {
    modal.confirm({
      title: 'Deactivate Department',
      content: `Are you sure you want to deactivate department "${record.name}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      onOk: async () => {
        try {
          await apiService.patch(`/departments/${record.id}/deactivate`);
          message.success('Department deactivated successfully');
          fetchDepartmentsRef.current(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate department'),
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

    // Business Hierarchy Validation
    if (values.sectionId && !values.divisionId) {
      modal.error({
        title: 'Validation Failed',
        content: 'Cannot assign a Section without selecting a Division.',
      });
      return;
    }

    if (editingDepartment && values.parentDepartmentId === editingDepartment.id) {
      modal.error({
        title: 'Validation Failed',
        content: 'Department cannot be its own parent.',
      });
      return;
    }

    // Confirmation Popup before saving
    modal.confirm({
      title: 'Save Confirmation',
      content: 'Are you sure you want to save these changes?',
      okText: 'Save',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
          let response: any;
          if (editingDepartment) {
            const { companyId: _co, ...editable } = values;
            response = await apiService.patch(`/departments/${editingDepartment.id}`, editable);

            // Verify returned record matches updated section
            const savedSectionId = response.data?.sectionId || null;
            const expectedSectionId = values.sectionId || null;
            if (expectedSectionId && savedSectionId !== expectedSectionId) {
              modal.error({
                title: 'Save Verification Failed',
                content: 'The database update did not reflect the selected section.',
              });
              return;
            }
            message.success('Department updated successfully');
          } else {
            response = await apiService.post('/departments', values);
            message.success('Department created successfully');
          }
          setModalVisible(false);
          fetchDepartmentsRef.current(page);
          fetchHierarchy();
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

  const convertToTreeData = (departments: Department[]): any[] => {
    return departments.map((dept) => ({
      key: dept.id,
      title: `${dept.departmentCode} - ${dept.name}`,
      children: dept.children ? convertToTreeData(dept.children) : [],
    }));
  };

  const columns: ColumnsType<Department> = [
    {
      title: 'Department Code',
      dataIndex: 'departmentCode',
      key: 'departmentCode',
      sorter: (a, b) => a.departmentCode.localeCompare(b.departmentCode),
      width: 140,
      fixed: 'left',
    },
    {
      title: 'Name & Type',
      key: 'nameType',
      width: 220,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{record.name}</span>
          <Tag
            color={record.divisionId ? 'blue' : 'purple'}
            style={{ margin: 0, padding: '0 6px', height: 18, lineHeight: 16, fontSize: 10, width: 'fit-content' }}
          >
            {record.divisionId ? 'Production' : 'Centralized'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Division',
      key: 'division',
      width: 160,
      render: (_, record) => {
        if (record.division?.name) return record.division.name;
        if (record.divisionScopes && record.divisionScopes.length > 0) {
          return record.divisionScopes.map((s) => s.division?.name || s.divisionId).join(', ');
        }
        return '-';
      },
    },
    {
      title: 'Section',
      key: 'section',
      width: 150,
      render: (_, record) => record.section?.name || '-',
    },
    {
      title: 'Created By / Date',
      key: 'createdByNameDate',
      width: 160,
      sorter: (a, b) => (a.createdByName || '').localeCompare(b.createdByName || ''),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{record.createdByName || (record.createdBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{formatDateTime(record.createdAt)}</span>
        </div>
      ),
    },
    {
      title: 'Updated By / Date',
      key: 'updatedByNameDate',
      width: 160,
      sorter: (a, b) => (a.updatedByName || '').localeCompare(b.updatedByName || ''),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{record.updatedByName || (record.updatedBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{formatDateTime(record.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (status: string) => (
        <Tag
          color={status === 'ACTIVE' ? 'green' : 'red'}
          style={{ margin: 0, borderRadius: 10, fontWeight: 600 }}
        >
          {status}
        </Tag>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: 110,
      render: (_, record) => (
        <Space size="small" direction="horizontal">
          <Tooltip title="Edit Department">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          {record.status === 'ACTIVE' ? (
            <Tooltip title="Deactivate Department">
              <Button
                type="link"
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleDeactivate(record)}
              />
            </Tooltip>
          ) : (
            <Tooltip title="Activate Department">
              <Button
                type="link"
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => handleActivate(record)}
              />
            </Tooltip>
          )}
          <Tooltip title="Delete Department">
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() => handleDelete(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-department',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Department
          </Button>
        ),
      },
      {
        key: 'refresh-department',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchDepartmentsRef.current(page)}>
            Refresh
          </Button>
        ),
      },
      {
        key: 'table-view-department',
        node: (
          <Button
            type={viewMode === 'table' ? 'primary' : 'default'}
            onClick={() => setViewMode('table')}
          >
            Table View
          </Button>
        ),
      },
      {
        key: 'tree-view-department',
        node: (
          <Button
            type={viewMode === 'tree' ? 'primary' : 'default'}
            icon={<ApartmentOutlined />}
            onClick={() => setViewMode('tree')}
          >
            Tree View
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page, viewMode]);

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

return (
    <TabKeepAlive
      tabId={ORGANIZATION_DEPARTMENTS_TAB_ID}
      load={async () => { await fetchDepartmentsRef.current(page); await fetchHierarchy(); await fetchCompanies(); await fetchDivisions(); }}
      serialize={() => ({ departments, hierarchy, companies, divisions, sections, total, page, filters: { filterCompanyId, filterDivisionId, filterSectionId, filterType } })}
    >
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, padding: '8px 0' }}>Department Management</h2>

      <Card title="Department Management" bodyStyle={{ padding: 0 }}>
        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <Select
            placeholder="Filter by division"
            allowClear
            style={{ width: 180 }}
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
            style={{ width: 180 }}
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
          <Select
            placeholder="Types"
            allowClear
            style={{ width: 150 }}
            value={filterType}
            onChange={(v) => setFilterType(v || 'all')}
          >
            <Select.Option value="all">All Types</Select.Option>
            <Select.Option value="centralized">Centralized</Select.Option>
            <Select.Option value="production">Production</Select.Option>
          </Select>
          <Dropdown
            overlay={
              <div style={{ padding: '8px 4px', minWidth: 180 }}>
                <div style={{ padding: '4px 8px', fontWeight: 600, fontSize: 12, color: 'var(--theme-text-secondary)' }}>Visible Columns</div>
                {Object.entries(COLUMN_META).map(([key, meta]) => (
                  <Checkbox
                    key={key}
                    checked={visibleCols[key as keyof typeof visibleCols] !== false}
                    onChange={(e) => {
                      setVisibleCols((prev) => ({ ...prev, [key]: e.target.checked }));
                    }}
                    style={{ display: 'block', padding: '2px 8px' }}
                  >
                    {meta.label}
                  </Checkbox>
                ))}
              </div>
            }
            trigger={['click']}
          >
            <Button icon={<AppstoreOutlined />}>Columns</Button>
          </Dropdown>
        </div>

        {viewMode === 'table' ? (
          loading && departments.length === 0 ? (
            <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered departments..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
          ) : (
            <Table
              columns={visibleColumns}
              dataSource={departments}
              rowKey="id"
              loading={false}
              scroll={{ x: 1600 }}
              pagination={{
                current: page,
                total,
                pageSize: 20,
                onChange: setPage,
                showTotal: (totalCount) => `Total ${totalCount} departments`,
              }}
            />
          )
        ) : (
          <Tree
            treeData={convertToTreeData(hierarchy)}
            defaultExpandAll
            showLine
            style={{ padding: '16px' }}
          />
        )}

      <DraggableResizableModal
        title={editingDepartment ? 'Edit Department' : 'Create Department'}
        open={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => {
          if (!submitting) setModalVisible(false);
        }}
        width={720}
        height={600}
        minWidth={600}
        minHeight={480}
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
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="parentDepartmentId" label="Parent Department">
            <Select placeholder="Select parent department (optional)" allowClear>
              {departments
                .filter((dept) => !editingDepartment || dept.id !== editingDepartment.id)
                .map((dept) => (
                  <Select.Option key={dept.id} value={dept.id}>
                    {dept.departmentCode} - {dept.name}
                  </Select.Option>
                ))}
            </Select>
          </Form.Item>
        </Form>
      </DraggableResizableModal>
    </Card>
  </TabKeepAlive>
  );
};

export default DepartmentManagement;
