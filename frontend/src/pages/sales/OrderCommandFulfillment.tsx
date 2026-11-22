import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Badge,
  Button,
  DatePicker,
  Empty,
  Grid,
  Input,
  Progress,
  Spin,
  Switch,
  Tag,
  Tooltip,
  theme,
} from 'antd';
import {
  ApartmentOutlined,
  CalendarOutlined,
  CarOutlined,
  ClearOutlined,
  ClockCircleOutlined,
  CreditCardOutlined,
  DownOutlined,
  ExportOutlined,
  FilterOutlined,
  InboxOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingCartOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { usePermission } from '../../hooks/usePermission';
import CardSelectDropdown from '../../components/dashboard/CardSelectDropdown';
import {
  buildTopCustomersForCommand,
  computeOrderCommandKpis,
  DEFAULT_ORDER_COMMAND_DATE_PRESET,
  findDefaultOrderCommandDivision,
  getOrderCommandDateBadge,
  getOrderCommandDatePresetOptions,
  isOrderDateInRange,
  OrderCommandDatePreset,
  resolveOrderCommandDateRange,
  TopCommandCustomerCard,
} from './orderCommandFilters.util';

export interface OrderCommandItem {
  id: string;
  itemId: string | null;
  itemCode: string;
  itemName: string;
  uomCode: string;
  ordered: number;
  dispatched: number;
  pending: number;
  readyPacked: number;
  readySinceDate: string | null;
  readyAgeDays: number | null;
  remainingToPack: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
  taxAmount: number;
  lineTotal: number;
}

export interface OrderCommandLinkedDelivery {
  deliveryId: string;
  deliveryNumber: string;
  gatePassNumber: string | null;
  deliveryDate: string | null;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  dispatchedQty: number;
  totalAmount: number;
}

export interface OrderCommandOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  customerPo: string | null;
  divisionId: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  orderDate: string | null;
  orderAgeDays?: number | null;
  deliveryDate: string | null;
  currency: string;
  status: string;
  category: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  paymentTerms: string;
  orderedQty: number;
  dispatchedQty: number;
  pendingQty: number;
  readyPackedQty: number;
  readySinceDate: string | null;
  readyAgeDays: number | null;
  remainingToPackQty: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  uomCode: string;
  items: OrderCommandItem[];
  linkedDeliveries: OrderCommandLinkedDelivery[];
}

export interface OrderCommandCustomerSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  paymentTerms: string;
  creditDays: number;
  openOrderCount: number;
  completedOrderCount: number;
  cancelledOrderCount: number;
  totalOrderedQty: number;
  totalDispatchedQty: number;
  totalPendingQty: number;
  totalReadyPackedQty: number;
  oldestReadyAgeDays: number | null;
  totalRemainingToPackQty: number;
  totalOpenValue: number;
  totalDispatchedValue: number;
  totalOrderValue: number;
}

interface OrderCommandOverviewPayload {
  orders: OrderCommandOrder[];
  customers: OrderCommandCustomerSummary[];
  divisions: Array<{ id: string; divisionCode: string; name: string }>;
  generatedAt: string;
}

const getAgingPalette = (days: number | null): { bg: string; border: string; color: string; tagColor: string } => {
  if (days === null || days <= 3) {
    return {
      bg: 'rgba(16, 185, 129, 0.14)',
      border: 'rgba(16, 185, 129, 0.35)',
      color: '#059669',
      tagColor: 'success',
    };
  }
  if (days <= 7) {
    return {
      bg: 'rgba(245, 158, 11, 0.15)',
      border: 'rgba(245, 158, 11, 0.38)',
      color: '#d97706',
      tagColor: 'warning',
    };
  }
  return {
    bg: 'rgba(220, 38, 38, 0.14)',
    border: 'rgba(220, 38, 38, 0.35)',
    color: '#dc2626',
    tagColor: 'error',
  };
};

const getOrderAgePalette = (days: number | null): { bg: string; border: string; color: string } => {
  if (days !== null && days > 45) {
    return { bg: 'rgba(220, 38, 38, 0.12)', border: 'rgba(220, 38, 38, 0.35)', color: '#dc2626' };
  }
  if (days !== null && days > 30) {
    return { bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.38)', color: '#d97706' };
  }
  return { bg: 'rgba(37, 99, 235, 0.10)', border: 'rgba(37, 99, 235, 0.30)', color: '#2563eb' };
};

const computeOrderAgeDays = (order: Pick<OrderCommandOrder, 'orderAgeDays' | 'orderDate'>): number | null => {
  if (order.orderAgeDays !== undefined && order.orderAgeDays !== null) {
    return order.orderAgeDays;
  }
  if (!order.orderDate) return null;
  const days = dayjs().diff(dayjs(order.orderDate), 'day');
  return Number.isFinite(days) ? Math.max(0, days) : null;
};

const getStatusTagColor = (status?: string | null): string => {
  const s = String(status || '').toUpperCase();
  if (['DELIVERED', 'COMPLETED', 'CLOSED', 'CONFIRMED'].includes(s)) return 'green';
  if (['SHIPPED', 'PROCESSING'].includes(s)) return 'blue';
  if (['CANCELLED', 'VOID'].includes(s)) return 'red';
  return 'orange';
};

const splitDoubleUnderscoreName = (name?: string | null): { primary: string; secondary: string } => {
  const raw = String(name || 'Item').trim();
  const parts = raw.split('__').map((p) => p.trim()).filter(Boolean);
  return {
    primary: parts[0] || raw,
    secondary: parts.slice(1).join(' '),
  };
};

