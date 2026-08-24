import React from 'react';
import { Tooltip } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ArrowRightOutlined } from '@ant-design/icons';

/**
 * Global KPI percentage presentation rule.
 * Threshold is centralized here — never re-implement `> 70` checks in pages.
 */
export const KPI_THRESHOLD = 70;

export type KpiDirection = 'up' | 'down' | 'flat';

export interface KpiIndicatorState {
  /** Semantic theme token — resolves per active palette & light/dark mode */
  color: string;
  Icon: typeof ArrowUpOutlined;
  label: string;
  direction: KpiDirection;
}

/** Visual-only classification. Never use for calculations. */
export const kpiIndicator = (value: number | null | undefined): KpiIndicatorState | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (value > KPI_THRESHOLD) {
    return { color: 'var(--theme-success)', Icon: ArrowUpOutlined, label: 'Above target threshold', direction: 'up' };
  }
  if (value < KPI_THRESHOLD) {
    return { color: 'var(--theme-danger)', Icon: ArrowDownOutlined, label: 'Below target threshold', direction: 'down' };
  }
  return { color: 'var(--theme-text-muted)', Icon: ArrowRightOutlined, label: 'At target threshold', direction: 'flat' };
};

interface KpiPercentageProps {
  /** Already-calculated percentage (server value stays the source of truth) */
  value: number | null | undefined;
  precision?: number;
  fontSize?: number | string;
  fontWeight?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders `<pct>%` + directional AntD arrow using semantic theme tokens.
 * Color is never the only signal: the arrow direction plus an accessible
 * label (tooltip / aria-label) convey above/below/at threshold.
 */
const KpiPercentage: React.FC<KpiPercentageProps> = ({
  value,
  precision = 2,
  fontSize = 14,
  fontWeight = 600,
  className,
  style,
}) => {
  const state = kpiIndicator(value);
  if (!state) {
    return (
      <span className={className} style={{ color: 'var(--theme-text-muted)', fontSize, fontWeight, ...style }}>—</span>
    );
  }
  const { Icon } = state;
  return (
    <span
      className={className}
      style={{ color: state.color, fontSize, fontWeight, whiteSpace: 'nowrap', ...style }}
    >
      {(value as number).toFixed(precision)}%
      <Tooltip title={state.label}>
        <Icon aria-label={state.label} role="img" style={{ fontSize: '0.7em', marginLeft: 4 }} />
      </Tooltip>
    </span>
  );
};

export default KpiPercentage;
