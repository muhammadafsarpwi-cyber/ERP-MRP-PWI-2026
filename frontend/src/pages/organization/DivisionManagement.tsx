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

interface Division {
  id: string;
  divisionCode: string;
  name: string;
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

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  divisionCode: { label: 'Division Code' },
  name: { label: 'Name' },
  description: { label: 'Description' },
  sections: { label: 'Sections' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_DIVISIONS_TAB_ID = '/organization/divisions';

interface DivisionTabCache {
  divisions: Division[];
  total: number;
  page: number;
}

const DivisionManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<DivisionTabCache>(ORGANIZATION_DIVISIONS_TAB_ID), []);

  const [divisions, setDivisions] = useState<Division[]>(() => cachedMaster?.divisions ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.divisions || cachedMaster.divisions.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Division | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Enterprise column visibility toggle state
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    divisionCode: true,
    name: true,
    description: true,
    sections: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchDivisionsRef = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Division[]; total: number }>('/divisions', { page: pageNum, limit: 20 });
      setDivisions(response.data);
      setTotal(response.total);
      tabSessionCache.set<DivisionTabCache>(ORGANIZATION_DIVISIONS_TAB_ID, { divisions: response.data, total: response.total, page: pageNum });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    } finally {
      setLoading(false);
    }
  }, [page, message]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.divisions || cachedMaster.divisions.length === 0) {
      void fetchDivisionsRef(page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_DIVISIONS_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_DIVISIONS_TAB_ID);
        void fetchDivisionsRef(page);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
          fetchDivisionsRef(page);
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
          fetchDivisionsRef(page);
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
          fetchDivisionsRef(page);
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
          fetchDivisionsRef(page);
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

  const columns: ColumnsType<Division> = [
    {
      title: 'Code',
      dataIndex: 'divisionCode',
      key: 'divisionCode',
      sorter: (a, b) => a.divisionCode.localeCompare(b.divisionCode),
      width: 140,
      fixed: 'left',
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Description',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
    },
    {
      title: 'Sections',
      key: 'sections',
      width: 130,
      render: (_, record) => record.sections?.length || 0,
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
      width: 170,
      align: 'center',
      render: (_, record) => (
        <Space size="small" direction="horizontal">
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

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-division',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            + Add Division
          </Button>
        ),
      },
      {
        key: 'refresh-division',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchDivisionsRef(page)}>
            Refresh
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page]);

  const filteredDivisions = divisions.filter((d) => {
    if (searchText && !`${d.divisionCode || ''} ${d.name || ''} ${d.description || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'ALL' && d.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_DIVISIONS_TAB_ID}
      load={async () => { await fetchDivisionsRef(page); }}
      serialize={() => ({ divisions, total, page })}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, padding: '8px 0' }}>Division Management</h2>

        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <Input
            placeholder="Search divisions..."
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
                      disabled={key === 'divisionCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_division_table_columns', JSON.stringify(next));
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

        {loading && filteredDivisions.length === 0 ? (
          <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered divisions..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
        ) : (
          <ERPTable
            columns={visibleColumns}
            dataSource={filteredDivisions}
            rowKey="id"
            loading={false}
            pagination={{
              current: page,
              total: filteredDivisions.length,
              pageSize: 20,
              onChange: setPage,
              showTotal: (totalCount) => `Total ${totalCount} divisions`,
            }}
            emptyText="No divisions found"
          />
        )}

        <DraggableResizableModal
          title={editingDivision ? 'Edit Division' : 'Create Division'}
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
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </DraggableResizableModal>
      </div>
    </TabKeepAlive>
  );
};

export default DivisionManagement;
