import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Space, Select, DatePicker, Button, Spin, Alert, Row, Col, Card, Badge, Tag, Grid } from 'antd';
import { DashboardOutlined, ReloadOutlined, FilterOutlined, CloseOutlined, ClearOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';

import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/shared/PageHeader';
import usePermission from '../../hooks/usePermission';
import dashboardService, { type FilterOption } from '../../services/dashboardService';
import { describeRequestError } from '../../services/api';
import {
  fetchStoreDashboardSummary,
  fetchStores,
  type StoreOption,
  type StoreDashboardSummary,
  type DashboardFilters,
  ITEM_TYPES,
} from '../../services/storeDashboard';
import KpiCards from './components/dashboard/kpiCards';
import WorkflowSteps from './components/dashboard/workflowSteps';
import PendingApprovals from './components/dashboard/pendingApprovals';
import QuickActions from './components/dashboard/quickActions';
import StoreStockSummary from './components/dashboard/storeStockSummary';
import ProcurementFunnel from './components/dashboard/procurementFunnel';
import RecentActivity from './components/dashboard/recentActivity';
import LowStockQueue from './components/dashboard/lowStockQueue';
import ReportCards from './components/dashboard/reportCards';

const { useBreakpoint } = Grid;

const KPI_PATHS: Record<string, string> = {
  totalStores: '/store/stock-balance',
  totalStoreItems: '/store/stock-balance',
  lowStockItems: '/store/low-stock',
  pendingRequests: '/store/material-requests',
  pendingPrs: '/procurement/requisitions',
  pendingManagerApprovals: '/store/pending-approvals',
  pendingGmApprovals: '/store/pending-approvals',
  pendingReceipts: '/store/material-receipts',
  overdueDeliveries: '/store/low-stock',
};

const sectionCardTitle = (title: string, subtitle?: string) => (
  <Space direction="vertical" size={0}>
    <span style={{ fontSize: 15, fontWeight: 600 }}>{title}</span>
    {subtitle ? (
      <span style={{ fontSize: 12, color: 'var(--theme-text-muted)', fontWeight: 400 }}>{subtitle}</span>
    ) : null}
  </Space>
);

interface DraftFilters {
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  storeId?: string;
  itemType?: string;
  range?: [Dayjs, Dayjs];
}

const StoreDashboard: React.FC = () => {
  const screens = useBreakpoint();
  const navigate = useNavigate();
  const { can } = usePermission();

  const [summary, setSummary] = useState<StoreDashboardSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [stores, setStores] = useState<StoreOption[]>([]);
  const [divisions, setDivisions] = useState<FilterOption[]>([]);
  const [sections, setSections] = useState<FilterOption[]>([]);
  const [departments, setDepartments] = useState<FilterOption[]>([]);

  const [draft, setDraft] = useState<DraftFilters>({});
  const [applied, setApplied] = useState<DashboardFilters>({});
  // Client-side only store filter for StoreStockSummary (separate from server-side applied filters)
  const [stockSummaryStoreId, setStockSummaryStoreId] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchStores().then(setStores).catch(() => setStores([]));
    dashboardService
      .getFilterDivisions()
      .then((res) => res.data)
      .then(setDivisions)
      .catch(() => setDivisions([]));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchStoreDashboardSummary(applied);
        setSummary(data);
      } catch (err: any) {
        setError(describeRequestError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [applied]);

  const loadDepartmentOptions = useCallback(async (divisionId?: string, sectionId?: string) => {
    try {
      const res = await dashboardService.getFilterDepartments(divisionId, sectionId);
      setDepartments(res.data);
      return res.data;
    } catch {
      setDepartments([]);
      return [];
    }
  }, []);

  const handleDivisionChange = async (value?: string) => {
    const next: DraftFilters = {
      ...draft,
      divisionId: value,
      sectionId: undefined,
      departmentId: undefined,
      storeId: undefined,
    };
    setDraft(next);
    if (value) {
      try {
        const res = await dashboardService.getFilterSections(value);
        setSections(res.data);
      } catch {
        setSections([]);
      }
    } else {
      setSections([]);
    }
    loadDepartmentOptions(value, undefined);
  };

  const handleSectionChange = async (value?: string) => {
    const next: DraftFilters = {
      ...draft,
      sectionId: value,
      departmentId: undefined,
      storeId: undefined,
    };
    setDraft(next);
    loadDepartmentOptions(draft.divisionId, value);
  };

  const handleDepartmentChange = (value?: string) => {
    const next: DraftFilters = {
      ...draft,
      departmentId: value,
      storeId: undefined,
    };
    setDraft(next);
  };

  const handleItemTypeChange = (value?: string) => {
    const cleanVal = value === 'ALL' ? undefined : value;
    setDraft((prev) => ({ ...prev, itemType: cleanVal }));
    setApplied((prev) => ({ ...prev, itemType: cleanVal }));
  };

  // StoreStockSummary dropdown: client-side only filtering (does NOT trigger API re-fetch)
  const handleStoreFilterChange = (value?: string) => {
    const cleanVal = value === 'ALL' ? undefined : value;
    setStockSummaryStoreId(cleanVal);
  };

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (draft.divisionId && s.divisionId && s.divisionId !== draft.divisionId) return false;
      if (draft.sectionId && s.sectionId && s.sectionId !== draft.sectionId) return false;
      if (draft.departmentId && s.departmentId && s.departmentId !== draft.departmentId) return false;
      return true;
    });
  }, [stores, draft.divisionId, draft.sectionId, draft.departmentId]);

  const applyFilters = () => {
    const filters: DashboardFilters = {};
    if (draft.divisionId) filters.divisionId = draft.divisionId;
    if (draft.sectionId) filters.sectionId = draft.sectionId;
    if (draft.departmentId) filters.departmentId = draft.departmentId;
    if (draft.storeId) filters.storeId = draft.storeId;
    if (draft.itemType && draft.itemType !== 'ALL') filters.itemType = draft.itemType;
    if (draft.range && draft.range[0] && draft.range[1]) {
      filters.dateFrom = draft.range[0].format('YYYY-MM-DD');
      filters.dateTo = draft.range[1].format('YYYY-MM-DD');
    }
    setApplied(filters);
  };

  const clearFilters = () => {
    setDraft({});
    setApplied({});
    setStockSummaryStoreId(undefined);
  };

  const hasFilters = useMemo(
    () =>
      Object.values(applied).some((value) => value !== undefined && value !== null && value !== ''),
    [applied],
  );

  const selectStyle: React.CSSProperties = { width: 200 };

  return (
    <div style={{ padding: '16px 24px 32px' }}>
      <PageHeader icon={<DashboardOutlined />} title="Store Dashboard" subtitle="Store operations control center" />

      <div
        style={{
          background: 'var(--theme-surface)',
          border: '1px solid var(--theme-border)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              icon={<FilterOutlined />}
              onClick={() => setShowFilters((prev) => !prev)}
              type={showFilters ? 'primary' : 'default'}
              style={{ fontWeight: 600, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}
            >
              <span>Filters</span>
              {hasFilters && (
                <Badge
                  count={Object.values(applied).filter((v) => v !== undefined && v !== null && v !== '').length}
                  style={{
                    marginLeft: 6,
                    backgroundColor: showFilters ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                    color: showFilters ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                  }}
                />
              )}
            </Button>

            {hasFilters && (
              <Button
                type="link"
                size="small"
                onClick={clearFilters}
                style={{ fontSize: 12, padding: '0 4px', color: 'var(--theme-danger, #ef4444)' }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Panel */}
        {showFilters && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              padding: '12px 14px',
              background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              marginTop: 12,
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                  Filter Store Dashboard
                </span>
                {hasFilters && (
                  <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                    {Object.values(applied).filter((v) => v !== undefined && v !== null && v !== '').length} Active
                  </Tag>
                )}
              </div>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                onClick={() => setShowFilters(false)}
                style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
                title="Close Filters"
              >
                Close
              </Button>
            </div>

            {/* Grid of ALL 6 Filters */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: screens.lg
                  ? 'repeat(3, 1fr)'
                  : screens.md
                  ? 'repeat(2, 1fr)'
                  : '1fr',
                gap: 10,
              }}
            >
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Division
                </label>
                <Select
                  placeholder="All Divisions"
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.divisionId}
                  onChange={(value?: string) => handleDivisionChange(value)}
                  options={divisions.map((division) => ({
                    value: division.id,
                    label: division.name,
                  }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Section
                </label>
                <Select
                  placeholder="All Sections"
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.sectionId}
                  onChange={(value?: string) => handleSectionChange(value)}
                  options={sections.map((section) => ({
                    value: section.id,
                    label: section.name,
                  }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Department
                </label>
                <Select
                  placeholder="All Departments"
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.departmentId}
                  onChange={(value?: string) => handleDepartmentChange(value)}
                  options={departments.map((department) => ({
                    value: department.id,
                    label: department.name,
                  }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Store
                </label>
                <Select
                  placeholder="All Stores"
                  allowClear
                  showSearch
                  optionFilterProp="label"
                  style={{ width: '100%' }}
                  value={draft.storeId}
                  onChange={(value?: string) => setDraft((prev) => ({ ...prev, storeId: value }))}
                  options={filteredStores.map((store) => ({
                    value: store.id,
                    label: `${store.storeName} (${store.storeCode})`,
                  }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Item Type
                </label>
                <Select
                  placeholder="All Item Types"
                  allowClear
                  style={{ width: '100%' }}
                  value={draft.itemType}
                  onChange={(value?: string) => handleItemTypeChange(value)}
                  options={ITEM_TYPES.map((t) => ({
                    value: t.value === 'ALL' ? undefined : t.value,
                    label: t.label,
                  }))}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #64748b)', marginBottom: 4 }}>
                  Date Range
                </label>
                <DatePicker.RangePicker
                  style={{ width: '100%' }}
                  value={draft.range ?? null}
                  onChange={(range) =>
                    setDraft((prev) => ({ ...prev, range: (range ?? undefined) as [Dayjs, Dayjs] | undefined }))
                  }
                  placeholder={['From', 'To']}
                />
              </div>
            </div>

            {/* Footer */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <Button
                icon={<ClearOutlined />}
                onClick={clearFilters}
                disabled={!hasFilters}
                danger={hasFilters}
              >
                Clear Filters
              </Button>

              <div style={{ display: 'flex', gap: 8 }}>
                <Button onClick={() => setShowFilters(false)}>
                  Close
                </Button>
                <Button
                  type="primary"
                  icon={<FilterOutlined />}
                  onClick={() => {
                    applyFilters();
                    setShowFilters(false);
                  }}
                  loading={loading}
                  style={{ fontWeight: 600 }}
                >
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <Alert
          type="error"
          showIcon
          message="Could not load the store dashboard"
          description={error}
          style={{ marginBottom: 14 }}
          action={
            <Button size="small" danger onClick={() => setApplied({ ...applied })} icon={<ReloadOutlined />}>
              Retry
            </Button>
          }
        />
      ) : null}

      {loading ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 320,
          }}
        >
          <Spin size="large" />
        </div>
      ) : summary ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <KpiCards kpis={summary.kpis} kpiPaths={KPI_PATHS} onNavigate={navigate} />

          <Card
            size="small"
            title={sectionCardTitle('Procurement Workflow', 'Request-to-stock pipeline status')}
            styles={{ body: { padding: '10px 10px 4px' } }}
          >
            <WorkflowSteps steps={summary.workflow} onNavigate={navigate} />
          </Card>

          <PendingApprovals
            manager={summary.pendingApprovals.manager}
            gm={can('store.request.gm_approve') ? summary.pendingApprovals.gm : []}
            onReview={navigate}
          />

          <QuickActions can={can} onNavigate={navigate} />

          <Row gutter={[14, 14]}>
            <Col xs={24} lg={16}>
              <StoreStockSummary
                rows={summary.stockSummary.rows}
                belowMinimum={summary.stockSummary.belowMinimum}
                stores={filteredStores.length > 0 ? filteredStores : stores}
                selectedStoreId={stockSummaryStoreId}
                onStoreChange={handleStoreFilterChange}
                itemType={applied.itemType || draft.itemType}
                onItemTypeChange={handleItemTypeChange}
                onViewBalance={navigate}
              />
            </Col>
            <Col xs={24} lg={8}>
              <RecentActivity activity={summary.activity} />
            </Col>
          </Row>

          <Row gutter={[14, 14]}>
            <Col xs={24} lg={16}>
              <LowStockQueue
                available={summary.lowStock.available}
                rows={summary.lowStock.rows}
                onOpen={navigate}
              />
            </Col>
            <Col xs={24} lg={8}>
              <ProcurementFunnel funnel={summary.procurementFunnel} />
            </Col>
          </Row>

          <ReportCards onNavigate={navigate} />
        </div>
      ) : (
        <Card>
          <Alert type="info" showIcon message="No dashboard data" />
        </Card>
      )}
    </div>
  );
};

export default StoreDashboard;