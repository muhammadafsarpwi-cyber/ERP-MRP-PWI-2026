import React from 'react';
import { Button, Input, Typography } from 'antd';
import { ApartmentOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { EmptyState, SectionCard, SkeletonRows } from './dashboardShared';
import type { ItemOverview as ItemOverviewType } from '../../services/dashboardService';

const { Text } = Typography;

interface ItemOverviewProps {
  items: ItemOverviewType[];
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  onOpen: (item: ItemOverviewType) => void;
  nav: () => void;
}

const typeClass = (t: string): string => {
  if (t === 'FINISHED_GOOD') return 'finished';
  if (t === 'RAW_MATERIAL') return 'raw';
  return 'other';
};

const stockHealth = (item: ItemOverviewType): 'healthy' | 'low' | 'reserved' => {
  const min = item.minimumStockLevel ?? 0;
  if (item.stock.onHand <= min) return 'low';
  if (item.stock.available <= 0) return 'reserved';
  return 'healthy';
};

const ItemOverview: React.FC<ItemOverviewProps> = ({
  items, loading, search, onSearch, onOpen, nav,
}) => {
  if (loading && items.length === 0) {
    return (
      <SectionCard icon={<ApartmentOutlined />} title="Item Overview">
        <SkeletonRows rows={8} />
      </SectionCard>
    );
  }

  const emptyTitle = search ? 'No matching items' : 'No item data is available for this selection';

  return (
    <SectionCard
      icon={<ApartmentOutlined />}
      title="Item Overview"
      subtitle={`${items.length} items`}
      extra={
        <div className="erp-chart-header__actions">
          <Input
            placeholder="Search items…"
            prefix={<SearchOutlined className="erp-input-prefix" aria-hidden="true" />}
            size="small"
            allowClear
            className="erp-item-search"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label="Search items"
          />
          <Button size="small" type="link" className="erp-link-btn" onClick={nav}>
            View All <RightOutlined />
          </Button>
        </div>
      }
    >
      {items.length > 0 ? (
        <div className="erp-scroll-x erp-scroll-y">
          <table className="erp-data-table erp-item-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th style={{ textAlign: 'center' }}>Type</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }}>Reserved</th>
                <th style={{ textAlign: 'right' }}>Available</th>
                <th style={{ textAlign: 'right' }}>Prod</th>
                <th style={{ textAlign: 'center' }}>Route</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const health = stockHealth(item);
                return (
                  <tr
                    key={item.id}
                    className="erp-item-row"
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${item.itemCode} ${item.name} details`}
                    onClick={() => onOpen(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onOpen(item);
                    }}
                  >
                    <td>
                      <span className={`erp-item-row__health erp-item-row__health--${health}`} aria-hidden="true" />
                      <Text strong className="erp-item-row__code">{item.itemCode}</Text>
                    </td>
                    <td className="erp-item-row__name">{item.name}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`erp-type-badge erp-type-badge--${typeClass(item.itemType)}`}>
                        {item.itemType?.replace('_', ' ') || 'N/A'}
                      </span>
                    </td>
                    <td className="erp-num">
                      <span className={health === 'low' ? 'erp-num--danger' : undefined}>{item.stock.onHand}</span>
                    </td>
                    <td className="erp-num erp-num--muted">{item.stock.reserved}</td>
                    <td className="erp-num">
                      <span className={health === 'reserved' ? 'erp-num--warning' : 'erp-num--success'}>
                        {item.stock.available}
                      </span>
                    </td>
                    <td className="erp-num">{item.production.entryCount}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`erp-bool-chip ${item.isManufacturable ? 'erp-bool-chip--yes' : 'erp-bool-chip--no'}`}>
                        {item.isManufacturable ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={<ApartmentOutlined />}
          title={emptyTitle}
          desc={search ? 'Try a different search term' : 'Items will appear once master data is configured'}
        />
      )}
    </SectionCard>
  );
};

export default ItemOverview;