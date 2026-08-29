import React from 'react';
import { Card } from 'antd';

/* ── Number / date formatting ─────────────────────────────────────────── */
export const fmtQty = (n: number): string =>
  n.toLocaleString('en-US', {
    maximumFractionDigits: Number.isInteger(n) ? 0 : 1,
    minimumFractionDigits: 0,
  });

export const fmtCompact = (n: number): string =>
  new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export const toShortDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/* ── Achievement level semantics ──────────────────────────────────────── */
export type AchLevel = 'high' | 'medium' | 'low';
export const achLevel = (pct: number): AchLevel =>
  pct >= 90 ? 'high' : pct >= 70 ? 'medium' : 'low';

export const levelColor = (level: AchLevel): string =>
  level === 'high' ? 'var(--theme-success)' : level === 'medium' ? 'var(--theme-warning)' : 'var(--theme-danger)';

/* ── Section card (consistent dashboard panel shell) ──────────────────── */
interface SectionCardProps {
  icon?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  icon, title, subtitle, extra, className, children,
}) => (
  <Card
    size="small"
    className={className ? `erp-section-card ${className}` : 'erp-section-card'}
    title={
      <span className="erp-sec-title">
        {icon && <span className="erp-sec-title__icon">{icon}</span>}
        {title}
        {subtitle != null && <span className="erp-sec-title__sub">{subtitle}</span>}
      </span>
    }
    extra={extra}
  >
    {children}
  </Card>
);

/* ── Empty state ──────────────────────────────────────────────────────── */
export const EmptyState: React.FC<{ icon?: React.ReactNode; title: string; desc?: string }> = ({
  icon, title, desc,
}) => (
  <div className="erp-empty-state">
    {icon && <div className="erp-empty-state__icon">{icon}</div>}
    <div className="erp-empty-state__title">{title}</div>
    {desc && <div className="erp-empty-state__desc">{desc}</div>}
  </div>
);

/* ── Shared tooltip primitives ────────────────────────────────────────── */
export const TooltipCard: React.FC<{ title?: React.ReactNode; children: React.ReactNode }> = ({
  title, children,
}) => (
  <div className="erp-chart-tooltip">
    {title && <div className="erp-chart-tooltip__title">{title}</div>}
    {children}
  </div>
);

export const TooltipRow: React.FC<{
  color?: string;
  label: string;
  value: React.ReactNode;
  className?: string;
}> = ({ color, label, value, className }) => (
  <div className="erp-chart-tooltip__row">
    <span className="erp-chart-tooltip__label">
      {color && <span className="erp-chart-tooltip__dot" style={{ background: color }} />}
      {label}
    </span>
    <span className={`erp-chart-tooltip__value ${className ?? ''}`}>{value}</span>
  </div>
);

export const percentCls = (v: number): string =>
  v >= 90
    ? 'erp-chart-tooltip__value--success'
    : v >= 70
      ? 'erp-chart-tooltip__value--warning'
      : 'erp-chart-tooltip__value--danger';

/* ── Custom Recharts legend ───────────────────────────────────────────── */
interface ChartLegendPayloadItem {
  color?: string;
  dataKey?: string;
  name?: string;
  value?: string;
}

export const ChartLegend: React.FC<{ payload?: ChartLegendPayloadItem[] }> = ({ payload }) => (
  <ul className="erp-chart-legend-ul">
    {(payload ?? []).map((item, i) => (
      <li key={`${item.dataKey ?? ''}-${i}`} className="erp-chart-legend-li">
        <span className="erp-chart-legend-dot" style={{ background: item.color }} />
        {item.value ?? item.name}
      </li>
    ))}
  </ul>
);

/* ── Skeletons ────────────────────────────────────────────────────────── */
export const SkeletonKpi: React.FC<{ count?: number }> = ({ count = 7 }) => (
  <>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="erp-sk erp-sk-kpi" />
    ))}
  </>
);

export const SkeletonChart: React.FC<{ height?: number }> = ({ height = 240 }) => (
  <div className="erp-sk erp-sk-chart" style={{ height }} />
);

export const SkeletonRows: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="erp-sk-list">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="erp-sk-row">
        <div className="erp-sk erp-sk-avatar" />
        <div className="erp-sk-cols">
          <div className="erp-sk erp-sk-line" style={{ width: '38%' }} />
          <div className="erp-sk erp-sk-line" style={{ width: '62%' }} />
        </div>
        <div className="erp-sk erp-sk-line" style={{ width: '18%' }} />
      </div>
    ))}
  </div>
);