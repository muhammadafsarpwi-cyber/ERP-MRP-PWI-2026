import React from 'react';
import { Tag } from 'antd';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  MAINTENANCE: 'orange',
  RETIRED: 'default',
  DRAFT: 'default',
  OPEN: 'blue',
  ASSIGNED: 'cyan',
  IN_PROGRESS: 'processing',
  ON_HOLD: 'gold',
  WAITING_FOR_PARTS: 'orange',
  COMPLETED: 'green',
  CLOSED: 'geekblue',
  PENDING_VERIFICATION: 'purple',
  VERIFIED: 'lime',
  APPROVED: 'success',
  REJECTED: 'volcano',
  CANCELLED: 'red',
};

const CRITICALITY_COLORS: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

export type BadgeVariant = 'danger' | 'warning' | 'info' | 'success' | 'purple' | 'neutral' | 'unassigned';

export interface PillBadgeProps {
  label: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  style?: React.CSSProperties;
  withDot?: boolean;
}

/**
 * Modern 2027 enterprise semi-transparent pill badge with subtle border.
 */
export const PillBadge: React.FC<PillBadgeProps> = ({
  label,
  variant = 'neutral',
  className = '',
  style,
  withDot = true,
}) => {
  const showDot = withDot && variant !== 'unassigned' && variant !== 'neutral';
  return (
    <span
      className={`erp-pill-badge erp-pill-badge--${variant} ${className}`.trim()}
      style={style}
    >
      {showDot && <span className="erp-pill-dot" />}
      <span>{label}</span>
    </span>
  );
};

export interface StatusBadgeProps {
  status?: string | null;
  colorMap?: Record<string, string>;
  style?: React.CSSProperties;
  className?: string;
  usePill?: boolean;
}

const STATUS_VARIANT_MAP: Record<string, BadgeVariant> = {
  ACTIVE: 'success',
  COMPLETED: 'success',
  APPROVED: 'success',
  VERIFIED: 'success',
  SUCCESS: 'success',
  OPEN: 'info',
  ASSIGNED: 'info',
  IN_PROGRESS: 'info',
  MAINTENANCE: 'warning',
  ON_HOLD: 'warning',
  WAITING_FOR_PARTS: 'warning',
  PENDING_VERIFICATION: 'purple',
  REVIEW: 'purple',
  REJECTED: 'danger',
  CANCELLED: 'danger',
  INACTIVE: 'danger',
  DRAFT: 'neutral',
  RETIRED: 'neutral',
  CLOSED: 'neutral',
};

const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  colorMap,
  style,
  className = '',
  usePill = true,
}) => {
  const safeStatus = (typeof status === 'string' ? status : String(status || '')).trim();
  if (!safeStatus) {
    return <span className="erp-pill-badge erp-pill-badge--neutral" style={style}>—</span>;
  }

  const upper = safeStatus.toUpperCase();
  const label = safeStatus.charAt(0).toUpperCase() + safeStatus.slice(1).toLowerCase().replace(/_/g, ' ');

  // If a custom colorMap is passed or pill explicitly disabled, fallback to Ant Design Tag
  if (colorMap || !usePill) {
    const map = colorMap ?? STATUS_COLORS;
    const color = map[safeStatus] || map[upper] || 'default';
    return <Tag color={color} style={{ marginInlineEnd: 0, ...style }}>{label}</Tag>;
  }

  const variant = STATUS_VARIANT_MAP[upper] || 'neutral';
  return (
    <PillBadge
      label={label}
      variant={variant}
      className={className}
      style={style}
    />
  );
};

/**
 * Modern semi-transparent pill badge for Maintenance Types (Breakdown, Preventive, etc.)
 */
export const MaintenanceTypeBadge: React.FC<{ type?: string | null; style?: React.CSSProperties; className?: string }> = ({
  type,
  style,
  className = '',
}) => {
  const upper = String(type || '').toUpperCase().trim();
  let variant: BadgeVariant = 'info';
  if (upper === 'BREAKDOWN' || upper === 'EMERGENCY') variant = 'danger';
  else if (upper === 'PREVENTIVE') variant = 'success';
  else if (upper === 'CORRECTIVE') variant = 'info';
  else if (!upper) variant = 'neutral';

  const label = upper ? upper.charAt(0) + upper.slice(1).toLowerCase().replace(/_/g, ' ') : '—';

  return (
    <PillBadge
      label={label}
      variant={variant}
      className={className}
      style={style}
    />
  );
};

/**
 * Modern semi-transparent pill badge for Priority levels (Critical, High, Medium, Low)
 */
export const PriorityBadge: React.FC<{ priority?: string | null; style?: React.CSSProperties; className?: string }> = ({
  priority,
  style,
  className = '',
}) => {
  const upper = String(priority || '').toUpperCase().trim();
  let variant: BadgeVariant = 'neutral';
  if (upper === 'CRITICAL') variant = 'danger';
  else if (upper === 'HIGH') variant = 'warning';
  else if (upper === 'MEDIUM') variant = 'info';
  else if (upper === 'LOW') variant = 'neutral';

  const label = upper ? upper.charAt(0) + upper.slice(1).toLowerCase().replace(/_/g, ' ') : '—';

  return (
    <PillBadge
      label={label}
      variant={variant}
      className={className}
      style={style}
      withDot={upper === 'CRITICAL' || upper === 'HIGH'}
    />
  );
};

export const CriticalityBadge: React.FC<{ value?: string | null; style?: React.CSSProperties }> = ({ value, style }) => (
  <PriorityBadge priority={value} style={style} />
);

export { STATUS_COLORS, CRITICALITY_COLORS };
export default StatusBadge;
