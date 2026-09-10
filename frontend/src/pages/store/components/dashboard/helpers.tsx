import React from 'react';
import {
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  InboxOutlined,
  SwapOutlined,
  EditOutlined,
} from '@ant-design/icons';

export type StatusColor = 'default' | 'processing' | 'success' | 'error' | 'warning' | string;

const STATUS_COLORS: Record<string, StatusColor> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'cyan',
  REJECTED: 'error',
  CANCELLED: 'default',
  PARTIALLY_CONVERTED: 'gold',
  FULLY_CONVERTED: 'success',
  PARTIALLY_RECEIVED: 'gold',
  RECEIVED: 'processing',
  INSPECTION: 'magenta',
  ACCEPTED: 'cyan',
  PARTIALLY_ACCEPTED: 'gold',
  POSTED: 'success',
  PENDING_APPROVAL: 'gold',
  RETURNED: 'orange',
  OPEN: 'processing',
  BUDGETARY: 'blue',
  LOW_STOCK: 'error',
  REORDER_REQUIRED: 'orange',
  PR_PENDING: 'purple',
  MANAGER_APPROVAL: 'gold',
  GM_APPROVAL: 'cyan',
  ORDERED: 'geekblue',
  FULLY_RECEIVED: 'success',
  OVERDUE: 'volcano',
  DEFERRED: 'default',
  NORMAL: 'default',
};

export const statusColor = (status: string): StatusColor =>
  STATUS_COLORS[String(status || '').toUpperCase()] ?? 'default';

export interface ActivityTypeMeta {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

export const ACTIVITY_TYPE_META: Record<string, ActivityTypeMeta> = {
  MR: { key: 'MR', label: 'Material Request', icon: <FileTextOutlined />, color: 'blue' },
  ISSUE: { key: 'ISSUE', label: 'Material Issue', icon: <ArrowUpOutlined />, color: 'red' },
  RETURN: { key: 'RETURN', label: 'Material Return', icon: <ArrowDownOutlined />, color: 'orange' },
  GRN: { key: 'GRN', label: 'Goods Receipt', icon: <InboxOutlined />, color: 'green' },
  PR: { key: 'PR', label: 'Purchase Requisition', icon: <FileTextOutlined />, color: 'purple' },
  TRANSFER: { key: 'TRANSFER', label: 'Stock Transfer', icon: <SwapOutlined />, color: 'geekblue' },
  ADJUSTMENT: { key: 'ADJUSTMENT', label: 'Stock Adjustment', icon: <EditOutlined />, color: 'magenta' },
};

export const activityTypeMeta = (type: string): ActivityTypeMeta =>
  ACTIVITY_TYPE_META[String(type || '').toUpperCase()] ?? {
    key: type,
    label: type || 'Document',
    icon: <FileTextOutlined />,
    color: 'default',
  };

export const PRESET_HEX: Record<string, string> = {
  blue: '#1677ff',
  geekblue: '#2f54eb',
  volcano: '#fa541c',
  cyan: '#13c2c2',
  purple: '#722ed1',
  gold: '#faad14',
  orange: '#fa8c16',
  green: '#52c41a',
  red: '#f5222d',
  magenta: '#eb2f96',
  default: '#8c8c8c',
};

export const fmt = (value: number | string | null | undefined, digits = 2): string => {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
};

export const fmtDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtDateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const cardStyle: React.CSSProperties = {
  marginBottom: 12,
};

export const sectionTitle = (text: string): React.ReactNode => (
  <span style={{ fontSize: 15, fontWeight: 600 }}>{text}</span>
);