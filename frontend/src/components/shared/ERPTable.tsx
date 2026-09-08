import React from 'react';
import { Table, Tooltip, Button, Popconfirm, Input, Select } from 'antd';
import type { TableProps, TablePaginationConfig } from 'antd/es/table';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  SearchOutlined,
  ReloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import EmptyState from './EmptyState';

export interface ERPTableProps<T extends object = any> extends TableProps<T> {
  dense?: boolean;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  emptyTitle?: string;
  emptyText?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

/**
 * Standard enterprise table wrapper for PakWiz ERP.
 * Wraps Ant Design's Table with consistent borders, header typography,
 * hover/active states, pagination defaults, empty state, and responsive behavior.
 */
export function ERPTable<T extends object = any>({
  dense = false,
  containerClassName = '',
  containerStyle,
  className = '',
  pagination,
  locale,
  scroll,
  emptyTitle = 'No records found',
  emptyText,
  emptyDescription = 'No data matches your current criteria.',
  emptyActionLabel,
  onEmptyAction,
  ...restProps
}: ERPTableProps<T>) {
  // Standardized enterprise pagination
  const resolvedPagination: TablePaginationConfig | false =
    pagination === false
      ? false
      : {
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
          showTotal: (total, range) => (
            <span className="erp-table-pagination-total">
              Showing {range[0]}–{range[1]} of {total} entries
            </span>
          ),
          ...(typeof pagination === 'object' ? pagination : {}),
        };

  // Standardized enterprise empty state
  const resolvedLocale = {
    emptyText: (
      <EmptyState
        title={emptyText || emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        onAction={onEmptyAction}
      />
    ),
    ...locale,
  };

  return (
    <div
      className={`erp-table-container ${dense ? 'erp-table-container--dense' : ''} ${containerClassName}`.trim()}
      style={containerStyle}
    >
      <Table<T>
        className={`erp-table ${className}`.trim()}
        scroll={scroll ?? { x: 'max-content' }}
        pagination={resolvedPagination}
        locale={resolvedLocale}
        {...restProps}
      />
    </div>
  );
}

/**
 * Direction tag component: displays '↑ IN' or '↓ OUT' with clear semantic colors
 */
export const DirectionTag: React.FC<{
  direction: string;
  className?: string;
  style?: React.CSSProperties;
}> = ({ direction, className = '', style }) => {
  const isDirIn = String(direction).toUpperCase() === 'IN';
  return (
    <span
      className={`${isDirIn ? 'erp-direction-in' : 'erp-direction-out'} ${className}`.trim()}
      style={style}
    >
      {isDirIn ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : <ArrowDownOutlined style={{ fontSize: 10 }} />}
      <span>{isDirIn ? 'IN' : 'OUT'}</span>
    </span>
  );
};

export interface TableActionItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  confirm?: {
    title: string;
    description?: string;
    onConfirm: () => void;
    okText?: string;
    cancelText?: string;
  };
}

export interface TableActionsProps {
  actions?: TableActionItem[];
  onView?: () => void;
  onViewLabel?: string;
  onEdit?: () => void;
  onEditLabel?: string;
  onDelete?: () => void;
  onDeleteLabel?: string;
  deleteConfirmTitle?: string;
  extraActions?: React.ReactNode[];
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Action buttons container for the Actions column.
 * Supports structured actions array, shorthand onView/onEdit/onDelete,
 * extraActions array, or custom children.
 */
export const TableActions: React.FC<TableActionsProps> = ({
  actions,
  onView,
  onViewLabel = 'View details',
  onEdit,
  onEditLabel = 'Edit record',
  onDelete,
  onDeleteLabel = 'Delete record',
  deleteConfirmTitle = 'Are you sure you want to delete this record?',
  extraActions,
  children,
  className = '',
  style,
}) => {
  const resolvedActions: TableActionItem[] = [...(actions || [])];
  if (onView) {
    resolvedActions.push({
      key: 'view',
      label: onViewLabel,
      icon: <EyeOutlined />,
      onClick: onView,
    });
  }
  if (onEdit) {
    resolvedActions.push({
      key: 'edit',
      label: onEditLabel,
      icon: <EditOutlined />,
      onClick: onEdit,
    });
  }
  if (onDelete) {
    resolvedActions.push({
      key: 'delete',
      label: onDeleteLabel,
      icon: <DeleteOutlined />,
      danger: true,
      confirm: {
        title: deleteConfirmTitle,
        onConfirm: onDelete,
      },
    });
  }

  if (resolvedActions.length > 0 || (extraActions && extraActions.length > 0)) {
    return (
      <div className={`erp-table-actions ${className}`.trim()} style={style}>
        {resolvedActions.map((act) => {
          const btn = (
            <Button
              key={act.key}
              type="text"
              size="small"
              danger={act.danger}
              disabled={act.disabled}
              icon={act.icon}
              onClick={act.confirm ? undefined : act.onClick}
              aria-label={act.label}
              className={act.className}
              style={{
                ...(act.danger ? { color: 'var(--theme-danger)' } : {}),
                ...act.style,
              }}
            />
          );

          if (act.confirm) {
            return (
              <Popconfirm
                key={act.key}
                title={act.confirm.title}
                description={act.confirm.description}
                onConfirm={act.confirm.onConfirm}
                okText={act.confirm.okText}
                cancelText={act.confirm.cancelText}
                okButtonProps={act.danger ? { danger: true } : undefined}
              >
                <Tooltip title={act.label}>
                  {btn}
                </Tooltip>
              </Popconfirm>
            );
          }

          return (
            <Tooltip key={act.key} title={act.label}>
              {btn}
            </Tooltip>
          );
        })}
        {extraActions}
      </div>
    );
  }

  return (
    <div className={`erp-table-actions ${className}`.trim()} style={style}>
      {children}
    </div>
  );
};

export interface TableFilterConfig {
  key: string;
  placeholder?: string;
  value?: any;
  options?: Array<{ value: any; label: string }>;
  onChange?: (val: any) => void;
  width?: number | string;
  loading?: boolean;
}

export interface TableToolbarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  filters?: TableFilterConfig[];
  onRefresh?: () => void;
  primaryAction?: {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    disabled?: boolean;
  };
  actions?: React.ReactNode;
  left?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Standardized table toolbar container.
 * Supports structured filter bar with search, dropdowns, refresh, primary action,
 * and custom left/right slots.
 */
export const TableToolbar: React.FC<TableToolbarProps> = ({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  onRefresh,
  primaryAction,
  actions,
  left,
  right,
  children,
  className = '',
  style,
}) => {
  if (children) {
    return (
      <div className={`erp-table-toolbar ${className}`.trim()} style={style}>
        {children}
      </div>
    );
  }

  const hasStructuredRight = onRefresh !== undefined || primaryAction !== undefined || actions !== undefined || right;

  return (
    <div className={`erp-table-toolbar ${className}`.trim()} style={style}>
      <div className="erp-table-toolbar__left">
        {left}
        {searchPlaceholder !== undefined && (
          <Input
            placeholder={searchPlaceholder}
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            value={searchValue}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange?.(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
        )}
        {filters?.map((f) => (
          <Select
            key={f.key}
            placeholder={f.placeholder}
            value={f.value}
            onChange={f.onChange}
            style={{ width: f.width || 140 }}
            allowClear
            loading={f.loading}
            options={f.options}
          />
        ))}
      </div>
      {hasStructuredRight && (
        <div className="erp-table-toolbar__right">
          {right}
          {onRefresh && (
            <Tooltip title="Refresh">
              <Button icon={<ReloadOutlined />} onClick={onRefresh} />
            </Tooltip>
          )}
          {primaryAction && (
            <Button
              type="primary"
              icon={primaryAction.icon}
              onClick={primaryAction.onClick}
              disabled={primaryAction.disabled}
            >
              {primaryAction.label}
            </Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
};

export default ERPTable;
