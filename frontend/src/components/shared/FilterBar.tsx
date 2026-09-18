import React, { useState } from 'react';
import { Card, Input, Select, Button, Badge, Typography, Grid } from 'antd';
import {
  SearchOutlined,
  FilterOutlined,
  ClearOutlined,
  DownOutlined,
  UpOutlined,
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

  // Primary inline filter dropdowns (displayed on top single-line toolbar)
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
 * Matches PakWiz 2027 Design System: Single-line top bar with search, primary selects,
 * collapsible 'More Filters' button, Reset button, and expandable secondary filters grid.
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

  const hasExpandableContent = (filters && filters.length > 0) || Boolean(children);
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

        {/* Primary inline filters on the top line */}
        {primaryFilters && (
          <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {primaryFilters}
          </div>
        )}

        {/* 'More Filters' Expand/Collapse Toggle Button */}
        {hasExpandableContent && (
          <Badge count={computedActiveCount} size="small">
            <Button
              icon={<FilterOutlined />}
              onClick={toggleExpanded}
              style={{
                background: isExpanded ? 'var(--theme-hover, rgba(59, 130, 246, 0.08))' : undefined,
                borderColor: isExpanded ? 'var(--theme-primary, #3b82f6)' : undefined,
                color: isExpanded ? 'var(--theme-primary, #1d4ed8)' : undefined,
                fontWeight: 600,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <span>More Filters</span>
              {isExpanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
            </Button>
          </Badge>
        )}

        {/* Reset Filters Button */}
        {onReset && (
          <Button
            icon={<ClearOutlined />}
            onClick={onReset}
            style={{ borderRadius: 6 }}
          >
            Reset
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

      {/* ── Expandable Secondary Filters Grid ── */}
      {isExpanded && hasExpandableContent && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: screens.md ? 'repeat(auto-fit, minmax(180px, 1fr))' : '1fr',
            gap: 10,
            paddingTop: 12,
            marginTop: 10,
            borderTop: '1px solid var(--theme-border, #f1f5f9)',
          }}
        >
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
      )}
    </Card>
  );
};

export default FilterBar;
