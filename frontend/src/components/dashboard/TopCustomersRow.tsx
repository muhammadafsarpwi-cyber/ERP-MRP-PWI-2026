import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Tooltip, Progress, Spin, theme } from 'antd';
import {
  RightOutlined,
  TrophyOutlined,
  ShoppingCartOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { matchesTabRefresh, TAB_REFRESH_EVENT } from '../../services/tabSessionCache';
import { DateRangePreset, dateRangePresetToFilters } from './dashboardShared';
import { getFiscalQuarterFromIso, getFiscalYearFromIso } from '../../utils/fiscalYear';
import dashboardService, {
  DashboardFilters,
  DashboardTopCustomersResponse,
} from '../../services/dashboardService';

export interface CustomerSalesItem {
  id: string;
  name: string;
  code: string;
  salesGross: number;
  cartons: number;
  sharePct: number;
  rank: number;
  tag: string;
  color: string;
  accentBg: string;
}

export interface PeriodSummaryData {
  priorOpenPendingGross: number;
  priorOpenOrdersCount: number;
  periodNewOrdersGross: number;
  periodNewOrdersCount: number;
  totalOrderedGross: number;
  totalSoldGross: number;
  totalSoldCartons: number;
  remainingBalanceGross: number;
  remainingPct: number;
  fulfillmentPct: number;
  ordersCount: number;
}

interface TopCustomersRowProps {
  customers?: CustomerSalesItem[];
  loading?: boolean;
  dateRangePreset?: DateRangePreset;
  appliedFilters?: DashboardFilters;
  lastEntryDate?: string | null;
  customRange?: [string, string];
  divisionLabel?: string;
  divisionReady?: boolean;
  onViewAll?: () => void;
  onOpenCustomer?: (customer: CustomerSalesItem) => void;
  onQuickAction?: () => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const RANK_STYLES = [
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.14)', tag: '#1 Top Volume' },
  { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.14)', tag: '#2 Volume Partner' },
  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.14)', tag: '#3 OEM Partner' },
];

const EMPTY_PERIOD_SUMMARY: PeriodSummaryData = {
  priorOpenPendingGross: 0,
  priorOpenOrdersCount: 0,
  periodNewOrdersGross: 0,
  periodNewOrdersCount: 0,
  totalOrderedGross: 0,
  totalSoldGross: 0,
  totalSoldCartons: 0,
  remainingBalanceGross: 0,
  remainingPct: 0,
  fulfillmentPct: 0,
  ordersCount: 0,
};

function parseIsoParts(iso?: string | null): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  };
}

function formatMonthYear(iso?: string | null, short = false): string {
  const parts = parseIsoParts(iso);
  if (!parts) return '';
  const list = short ? SHORT_MONTHS : MONTH_NAMES;
  const monthLabel = list[parts.month - 1] || '';
  return monthLabel ? `${monthLabel} ${parts.year}` : String(parts.year);
}

function formatQuarterLabel(iso?: string | null): string {
  const q = getFiscalQuarterFromIso(iso);
  return q ? `${q.quarterLabel} · ${q.shortRange}` : '';
}

function formatFiscalYearRangeLabel(iso?: string | null): string {
  const fy = getFiscalYearFromIso(iso);
  return fy ? fy.fullLabel : '';
}

function formatCustomRange(dateFrom?: string, dateTo?: string): string {
  const f = parseIsoParts(dateFrom);
  const t = parseIsoParts(dateTo);
  if (f && t) {
    if (dateFrom === dateTo) {
      return `${SHORT_MONTHS[f.month - 1]} ${f.day}, ${f.year}`;
    }
    if (f.year === t.year) {
      return `${SHORT_MONTHS[f.month - 1]} ${f.day} - ${SHORT_MONTHS[t.month - 1]} ${t.day}, ${t.year}`;
    }
    return `${dateFrom} to ${dateTo}`;
  }
  if (dateFrom) return `From ${dateFrom}`;
  if (dateTo) return `Up to ${dateTo}`;
  return 'Selected Period';
}

