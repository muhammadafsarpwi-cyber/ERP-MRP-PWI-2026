import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Button, Space, Tag, Form, Input, Select, Card, Tree, Dropdown, Checkbox, theme } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckCircleOutlined, CloseCircleOutlined, ApartmentOutlined, ReloadOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { DraggableResizableModal, GlobalLoading, TabKeepAlive, ERPTable } from '../../components/shared';
import { tabSessionCache, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { useHeaderActions } from '../../components/layout/headerActionsStore';

interface Warehouse {
  id: string;
  warehouseCode: string;
  name: string;
}

interface WarehouseLocation {
  id: string;
  locationCode: string;
  name: string;
  warehouseId: string;
  warehouse?: Warehouse;
  parentLocationId?: string;
  parentLocation?: WarehouseLocation;
  children?: WarehouseLocation[];
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
  locationCode: { label: 'Location Code' },
  name: { label: 'Name' },
  warehouse: { label: 'Warehouse' },
  parentLocation: { label: 'Parent Location' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  status: { label: 'Status' },
  actions: { label: 'Actions' },
};

const ORGANIZATION_LOCATIONS_TAB_ID = '/organization/locations';

interface LocationTabCache {
  locations: WarehouseLocation[];
  hierarchy: WarehouseLocation[];
  warehouses: Warehouse[];
  total: number;
  page: number;
  selectedWarehouseId: string | null;
}

const LocationManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const cachedMaster = useMemo(() => tabSessionCache.get<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID), []);
  
  const [locations, setLocations] = useState<WarehouseLocation[]>(() => cachedMaster?.locations ?? []);
  const [hierarchy, setHierarchy] = useState<WarehouseLocation[]>(() => cachedMaster?.hierarchy ?? []);
  const [warehouses, setWarehouses] = useState<Warehouse[]>(() => cachedMaster?.warehouses ?? []);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string | null>(() => cachedMaster?.selectedWarehouseId ?? null);
  const [loading, setLoading] = useState<boolean>(() => !cachedMaster || !cachedMaster.locations || cachedMaster.locations.length === 0);
  const [total, setTotal] = useState<number>(() => cachedMaster?.total ?? 0);
  const [page, setPage] = useState<number>(() => cachedMaster?.page ?? 1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'tree'>(() => cachedMaster ? 'table' : 'table');
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  
  // Enterprise column visibility toggle state
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    locationCode: true,
    name: true,
    warehouse: true,
    parentLocation: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    status: true,
    actions: true,
  });

  const fetchLocationsRef = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: 20 };
      if (selectedWarehouse) {
        params.warehouseId = selectedWarehouse;
      }
      const response = await apiService.get<{ data: WarehouseLocation[]; total: number }>('/warehouse-locations', params);
      setLocations(response.data);
      setTotal(response.total);
      const c = tabSessionCache.get<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID);
      tabSessionCache.set<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID, {
        locations: response.data,
        hierarchy: c?.hierarchy ?? hierarchy,
        warehouses: c?.warehouses ?? warehouses,
        total: response.total,
        page: pageNum,
        selectedWarehouseId: selectedWarehouse,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch locations'));
    } finally {
      setLoading(false);
    }
  }, [selectedWarehouse, page, message, hierarchy, warehouses]);

  const fetchHierarchy = useCallback(async () => {
    if (!selectedWarehouse) return;
    try {
      const response = await apiService.get<{ data: WarehouseLocation[] }>(`/warehouse-locations/hierarchy/${selectedWarehouse}`);
      setHierarchy(response.data);
      const c = tabSessionCache.get<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID);
      tabSessionCache.set<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID, {
        locations: c?.locations ?? locations,
        hierarchy: response.data,
        warehouses: c?.warehouses ?? warehouses,
        total: c?.total ?? total,
        page: c?.page ?? page,
        selectedWarehouseId: selectedWarehouse,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch location hierarchy'));
    }
  }, [selectedWarehouse, message, locations, warehouses, total, page]);

  const fetchWarehouses = useCallback(async () => {
    try {
      const response = await apiService.get<{ data: Warehouse[] }>('/warehouses', { limit: 100 });
      setWarehouses(response.data);
      const c = tabSessionCache.get<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID);
      tabSessionCache.set<LocationTabCache>(ORGANIZATION_LOCATIONS_TAB_ID, {
        locations: c?.locations ?? locations,
        hierarchy: c?.hierarchy ?? hierarchy,
        warehouses: response.data,
        total: c?.total ?? total,
        page: c?.page ?? page,
        selectedWarehouseId: c?.selectedWarehouseId ?? selectedWarehouse,
      });
    } catch (error: any) {
      message.error(formatApiError(error, 'Failed to fetch warehouses'));
    }
  }, [message, locations, hierarchy, total, page, selectedWarehouse]);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.warehouses || cachedMaster.warehouses.length === 0) {
      void fetchWarehouses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cachedMaster || !cachedMaster.locations || cachedMaster.locations.length === 0) {
      void fetchLocationsRef(page);
    }
    if (selectedWarehouse && (!cachedMaster || !cachedMaster.hierarchy || cachedMaster.hierarchy.length === 0)) {
      void fetchHierarchy();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, cachedMaster]);

  useEffect(() => {
    const handleGlobalRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).startsWith(ORGANIZATION_LOCATIONS_TAB_ID)) {
        tabSessionCache.remove(ORGANIZATION_LOCATIONS_TAB_ID);
        void fetchLocationsRef(page);
        void fetchWarehouses();
        if (selectedWarehouse) void fetchHierarchy();
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handleGlobalRefresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, selectedWarehouse]);

  const handleCreate = () => {
    setEditingLocation(null);
    form.resetFields();
    if (selectedWarehouse) {
      form.setFieldValue('warehouseId', selectedWarehouse);
    }
    setModalVisible(true);
    // Ensure TabKeepAlive cache is invalidated so fresh data loads after creation
    tabSessionCache.remove(ORGANIZATION_LOCATIONS_TAB_ID);
  };

  const handleEdit = (record: WarehouseLocation) => {
    setEditingLocation(record);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = (record: WarehouseLocation) => {
    modal.confirm({
      title: 'Delete Location',
      content: `Are you sure you want to delete location "${record.locationCode}"? This action cannot be undone.`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.delete(`/warehouse-locations/${record.id}`);
          message.success('Location deleted successfully');
          fetchLocationsRef(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Delete Failed',
            content: formatApiError(error, 'Failed to delete location'),
          });
        }
      },
    });
  };

  const handleActivate = (record: WarehouseLocation) => {
    modal.confirm({
      title: 'Activate Location',
      content: `Are you sure you want to activate location "${record.locationCode}"?`,
      okText: 'Activate',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouse-locations/${record.id}/activate`);
          message.success('Location activated successfully');
          fetchLocationsRef(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Activation Failed',
            content: formatApiError(error, 'Failed to activate location'),
          });
        }
      },
    });
  };

  const handleDeactivate = (record: WarehouseLocation) => {
    modal.confirm({
      title: 'Deactivate Location',
      content: `Are you sure you want to deactivate location "${record.locationCode}"?`,
      okText: 'Deactivate',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await apiService.patch(`/warehouse-locations/${record.id}/deactivate`);
          message.success('Location deactivated successfully');
          fetchLocationsRef(page);
          fetchHierarchy();
        } catch (error: any) {
          modal.error({
            title: 'Deactivation Failed',
            content: formatApiError(error, 'Failed to deactivate location'),
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

    // Convert camelCase form fields to snake_case, then strip foreign key fields
    // that the backend rejects in raw mutations (it likely expects relations via nested objects or context).
    const payload: any = { ...values };
    if (payload.warehouseId !== undefined) {
      payload.warehouse_id = payload.warehouseId;
      delete payload.warehouseId;
    }
    if (payload.parentLocationId !== undefined) {
      payload.parent_location_id = payload.parentLocationId;
      delete payload.parentLocationId;
    }
    if (payload.locationCode !== undefined) {
      payload.code = payload.locationCode;
      delete payload.locationCode;
    }
    // Strip foreign key columns and nested relation objects that Supabase/PostgREST rejects on direct upsert
    delete payload.warehouse_id;
    delete payload.parent_location_id;
    delete payload.warehouses;
    delete payload.parentLocation;
    // Remove any remaining snake_case keys not expected by the database schema
    delete payload.location_code;

    modal.confirm({
      title: 'Save Confirmation',
      content: 'Are you sure you want to save these changes?',
      okText: 'Save',
      cancelText: 'Cancel',
      onOk: async () => {
        setSubmitting(true);
        try {
          if (editingLocation) {
            // During PATCH/update, the backend locks the code field and rejects it if sent
            delete payload.code;
            await apiService.patch(`/warehouse-locations/${editingLocation.id}`, payload);
            message.success('Location updated successfully');
          } else {
            await apiService.post('/warehouse-locations', payload);
            message.success('Location created successfully');
          }
          setModalVisible(false);
          fetchLocationsRef(page);
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

  const convertToTreeData = (locations: WarehouseLocation[]): any[] => {
    return locations.map((loc) => ({
      key: loc.id,
      title: `${loc.locationCode} - ${loc.name}`,
      children: loc.children ? convertToTreeData(loc.children) : [],
    }));
  };

  const columns: ColumnsType<WarehouseLocation> = [
    {
      title: 'Code',
      dataIndex: 'locationCode',
      key: 'locationCode',
      sorter: (a, b) => a.locationCode.localeCompare(b.locationCode),
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
      title: 'Warehouse',
      key: 'warehouse',
      width: 160,
      render: (_, record) => record.warehouse?.name || '-',
    },
    {
      title: 'Parent Location',
      key: 'parentLocation',
      width: 180,
      render: (_, record) => record.parentLocation?.name || '-',
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
      width: 120,
      render: (_, record) => (
        <Space size="small" direction="horizontal">
          <Button type="link" icon={<EditOutlined />} onClick={() => handleEdit(record)} title="Edit Location" />
          {record.status === 'ACTIVE' ? (
            <Button type="link" danger icon={<CloseCircleOutlined />} onClick={() => handleDeactivate(record)} title="Deactivate Location" />
          ) : (
            <Button type="link" icon={<CheckCircleOutlined />} onClick={() => handleActivate(record)} title="Activate Location" />
          )}
          <Button type="link" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)} title="Delete Location" />
        </Space>
      ),
    },
  ];

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  useEffect(() => {
    setHeaderActions([
      {
        key: 'add-location',
        node: (
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Location
          </Button>
        ),
      },
      {
        key: 'refresh-location',
        node: (
          <Button icon={<ReloadOutlined />} onClick={() => fetchLocationsRef(page)}>
            Refresh
          </Button>
        ),
      },
      {
        key: 'table-view-location',
        node: (
          <Button type={viewMode === 'table' ? 'primary' : 'default'} onClick={() => setViewMode('table')}>
            Table View
          </Button>
        ),
      },
      {
        key: 'tree-view-location',
        node: (
          <Button type={viewMode === 'tree' ? 'primary' : 'default'} icon={<ApartmentOutlined />} onClick={() => setViewMode('tree')}>
            Tree View
          </Button>
        ),
      },
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, handleCreate, page, viewMode, selectedWarehouse]);

  return (
    <TabKeepAlive
      tabId={ORGANIZATION_LOCATIONS_TAB_ID}
      load={async () => { await fetchLocationsRef(page); await fetchWarehouses(); if (selectedWarehouse) await fetchHierarchy(); }}
      serialize={() => ({ locations, hierarchy, warehouses, total, page, selectedWarehouseId: selectedWarehouse })}
    >
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, padding: '8px 0' }}>Warehouse Location Management</h2>

        <Card title="Warehouse Location Management" bodyStyle={{ padding: 0 }}>
          <div className="erp-table-toolbar-grid" style={{ marginBottom: 12, gap: 8, padding: '8px 16px' }}>
            <Select
              placeholder="Select Warehouse"
              style={{ width: 200 }}
              allowClear
              value={selectedWarehouse}
              onChange={(value) => setSelectedWarehouse(value ?? null)}
            >
              {warehouses.map((wh) => (
                <Select.Option key={wh.id} value={wh.id}>
                  {wh.warehouseCode} - {wh.name}
                </Select.Option>
              ))}
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
                        disabled={key === 'locationCode' || key === 'actions'}
                        onChange={(e) => {
                          const next = { ...visibleCols, [key]: e.target.checked };
                          setVisibleCols(next);
                          try {
                            localStorage.setItem('erp_location_table_columns', JSON.stringify(next));
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

          {viewMode === 'table' ? (
            loading && locations.length === 0 ? (
              <GlobalLoading title="Loading Organization Registry..." subtitle="Fetching registered warehouse locations..." badgeText="LIVE DATABASE QUERY" minHeight={400} />
            ) : (
              <ERPTable
                columns={visibleColumns}
                dataSource={locations}
                rowKey="id"
                loading={false}
                pagination={{
                  current: page,
                  total,
                  pageSize: 20,
                  onChange: setPage,
                  showTotal: (totalCount) => `Total ${totalCount} locations`,
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
            title={editingLocation ? 'Edit Location' : 'Create Location'}
            open={modalVisible}
            onOk={handleSubmit}
            confirmLoading={submitting}
            onCancel={() => {
              if (!submitting) setModalVisible(false);
            }}
            width={680}
            height={560}
            minWidth={600}
            minHeight={480}
          >
            <Form form={form} layout="vertical">
              <Form.Item
                name="warehouseId"
                label="Warehouse"
                rules={[{ required: true, message: 'Please select warehouse' }]}
              >
                <Select placeholder="Select warehouse" disabled={!!selectedWarehouse}>
                  {warehouses.map((wh) => (
                    <Select.Option key={wh.id} value={wh.id}>
                      {wh.warehouseCode} - {wh.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="locationCode"
                label="Location Code"
                rules={[{ required: true, message: 'Please enter location code' }]}
              >
                <Input disabled={!!editingLocation} />
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
              <Form.Item name="parentLocationId" label="Parent Location">
                <Select placeholder="Select parent location (optional)" allowClear>
                  {locations.map((loc) => (
                    <Select.Option key={loc.id} value={loc.id}>
                      {loc.locationCode} - {loc.name}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Form>
          </DraggableResizableModal>
        </Card>
      </div>
    </TabKeepAlive>
  );
};

export default LocationManagement;