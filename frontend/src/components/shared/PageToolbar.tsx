import React from 'react';
import { Card, Input, Button, Badge, Typography } from 'antd';
import { SearchOutlined, FilterOutlined, ClearOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface PageToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchWidth?: number;
  filterCount?: number;
  showFilters?: boolean;
  onToggleFilters?: () => void;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  sortInfo?: string;
  extra?: React.ReactNode;
}

const PageToolbar: React.FC<PageToolbarProps> = ({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  searchWidth = 280,
  filterCount = 0,
  showFilters = false,
  onToggleFilters,
  onClearFilters,
  hasActiveFilters = false,
  sortInfo,
  extra,
}) => (
  <Card styles={{ body: { paddingBottom: 0 } }} style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
      <Input
        allowClear
        prefix={<SearchOutlined style={{ color: '#bbb' }} />}
        placeholder={searchPlaceholder}
        style={{ width: searchWidth, maxWidth: '100%' }}
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {onToggleFilters && (
        <Badge count={filterCount}>
          <Button icon={<FilterOutlined />} onClick={onToggleFilters}>
            Filters
          </Button>
        </Badge>
      )}
      {hasActiveFilters && onClearFilters && (
        <Button type="text" icon={<ClearOutlined />} onClick={onClearFilters}>
          Clear Filters
        </Button>
      )}
      <div style={{ flex: 1 }} />
      {sortInfo && (
        <Text type="secondary" style={{ fontSize: 12 }}>{sortInfo}</Text>
      )}
      {extra}
    </div>
  </Card>
);

export default PageToolbar;
