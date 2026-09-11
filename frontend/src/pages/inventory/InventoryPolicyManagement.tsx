import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Tag, Form, Select, App,
  InputNumber, Switch, Row, Col, Card,
  Descriptions, Divider, Spin, Tooltip, Badge, Space, Popconfirm,
} from 'antd';
import {
  PlusOutlined, EditOutlined, CheckCircleOutlined,
  EyeOutlined, FilterOutlined, ClearOutlined,
  WarningOutlined, AlertOutlined, SafetyOutlined, HolderOutlined,
  DeleteOutlined, DatabaseOutlined, PoweroffOutlined, SafetyCertificateOutlined,
  AppstoreOutlined, BarcodeOutlined, BankOutlined,
  ClusterOutlined, ApartmentOutlined, HomeOutlined, EnvironmentOutlined,
  DownCircleOutlined, UpCircleOutlined, ClockCircleOutlined, ScanOutlined,
  LineChartOutlined, ThunderboltOutlined, SettingOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableToolbar, TableActions, DraggableResizableModal } from '../../components/shared';

const TRACKING_TYPES = [
  { value: 'NONE', label: 'None' },
  { value: 'BATCH', label: 'Batch' },
  { value: 'SERIAL', label: 'Serial' },
];

const STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'];

const STOCK_STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  OUT_OF_STOCK: { color: 'red', label: 'Out of Stock', icon: <AlertOutlined /> },
  CRITICAL: { color: 'volcano', label: 'Critical', icon: <WarningOutlined /> },
  REORDER: { color: 'orange', label: 'Reorder', icon: <HolderOutlined /> },
  HEALTHY: { color: 'green', label: 'Healthy', icon: <SafetyOutlined /> },
  OVERSTOCK: { color: 'blue', label: 'Overstock', icon: <HolderOutlined /> },
  NO_DATA: { color: 'default', label: 'No Data', icon: <HolderOutlined /> },
};

interface InventoryPolicy {
  id: string;
  policyCode?: string;
  companyId: string;
  companyName?: string;
  divisionName?: string;
  sectionName?: string;
  departmentName?: string;
  itemId: string;
  itemCode?: string;
  itemFullName?: string;
  itemName?: string;
  warehouseId: string;
  warehouseName?: string;
  preferredLocationId?: string;
  preferredLocationName?: string;
  minimumStock: number;
  maximumStock: number;
  reorderLevel: number;
  reorderQuantity: number;
  safetyStock: number;
  leadTimeDays: number;
  trackingType: string;
  allowNegativeStock: boolean;
  status: string;
  stockOnHand?: number;
  stockReserved?: number;
  stockAvailable?: number;
  stockStatus?: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
  division?: string;
  section?: string;
  department?: string;
}

interface ItemDetail {
  id: string;
  itemCode: string;
  name: string;
  companyId: string;
  company?: { id: string; legalName?: string; tradeName?: string; companyCode?: string };
  division?: { id: string; name: string };
  section?: { id: string; name: string };
  department?: { id: string; name: string };
  baseUom?: { id: string; code: string; name: string };
}

interface PolicySummary {
  totalPolicies: number;
  activePolicies: number;
  inactivePolicies: number;
  criticalPolicies: number;
  reorderPolicies: number;
  outOfStockPolicies: number;
  overstockPolicies: number;
  healthyPolicies: number;
  requiringAttention: number;
}

function formatQty(v: unknown): string {
  return formatNumber(v, 0);
}

function getStockStatusConfig(status?: string): { color: string; label: string; icon: React.ReactNode } {
  return STOCK_STATUS_CONFIG[status || 'NO_DATA'] || STOCK_STATUS_CONFIG.NO_DATA;
}

/* ─── Premium Decorated KPI Summary Card ─────────────────────────── */
interface PolicyKPICardProps {
  title: string;
  value: number;
  subtitle?: string;
  icon: React.ReactNode;
  watermarkIcon: React.ReactNode;
  color: string;
  accentBg: string;
  borderColor: string;
  onClick?: () => void;
  active?: boolean;
}

const PolicyKPICard: React.FC<PolicyKPICardProps> = ({
  title,
  value,
  subtitle,
  icon,
  watermarkIcon,
  color,
  accentBg,
  borderColor,
  onClick,
  active,
}) => (
  <div
    onClick={onClick}
    style={{
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 10,
      padding: '14px 18px',
      background: 'var(--theme-surface, #ffffff)',
      border: `1.5px solid ${active ? color : borderColor}`,
      boxShadow: active
        ? `0 4px 14px ${accentBg}`
        : '0 2px 6px rgba(0, 0, 0, 0.03)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      userSelect: 'none',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-2px)';
      e.currentTarget.style.boxShadow = `0 6px 16px ${accentBg}`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'none';
      e.currentTarget.style.boxShadow = active
        ? `0 4px 14px ${accentBg}`
        : '0 2px 6px rgba(0, 0, 0, 0.03)';
    }}
  >
    {/* Large Background Watermark Icon */}
    <div
      style={{
        position: 'absolute',
        right: -8,
        bottom: -10,
        fontSize: 74,
        color: color,
        opacity: 0.09,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        zIndex: 0,
      }}
    >
      {watermarkIcon}
    </div>

    {/* Metric Details (Left) */}
    <div style={{ position: 'relative', zIndex: 1 }}>
      <div
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: 'var(--theme-text-muted, #64748b)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color: color,
          lineHeight: 1.1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value.toLocaleString()}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11.5, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>

    {/* Front Rounded Icon Badge (Right) */}
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        width: 46,
        height: 46,
        borderRadius: 12,
        background: accentBg,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        color: color,
        boxShadow: '0 2px 5px rgba(0, 0, 0, 0.04)',
      }}
    >
      {icon}
    </div>
  </div>
);

