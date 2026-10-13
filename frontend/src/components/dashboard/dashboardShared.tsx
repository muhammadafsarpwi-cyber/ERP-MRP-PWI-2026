import React from 'react';
import { Card } from 'antd';
import type { DashboardFilters as DashboardFiltersType } from '../../services/dashboardService';

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

/* ── Fixed floor-wise department order ────────────────────────────────── */
/**
 * The Spoke Division floor is a PHYSICAL LINE — material flows
 * Straightener → Swaging → Spoke → Spoke Plating → Packing → Dispatch — so
 * every department-based listing must use this exact sequence instead of
 * alphabetical order. Departments outside the line (Header, PVC, …) are
 * appended after the six canonical floor stages, alphabetically.
 */
export const FLOOR_WISE_DEPARTMENT_ORDER = [
  'Straightener',
  'Swaging',
  'Spoke',
  'Spoke Plating',
  'Packing',
  'Dispatch',
] as const;

/** Historic master-data spellings mapped onto their canonical floor slot. */
const FLOOR_WISE_ALIASES: Record<string, number> = { swagging: 1 };

const normalizeFloorKey = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** 0-based floor position, or -1 when the department is not part of the line. */
export const floorWiseDepartmentRank = (departmentName?: string | null): number => {
  const key = normalizeFloorKey(departmentName ?? '');
  if (!key) return -1;
  const direct = (FLOOR_WISE_DEPARTMENT_ORDER as readonly string[]).findIndex(
    (floor) => normalizeFloorKey(floor) === key,
  );
  if (direct !== -1) return direct;
  const alias = FLOOR_WISE_ALIASES[key];
  return alias === undefined ? -1 : alias;
};

/** Sort department rows into the strict floor-wise sequence (returns a new array). */
export const sortDepartmentsFloorWise = <T,>(
  rows: T[],
  getName: (row: T) => string | null | undefined = (row) =>
    (row as { departmentName?: string | null }).departmentName,
): T[] =>
  [...rows].sort((a, b) => {
    const rankA = floorWiseDepartmentRank(getName(a));
    const rankB = floorWiseDepartmentRank(getName(b));
    const slotA = rankA === -1 ? Number.MAX_SAFE_INTEGER : rankA;
    const slotB = rankB === -1 ? Number.MAX_SAFE_INTEGER : rankB;
    if (slotA !== slotB) return slotA - slotB;
    return (getName(a) ?? '').localeCompare(getName(b) ?? '');
  });

/* ── Date-range presets ───────────────────────────────────────────────── */
export type DateRangePreset = 'today' | 'yesterday' | 'thisMonth' | 'thisQuarter' | 'lastQuarter';

/** Dashboard opens on "Yesterday" — the last complete production day. */
export const DEFAULT_DATE_RANGE_PRESET: DateRangePreset = 'yesterday';

export const DATE_RANGE_PRESET_OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'thisQuarter', label: 'This Quarter' },
  { value: 'lastQuarter', label: 'Last Quarter' },
];

/** `YYYY-MM-DD` in the browser's local timezone (production entries are local dates). */
const isoLocalDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Resolve a preset to the concrete `dateFrom` / `dateTo` pair sent to the API. */
export const dateRangePresetToFilters = (
  preset: DateRangePreset,
): Pick<DashboardFiltersType, 'dateFrom' | 'dateTo'> => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (preset) {
    case 'today': {
      const t = isoLocalDate(today);
      return { dateFrom: t, dateTo: t };
    }
    case 'yesterday': {
      const y = isoLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
      return { dateFrom: y, dateTo: y };
    }
    case 'thisMonth':
      return { dateFrom: isoLocalDate(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: isoLocalDate(today) };
    case 'thisQuarter': {
      const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      return { dateFrom: isoLocalDate(quarterStart), dateTo: isoLocalDate(today) };
    }
    case 'lastQuarter': {
      const quarterStartMonth = Math.floor(today.getMonth() / 3) * 3;
      const lastQuarterStart = new Date(today.getFullYear(), quarterStartMonth - 3, 1);
      // Day 0 of the next month = last day of the previous month.
      const lastQuarterEnd = new Date(today.getFullYear(), quarterStartMonth, 0);
      return { dateFrom: isoLocalDate(lastQuarterStart), dateTo: isoLocalDate(lastQuarterEnd) };
    }
    default:
      return {};
  }
};

/* ── KPI card (consistent metric panel used by dashboards) ────────────── */
interface KpiCardProps {
  kpi: {
    key: string;
    icon: React.ReactNode;
    tone: 'info' | 'success' | 'danger' | 'warning' | 'muted';
    label: string;
    value: React.ReactNode;
    detail?: string;
  };
}

export const KpiCard: React.FC<KpiCardProps> = ({ kpi }) => (
  <div className={`erp-kpi-card erp-kpi-card--${kpi.tone}`}>
    <span className="erp-kpi-card__icon">{kpi.icon}</span>
    <div className="erp-kpi-card__body">
      <span className="erp-kpi-card__label">{kpi.label}</span>
      <span className="erp-kpi-card__value">{kpi.value}</span>
      {kpi.detail && <span className="erp-kpi-card__detail">{kpi.detail}</span>}
    </div>
  </div>
);

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