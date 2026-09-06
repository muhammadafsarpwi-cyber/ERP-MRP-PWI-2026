import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Select, App,
  InputNumber, Switch, Row, Col,
} from 'antd';
import { PlusOutlined, EditOutlined, StopOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableToolbar, TableActions } from '../../components/shared';

const TRACKING_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'SERIAL', label: 'Serial' },
];

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'];

interface InventoryPolicy {
  id: string;
  policyCode: string;
  companyId: string;
  companyName?: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  safetyStock: number;
  leadTimeDays: number;
  preferredLocationId: string;
  preferredLocationName?: string;
  trackingType: string;
  allowNegativeStock: boolean;
  status: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

const statusColorMap: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
};

const InventoryPolicyManagement: React.FC = () => {
  const { message } = App.useApp();
  const [policies, setPolicies] = useState<InventoryPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryPolicy | null>(null);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterTrackingType, setFilterTrackingType] = useState<string | undefined>(undefined);

  const [companies, setCompanies] = useState<DropdownOption[]>([]);
  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [locations, setLocations] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchPolicies = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterStatus) params.status = filterStatus;
      if (filterTrackingType) params.trackingType = filterTrackingType;
      const response = await apiService.get<{ data: InventoryPolicy[]; total: number }>('/inventory/policies', params);
      setPolicies(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch inventory policies');
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, filterStatus, filterTrackingType, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [companyRes, itemRes, warehouseRes, locationRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/companies', { limit: 100 }),
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouse-locations', { limit: 200 }),
      ]);
      setCompanies(Array.isArray(companyRes?.data) ? companyRes.data : []);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
      setLocations(Array.isArray(locationRes?.data) ? locationRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load policy dropdowns';
      message.error(`Unable to load policy options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchPolicies(page);
  }, [page, fetchPolicies]);

  const handleCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({
      minimumStock: 0,
      maximumStock: 0,
      reorderLevel: 0,
      reorderQuantity: 0,
      safetyStock: 0,
      leadTimeDays: 0,
      trackingType: 'NONE',
      allowNegativeStock: false,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: InventoryPolicy) => {
    setEditingItem(record);
    form.setFieldsValue({
      companyId: record.companyId,
      itemId: record.itemId,
      warehouseId: record.warehouseId,
      minimumStock: Number(record.minimumStock),
      maximumStock: Number(record.maximumStock),
      reorderLevel: Number(record.reorderLevel),
      reorderQuantity: Number(record.reorderQuantity),
      safetyStock: Number(record.safetyStock),
      leadTimeDays: Number(record.leadTimeDays),
      preferredLocationId: record.preferredLocationId,
      trackingType: record.trackingType,
      allowNegativeStock: Boolean(record.allowNegativeStock),
    });
    setModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingItem) {
        await apiService.patch(`/inventory/policies/${editingItem.id}`, values);
        message.success('Policy updated');
      } else {
        await apiService.post('/inventory/policies', values);
        message.success('Policy created');
      }
      setModalVisible(false);
      fetchPolicies(page);
    } catch (error) {
      message.error('Operation failed');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/activate`);
      message.success('Policy activated');
      fetchPolicies(page);
    } catch (error) {
      message.error('Failed to activate policy');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/deactivate`);
      message.success('Policy deactivated');
      fetchPolicies(page);
    } catch (error) {
      message.error('Failed to deactivate policy');
    }
  };

  const columns: ColumnsType<InventoryPolicy> = [
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (name) => <span style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{name || '—'}</span>,
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 150,
      render: (wh) => <span>{wh || '—'}</span>,
    },
    {
      title: 'Min Stock',
      dataIndex: 'minimumStock',
      key: 'minimumStock',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(v, 4)}</span>,
    },
    {
      title: 'Max Stock',
      dataIndex: 'maximumStock',
      key: 'maximumStock',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(v, 4)}</span>,
    },
    {
      title: 'Reorder Level',
      dataIndex: 'reorderLevel',
      key: 'reorderLevel',
      width: 110,
      align: 'right' as const,
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, color: 'var(--theme-warning)', fontVariantNumeric: 'tabular-nums' }}>
          {formatNumber(v, 4)}
        </span>
      ),
    },
    {
      title: 'Tracking Type',
      dataIndex: 'trackingType',
      key: 'trackingType',
      width: 120,
      render: (v: string) => TRACKING_TYPES.find(t => t.value === v)?.label || v,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'}>{s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 80,
      fixed: 'right',
      align: 'center' as const,
      render: (_, record) => (
        <TableActions
          actions={[
            {
              key: 'edit',
              label: 'Edit Policy',
              icon: <EditOutlined />,
              onClick: () => handleEdit(record),
            },
            ...(record.status === 'ACTIVE' ? [{
              key: 'deactivate',
              label: 'Deactivate Policy',
              icon: <StopOutlined />,
              danger: true,
              confirm: {
                title: 'Deactivate this policy?',
                description: 'This policy will no longer trigger automatic reorder alerts.',
                onConfirm: () => handleDeactivate(record.id),
              },
            }] : [{
              key: 'activate',
              label: 'Activate Policy',
              icon: <CheckCircleOutlined />,
              confirm: {
                title: 'Activate this policy?',
                onConfirm: () => handleActivate(record.id),
              },
            }]),
          ]}
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--theme-text)' }}>Inventory Policies</h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Manage reorder points, min/max thresholds, safety stocks, and warehouse fulfillment rules
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search policies..."
        searchValue={search}
        onSearchChange={(v: string) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'warehouse',
            placeholder: 'Warehouse',
            value: filterWarehouse,
            options: warehouses.map(w => ({ value: w.id, label: w.name })),
            onChange: (v: any) => { setFilterWarehouse(v as string); setPage(1); },
            width: 170,
          },
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            options: STATUS_OPTIONS.map(s => ({ value: s, label: s })),
            onChange: (v: any) => { setFilterStatus(v as string); setPage(1); },
            width: 130,
          },
          {
            key: 'tracking',
            placeholder: 'Tracking Type',
            value: filterTrackingType,
            options: TRACKING_TYPES,
            onChange: (v: any) => { setFilterTrackingType(v as string); setPage(1); },
            width: 150,
          },
        ]}
        onRefresh={() => fetchPolicies(page)}
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            Add Policy
          </Button>
        }
      />

      <ERPTable
        columns={columns}
        dataSource={policies}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t, r) => `Showing ${r[0]}–${r[1]} of ${t} entries`,
        }}
      />

      <Modal
        title={editingItem ? 'Edit Policy' : 'Create Policy'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={companies.map(c => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="itemId" label="Item" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={items.map(i => ({ value: i.id, label: i.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={warehouses.map(w => ({ value: w.id, label: w.name }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="preferredLocationId" label="Preferred Location">
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={locations.map(l => ({ value: l.id, label: l.name }))}
                  allowClear
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="minimumStock" label="Minimum Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maximumStock" label="Maximum Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderLevel" label="Reorder Level">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderQuantity" label="Reorder Quantity">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safetyStock" label="Safety Stock">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)">
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="trackingType" label="Tracking Type" rules={[{ required: true }]}>
                <Select options={TRACKING_TYPES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="allowNegativeStock" label="Allow Negative Stock" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </div>
  );
};

export default InventoryPolicyManagement;
