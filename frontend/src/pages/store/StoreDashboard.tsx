import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Space, Select, DatePicker, Button, Spin, Alert, Row, Col, Card } from 'antd';
import { DashboardOutlined, ReloadOutlined, FilterOutlined } from '@ant-design/icons';
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
  storeId?: string;
  divisionId?: string;
  sectionId?: string;
  departmentId?: string;
  range?: [Dayjs, Dayjs];
}

const StoreDashboard: React.FC = () => {
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
    const next = { ...draft, divisionId: value, sectionId: undefined, departmentId: undefined };
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
    const next = { ...draft, sectionId: value, departmentId: undefined };
    setDraft(next);
    loadDepartmentOptions(draft.divisionId, value);
  };

  const applyFilters = () => {
    const filters: DashboardFilters = {};
    if (draft.storeId) filters.storeId = draft.storeId;
    if (draft.divisionId) filters.divisionId = draft.divisionId;
    if (draft.sectionId) filters.sectionId = draft.sectionId;
    if (draft.departmentId) filters.departmentId = draft.departmentId;
    if (draft.range && draft.range[0] && draft.range[1]) {
      filters.dateFrom = draft.range[0].format('YYYY-MM-DD');
      filters.dateTo = draft.range[1].format('YYYY-MM-DD');
    }
    setApplied(filters);
  };

  const clearFilters = () => {
    setDraft({});
    setApplied({});
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
          borderRadius: 10,
          padding: '12px 14px',
          marginBottom: 14,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Space size={4} style={{ marginRight: 4, color: 'var(--theme-text-muted)' }}>
          <FilterOutlined />
          <span style={{ fontSize: 13 }}>Filters</span>
        </Space>
        <Select
          placeholder="Store"
          allowClear
          showSearch
          optionFilterProp="label"
          style={selectStyle}
          value={draft.storeId}
          onChange={(value?: string) => setDraft((prev) => ({ ...prev, storeId: value }))}
          options={stores.map((store) => ({
            value: store.id,
            label: `${store.storeName} (${store.storeCode})`,
          }))}
        />
        <Select
          placeholder="Division"
          allowClear
          style={selectStyle}
          value={draft.divisionId}
          onChange={(value?: string) => handleDivisionChange(value)}
          options={divisions.map((division) => ({
            value: division.id,
            label: division.name,
          }))}
        />
        <Select
          placeholder="Section"
          allowClear
          style={selectStyle}
          value={draft.sectionId}
          onChange={(value?: string) => handleSectionChange(value)}
          options={sections.map((section) => ({
            value: section.id,
            label: section.name,
          }))}
        />
        <Select
          placeholder="Department"
          allowClear
          style={selectStyle}
          value={draft.departmentId}
          onChange={(value?: string) => setDraft((prev) => ({ ...prev, departmentId: value }))}
          options={departments.map((department) => ({
            value: department.id,
            label: department.name,
          }))}
        />
        <DatePicker.RangePicker
          style={{ width: 260 }}
          value={draft.range ?? null}
          onChange={(range) =>
            setDraft((prev) => ({ ...prev, range: (range ?? undefined) as [Dayjs, Dayjs] | undefined }))
          }
          placeholder={['From', 'To']}
        />
        <Button type="primary" onClick={applyFilters} icon={<FilterOutlined />}>
          Apply
        </Button>
        {hasFilters ? (
          <Button onClick={clearFilters}>Clear</Button>
        ) : null}
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