export function getTopCustomersPresetTitle(preset?: DateRangePreset): string {
  switch (preset) {
    case 'lastMonth':
      return 'Top Customers Last Month';
    case 'thisMonth':
      return 'Top Customers This Month';
    case 'thisQuarter':
      return 'Top Customers This Quarter';
    case 'lastQuarter':
      return 'Top Customers Last Quarter';
    case 'thisYear':
      return 'Top Customers This Year';
    case 'lastYear':
      return 'Top Customers Last Year';
    case 'today':
      return 'Top Customers Today';
    case 'yesterday':
      return 'Top Customers Yesterday';
    case 'custom':
      return 'Top Customers Selected Period';
    default:
      return 'Top Customers This Month';
  }
}

export function getTopCustomersPresetBadge(
  preset: DateRangePreset | undefined,
  dateFrom?: string,
  dateTo?: string,
): string {
  switch (preset) {
    case 'thisMonth': {
      const label = formatMonthYear(dateFrom || dateTo, false);
      return label ? `${label} Sales & Orders` : 'This Month Sales & Orders';
    }
    case 'lastMonth': {
      const label = formatMonthYear(dateFrom || dateTo, true);
      return label ? `Last Month Sales & Orders (${label})` : 'Last Month Sales & Orders';
    }
    case 'thisQuarter': {
      const q = formatQuarterLabel(dateFrom || dateTo);
      return q ? `This Quarter Sales & Orders (${q})` : 'This Quarter Sales & Orders';
    }
    case 'lastQuarter': {
      const q = formatQuarterLabel(dateFrom || dateTo);
      return q ? `Last Quarter Sales & Orders (${q})` : 'Last Quarter Sales & Orders';
    }
    case 'thisYear': {
      const fy = formatFiscalYearRangeLabel(dateFrom || dateTo);
      return fy ? `This Year Sales & Orders (${fy})` : 'This Year Sales & Orders';
    }
    case 'lastYear': {
      const fy = formatFiscalYearRangeLabel(dateFrom || dateTo);
      return fy ? `Last Year Sales & Orders (${fy})` : 'Last Year Sales & Orders';
    }
    case 'today':
      return dateFrom ? `Today Sales & Orders (${dateFrom})` : "Today's Sales & Orders";
    case 'yesterday':
      return dateFrom ? `Yesterday Sales & Orders (${dateFrom})` : "Yesterday's Sales & Orders";
    case 'custom':
      return `${formatCustomRange(dateFrom, dateTo)} Sales & Orders`;
    default:
      return 'Sales & Orders Summary';
  }
}

const TOP_CUSTOMERS_CACHE_TTL_MS = 30_000;
const responseCache = new Map<string, { payload: DashboardTopCustomersResponse; fetchedAt: number }>();

export function clearTopCustomersCache(): void {
  responseCache.clear();
}

