import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Divider, List, Modal, Space, Spin, Tag, Typography } from 'antd';
import { ApartmentOutlined, DollarOutlined, InfoCircleOutlined, ShoppingCartOutlined } from '@ant-design/icons';
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
import dashboardService, {
  ActivityItem, AlertItem, DashboardFilters as DashboardFiltersType, DashboardSummary, InventorySummary,
  ItemOverview as ItemOverviewType, ItemRoute, MachinePerformanceItem,
  ProductionSummary, ProductionTrendDay, PurchaseOrderSummary, SalesOrderSummary,
} from '../../services/dashboardService';

const { Text } = Typography;

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  // ── Global Filters ──
  const [filters, setFilters] = useState<DashboardFiltersType>({});
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

  // ── Cascading filter: Division → Sections → Departments ──
  useEffect(() => {
    setSections([]);
    setDepartments([]);
    setFilters(prev => ({ ...prev, sectionId: undefined, departmentId: undefined }));
    dashboardService.getFilterSections(filters.divisionId).then(res => {
      if (res.success) setSections(res.data);
    });
  }, [filters.divisionId]);

  useEffect(() => {
    setDepartments([]);
    setFilters(prev => ({ ...prev, departmentId: undefined }));
    dashboardService.getFilterDepartments(filters.divisionId, filters.sectionId).then(res => {
      if (res.success) setDepartments(res.data);
    });
  }, [filters.divisionId, filters.sectionId]);

  // ── Data Loading ──
  const loadAll = useCallback(async (f?: DashboardFiltersType) => {
    setLoading(true);
    setError(null);
    const effectiveFilters = f ?? filters;
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
  }, [filters]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Filter change handler (preserves original cascade semantics) ──
  const handleFilterChange = useCallback((key: string, value?: string) => {
    setFilters(prev => {
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

  const clearAllFilters = useCallback(() => {
    setFilters({});
    void loadAll({});
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

  const filteredItems = itemOverview.filter(item =>
    !itemSearch
    || item.itemCode.toLowerCase().includes(itemSearch.toLowerCase())
    || item.name.toLowerCase().includes(itemSearch.toLowerCase())
  );

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
        filters={filters}
        optionsLoading={false}
        onChange={handleFilterChange}
        onClearAll={clearAllFilters}
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
            items={filteredItems}
            loading={loading}
            search={itemSearch}
            onSearch={setItemSearch}
            onOpen={openItemDetail}
            nav={() => navigate('/master-data/items')}
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
              <Descriptions.Item label="Item Code">{itemDetail.itemCode}</Descriptions.Item>
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
              <Descriptions.Item label="Cost Price">{itemDetail.costPrice ? `$${itemDetail.costPrice}` : '—'}</Descriptions.Item>
              <Descriptions.Item label="Selling Price">{itemDetail.sellingPrice ? `$${itemDetail.sellingPrice}` : '—'}</Descriptions.Item>
            </Descriptions>

            {itemRoute && (
              <>
                <Divider />
                <Typography.Title level={5} style={{ margin: '0 0 8px 0' }}>
                  <ApartmentOutlined /> Production Route: {itemRoute.routing?.name || 'N/A'}
                </Typography.Title>
                {itemRoute.operations.length > 0 ? (
                  <List
                    size="small"
                    bordered
                    dataSource={itemRoute.operations}
                    renderItem={(op, idx) => (
                      <List.Item key={`${op.sequenceNo}-${idx}`}>
                        <Space direction="vertical" size={0} style={{ width: '100%' }}>
                          <Space size={8}>
                            <Tag color="blue" style={{ margin: 0 }}>Step {op.sequenceNo}</Tag>
                            <Text strong>{op.operationName}</Text>
                            <Tag style={{ margin: 0, fontSize: 10 }}>{op.operationCode}</Tag>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Setup: {op.setupTimeMinutes}min | Run: {op.runTimeMinutes}min | Output: {op.outputQuantity}
                            {op.machineRequired ? ' | Machine Required' : ''}
                          </Text>
                        </Space>
                      </List.Item>
                    )}
                  />
                ) : (
                  <Alert message="No routing operations defined for this item" type="info" showIcon />
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