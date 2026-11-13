import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Table, Button, Space, Tag, Form, Input, Select, Card, Tree, Tooltip, Dropdown, Checkbox, Badge } from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  ApartmentOutlined,
  ReloadOutlined,
  AppstoreOutlined,
  FilterOutlined,
  CloseOutlined,
  ClearOutlined,
  BankOutlined,
  SettingOutlined,
  SearchOutlined,
  ShopOutlined,
  BuildOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { TabKeepAlive, GlobalLoading, DraggableResizableModal } from '../../components/shared';
import CardSelectDropdown from '../../components/dashboard/CardSelectDropdown';
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
  departmentType?: 'PRODUCTION' | 'CORPORATE';
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
  divisionId?: string;
  companyId?: string;
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
    filterSearch?: string;
  };
}

const PAGE_SIZE = 20;

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
  const [filterSearch, setFilterSearch] = useState<string>(() => cachedMaster?.filters?.filterSearch ?? '');
  const [showFilters, setShowFilters] = useState(false);

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
  const watchDepartmentType = Form.useWatch('departmentType', form);

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

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterCompanyId) count++;
    if (filterDivisionId) count++;
    if (filterSectionId) count++;
    if (filterType && filterType !== 'all') count++;
    if (filterSearch && filterSearch.trim()) count++;
    return count;
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType, filterSearch]);

  const fetchHierarchy = useCallback(async () => {
    try {
      const params: any = {};
      if (filterCompanyId) params.companyId = filterCompanyId;
      const response = await apiService.get<{ data: Department[] }>('/departments/hierarchy', params);
      setHierarchy(response.data || []);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch department hierarchy'));
    }
  }, [filterCompanyId, message]);

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data || []);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    }
  }, [message]);

  const fetchDivisions = useCallback(async (companyId?: string) => {
    try {
      const params: any = { limit: 100, status: 'ACTIVE' };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data: Division[] }>('/divisions', params);
      const activeOnly = (response.data || []).filter(
        (d: any) => d?.isActive !== false && d?.is_active !== false && (!d?.status || d.status === 'ACTIVE'),
      );
      setDivisions(activeOnly);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    }
  }, [message]);

  const fetchSections = useCallback(async (divisionId?: string) => {
    try {
      const params: any = { limit: 100 };
      if (divisionId) params.divisionId = divisionId;
      const response = await apiService.get<{ data: Section[] }>('/sections', params);
      setSections(response.data || []);
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch sections'));
    }
  }, [message]);

  const fetchDepartments = useCallback(async (
    pageNum: number = 1,
    overrides?: {
      companyId?: string;
      divisionId?: string;
      sectionId?: string;
      type?: 'all' | 'centralized' | 'production';
      search?: string;
    }
  ) => {
    setLoading(true);
    try {
      const activeCompanyId = overrides && 'companyId' in overrides ? overrides.companyId : filterCompanyId;
      const activeDivisionId = overrides && 'divisionId' in overrides ? overrides.divisionId : filterDivisionId;
      const activeSectionId = overrides && 'sectionId' in overrides ? overrides.sectionId : filterSectionId;
      const activeType = overrides && 'type' in overrides ? overrides.type : filterType;
      const activeSearch = overrides && 'search' in overrides ? overrides.search : filterSearch;

      const params: any = { page: pageNum, limit: PAGE_SIZE };
      if (activeCompanyId) params.companyId = activeCompanyId;
      if (activeDivisionId) params.divisionId = activeDivisionId;
      if (activeSectionId) params.sectionId = activeSectionId;
      if (activeType === 'centralized') params.centralizedOnly = 'true';
      if (activeType === 'production') params.productionOnly = 'true';
      if (activeSearch && activeSearch.trim()) params.search = activeSearch.trim();

      const response = await apiService.get<{ data: Department[]; total: number }>('/departments', params);
      setDepartments(response.data || []);
      setTotal(response.total || 0);
      setPage(pageNum);

      tabSessionCache.set<DepartmentTabCache>(ORGANIZATION_DEPARTMENTS_TAB_ID, {
        departments: response.data || [],
        hierarchy,
        companies,
        divisions,
        sections,
        total: response.total || 0,
        page: pageNum,
        filters: {
          filterCompanyId: activeCompanyId,
          filterDivisionId: activeDivisionId,
          filterSectionId: activeSectionId,
          filterType: activeType || 'all',
          filterSearch: activeSearch,
        },
      });
    } catch (error) {
      message.error(formatApiError(error, 'Failed to fetch departments'));
    } finally {
      setLoading(false);
    }
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType, filterSearch, hierarchy, companies, divisions, sections, message]);

  const fetchDepartmentsRef = useRef(fetchDepartments);
  useEffect(() => {
    fetchDepartmentsRef.current = fetchDepartments;
  }, [fetchDepartments]);

  const handleClearFilters = useCallback(() => {
    setFilterCompanyId(undefined);
    setFilterDivisionId(undefined);
    setFilterSectionId(undefined);
    setFilterType('all');
    setFilterSearch('');
    fetchSections();
    fetchDepartments(1, { companyId: undefined, divisionId: undefined, sectionId: undefined, type: 'all', search: '' });
  }, [fetchDepartments, fetchSections]);

  const loadFormDivisions = useCallback(async (companyId?: string) => {
    try {
      const params: any = { limit: 100, status: 'ACTIVE' };
      if (companyId) params.companyId = companyId;
      const response = await apiService.get<{ data: Division[] }>('/divisions', params);
      const activeOnly = (response.data || []).filter(
        (d: any) => d?.isActive !== false && d?.is_active !== false && (!d?.status || d.status === 'ACTIVE'),
      );
      setFormDivisions(activeOnly);
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
    if (!cachedMaster || !cachedMaster.departments || cachedMaster.departments.length === 0) void fetchDepartments(page);
    if (!cachedMaster || !cachedMaster.hierarchy || cachedMaster.hierarchy.length === 0) void fetchHierarchy();
    if (!cachedMaster || !cachedMaster.companies || cachedMaster.companies.length === 0) void fetchCompanies();
    void fetchDivisions();
    if (!cachedMaster || !cachedMaster.sections || cachedMaster.sections.length === 0) void fetchSections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_DEPARTMENTS_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_DEPARTMENTS_TAB_ID);
        void fetchDepartments(page);
        void fetchHierarchy();
        void fetchCompanies();
        void fetchDivisions();
        void fetchSections();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, fetchDepartments, fetchHierarchy, fetchCompanies, fetchDivisions, fetchSections]);

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
    } else {
      fetchSections();
    }
  }, [filterDivisionId, fetchSections]);

  useEffect(() => {
    fetchDepartments(1);
    fetchHierarchy();
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCompanyId, filterDivisionId, filterSectionId, filterType]);

  const handleCreate = () => {
    setEditingDepartment(null);
    form.resetFields();
    setFormSections([]);
    const defaultType = filterType === 'centralized' ? 'CORPORATE' : 'PRODUCTION';
    form.setFieldValue('departmentType', defaultType);
    const defaultCompany = filterCompanyId || (companies.length > 0 ? companies[0].id : undefined);
    if (defaultCompany) {
      form.setFieldValue('companyId', defaultCompany);
      loadFormDivisions(defaultCompany);
      if (defaultType === 'PRODUCTION') {
        if (filterDivisionId) form.setFieldValue('divisionId', filterDivisionId);
        if (filterSectionId) form.setFieldValue('sectionId', filterSectionId);
      }
    } else {
      setFormDivisions([]);
    }
    setModalVisible(true);
  };

  const handleEdit = (record: Department) => {
    setEditingDepartment(record);
    const resolvedType = record.departmentType || (record.divisionId ? 'PRODUCTION' : 'CORPORATE');
    form.setFieldsValue({
      companyId: record.companyId,
      departmentType: resolvedType,
      divisionId: resolvedType === 'CORPORATE' ? undefined : (record.divisionId || undefined),
      sectionId: resolvedType === 'CORPORATE' ? undefined : (record.sectionId || undefined),
      departmentCode: record.departmentCode,
      name: record.name,
      description: record.description,
      parentDepartmentId: record.parentDepartmentId || undefined,
    });
    loadFormDivisions(record.companyId);
    if (resolvedType === 'PRODUCTION' && record.divisionId) {
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
    const isCorporate = values.departmentType === 'CORPORATE';
    if (isCorporate) {
      values.divisionId = null;
      values.sectionId = null;
    } else if (values.sectionId && !values.divisionId) {
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
      width: 150,
      fixed: 'left',
      render: (code: string) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--theme-primary, #3b82f6)', fontSize: 13 }}>
          {code}
        </span>
      ),
    },
    {
      title: 'Name & Type',
      key: 'nameType',
      width: 240,
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (_, record) => {
        const isProd = record.departmentType
          ? record.departmentType === 'PRODUCTION'
          : Boolean(record.divisionId);
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--theme-text)' }}>
              {record.name}
            </span>
            <Tag
              color={isProd ? 'blue' : 'purple'}
              icon={isProd ? <SettingOutlined /> : <BankOutlined />}
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 12,
                padding: '1px 9px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: isProd ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(168, 85, 247, 0.25)',
              }}
            >
              {isProd ? 'Production' : 'Corporate'}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Division',
      key: 'division',
      width: 180,
      render: (_, record) => {
        if (record.division?.name) {
          return (
            <span style={{ fontWeight: 500, color: 'var(--theme-text)' }}>
              {record.division.name}
            </span>
          );
        }
        if (record.divisionScopes && record.divisionScopes.length > 0) {
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {record.divisionScopes.map((s, idx) => (
                <Tag
                  key={idx}
                  color="cyan"
                  style={{ margin: 0, fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '0 6px' }}
                >
                  {s.division?.name || s.divisionId}
                </Tag>
              ))}
            </div>
          );
        }
        return <span style={{ color: 'var(--theme-text-muted)' }}>-</span>;
      },
    },
    {
      title: 'Section',
      key: 'section',
      width: 170,
      render: (_, record) => {
        if (record.section?.name) {
          return (
            <Tag
              color="geekblue"
              style={{ margin: 0, fontSize: 11, fontWeight: 500, borderRadius: 4, padding: '1px 8px' }}
            >
              {record.section.name}
            </Tag>
          );
        }
        return <span style={{ color: 'var(--theme-text-muted)' }}>-</span>;
      },
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
      width: 110,
      sorter: (a, b) => a.status.localeCompare(b.status),
      render: (status: string) => (
        <Tag
          color={status === 'ACTIVE' ? 'success' : 'error'}
          style={{ margin: 0, borderRadius: 12, fontWeight: 600, padding: '1px 8px' }}
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
        {/* Dashboard-style Collapsible Filter Header & Active Chips */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            padding: '12px 16px',
            flexWrap: 'wrap',
            borderBottom: showFilters ? '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))' : undefined,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Button
              type={showFilters ? 'primary' : 'default'}
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((prev) => !prev)}
              style={{ fontWeight: 600, borderRadius: 10 }}
            >
              {showFilters ? 'Close Filters' : 'Filters'}
              {activeFilterCount > 0 && (
                <Badge
                  count={activeFilterCount}
                  style={{
                    marginLeft: 6,
                    backgroundColor: showFilters ? 'var(--theme-surface, #ffffff)' : 'var(--theme-primary, #3b82f6)',
                    color: showFilters ? 'var(--theme-primary, #3b82f6)' : 'var(--theme-surface, #ffffff)',
                  }}
                />
              )}
            </Button>

            {filterDivisionId && (
              <Tag
                closable
                onClose={() => {
                  setFilterDivisionId(undefined);
                  setFilterSectionId(undefined);
                  fetchSections();
                }}
                style={{
                  margin: 0,
                  borderRadius: 16,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Division: {(() => {
                  const div = divisions.find((d) => d.id === filterDivisionId);
                  return div ? `${div.divisionCode ? `${div.divisionCode} ` : ''}${div.name}` : 'Selected';
                })()}
              </Tag>
            )}

            {filterSectionId && (
              <Tag
                closable
                onClose={() => setFilterSectionId(undefined)}
                style={{
                  margin: 0,
                  borderRadius: 16,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Section: {sections.find((s) => s.id === filterSectionId)?.name || 'Selected'}
              </Tag>
            )}

            {filterType !== 'all' && (
              <Tag
                closable
                onClose={() => setFilterType('all')}
                style={{
                  margin: 0,
                  borderRadius: 16,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Category: {filterType === 'centralized' ? 'Corporate / Shared' : 'Production'}
              </Tag>
            )}

            {filterSearch && filterSearch.trim() && (
              <Tag
                closable
                onClose={() => setFilterSearch('')}
                style={{
                  margin: 0,
                  borderRadius: 16,
                  padding: '3px 10px',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Search: {filterSearch.trim()}
              </Tag>
            )}

            {activeFilterCount > 0 && (
              <Button
                type="link"
                size="small"
                danger
                onClick={handleClearFilters}
                style={{ padding: '0 6px', fontWeight: 600 }}
              >
                Clear all
              </Button>
            )}
          </div>

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
            <Button icon={<AppstoreOutlined />} style={{ borderRadius: 10 }}>Columns</Button>
          </Dropdown>
        </div>

        {/* Dashboard-style Card Filter Grid */}
        {showFilters && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              margin: '12px 16px 14px 16px',
              padding: '14px',
              background: 'var(--theme-surface-alt, rgba(148, 163, 184, 0.05))',
              border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.22))',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 10,
                alignItems: 'stretch',
              }}
            >
              {/* 1. Division CardSelectDropdown */}
              <CardSelectDropdown
                label="Division"
                title="Switch Division"
                subtitle="Filter departments by active division"
                allLabel="All Divisions"
                allSubtitle="Enterprise overview across all lines"
                icon={<ShopOutlined />}
                options={divisions.map((d) => ({
                  id: d.id,
                  name: d.name,
                  code: d.divisionCode,
                  subtext: 'Production Division',
                }))}
                activeId={filterDivisionId}
                onSelect={(val) => {
                  setFilterDivisionId(val);
                  if (val) {
                    fetchSections(val);
                    if (filterSectionId) {
                      const sec = sections.find((s) => s.id === filterSectionId);
                      if (sec && sec.divisionId !== val) {
                        setFilterSectionId(undefined);
                      }
                    }
                  } else {
                    fetchSections();
                  }
                }}
                badgeBg="#fef9c3"
                badgeColor="#854d0e"
              />

              {/* 2. Section CardSelectDropdown */}
              <CardSelectDropdown
                label="Section"
                title="Switch Section"
                subtitle="Filter by workshop section"
                allLabel="All Sections"
                allSubtitle="View all workshop sections"
                icon={<ApartmentOutlined />}
                options={sections.map((s) => ({
                  id: s.id,
                  name: s.name,
                  code: s.sectionCode,
                  subtext: 'Workshop Section',
                }))}
                activeId={filterSectionId}
                onSelect={(val) => {
                  setFilterSectionId(val);
                  if (val && !filterDivisionId) {
                    const sec = sections.find((s) => s.id === val);
                    if (sec?.divisionId) {
                      setFilterDivisionId(sec.divisionId);
                      fetchSections(sec.divisionId);
                    }
                  }
                }}
                badgeBg="#e0f2fe"
                badgeColor="#0369a1"
              />

              {/* 3. Department Category CardSelectDropdown */}
              <CardSelectDropdown
                label="Department Type"
                title="Switch Category"
                subtitle="Production vs Corporate departments"
                allLabel="All Types"
                allSubtitle="Production & Corporate departments"
                icon={<BuildOutlined />}
                options={[
                  {
                    id: 'production',
                    name: 'Production',
                    code: 'PROD',
                    subtext: 'Division-specific shop floor',
                  },
                  {
                    id: 'centralized',
                    name: 'Corporate / Shared',
                    code: 'CORP',
                    subtext: 'Accounts, Admin, Sales, HR',
                  },
                ]}
                activeId={filterType === 'all' ? undefined : filterType}
                onSelect={(val) => setFilterType((val as 'production' | 'centralized') || 'all')}
                badgeBg="#f3e8ff"
                badgeColor="#7e22ce"
              />

              {/* 4. Search Card */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '8px 12px',
                  borderRadius: 12,
                  background: 'var(--theme-surface)',
                  border: '1px solid var(--theme-border)',
                  minHeight: 58,
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--theme-text-muted)',
                    marginBottom: 4,
                  }}
                >
                  Search
                </div>
                <Input
                  placeholder="Search code or name..."
                  prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
                  allowClear
                  size="small"
                  variant="borderless"
                  style={{ padding: 0 }}
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  onPressEnter={() => fetchDepartments(1)}
                />
              </div>
            </div>
          </div>
        )}

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
                pageSize: PAGE_SIZE,
                onChange: (newPage) => {
                  setPage(newPage);
                  fetchDepartments(newPage);
                },
                showTotal: (totalCount) => `Total ${totalCount} departments`,
                showSizeChanger: false,
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
          <Form.Item
            name="departmentType"
            label="Department Category"
            initialValue="PRODUCTION"
            rules={[{ required: true, message: 'Please select department category' }]}
          >
            <Select
              onChange={(val) => {
                if (val === 'CORPORATE') {
                  form.setFieldsValue({ divisionId: undefined, sectionId: undefined });
                  setFormSections([]);
                }
              }}
            >
              <Select.Option value="PRODUCTION">Production (Linked to Division / Section)</Select.Option>
              <Select.Option value="CORPORATE">Corporate / Shared (Company-Wide — Accounts, Admin, Sales, HR)</Select.Option>
            </Select>
          </Form.Item>
          {watchDepartmentType !== 'CORPORATE' && (
            <>
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
            </>
          )}
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
