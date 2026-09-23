import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { App, Button, Modal, Form, Input, Select, Dropdown, Checkbox, theme, Tag, Space } from 'antd';
import { PlusOutlined, CheckCircleOutlined, CloseCircleOutlined, ShopOutlined, PrinterOutlined, ReloadOutlined, AppstoreOutlined, EditOutlined, DeleteOutlined, DownloadOutlined, FilePdfOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { PageHeader, ERPTable, StatusBadge, GlobalLoading, TabKeepAlive } from '../../components/shared';
import BarcodePrint from '../../components/shared/BarcodePrint';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

interface Company {
  id: string;
  companyCode: string;
  legalName: string;
}

interface Warehouse {
  id: string;
  warehouseCode: string;
  name: string;
  companyId: string;
  company?: Company;
  warehouseType: string;
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

interface PrintModalState {
  visible: boolean;
  warehouse: Warehouse | null;
}

const ORGANIZATION_WAREHOUSES_TAB_ID = '/organization/warehouses';

interface WarehouseTabCache {
  warehouses: Warehouse[];
  companies: Company[];
  total: number;
  page: number;
  filters: { searchText: string; typeFilter?: string; statusFilter?: string };
}

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  warehouseCode: { label: 'Warehouse Code' },
  name: { label: 'Name' },
  company: { label: 'Company' },
  warehouseType: { label: 'Type' },
  city: { label: 'City' },
  country: { label: 'Country' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const WarehouseManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<WarehouseTabCache>(ORGANIZATION_WAREHOUSES_TAB_ID), []);

  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => cachedMaster?.warehouses ?? []);
  const [companies, setCompanies] = useState<Company[]>(() => cachedMaster?.companies ?? []);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.warehouses || cachedMaster.warehouses.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState<string>(() => cachedMaster?.filters?.searchText ?? '');
  const [typeFilter, setTypeFilter] = useState<string | undefined>(() => cachedMaster?.filters?.typeFilter);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(() => cachedMaster?.filters?.statusFilter);
  const [printModal, setPrintModal] = useState<PrintModalState>({
    visible: false,
    warehouse: null,
  });

  // Enterprise column visibility toggle state
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    warehouseCode: true,
    name: true,
    company: true,
    warehouseType: true,
    city: true,
    country: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const warehouseTypes = [
    { value: 'RAW_MATERIAL', label: 'Raw Material' },
    { value: 'WORK_IN_PROGRESS', label: 'Work In Progress' },
    { value: 'FINISHED_GOODS', label: 'Finished Goods' },
    { value: 'GENERAL', label: 'General' },
    { value: 'QUARANTINE', label: 'Quarantine' },
    { value: 'SCRAP', label: 'Scrap' },
  ];

  const fetchWarehousesRef = useRef(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const response = await apiService.get<{ data: Warehouse[]; total: number }>('/warehouses', { page: pageNum, limit: 20 });
      setWarehouses(response.data);
      setTotal(response.total);
      tabSessionCache.set<WarehouseTabCache>(ORGANIZATION_WAREHOUSES_TAB_ID, {
        warehouses: response.data, companies, total: response.total, page: pageNum,
        filters: { searchText, typeFilter, statusFilter },
      });
    } catch (error: any) {
      modal.error({ title: 'Load Failed', content: formatApiError(error, 'Failed to fetch warehouses') });
    } finally {
      setLoading(false);
    }
  });

  const fetchCompanies = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Company[] }>('/companies', { limit: 100 });
      setCompanies(response.data);
      const c = tabSessionCache.get<WarehouseTabCache>(ORGANIZATION_WAREHOUSES_TAB_ID);
      tabSessionCache.set<WarehouseTabCache>(ORGANIZATION_WAREHOUSES_TAB_ID, { warehouses: c?.warehouses ?? [], companies: response.data, total: c?.total ?? 0, page: c?.page ?? 1, filters: c?.filters ?? { searchText: '', typeFilter: undefined, statusFilter: undefined } });
    } catch (error: any) {
      modal.error({ title: 'Load Failed', content: formatApiError(error, 'Failed to fetch companies') });
    }
  }, [modal]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.warehouses || cachedMaster.warehouses.length === 0) void fetchWarehousesRef.current(page);
    if (!cachedMaster || !cachedMaster.companies || cachedMaster.companies.length === 0) void fetchCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_WAREHOUSES_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_WAREHOUSES_TAB_ID);
        void fetchWarehousesRef.current(page);
        void fetchCompanies();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleCreate = () => {
    setEditingWarehouse(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEdit = (record: Warehouse) => {
    setEditingWarehouse(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record: Warehouse) => {
    modal.confirm({
      title: 'Delete Warehouse',
      content: `Are you sure you want to delete warehouse "${record.warehouseCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/warehouses/${record.id}`);
          message.success('Warehouse deleted successfully');
          fetchWarehousesRef.current(page);
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete warehouse'),
          });
        }
      },
    });
  };

  const handleActivate = (record: Warehouse) => {
    modal.confirm({
      title: 'Activate Warehouse',
      content: `Are you sure you want to activate warehouse "${record.warehouseCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouses/${record.id}/activate`);
          message.success('Warehouse activated successfully');
          fetchWarehousesRef.current(page);
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate warehouse'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: Warehouse) => {
    modal.confirm({
      title: 'Deactivate Warehouse',
      content: `Are you sure you want to deactivate warehouse "${record.warehouseCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouses/${record.id}/deactivate`);
          message.success('Warehouse deactivated successfully');
          fetchWarehousesRef.current(page);
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate warehouse'),
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
          if (editingWarehouse) {
            const { companyId: _co, ...editable } = values;
            await apiService.patch(`/warehouses/${editingWarehouse.id}`, editable);
            message.success('Warehouse updated successfully');
          } else {
            await apiService.post('/warehouses', values);
            message.success('Warehouse created successfully');
          }
          setModalVisible(false);
          fetchWarehousesRef.current(page);
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
  const columns: ColumnsType<Warehouse> = [
    {
      title: 'Code',
      dataIndex: 'warehouseCode',
      key: 'warehouseCode',
      width: 140,
      fixed: 'left',
      render: (code: string) => <span style={{ fontWeight: 600 }}>{code}</span>,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Type',
      dataIndex: 'warehouseType',
      key: 'warehouseType',
      width: 160,
      render: (type: string) => {
        const typeObj = warehouseTypes.find((t) => t.value === type);
        return typeObj?.label || type;
      },
    },
    {
      title: 'City',
      dataIndex: 'city',
      key: 'city',
      width: 130,
      render: (c: string) => c || '—',
    },
    {
      title: 'Country',
      dataIndex: 'country',
      key: 'country',
      width: 130,
      render: (c: string) => c || '—',
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
          <Button type="link" size="small" icon={<PrinterOutlined />} onClick={() => setPrintModal({ visible: true, warehouse: record })} title="Print Barcode" />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate" />
          ) : (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate" />
          )}
          <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete" />
        </Space>
      ),
    },
  ];

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-warehouse',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            + Add Warehouse
          </Button>
        ),
      },
      {
        key: 'refresh-warehouse',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchWarehousesRef.current(page)}>
            Refresh
          </Button>
        ),
      },
      {
        key: 'csv-warehouse',
        node: (
          <Button icon={<DownloadOutlined />} onClick={() => message.info('CSV export available soon')}>
            CSV
          </Button>
        ),
      },
      {
        key: 'pdf-warehouse',
        node: (
          <Button icon={<FilePdfOutlined />} onClick={() => message.info('PDF export available soon')}>
            PDF
          </Button>
        ),
      },
      {
        key: 'print-warehouse',
        node: (
          <Button icon={<PrinterOutlined />} onClick={() => message.info('Print functionality available soon')}>
            Print
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page]);

  const filteredWarehouses = warehouses.filter((w) => {
    if (searchText && !`${w.warehouseCode || ''} ${w.name || ''}`.toLowerCase().includes(searchText.toLowerCase())) {
      return false;
    }
    if (typeFilter && w.warehouseType !== typeFilter) {
      return false;
    }
    if (statusFilter && w.status !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_WAREHOUSES_TAB_ID}
      load={async () => { await fetchWarehousesRef.current(page); await fetchCompanies(); }}
      serialize={() => ({ warehouses, companies, total, page, filters: { searchText, typeFilter, statusFilter } })}
    >
      <div>
        <PageHeader
          icon={<ShopOutlined />}
          title="Warehouse Management"
          subtitle={`Manage storage facilities, raw materials, and finished goods locations · ${total} records`}
          showBreadcrumbs
        />

        <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
          <input
            type="text"
            placeholder="Search warehouses..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: `1px solid ${token.colorBorderSecondary}`,
              background: token.colorBgContainer,
              color: token.colorText,
              width: 260,
            }}
          />

          <Select
            placeholder="WAREHOUSE TYPE"
            allowClear
            style={{ width: 180 }}
            value={typeFilter}
            onChange={setTypeFilter}
            popupMatchSelectWidth={false}
          >
            {warehouseTypes.map((type) => (
              <Select.Option key={type.value} value={type.value}>
                {type.label}
              </Select.Option>
            ))}
          </Select>

          <Select
            placeholder="STATUS"
            allowClear
            style={{ width: 150 }}
            value={statusFilter}
            onChange={setStatusFilter}
            popupMatchSelectWidth={false}
          >
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
                      disabled={key === 'warehouseCode' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_warehouse_table_columns', JSON.stringify(next));
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

        {loading && filteredWarehouses.length === 0 ? (
          <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered warehouses..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
        ) : (
          <ERPTable
            columns={visibleColumns}
            dataSource={filteredWarehouses}
            rowKey="id"
            loading={false}
            pagination={{
              current: page,
              total: filteredWarehouses.length,
              pageSize: 20,
              onChange: setPage,
            }}
            emptyText="No warehouses found"
          />
        )}

        <Modal
          title={editingWarehouse ? 'Edit Warehouse' : 'Create Warehouse'}
          open={modalVisible}
          onOk={handleSubmit}
          confirmLoading={submitting}
          onCancel={() => {
            if (!submitting) setModalVisible(false);
          }}
          width={800}
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
              name="warehouseCode"
              label="Warehouse Code"
              rules={[{ required: true, message: 'Please enter warehouse code' }]}
            >
              <Input disabled={!!editingWarehouse} />
            </Form.Item>
            <Form.Item
              name="name"
              label="Name"
              rules={[{ required: true, message: 'Please enter name' }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              name="warehouseType"
              label="Warehouse Type"
              rules={[{ required: true, message: 'Please select warehouse type' }]}
            >
              <Select placeholder="Select warehouse type">
                {warehouseTypes.map((type) => (
                  <Select.Option key={type.value} value={type.value}>
                    {type.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="address" label="Address">
              <Input />
            </Form.Item>
            <Form.Item name="city" label="City">
              <Input />
            </Form.Item>
            <Form.Item name="country" label="Country">
              <Input />
            </Form.Item>
          </Form>
        </Modal>
        <BarcodePrint
          open={printModal.visible}
          onClose={() => setPrintModal({ visible: false, warehouse: null })}
          itemCode={printModal.warehouse?.warehouseCode || ''}
          itemName={printModal.warehouse?.name || ''}
          barcode={printModal.warehouse?.warehouseCode || null}
          companyName="PWI ERP"
        />
      </div>
    </TabKeepAlive>
  );
};

export default WarehouseManagement;