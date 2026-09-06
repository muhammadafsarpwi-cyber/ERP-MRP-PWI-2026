import React from 'react';
import { Tooltip } from 'antd';
import {
  ColorSlot,
  getCategoryColor,
  getDepartmentColor,
  getShiftColor,
  getItemColor,
} from '../../utils/colorMapping';

export interface CategoryBadgeProps {
  label?: string | null;
  stableKey?: string;
  categoryType?: 'department' | 'shift' | 'item' | 'general';
  colorSlot?: ColorSlot;
  tooltip?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  fallback?: string;
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  label,
  stableKey,
  categoryType = 'general',
  colorSlot: explicitSlot,
  tooltip,
  icon,
  className = '',
  style,
  onClick,
  fallback = '—',
}) => {
  const displayLabel = label?.trim() || fallback;
  const isFallback = !label || !label.trim();

  // If fallback, render a simple neutral dash
  if (isFallback) {
    return (
      <span
        className={`erp-category-badge erp-category-badge--slate ${className}`.trim()}
        style={{ color: 'var(--theme-text-muted, #94a3b8)', ...style }}
      >
        {fallback}
      </span>
    );
  }

  const slot =
    explicitSlot ||
    getCategoryColor(stableKey || displayLabel, categoryType);

  const badgeContent = (
    <span
      className={`erp-category-badge erp-category-badge--${slot.id} ${onClick ? 'erp-category-badge--clickable' : ''} ${className}`.trim()}
      style={style}
      onClick={onClick}
    >
      {icon ? (
        <span className="erp-category-badge__icon">{icon}</span>
      ) : (
        <span className="erp-category-badge__dot" aria-hidden="true" />
      )}
      <span className="erp-category-badge__label">{displayLabel}</span>
    </span>
  );

  if (tooltip) {
    return <Tooltip title={tooltip}>{badgeContent}</Tooltip>;
  }

  return badgeContent;
};

/* ── Specialized Badges for ERP Entities ──────────────────────────────────── */

export interface DepartmentBadgeProps {
  department?:
    | {
        id?: string | null;
        name?: string | null;
        departmentCode?: string | null;
        code?: string | null;
        division?: { name?: string; divisionCode?: string } | null;
        section?: { name?: string; sectionCode?: string } | null;
      }
    | string
    | null;
  tooltip?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
}

export const DepartmentBadge: React.FC<DepartmentBadgeProps> = ({
  department,
  tooltip,
  className,
  style,
  fallback = '—',
}) => {
  if (!department) {
    return <CategoryBadge label={null} fallback={fallback} className={className} style={style} />;
  }

  const isObj = typeof department === 'object';
  const name = isObj ? department.name : department;
  const code = isObj ? (department.departmentCode || department.code) : '';
  const id = isObj ? department.id : undefined;

  const colorSlot = getDepartmentColor(department);

  // Build descriptive tooltip if none provided
  let resolvedTooltip = tooltip;
  if (!resolvedTooltip && isObj) {
    const parts: string[] = [];
    if (code && name && code !== name) parts.push(`Code: ${code}`);
    if (department.division?.name) parts.push(`Division: ${department.division.name}`);
    if (department.section?.name) parts.push(`Section: ${department.section.name}`);
    if (parts.length > 0) {
      resolvedTooltip = (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          <div style={{ fontSize: 11, opacity: 0.85 }}>{parts.join(' · ')}</div>
        </div>
      );
    }
  }

  return (
    <CategoryBadge
      label={name || code || id || null}
      stableKey={id || code || name || ''}
      categoryType="department"
      colorSlot={colorSlot}
      tooltip={resolvedTooltip}
      className={className}
      style={style}
      fallback={fallback}
    />
  );
};

export interface ShiftBadgeProps {
  shift?:
    | {
        id?: string | null;
        name?: string | null;
        shiftCode?: string | null;
        code?: string | null;
        startTime?: string | null;
        endTime?: string | null;
      }
    | string
    | null;
  tooltip?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
}

export const ShiftBadge: React.FC<ShiftBadgeProps> = ({
  shift,
  tooltip,
  className,
  style,
  fallback = '—',
}) => {
  if (!shift) {
    return <CategoryBadge label={null} fallback={fallback} className={className} style={style} />;
  }

  const isObj = typeof shift === 'object';
  const name = isObj ? shift.name : shift;
  const code = isObj ? (shift.shiftCode || shift.code) : '';
  const id = isObj ? shift.id : undefined;

  const colorSlot = getShiftColor(shift);

  // Build descriptive tooltip with hours if available
  let resolvedTooltip = tooltip;
  if (!resolvedTooltip && isObj) {
    const timeStr =
      shift.startTime && shift.endTime
        ? `${shift.startTime.slice(0, 5)} – ${shift.endTime.slice(0, 5)}`
        : '';
    if (timeStr || code) {
      resolvedTooltip = (
        <div>
          <div style={{ fontWeight: 600 }}>{name}</div>
          {code && <div style={{ fontSize: 11, opacity: 0.85 }}>Code: {code}</div>}
          {timeStr && <div style={{ fontSize: 11, opacity: 0.85 }}>Hours: {timeStr}</div>}
        </div>
      );
    }
  }

  return (
    <CategoryBadge
      label={name || code || id || null}
      stableKey={id || code || name || ''}
      categoryType="shift"
      colorSlot={colorSlot}
      tooltip={resolvedTooltip}
      className={className}
      style={style}
      fallback={fallback}
    />
  );
};

export interface ItemBadgeProps {
  item?:
    | {
        id?: string | null;
        name?: string | null;
        itemCode?: string | null;
        sku?: string | null;
        shortName?: string | null;
      }
    | string
    | null;
  showCode?: boolean;
  tooltip?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  fallback?: string;
}

export const ItemBadge: React.FC<ItemBadgeProps> = ({
  item,
  showCode = false,
  tooltip,
  className,
  style,
  fallback = '—',
}) => {
  if (!item) {
    return <CategoryBadge label={null} fallback={fallback} className={className} style={style} />;
  }

  const isObj = typeof item === 'object';
  const name = isObj ? (item.name || item.shortName) : item;
  const code = isObj ? (item.itemCode || item.sku) : '';
  const id = isObj ? item.id : undefined;

  const displayLabel = showCode && code && name && code !== name
    ? `${code} — ${name}`
    : (name || code || id || fallback);

  const colorSlot = getItemColor(item);

  let resolvedTooltip = tooltip;
  if (!resolvedTooltip && isObj && code && name && code !== name) {
    resolvedTooltip = (
      <div>
        <div style={{ fontWeight: 600 }}>{name}</div>
        <div style={{ fontSize: 11, opacity: 0.85 }}>Item Code: {code}</div>
      </div>
    );
  }

  return (
    <CategoryBadge
      label={displayLabel}
      stableKey={id || code || name || ''}
      categoryType="item"
      colorSlot={colorSlot}
      tooltip={resolvedTooltip}
      className={className}
      style={style}
      fallback={fallback}
    />
  );
};

export default CategoryBadge;
