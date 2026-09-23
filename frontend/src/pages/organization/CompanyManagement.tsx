import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Button, Space, Tag, Form, Input, Select, Dropdown, Checkbox, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, AppstoreOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { GlobalLoading, ERPTable, DraggableResizableModal, TabKeepAlive } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

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
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
}

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  companyCode: { label: 'Company Code' },
  legalName: { label: 'Legal Name' },
  tradeName: { label: 'Trade Name' },
  email: { label: 'Email' },
  phone: { label: 'Phone' },
  country: { label: 'Country' },
  baseCurrency: { label: 'Currency' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_COMPANIES_TAB_ID = '/organization/companies';

interface CompanyTabCache {
  companies: Company[];
  total: number;
  page: number;
}

const CompanyManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<CompanyTabCache>(ORGANIZATION_COMPANIES_TAB_ID), []);

  const [companies, setCompanies] = useState<Company[]>(() => cachedMaster?.companies ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.companies || cachedMaster.companies.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    companyCode: true,
    legalName: true,
    tradeName: true,
    email: true,
    phone: true,
    country: true,
    baseCurrency: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchCompaniesRef = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Company[]; total: number }>('/companies', {
        page: pageNum,
        limit: 20,
      });
      setCompanies(response.data);
      setTotal(response.total);
      tabSessionCache.set<CompanyTabCache>(ORGANIZATION_COMPANIES_TAB_ID, {
        companies: response.data,
        total: response.total,
        page: pageNum,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch companies'));
    } finally {
      setLoading(false);
    }
  }, [page, message]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.companies || cachedMaster.companies.length === 0) {
      void fetchCompaniesRef(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_COMPANIES_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_COMPANIES_TAB_ID);
        void fetchCompaniesRef(page);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
          fetchCompaniesRef(page);
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
          fetchCompaniesRef(page);
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
          fetchCompaniesRef(page);
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
            const { companyCode: _cc, ...editable } = values;
            await apiService.patch(`/companies/${editingCompany.id}`, editable);
            message.success('Company updated successfully');
          } else {
            await apiService.post('/companies', values);
            message.success('Company created successfully');
          }
          setModalVisible(false);
          fetchCompaniesRef(page);
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

  const columns: ColumnsType<Company> = [
    {
      title: 'Company Code',
      dataIndex: 'companyCode',
      key: 'companyCode',
      sorter: (a, b) => a.companyCode.localeCompare(b.companyCode),
      width: 140,
      fixed: 'left',
    },
    {
      title: 'Legal Name',
      dataIndex: 'legalName',
      key: 'legalName',
      sorter: (a, b) => a.legalName.localeCompare(b.legalName),
      width: 220,
    },
    {
      title: 'Trade Name',
      dataIndex: 'tradeName',
      key: 'tradeName',
      width: 200,
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      width: 200,
    },
    {
      title: 'Phone',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 130,
    },
    {
      title: 'Currency',
      dataIndex: 'baseCurrency',
      key: 'baseCurrency',
      width: 100,
    },
    {
      title: 'Created By / Date',
      key: 'createdByNameDate',
      width: 160,
      sorter: (a, b) => (a.createdByName || '').localeCompare(b.createdByName || ''),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{record.createdByName || (record.createdBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{formatDateTime(record.createdAt)}</span>
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
          <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{record.updatedByName || (record.updatedBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{formatDateTime(record.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
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
      align: 'center',
      render: (_, record) => (
        <Space size="small" direction="horizontal">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          {record.status === 'ACTIVE' ? (
            <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} />
          ) : (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} />
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
        </Space>
      ),
    },
  ];

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-company',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            + Add Company
          </Button>
        ),
      },
      {
        key: 'refresh-company',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchCompaniesRef(page)}>
            Refresh
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page]);

  const filteredCompanies = companies.filter((c) => {
    if (searchText && !`${c.companyCode || ''} ${c.legalName || ''} ${c.tradeName || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'ALL' && c.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_COMPANIES_TAB_ID}
      load={async () => { await fetchCompaniesRef(page); }}
      serialize={() => ({ companies, total, page })}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, padding: '8px 0' }}>Company Management</h2>

        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <Input
            placeholder="Search companies..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            size="middle"
          />
          <Select
            placeholder="Status"
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
            popupMatchSelectWidth={false}
          >
            <Select.Option value="ALL">All Status</Select.Option>
            <Select.Option value="ACTIVE">Active</Select.Option>
            <Select.Option value="INACTIVE">Inactive</Select.Option>
          </Select>

          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div
                style={{
                  background: token.colorBgElevated,
                  padding: '12px 16px',
                  borderRadius: 8,
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                  minWidth: 200,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: token.colorText }}>
                    Table Columns
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(COLUMN_META).map(([key, meta]) => (
                    <Checkbox
                      key={key}
                      checked={visibleCols[key] !== false}
                      disabled={key === 'companyCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_company_table_columns', JSON.stringify(next));
                        } catch {}
                      }}
                      style={{ fontSize: 13, color: token.colorText }}
                    >
                      {meta.label}
                    </Checkbox>
                  ))}
                </div>
              </div>
            )}
          >
            <Button icon={<AppstoreOutlined />} style={{ fontWeight: 600 }}>
              Columns
            </Button>
          </Dropdown>
        </div>

        {loading && filteredCompanies.length === 0 ? (
          <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered companies..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
        ) : (
          <ERPTable
            columns={visibleColumns}
            dataSource={filteredCompanies}
            rowKey="id"
            loading={false}
            pagination={{
              current: page,
              total: filteredCompanies.length,
              pageSize: 20,
              onChange: setPage,
              showTotal: (totalCount) => `Total ${totalCount} companies`,
            }}
            emptyText="No companies found"
          />
        )}

        <DraggableResizableModal
          title={editingCompany ? 'Edit Company' : 'Create Company'}
          open={modalVisible}
          onOk={handleSubmit}
          confirmLoading={submitting}
          onCancel={() => {
            if (!submitting) setModalVisible(false);
          }}
          width={800}
          height={620}
          minWidth={680}
          minHeight={500}
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
        </DraggableResizableModal>
      </div>
    </TabKeepAlive>
  );
};

export default CompanyManagement;
