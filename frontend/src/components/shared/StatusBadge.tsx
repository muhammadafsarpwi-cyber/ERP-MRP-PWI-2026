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

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, string>;
  style?: React.CSSProperties;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, colorMap, style }) => {
  const map = colorMap ?? STATUS_COLORS;
  const color = map[status] ?? 'default';
  const label = status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, ' ');
  return <Tag color={color} style={{ marginInlineEnd: 0, ...style }}>{label}</Tag>;
};

export const CriticalityBadge: React.FC<{ value: string; style?: React.CSSProperties }> = ({ value, style }) => (
  <StatusBadge status={value} colorMap={CRITICALITY_COLORS} style={style} />
);

export { STATUS_COLORS, CRITICALITY_COLORS };
export default StatusBadge;