const OrderCommandFulfillment: React.FC = () => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isWideSplit = screens.lg !== false;
  const navigate = useNavigate();
  const location = useLocation();
  const { can } = usePermission();
  const canCreateDelivery = can('sales.deliveries.create');
  const routeTabId = location.pathname || '/sales/order-command';

  useEffect(() => {
    const store = useHeaderActions.getState();
    store.claimActionsSlot(routeTabId);
    return () => store.releaseActionsSlot(routeTabId);
  }, [routeTabId]);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OrderCommandOverviewPayload>({
    orders: [],
    customers: [],
    divisions: [],
    generatedAt: '',
  });

  // Applied Filters & Date Range (default initial: DIV-001-SPI Spoke Division + This Month)
  const hasInitializedDefaultDivisionRef = useRef<boolean>(false);
  const [filterDivisionId, setFilterDivisionId] = useState<string | undefined>(undefined);
  const [filterCustomerId, setFilterCustomerId] = useState<string | undefined>(undefined);
  const [searchText, setSearchText] = useState<string>('');
  const [readyOnly, setReadyOnly] = useState<boolean>(false);
  const [dateRangePreset, setDateRangePreset] = useState<OrderCommandDatePreset>(
    DEFAULT_ORDER_COMMAND_DATE_PRESET,
  );
  const [customRange, setCustomRange] = useState<[string, string] | undefined>(undefined);

  // Collapsible Dashboard-Style Filter Drawer Draft State
  const [filtersOpen, setFiltersOpen] = useState<boolean>(false);
  const [draftDivisionId, setDraftDivisionId] = useState<string | undefined>(undefined);
  const [draftCustomerId, setDraftCustomerId] = useState<string | undefined>(undefined);
  const [draftSearchText, setDraftSearchText] = useState<string>('');
  const [draftReadyOnly, setDraftReadyOnly] = useState<boolean>(false);

  // Collapsible Section States (Ready to Dispatch & Pending / Awaiting Packing expanded by default; Completed & Cancelled collapsed)
  const [expandedSections, setExpandedSections] = useState<{
    READY_DISPATCH: boolean;
    AWAITING_PACKING: boolean;
    COMPLETED: boolean;
    CANCELLED: boolean;
  }>({
    READY_DISPATCH: true,
    AWAITING_PACKING: true,
    COMPLETED: false,
    CANCELLED: false,
  });

  // Dual-Mode Inspector State
  const [inspectorMode, setInspectorMode] = useState<'SOC' | 'CUSTOMER'>('SOC');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const fetchOverview = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (forceRefresh) params.refresh = 'true';
      const res = await apiService.get<{ data?: OrderCommandOverviewPayload } & OrderCommandOverviewPayload>(
        '/sales/orders/command-overview',
        params,
      );
      const data: OrderCommandOverviewPayload = (res as any)?.data || res || {
        orders: [],
        customers: [],
        divisions: [],
        generatedAt: new Date().toISOString(),
      };
      setOverview(data);

      let initialDivId: string | undefined;
      if (!hasInitializedDefaultDivisionRef.current && Array.isArray(data.divisions) && data.divisions.length > 0) {
        hasInitializedDefaultDivisionRef.current = true;
        const defaultDiv = findDefaultOrderCommandDivision(data.divisions);
        if (defaultDiv) {
          initialDivId = defaultDiv.id;
          setFilterDivisionId(defaultDiv.id);
          setDraftDivisionId(defaultDiv.id);
        }
      }

      // Default select first Pending SOC inside active/initial division if none selected
      setSelectedOrderId((prev) => {
        if (prev && (data.orders || []).some((o) => o.id === prev)) return prev;
        const pool = initialDivId
          ? (data.orders || []).filter((o) => o.divisionId === initialDivId)
          : data.orders || [];
        const firstPending = pool.find((o) => o.category === 'PENDING');
        return firstPending?.id || pool[0]?.id || data.orders?.[0]?.id || null;
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load order command data';
      setError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOverview(false);
  }, [fetchOverview]);

  useEffect(() => {
    const onTabRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.tabId || String(detail.tabId).includes('order-command')) {
        void fetchOverview(true);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, onTabRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, onTabRefresh);
  }, [fetchOverview]);

  // Register Header Actions cleanly into Top Bar
  useEffect(() => {
    const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
    setHeaderActions([
      {
        key: 'refresh-command',
        node: (
          <Button
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => void fetchOverview(true)}
          >
            Refresh
          </Button>
        ),
      },
      {
        key: 'open-sales-orders',
        node: (
          <Button
            icon={<ShoppingCartOutlined />}
            onClick={() => navigate('/sales/orders')}
          >
            Sales Orders
          </Button>
        ),
      },
    ], routeTabId);
    return () => clearHeaderActions(routeTabId);
  }, [fetchOverview, loading, navigate, routeTabId]);

  const activeDateRange = useMemo(
    () => resolveOrderCommandDateRange(dateRangePreset, customRange),
    [dateRangePreset, customRange],
  );

  // Client-side zero-latency filtering (preserves Supabase egress)
  const filteredOrders = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const isAllOpen = dateRangePreset === 'allOpen';
    return (overview.orders || []).filter((o) => {
      if (filterDivisionId && o.divisionId !== filterDivisionId) return false;
      if (filterCustomerId && o.customerId !== filterCustomerId) return false;
      if (readyOnly && o.readyPackedQty <= 0) return false;
      if (!isAllOpen && (activeDateRange.dateFrom || activeDateRange.dateTo)) {
        const orderInRange = isOrderDateInRange(
          o.orderDate,
          activeDateRange.dateFrom,
          activeDateRange.dateTo,
        );
        const deliveryInRange = (o.linkedDeliveries || []).some(
          (ld) =>
            ['CONFIRMED', 'DELIVERED', 'SHIPPED'].includes(String(ld.status || '').toUpperCase()) &&
            isOrderDateInRange(ld.deliveryDate, activeDateRange.dateFrom, activeDateRange.dateTo),
        );
        if (!orderInRange && !deliveryInRange) return false;
      }
      if (q) {
        const matchesHeader =
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          o.customerCode.toLowerCase().includes(q) ||
          String(o.customerPo || '').toLowerCase().includes(q) ||
          String(o.divisionName || '').toLowerCase().includes(q);
        const matchesItem = (o.items || []).some(
          (it) => it.itemCode.toLowerCase().includes(q) || it.itemName.toLowerCase().includes(q),
        );
        if (!matchesHeader && !matchesItem) return false;
      }
      return true;
    });
  }, [
    overview.orders,
    filterDivisionId,
    filterCustomerId,
    readyOnly,
    searchText,
    dateRangePreset,
    activeDateRange.dateFrom,
    activeDateRange.dateTo,
  ]);

  // Top 5 Customers ranked dynamically by Dispatched / Order Volume for selected Date Range & Division
  const topCustomers = useMemo<TopCommandCustomerCard[]>(
    () =>
      buildTopCustomersForCommand(overview.orders || [], {
        preset: dateRangePreset,
        dateFrom: activeDateRange.dateFrom,
        dateTo: activeDateRange.dateTo,
        divisionId: filterDivisionId,
        limit: 5,
      }),
    [overview.orders, dateRangePreset, activeDateRange.dateFrom, activeDateRange.dateTo, filterDivisionId],
  );

  const groupedOrders = useMemo(() => {
    const pendingAll = filteredOrders.filter((o) => o.category === 'PENDING');
    const readyToDispatch = pendingAll
      .filter((o) => o.remainingToPackQty <= 0.001 && o.readyPackedQty > 0)
      .sort((a, b) => {
        const ageDiff = (b.readyAgeDays ?? -1) - (a.readyAgeDays ?? -1);
        if (ageDiff !== 0) return ageDiff;
        return String(a.orderDate || '').localeCompare(String(b.orderDate || ''));
      });
    const awaitingPacking = pendingAll.filter(
      (o) => !(o.remainingToPackQty <= 0.001 && o.readyPackedQty > 0),
    );
    const completed = filteredOrders.filter((o) => o.category === 'COMPLETED');
    const cancelled = filteredOrders.filter((o) => o.category === 'CANCELLED');
    return { pending: pendingAll, readyToDispatch, awaitingPacking, completed, cancelled };
  }, [filteredOrders]);

  const sectionTotals = useMemo(() => {
    const calc = (list: OrderCommandOrder[]) => ({
      count: list.length,
      qty: Math.round(list.reduce((s, o) => s + o.orderedQty, 0) * 100) / 100,
      pendingQty: Math.round(list.reduce((s, o) => s + o.pendingQty, 0) * 100) / 100,
      readyQty: Math.round(list.reduce((s, o) => s + o.readyPackedQty, 0) * 100) / 100,
      amount: Math.round(list.reduce((s, o) => s + o.totalAmount, 0) * 100) / 100,
    });
    return {
      READY_DISPATCH: calc(groupedOrders.readyToDispatch),
      AWAITING_PACKING: calc(groupedOrders.awaitingPacking),
      COMPLETED: calc(groupedOrders.completed),
      CANCELLED: calc(groupedOrders.cancelled),
    };
  }, [groupedOrders]);

  const selectedOrder = useMemo(() => {
    const firstActive =
      groupedOrders.readyToDispatch[0] ||
      groupedOrders.awaitingPacking[0] ||
      filteredOrders[0] ||
      null;
    if (!selectedOrderId) return firstActive;
    return (
      filteredOrders.find((o) => o.id === selectedOrderId) ||
      overview.orders.find((o) => o.id === selectedOrderId) ||
      firstActive
    );
  }, [
    selectedOrderId,
    filteredOrders,
    groupedOrders.readyToDispatch,
    groupedOrders.awaitingPacking,
    overview.orders,
  ]);

  const selectedCustomer = useMemo(() => {
    const targetId = selectedCustomerId || selectedOrder?.customerId;
    if (!targetId) return null;
    return overview.customers.find((c) => c.customerId === targetId) || null;
  }, [selectedCustomerId, selectedOrder?.customerId, overview.customers]);

  const selectedCustomerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return (overview.orders || []).filter((o) => o.customerId === selectedCustomer.customerId);
  }, [overview.orders, selectedCustomer]);

  const handleSelectSoc = (order: OrderCommandOrder) => {
    setSelectedOrderId(order.id);
    setSelectedCustomerId(order.customerId);
    setInspectorMode('SOC');
  };

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setInspectorMode('CUSTOMER');
  };

  const handleSelectTopCustomerCard = (customerId: string) => {
    setFilterCustomerId(customerId);
    setDraftCustomerId(customerId);
    setSelectedCustomerId(customerId);
    setInspectorMode('CUSTOMER');
  };

  const handleApplyFilters = () => {
    setFilterDivisionId(draftDivisionId);
    setFilterCustomerId(draftCustomerId);
    setSearchText(draftSearchText);
    setReadyOnly(draftReadyOnly);
    setFiltersOpen(false);
  };

  const handleClearAllFilterChips = () => {
    setDraftDivisionId(undefined);
    setDraftCustomerId(undefined);
    setDraftSearchText('');
    setDraftReadyOnly(false);
    setFilterDivisionId(undefined);
    setFilterCustomerId(undefined);
    setSearchText('');
    setReadyOnly(false);
  };

  const handleResetFilters = () => {
    handleClearAllFilterChips();
    setDateRangePreset(DEFAULT_ORDER_COMMAND_DATE_PRESET);
    setCustomRange(undefined);
  };

  const handleRemoveChip = (key: 'division' | 'customer' | 'search' | 'readyOnly') => {
    if (key === 'division') {
      setFilterDivisionId(undefined);
      setDraftDivisionId(undefined);
    } else if (key === 'customer') {
      setFilterCustomerId(undefined);
      setDraftCustomerId(undefined);
    } else if (key === 'search') {
      setSearchText('');
      setDraftSearchText('');
    } else if (key === 'readyOnly') {
      setReadyOnly(false);
      setDraftReadyOnly(false);
    }
  };

  const toggleSection = (
    key: 'READY_DISPATCH' | 'AWAITING_PACKING' | 'COMPLETED' | 'CANCELLED',
  ) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const divisionDropdownOptions = useMemo(
    () =>
      (overview.divisions || []).map((d) => ({
        id: d.id,
        name: d.name,
        code: d.divisionCode,
        subtext: 'Sales Division',
      })),
    [overview.divisions],
  );

  const customerDropdownOptions = useMemo(
    () =>
      (overview.customers || []).map((c) => ({
        id: c.customerId,
        name: c.customerName,
        code: c.customerCode,
        subtext:
          c.openOrderCount > 0
            ? `${c.openOrderCount} open SOC(s) · Pend: ${formatDecimal(c.totalPendingQty, 0)} GRS`
            : `${c.completedOrderCount} completed order(s)`,
      })),
    [overview.customers],
  );

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: 'division' | 'customer' | 'search' | 'readyOnly'; label: string; value: string }> = [];
    if (filterDivisionId) {
      const d = (overview.divisions || []).find((x) => x.id === filterDivisionId);
      chips.push({
        key: 'division',
        label: 'Division',
        value: d ? `${d.divisionCode ?? ''} ${d.name}`.trim() : filterDivisionId,
      });
    }
    if (filterCustomerId) {
      const c = (overview.customers || []).find((x) => x.customerId === filterCustomerId);
      chips.push({
        key: 'customer',
        label: 'Customer',
        value: c ? c.customerName : filterCustomerId,
      });
    }
    if (searchText.trim()) {
      chips.push({
        key: 'search',
        label: 'Search',
        value: searchText.trim(),
      });
    }
    if (readyOnly) {
      chips.push({
        key: 'readyOnly',
        label: 'Stock',
        value: 'Ready Stock Only',
      });
    }
    return chips;
  }, [filterDivisionId, filterCustomerId, searchText, readyOnly, overview.divisions, overview.customers]);

  const hasDraftChanges =
    draftDivisionId !== filterDivisionId ||
    draftCustomerId !== filterCustomerId ||
    draftSearchText !== searchText ||
    draftReadyOnly !== readyOnly;

  const hasAnyFilter =
    activeFilterChips.length > 0 ||
    hasDraftChanges ||
    dateRangePreset !== DEFAULT_ORDER_COMMAND_DATE_PRESET;

  const activeDivisionLabel = useMemo(() => {
    if (!filterDivisionId) return 'All Divisions';
    return (overview.divisions || []).find((d) => d.id === filterDivisionId)?.name || 'Selected Division';
  }, [filterDivisionId, overview.divisions]);

  const activeDateBadge = useMemo(
    () => getOrderCommandDateBadge(dateRangePreset, activeDateRange.dateFrom, activeDateRange.dateTo),
    [dateRangePreset, activeDateRange.dateFrom, activeDateRange.dateTo],
  );

  const datePresetOptions = useMemo(() => getOrderCommandDatePresetOptions(), []);

  const periodKpiMetrics = useMemo(() => {
    const kpis = computeOrderCommandKpis(overview.orders || [], {
      preset: dateRangePreset,
      dateFrom: activeDateRange.dateFrom,
      dateTo: activeDateRange.dateTo,
      divisionId: filterDivisionId,
      customerId: filterCustomerId,
      searchText,
      readyOnly,
    });
    const isAllOpen = dateRangePreset === 'allOpen';
    return {
      ...kpis,
      orderedSub: isAllOpen
        ? `Across ${kpis.openOrderCount} active open SOC(s)`
        : `Opening Pending: ${formatDecimal(kpis.openingPendingGross, 0)} + New in ${kpis.periodShortTag}: ${formatDecimal(kpis.newInPeriodGross, 0)}`,
      orderedTooltip: isAllOpen
        ? `Total Order Load across ${kpis.openOrderCount} open SOC(s)`
        : `Opening Prior Pending (${kpis.openingOrdersCount} SOCs): ${formatDecimal(kpis.openingPendingGross, 0)} ${kpis.primaryUom} + New Orders in Period (${kpis.newOrdersCount} SOCs): ${formatDecimal(kpis.newInPeriodGross, 0)} ${kpis.primaryUom} = ${formatDecimal(kpis.totalOrderLoad, 0)} ${kpis.primaryUom}`,
      dispatchedSub: isAllOpen
        ? `${kpis.dispatchedPct}% of open order demand`
        : `${kpis.dispatchedPct}% of Total Order Load (${activeDateBadge})`,
      pendingSub: isAllOpen
        ? 'All prior & current months included'
        : `Total Order Load − Dispatched (${kpis.periodShortTag})`,
    };
  }, [
    overview.orders,
    dateRangePreset,
    activeDateRange.dateFrom,
    activeDateRange.dateTo,
    filterDivisionId,
    filterCustomerId,
    searchText,
    readyOnly,
    activeDateBadge,
  ]);

  const renderOrderRow = (order: OrderCommandOrder) => {
    const isSelected = inspectorMode === 'SOC' && selectedOrder?.id === order.id;
    const aging = getAgingPalette(order.readyAgeDays);
    const hasReady = order.readyPackedQty > 0;

    return (
      <div
        key={order.id}
        onClick={() => handleSelectSoc(order)}
        style={{
          padding: '9px 12px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          backgroundColor: isSelected ? token.colorPrimaryBg : token.colorBgContainer,
          borderLeft: isSelected ? `3px solid ${token.colorPrimary}` : '3px solid transparent',
          cursor: 'pointer',
          transition: 'background-color 0.15s ease',
        }}
      >
        {/* Line 1: Clickable Customer (Code Pill + Name) | Clickable SOC # + Date | Amount */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
            <Tooltip title="Click to inspect Customer 360° Portfolio">
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectCustomer(order.customerId);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                    handleSelectCustomer(order.customerId);
                  }
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    fontFamily: 'monospace',
                    padding: '1px 5px',
                    borderRadius: 4,
                    backgroundColor: token.colorFillAlter,
                    border: `1px solid ${token.colorBorder}`,
                    color: token.colorPrimary,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {order.customerCode}
                </span>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: token.colorText,
                    textDecoration: 'underline',
                    textDecorationColor: token.colorBorder,
                    textUnderlineOffset: 2,
                  }}
                >
                  {order.customerName}
                </span>
              </span>
            </Tooltip>

            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleSelectSoc(order);
              }}
              style={{
                fontSize: 11,
                fontWeight: 800,
                fontFamily: 'monospace',
                padding: '1px 7px',
                borderRadius: 4,
                backgroundColor: 'rgba(37, 99, 235, 0.12)',
                border: '1px solid rgba(37, 99, 235, 0.28)',
                color: '#2563eb',
                whiteSpace: 'nowrap',
              }}
            >
              {order.orderNumber}
            </span>

            {order.orderDate && (
              <span style={{ fontSize: 11, color: token.colorTextTertiary, whiteSpace: 'nowrap' }}>
                {dayjs(order.orderDate).format('DD-MMM-YY')}
              </span>
            )}
            {(() => {
              const ageDays = computeOrderAgeDays(order);
              if (ageDays === null) return null;
              const agePal = getOrderAgePalette(ageDays);
              return (
                <Tooltip title={`Order placed ${ageDays} day(s) ago (${order.orderDate})`}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 4,
                      backgroundColor: agePal.bg,
                      border: `1px solid ${agePal.border}`,
                      color: agePal.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Order Age: {ageDays}d
                  </span>
                </Tooltip>
              );
            })()}
          </div>

          <div
            style={{
              fontSize: 12.5,
              fontWeight: 800,
              color: token.colorText,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
            }}
          >
            {order.currency} {formatDecimal(order.totalAmount, 0)}
          </div>
        </div>

        {/* Line 2: Compact 5-Figure Fulfillment Pills + Ready Aging Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', fontSize: 11 }}>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: token.colorFillAlter,
                color: token.colorTextSecondary,
                fontWeight: 600,
              }}
            >
              Ord: <strong style={{ color: token.colorText }}>{formatDecimal(order.orderedQty, 0)}</strong>
            </span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: token.colorFillAlter,
                color: token.colorTextSecondary,
                fontWeight: 600,
              }}
            >
              Disp: <strong style={{ color: '#0284c7' }}>{formatDecimal(order.dispatchedQty, 0)}</strong>
            </span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: order.pendingQty > 0 ? 'rgba(234, 88, 12, 0.10)' : token.colorFillAlter,
                color: order.pendingQty > 0 ? '#ea580c' : token.colorTextTertiary,
                fontWeight: 700,
              }}
            >
              Pend: {formatDecimal(order.pendingQty, 0)}
            </span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: hasReady ? 'rgba(16, 185, 129, 0.15)' : token.colorFillAlter,
                border: hasReady ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid transparent',
                color: hasReady ? '#059669' : token.colorTextTertiary,
                fontWeight: 700,
              }}
            >
              Ready: {formatDecimal(order.readyPackedQty, 0)}
            </span>
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 4,
                backgroundColor: token.colorFillAlter,
                color: order.remainingToPackQty > 0 ? token.colorText : token.colorTextTertiary,
                fontWeight: 600,
              }}
            >
              To Pack: <strong>{formatDecimal(order.remainingToPackQty, 0)}</strong>
            </span>
          </div>

          {hasReady && order.readyAgeDays !== null && (
            <Tooltip title={`Packed/allocated stock waiting ${order.readyAgeDays} day(s) for customer pickup`}>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  padding: '1px 7px',
                  borderRadius: 10,
                  backgroundColor: aging.bg,
                  border: `1px solid ${aging.border}`,
                  color: aging.color,
                  whiteSpace: 'nowrap',
                }}
              >
                Ready {order.readyAgeDays}d
              </span>
            </Tooltip>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (
    key: 'READY_DISPATCH' | 'AWAITING_PACKING' | 'COMPLETED' | 'CANCELLED',
    title: string,
    list: OrderCommandOrder[],
    accentColor: string,
  ) => {
    const isExpanded = expandedSections[key];
    const totals = sectionTotals[key];
    const isPrimaryOpen = key === 'READY_DISPATCH' || key === 'AWAITING_PACKING';

    return (
      <div
        key={key}
        style={{
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 10,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flex: isExpanded && key === 'AWAITING_PACKING' ? '1 1 auto' : '0 0 auto',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleSection(key)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') toggleSection(key);
          }}
          style={{
            padding: '10px 14px',
            backgroundColor: token.colorFillAlter,
            borderBottom: isExpanded ? `1px solid ${token.colorBorderSecondary}` : 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isExpanded ? <DownOutlined style={{ fontSize: 11 }} /> : <RightOutlined style={{ fontSize: 11 }} />}
            <span style={{ fontWeight: 800, fontSize: 13, color: token.colorText }}>{title}</span>
            <Badge
              count={totals.count}
              showZero
              style={{ backgroundColor: accentColor, fontWeight: 700 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5, color: token.colorTextSecondary }}>
            <span>
              Qty: <strong style={{ color: token.colorText }}>{formatDecimal(isPrimaryOpen ? totals.pendingQty : totals.qty, 0)}</strong>
            </span>
            <span>
              PKR <strong style={{ color: token.colorText }}>{formatDecimal(totals.amount, 0)}</strong>
            </span>
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              flex: key === 'AWAITING_PACKING' ? '1 1 auto' : undefined,
              minHeight: key === 'AWAITING_PACKING' ? 240 : undefined,
              maxHeight: isPrimaryOpen ? 'calc(100vh - 360px)' : 300,
              overflowY: 'auto',
            }}
          >
            {list.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: token.colorTextTertiary, fontSize: 12.5 }}>
                No orders in {title}.
              </div>
            ) : (
              list.map(renderOrderRow)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <Alert
          type="error"
          showIcon
          message="Unable to load Order Command & Fulfillment overview"
          description={error}
          action={
            <Button size="small" onClick={() => void fetchOverview(true)}>
              Retry
            </Button>
          }
        />
      )}

      {/* 1. Dashboard-Style Collapsible Filters Bar + DATE RANGE Selector */}
      <section
        aria-label="Order command filters"
        style={{
          backgroundColor: token.colorBgContainer,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 12,
          padding: '12px 16px',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.04)',
        }}
      >
        {/* Top Row: Filters Toggle & Chips on Left | DATE RANGE & Custom Picker on Right */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            paddingBottom: filtersOpen ? 10 : 0,
            borderBottom: filtersOpen ? `1px solid ${token.colorBorderSecondary}` : 'none',
            marginBottom: filtersOpen ? 12 : 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button
              type={filtersOpen ? 'primary' : 'default'}
              icon={<FilterOutlined />}
              onClick={() => setFiltersOpen((prev) => !prev)}
              style={{
                fontWeight: 600,
                borderRadius: 8,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                borderColor: token.colorPrimary,
                color: filtersOpen ? undefined : token.colorPrimary,
              }}
            >
              <span>{filtersOpen ? 'Close Filters' : 'Filters'}</span>
              {activeFilterChips.length > 0 && (
                <Badge
                  count={activeFilterChips.length}
                  style={{
                    backgroundColor: filtersOpen ? token.colorBgContainer : token.colorPrimary,
                    color: filtersOpen ? token.colorPrimary : token.colorWhite,
                    fontWeight: 700,
                  }}
                />
              )}
            </Button>

            {activeFilterChips.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                {activeFilterChips.map((chip) => (
                  <Tag
                    key={chip.key}
                    closable
                    onClose={(e) => {
                      e.preventDefault();
                      handleRemoveChip(chip.key);
                    }}
                    style={{
                      borderRadius: 12,
                      padding: '2px 8px',
                      fontSize: 12,
                      background: token.colorPrimaryBg,
                      borderColor: token.colorPrimaryBorder,
                      color: token.colorPrimary,
                    }}
                  >
                    <strong>{chip.label}:</strong> {chip.value}
                  </Tag>
                ))}
                <Button
                  type="link"
                  size="small"
                  onClick={handleClearAllFilterChips}
                  style={{ fontSize: 12, padding: '0 4px', color: token.colorError }}
                >
                  Clear all
                </Button>
              </div>
            )}
          </div>

          {/* Right Side: DATE RANGE CardSelectDropdown + Custom RangePicker */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 215 }}>
              <CardSelectDropdown
                label="Date Range"
                title="Select Date Range"
                subtitle="Pakistani Fiscal Year (Jul 1 – Jun 30)"
                allLabel="This Month"
                hideAllOption
                icon={<CalendarOutlined />}
                options={datePresetOptions.map((o) => ({
                  id: o.value,
                  name: o.label,
                  subtext: o.subtext,
                }))}
                activeId={dateRangePreset}
                onSelect={(v) => setDateRangePreset((v as OrderCommandDatePreset) || DEFAULT_ORDER_COMMAND_DATE_PRESET)}
                loading={loading}
                badgeBg="#f0f9ff"
                badgeColor="#0284c7"
              />
            </div>

            {dateRangePreset === 'custom' && (
              <DatePicker.RangePicker
                aria-label="Select custom date range"
                style={{ width: 230 }}
                value={
                  customRange && customRange[0] && customRange[1]
                    ? [dayjs(customRange[0]), dayjs(customRange[1])]
                    : undefined
                }
                onChange={(dates) => {
                  if (dates && dates[0] && dates[1]) {
                    setCustomRange([
                      dates[0].format('YYYY-MM-DD'),
                      dates[1].format('YYYY-MM-DD'),
                    ]);
                  }
                }}
                allowClear={false}
              />
            )}

            {!filtersOpen && hasDraftChanges && (
              <Button
                type="primary"
                size="middle"
                icon={<SearchOutlined />}
                onClick={handleApplyFilters}
                style={{ fontWeight: 600, borderRadius: 8 }}
              >
                Apply Pending Filters
              </Button>
            )}
          </div>
        </div>

        {/* Collapsible Filter Drawer */}
        {filtersOpen && (
          <>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: screens.lg
                  ? 'repeat(4, minmax(0, 1fr))'
                  : screens.md
                    ? 'repeat(2, minmax(0, 1fr))'
                    : '1fr',
                gap: 10,
                alignItems: 'stretch',
              }}
            >
              {/* 1. Division */}
              <CardSelectDropdown
                label="Division"
                title="Switch Division"
                subtitle="Filter orders, backlog & Top 5 Customers"
                allLabel="All Divisions"
                allSubtitle="All divisions combined"
                icon={<ApartmentOutlined />}
                options={divisionDropdownOptions}
                activeId={draftDivisionId}
                onSelect={(v) => setDraftDivisionId(v || undefined)}
                loading={loading}
                badgeBg="#fef9c3"
                badgeColor="#854d0e"
              />

              {/* 2. Customer */}
              <CardSelectDropdown
                label="Customer"
                title="Select Customer"
                subtitle="Search customer code or name"
                allLabel="All Customers"
                allSubtitle="View all customer orders"
                icon={<UserOutlined />}
                options={customerDropdownOptions}
                activeId={draftCustomerId}
                onSelect={(v) => setDraftCustomerId(v || undefined)}
                loading={loading}
                badgeBg="#e0f2fe"
                badgeColor="#0369a1"
              />

              {/* 3. Search SOC #, Customer, Item Code */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  borderRadius: 10,
                  padding: '6px 10px',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: token.colorTextSecondary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: 2,
                  }}
                >
                  Search Orders
                </div>
                <Input
                  size="small"
                  allowClear
                  variant="borderless"
                  prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                  placeholder="Search SOC #, Customer, Item Code..."
                  value={draftSearchText}
                  onChange={(e) => setDraftSearchText(e.target.value)}
                  onPressEnter={handleApplyFilters}
                  style={{ padding: 0, fontSize: 12.5, fontWeight: 600 }}
                />
              </div>

              {/* 4. Ready Stock Only Switch */}
              <Tooltip title="Show only orders with packed finished goods sitting in warehouse awaiting pickup">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setDraftReadyOnly((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDraftReadyOnly((v) => !v);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    background: draftReadyOnly ? 'rgba(16, 185, 129, 0.12)' : token.colorBgContainer,
                    border: `1px solid ${draftReadyOnly ? 'rgba(16, 185, 129, 0.45)' : token.colorBorderSecondary}`,
                    borderRadius: 10,
                    padding: '6px 12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: draftReadyOnly ? '#059669' : token.colorTextSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      Warehouse Filter
                    </div>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: draftReadyOnly ? '#059669' : token.colorText,
                        marginTop: 2,
                      }}
                    >
                      Ready Stock Only
                    </div>
                  </div>
                  <Switch
                    size="small"
                    checked={draftReadyOnly}
                    onChange={(checked, e) => {
                      e?.stopPropagation();
                      setDraftReadyOnly(checked);
                    }}
                  />
                </div>
              </Tooltip>
            </div>

            {/* Drawer Footer: Reset on Left | Apply Filters on Right */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
                paddingTop: 10,
                marginTop: 10,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Button
                icon={<ClearOutlined />}
                onClick={handleResetFilters}
                disabled={!hasAnyFilter}
                danger={hasAnyFilter}
                style={{ borderRadius: 8 }}
              >
                Reset
              </Button>

              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleApplyFilters}
                style={{ fontWeight: 600, borderRadius: 8, minWidth: 120 }}
              >
                {hasDraftChanges ? 'Apply Filters *' : 'Apply Filters'}
              </Button>
            </div>
          </>
        )}
      </section>

      {/* 2. Top 5 Customers Card Strip (Styled Like Dashboard TopCustomersRow, Click-to-Filter + Customer 360) */}
      <section aria-label="Top 5 Customers" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <TrophyOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
            <span style={{ fontSize: 15, fontWeight: 700, color: token.colorText }}>
              Top 5 Customers
            </span>
            <span
              data-testid="order-command-date-badge"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: token.colorTextSecondary,
                background: token.colorFillAlter,
                padding: '2px 9px',
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              {activeDateBadge}
            </span>
            <span
              data-testid="order-command-division-badge"
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: token.colorPrimary,
                background: token.colorPrimaryBg,
                padding: '2px 9px',
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              {activeDivisionLabel}
            </span>
          </div>

          {filterCustomerId && (
            <Button
              type="link"
              size="small"
              onClick={() => handleRemoveChip('customer')}
              style={{ fontSize: 12, padding: 0, fontWeight: 600 }}
            >
              Show All Customers
            </Button>
          )}
        </div>

        {topCustomers.length === 0 ? (
          <div
            data-testid="order-command-top-customers-empty"
            style={{
              backgroundColor: token.colorBgContainer,
              border: `1px dashed ${token.colorBorderSecondary}`,
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: token.colorFillAlter,
                color: token.colorTextSecondary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
              }}
            >
              <InboxOutlined />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: token.colorText }}>
                No Customer Activity in Selected Scope
              </div>
              <div style={{ fontSize: 11.5, color: token.colorTextSecondary }}>
                No sales orders or confirmed dispatches found for {activeDivisionLabel} ({activeDateBadge}).
              </div>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            {topCustomers.map((cust) => {
              const isCustomerActive = filterCustomerId === cust.customerId;
              return (
                <div
                  key={cust.customerId}
                  role="button"
                  tabIndex={0}
                  data-testid={`top-command-customer-card-${cust.rank}`}
                  onClick={() => handleSelectTopCustomerCard(cust.customerId)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectTopCustomerCard(cust.customerId);
                    }
                  }}
                  style={{
                    backgroundColor: isCustomerActive ? token.colorPrimaryBg : token.colorBgContainer,
                    border: isCustomerActive
                      ? `1.5px solid ${token.colorPrimary}`
                      : `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 12,
                    padding: '11px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    cursor: 'pointer',
                    boxShadow: isCustomerActive
                      ? '0 4px 12px rgba(37, 99, 235, 0.14)'
                      : '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                    transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: cust.accentBg,
                        color: cust.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: cust.rank <= 3 ? 18 : 13,
                        fontWeight: 800,
                        flexShrink: 0,
                      }}
                    >
                      {cust.rank === 1 ? '🥇' : cust.rank === 2 ? '🥈' : cust.rank === 3 ? '🥉' : `#${cust.rank}`}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: token.colorText,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={`${cust.customerName} — Click to filter & open Customer 360°`}
                      >
                        {cust.customerName}
                      </div>

                      <div
                        style={{
                          fontSize: 10.5,
                          color: token.colorTextSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{cust.customerCode}</span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            color: cust.color,
                            background: cust.accentBg,
                            padding: '0 5px',
                            borderRadius: 4,
                          }}
                        >
                          {cust.tag}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          marginTop: 4,
                          flexWrap: 'wrap',
                          fontSize: 10.5,
                        }}
                      >
                        <span style={{ fontWeight: 700, color: '#10b981' }}>
                          {formatDecimal(cust.soldGrs, 0)} GRS sold
                        </span>
                        {cust.cartons > 0 && (
                          <span style={{ color: token.colorTextSecondary }}>
                            · {formatDecimal(cust.cartons, 0)} CTN
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 10.5, fontWeight: 700, color: cust.pendingGrs > 0 ? '#ea580c' : token.colorTextTertiary }}>
                        Pending: {formatDecimal(cust.pendingGrs, 0)} GRS
                      </div>
                    </div>
                  </div>

                  <div style={{ flexShrink: 0, textAlign: 'center' }}>
                    <Tooltip
                      title={`${cust.customerName}: ${cust.completionPct}% completion (${formatDecimal(cust.soldGrs, 0)} sold vs ${formatDecimal(cust.pendingGrs, 0)} pending)`}
                    >
                      <Progress
                        type="circle"
                        percent={cust.completionPct}
                        size={44}
                        strokeWidth={8}
                        strokeColor={cust.color}
                        trailColor={token.colorFillAlter}
                        format={(p) => (
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: token.colorText }}>
                            {p}%
                          </span>
                        )}
                      />
                    </Tooltip>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. 5-Metric Executive Backlog Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 12,
        }}
      >
        {/* Metric 1: Total Order Load (Opening Prior Pending + Current Period New Orders) */}
        <Tooltip title={periodKpiMetrics.orderedTooltip}>
          <div
            data-testid="kpi-total-order-load"
            style={{
              backgroundColor: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 12,
              padding: '12px 16px',
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
              {dateRangePreset === 'allOpen' ? 'Total Order Load (Open SOCs)' : 'Total Order Load'}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
              {formatDecimal(periodKpiMetrics.totalOrderLoad, 0)}{' '}
              <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
                {periodKpiMetrics.primaryUom}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
              {periodKpiMetrics.orderedSub}
            </div>
          </div>
        </Tooltip>

        {/* Metric 2: Dispatched */}
        <div
          data-testid="kpi-dispatched"
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
            {dateRangePreset === 'allOpen' ? 'Dispatched' : 'Dispatched (Period)'}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
            {formatDecimal(periodKpiMetrics.dispatched, 0)}{' '}
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              {periodKpiMetrics.primaryUom}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
            {periodKpiMetrics.dispatchedSub}
          </div>
        </div>

        {/* Metric 3: Pending Order Balance */}
        <div
          data-testid="kpi-pending-balance"
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid rgba(234, 88, 12, 0.35)`,
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#ea580c' }}>
            Pending Order Balance
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ea580c', marginTop: 4 }}>
            {formatDecimal(periodKpiMetrics.pendingOrderBalance, 0)}{' '}
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              {periodKpiMetrics.primaryUom}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
            {periodKpiMetrics.pendingSub}
          </div>
        </div>

        {/* Metric 4: Ready Packed (Awaiting Pickup) */}
        <div
          data-testid="kpi-ready-packed"
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid rgba(16, 185, 129, 0.40)`,
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#059669' }}>
              Ready Packed (Pickup)
            </span>
            {periodKpiMetrics.oldestReadyAgeDays !== null && (
              <Tag color={getAgingPalette(periodKpiMetrics.oldestReadyAgeDays).tagColor} style={{ margin: 0, fontWeight: 700, fontSize: 10.5 }}>
                Up to {periodKpiMetrics.oldestReadyAgeDays}d waiting
              </Tag>
            )}
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669', marginTop: 4 }}>
            {formatDecimal(periodKpiMetrics.readyPacked, 0)}{' '}
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              {periodKpiMetrics.primaryUom}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
            {periodKpiMetrics.readyOrderCount} order(s) waiting for customer pickup
          </div>
        </div>

        {/* Metric 5: Remaining to Pack */}
        <div
          data-testid="kpi-remaining-to-pack"
          style={{
            backgroundColor: token.colorBgContainer,
            border: `1px solid ${token.colorBorderSecondary}`,
            borderRadius: 12,
            padding: '12px 16px',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: token.colorTextTertiary }}>
            Remaining to Pack
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: token.colorText, marginTop: 4 }}>
            {formatDecimal(periodKpiMetrics.remainingToPack, 0)}{' '}
            <span style={{ fontSize: 12, fontWeight: 600, color: token.colorTextSecondary }}>
              {periodKpiMetrics.primaryUom}
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: token.colorTextSecondary, marginTop: 2 }}>
            Pending Balance − Ready Packed
          </div>
        </div>
      </div>

      {/* 3. Master-Detail Split Workspace (48% Left List + 52% Right Live Inspector) */}
      <Spin spinning={loading}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isWideSplit ? 'minmax(0, 48fr) minmax(0, 52fr)' : '1fr',
            gap: 14,
            alignItems: 'stretch',
            minHeight: isWideSplit ? 'calc(100vh - 280px)' : undefined,
          }}
        >
          {/* Left Panel (48%) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, height: '100%' }}>
            {renderSection('READY_DISPATCH', 'Ready to Dispatch Orders', groupedOrders.readyToDispatch, '#10b981')}
            {renderSection('AWAITING_PACKING', 'Pending / Awaiting Packing', groupedOrders.awaitingPacking, '#d97706')}
            {renderSection('COMPLETED', 'Completed / Closed Orders', groupedOrders.completed, '#059669')}
            {renderSection('CANCELLED', 'Cancelled Orders', groupedOrders.cancelled, '#ef4444')}
          </div>

          {/* Right Panel (52%): Dual-Mode Live Inspector */}
          <div
            style={{
              backgroundColor: token.colorBgContainer,
              border: `1px solid ${token.colorBorderSecondary}`,
              borderRadius: 12,
              padding: 16,
              minWidth: 0,
              ...(isWideSplit ? { position: 'sticky' as const, top: 12 } : {}),
            }}
          >
            {/* Mode Switcher */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                paddingBottom: 12,
                marginBottom: 14,
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  type={inspectorMode === 'SOC' ? 'primary' : 'default'}
                  size="small"
                  icon={<ShoppingCartOutlined />}
                  onClick={() => setInspectorMode('SOC')}
                >
                  SOC Command Card
                </Button>
                <Button
                  type={inspectorMode === 'CUSTOMER' ? 'primary' : 'default'}
                  size="small"
                  icon={<UserOutlined />}
                  disabled={!selectedCustomer}
                  onClick={() => setInspectorMode('CUSTOMER')}
                >
                  Customer 360° Portfolio
                </Button>
              </div>
              {selectedOrder && (
                <span style={{ fontSize: 11.5, color: token.colorTextTertiary }}>
                  Active SOC: <strong>{selectedOrder.orderNumber}</strong>
                </span>
              )}
            </div>

            {inspectorMode === 'SOC' ? (
              !selectedOrder ? (
                <Empty description="Select an order on the left to inspect fulfillment and ready stock details." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Mode A Header */}
                  <div
                    style={{
                      backgroundColor: token.colorFillAlter,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      padding: '12px 14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 17, fontWeight: 800, color: token.colorText }}>
                            {selectedOrder.orderNumber}
                          </span>
                          <Tag color={getStatusTagColor(selectedOrder.status)} style={{ margin: 0, fontWeight: 700 }}>
                            {selectedOrder.status.toUpperCase()}
                          </Tag>
                          {selectedOrder.divisionName && (
                            <Tag color="purple" style={{ margin: 0, fontWeight: 600 }}>
                              {selectedOrder.divisionName}
                            </Tag>
                          )}
                          {(() => {
                            const ageDays = computeOrderAgeDays(selectedOrder);
                            if (ageDays === null) return null;
                            const agePal = getOrderAgePalette(ageDays);
                            return (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '2px 8px',
                                  borderRadius: 5,
                                  backgroundColor: agePal.bg,
                                  border: `1px solid ${agePal.border}`,
                                  color: agePal.color,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Order Age: {ageDays}d
                              </span>
                            );
                          })()}
                        </div>

                        {/* Stacked Customer Code Pill + Clickable Customer Name */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelectCustomer(selectedOrder.customerId)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, cursor: 'pointer' }}
                        >
                          <span
                            style={{
                              fontSize: 10.5,
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              padding: '1px 6px',
                              borderRadius: 4,
                              backgroundColor: token.colorBgContainer,
                              border: `1px solid ${token.colorBorder}`,
                              color: token.colorPrimary,
                            }}
                          >
                            {selectedOrder.customerCode}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 13.5, color: token.colorPrimary }}>
                            {selectedOrder.customerName}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {canCreateDelivery && selectedOrder.pendingQty > 0 && (
                          <Button
                            type="primary"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() =>
                              navigate(`/sales/deliveries?orderId=${encodeURIComponent(selectedOrder.id)}`)
                            }
                          >
                            Create Delivery / Gate Pass
                          </Button>
                        )}
                        <Button
                          size="small"
                          icon={<ExportOutlined />}
                          onClick={() => navigate('/sales/orders')}
                        >
                          Open in Sales Orders
                        </Button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                        gap: 8,
                        fontSize: 12,
                        paddingTop: 6,
                        borderTop: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div>
                        <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 10.5 }}>Order Date</span>
                        <strong style={{ color: token.colorText }}>
                          {selectedOrder.orderDate ? dayjs(selectedOrder.orderDate).format('DD-MMM-YYYY') : '-'}
                        </strong>
                      </div>
                      <div>
                        <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 10.5 }}>Payment Terms</span>
                        <strong style={{ color: token.colorText }}>{selectedOrder.paymentTerms}</strong>
                      </div>
                      <div>
                        <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 10.5 }}>Customer PO</span>
                        <strong style={{ color: token.colorText }}>{selectedOrder.customerPo || '-'}</strong>
                      </div>
                      <div>
                        <span style={{ color: token.colorTextTertiary, display: 'block', fontSize: 10.5 }}>Order Total</span>
                        <strong style={{ color: '#059669' }}>
                          {selectedOrder.currency} {formatDecimal(selectedOrder.totalAmount, 2)}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Mode A: Item-Wise Fulfillment Table */}
                  <div
                    style={{
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: token.colorFillAlter,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        fontWeight: 700,
                        fontSize: 12.5,
                        color: token.colorText,
                      }}
                    >
                      Item-Wise Fulfillment Breakdown ({selectedOrder.items.length})
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr
                            style={{
                              backgroundColor: token.colorFillAlter,
                              borderBottom: `1px solid ${token.colorBorderSecondary}`,
                              color: token.colorTextSecondary,
                              fontSize: 10.5,
                              textTransform: 'uppercase',
                            }}
                          >
                            <th style={{ padding: '8px 10px', textAlign: 'left' }}>Item Code &amp; Name</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Ordered</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Dispatched</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Pending Bal</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Ready Packed</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>To Pack</th>
                            <th style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>Rate</th>
                            <th style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>Tax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedOrder.items.map((it) => {
                            const { primary, secondary } = splitDoubleUnderscoreName(it.itemName);
                            const aging = getAgingPalette(it.readyAgeDays);
                            return (
                              <tr key={it.id} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                                <td style={{ padding: '8px 10px', verticalAlign: 'top' }}>
                                  <div style={{ marginBottom: 2 }}>
                                    <span
                                      style={{
                                        fontSize: 10,
                                        fontWeight: 800,
                                        fontFamily: 'monospace',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        backgroundColor: 'rgba(234, 88, 12, 0.12)',
                                        border: '1px solid rgba(234, 88, 12, 0.30)',
                                        color: '#ea580c',
                                      }}
                                    >
                                      {it.itemCode}
                                    </span>
                                  </div>
                                  <div style={{ fontWeight: 700, color: token.colorText, lineHeight: 1.3 }}>{primary}</div>
                                  {secondary && (
                                    <div style={{ fontSize: 11, color: token.colorTextSecondary, lineHeight: 1.25 }}>
                                      {secondary}
                                    </div>
                                  )}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                  {formatDecimal(it.ordered, 0)} {it.uomCode}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', color: '#0284c7', fontWeight: 600 }}>
                                  {formatDecimal(it.dispatched, 0)}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700, color: it.pending > 0 ? '#ea580c' : token.colorTextTertiary }}>
                                  {formatDecimal(it.pending, 0)}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: 700, color: it.readyPacked > 0 ? '#059669' : token.colorTextTertiary }}>
                                    {formatDecimal(it.readyPacked, 0)}
                                  </div>
                                  {it.readyPacked > 0 && it.readyAgeDays !== null && (
                                    <Tooltip title={`Undispatched packed stock waiting ${it.readyAgeDays} day(s) for customer pickup`}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: aging.color }}>
                                        Ready {it.readyAgeDays}d
                                      </div>
                                    </Tooltip>
                                  )}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                  {formatDecimal(it.remainingToPack, 0)}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                  {it.unitPrice <= 0 ? (
                                    <span style={{ color: '#dc2626', fontWeight: 800 }}>Rs 0</span>
                                  ) : (
                                    <span>Rs {formatDecimal(it.unitPrice, 2)}</span>
                                  )}
                                </td>
                                <td style={{ padding: '8px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                  {it.taxPercent > 0 ? (
                                    <Tag color="success" style={{ margin: 0, fontSize: 10.5, fontWeight: 700 }}>
                                      {it.taxPercent}% Tax
                                    </Tag>
                                  ) : (
                                    <Tag color="warning" style={{ margin: 0, fontSize: 10.5, fontWeight: 700 }}>
                                      0%
                                    </Tag>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Mode A: Linked Deliveries & Gate Passes */}
                  <div
                    style={{
                      border: `1px solid ${token.colorBorderSecondary}`,
                      borderRadius: 10,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        padding: '8px 12px',
                        backgroundColor: token.colorFillAlter,
                        borderBottom: `1px solid ${token.colorBorderSecondary}`,
                        fontWeight: 700,
                        fontSize: 12.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>
                        <CarOutlined style={{ marginRight: 6 }} />
                        Linked Deliveries &amp; Gate Passes ({selectedOrder.linkedDeliveries.length})
                      </span>
                    </div>
                    {selectedOrder.linkedDeliveries.length === 0 ? (
                      <div style={{ padding: '14px 12px', color: token.colorTextTertiary, fontSize: 12.5, textAlign: 'center' }}>
                        No deliveries or gate passes issued for this SOC yet.
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr
                              style={{
                                backgroundColor: token.colorFillAlter,
                                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                                color: token.colorTextSecondary,
                                fontSize: 10.5,
                                textTransform: 'uppercase',
                              }}
                            >
                              <th style={{ padding: '7px 10px', textAlign: 'left' }}>DN #</th>
                              <th style={{ padding: '7px 8px', textAlign: 'left' }}>Gate Pass #</th>
                              <th style={{ padding: '7px 8px', textAlign: 'left' }}>Date</th>
                              <th style={{ padding: '7px 8px', textAlign: 'right' }}>Dispatched</th>
                              <th style={{ padding: '7px 8px', textAlign: 'center' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedOrder.linkedDeliveries.map((d) => (
                              <tr key={d.deliveryId} style={{ borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                                <td style={{ padding: '7px 10px', fontWeight: 700, fontFamily: 'monospace' }}>
                                  {d.deliveryNumber}
                                </td>
                                <td style={{ padding: '7px 8px', fontFamily: 'monospace', color: '#2563eb', fontWeight: 700 }}>
                                  {d.gatePassNumber || '—'}
                                </td>
                                <td style={{ padding: '7px 8px', color: token.colorTextSecondary }}>
                                  {d.deliveryDate ? dayjs(d.deliveryDate).format('DD-MMM-YYYY') : '-'}
                                </td>
                                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700 }}>
                                  {formatDecimal(d.dispatchedQty, 0)} {selectedOrder.uomCode}
                                </td>
                                <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                                  <Tag color={getStatusTagColor(d.status)} style={{ margin: 0, fontWeight: 700, fontSize: 10.5 }}>
                                    {d.status}
                                  </Tag>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )
            ) : !selectedCustomer ? (
              <Empty description="Click any Customer Name to view their 360° order & ready-stock portfolio." />
            ) : (
              /* Mode B: Customer 360° Portfolio View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  style={{
                    backgroundColor: token.colorFillAlter,
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 10,
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                    <div>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 800,
                          fontFamily: 'monospace',
                          padding: '1px 6px',
                          borderRadius: 4,
                          backgroundColor: token.colorBgContainer,
                          border: `1px solid ${token.colorBorder}`,
                          color: token.colorPrimary,
                        }}
                      >
                        {selectedCustomer.customerCode}
                      </span>
                      <h3 style={{ margin: '4px 0 6px', fontSize: 17, fontWeight: 800, color: token.colorText }}>
                        {selectedCustomer.customerName}
                      </h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: token.colorTextSecondary }}>
                        {selectedCustomer.contactPerson && (
                          <span>
                            <UserOutlined style={{ marginRight: 4 }} />
                            {selectedCustomer.contactPerson}
                          </span>
                        )}
                        {(selectedCustomer.phone || selectedCustomer.mobile) && (
                          <span>
                            <PhoneOutlined style={{ marginRight: 4 }} />
                            {selectedCustomer.phone || selectedCustomer.mobile}
                          </span>
                        )}
                        {selectedCustomer.email && (
                          <span>
                            <MailOutlined style={{ marginRight: 4 }} />
                            {selectedCustomer.email}
                          </span>
                        )}
                        <span>
                          <CreditCardOutlined style={{ marginRight: 4 }} />
                          {selectedCustomer.paymentTerms}
                        </span>
                      </div>
                    </div>

                    {selectedCustomer.oldestReadyAgeDays !== null && (
                      <Tag
                        color={getAgingPalette(selectedCustomer.oldestReadyAgeDays).tagColor}
                        icon={<ClockCircleOutlined />}
                        style={{ margin: 0, fontWeight: 700 }}
                      >
                        Oldest Ready: {selectedCustomer.oldestReadyAgeDays}d waiting
                      </Tag>
                    )}
                  </div>

                  {/* Portfolio Metrics */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: 10,
                      marginTop: 12,
                      paddingTop: 12,
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10.5, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
                        Open Orders
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: token.colorText }}>
                        {selectedCustomer.openOrderCount}{' '}
                        <span style={{ fontSize: 11, fontWeight: 500, color: token.colorTextSecondary }}>
                          ({selectedCustomer.completedOrderCount} completed)
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
                        Pending Order Qty
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#ea580c' }}>
                        {formatDecimal(selectedCustomer.totalPendingQty, 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
                        Ready Packed Stock
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: '#059669' }}>
                        {formatDecimal(selectedCustomer.totalReadyPackedQty, 0)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: token.colorTextTertiary, textTransform: 'uppercase' }}>
                        Dispatched Value
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#0284c7' }}>
                        PKR {formatDecimal(selectedCustomer.totalDispatchedValue, 0)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* All Open + Completed Orders for Selected Customer */}
                <div
                  style={{
                    border: `1px solid ${token.colorBorderSecondary}`,
                    borderRadius: 10,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      padding: '8px 12px',
                      backgroundColor: token.colorFillAlter,
                      borderBottom: `1px solid ${token.colorBorderSecondary}`,
                      fontWeight: 700,
                      fontSize: 12.5,
                    }}
                  >
                    Customer Sales Orders ({selectedCustomerOrders.length}) — Click any SOC to Inspect
                  </div>
                  <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr
                          style={{
                            backgroundColor: token.colorFillAlter,
                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
                            color: token.colorTextSecondary,
                            fontSize: 10.5,
                            textTransform: 'uppercase',
                          }}
                        >
                          <th style={{ padding: '7px 10px', textAlign: 'left' }}>SOC #</th>
                          <th style={{ padding: '7px 8px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '7px 8px', textAlign: 'center' }}>Status</th>
                          <th style={{ padding: '7px 8px', textAlign: 'right' }}>Pend</th>
                          <th style={{ padding: '7px 8px', textAlign: 'right' }}>Ready</th>
                          <th style={{ padding: '7px 10px', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCustomerOrders.map((co) => (
                          <tr
                            key={co.id}
                            onClick={() => handleSelectSoc(co)}
                            style={{
                              borderBottom: `1px solid ${token.colorBorderSecondary}`,
                              cursor: 'pointer',
                              backgroundColor: selectedOrder?.id === co.id ? token.colorPrimaryBg : undefined,
                            }}
                          >
                            <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#2563eb' }}>
                              {co.orderNumber}
                            </td>
                            <td style={{ padding: '7px 8px', color: token.colorTextSecondary }}>
                              {co.orderDate ? dayjs(co.orderDate).format('DD-MMM-YY') : '-'}
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                              <Tag color={getStatusTagColor(co.status)} style={{ margin: 0, fontSize: 10.5, fontWeight: 700 }}>
                                {co.status}
                              </Tag>
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: co.pendingQty > 0 ? '#ea580c' : token.colorTextTertiary }}>
                              {formatDecimal(co.pendingQty, 0)}
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 700, color: co.readyPackedQty > 0 ? '#059669' : token.colorTextTertiary }}>
                              {formatDecimal(co.readyPackedQty, 0)}
                              {co.readyPackedQty > 0 && co.readyAgeDays !== null ? ` (${co.readyAgeDays}d)` : ''}
                            </td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700 }}>
                              {co.currency} {formatDecimal(co.totalAmount, 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Spin>
    </div>
  );
};

export default OrderCommandFulfillment;
