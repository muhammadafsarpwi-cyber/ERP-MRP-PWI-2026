import React from 'react';
import { Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import { EmptyState, fmtQty, SectionCard, SkeletonRows, toShortDate } from './dashboardShared';

export interface OrderRow {
  id: string;
  code: string;
  party: string;
  amount: number;
  currency: string;
  status: string;
  date?: string | null;
}

interface OrderSummaryProps {
  title: string;
  icon: React.ReactNode;
  subtitle: string;
  rows: OrderRow[];
  breakdown: Array<{ status: string; count: number }>;
  loading: boolean;
  emptyTitle: string;
  emptyDesc: string;
  nav: () => void;
}

const statusClass = (status: string): string =>
  status.toLowerCase().replace(/[^a-z0-9_]/g, '_');

const OrderSummary: React.FC<OrderSummaryProps> = ({
  title, icon, subtitle, rows, breakdown, loading, emptyTitle, emptyDesc, nav,
}) => {
  if (loading && rows.length === 0 && breakdown.length === 0) {
    return (
      <SectionCard icon={icon} title={title} subtitle={subtitle}>
        <SkeletonRows rows={5} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={icon}
      title={title}
      subtitle={subtitle}
      extra={
        <Button size="small" type="link" className="erp-link-btn" onClick={nav}>
          View <RightOutlined />
        </Button>
      }
    >
      {breakdown.length > 0 && (
        <>
          <div className="erp-status-bar" role="img" aria-label={`${title} status distribution`}>
            {breakdown.map((s) => (
              <div
                key={s.status}
                className={`erp-status-bar__segment erp-status-bar__segment--${statusClass(s.status)}`}
                style={{ flex: Math.max(1, s.count) }}
                title={`${s.status}: ${s.count}`}
              >
                {s.count}
              </div>
            ))}
          </div>
          <div className="erp-status-legend">
            {breakdown.map((s) => (
              <span key={s.status} className="erp-status-legend__item">
                <span className={`erp-status-legend__dot erp-status-bar__segment--${statusClass(s.status)}`} />
                {s.status}
                <span className="erp-status-legend__count">{s.count}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {rows.length > 0 ? (
        <div className="erp-orders">
          {rows.map((o) => (
            <div key={o.id} className="erp-order-row">
              <span className={`erp-order-row__status erp-order-row__status--${statusClass(o.status)}`}>
                {o.status}
              </span>
              <div className="erp-order-row__ident">
                <span className="erp-order-row__code">{o.code}</span>
                <span className="erp-order-row__date">{toShortDate(o.date)}</span>
              </div>
              <span className="erp-order-row__party">{o.party}</span>
              <span className="erp-order-row__amount">{o.currency} {fmtQty(o.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState icon={icon} title={emptyTitle} desc={emptyDesc} />
      )}
    </SectionCard>
  );
};

export default OrderSummary;