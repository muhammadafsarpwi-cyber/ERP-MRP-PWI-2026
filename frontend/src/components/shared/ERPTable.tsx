import React from 'react';
import { Table, Tooltip, Button, Modal, App, Input, Select } from 'antd';
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
  /**
   * Vertical scroll height for sticky header and table body scrolling.
   * Defaults to 'calc(100vh - 350px)'. Pass `false` to disable.
   */
  scrollY?: number | string | false;
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
  scrollY,
  sticky = true,
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

  // Standardized enterprise scrolling with sticky header & internal mouse wheel scroll
  const resolvedScroll = React.useMemo(() => {
    const x = scroll?.x ?? 'max-content';
    let y: string | number | undefined = scroll?.y;

    if (y === undefined && scrollY !== false) {
      y = typeof scrollY === 'string' || typeof scrollY === 'number'
        ? scrollY
        : 'calc(100vh - 350px)';
    }

    return {
      x,
      ...(y !== undefined ? { y } : {}),
      ...(scroll ? { ...scroll, x, ...(y !== undefined ? { y } : {}) } : {}),
    };
  }, [scroll, scrollY]);

  // Enhance columns to guarantee header background and text color on all columns (especially fixed ones)
  const resolvedColumns = React.useMemo(() => {
    if (!restProps.columns) return restProps.columns;
    return restProps.columns.map((col: any) => ({
      ...col,
      onHeaderCell: (column: any) => {
        const existing = col.onHeaderCell ? col.onHeaderCell(column) : {};
        return {
          ...existing,
          style: {
            backgroundColor: 'var(--theme-table-header-bg, #0b1e36)',
            color: 'var(--theme-table-header-color, #ffffff)',
            ...(existing?.style || {}),
          },
          className: `${existing?.className || ''} erp-th-navy`.trim(),
        };
      },
    }));
  }, [restProps.columns]);

  return (
    <div
      className={`erp-table-container ${dense ? 'erp-table-container--dense' : ''} ${containerClassName}`.trim()}
      style={containerStyle}
    >
      <Table<T>
        className={`erp-table ${className}`.trim()}
        scroll={resolvedScroll}
        sticky={sticky}
        pagination={resolvedPagination}
        locale={resolvedLocale}
        {...restProps}
        columns={resolvedColumns}
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
 * Standardizes View (blue), Edit (gold), and Delete (red) icon buttons.
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
      className: 'act-view',
    });
  }
  if (onEdit) {
    resolvedActions.push({
      key: 'edit',
      label: onEditLabel,
      icon: <EditOutlined />,
      onClick: onEdit,
      className: 'act-edit',
    });
  }
  if (onDelete) {
    resolvedActions.push({
      key: 'delete',
      label: onDeleteLabel,
      icon: <DeleteOutlined />,
      danger: true,
      className: 'act-delete',
      confirm: {
        title: deleteConfirmTitle,
        onConfirm: onDelete,
      },
    });
  }

  let appModal: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const app = App.useApp();
    appModal = app?.modal;
  } catch {
    // outside App provider
  }

  if (resolvedActions.length > 0 || (extraActions && extraActions.length > 0)) {
    return (
      <div className={`erp-table-actions ${className}`.trim()} style={style}>
        {resolvedActions.map((act) => {
          const handleClick = () => {
            if (act.confirm) {
              const confirmFn = appModal?.confirm || Modal.confirm;
              confirmFn({
                centered: true,
                title: act.confirm.title,
                content: act.confirm.description || (act.danger ? 'Are you sure you want to proceed with this deletion? This action cannot be undone.' : undefined),
                okText: act.confirm.okText || (act.danger ? 'Yes, Delete' : 'Confirm'),
                cancelText: act.confirm.cancelText || 'Cancel',
                okButtonProps: act.danger ? { danger: true } : undefined,
                onOk: async () => {
                  await act.confirm?.onConfirm();
                },
              });
              return;
            }
            if (act.onClick) {
              act.onClick();
            }
          };

          const actionClass = act.className || (
            act.key === 'view' || act.label?.toLowerCase().includes('view') ? 'act-view' :
            act.key === 'edit' || act.label?.toLowerCase().includes('edit') ? 'act-edit' :
            (act.key === 'delete' || act.danger || act.label?.toLowerCase().includes('delete')) ? 'act-delete' : ''
          );

          const btn = (
            <Button
              key={act.key}
              type="text"
              size="small"
              danger={act.danger}
              disabled={act.disabled}
              icon={act.icon}
              onClick={handleClick}
              aria-label={act.label}
              className={actionClass}
              style={act.style}
            />
          );

          return (
            <Tooltip key={act.key} title={act.label}>
              <span style={{ display: 'inline-flex' }}>
                {btn}
              </span>
            </Tooltip>
          );
        })}
        {extraActions && extraActions.map((extra, idx) => (
          <span key={`extra-${idx}`} style={{ display: 'inline-flex' }}>
            {extra}
          </span>
        ))}
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
  label?: string;
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
  onClearFilters?: () => void;
  filterCollapsible?: boolean;
  defaultFilterOpen?: boolean;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  showExportButtons?: boolean;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  onPrint?: () => void;
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
 * Standardized table toolbar container matching enterprise layout (Image 1 standard):
 * - Search input and Collapsible Filters toggle (▼ Filters) grouped together on the left
 * - Utility actions (CSV, PDF, Print, Page Size, Refresh, Primary Action) on the right
 * - Collapsible filter panel with clean grid of selects below the toolbar
 */
export const TableToolbar: React.FC<TableToolbarProps> = ({
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filters,
  onClearFilters,
  defaultFilterOpen = false,
  pageSize,
  onPageSizeChange,
  pageSizeOptions,
  showExportButtons = true,
  onExportCSV,
  onExportPDF,
  onPrint,
  onRefresh,
  primaryAction,
  actions,
  left,
  right,
  children,
  className = '',
  style,
}) => {
  const [filterOpen, setFilterOpen] = React.useState<boolean>(defaultFilterOpen);

  if (children) {
    return (
      <div className={`erp-table-toolbar ${className}`.trim()} style={style}>
        {children}
      </div>
    );
  }

  const hasFilters = filters && filters.length > 0;
  const activeFiltersCount = filters ? filters.filter(f => f.value !== undefined && f.value !== null && f.value !== '').length : 0;

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  const handleExportCSV = () => {
    if (onExportCSV) {
      onExportCSV();
    } else {
      const tables = document.querySelectorAll('.erp-table-container table, .ant-table table');
      if (tables.length > 0) {
        let csvContent = "data:text/csv;charset=utf-8,";
        const rows = tables[0].querySelectorAll('tr');
        rows.forEach(row => {
          const cols = row.querySelectorAll('th, td');
          const rowData: string[] = [];
          cols.forEach(col => rowData.push(`"${(col.textContent || '').replace(/"/g, '""').trim()}"`));
          csvContent += rowData.join(",") + "\r\n";
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  return (
    <div className={`erp-toolbar-card ${className}`.trim()} style={style}>
      {/* ── Top Single-Line Toolbar: Search & Filters on Left, Actions on Right ── */}
      <div className="erp-toolbar-main-row">
        <div className="erp-toolbar-left-group">
          {searchPlaceholder !== undefined && (
            <Input
              className="erp-toolbar-search-input"
              placeholder={searchPlaceholder}
              prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
              value={searchValue}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onSearchChange?.(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />
          )}

          {hasFilters && (
            <Button
              type={filterOpen ? 'primary' : 'default'}
              icon={<SearchOutlined />}
              onClick={() => setFilterOpen((prev) => !prev)}
              className="erp-toolbar-filter-btn"
            >
              <span>{filterOpen ? '▼ Filters' : '▶ Filters'}</span>
              {activeFiltersCount > 0 && (
                <span className="erp-toolbar-badge">{activeFiltersCount}</span>
              )}
            </Button>
          )}

          {onClearFilters && activeFiltersCount > 0 && (
            <Button type="text" size="small" onClick={onClearFilters} style={{ color: 'var(--theme-text-muted, #64748b)' }}>
              Clear
            </Button>
          )}

          {left}
        </div>

        <div className="erp-toolbar-right-group">
          {showExportButtons && (
            <div className="erp-export-btn-group">
              <button
                type="button"
                className="erp-export-btn"
                onClick={handleExportCSV}
                title="Export CSV"
              >
                CSV
              </button>
              <button
                type="button"
                className="erp-export-btn"
                onClick={onExportPDF || handlePrint}
                title="Export PDF"
              >
                PDF
              </button>
              <button
                type="button"
                className="erp-export-btn"
                onClick={handlePrint}
                title="Print Table"
              >
                Print
              </button>
            </div>
          )}

          {onPageSizeChange && (
            <div className="erp-entries-selector">
              <span>Show</span>
              <Select
                size="small"
                value={pageSize || 10}
                onChange={onPageSizeChange}
                style={{ width: 70 }}
                options={(pageSizeOptions || [10, 20, 50, 100]).map((opt) => ({
                  value: opt,
                  label: `${opt}`,
                }))}
              />
              <span>entries</span>
            </div>
          )}

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
              style={{
                background: '#16a34a',
                borderColor: '#15803d',
                fontWeight: 600,
              }}
            >
              {primaryAction.label}
            </Button>
          )}

          {actions}
          {right}
        </div>
      </div>

      {/* ── Sliding Collapsible Filter Panel (opens directly below search & filters) ── */}
      {hasFilters && filterOpen && (
        <div className="erp-toolbar-filter-grid-panel">
          <div className="erp-toolbar-filter-grid">
            {filters.map((f) => (
              <div key={f.key} className="erp-filter-field" style={f.width ? { width: f.width, maxWidth: f.width } : undefined}>
                <span className="erp-filter-field-label">
                  {f.label || f.placeholder || f.key}
                </span>
                <Select
                  placeholder={f.placeholder || `Select ${f.label || f.key}`}
                  value={f.value}
                  onChange={f.onChange}
                  allowClear
                  loading={f.loading}
                  options={f.options}
                  style={{ width: '100%' }}
                />
              </div>
            ))}
          </div>
          {onClearFilters && (
            <div className="erp-toolbar-filter-grid-footer">
              <Button size="small" type="text" onClick={onClearFilters}>
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ERPTable;