export const TopCustomersRow: React.FC<TopCustomersRowProps> = ({
  customers,
  loading: externalLoading,
  dateRangePreset = 'thisMonth',
  appliedFilters,
  lastEntryDate,
  customRange,
  divisionLabel,
  divisionReady = true,
  onViewAll,
  onOpenCustomer,
}) => {
  const navigate = useNavigate();
  const { token } = theme.useToken();

  const [liveCustomers, setLiveCustomers] = useState<CustomerSalesItem[]>([]);
  const [periodSummary, setPeriodSummary] = useState<PeriodSummaryData>(EMPTY_PERIOD_SUMMARY);
  const [internalLoading, setInternalLoading] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    const onRefresh = (evt: Event) => {
      if (matchesTabRefresh(evt, '/dashboard')) {
        clearTopCustomersCache();
        setRefreshNonce((n) => n + 1);
      }
    };
    window.addEventListener(TAB_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(TAB_REFRESH_EVENT, onRefresh);
  }, []);

  const effectiveDateRange = useMemo(() => {
    if (appliedFilters?.dateFrom || appliedFilters?.dateTo) {
      return { dateFrom: appliedFilters.dateFrom, dateTo: appliedFilters.dateTo };
    }
    return dateRangePresetToFilters(dateRangePreset, lastEntryDate, customRange);
  }, [appliedFilters?.dateFrom, appliedFilters?.dateTo, dateRangePreset, lastEntryDate, customRange]);

  useEffect(() => {
    if (!divisionReady) return;

    const seq = ++fetchSeqRef.current;
    const divisionId = appliedFilters?.divisionId || undefined;
    const cacheKey = `${effectiveDateRange.dateFrom || ''}|${effectiveDateRange.dateTo || ''}|${divisionId || 'ALL'}`;
    const cached = refreshNonce === 0 ? responseCache.get(cacheKey) : undefined;

    const applyPayload = (data: DashboardTopCustomersResponse) => {
      const s = data.summary;
      setPeriodSummary({
        priorOpenPendingGross: Number(s?.priorOpenPendingGross || 0),
        priorOpenOrdersCount: Number(s?.priorOpenOrdersCount || 0),
        periodNewOrdersGross: Number(s?.periodNewOrdersGross || 0),
        periodNewOrdersCount: Number(s?.periodNewOrdersCount || 0),
        totalOrderedGross: Number(s?.totalOrderLoadGross || 0),
        totalSoldGross: Number(s?.totalSoldGross || 0),
        totalSoldCartons: Number(s?.totalSoldCartons || 0),
        remainingBalanceGross: Number(s?.remainingBalanceGross || 0),
        remainingPct: Number(s?.remainingPct || 0),
        fulfillmentPct: Number(s?.fulfillmentPct || 0),
        ordersCount: Number(s?.committedOrdersCount || 0),
      });

      const formatted: CustomerSalesItem[] = (data.topCustomers || []).slice(0, 3).map((c, idx) => {
        const style = RANK_STYLES[idx] || RANK_STYLES[2];
        return {
          id: c.id,
          name: c.name,
          code: c.code || `CUS-${String(idx + 1).padStart(3, '0')}`,
          salesGross: Number(c.salesGross || 0),
          cartons: Number(c.cartons || 0),
          sharePct: Number(c.sharePct || 0),
          rank: Number(c.rank || idx + 1),
          tag: style.tag,
          color: style.color,
          accentBg: style.bg,
        };
      });
      setLiveCustomers(formatted);
    };

    if (cached && Date.now() - cached.fetchedAt < TOP_CUSTOMERS_CACHE_TTL_MS) {
      applyPayload(cached.payload);
      return;
    }

    let isMounted = true;
    const loadTopCustomers = async () => {
      try {
        setInternalLoading(true);
        const res = await dashboardService.getSalesTopCustomers({
          dateFrom: effectiveDateRange.dateFrom,
          dateTo: effectiveDateRange.dateTo,
          divisionId,
        });
        if (!isMounted || seq !== fetchSeqRef.current) return;
        if (res?.success && res.data) {
          responseCache.set(cacheKey, { payload: res.data, fetchedAt: Date.now() });
          applyPayload(res.data);
        }
      } catch (err) {
        if (!isMounted || seq !== fetchSeqRef.current) return;
        console.warn('Top customers fetch error:', err);
        setLiveCustomers([]);
        setPeriodSummary(EMPTY_PERIOD_SUMMARY);
      } finally {
        if (isMounted && seq === fetchSeqRef.current) {
          setInternalLoading(false);
        }
      }
    };

    void loadTopCustomers();
    return () => {
      isMounted = false;
    };
  }, [
    divisionReady,
    effectiveDateRange.dateFrom,
    effectiveDateRange.dateTo,
    appliedFilters?.divisionId,
    refreshNonce,
  ]);

  const displayList = customers !== undefined ? customers : liveCustomers;
  const isLoading = Boolean(externalLoading || internalLoading || !divisionReady);
  const rowTitle = getTopCustomersPresetTitle(dateRangePreset);
  const rowSubLabel = getTopCustomersPresetBadge(
    dateRangePreset,
    effectiveDateRange.dateFrom,
    effectiveDateRange.dateTo,
  );

  const handleCardClick = (c: CustomerSalesItem) => {
    if (onOpenCustomer) {
      onOpenCustomer(c);
    } else {
      navigate('/customers/analytics');
    }
  };

  const handleViewAll = () => {
    if (onViewAll) {
      onViewAll();
    } else {
      navigate('/customers/analytics');
    }
  };

  const formatInt = (v: number) => Math.round(Number(v || 0)).toLocaleString();
  const headingColor = `var(--theme-heading, ${token.colorText})`;
  const mutedColor = `var(--theme-text-muted, ${token.colorTextSecondary})`;
  const surfaceBg = `var(--theme-surface, ${token.colorBgContainer})`;
  const surfaceAltBg = `var(--theme-surface-alt, ${token.colorFillAlter})`;
  const borderColor = `var(--theme-border, ${token.colorBorderSecondary})`;
  const borderStrongColor = `var(--theme-border-strong, ${token.colorBorder})`;

  return (
    <div className="erp-dashboard-top-customers-wrapper" style={{ marginBottom: 16 }}>
      {/* Header with Dynamic Date Preset Title & Active Division Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <TrophyOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: headingColor }}>
            {rowTitle}
          </span>
          <span
            data-testid="top-customers-period-badge"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: mutedColor,
              background: surfaceAltBg,
              padding: '2px 9px',
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
            }}
          >
            {rowSubLabel}
          </span>
          <span
            data-testid="top-customers-division-badge"
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: `var(--theme-primary, ${token.colorPrimary})`,
              background: `var(--theme-accent-soft, ${token.colorPrimaryBg})`,
              padding: '2px 9px',
              borderRadius: 12,
              border: `1px solid ${borderColor}`,
            }}
          >
            {divisionLabel || 'All Divisions'}
          </span>
          {isLoading && <Spin size="small" />}
        </div>

        <Button
          type="link"
          size="small"
          onClick={handleViewAll}
          style={{ fontSize: 12, color: mutedColor, fontWeight: 600, padding: 0 }}
        >
          View all <RightOutlined style={{ fontSize: 10 }} />
        </Button>
      </div>

      {/* Grid: 1 Total Order Load Card + Top 3 Customer Cards */}
      <div
        className="erp-dashboard-top-row-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 12,
        }}
      >
        {/* Card 1: Total Order Load (Prior Open Pending + Period New Orders vs Sold & Remaining %) */}
        <div
          data-testid="total-order-load-card"
          onClick={handleViewAll}
          style={{
            background: surfaceBg,
            backgroundImage: 'linear-gradient(135deg, rgba(14, 165, 233, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
            border: '1px solid rgba(14, 165, 233, 0.30)',
            borderRadius: 12,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
            transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            minWidth: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#0ea5e9';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 14px -2px rgba(14, 165, 233, 0.2)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(14, 165, 233, 0.30)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
          }}
        >
          {/* Icon & Order Load Metrics */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: 'rgba(14, 165, 233, 0.16)',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 21,
                flexShrink: 0,
              }}
            >
              <ShoppingCartOutlined />
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: headingColor,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Total Order Load
              </div>

              <Tooltip
                title={`${periodSummary.priorOpenOrdersCount} prior open orders (${formatInt(periodSummary.priorOpenPendingGross)} GRS) + ${periodSummary.periodNewOrdersCount} new orders in range (${formatInt(periodSummary.periodNewOrdersGross)} GRS)`}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: mutedColor,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  Prior: {formatInt(periodSummary.priorOpenPendingGross)} + New: {formatInt(periodSummary.periodNewOrdersGross)} GRS
                </div>
              </Tooltip>

              {/* Ord / Sold / Bal */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '2px 6px',
                  marginTop: 4,
                }}
              >
                <Tooltip title={`Total Order Load (Prior Open Pending + Period New Orders): ${formatInt(periodSummary.totalOrderedGross)} GRS`}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: headingColor }}>
                    Ord: {formatInt(periodSummary.totalOrderedGross)} GRS
                  </span>
                </Tooltip>
                <span style={{ fontSize: 10, color: mutedColor }}>·</span>
                <Tooltip title={`Dispatched / Sold in Selected Period: ${formatInt(periodSummary.totalSoldGross)} GRS (${formatInt(periodSummary.totalSoldCartons)} CTN)`}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                    Sold: {formatInt(periodSummary.totalSoldGross)} GRS
                  </span>
                </Tooltip>
                <span style={{ fontSize: 10, color: mutedColor }}>·</span>
                <Tooltip title={`Remaining Open Balance = Total Order Load − Dispatched: ${formatInt(periodSummary.remainingBalanceGross)} GRS`}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b' }}>
                    Bal: {formatInt(periodSummary.remainingBalanceGross)} GRS
                  </span>
                </Tooltip>
              </div>
            </div>
          </div>

          {/* Remaining Balance % Ring */}
          <div style={{ flexShrink: 0, textAlign: 'center' }}>
            <Tooltip
              title={`Remaining Balance: ${formatInt(periodSummary.remainingBalanceGross)} GRS (${periodSummary.remainingPct}% of ${formatInt(periodSummary.totalOrderedGross)} GRS Total Order Load)`}
            >
              <Progress
                type="circle"
                percent={periodSummary.remainingPct}
                size={60}
                strokeWidth={7}
                strokeColor="#f59e0b"
                trailColor={surfaceAltBg}
                format={(p) => (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.05 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: headingColor }}>
                      {p}%
                    </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: mutedColor }}>
                      Remaining
                    </span>
                  </div>
                )}
              />
            </Tooltip>
          </div>
        </div>

        {/* Cards 2, 3, 4: Top 3 Customers by Sales Volume (or clean empty state when zero) */}
        {displayList.length === 0 ? (
          <div
            data-testid="top-customers-empty-card"
            style={{
              background: surfaceBg,
              border: `1px dashed ${borderColor}`,
              borderRadius: 12,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              gridColumn: 'span 2',
              minHeight: 78,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: surfaceAltBg,
                color: mutedColor,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              <InboxOutlined />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: headingColor }}>
                No Customer Dispatches in Selected Scope
              </div>
              <div style={{ fontSize: 11.5, color: mutedColor }}>
                No confirmed shipments found for {divisionLabel || 'All Divisions'} during {rowSubLabel}.
              </div>
            </div>
          </div>
        ) : (
          displayList.slice(0, 3).map((item, idx) => (
            <div
              key={item.id || idx}
              data-testid={`top-customer-card-${idx + 1}`}
              onClick={() => handleCardClick(item)}
              style={{
                background: surfaceBg,
                border: `1px solid ${borderColor}`,
                borderRadius: 12,
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                cursor: 'pointer',
                boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
                transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                minWidth: 0,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = borderStrongColor;
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 12px -2px rgba(0, 0, 0, 0.08)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = borderColor;
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {/* Customer Avatar & Sales Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: item.accentBg || 'rgba(14, 165, 233, 0.12)',
                    color: item.color || '#0ea5e9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                    fontWeight: 800,
                  }}
                >
                  {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : '🥉'}
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: headingColor,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={item.name}
                  >
                    {item.name}
                  </div>

                  <div style={{ fontSize: 11, color: mutedColor, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{item.code}</span>
                    {item.tag && (
                      <span
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          color: item.color,
                          background: item.accentBg,
                          padding: '1px 5px',
                          borderRadius: 4,
                        }}
                      >
                        {item.tag}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'nowrap' }}>
                    <Tooltip title={`Actual Total Sales / Dispatched in ${rowSubLabel}`}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>
                        {formatInt(item.salesGross)} GRS sold
                      </span>
                    </Tooltip>
                    {item.cartons > 0 && (
                      <>
                        <span style={{ fontSize: 10, color: mutedColor }}>·</span>
                        <span style={{ fontSize: 10, color: mutedColor }}>
                          {formatInt(item.cartons)} CTN
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Circular Share Ring */}
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <Tooltip title={`${item.name} contributed ${item.sharePct}% of top sales volume in ${rowSubLabel}`}>
                  <Progress
                    type="circle"
                    percent={item.sharePct}
                    size={46}
                    strokeWidth={8}
                    strokeColor={item.color}
                    trailColor={surfaceAltBg}
                    format={(p) => (
                      <span style={{ fontSize: 11, fontWeight: 700, color: headingColor }}>
                        {p}%
                      </span>
                    )}
                  />
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default TopCustomersRow;
