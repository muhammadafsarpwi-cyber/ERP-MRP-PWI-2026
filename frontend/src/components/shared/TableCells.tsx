import React from 'react';
import { Tooltip } from 'antd';

/** Reusable cell component matching the Standard Target visual pattern. */
export const HighlightedCell: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  labelColor?: string;
  secondary?: React.ReactNode;
  secondaryPrefix?: React.ReactNode;
  secondarySize?: number;
  secondaryWeight?: number;
  tooltip?: string;
}> = ({ icon, label, labelColor = 'var(--theme-accent, #059669)', secondary, secondaryPrefix, secondarySize = 10, secondaryWeight = 500, tooltip }) => {
  const content = (
    <div style={{
      lineHeight: 1.35,
      padding: '3px 8px',
      borderRadius: 'var(--ui-radius-sm)',
      background: 'var(--theme-surface-alt, #f0fdf4)',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      maxWidth: '100%',
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: labelColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {icon && <span style={{ marginRight: 4, fontSize: 11 }}>{icon}</span>}
        {label}
      </div>
      {secondary != null && (
        <div style={{ color: 'var(--theme-text-secondary, rgba(15, 23, 42, 0.72))', fontSize: secondarySize, fontWeight: secondaryWeight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {secondaryPrefix}
          {secondary}
        </div>
      )}
    </div>
  );
  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
};

/** Compact two-line ERP column header. Keeps compound headings readable without collision. */
export const HeaderCell: React.FC<{
  icon?: React.ReactNode;
  first: React.ReactNode;
  second?: React.ReactNode;
}> = ({ icon, first, second }) => (
    <span
    className="erp-th"
    style={{
      display: 'inline-flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      lineHeight: 1.45,
      gap: 1,
      color: 'var(--erp-table-header-text, var(--theme-table-header-color, inherit))',
    }}
  >
    <span
      className="erp-th__line"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontWeight: 700,
        fontSize: 12.5,
        letterSpacing: 0.01,
        whiteSpace: 'nowrap',
        color: 'inherit',
      }}
    >
      {icon && <span className="erp-th__icon" style={{ fontSize: 11, lineHeight: 1, color: 'inherit' }}>{icon}</span>}
      {first}
    </span>
    {second != null && (
      <span
        className="erp-th__line"
        style={{
          fontWeight: 700,
          fontSize: 12.5,
          letterSpacing: 0.01,
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
          color: 'inherit',
        }}
      >
        {typeof second === 'string' ? ` ${second}` : second}
      </span>
    )}
  </span>
);

export type ErpActionPillVariant = 'view' | 'success' | 'edit' | 'warn' | 'delete';

export interface ErpActionPillProps {
  variant: ErpActionPillVariant;
  icon: React.ReactNode;
  title?: string;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Centralized table action pill backed solely by `--erp-pill-*` tokens in erp-table.css. */
export const ErpActionPill: React.FC<ErpActionPillProps> = ({
  variant,
  icon,
  title,
  ariaLabel,
  onClick,
  disabled = false,
  size = 'md',
  className = '',
}) => {
  const sizeClass = size === 'sm' ? 'erp-action-pill--sm' : '';
  const btn = (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel || title || variant}
      onClick={onClick}
      className={`erp-action-pill erp-action-pill--${variant} ${sizeClass} ${className}`.trim()}
    >
      {icon}
    </button>
  );
  return title ? <Tooltip title={title}>{btn}</Tooltip> : btn;
};