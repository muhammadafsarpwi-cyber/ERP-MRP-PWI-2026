import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Divider, Modal, Space, Spin, Tag, Typography } from 'antd';
import { ApartmentOutlined, ArrowRightOutlined, CheckCircleOutlined, DollarOutlined, InfoCircleOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import AchievementCard from '../../components/dashboard/AchievementCard';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import AlertCenter from '../../components/dashboard/AlertCenter';
import DashboardFilters from '../../components/dashboard/DashboardFilters';
import DashboardHeader, { SystemStatus } from '../../components/dashboard/DashboardHeader';
import DepartmentPerformance from '../../components/dashboard/DepartmentPerformance';
import InventoryHealth from '../../components/dashboard/InventoryHealth';
import ItemOverview from '../../components/dashboard/ItemOverview';
import KpiStrip from '../../components/dashboard/KpiStrip';
import MachinePerformance from '../../components/dashboard/MachinePerformance';
import OrderSummary from '../../components/dashboard/OrderSummary';
import ProductionPerformance from '../../components/dashboard/ProductionPerformance';
import ProductionTrend from '../../components/dashboard/ProductionTrend';
import QuickActions from '../../components/dashboard/QuickActions';
import './dashboard.css';
import { filterItemOverview } from './itemSearch';
import dashboardService, {
  ActivityItem, AlertItem, DashboardFilters as DashboardFiltersType, DashboardSummary, InventorySummary,
  ItemOverview as ItemOverviewType, ItemRoute, MachinePerformanceItem,
  ProductionSummary, ProductionTrendDay, PurchaseOrderSummary, SalesOrderSummary,
} from '../../services/dashboardService';

const { Text } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  // ── Global Filters ──
  const [appliedFilters, setAppliedFilters] = useState<DashboardFiltersType>({});
  const [draftFilters, setDraftFilters] = useState<DashboardFiltersType>({});
  const [divisions, setDivisions] = useState<Array<{ id: string; name: string; divisionCode?: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [shifts, setShifts] = useState<Array<{ id: string; name: string; startTime?: string; endTime?: string }>>([]);

  // ── Data ──
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [prodSummary, setProdSummary] = useState<ProductionSummary | null>(null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>([]);
  const [machinePerf, setMachinePerf] = useState<MachinePerformanceItem[]>([]);
  const [itemOverview, setItemOverview] = useState<ItemOverviewType[]>([]);
  const [inventory, setInventory] = useState<InventorySummary | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [poSummary, setPoSummary] = useState<PurchaseOrderSummary | null>(null);
  const [soSummary, setSoSummary] = useState<SalesOrderSummary | null>(null);

  // ── Item Detail Modal ──
  const [itemDetailVisible, setItemDetailVisible] = useState(false);
  const [itemDetailLoading, setItemDetailLoading] = useState(false);
  const [itemDetail, setItemDetail] = useState<ItemOverviewType | null>(null);
  const [itemRoute, setItemRoute] = useState<ItemRoute | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  // ── Filter Options Loading ──
  useEffect(() => {
    Promise.allSettled([
      dashboardService.getFilterDivisions(),
      dashboardService.getFilterShifts(),
    ]).then(([divRes, shiftRes]) => {
      if (divRes.status === 'fulfilled' && divRes.value.success) setDivisions(divRes.value.data);
      if (shiftRes.status === 'fulfilled' && shiftRes.value.success) setShifts(shiftRes.value.data);
    });
  }, []);

  // ── Cascading filter options: Division → Sections → Departments ──
  useEffect(() => {
    setSections([]);
    setDepartments([]);
    setDraftFilters(prev => ({ ...prev, sectionId: undefined, departmentId: undefined }));
    if (draftFilters.divisionId) {
      dashboardService.getFilterSections(draftFilters.divisionId).then(res => {
        if (res.success) setSections(res.data);
      });
    }
  }, [draftFilters.divisionId]);

  useEffect(() => {
    setDepartments([]);
    setDraftFilters(prev => ({ ...prev, departmentId: undefined }));
    if (draftFilters.divisionId || draftFilters.sectionId) {
      dashboardService.getFilterDepartments(draftFilters.divisionId, draftFilters.sectionId).then(res => {
        if (res.success) setDepartments(res.data);
      });
    }
  }, [draftFilters.divisionId, draftFilters.sectionId]);

  // ── Data Loading ──
  const loadAll = useCallback(async (f?: DashboardFiltersType) => {
    setLoading(true);
    setError(null);
    const effectiveFilters = f ?? appliedFilters;
    try {
      const [sumRes, prodRes, trendRes, machineRes, invRes, alertRes, actRes, poRes, soRes, itemRes] = await Promise.allSettled([
        dashboardService.getSummary(effectiveFilters),
        dashboardService.getProduction(effectiveFilters),
        dashboardService.getProductionTrend(14, effectiveFilters),
        dashboardService.getMachinePerformance(effectiveFilters),
        dashboardService.getInventory(),
        dashboardService.getAlerts(effectiveFilters),
        dashboardService.getActivity(15),
        dashboardService.getProcurement(),
        dashboardService.getSales(),
        dashboardService.getItemOverview(effectiveFilters),
      ]);
      if (sumRes.status === 'fulfilled' && sumRes.value.success) setSummary(sumRes.value.data);
      if (prodRes.status === 'fulfilled' && prodRes.value.success) setProdSummary(prodRes.value.data);
      if (trendRes.status === 'fulfilled' && trendRes.value.success) setTrend(trendRes.value.data);
      if (machineRes.status === 'fulfilled' && machineRes.value.success) setMachinePerf(machineRes.value.data);
      if (invRes.status === 'fulfilled' && invRes.value.success) setInventory(invRes.value.data);
      if (alertRes.status === 'fulfilled' && alertRes.value.success) setAlerts(alertRes.value.data);
      if (actRes.status === 'fulfilled' && actRes.value.success) setActivity(actRes.value.data);
      if (poRes.status === 'fulfilled' && poRes.value.success) setPoSummary(poRes.value.data);
      if (soRes.status === 'fulfilled' && soRes.value.success) setSoSummary(soRes.value.data);
      if (itemRes.status === 'fulfilled' && itemRes.value.success) setItemOverview(itemRes.value.data);

      const failed = [sumRes, prodRes, trendRes, machineRes, invRes, alertRes, actRes].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        setError('Some dashboard sections failed to load. Showing partial results.');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [appliedFilters]);

  // Initial load on mount
  useEffect(() => {
    void loadAll({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filter change handler (updates draft selections) ──
  const handleFilterChange = useCallback((key: string, value?: string) => {
    setDraftFilters(prev => {
      const next = { ...prev, [key]: value ?? undefined };
      if (key === 'divisionId') {
        next.sectionId = undefined;
        next.departmentId = undefined;
      } else if (key === 'sectionId') {
        next.departmentId = undefined;
      }
      return next;
    });
  }, []);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(draftFilters);
    void loadAll(draftFilters);
  }, [draftFilters, loadAll]);

  const handleResetFilters = useCallback(() => {
    setDraftFilters({});
    setAppliedFilters({});
    void loadAll({});
  }, [loadAll]);

  const handleRemoveFilter = useCallback((key: string) => {
    setDraftFilters(prev => {
      const next = { ...prev, [key]: undefined };
      setAppliedFilters(next);
      void loadAll(next);
      return next;
    });
  }, [loadAll]);

  // ── Item Detail ──
  const openItemDetail = async (item: ItemOverviewType) => {
    setItemDetail(item);
    setItemDetailVisible(true);
    setItemDetailLoading(true);
    setItemRoute(null);
    try {
      const res = await dashboardService.getItemRoute(item.id);
      if (res.success) setItemRoute(res.data);
    } catch {
      setItemRoute(null);
    } finally {
      setItemDetailLoading(false);
    }
  };

  // Null-safe item search (itemCode/name/department may be missing from the API).
  const filteredItems = filterItemOverview(itemOverview, itemSearch);

  // Compact dashboard: keep the Item Overview focused, point "View All" at the
  // real inventory report instead of rendering every master-data item inline.
  const MAX_DASHBOARD_ITEMS = 25;
  const visibleItems = filteredItems.slice(0, MAX_DASHBOARD_ITEMS);

  const hasPartialData =
    summary !== null || prodSummary !== null || trend.length > 0 || machinePerf.length > 0
    || inventory !== null || alerts.length > 0 || activity.length > 0 || poSummary !== null
    || soSummary !== null || itemOverview.length > 0;

  const status: SystemStatus = !hasPartialData && loading ? 'loading' : error ? 'degraded' : 'operational';

  const poRows = (poSummary?.recentOrders ?? []).map(po => ({
    id: po.id,
    code: po.poCode,
    party: po.supplierName,
    amount: po.totalAmount,
    currency: po.currencyCode,
    status: po.status,
    date: po.orderDate,
  }));

  const soRows = (soSummary?.recentOrders ?? []).map(so => ({
    id: so.id,
    code: so.orderNumber,
    party: so.customerName,
    amount: so.totalAmount,
    currency: so.currency,
    status: so.status,
    date: so.orderDate,
  }));

  const poTotal = (poSummary?.recentOrders.length ?? 0) + (poSummary?.statusBreakdown.reduce((s, b) => s + b.count, 0) ?? 0);
  const soTotal = (soSummary?.recentOrders.length ?? 0) + (soSummary?.statusBreakdown.reduce((s, b) => s + b.count, 0) ?? 0);

  return (
    <div className="erp-dashboard">
      <DashboardHeader status={status} refreshing={loading} onRefresh={() => loadAll()} />

      {error && <Alert message={error} type="warning" showIcon closable className="erp-alert-bar" onClose={() => setError(null)} />}

      <DashboardFilters
        divisions={divisions}
        sections={sections}
        departments={departments}
        shifts={shifts}
        machines={machinePerf}
        filters={draftFilters}
        appliedFilters={appliedFilters}
        optionsLoading={false}
        loading={loading}
        onChange={handleFilterChange}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        onRemove={handleRemoveFilter}
      />

      {/* ━━━ KPI SUMMARY ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <KpiStrip summary={summary} loading={loading} nav={navigate} />

      {/* ━━━ PRODUCTION PERFORMANCE + ACHIEVEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <ProductionPerformance data={prodSummary} loading={loading} nav={navigate} />
        </div>
        <div className="erp-col erp-col--narrow">
          <AchievementCard data={prodSummary} loading={loading} />
        </div>
      </div>

      {/* ━━━ PRODUCTION TREND ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <ProductionTrend trend={trend} loading={loading} nav={navigate} />

      {/* ━━━ ALERTS + MACHINE PERFORMANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--narrow">
          <AlertCenter alerts={alerts} loading={loading} />
        </div>
        <div className="erp-col erp-col--wide">
          <MachinePerformance items={machinePerf} loading={loading} nav={navigate} />
        </div>
      </div>

      {/* ━━━ ITEM OVERVIEW + INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <ItemOverview
            items={visibleItems}
            totalItems={filteredItems.length}
            loading={loading}
            search={itemSearch}
            onSearch={setItemSearch}
            onOpen={openItemDetail}
            nav={() => navigate('/production/inventory-report')}
          />
        </div>
        <div className="erp-col erp-col--narrow">
          <InventoryHealth inventory={inventory} loading={loading} nav={navigate} />
        </div>
      </div>

      {/* ━━━ PROCUREMENT + SALES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--half">
        <div className="erp-col erp-col--half">
          <OrderSummary
            title="Purchase Orders"
            icon={<ShoppingCartOutlined />}
            subtitle={`${poTotal} total`}
            rows={poRows}
            breakdown={poSummary?.statusBreakdown ?? []}
            loading={loading}
            emptyTitle="No purchase orders"
            emptyDesc="Open orders will appear here once procurement is configured"
            nav={() => navigate('/procurement/orders')}
          />
        </div>
        <div className="erp-col erp-col--half">
          <OrderSummary
            title="Sales Orders"
            icon={<DollarOutlined />}
            subtitle={`${soTotal} total`}
            rows={soRows}
            breakdown={soSummary?.statusBreakdown ?? []}
            loading={loading}
            emptyTitle="No sales orders"
            emptyDesc="Open orders will appear here once sales is configured"
            nav={() => navigate('/sales/orders')}
          />
        </div>
      </div>

      {/* ━━━ DEPARTMENT PERFORMANCE + ACTIVITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <DepartmentPerformance data={prodSummary} loading={loading} />
        </div>
        <div className="erp-col erp-col--narrow">
          <ActivityFeed activity={activity} loading={loading} />
        </div>
      </div>

      {/* ━━━ QUICK ACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <QuickActions nav={navigate} />

      {/* ━━━ ITEM DETAIL MODAL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <Modal
        title={itemDetail ? `${itemDetail.itemCode} — ${itemDetail.name}` : 'Item Details'}
        open={itemDetailVisible}
        onCancel={() => setItemDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setItemDetailVisible(false)}>Close</Button>,
          <Button key="items" type="primary" onClick={() => { setItemDetailVisible(false); navigate('/master-data/items'); }}>
            Go to Item Master
          </Button>,
        ]}
        width={700}
      >
                {itemDetailLoading ? (
                  <Spin />
                ) : itemDetail ? (
          <div>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Item Name">{itemDetail.name}</Descriptions.Item>
              <Descriptions.Item label="Department">{itemDetail.departmentName || '—'}</Descriptions.Item>
              <Descriptions.Item label="Type">
                <Tag color={itemDetail.itemType === 'FINISHED_GOOD' ? 'blue' : itemDetail.itemType === 'RAW_MATERIAL' ? 'green' : 'orange'}>
                  {itemDetail.itemType?.replace('_', ' ')}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={itemDetail.status === 'ACTIVE' ? 'green' : 'default'}>{itemDetail.status}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Manufacturable">{itemDetail.isManufacturable ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Stock On Hand">{itemDetail.stock.onHand}</Descriptions.Item>
              <Descriptions.Item label="Reserved">{itemDetail.stock.reserved}</Descriptions.Item>
              <Descriptions.Item label="Available">{itemDetail.stock.available}</Descriptions.Item>
              <Descriptions.Item label="Min Stock">{itemDetail.minimumStockLevel ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Cost Price">
                {itemDetail.costPrice != null ? (
                  <Text strong style={{ color: 'var(--theme-text)' }}>
                    Rs. {Number(itemDetail.costPrice).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                ) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Selling Price">
                {itemDetail.sellingPrice != null ? (
                  <Text strong style={{ color: 'var(--theme-text)' }}>
                    Rs. {Number(itemDetail.sellingPrice).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                ) : '—'}
              </Descriptions.Item>
            </Descriptions>

            {itemRoute && (
              <>
                <Divider style={{ margin: '14px 0 10px 0', borderColor: 'var(--theme-border)' }} />
                <Typography.Title level={5} style={{ margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--theme-text)' }}>
                  <ApartmentOutlined style={{ color: 'var(--theme-accent, #1890ff)' }} /> Production Route & Flow
                </Typography.Title>

                {itemRoute.productionFlow?.isRawMaterial && !itemRoute.productionFlow?.inputItem ? (
                  (itemRoute.productionFlow.processes && itemRoute.productionFlow.processes.length > 0) || itemRoute.productionFlow.finalProduct ? (
                    <div
                      style={{
                        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 10,
                          flexWrap: 'wrap',
                          gap: 6,
                          borderBottom: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))',
                          paddingBottom: 6,
                        }}
                      >
                        <Space size={6}>
                          <Tag color="green" icon={<CheckCircleOutlined />}>Raw Material / Starting Input</Tag>
                          <Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)' }}>
                            Downstream Production Route
                          </Text>
                        </Space>
                        <Space size={6} wrap>
                          {itemRoute.productionFlow.routeTypeName && (
                            <Tag color="purple" style={{ margin: 0 }}>Route: {itemRoute.productionFlow.routeTypeName}</Tag>
                          )}
                          {(itemRoute.productionFlow.wireSizeMm != null || itemDetail.wireSizeMm != null) && (
                            <Tag color="gold" style={{ margin: 0 }}>Wire: {itemRoute.productionFlow.wireSizeMm ?? itemDetail.wireSizeMm} mm</Tag>
                          )}
                          {(itemRoute.productionFlow.thicknessMm != null || itemRoute.productionFlow.widthMm != null) && (
                            <Tag color="blue" style={{ margin: 0 }}>
                              Flattened: {itemRoute.productionFlow.thicknessMm} × {itemRoute.productionFlow.widthMm} mm
                            </Tag>
                          )}
                        </Space>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          overflowX: 'auto',
                          padding: '6px 2px',
                          gap: 8,
                        }}
                      >
                        {/* Starting Material */}
                        <div
                          style={{
                            minWidth: 150,
                            maxWidth: 210,
                            flex: '0 0 auto',
                            background: 'var(--theme-surface, rgba(0, 0, 0, 0.25))',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                          }}
                        >
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--theme-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            STARTING RAW WIRE
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {itemDetail.name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                            <code style={{ background: 'var(--theme-hover, rgba(255,255,255,0.08))', color: 'var(--theme-accent, #38bdf8)', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>
                              {itemDetail.itemCode}
                            </code>
                            {(itemRoute.productionFlow.wireSizeMm != null || itemDetail.wireSizeMm != null) && (
                              <span style={{ marginLeft: 4 }}>• {itemRoute.productionFlow.wireSizeMm ?? itemDetail.wireSizeMm} mm</span>
                            )}
                          </div>
                        </div>

                        {/* Process Steps Sequence */}
                        {itemRoute.productionFlow.processes?.map((proc) => (
                          <React.Fragment key={proc.step}>
                            <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}>➔</div>
                            <div
                              style={{
                                minWidth: 120,
                                maxWidth: 160,
                                flex: '0 0 auto',
                                background: 'var(--theme-hover, rgba(255, 255, 255, 0.05))',
                                padding: '6px 8px',
                                borderRadius: 6,
                                border: '1px solid rgba(2, 132, 199, 0.3)',
                                textAlign: 'center',
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  background: '#0284c7',
                                  color: '#fff',
                                  borderRadius: 3,
                                  padding: '1px 5px',
                                  display: 'inline-block',
                                  marginBottom: 2,
                                }}
                              >
                                STEP {proc.step}
                              </span>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {proc.name}
                              </div>
                            </div>
                          </React.Fragment>
                        ))}

                        {/* Output / Final Product */}
                        <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}>➔</div>
                        <div
                          style={{
                            minWidth: 150,
                            maxWidth: 220,
                            flex: '0 0 auto',
                            background: 'var(--theme-success-soft, rgba(73, 170, 25, 0.12))',
                            padding: '8px 10px',
                            borderRadius: 6,
                            border: '1px solid var(--theme-success, rgba(73, 170, 25, 0.35))',
                          }}
                        >
                          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--theme-success, #52c41a)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            FINAL PRODUCT
                          </div>
                          <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--theme-text)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {itemRoute.productionFlow.finalProduct || 'Finished Product'}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                            {(itemRoute.productionFlow.thicknessMm != null || itemRoute.productionFlow.widthMm != null) && (
                              <div>T: {itemRoute.productionFlow.thicknessMm} × W: {itemRoute.productionFlow.widthMm} mm</div>
                            )}
                            {itemRoute.productionFlow.packingNextStep && (
                              <div style={{ color: 'var(--theme-accent, #0284c7)' }}>Next: {itemRoute.productionFlow.packingNextStep}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                      }}
                    >
                      <Space direction="vertical" size={4} style={{ width: '100%' }}>
                        <Space>
                          <Tag color="green" icon={<CheckCircleOutlined />}>Raw Material / Store</Tag>
                          <Text strong style={{ color: 'var(--theme-text)' }}>No upstream production route</Text>
                        </Space>
                        <Text style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>
                          This item is a root raw material stored in inventory. It serves as an authoritative input for downstream manufacturing stages.
                        </Text>
                      </Space>
                    </div>
                  )
                ) : !itemRoute.productionFlow?.hasConfiguredRoute && !itemRoute.productionFlow?.isRawMaterial ? (
                  <Alert
                    type="warning"
                    showIcon
                    message={<span style={{ color: 'var(--theme-text)' }}>Manufacturing Item with missing route configuration</span>}
                    description={<span style={{ color: 'var(--theme-text-muted)' }}>No input material or production flow is configured for this manufactured item in Item Master. Please configure the Input Material to define its manufacturing stage.</span>}
                    action={
                      <Button size="small" type="primary" onClick={() => { setItemDetailVisible(false); navigate('/master-data/items'); }}>
                        Configure in Item Master
                      </Button>
                    }
                  />
                ) : itemRoute.productionFlow?.inputItem ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {/* Flow Box */}
                    <div
                      style={{
                        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))', paddingBottom: 6 }}>
                        <Text strong style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-accent, #0284c7)' }}>
                          Authoritative Production Flow
                        </Text>
                        <Space size={6}>
                          <Tag color="cyan" style={{ margin: 0 }}>Operation: {itemRoute.productionFlow.operationName || 'Manufacturing'}</Tag>
                          <Tag color="blue" style={{ margin: 0 }}>Dept: {itemRoute.productionFlow.departmentName || 'Production'}</Tag>
                        </Space>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                        {/* Input Material */}
                        <div style={{ background: 'var(--theme-surface, rgba(0, 0, 0, 0.25))', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.1))' }}>
                          <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>INPUT MATERIAL</div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--theme-text)', marginTop: 2 }}>{itemRoute.productionFlow.inputItem.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                            <code style={{ background: 'var(--theme-hover, rgba(255,255,255,0.08))', color: 'var(--theme-accent, #38bdf8)', padding: '1px 5px', borderRadius: 3 }}>
                              {itemRoute.productionFlow.inputItem.itemCode}
                            </code>
                            {itemRoute.productionFlow.inputItem.uom ? ` • UOM: ${itemRoute.productionFlow.inputItem.uom}` : ''}
                            {itemRoute.productionFlow.inputItem.wireSizeMm != null ? ` • Wire: ${itemRoute.productionFlow.inputItem.wireSizeMm}mm` : ''}
                          </div>
                          {itemRoute.productionFlow.inputItem.departmentName && (
                            <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 3 }}>Source: {itemRoute.productionFlow.inputItem.departmentName}</div>
                          )}
                        </div>

                        {/* Centered Arrow */}
                        <div style={{ textAlign: 'center', padding: '0 4px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-accent, #0284c7)', background: 'var(--theme-accent-soft, rgba(56, 189, 248, 0.15))', padding: '2px 8px', borderRadius: 10, marginBottom: 4, whiteSpace: 'nowrap' }}>
                            {itemRoute.productionFlow.operationName || 'PROCESS'}
                          </div>
                          <ArrowRightOutlined style={{ fontSize: 16, color: 'var(--theme-accent, #0284c7)' }} />
                        </div>

                        {/* Output Product */}
                        <div style={{ background: 'var(--theme-success-soft, rgba(73, 170, 25, 0.12))', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--theme-success, rgba(73, 170, 25, 0.35))' }}>
                          <div style={{ fontSize: 10, color: 'var(--theme-success)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>OUTPUT PRODUCT (Current Item)</div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--theme-text)', marginTop: 2 }}>{itemRoute.productionFlow.outputItem.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginTop: 2 }}>
                            <code style={{ background: 'var(--theme-hover, rgba(255,255,255,0.08))', color: 'var(--theme-success, #52c41a)', padding: '1px 5px', borderRadius: 3 }}>
                              {itemRoute.productionFlow.outputItem.itemCode}
                            </code>
                            {itemRoute.productionFlow.outputItem.uom ? ` • UOM: ${itemRoute.productionFlow.outputItem.uom}` : ''}
                            {itemRoute.productionFlow.outputItem.wireSizeMm != null ? ` • Wire: ${itemRoute.productionFlow.outputItem.wireSizeMm}mm` : ''}
                          </div>
                          {itemRoute.productionFlow.outputItem.departmentName && (
                            <div style={{ fontSize: 11, color: 'var(--theme-success)', marginTop: 3 }}>Dept: {itemRoute.productionFlow.outputItem.departmentName}</div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Multi-Stage Chain */}
                    {itemRoute.productionFlow.chain && itemRoute.productionFlow.chain.length > 1 && (
                      <div
                        style={{
                          border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                          borderRadius: 8,
                          padding: '10px 14px',
                          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                        }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          Configured Manufacturing Chain ({itemRoute.productionFlow.chain.length} Stages)
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 8px' }}>
                          {itemRoute.productionFlow.chain.map((stg, i) => (
                            <React.Fragment key={stg.itemId}>
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  padding: '5px 10px',
                                  borderRadius: 6,
                                  border: stg.isCurrent ? '2px solid var(--theme-accent, #0284c7)' : '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
                                  background: stg.isCurrent ? 'var(--theme-accent-soft, rgba(56, 189, 248, 0.16))' : 'var(--theme-surface, rgba(0, 0, 0, 0.2))',
                                  minWidth: 125,
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: stg.isCurrent ? 'var(--theme-accent, #0284c7)' : 'var(--theme-text-muted)' }}>
                                    {stg.stageName}
                                  </span>
                                  {stg.isCurrent && (
                                    <Tag color="blue" style={{ fontSize: 9, lineHeight: '14px', padding: '0 4px', margin: 0 }}>CURRENT</Tag>
                                  )}
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                                  {stg.itemCode}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                                  {stg.itemName}
                                </span>
                              </div>
                              {i < itemRoute.productionFlow!.chain.length - 1 && (
                                <ArrowRightOutlined style={{ color: 'var(--theme-text-muted)', fontSize: 12 }} />
                              )}
                            </React.Fragment>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <Alert message={<span style={{ color: 'var(--theme-text)' }}>No routing operations defined for this item</span>} type="info" showIcon />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="erp-empty-state">
            <div className="erp-empty-state__icon"><InfoCircleOutlined /></div>
            <div className="erp-empty-state__title">No item selected</div>
            <div className="erp-empty-state__desc">Click a table row to view details</div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Dashboard;