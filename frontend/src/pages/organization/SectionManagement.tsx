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
  divisionId: string;
  division?: Division;
  description: string;
  status: string;
  departments?: any[];
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
  sectionCode: { label: 'Section Code' },
  name: { label: 'Name & Type' },
  division: { label: 'Division' },
  description: { label: 'Description' },
  departments: { label: 'Departments' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_SECTIONS_TAB_ID = '/organization/sections';

interface SectionTabCache {
  sections: Section[];
  divisions: Division[];
  total: number;
  page: number;
}

const SectionManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<SectionTabCache>(ORGANIZATION_SECTIONS_TAB_ID), []);

  const [sections, setSections] = useState<Section[]>(() => cachedMaster?.sections ?? []);
  const [divisions, setDivisions] = useState<Division[]>(() => cachedMaster?.divisions ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.sections || cachedMaster.sections.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Enterprise column visibility toggle state
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    sectionCode: true,
    name: true,
    division: true,
    departments: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchSectionsRef = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      const response = await apiService.get<{ data: Section[]; total: number }>('/sections', params);
      setSections(response.data);
      setTotal(response.total);
      const c = tabSessionCache.get<SectionTabCache>(ORGANIZATION_SECTIONS_TAB_ID);
      tabSessionCache.set<SectionTabCache>(ORGANIZATION_SECTIONS_TAB_ID, {
        sections: response.data,
        divisions: c?.divisions ?? divisions,
        total: response.total,
        page: pageNum,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch sections'));
    } finally {
      setLoading(false);
    }
  }, [page, message, divisions]);

  const fetchDivisions = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Division[] }>('/divisions', { limit: 100 });
      setDivisions(response.data);
      const c = tabSessionCache.get<SectionTabCache>(ORGANIZATION_SECTIONS_TAB_ID);
      tabSessionCache.set<SectionTabCache>(ORGANIZATION_SECTIONS_TAB_ID, {
        sections: c?.sections ?? sections,
        divisions: response.data,
        total: c?.total ?? total,
        page: c?.page ?? page,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch divisions'));
    }
  }, [message, sections, total, page]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.sections || cachedMaster.sections.length === 0) {
      void fetchSectionsRef(page);
    }
    if (!cachedMaster || !cachedMaster.divisions || cachedMaster.divisions.length === 0) {
      void fetchDivisions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_SECTIONS_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_SECTIONS_TAB_ID);
        void fetchSectionsRef(page);
        void fetchDivisions();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleCreate = () => {
    setEditingSection(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Section) => {
    setEditingSection(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record: Section) => {
    modal.confirm({
      title: 'Delete Section',
      content: `Are you sure you want to delete section "${record.sectionCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/sections/${record.id}`);
          message.success('Section deleted successfully');
          fetchSectionsRef(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete section'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Section) => {
    modal.confirm({
      title: 'Activate Section',
      content: `Are you sure you want to activate section "${record.sectionCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/sections/${record.id}/activate`);
          message.success('Section activated successfully');
          fetchSectionsRef(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate section'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Section) => {
    modal.confirm({
      title: 'Deactivate Section',
      content: `Are you sure you want to deactivate section "${record.sectionCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/sections/${record.id}/deactivate`);
          message.success('Section deactivated successfully');
          fetchSectionsRef(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate section'),
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
          if (editingSection) {
            const { sectionCode: _sc, ...editable } = values;
            await apiService.patch(`/sections/${editingSection.id}`, editable);
            message.success('Section updated successfully');
          } else {
            await apiService.post('/sections', values);
            message.success('Section created successfully');
          }
          setModalVisible(false);
          fetchSectionsRef(page);
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

  const columns: ColumnsType<Section> = [
    {
      title: 'Code',
      dataIndex: 'sectionCode',
      key: 'sectionCode',
      sorter: (a, b) => a.sectionCode.localeCompare(b.sectionCode),
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
      title: 'Division',
      key: 'division',
      width: 160,
      render: (_, record) => record.division?.name || '-',
    },
    {
      title: 'Departments',
      key: 'departments',
      width: 130,
      render: (_, record) => record.departments?.length || 0,
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
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit Section" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate Section" />
          ) : (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate Section" />
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete Section" />
        </Space>
      ),
    },
  ];

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-section',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            + Add Section
          </Button>
        ),
      },
      {
        key: 'refresh-section',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchSectionsRef(page)}>
            Refresh
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page]);

  const filteredSections = sections.filter((s) => {
    if (searchText && !`${s.sectionCode || ''} ${s.name || ''} ${s.division?.name || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'ALL' && s.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_SECTIONS_TAB_ID}
      load={async () => { await fetchSectionsRef(page); await fetchDivisions(); }}
      serialize={() => ({ sections, divisions, total, page })}
    >
      <div>
        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <Input
            placeholder="Search sections..."
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
                      disabled={key === 'sectionCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_section_table_columns', JSON.stringify(next));
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

        {loading && filteredSections.length === 0 ? (
          <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered sections..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
        ) : (
          <ERPTable
            columns={visibleColumns}
            dataSource={filteredSections}
            rowKey="id"
            loading={false}
            pagination={{
              current: page,
              total: filteredSections.length,
              pageSize: 20,
              onChange: setPage,
              showTotal: (totalCount) => `Total ${totalCount} sections`,
            }}
            emptyText="No sections found"
          />
        )}

        <DraggableResizableModal
          title={editingSection ? 'Edit Section' : 'Create Section'}
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
              <Input.TextArea rows={3} />
            </Form.Item>
          </Form>
        </DraggableResizableModal>
      </div>
    </TabKeepAlive>
  );
};

export default SectionManagement;
