import React, { useEffect, useState, useCallback } from 'react';
import { Select, Space, Typography, Spin, Button, Tooltip } from 'antd';
import {
  ApartmentOutlined,
  BranchesOutlined,
  BuildOutlined,
  ShopOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import apiService from '../../services/api';

const { Text } = Typography;

export interface OrgStoreFilterValue {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  storeId?: string;
  warehouseId?: string;
}

export interface OrgStoreFilterMeta {
  division?: { id: string; name: string; divisionCode: string };
  section?: { id: string; name: string; sectionCode: string };
  department?: { id: string; name: string; departmentCode: string };
  store?: { id: string; storeName: string; storeCode: string; warehouseId: string };
  warehouse?: { id: string; name: string; warehouseCode: string; warehouseType: string };
}

export interface OrgStoreCascadingFilterProps {
  value?: OrgStoreFilterValue;
  onChange: (value: OrgStoreFilterValue, meta: OrgStoreFilterMeta) => void;
  showLabels?: boolean;
  size?: 'small' | 'middle' | 'large';
  allowClear?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export const OrgStoreCascadingFilter: React.FC<OrgStoreCascadingFilterProps> = ({
  value = {},
  onChange,
  showLabels = true,
  size = 'middle',
  allowClear = true,
  style,
  className,
}) => {
  const [divisions, setDivisions] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [loadingDivs, setLoadingDivs] = useState(false);
  const [loadingSecs, setLoadingSecs] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);
  const [loadingStores, setLoadingStores] = useState(false);

  // 1. Load initial divisions and warehouses
  useEffect(() => {
    let mounted = true;
    const initLookups = async () => {
      setLoadingDivs(true);
      try {
        const [divRes, whRes] = await Promise.allSettled([
          apiService.get<any>('/dashboard/divisions'),
          apiService.get<any>('/warehouses', { limit: 100 }),
        ]);

        if (mounted) {
          if (divRes.status === 'fulfilled') {
            const raw = divRes.value;
            const items = Array.isArray(raw) ? raw : raw?.data || raw?.data?.items || raw?.items || [];
            setDivisions(items);
          }
          if (whRes.status === 'fulfilled') {
            const raw = whRes.value;
            const items = Array.isArray(raw) ? raw : raw?.data || raw?.data?.items || raw?.items || [];
            setWarehouses(items);
          }
        }
      } catch (err) {
        console.error('Failed to load divisions/warehouses:', err);
      } finally {
        if (mounted) setLoadingDivs(false);
      }
    };

    initLookups();
    return () => { mounted = false; };
  }, []);

  // 2. Load sections whenever divisionId changes
  useEffect(() => {
    let mounted = true;
    if (!value.divisionId) {
      setSections([]);
      return;
    }

    const loadSections = async () => {
      setLoadingSecs(true);
      try {
        const res = await apiService.get<any>('/dashboard/sections', {
          divisionId: value.divisionId,
        });
        if (mounted) {
          const items = Array.isArray(res) ? res : res?.data || res?.data?.items || res?.items || [];
          setSections(items);
        }
      } catch (err) {
        console.error('Failed to load sections:', err);
      } finally {
        if (mounted) setLoadingSecs(false);
      }
    };

    loadSections();
    return () => { mounted = false; };
  }, [value.divisionId]);

  // 3. Load departments whenever divisionId or sectionId changes
  useEffect(() => {
    let mounted = true;
    if (!value.divisionId && !value.sectionId) {
      setDepartments([]);
      return;
    }

    const loadDepartments = async () => {
      setLoadingDepts(true);
      try {
        const params: Record<string, any> = {};
        if (value.divisionId) params.divisionId = value.divisionId;
        if (value.sectionId) params.sectionId = value.sectionId;

        const res = await apiService.get<any>('/dashboard/departments', params);
        if (mounted) {
          const items = Array.isArray(res) ? res : res?.data || res?.data?.items || res?.items || [];
          setDepartments(items);
        }
      } catch (err) {
        console.error('Failed to load departments:', err);
      } finally {
        if (mounted) setLoadingDepts(false);
      }
    };

    loadDepartments();
    return () => { mounted = false; };
  }, [value.divisionId, value.sectionId]);

  // 4. Load stores whenever divisionId changes
  useEffect(() => {
    let mounted = true;
    const loadStores = async () => {
      setLoadingStores(true);
      try {
        const params: Record<string, any> = {};
        if (value.divisionId) params.divisionId = value.divisionId;

        const res = await apiService.get<any[]>('/store/stores', params);
        if (mounted) {
          const items = Array.isArray(res) ? res : (res as any)?.data || [];
          setStores(items);
        }
      } catch (err) {
        console.error('Failed to load stores:', err);
      } finally {
        if (mounted) setLoadingStores(false);
      }
    };

    loadStores();
    return () => { mounted = false; };
  }, [value.divisionId]);

  // Build metadata helper
  const buildMeta = useCallback((currentVal: OrgStoreFilterValue): OrgStoreFilterMeta => {
    const division = divisions.find((d) => d.id === currentVal.divisionId);
    const section = sections.find((s) => s.id === currentVal.sectionId);
    const department = departments.find((dp) => dp.id === currentVal.departmentId);
    const store = stores.find((st) => st.id === currentVal.storeId);
    const warehouseId = currentVal.warehouseId || store?.warehouseId;
    const warehouse = warehouses.find((w) => w.id === warehouseId);

    return { division, section, department, store, warehouse };
  }, [divisions, sections, departments, stores, warehouses]);

  // Handlers
  const handleDivisionChange = (divId?: string) => {
    const nextVal: OrgStoreFilterValue = {
      divisionId: divId,
      sectionId: undefined,
      departmentId: undefined,
      storeId: undefined,
      warehouseId: undefined,
    };
    onChange(nextVal, buildMeta(nextVal));
  };

  const handleSectionChange = (secId?: string) => {
    const nextVal: OrgStoreFilterValue = {
      ...value,
      sectionId: secId,
      departmentId: undefined,
      storeId: undefined,
      warehouseId: undefined,
    };
    onChange(nextVal, buildMeta(nextVal));
  };

  const handleDepartmentChange = (deptId?: string) => {
    const nextVal: OrgStoreFilterValue = {
      ...value,
      departmentId: deptId,
      storeId: undefined,
      warehouseId: undefined,
    };
    onChange(nextVal, buildMeta(nextVal));
  };

  const handleStoreChange = (stId?: string) => {
    const matchedStore = stores.find((s) => s.id === stId);
    const whId = matchedStore?.warehouseId;
    const nextVal: OrgStoreFilterValue = {
      ...value,
      storeId: stId,
      warehouseId: whId || value.warehouseId,
    };
    onChange(nextVal, buildMeta(nextVal));
  };

  const handleReset = () => {
    const emptyVal: OrgStoreFilterValue = {};
    onChange(emptyVal, buildMeta(emptyVal));
  };

  const hasAnyFilter = Boolean(value.divisionId || value.sectionId || value.departmentId || value.storeId);

  return (
    <div
      className={`erp-org-store-cascade-filter ${className || ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: '8px 12px',
        background: 'var(--theme-bg-subtle, #f8fafc)',
        borderRadius: 8,
        border: '1px solid var(--theme-border, #e2e8f0)',
        ...style,
      }}
    >
      {/* 1. Division */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {showLabels && (
          <Space size={4}>
            <ApartmentOutlined style={{ color: '#2563eb' }} />
            <Text style={{ fontSize: 12, fontWeight: 600 }}>Division:</Text>
          </Space>
        )}
        <Select
          size={size}
          allowClear={allowClear}
          showSearch
          optionFilterProp="label"
          placeholder="All Divisions"
          value={value.divisionId}
          onChange={handleDivisionChange}
          loading={loadingDivs}
          style={{ width: 170 }}
          options={divisions.map((d) => ({
            value: d.id,
            label: `${d.divisionCode ? `${d.divisionCode} - ` : ''}${d.name}`,
          }))}
        />
      </div>

      <span style={{ color: 'var(--theme-border, #cbd5e1)' }}>➔</span>

      {/* 2. Section */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {showLabels && (
          <Space size={4}>
            <BranchesOutlined style={{ color: '#0891b2' }} />
            <Text style={{ fontSize: 12, fontWeight: 600 }}>Section:</Text>
          </Space>
        )}
        <Select
          size={size}
          allowClear={allowClear}
          showSearch
          optionFilterProp="label"
          placeholder={value.divisionId ? 'All Sections' : 'Select Division first'}
          disabled={!value.divisionId && sections.length === 0}
          value={value.sectionId}
          onChange={handleSectionChange}
          loading={loadingSecs}
          style={{ width: 180 }}
          options={sections.map((s) => ({
            value: s.id,
            label: `${s.sectionCode ? `${s.sectionCode} - ` : ''}${s.name}`,
          }))}
        />
      </div>

      <span style={{ color: 'var(--theme-border, #cbd5e1)' }}>➔</span>

      {/* 3. Department */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {showLabels && (
          <Space size={4}>
            <BuildOutlined style={{ color: '#059669' }} />
            <Text style={{ fontSize: 12, fontWeight: 600 }}>Department:</Text>
          </Space>
        )}
        <Select
          size={size}
          allowClear={allowClear}
          showSearch
          optionFilterProp="label"
          placeholder={value.sectionId || value.divisionId ? 'All Departments' : 'Select Section first'}
          disabled={!value.divisionId && departments.length === 0}
          value={value.departmentId}
          onChange={handleDepartmentChange}
          loading={loadingDepts}
          style={{ width: 180 }}
          options={departments.map((dp) => ({
            value: dp.id,
            label: `${dp.departmentCode ? `${dp.departmentCode} - ` : ''}${dp.name}`,
          }))}
        />
      </div>

      <span style={{ color: 'var(--theme-border, #cbd5e1)' }}>➔</span>

      {/* 4. Store / Warehouse */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {showLabels && (
          <Space size={4}>
            <ShopOutlined style={{ color: '#10b981' }} />
            <Text style={{ fontSize: 12, fontWeight: 600 }}>Store / Warehouse:</Text>
          </Space>
        )}
        <Select
          size={size}
          allowClear={allowClear}
          showSearch
          optionFilterProp="label"
          placeholder="All Stores"
          value={value.storeId}
          onChange={handleStoreChange}
          loading={loadingStores}
          style={{ width: 220 }}
          options={stores.map((st) => ({
            value: st.id,
            label: `${st.storeCode ? `${st.storeCode} - ` : ''}${st.storeName}`,
          }))}
        />
      </div>

      {/* Reset button */}
      {hasAnyFilter && (
        <Tooltip title="Reset all filters to show entire enterprise">
          <Button
            size={size}
            type="text"
            icon={<ReloadOutlined />}
            onClick={handleReset}
            style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}
          >
            Reset
          </Button>
        </Tooltip>
      )}
    </div>
  );
};

export default OrgStoreCascadingFilter;