/* ─── Main Component ────────────────────────────────────────────────── */
const InventoryPolicyManagement: React.FC = () => {
  const { message } = App.useApp();

  const [policies, setPolicies] = useState<InventoryPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryPolicy | null>(null);
  const [viewItem, setViewItem] = useState<InventoryPolicy | null>(null);
  const [viewModalVisible, setViewModalVisible] = useState(false);
  const [form] = Form.useForm();

  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState<string | undefined>(undefined);
  const [filterDivision, setFilterDivision] = useState<string | undefined>(undefined);
  const [filterSection, setFilterSection] = useState<string | undefined>(undefined);
  const [filterDepartment, setFilterDepartment] = useState<string | undefined>(undefined);
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterLocation, setFilterLocation] = useState<string | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);
  const [filterTrackingType, setFilterTrackingType] = useState<string | undefined>(undefined);
  const [filterStockStatus, setFilterStockStatus] = useState<string | undefined>(undefined);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const [companies, setCompanies] = useState<DropdownOption[]>([]);
  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [locations, setLocations] = useState<DropdownOption[]>([]);
  const [summary, setSummary] = useState<PolicySummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Item auto-population state
  const [selectedItemDetail, setSelectedItemDetail] = useState<ItemDetail | null>(null);
  const [itemLoading, setItemLoading] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterDivision) count++;
    if (filterSection) count++;
    if (filterDepartment) count++;
    if (filterStockStatus) count++;
    return count;
  }, [filterDivision, filterSection, filterDepartment, filterStockStatus]);

  const divisions = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => {
        if (!i.division || seen.has(i.division)) return false;
        seen.add(i.division);
        return true;
      })
      .map((i) => ({ id: i.division!, name: i.division! }));
  }, [items]);

  const sections = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => {
        if (!i.section || seen.has(i.section)) return false;
        if (filterDivision && i.division !== filterDivision) return false;
        seen.add(i.section);
        return true;
      })
      .map((i) => ({ id: i.section!, name: i.section! }));
  }, [items, filterDivision]);

  const departments = useMemo(() => {
    const seen = new Set<string>();
    return items
      .filter((i) => {
        if (!i.department || seen.has(i.department)) return false;
        if (filterDivision && i.division !== filterDivision) return false;
        if (filterSection && i.section !== filterSection) return false;
        seen.add(i.department);
        return true;
      })
      .map((i) => ({ id: i.department!, name: i.department! }));
  }, [items, filterDivision, filterSection]);


  const fetchPolicies = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterCompany) params.companyId = filterCompany;
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterLocation) params.locationId = filterLocation;
      if (filterStatus) params.status = filterStatus;
      if (filterTrackingType) params.trackingType = filterTrackingType;
      if (filterDivision) params.division = filterDivision;
      if (filterSection) params.section = filterSection;
      if (filterDepartment) params.department = filterDepartment;
      if (filterStockStatus) params.stockStatus = filterStockStatus;
      const response = await apiService.get<{ data: InventoryPolicy[]; total: number }>(
        '/inventory/policies',
        params as unknown as Record<string, string>,
      );
      setPolicies(response.data);
      setTotal(response.total);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Failed to fetch inventory policies';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setLoading(false);
    }
  }, [search, filterCompany, filterWarehouse, filterLocation, filterStatus, filterTrackingType, filterDivision, filterSection, filterDepartment, filterStockStatus, pageSize, message]);

  const filteredPolicies = useMemo(() => {
    return policies.filter((p) => {
      if (filterDivision && p.divisionName !== filterDivision) return false;
      if (filterSection && p.sectionName !== filterSection) return false;
      if (filterDepartment && p.departmentName !== filterDepartment) return false;
      if (filterWarehouse && p.warehouseId !== filterWarehouse) return false;
      if (filterLocation && p.preferredLocationId !== filterLocation) return false;
      if (filterStockStatus && p.stockStatus !== filterStockStatus) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterTrackingType && p.trackingType !== filterTrackingType) return false;
      return true;
    });
  }, [policies, filterDivision, filterSection, filterDepartment, filterWarehouse, filterLocation, filterStockStatus, filterStatus, filterTrackingType]);

  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterCompany) params.companyId = filterCompany;
      const response = await apiService.get<{ data: PolicySummary }>('/inventory/policies/summary', params as unknown as Record<string, string>);
      setSummary(response.data);
    } catch (error: unknown) {
      console.error('Failed to fetch summary:', error);
    } finally {
      setSummaryLoading(false);
    }
  }, [filterCompany]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [companyRes, itemRes, warehouseRes, locationRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/companies', { limit: '100' } as unknown as Record<string, string>),
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: '500' } as unknown as Record<string, string>),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: '100' } as unknown as Record<string, string>),
        apiService.get<{ data: DropdownOption[] }>('/warehouse-locations', { limit: '500' } as unknown as Record<string, string>),
      ]);
      setCompanies(Array.isArray(companyRes?.data) ? companyRes.data.map((c: any) => ({ id: c.id, name: c.legalName || c.tradeName || c.companyCode || 'Unknown' })) : []);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data.map((i: any) => ({ id: i.id, name: i.name || 'Unknown', code: i.itemCode, division: i.division?.name || i.divisionName, section: i.section?.name || i.sectionName, department: i.department?.name || i.departmentName })) : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data.map((w: any) => ({ id: w.id, name: w.name || w.warehouseCode || 'Unknown' })) : []);
      setLocations(Array.isArray(locationRes?.data) ? locationRes.data.map((l: any) => ({ id: l.id, name: l.name || l.locationCode || 'Unknown' })) : []);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Failed to load policy dropdowns';
      message.error(`Unable to load policy options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
    fetchSummary();
  }, [fetchDropdowns, fetchSummary]);

  useEffect(() => {
    fetchPolicies(page);
  }, [page, fetchPolicies]);

  useEffect(() => {
    fetchSummary();
  }, [filterCompany, fetchSummary]);

  useEffect(() => {
    setPage(1);
  }, [search, filterCompany, filterDivision, filterSection, filterDepartment, filterWarehouse, filterLocation, filterStatus, filterTrackingType, filterStockStatus]);

  /* ─── Item auto-population ───────────────────────────────────────── */
  const fetchItemDetail = useCallback(async (itemId: string) => {
    setItemLoading(true);
    try {
      const res = await apiService.get<{ data: ItemDetail }>(`/master-data/items/${itemId}`);
      const item = res.data;
      setSelectedItemDetail(item);
      const updates: Record<string, any> = {};
      if (item.companyId) updates.companyId = item.companyId;
      form.setFieldsValue(updates);
    } catch {
      setSelectedItemDetail(null);
    } finally {
      setItemLoading(false);
    }
  }, [form]);

  const handleItemChange = useCallback((itemId: string) => {
    if (itemId) {
      fetchItemDetail(itemId);
    } else {
      setSelectedItemDetail(null);
    }
  }, [fetchItemDetail]);

  /* ─── Create / Edit handlers ─────────────────────────────────────── */
  const handleCreate = () => {
    setEditingItem(null);
    setSelectedItemDetail(null);
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
      status: 'ACTIVE',
    });
    setModalVisible(true);
  };

  const handleEdit = (record: InventoryPolicy) => {
    setEditingItem(record);
    setSelectedItemDetail(null);
    form.setFieldsValue({
      companyId: record.companyId,
      itemId: record.itemId,
      warehouseId: record.warehouseId,
      preferredLocationId: record.preferredLocationId,
      minimumStock: Number(record.minimumStock),
      maximumStock: Number(record.maximumStock),
      reorderLevel: Number(record.reorderLevel),
      reorderQuantity: Number(record.reorderQuantity),
      safetyStock: Number(record.safetyStock),
      leadTimeDays: Number(record.leadTimeDays),
      trackingType: record.trackingType,
      allowNegativeStock: Boolean(record.allowNegativeStock),
      status: record.status,
    });
    // Fetch item detail for display in edit mode
    if (record.itemId) fetchItemDetail(record.itemId);
    setModalVisible(true);
  };

  const handleView = (record: InventoryPolicy) => {
    setViewItem(record);
    setViewModalVisible(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // Separate form validation errors from API errors
      if (editingItem) {
        // Only send fields that exist in UpdateInventoryPolicyDto
        const payload: Record<string, any> = {
          companyId: values.companyId,
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          minimumStock: values.minimumStock !== undefined && values.minimumStock !== null ? Number(values.minimumStock) : 0,
          maximumStock: values.maximumStock !== undefined && values.maximumStock !== null ? Number(values.maximumStock) : 0,
          reorderLevel: values.reorderLevel !== undefined && values.reorderLevel !== null ? Number(values.reorderLevel) : 0,
          reorderQuantity: values.reorderQuantity !== undefined && values.reorderQuantity !== null ? Number(values.reorderQuantity) : 0,
          safetyStock: values.safetyStock !== undefined && values.safetyStock !== null ? Number(values.safetyStock) : 0,
          leadTimeDays: values.leadTimeDays !== undefined && values.leadTimeDays !== null ? Number(values.leadTimeDays) : 0,
          trackingType: values.trackingType || 'NONE',
          allowNegativeStock: Boolean(values.allowNegativeStock),
          status: values.status || 'ACTIVE',
        };
        if (values.preferredLocationId !== undefined) {
          payload.preferredLocationId = values.preferredLocationId || null;
        }
        await apiService.patch(`/inventory/policies/${editingItem.id}`, payload);
        message.success('Policy updated successfully');
      } else {
        const createPayload: Record<string, any> = {
          companyId: values.companyId,
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          minimumStock: Number(values.minimumStock ?? 0),
          maximumStock: Number(values.maximumStock ?? 0),
          reorderLevel: Number(values.reorderLevel ?? 0),
          reorderQuantity: Number(values.reorderQuantity ?? 0),
          safetyStock: Number(values.safetyStock ?? 0),
          leadTimeDays: Number(values.leadTimeDays ?? 0),
          trackingType: values.trackingType || 'NONE',
          allowNegativeStock: Boolean(values.allowNegativeStock),
          status: values.status || 'ACTIVE',
        };
        if (values.preferredLocationId) createPayload.preferredLocationId = values.preferredLocationId;
        await apiService.post('/inventory/policies', createPayload);
        message.success('Policy created successfully');
      }
      setModalVisible(false);
      fetchPolicies(page);
      fetchSummary();
    } catch (error: unknown) {
      // Form validation errors have `errorFields` — don't show as API error
      if (error && typeof error === 'object' && 'errorFields' in error) return;
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const backendMsg = err?.response?.data?.message;
      const displayMsg = Array.isArray(backendMsg) ? backendMsg[0] : (backendMsg || err?.message || 'Operation failed');
      // Only show if it's not "Network Error" from axios (real network failure)
      if (displayMsg && displayMsg !== 'Network Error') {
        message.error(displayMsg);
      } else if (displayMsg === 'Network Error') {
        message.error('Unable to reach the server. Please check your connection and try again.');
      }
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/activate`);
      message.success('Policy activated successfully');
      fetchPolicies(page);
      fetchSummary();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Failed to activate policy';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await apiService.patch(`/inventory/policies/${id}/deactivate`);
      message.success('Policy deactivated successfully');
      fetchPolicies(page);
      fetchSummary();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Failed to deactivate policy';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiService.delete(`/inventory/policies/${id}`);
      message.success('Policy deleted successfully');
      fetchPolicies(page);
      fetchSummary();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string | string[] } }; message?: string };
      const msg = err?.response?.data?.message || err?.message || 'Failed to delete policy';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    }
  };

  const resetFilters = () => {
    setFilterCompany(undefined);
    setFilterDivision(undefined);
    setFilterSection(undefined);
    setFilterDepartment(undefined);
    setFilterWarehouse(undefined);
    setFilterLocation(undefined);
    setFilterStatus(undefined);
    setFilterTrackingType(undefined);
    setFilterStockStatus(undefined);
    setSearch('');
  };

  /* ─── Table Columns ──────────────────────────────────────────────── */
  const columns: ColumnsType<InventoryPolicy> = [
    {
      title: (
        <Space size={6}>
          <BarcodeOutlined style={{ color: '#1677ff' }} />
          <span>Item</span>
        </Space>
      ),
      key: 'item',
      width: 220,
      fixed: 'left' as const,
      className: 'ant-table-cell-fix-left ant-table-cell-fix-left-last',
      onHeaderCell: () => ({
        style: {
          position: 'sticky',
          left: 0,
          zIndex: 6,
        },
      }),
      onCell: () => ({
        style: {
          position: 'sticky',
          left: 0,
          zIndex: 3,
        },
      }),
      render: (_: unknown, record: InventoryPolicy) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--theme-text)', fontSize: 13 }}>
            {record.itemCode || '—'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', lineHeight: '1.3' }}>
            {record.itemFullName || record.itemName || '—'}
          </div>
        </div>
      ),
    },
    {
      title: (
        <Space size={6}>
          <BankOutlined style={{ color: '#722ed1' }} />
          <span>Company</span>
        </Space>
      ),
      dataIndex: 'companyName',
      key: 'companyName',
      width: 150,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <AppstoreOutlined style={{ color: '#13c2c2' }} />
          <span>Division</span>
        </Space>
      ),
      dataIndex: 'divisionName',
      key: 'divisionName',
      width: 130,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <ClusterOutlined style={{ color: '#eb2f96' }} />
          <span>Section</span>
        </Space>
      ),
      dataIndex: 'sectionName',
      key: 'sectionName',
      width: 130,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <ApartmentOutlined style={{ color: '#fa8c16' }} />
          <span>Department</span>
        </Space>
      ),
      dataIndex: 'departmentName',
      key: 'departmentName',
      width: 130,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <HomeOutlined style={{ color: '#52c41a' }} />
          <span>Warehouse</span>
        </Space>
      ),
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 140,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <EnvironmentOutlined style={{ color: '#faad14' }} />
          <span>Location</span>
        </Space>
      ),
      dataIndex: 'preferredLocationName',
      key: 'preferredLocationName',
      width: 130,
      render: (v: string) => <span>{v || '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <DatabaseOutlined style={{ color: '#1677ff' }} />
          <span>Stock On Hand</span>
        </Space>
      ),
      dataIndex: 'stockOnHand',
      key: 'stockOnHand',
      width: 140,
      align: 'right' as const,
      render: (v: unknown) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 10px',
            borderRadius: 6,
            background: 'rgba(22, 119, 255, 0.08)',
            color: '#0958d9',
            border: '1px solid rgba(22, 119, 255, 0.22)',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {formatQty(v)}
        </span>
      ),
    },
    {
      title: (
        <Space size={6}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>Available</span>
        </Space>
      ),
      dataIndex: 'stockAvailable',
      key: 'stockAvailable',
      width: 125,
      align: 'right' as const,
      render: (v: unknown, record: InventoryPolicy) => {
        const isOut = record.stockStatus === 'OUT_OF_STOCK' || Number(v) <= 0;
        const isCrit = record.stockStatus === 'CRITICAL';
        const isHealthy = record.stockStatus === 'HEALTHY';
        const bg = isOut ? 'rgba(255, 77, 79, 0.08)' : isCrit ? 'rgba(250, 140, 22, 0.08)' : isHealthy ? 'rgba(82, 196, 26, 0.08)' : 'rgba(15, 23, 42, 0.04)';
        const color = isOut ? '#cf1322' : isCrit ? '#d46b08' : isHealthy ? '#389e0d' : 'var(--theme-text)';
        const border = isOut ? 'rgba(255, 77, 79, 0.25)' : isCrit ? 'rgba(250, 140, 22, 0.25)' : isHealthy ? 'rgba(82, 196, 26, 0.25)' : 'var(--theme-border)';
        return (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 10px',
              borderRadius: 6,
              background: bg,
              color: color,
              border: `1px solid ${border}`,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              fontSize: 12,
            }}
          >
            {formatQty(v)}
          </span>
        );
      },
    },
    {
      title: (
        <Space size={6}>
          <DownCircleOutlined style={{ color: '#fa8c16' }} />
          <span>Min Stock</span>
        </Space>
      ),
      dataIndex: 'minimumStock',
      key: 'minimumStock',
      width: 120,
      align: 'right' as const,
      render: (v: unknown) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(250, 140, 22, 0.08)',
            color: '#d46b08',
            border: '1px solid rgba(250, 140, 22, 0.25)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {formatQty(v)}
        </span>
      ),
    },
    {
      title: (
        <Space size={6}>
          <WarningOutlined style={{ color: '#d48806' }} />
          <span>Reorder Level</span>
        </Space>
      ),
      dataIndex: 'reorderLevel',
      key: 'reorderLevel',
      width: 130,
      align: 'right' as const,
      render: (v: unknown) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(250, 173, 20, 0.1)',
            color: '#d48806',
            border: '1px solid rgba(250, 173, 20, 0.3)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {formatQty(v)}
        </span>
      ),
    },
    {
      title: (
        <Space size={6}>
          <UpCircleOutlined style={{ color: '#722ed1' }} />
          <span>Max Stock</span>
        </Space>
      ),
      dataIndex: 'maximumStock',
      key: 'maximumStock',
      width: 120,
      align: 'right' as const,
      render: (v: unknown) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(114, 46, 209, 0.08)',
            color: '#722ed1',
            border: '1px solid rgba(114, 46, 209, 0.25)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {formatQty(v)}
        </span>
      ),
    },
    {
      title: (
        <Space size={6}>
          <SafetyCertificateOutlined style={{ color: '#08979c' }} />
          <span>Safety Stock</span>
        </Space>
      ),
      dataIndex: 'safetyStock',
      key: 'safetyStock',
      width: 125,
      align: 'right' as const,
      render: (v: unknown) => (
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(19, 194, 194, 0.08)',
            color: '#08979c',
            border: '1px solid rgba(19, 194, 194, 0.25)',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            fontSize: 12,
          }}
        >
          {formatQty(v)}
        </span>
      ),
    },
    {
      title: (
        <Space size={6}>
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <span>Lead Time</span>
        </Space>
      ),
      dataIndex: 'leadTimeDays',
      key: 'leadTimeDays',
      width: 115,
      align: 'right' as const,
      render: (v: number) => <span>{v ? `${v} days` : '—'}</span>,
    },
    {
      title: (
        <Space size={6}>
          <ScanOutlined style={{ color: '#1890ff' }} />
          <span>Tracking</span>
        </Space>
      ),
      dataIndex: 'trackingType',
      key: 'trackingType',
      width: 110,
      render: (v: string) => {
        const label = TRACKING_TYPES.find((t) => t.value === v)?.label || v;
        return v === 'NONE' ? <Tag>{label}</Tag> : <Tag color="blue">{label}</Tag>;
      },
    },
    {
      title: (
        <Space size={6}>
          <LineChartOutlined style={{ color: '#eb2f96' }} />
          <span>Stock Status</span>
        </Space>
      ),
      dataIndex: 'stockStatus',
      key: 'stockStatus',
      width: 135,
      render: (v: string) => {
        const cfg = getStockStatusConfig(v);
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>;
      },
    },
    {
      title: (
        <Space size={6}>
          <ThunderboltOutlined style={{ color: '#52c41a' }} />
          <span>Status</span>
        </Space>
      ),
      dataIndex: 'status',
      key: 'status',
      width: 105,
      render: (s: string) => <Tag color={s === 'ACTIVE' ? 'green' : 'red'}>{s}</Tag>,
    },
    {
      title: (
        <Space size={6}>
          <SettingOutlined style={{ color: '#595959' }} />
          <span>Actions</span>
        </Space>
      ),
      key: 'actions',
      width: 160,
      fixed: 'right' as const,
      align: 'center' as const,
      className: 'ant-table-cell-fix-right ant-table-cell-fix-right-first',
      onHeaderCell: () => ({
        style: {
          position: 'sticky',
          right: 0,
          zIndex: 6,
        },
      }),
      onCell: () => ({
        style: {
          position: 'sticky',
          right: 0,
          zIndex: 3,
        },
      }),
      render: (_: unknown, record: InventoryPolicy) => (
        <TableActions
          actions={[
            {
              key: 'view',
              label: 'View Policy Details',
              icon: <EyeOutlined />,
              className: 'erp-action-btn erp-action-btn--view',
              onClick: () => handleView(record),
            },
            {
              key: 'edit',
              label: 'Edit Policy',
              icon: <EditOutlined />,
              className: 'erp-action-btn erp-action-btn--edit',
              onClick: () => handleEdit(record),
            },
            ...(record.status === 'ACTIVE'
              ? [{
                  key: 'deactivate',
                  label: 'Deactivate Policy',
                  icon: <PoweroffOutlined />,
                  className: 'erp-action-btn erp-action-btn--deactivate',
                  confirm: {
                    title: 'Deactivate this policy?',
                    description: 'This policy will no longer trigger automatic reorder alerts.',
                    onConfirm: () => handleDeactivate(record.id),
                  },
                }]
              : [{
                  key: 'activate',
                  label: 'Activate Policy',
                  icon: <CheckCircleOutlined />,
                  className: 'erp-action-btn erp-action-btn--activate',
                  confirm: {
                    title: 'Activate this policy?',
                    onConfirm: () => handleActivate(record.id),
                  },
                }]),
            {
              key: 'delete',
              label: 'Delete Policy',
              icon: <DeleteOutlined />,
              danger: true,
              className: 'erp-action-btn erp-action-btn--delete',
              confirm: {
                title: 'Delete this inventory policy?',
                description: `Are you sure you want to permanently delete policy for ${record.itemCode || 'this item'}?`,
                onConfirm: () => handleDelete(record.id),
              },
            },
          ]}
        />
      ),
    },
  ];

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: 'var(--theme-text)' }}>
          Inventory Policies
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Manage reorder points, min/max thresholds, safety stocks, and warehouse fulfillment rules
        </span>
      </div>

      {/* Summary Cards */}
      <Spin spinning={summaryLoading}>
        <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
          <Col xs={24} sm={12} lg={6}>
            <PolicyKPICard
              title="Total Policies"
              value={summary?.totalPolicies ?? 0}
              subtitle="All registered item policies"
              icon={<DatabaseOutlined />}
              watermarkIcon={<DatabaseOutlined />}
              color="#1677ff"
              accentBg="rgba(22, 119, 255, 0.08)"
              borderColor="rgba(22, 119, 255, 0.22)"
              onClick={() => { setFilterStatus(undefined); setFilterStockStatus(undefined); }}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <PolicyKPICard
              title="Active Policies"
              value={summary?.activePolicies ?? 0}
              subtitle={`${summary?.inactivePolicies ?? 0} Inactive / Suspended`}
              icon={<CheckCircleOutlined />}
              watermarkIcon={<CheckCircleOutlined />}
              color="#52c41a"
              accentBg="rgba(82, 196, 26, 0.08)"
              borderColor="rgba(82, 196, 26, 0.22)"
              onClick={() => setFilterStatus('ACTIVE')}
              active={filterStatus === 'ACTIVE'}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <PolicyKPICard
              title="Reorder Required"
              value={summary?.reorderPolicies ?? (summary?.requiringAttention ?? 0)}
              subtitle={`${summary?.requiringAttention ?? 0} total attention needed`}
              icon={<WarningOutlined />}
              watermarkIcon={<WarningOutlined />}
              color="#fa8c16"
              accentBg="rgba(250, 140, 22, 0.08)"
              borderColor="rgba(250, 140, 22, 0.22)"
              onClick={() => setFilterStockStatus('REORDER')}
              active={filterStockStatus === 'REORDER'}
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <PolicyKPICard
              title="Critical / Out of Stock"
              value={(summary?.criticalPolicies ?? 0) + (summary?.outOfStockPolicies ?? 0)}
              subtitle={`${summary?.outOfStockPolicies ?? 0} Out of Stock, ${summary?.criticalPolicies ?? 0} Critical`}
              icon={<AlertOutlined />}
              watermarkIcon={<AlertOutlined />}
              color="#ff4d4f"
              accentBg="rgba(255, 77, 79, 0.08)"
              borderColor="rgba(255, 77, 79, 0.22)"
              onClick={() => setFilterStockStatus('CRITICAL')}
              active={filterStockStatus === 'CRITICAL' || filterStockStatus === 'OUT_OF_STOCK'}
            />
          </Col>
        </Row>
      </Spin>

      {/* Toolbar */}
      <TableToolbar
        searchPlaceholder="Search policies..."
        searchValue={search}
        onSearchChange={(v: string) => { setSearch(v); }}
        onRefresh={() => { fetchPolicies(page); fetchSummary(); }}
        left={
          <Space>
            <Tooltip title={filterPanelOpen ? 'Hide Filters' : 'Show Filters'}>
              <Badge count={activeFilterCount} size="small" offset={[-2, 2]}>
                <Button
                  icon={<FilterOutlined />}
                  onClick={() => setFilterPanelOpen(!filterPanelOpen)}
                  type={filterPanelOpen ? 'primary' : 'default'}
                >
                  Filters
                </Button>
              </Badge>
            </Tooltip>
          </Space>
        }
        actions={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>Add Policy</Button>}
      />

      {/* Filter Panel — Opens downwards directly below toolbar in a single clean line */}
      {filterPanelOpen && (
        <Card
          size="small"
          style={{
            marginBottom: 14,
            borderRadius: 8,
            background: 'var(--theme-surface, #ffffff)',
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}
          styles={{ body: { padding: '12px 14px' } }}
        >
          <Row gutter={[12, 12]} align="bottom">
            <Col xs={24} sm={12} md={5}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Division</div>
              <Select
                placeholder="All Divisions"
                value={filterDivision}
                onChange={(v) => { setFilterDivision(v); setFilterSection(undefined); setFilterDepartment(undefined); }}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Section</div>
              <Select
                placeholder="All Sections"
                value={filterSection}
                onChange={(v) => { setFilterSection(v); setFilterDepartment(undefined); }}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={sections.map((s) => ({ value: s.id, label: s.name }))}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Department</div>
              <Select
                placeholder="All Departments"
                value={filterDepartment}
                onChange={setFilterDepartment}
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: '100%' }}
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
              />
            </Col>
            <Col xs={24} sm={12} md={4}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-muted)', marginBottom: 4 }}>Stock Status</div>
              <Select
                placeholder="All Stock Statuses"
                value={filterStockStatus}
                onChange={setFilterStockStatus}
                allowClear
                style={{ width: '100%' }}
                options={Object.entries(STOCK_STATUS_CONFIG).map(([key, cfg]) => ({ value: key, label: cfg.label }))}
              />
            </Col>
            <Col xs={24} sm={12} md={5}>
              <Space style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => fetchPolicies(1)}
                  loading={loading}
                  style={{ flex: 1 }}
                >
                  Apply
                </Button>
                <Button
                  icon={<ClearOutlined />}
                  onClick={resetFilters}
                  disabled={activeFilterCount === 0 && !search}
                  style={{ flex: 1 }}
                >
                  Reset
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      )}

      {/* Table */}
      <ERPTable
        columns={columns}
        dataSource={filteredPolicies}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1800 }}
        pagination={{
          current: page,
          total: activeFilterCount > 0 ? filteredPolicies.length : total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (t, r) => `Showing ${r[0]}–${r[1]} of ${t} entries`,
        }}
      />

      {/* Create/Edit Modal — Draggable & Resizable */}
      <DraggableResizableModal
        open={modalVisible}
        onCancel={() => { setModalVisible(false); setSelectedItemDetail(null); }}
        maskClosable={false}
        width={860}
        height={620}
        destroyOnHidden
        title={
          <Space>
            {editingItem ? <EditOutlined /> : <PlusOutlined />}
            <span style={{ fontWeight: 600 }}>{editingItem ? 'Edit Policy' : 'Create Policy'}</span>
            {selectedItemDetail && (
              <Tag color="blue" style={{ marginLeft: 8 }}>
                {selectedItemDetail.itemCode} — {selectedItemDetail.name}
              </Tag>
            )}
          </Space>
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {editingItem && (
                <Popconfirm
                  title="Delete this inventory policy?"
                  description={`Are you sure you want to permanently delete policy for ${editingItem.itemCode || 'this item'}?`}
                  onConfirm={() => {
                    const id = editingItem.id;
                    setModalVisible(false);
                    handleDelete(id);
                  }}
                  okText="Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Delete Policy
                  </Button>
                </Popconfirm>
              )}
            </div>
            <Space>
              <Button onClick={() => { setModalVisible(false); setSelectedItemDetail(null); }}>
                Cancel
              </Button>
              <Button type="primary" onClick={handleSubmit}>
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical" style={{ maxHeight: 'calc(80vh - 160px)', overflowY: 'auto', paddingRight: 6 }}>
          {/* Auto-populated Item Info */}
          {selectedItemDetail && (
            <>
              <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600, marginTop: 0, color: 'var(--theme-primary)' }}>
                Auto-populated from Item Master
              </Divider>
              <Row gutter={16}>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Item Code</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.itemCode}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Item Name</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.name}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>UOM</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.baseUom?.code || '—'}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Company</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.company?.legalName || selectedItemDetail.company?.tradeName || '—'}</div>
                </Col>
              </Row>
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Division</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.division?.name || '—'}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Section</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.section?.name || '—'}</div>
                </Col>
                <Col span={6}>
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>Department</div>
                  <div style={{ fontWeight: 600 }}>{selectedItemDetail.department?.name || '—'}</div>
                </Col>
              </Row>
            </>
          )}

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600, marginTop: selectedItemDetail ? 16 : 0 }}>
            Organization
          </Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="companyId" label="Company" rules={[{ required: true, message: 'Please select a company' }]}>
                <Select
                  placeholder="Select company"
                  showSearch
                  optionFilterProp="label"
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  notFoundContent="Loading companies..."
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="itemId" label="Item" rules={[{ required: true, message: 'Please select an item' }]}>
                <Select
                  placeholder={itemLoading ? 'Loading item details...' : 'Select item'}
                  showSearch
                  optionFilterProp="label"
                  loading={itemLoading}
                  onChange={handleItemChange}
                  options={items.map((i) => ({ value: i.id, label: i.code ? `${i.code} — ${i.name}` : i.name }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Location</Divider>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: 'Please select a warehouse' }]}>
                <Select placeholder="Select warehouse" showSearch optionFilterProp="label" options={warehouses.map((w) => ({ value: w.id, label: w.name }))} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="preferredLocationId" label="Preferred Location">
                <Select placeholder="Select preferred location" showSearch optionFilterProp="label" options={locations.map((l) => ({ value: l.id, label: l.name }))} allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Stock Policy</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="minimumStock" label="Minimum Stock"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="maximumStock" label="Maximum Stock"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="reorderLevel" label="Reorder Level"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="reorderQuantity" label="Reorder Quantity"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="safetyStock" label="Safety Stock"><InputNumber min={0} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="leadTimeDays" label="Lead Time (Days)"><InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" /></Form.Item>
            </Col>
          </Row>

          <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Tracking &amp; Control</Divider>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="trackingType" label="Tracking Type" rules={[{ required: true, message: 'Please select a tracking type' }]}>
                <Select options={TRACKING_TYPES} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="allowNegativeStock" label="Allow Negative Stock" valuePropName="checked"><Switch /></Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="status" label="Status">
                <Select options={STATUS_OPTIONS.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </DraggableResizableModal>

      {/* View Detail Modal — Draggable & Resizable */}
      <DraggableResizableModal
        open={viewModalVisible}
        onCancel={() => setViewModalVisible(false)}
        maskClosable={false}
        width={700}
        height={560}
        destroyOnHidden
        title={<Space><EyeOutlined /><span>Policy Details</span></Space>}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              {viewItem && (
                <Popconfirm
                  title="Delete this inventory policy?"
                  description={`Are you sure you want to permanently delete policy for ${viewItem.itemCode || 'this item'}?`}
                  onConfirm={() => {
                    const id = viewItem.id;
                    setViewModalVisible(false);
                    handleDelete(id);
                  }}
                  okText="Delete"
                  cancelText="Cancel"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Delete Policy
                  </Button>
                </Popconfirm>
              )}
            </div>
            <Space>
              <Button onClick={() => setViewModalVisible(false)}>Close</Button>
              {viewItem && (
                <Button type="primary" icon={<EditOutlined />} onClick={() => { setViewModalVisible(false); handleEdit(viewItem); }}>Edit</Button>
              )}
            </Space>
          </div>
        }
      >
        {viewItem && (
          <div>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Item Code"><span style={{ fontWeight: 600 }}>{viewItem.itemCode || '—'}</span></Descriptions.Item>
              <Descriptions.Item label="Item Name">{viewItem.itemFullName || viewItem.itemName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Company">{viewItem.companyName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Division">{viewItem.divisionName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Section">{viewItem.sectionName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Department">{viewItem.departmentName || '—'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600, marginTop: 0 }}>Location</Divider>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Warehouse">{viewItem.warehouseName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Preferred Location">{viewItem.preferredLocationName || '—'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Stock Thresholds</Divider>
            <Descriptions bordered column={3} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Minimum Stock"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.minimumStock)}</span></Descriptions.Item>
              <Descriptions.Item label="Maximum Stock"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.maximumStock)}</span></Descriptions.Item>
              <Descriptions.Item label="Reorder Level"><span style={{ fontWeight: 600, color: 'var(--theme-warning)', fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.reorderLevel)}</span></Descriptions.Item>
              <Descriptions.Item label="Reorder Quantity"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.reorderQuantity)}</span></Descriptions.Item>
              <Descriptions.Item label="Safety Stock"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.safetyStock)}</span></Descriptions.Item>
              <Descriptions.Item label="Lead Time">{viewItem.leadTimeDays ? `${viewItem.leadTimeDays} days` : '—'}</Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Current Inventory Snapshot</Divider>
            <Descriptions bordered column={2} size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Stock On Hand"><span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.stockOnHand)}</span></Descriptions.Item>
              <Descriptions.Item label="Stock Reserved"><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatQty(viewItem.stockReserved)}</span></Descriptions.Item>
              <Descriptions.Item label="Stock Available">
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: viewItem.stockStatus === 'OUT_OF_STOCK' || viewItem.stockStatus === 'CRITICAL' ? 'var(--theme-danger)' : viewItem.stockStatus === 'HEALTHY' ? 'var(--theme-success)' : undefined }}>
                  {formatQty(viewItem.stockAvailable)}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Stock Status">
                <Tag color={getStockStatusConfig(viewItem.stockStatus).color} icon={getStockStatusConfig(viewItem.stockStatus).icon}>
                  {getStockStatusConfig(viewItem.stockStatus).label}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left" orientationMargin={0} style={{ fontSize: 13, fontWeight: 600 }}>Configuration</Divider>
            <Descriptions bordered column={2} size="small">
              <Descriptions.Item label="Tracking Type">
                <Tag color={viewItem.trackingType !== 'NONE' ? 'blue' : undefined}>
                  {TRACKING_TYPES.find((t) => t.value === viewItem.trackingType)?.label || viewItem.trackingType}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Allow Negative Stock">
                <Tag color={viewItem.allowNegativeStock ? 'orange' : 'green'}>{viewItem.allowNegativeStock ? 'Yes' : 'No'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status" span={2}>
                <Tag color={viewItem.status === 'ACTIVE' ? 'green' : 'red'}>{viewItem.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </DraggableResizableModal>
    </div>
  );
};

export default InventoryPolicyManagement;
