import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Descriptions, Divider, Modal, Space, Tag, Typography } from 'antd';
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
import TopProductsRow from '../../components/dashboard/TopProductsRow';
import ShopfloorTouchscreenModal from '../../components/dashboard/ShopfloorTouchscreenModal';
import DepartmentTrendChart from '../../components/dashboard/DepartmentTrendChart';
import TodayScheduleCard from '../../components/dashboard/TodayScheduleCard';
import MiniCalendarWidget from '../../components/dashboard/MiniCalendarWidget';
import { GlobalLoading, TabKeepAlive } from '../../components/shared';
import {
  dateRangePresetToFilters, DateRangePreset, DEFAULT_DATE_RANGE_PRESET,
} from '../../components/dashboard/dashboardShared';
import './dashboard.css';
import { filterItemOverview } from './itemSearch';
import dashboardService, {
  ActivityItem, AlertItem, DashboardFilters as DashboardFiltersType, DashboardScheduleItem,
  DashboardSummary, InventorySummary, ItemOverview as ItemOverviewType, ItemRoute,
  MachinePerformanceItem, ProductionSummary, ProductionTrendDay, PurchaseOrderSummary, SalesOrderSummary,
} from '../../services/dashboardService';
import { tabSessionCache } from '../../services/tabSessionCache';

const { Text } = Typography;

const MAIN_DASHBOARD_TAB_ID = '/dashboard/v4';

// Evict legacy unversioned dashboard tab caches to prevent stale unfiltered restores
try {
  sessionStorage.removeItem('erp_tab_session_/dashboard');
  sessionStorage.removeItem('erp_tab_session_/dashboard/v2');
  sessionStorage.removeItem('erp_tab_session_/dashboard/v3');
} catch {
  // ignore
}

/**
 * Default active division on load — "DIV-SPD Spoke Division" instead of
 * "All Divisions". Users can still change or clear it from the Division
 * filter dropdown at any time.
 */
const DEFAULT_DIVISION_CODE = 'DIV-SPD';
const DEFAULT_DIVISION_NAME = 'Spoke Division';

const findDefaultDivision = (
  options: Array<{ id: string; name: string; divisionCode?: string }>,
): { id: string; name: string; divisionCode?: string } | undefined =>
  options.find((d) => (d.divisionCode ?? '').trim().toUpperCase() === DEFAULT_DIVISION_CODE)
  ?? options.find((d) => d.name.trim().toLowerCase() === DEFAULT_DIVISION_NAME.toLowerCase());

