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

interface Branch {
  id: string;
  branchCode: string;
  name: string;
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

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  branchCode: { label: 'Branch Code' },
  name: { label: 'Branch Name' },
  email: { label: 'Email' },
  phone: { label: 'Phone' },
  city: { label: 'City' },
  country: { label: 'Country' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_BRANCHES_TAB_ID = '/organization/branches';

interface BranchTabCache {
  branches: Branch[];
  total: number;
  page: number;
}

const BranchManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<BranchTabCache>(ORGANIZATION_BRANCHES_TAB_ID), []);

  const [branches, setBranches] = useState<Branch[]>(() => cachedMaster?.branches ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.branches || cachedMaster.branches.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    branchCode: true,
    name: true,
    email: true,
    phone: true,
    city: true,
    country: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchBranchesRef = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Branch[]; total: number }>('/branches', {
        page: pageNum,
        limit: 20,
      });
      setBranches(response.data);
      setTotal(response.total);
      tabSessionCache.set<BranchTabCache>(ORGANIZATION_BRANCHES_TAB_ID, {
        branches: response.data,
        total: response.total,
        page: pageNum,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch branches'));
    } finally {
      setLoading(false);
    }
  }, [page, message]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.branches || cachedMaster.branches.length === 0) {
      void fetchBranchesRef(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_BRANCHES_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_BRANCHES_TAB_ID);
        void fetchBranchesRef(page);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
          fetchBranchesRef(page);
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
          fetchBranchesRef(page);
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
          fetchBranchesRef(page);
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
            const { branchCode: _bc, ...editable } = values;
            await apiService.patch(`/branches/${editingBranch.id}`, editable);
            message.success('Branch updated successfully');
          } else {
            await apiService.post('/branches', values);
            message.success('Branch created successfully');
          }
          setModalVisible(false);
          fetchBranchesRef(page);
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

  const columns: ColumnsType<Branch> = [
    {
      title: 'Branch Code',
      dataIndex: 'branchCode',
      key: 'branchCode',
      sorter: (a, b) => a.branchCode.localeCompare(b.branchCode),
      width: 120,
      fixed: 'left',
    },
    {
      title: 'Branch Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
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
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 140,
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 130,
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
        key: 'add-branch',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            + Add Branch
          </Button>
        ),
      },
      {
        key: 'refresh-branch',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchBranchesRef(page)}>
            Refresh
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page]);

  const filteredBranches = branches.filter((b) => {
    if (searchText && !`${b.branchCode || ''} ${b.name || ''} ${b.city || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'ALL' && b.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_BRANCHES_TAB_ID}
      load={async () => { await fetchBranchesRef(page); }}
      serialize={() => ({ branches, total, page })}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, padding: '8px 0' }}>Branch Management</h2>

        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <Input
            placeholder="Search branches..."
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
                      disabled={key === 'branchCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_branch_table_columns', JSON.stringify(next));
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

        {loading && filteredBranches.length === 0 ? (
          <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered branches..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
        ) : (
          <ERPTable
            columns={visibleColumns}
            dataSource={filteredBranches}
            rowKey="id"
            loading={false}
            pagination={{
              current: page,
              total: filteredBranches.length,
              pageSize: 20,
              onChange: setPage,
              showTotal: (totalCount) => `Total ${totalCount} branches`,
            }}
            emptyText="No branches found"
          />
        )}

        <DraggableResizableModal
          title={editingBranch ? 'Edit Branch' : 'Create Branch'}
          open={modalVisible}
          onOk={handleSubmit}
          confirmLoading={submitting}
          onCancel={() => {
            if (!submitting) setModalVisible(false);
          }}
          width={720}
          height={620}
          minWidth={600}
          minHeight={500}
        >
          <Form form={form} layout="vertical">
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
        </DraggableResizableModal>
      </div>
    </TabKeepAlive>
  );
};

export default BranchManagement;
