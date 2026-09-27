import React, { useState } from 'react';
import { Card, Input, Select, Button, Badge, Typography, Tag, Grid } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  CloseOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export interface FilterOption {
  key: string;
  label?: string;
  placeholder: string;
  value: any;
  options: Array<{ value: any; label: React.ReactNode }>;
  onChange: (value: any) => void;
  disabled?: boolean;
  width?: number | string;
  showSearch?: boolean;
  loading?: boolean;
}

export interface FilterBarProps {
  // Search Bar
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (val: string) => void;
  searchWidth?: number | string;

  // Primary inline filter dropdowns (now gracefully moved inside collapsible panel)
  primaryFilters?: React.ReactNode;

  // Secondary collapsible filters (shown inside expandable panel)
  filters?: FilterOption[];
  children?: React.ReactNode;

  // Controlled collapse state (optional)
  visible?: boolean;
  onToggleVisible?: () => void;

  // Reset / Clear
  onReset?: () => void;
  activeCount?: number;

  // Statistics / Meta info on right side
  totalCount?: number;
  itemLabel?: string;
  extra?: React.ReactNode;

  className?: string;
  style?: React.CSSProperties;
}

/**
 * Standard Enterprise 1-Line Collapsible Filter Toolbar.
 * Matches PakWiz 2027 Design System: Single-line top bar with search,
 * single 'Filters' toggle button with active badge, and expandable filters panel.
 */
export const FilterBar: React.FC<FilterBarProps> = ({
  searchPlaceholder = 'Search records...',
  searchValue,
  onSearchChange,
  searchWidth,
  primaryFilters,
  filters = [],
  children,
  visible,
  onToggleVisible,
  onReset,
  activeCount = 0,
  totalCount,
  itemLabel = 'items',
  extra,
  className = '',
  style,
}) => {
  const screens = useBreakpoint();
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isExpanded = visible !== undefined ? visible : internalExpanded;
  const toggleExpanded = () => {
    if (onToggleVisible) {
      onToggleVisible();
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const hasExpandableContent = Boolean(primaryFilters || (filters && filters.length > 0) || children);
  const computedActiveCount = activeCount > 0
    ? activeCount
    : (filters ? filters.filter((f) => f.value !== undefined && f.value !== '' && f.value !== null).length : 0);

  return (
    <Card
      className={`erp-filter-card ${className}`.trim()}
      style={{
        marginBottom: 14,
        borderRadius: 8,
        background: 'var(--theme-surface, #ffffff)',
        borderColor: 'var(--theme-border, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
        ...style,
      }}
      styles={{ body: { padding: '10px 14px 12px' } }}
    >
      {/* ── Top Single-Line Toolbar ── */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {/* Search Input */}
        {onSearchChange && (
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
            placeholder={searchPlaceholder}
            style={{
              flex: screens.md ? '1 1 260px' : '1 1 100%',
              maxWidth: screens.md ? 420 : '100%',
              minWidth: 200,
              borderRadius: 6,
            }}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        )}

        {/* Unified 'Filters' Toggle Button */}
        {hasExpandableContent && (
          <Button
            icon={<FilterOutlined />}
            onClick={toggleExpanded}
            type={isExpanded ? 'primary' : 'default'}
            style={{
              fontWeight: 600,
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span>Filters</span>
            {computedActiveCount > 0 && (
              <Badge
                count={computedActiveCount}
                style={{
                  marginLeft: 6,
                  backgroundColor: isExpanded ? '#ffffff' : 'var(--theme-primary, #3b82f6)',
                  color: isExpanded ? 'var(--theme-primary, #3b82f6)' : '#ffffff',
                }}
              />
            )}
          </Button>
        )}

        <div style={{ flex: 1 }} />

        {/* Total records counter & Extra toolbar actions */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          {totalCount !== undefined && screens.md && (
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
              <span style={{ fontWeight: 700, color: 'var(--theme-text)' }}>{totalCount.toLocaleString()}</span> {itemLabel}
            </Text>
          )}
          {extra}
        </div>
      </div>

      {/* ── Expandable Unified Filters Panel ── */}
      {isExpanded && hasExpandableContent && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: '12px 14px',
            background: 'var(--theme-surface-subtle, rgba(0, 0, 0, 0.02))',
            border: '1px solid var(--theme-border, #e2e8f0)',
            borderRadius: 8,
            marginTop: 12,
          }}
        >
          {/* Header: Title + Active Count + Close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px dashed var(--theme-border, #e2e8f0)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FilterOutlined style={{ color: 'var(--theme-primary, #3b82f6)', fontSize: 14 }} />
              <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--theme-text, #1e293b)' }}>
                Filter Records
              </span>
              {computedActiveCount > 0 && (
                <Tag color="blue" style={{ margin: 0, borderRadius: 10, fontSize: 11, fontWeight: 600 }}>
                  {computedActiveCount} Active
                </Tag>
              )}
            </div>
            <Button
              type="text"
              size="small"
              icon={<CloseOutlined />}
              onClick={toggleExpanded}
              style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 12 }}
              title="Close Filters"
            >
              Close
            </Button>
          </div>

          {/* Grid of ALL Filters */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.md ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
              gap: 10,
              alignItems: 'end',
            }}
          >
            {primaryFilters && (
              <div style={{ display: 'contents' }}>
                {primaryFilters}
              </div>
            )}
            {filters && filters.length > 0
              ? filters.map((f) => (
                  <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {f.label && (
                      <Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>
                        {f.label}
                      </Text>
                    )}
                    <Select
                      allowClear
                      showSearch={f.showSearch ?? true}
                      optionFilterProp="label"
                      placeholder={f.placeholder}
                      style={{ width: f.width ?? '100%', borderRadius: 6 }}
                      value={f.value}
                      options={f.options}
                      onChange={f.onChange}
                      disabled={f.disabled}
                      loading={f.loading}
                    />
                  </div>
                ))
              : null}
            {children}
          </div>

          {/* Footer with Clear Filters and Close inside */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
              paddingTop: 8,
              borderTop: '1px solid var(--theme-border, #e2e8f0)',
            }}
          >
            {onReset ? (
              <Button
                icon={<ClearOutlined />}
                onClick={onReset}
                danger={computedActiveCount > 0}
              >
                Clear Filters
              </Button>
            ) : <div />}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={toggleExpanded}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default FilterBar;