interface MainDashboardTabCache {
  summary: DashboardSummary | null;
  prodSummary: ProductionSummary | null;
  trend: ProductionTrendDay[];
  machinePerf: MachinePerformanceItem[];
  itemOverview: ItemOverviewType[];
  inventory: InventorySummary | null;
  alerts: AlertItem[];
  activity: ActivityItem[];
  poSummary: PurchaseOrderSummary | null;
  soSummary: SalesOrderSummary | null;
  appliedFilters: DashboardFiltersType;
  dateRangePreset: DateRangePreset;
  lastEntryDate?: string | null;
  customRange?: [string, string];
}

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const cachedTab = useMemo(() => tabSessionCache.get<MainDashboardTabCache>(MAIN_DASHBOARD_TAB_ID), []);

  // ── Global Filters ──
  // Requirement 4 — the dashboard opens on a single date-range preset
  // ("Yesterday" by default) and Requirement 1 — the DIV-SPD Spoke Division
  // is the default active division instead of "All Divisions".
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>(
    () => cachedTab?.dateRangePreset ?? DEFAULT_DATE_RANGE_PRESET,
  );
  const [lastEntryDate, setLastEntryDate] = useState<string | null>(
    () => cachedTab?.lastEntryDate ?? cachedTab?.summary?.productionEntries?.lastEntryDate ?? null,
  );
  const [customRange, setCustomRange] = useState<[string, string] | undefined>(
    () => cachedTab?.customRange,
  );
  const [appliedFilters, setAppliedFilters] = useState<DashboardFiltersType>(
    () => cachedTab?.appliedFilters
      ?? { ...dateRangePresetToFilters(cachedTab?.dateRangePreset ?? DEFAULT_DATE_RANGE_PRESET, cachedTab?.lastEntryDate, cachedTab?.customRange) },
  );
  const [draftFilters, setDraftFilters] = useState<DashboardFiltersType>(
    () => cachedTab?.appliedFilters
      ?? { ...dateRangePresetToFilters(cachedTab?.dateRangePreset ?? DEFAULT_DATE_RANGE_PRESET, cachedTab?.lastEntryDate, cachedTab?.customRange) },
  );

  // Mirror of the applied filters for use inside async loaders/callbacks.
  const appliedFiltersRef = useRef(appliedFilters);
  appliedFiltersRef.current = appliedFilters;

  /**
   * The very first fetch must wait until the division options have resolved,
   * otherwise the default DIV-SPD division would arrive too late to filter it.
   * Resolved by the filter-options effect below (always — even on fetch error).
   */
  const resolveDivisionsRef = useRef<(() => void) | null>(null);
  const divisionsLoadedRef = useRef<Promise<void> | null>(null);
  if (!divisionsLoadedRef.current) {
    divisionsLoadedRef.current = new Promise<void>((resolve) => {
      resolveDivisionsRef.current = resolve;
    });
  }
  const defaultDivisionIdRef = useRef<string | undefined>(undefined);

  const [divisions, setDivisions] = useState<Array<{ id: string; name: string; divisionCode?: string }>>([]);
  const [sections, setSections] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [shifts, setShifts] = useState<Array<{ id: string; name: string; startTime?: string; endTime?: string }>>([]);

  // ── Data ──
  const [loading, setLoading] = useState(!cachedTab);
  // Wave-2 (Procurement / Sales / Inventory / Machines / Alerts / Activity /
  // Items) loading — never blocks the critical KPI + top-charts render.
  const [secondaryLoading, setSecondaryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(() => cachedTab?.summary ?? null);
  const [prodSummary, setProdSummary] = useState<ProductionSummary | null>(() => cachedTab?.prodSummary ?? null);
  const [trend, setTrend] = useState<ProductionTrendDay[]>(() => cachedTab?.trend ?? []);
  const [machinePerf, setMachinePerf] = useState<MachinePerformanceItem[]>(() => cachedTab?.machinePerf ?? []);
  const [itemOverview, setItemOverview] = useState<ItemOverviewType[]>(() => cachedTab?.itemOverview ?? []);
  const [inventory, setInventory] = useState<InventorySummary | null>(() => cachedTab?.inventory ?? null);
  const [alerts, setAlerts] = useState<AlertItem[]>(() => cachedTab?.alerts ?? []);
  const [activity, setActivity] = useState<ActivityItem[]>(() => cachedTab?.activity ?? []);
  const [poSummary, setPoSummary] = useState<PurchaseOrderSummary | null>(() => cachedTab?.poSummary ?? null);
  const [soSummary, setSoSummary] = useState<SalesOrderSummary | null>(() => cachedTab?.soSummary ?? null);
  const [scheduleItems, setScheduleItems] = useState<DashboardScheduleItem[]>([]);
  const [calendarActivityDates, setCalendarActivityDates] = useState<string[]>([]);

  // ── Item Detail Modal ──
  const [itemDetailVisible, setItemDetailVisible] = useState(false);
  const [itemDetailLoading, setItemDetailLoading] = useState(false);
  const [itemDetail, setItemDetail] = useState<ItemOverviewType | null>(null);
  const [itemRoute, setItemRoute] = useState<ItemRoute | null>(null);
  const [itemSearch, setItemSearch] = useState('');

  // ── Shop Floor Touchscreen Operator Terminal ──
  const [touchscreenOpen, setTouchscreenOpen] = useState(false);

  // ── Filter Options Loading ──
  useEffect(() => {
    Promise.allSettled([
      dashboardService.getFilterDivisions(),
      dashboardService.getFilterShifts(),
    ]).then(([divRes, shiftRes]) => {
      if (divRes.status === 'fulfilled' && divRes.value.success) {
        setDivisions(divRes.value.data);
        // Requirement 1 — resolve the default division (DIV-SPD Spoke
        // Division) for the initial fetch. A restored tab keeps whatever the
        // user had applied before switching away.
        defaultDivisionIdRef.current = cachedTab
          ? cachedTab.appliedFilters?.divisionId
          : findDefaultDivision(divRes.value.data)?.id;
      }
      if (shiftRes.status === 'fulfilled' && shiftRes.value.success) setShifts(shiftRes.value.data);
    }).finally(() => {
      // Release the initial loader even when the options request fails.
      resolveDivisionsRef.current?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  /**
   * Monotonic request token. Every `loadAll` invocation claims the next
   * sequence number; a response whose sequence is no longer current is
   * discarded, so a slow, stale (e.g. unfiltered) response can never
   * overwrite the result of a newer filtered request — no racing fetches.
   */
  const fetchSeqRef = useRef(0);

  const loadAll = useCallback(async (f?: DashboardFiltersType) => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setSecondaryLoading(true);
    setError(null);
    const effectiveFilters = f ?? appliedFilters;
    if (effectiveFilters.divisionId !== appliedFiltersRef.current.divisionId) {
      setItemOverview([]);
      setInventory(null);
    }

    // Session cache writer — always persists the freshest slice we have.
    const persistCache = (slice: Partial<MainDashboardTabCache>) => {
      tabSessionCache.set<MainDashboardTabCache>(MAIN_DASHBOARD_TAB_ID, {
        summary, prodSummary, trend, machinePerf, itemOverview, inventory,
        alerts, activity, poSummary, soSummary,
        appliedFilters: effectiveFilters,
        dateRangePreset,
        ...slice,
      });
    };

    try {
      // ── Wave 1 — CRITICAL: KPI summary + top charts only ──
      // These three endpoints hydrate the KPI strip, Production Performance,
      // Achievement Overview, Production Trend and Department Performance.
      // They are released as soon as they land, without waiting for the heavy
      // lower sections below.
      const [sumRes, prodRes, trendRes] = await Promise.allSettled([
        dashboardService.getSummary(effectiveFilters),
        dashboardService.getProduction(effectiveFilters),
        dashboardService.getProductionTrend(31, effectiveFilters),
      ]);
      if (seq !== fetchSeqRef.current) return; // superseded by a newer request

      const criticalFailed = [sumRes, prodRes, trendRes].some(r => r.status === 'rejected');
      if (sumRes.status === 'fulfilled' && sumRes.value.success) {
        setSummary(sumRes.value.data);
        if (sumRes.value.data.productionEntries?.lastEntryDate) {
          setLastEntryDate(sumRes.value.data.productionEntries.lastEntryDate);
        }
      }
      if (prodRes.status === 'fulfilled' && prodRes.value.success) setProdSummary(prodRes.value.data);
      if (trendRes.status === 'fulfilled' && trendRes.value.success) setTrend(trendRes.value.data);

      // Critical render is ready — drop the blocking spinner NOW.
      setLoading(false);
      persistCache({
        summary: sumRes.status === 'fulfilled' && sumRes.value.success ? sumRes.value.data : summary,
        prodSummary: prodRes.status === 'fulfilled' && prodRes.value.success ? prodRes.value.data : prodSummary,
        trend: trendRes.status === 'fulfilled' && trendRes.value.success ? trendRes.value.data : trend,
        lastEntryDate: sumRes.status === 'fulfilled' && sumRes.value.success ? (sumRes.value.data.productionEntries?.lastEntryDate ?? lastEntryDate) : lastEntryDate,
        customRange,
      });

      // ── Wave 2 — SECONDARY: heavy lower sections, non-blocking ──
      // Procurement, Sales and Inventory Overview (plus Machines, Alerts,
      // Activity and Items) stream in right after in parallel and render into
      // their own widgets with skeleton states — they never delay the KPI
      // summary or the top charts above.
      void (async () => {
        const [machineRes, invRes, alertRes, actRes, poRes, soRes, itemRes, schedRes, calRes] = await Promise.allSettled([
          dashboardService.getMachinePerformance(effectiveFilters),
          dashboardService.getInventory(effectiveFilters),
          dashboardService.getAlerts(effectiveFilters),
          dashboardService.getActivity(15),
          dashboardService.getProcurement(),
          dashboardService.getSales(),
          dashboardService.getItemOverview(effectiveFilters),
          dashboardService.getSchedule(),
          dashboardService.getCalendarActivity(),
        ]);
        if (seq !== fetchSeqRef.current) return; // superseded — discard stale data

        if (machineRes.status === 'fulfilled' && machineRes.value.success) setMachinePerf(machineRes.value.data);
        if (invRes.status === 'fulfilled' && invRes.value.success) setInventory(invRes.value.data);
        if (alertRes.status === 'fulfilled' && alertRes.value.success) setAlerts(alertRes.value.data);
        if (actRes.status === 'fulfilled' && actRes.value.success) setActivity(actRes.value.data);
        if (poRes.status === 'fulfilled' && poRes.value.success) setPoSummary(poRes.value.data);
        if (soRes.status === 'fulfilled' && soRes.value.success) setSoSummary(soRes.value.data);
        if (itemRes.status === 'fulfilled' && itemRes.value.success) setItemOverview(itemRes.value.data);
        if (schedRes.status === 'fulfilled' && schedRes.value.success) setScheduleItems(schedRes.value.data);
        if (calRes.status === 'fulfilled' && calRes.value.success) {
          setCalendarActivityDates(calRes.value.data.map(d => d.date));
        }

        const secondaryFailed = [machineRes, invRes, alertRes, actRes, poRes, soRes, itemRes]
          .some(r => r.status === 'rejected');
        if (criticalFailed || secondaryFailed) {
          setError('Some dashboard sections failed to load. Showing partial results.');
        }

        setSecondaryLoading(false);
        // Persist the full payload so switching back to this tab restores
        // every metric + chart instantly (no re-fetch).
        persistCache({
          machinePerf: machineRes.status === 'fulfilled' && machineRes.value.success ? machineRes.value.data : machinePerf,
          inventory: invRes.status === 'fulfilled' && invRes.value.success ? invRes.value.data : inventory,
          alerts: alertRes.status === 'fulfilled' && alertRes.value.success ? alertRes.value.data : alerts,
          activity: actRes.status === 'fulfilled' && actRes.value.success ? actRes.value.data : activity,
          poSummary: poRes.status === 'fulfilled' && poRes.value.success ? poRes.value.data : poSummary,
          soSummary: soRes.status === 'fulfilled' && soRes.value.success ? soRes.value.data : soSummary,
          itemOverview: itemRes.status === 'fulfilled' && itemRes.value.success ? itemRes.value.data : itemOverview,
        });
      })();
    } catch (e: unknown) {
      if (seq !== fetchSeqRef.current) return;
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      setLoading(false);
      setSecondaryLoading(false);
    }
  }, [appliedFilters, dateRangePreset, summary, prodSummary, trend, machinePerf, itemOverview, inventory, alerts, activity, poSummary, soSummary]);

  const loadAllRef = useRef(loadAll);
  loadAllRef.current = loadAll;

  /**
   * Initial loader (also used by the global Refresh event and by TabKeepAlive
   * when the tab has no cached payload). It waits for the division options so
   * the default "DIV-SPD Spoke Division" is applied to the very first query,
   * then always loads with the currently applied filters — which include the
   * active date-range preset (default "Yesterday").
   */
  const loadInitial = useCallback(async () => {
    await divisionsLoadedRef.current;
    const next: DashboardFiltersType = {
      ...appliedFiltersRef.current,
      // Requirement 1 — default division, while still allowing the user to
      // clear/change it from the Division dropdown afterwards.
      divisionId: appliedFiltersRef.current.divisionId ?? defaultDivisionIdRef.current,
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    await Promise.allSettled([
      loadAllRef.current(next),
    ]);
  }, []);

  /**
   * The ONE manual refresh path. Invoked by the global header "Refresh"
   * button (via the TAB_REFRESH_EVENT that TabKeepAlive handles and forwards
   * to `loadInitial`) and by the dashboard's own header refresh action.
   */
  const handleManualRefresh = useCallback(async () => {
    tabSessionCache.remove(MAIN_DASHBOARD_TAB_ID);
    await Promise.allSettled([
      loadInitial(),
    ]);
  }, [loadInitial]);

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

  const handleApplyFilters = useCallback(async () => {
    let resolvedLastDate = lastEntryDate;
    if (dateRangePreset === 'lastEntry' && !resolvedLastDate) {
      try {
        const res = await dashboardService.getLastEntryDate(draftFilters);
        if (res.success && res.data.lastEntryDate) {
          resolvedLastDate = res.data.lastEntryDate;
          setLastEntryDate(resolvedLastDate);
        }
      } catch {
        // ignore
      }
    }
    const next: DashboardFiltersType = {
      ...draftFilters,
      ...dateRangePresetToFilters(dateRangePreset, resolvedLastDate, customRange),
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    void loadAllRef.current(next);
  }, [draftFilters, dateRangePreset, lastEntryDate, customRange]);

  const handleResetFilters = useCallback(() => {
    const next: DashboardFiltersType = {
      ...dateRangePresetToFilters(dateRangePreset, lastEntryDate, customRange),
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    void loadAllRef.current(next);
  }, [dateRangePreset, lastEntryDate, customRange]);

  // Switching the preset re-queries the dashboard immediately.
  const handleDateRangeChange = useCallback(async (preset: DateRangePreset, range?: [string, string]) => {
    setDateRangePreset(preset);
    if (range) {
      setCustomRange(range);
    }
    let resolvedLastDate = lastEntryDate;
    if (preset === 'lastEntry') {
      try {
        const res = await dashboardService.getLastEntryDate(appliedFiltersRef.current);
        if (res.success && res.data.lastEntryDate) {
          resolvedLastDate = res.data.lastEntryDate;
          setLastEntryDate(resolvedLastDate);
        }
      } catch {
        // ignore
      }
    }
    const dateFilters = dateRangePresetToFilters(preset, resolvedLastDate, range ?? customRange);
    const next: DashboardFiltersType = { ...appliedFiltersRef.current, ...dateFilters };
    setDraftFilters(prev => ({ ...prev, ...dateFilters }));
    setAppliedFilters(next);
    void loadAllRef.current(next);
  }, [lastEntryDate, customRange]);

  const handleRemoveFilter = useCallback((key: string) => {
    setDraftFilters(prev => {
      const next = { ...prev, [key]: undefined };
      setAppliedFilters(next);
      void loadAllRef.current(next);
      return next;
    });
  }, []);

  const handleApplyDivision = useCallback((divisionId?: string) => {
    const next: DashboardFiltersType = {
      ...appliedFiltersRef.current,
      divisionId: divisionId ?? undefined,
      sectionId: undefined,
      departmentId: undefined,
    };
    setDraftFilters(next);
    setAppliedFilters(next);
    void loadAllRef.current(next);
  }, []);

  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);

  const handleSelectSingleDate = useCallback((dateStr: string) => {
    setSelectedCalendarDate(dateStr);
    handleDateRangeChange('custom', [dateStr, dateStr]);
  }, [handleDateRangeChange]);

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

  const effectiveCalendarDate = selectedCalendarDate
    || ((appliedFilters.dateFrom && appliedFilters.dateFrom === appliedFilters.dateTo) ? appliedFilters.dateFrom : null)
    || (trend.length > 0 ? trend[trend.length - 1].date : null)
    || lastEntryDate;

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
    <TabKeepAlive
      tabId={MAIN_DASHBOARD_TAB_ID}
      load={loadInitial}
      serialize={() => ({ summary, prodSummary, trend, machinePerf, itemOverview, inventory, alerts, activity, poSummary, soSummary, appliedFilters, dateRangePreset, lastEntryDate, customRange })}
    >
      <div className="erp-dashboard">
        <DashboardHeader
          status={status}
          refreshing={loading || secondaryLoading}
          onRefresh={handleManualRefresh}
        />

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
        dateRangePreset={dateRangePreset}
        lastEntryDate={lastEntryDate}
        customRange={customRange}
        onChange={handleFilterChange}
        onDateRangeChange={handleDateRangeChange}
        onCustomRangeChange={setCustomRange}
        onApplyDivision={handleApplyDivision}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        onRemove={handleRemoveFilter}
      />

      {/* ━━━ TOP PRODUCTS / SERVICES CARDS (Matching Reference Design Top Row) ━━━ */}
      <TopProductsRow
        items={itemOverview}
        loading={secondaryLoading}
        onViewAll={() => navigate('/master-data/items')}
        onOpenItem={openItemDetail}
        onQuickAction={() => setTouchscreenOpen(true)}
      />

      {/* ━━━ INTELLIGENCE & SCHEDULE ROW (Activity Chart + Today's Schedule + Mini Calendar) ━━━ */}
      <div className="erp-dashboard-intel-row">
        <DepartmentTrendChart
          trend={trend}
          departments={prodSummary?.departments ?? departments}
          loading={loading}
          selectedDate={effectiveCalendarDate}
          onSelectDate={handleSelectSingleDate}
          filters={appliedFilters}
        />
        <TodayScheduleCard
          items={scheduleItems}
          loading={secondaryLoading}
          onAddSchedule={() => navigate('/sales/orders')}
          onViewAll={() => navigate('/sales/orders')}
          onItemClick={() => navigate('/sales/orders')}
        />
        <MiniCalendarWidget
          selectedDate={effectiveCalendarDate}
          activeDates={calendarActivityDates}
          onSelectDate={handleSelectSingleDate}
          loading={secondaryLoading}
        />
      </div>

      {/* ━━━ KPI SUMMARY ROW ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <KpiStrip summary={summary} loading={loading} nav={navigate} />

      {/* ━━━ PRODUCTION PERFORMANCE + ACHIEVEMENT ━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <ProductionPerformance
            data={prodSummary}
            trend={trend}
            loading={loading}
            nav={navigate}
            selectedDate={effectiveCalendarDate}
            divisionId={appliedFilters.divisionId}
            divisionCode={divisions.find((d) => d.id === appliedFilters.divisionId)?.divisionCode}
          />
        </div>
        <div className="erp-col erp-col--narrow">
          <AchievementCard data={prodSummary} loading={loading} />
        </div>
      </div>

      {/* ━━━ PRODUCTION TREND ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <ProductionTrend trend={trend} loading={loading} nav={navigate} />

      {/* ━━━ DEPARTMENT PERFORMANCE (FULL WIDTH SCORECARD) ━━━━━━━━━━━━━━━━━ */}
      <div style={{ marginBottom: 16 }}>
        <DepartmentPerformance
          data={prodSummary}
          loading={loading}
          nav={navigate}
          divisionId={appliedFilters.divisionId}
          divisionCode={divisions.find((d) => d.id === appliedFilters.divisionId)?.divisionCode}
        />
      </div>

      {/* ━━━ MACHINE PERFORMANCE (LEFT, WIDE) + ALERTS & ACTIVITY (RIGHT, NARROW) ━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <MachinePerformance items={machinePerf} loading={secondaryLoading} nav={navigate} />
        </div>
        <div className="erp-col erp-col--narrow" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <AlertCenter alerts={alerts} loading={secondaryLoading} />
          <ActivityFeed activity={activity} loading={secondaryLoading} />
        </div>
      </div>



      {/* ━━━ ITEM OVERVIEW + INVENTORY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="erp-row erp-row--a">
        <div className="erp-col erp-col--wide">
          <ItemOverview
            items={visibleItems}
            totalItems={filteredItems.length}
            loading={secondaryLoading}
            search={itemSearch}
            onSearch={setItemSearch}
            onOpen={openItemDetail}
            nav={() => navigate('/production/inventory-report')}
          />
        </div>
        <div className="erp-col erp-col--narrow">
          <InventoryHealth inventory={inventory} loading={secondaryLoading} nav={navigate} />
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
            loading={secondaryLoading}
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
            loading={secondaryLoading}
            emptyTitle="No sales orders"
            emptyDesc="Open orders will appear here once sales is configured"
            nav={() => navigate('/sales/orders')}
          />
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
                  <GlobalLoading title="Loading Item Details..." subtitle="Retrieving item master, stock and production route..." badgeText="LIVE DATABASE QUERY" minHeight={260} />
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
                            <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}><ArrowRightOutlined /></div>
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
                        <div style={{ color: 'var(--theme-accent, #0284c7)', fontSize: 14, flexShrink: 0 }}><ArrowRightOutlined /></div>
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

      {/* ━━━ SHOP FLOOR OPERATOR TOUCHSCREEN INTERFACE MODAL ━━━ */}
      <ShopfloorTouchscreenModal
        visible={touchscreenOpen}
        onClose={() => setTouchscreenOpen(false)}
        onSuccess={() => void loadAll()}
      />
    </div>
  </TabKeepAlive>
  );
};

export default Dashboard;