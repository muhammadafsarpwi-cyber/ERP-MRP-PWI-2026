import React, { useState, useEffect } from 'react';
import { Button, Tooltip, Progress, theme } from 'antd';
import {
  RightOutlined, ToolOutlined, TrophyOutlined,
  ShopOutlined, CheckCircleOutlined, RiseOutlined,
  ArrowRightOutlined, BarChartOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import apiService from '../../services/api';

export interface CustomerDemandItem {
  id: string;
  name: string;
  code: string;
  orderedQtyGross: number;
  dispatchedQtyGross: number;
  fulfillmentPct: number;
  readyGross?: number;
  pendingGross?: number;
  tag?: string;
  rank: number;
  color: string;
  accentBg: string;
}

interface TopCustomersRowProps {
  customers?: CustomerDemandItem[];
  loading?: boolean;
  onViewAll?: () => void;
  onOpenCustomer?: (customer: CustomerDemandItem) => void;
  onQuickAction?: () => void;
}

const DEFAULT_TOP_CUSTOMERS: CustomerDemandItem[] = [
  {
    id: 'cus-cfp-001',
    name: 'CROWN FIT PAKISTAN',
    code: 'CUS-CFP-001',
    orderedQtyGross: 27200,
    dispatchedQtyGross: 19500,
    fulfillmentPct: 72,
    readyGross: 4280,
    pendingGross: 7700,
    tag: '#1 Top Buyer',
    rank: 1,
    color: '#f59e0b', // Gold / Amber
    accentBg: 'rgba(245, 158, 11, 0.12)',
  },
  {
    id: 'cus-000005',
    name: 'ALI SHAH AUTOS',
    code: 'CUS-000005',
    orderedQtyGross: 34109,
    dispatchedQtyGross: 12578,
    fulfillmentPct: 37,
    readyGross: 4209,
    pendingGross: 21531,
    tag: '#2 Volume Partner',
    rank: 2,
    color: '#06b6d4', // Cyan
    accentBg: 'rgba(6, 182, 212, 0.12)',
  },
  {
    id: 'cus-000002',
    name: 'PANTHER TYRES LTD',
    code: 'CUS-000002',
    orderedQtyGross: 9000,
    dispatchedQtyGross: 4500,
    fulfillmentPct: 50,
    readyGross: 730,
    pendingGross: 4500,
    tag: '#3 OEM Partner',
    rank: 3,
    color: '#10b981', // Emerald
    accentBg: 'rgba(16, 185, 129, 0.12)',
  },
];

export const TopCustomersRow: React.FC<TopCustomersRowProps> = ({
  customers,
  loading: externalLoading,
  onViewAll,
  onOpenCustomer,
  onQuickAction,
}) => {
  const navigate = useNavigate();
  const { token } = theme.useToken();
  const [liveCustomers, setLiveCustomers] = useState<CustomerDemandItem[]>(DEFAULT_TOP_CUSTOMERS);
  const [internalLoading, setInternalLoading] = useState(false);

  // Dynamically load top customers from live orders and deliveries
  useEffect(() => {
    let isMounted = true;
    const fetchTopCustomers = async () => {
      try {
        setInternalLoading(true);
        const [ordersRes, delivRes] = await Promise.allSettled([
          apiService.get('/sales/orders?limit=300&status=all'),
          apiService.get('/sales/deliveries?limit=300&status=all'),
        ]);

        const rawOrders: any[] = ordersRes.status === 'fulfilled'
          ? ((ordersRes.value as any)?.data?.data || (ordersRes.value as any)?.data || [])
          : [];
        const rawDelivs: any[] = delivRes.status === 'fulfilled'
          ? ((delivRes.value as any)?.data?.data || (delivRes.value as any)?.data || [])
          : [];

        if (rawOrders.length === 0 && rawDelivs.length === 0) {
          return;
        }

        const custMap = new Map<string, { id: string; name: string; code: string; ordered: number; dispatched: number }>();

        // Aggregate ordered demand
        rawOrders.forEach((o) => {
          const st = String(o?.status || '').toUpperCase();
          if (st === 'DRAFT' || st === 'CANCELLED' || st === 'VOID') return;
          const cust = o?.customer;
          const custId = cust?.id || cust?.customerId || o?.customerId || 'unknown';
          const name = cust?.customerName || cust?.name || o?.customerName || 'Customer';
          const code = cust?.customerCode || cust?.code || o?.customerCode || '';
          if (name.toUpperCase().includes('SAFETY STOCK')) return;

          const existing = custMap.get(custId) || { id: custId, name, code, ordered: 0, dispatched: 0 };
          let orderGross = 0;
          if (Array.isArray(o?.items)) {
            o.items.forEach((it: any) => {
              const rawVal = it.quantityGross ?? it.orderedQtyGross ?? (it.quantity != null ? Number(it.quantity) / 144 : 0);
              const qty = Number(rawVal) || 0;
              orderGross += isNaN(qty) ? 0 : qty;
            });
          } else if (o?.totalGross) {
            orderGross += Number(o.totalGross) || 0;
          }
          existing.ordered += orderGross;
          custMap.set(custId, existing);
        });

        // Aggregate dispatched volume
        rawDelivs.forEach((d) => {
          const st = String(d?.status || '').toUpperCase();
          if (st === 'CANCELLED' || st === 'DRAFT' || st === 'VOID') return;
          const cust = d?.customer;
          const custId = cust?.id || cust?.customerId || d?.customerId || 'unknown';
          const name = cust?.customerName || cust?.name || d?.customerName || 'Customer';
          const code = cust?.customerCode || cust?.code || d?.customerCode || '';
          if (name.toUpperCase().includes('SAFETY STOCK')) return;

          const existing = custMap.get(custId) || { id: custId, name, code, ordered: 0, dispatched: 0 };
          let delivGross = 0;
          if (Array.isArray(d?.lines)) {
            d.lines.forEach((ln: any) => {
              const rawVal = ln.quantityGross ?? ln.dispatchedQtyGross ?? (ln.quantity != null ? Number(ln.quantity) / 144 : 0);
              const qty = Number(rawVal) || 0;
              delivGross += isNaN(qty) ? 0 : qty;
            });
          } else if (Array.isArray(d?.items)) {
            d.items.forEach((it: any) => {
              const rawVal = it.quantityGross ?? it.dispatchedQtyGross ?? (it.quantity != null ? Number(it.quantity) / 144 : 0);
              const qty = Number(rawVal) || 0;
              delivGross += isNaN(qty) ? 0 : qty;
            });
          }
          existing.dispatched += delivGross;
          custMap.set(custId, existing);
        });

        const sorted = Array.from(custMap.values())
          .filter((c) => c.ordered > 0 || c.dispatched > 0)
          .sort((a, b) => b.ordered - a.ordered)
          .slice(0, 3);

        if (sorted.length > 0 && isMounted) {
          const rankColors = [
            { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', tag: '#1 Top Buyer' },
            { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)', tag: '#2 Volume Partner' },
            { color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', tag: '#3 Key Account' },
          ];

          const formatted: CustomerDemandItem[] = sorted.map((c, idx) => {
            const pct = c.ordered > 0 ? Math.round((c.dispatched / c.ordered) * 100) : 0;
            const themeCfg = rankColors[idx] || rankColors[2];
            return {
              id: c.id,
              name: c.name,
              code: c.code || `CUS-00${idx + 1}`,
              orderedQtyGross: Math.round(c.ordered),
              dispatchedQtyGross: Math.round(c.dispatched),
              fulfillmentPct: pct,
              rank: idx + 1,
              tag: themeCfg.tag,
              color: themeCfg.color,
              accentBg: themeCfg.bg,
            };
          });

          setLiveCustomers(formatted);
        }
      } catch (err) {
        console.warn('Live top customers fetch fallback:', err);
      } finally {
        if (isMounted) setInternalLoading(false);
      }
    };

    fetchTopCustomers();
    return () => { isMounted = false; };
  }, []);

  const displayList = customers && customers.length > 0 ? customers : liveCustomers;

  const handleCardClick = (c: CustomerDemandItem) => {
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

  return (
    <div className="erp-dashboard-top-customers-wrapper" style={{ marginBottom: 16 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrophyOutlined style={{ color: '#f59e0b', fontSize: 16 }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
            Top Customers This Month
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--theme-text-muted, #64748b)',
              background: 'var(--theme-surface-alt, #f1f5f9)',
              padding: '2px 8px',
              borderRadius: 12,
              border: '1px solid var(--theme-border, #e2e8f0)',
            }}
          >
            Order Demand & Fulfillment
          </span>
        </div>

        <Button
          type="link"
          size="small"
          onClick={handleViewAll}
          style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', fontWeight: 600, padding: 0 }}
        >
          View all <RightOutlined style={{ fontSize: 10 }} />
        </Button>
      </div>

      {/* Grid: 3 Customer Cards + 1 Action Hero Card */}
      <div
        className="erp-dashboard-top-row-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 12,
        }}
      >
        {displayList.slice(0, 3).map((item, idx) => {
          const pct = Math.min(100, Math.max(0, item.fulfillmentPct));
          const progressColor = pct >= 70 ? '#10b981' : pct >= 40 ? '#f59e0b' : '#0ea5e9';

          return (
            <div
              key={item.id || idx}
              onClick={() => handleCardClick(item)}
              style={{
                background: 'var(--theme-card-bg, #ffffff)',
                border: '1px solid var(--theme-border, #e2e8f0)',
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
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border-strong, #cbd5e1)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 12px -2px rgba(0, 0, 0, 0.08)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border, #e2e8f0)';
                (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px 0 rgba(0, 0, 0, 0.05)';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              }}
            >
              {/* Customer Avatar & Demand Details */}
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
                  {/* Customer Name */}
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--theme-heading, #0f172a)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={item.name}
                  >
                    {item.name}
                  </div>

                  {/* Customer Code / Tag */}
                  <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', display: 'flex', alignItems: 'center', gap: 6 }}>
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

                  {/* Requirement vs Dispatched */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'nowrap' }}>
                    <Tooltip title="Total Ordered Demand">
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
                        {item.orderedQtyGross.toLocaleString()} GRS
                      </span>
                    </Tooltip>
                    <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>·</span>
                    <Tooltip title="Dispatched / Sold Volume">
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#10b981' }}>
                        {item.dispatchedQtyGross.toLocaleString()} GRS sold
                      </span>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Circular Progress Gauge */}
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <Tooltip title={`${pct}% fulfilled (${item.dispatchedQtyGross.toLocaleString()} of ${item.orderedQtyGross.toLocaleString()} GRS)`}>
                  <Progress
                    type="circle"
                    percent={pct}
                    size={46}
                    strokeWidth={8}
                    strokeColor={progressColor}
                    trailColor="var(--theme-surface-alt, #f1f5f9)"
                    format={(p) => (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-heading, #0f172a)' }}>
                        {p}%
                      </span>
                    )}
                  />
                </Tooltip>
              </div>
            </div>
          );
        })}

        {/* 4th Action Hero Card */}
        <div
          onClick={onQuickAction ? onQuickAction : () => navigate('/customers/analytics')}
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            borderRadius: 12,
            border: '1px solid var(--theme-border, #334155)',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            minWidth: 0,
            minHeight: 82,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = '#f59e0b';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 6px 14px -2px rgba(245, 158, 11, 0.25)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--theme-border, #334155)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
          }}
        >
          {/* Subtle Watermark Icon in background */}
          <BarChartOutlined
            style={{
              position: 'absolute',
              right: -10,
              bottom: -15,
              fontSize: 85,
              color: 'rgba(255, 255, 255, 0.05)',
              transform: 'rotate(-10deg)',
              pointerEvents: 'none',
            }}
          />

          <div>
            <div
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: 0.8,
                color: '#94a3b8',
                textTransform: 'uppercase',
              }}
            >
              CUSTOMER ANALYTICS
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>
              Customer Orders & Fulfillment
            </div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: '#f59e0b',
              color: '#0f172a',
              padding: '4px 10px',
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 700,
              width: 'fit-content',
              marginTop: 6,
            }}
          >
            <span>Open Analytics</span>
            <ArrowRightOutlined style={{ fontSize: 10 }} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default TopCustomersRow;
