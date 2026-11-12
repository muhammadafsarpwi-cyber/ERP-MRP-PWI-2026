import React, { useMemo } from 'react';
import { Button, Input, Select, Tag, Typography } from 'antd';
import { ApartmentOutlined, FilterOutlined, RightOutlined, SearchOutlined } from '@ant-design/icons';
import { EmptyState, SectionCard, SkeletonRows } from './dashboardShared';
import type { ItemOverview as ItemOverviewType } from '../../services/dashboardService';

const { Text } = Typography;

interface ItemOverviewProps {
  items: ItemOverviewType[];
  totalItems?: number;
  loading: boolean;
  search: string;
  onSearch: (value: string) => void;
  typeFilter?: string;
  onTypeFilterChange?: (value: string) => void;
  allItems?: ItemOverviewType[];
  onOpen: (item: ItemOverviewType) => void;
  nav: () => void;
}

const typeClass = (t: string): string => {
  if (t === 'FINISHED_GOOD') return 'finished';
  if (t === 'RAW_MATERIAL') return 'raw';
  return 'other';
};

const stockHealth = (item: ItemOverviewType): 'healthy' | 'low' | 'reserved' => {
  if (!item.stock) return 'healthy';
  const min = item.minimumStockLevel ?? 0;
  if (item.stock.onHand <= min) return 'low';
  if (item.stock.available <= 0) return 'reserved';
  return 'healthy';
};

const isFinishedGood = (item: ItemOverviewType): boolean => {
  const t = (item.itemType || '').toUpperCase();
  const c = (item.itemCode || '').toUpperCase();
  return t === 'FINISHED_GOOD' || c.startsWith('SPI-FG-') || c.startsWith('FG-');
};

const renderStockQty = (val: number, isFG: boolean, healthClass?: string) => {
  const num = Number(val) || 0;
  if (!isFG) {
    return (
      <span className={healthClass} style={{ fontWeight: 600, fontSize: 12 }}>
        {num.toLocaleString('en-US')}
      </span>
    );
  }

  const gross = num / 144;
  const grossFormatted =
    gross % 1 === 0
      ? `${gross.toLocaleString('en-US')} GRS`
      : `${gross.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} GRS`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
      <span className={healthClass} style={{ fontWeight: 600, fontSize: 12 }}>
        {num.toLocaleString('en-US')} <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.85 }}>PCS</span>
      </span>
      <span
        style={{
          fontSize: 11,
          color: 'var(--theme-primary, #1677ff)',
          marginTop: 2,
          fontWeight: 600,
          letterSpacing: '0.01em',
        }}
      >
        {grossFormatted}
      </span>
    </div>
  );
};

const ItemOverview: React.FC<ItemOverviewProps> = ({
  items,
  totalItems,
  loading,
  search,
  onSearch,
  typeFilter = 'ALL',
  onTypeFilterChange,
  allItems,
  onOpen,
  nav,
}) => {
  const itemTypeOptions = useMemo(() => {
    const dynamicTypes = new Set<string>();
    const pool = allItems && allItems.length > 0 ? allItems : items;
    pool.forEach((item) => {
      if (item.itemType) dynamicTypes.add(item.itemType.trim());
    });

    const options = [{ value: 'ALL', label: 'All Item Types' }];
    Array.from(dynamicTypes).sort().forEach((t) => {
      const upper = t.toUpperCase();
      let label = t.replace(/_/g, ' ');
      if (upper === 'FINISHED_GOOD') label = 'Finished Goods (FG)';
      else if (upper === 'RAW_MATERIAL') label = 'Raw Material (RM)';
      else if (upper === 'SEMI_FINISHED') label = 'Semi-Finished (SFG)';
      else if (upper === 'WORK_IN_PROGRESS') label = 'Work In Progress (WIP)';
      else if (upper === 'PACKAGING_MATERIAL') label = 'Packaging Material';
      options.push({ value: t, label });
    });

    return options;
  }, [allItems, items]);

  if (loading && items.length === 0) {
    return (
      <SectionCard icon={<ApartmentOutlined />} title="Item Overview">
        <SkeletonRows rows={8} />
      </SectionCard>
    );
  }

  const emptyTitle =
    search || (typeFilter && typeFilter !== 'ALL')
      ? 'No matching items'
      : 'No item data is available for this selection';

  return (
    <SectionCard
      icon={<ApartmentOutlined />}
      title="Item Overview"
      subtitle={
        totalItems != null && totalItems !== items.length
          ? `${items.length} of ${totalItems} items`
          : `${items.length} items`
      }
      extra={
        <div className="erp-chart-header__actions" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Select
            size="small"
            value={typeFilter}
            onChange={(val) => onTypeFilterChange && onTypeFilterChange(val)}
            style={{ width: 175 }}
            options={itemTypeOptions}
            aria-label="Filter items by type"
            dropdownMatchSelectWidth={false}
            suffixIcon={<FilterOutlined style={{ fontSize: 11 }} />}
          />
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
                <th style={{ minWidth: 220 }}>Code & Item</th>
                <th style={{ minWidth: 150 }}>Type & Warehouse</th>
                <th style={{ textAlign: 'right', minWidth: 110 }}>Stock (On Hand)</th>
                <th style={{ textAlign: 'right', minWidth: 100 }}>Reserved</th>
                <th style={{ textAlign: 'right', minWidth: 110 }}>Available</th>
                <th style={{ textAlign: 'right', width: 60 }}>Prod</th>
                <th style={{ textAlign: 'center', width: 65 }}>Route</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const health = stockHealth(item);
                const stock = item.stock ?? { onHand: 0, reserved: 0, available: 0 };
                const whName =
                  item.warehouseName ||
                  item.stock?.warehouseName ||
                  item.warehouseCode ||
                  item.stock?.warehouseCode ||
                  null;
                const isFG = isFinishedGood(item);

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
                    {/* 1. Merged Code (Top) & Item Name (Bottom) */}
                    <td style={{ verticalAlign: 'middle', padding: '8px 12px', minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span
                          className={`erp-item-row__health erp-item-row__health--${health}`}
                          aria-hidden="true"
                          title={`Health: ${health}`}
                        />
                        <Text
                          strong
                          className="erp-item-row__code"
                          style={{
                            fontSize: 12,
                            color: 'var(--theme-text)',
                            fontFamily: 'monospace',
                            letterSpacing: '0.02em',
                            fontWeight: 700,
                          }}
                        >
                          {item.itemCode}
                        </Text>
                      </div>
                      <div
                        className="erp-item-row__merged-name"
                        style={{
                          fontWeight: 500,
                          color: 'var(--theme-text-secondary)',
                          fontSize: 11.5,
                          lineHeight: 1.35,
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.name}
                      </div>
                    </td>

                    {/* 2. Merged Type (Top) & Warehouse (Bottom) */}
                    <td style={{ verticalAlign: 'middle', padding: '8px 12px', minWidth: 150 }}>
                      <div style={{ marginBottom: 3 }}>
                        <span className={`erp-type-badge erp-type-badge--${typeClass(item.itemType)}`}>
                          {item.itemType?.replace(/_/g, ' ') || 'N/A'}
                        </span>
                      </div>
                      <div>
                        {whName ? (
                          <Tag
                            color="cyan"
                            style={{
                              fontSize: 11,
                              margin: 0,
                              borderRadius: 4,
                              maxWidth: 180,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              verticalAlign: 'middle',
                            }}
                            title={whName}
                          >
                            {whName}
                          </Tag>
                        ) : (
                          <span style={{ color: 'var(--theme-text-muted, #64748b)', fontSize: 11 }}>—</span>
                        )}
                      </div>
                    </td>

                    {/* 3. Stock On Hand (PCS + GRS for Finished Goods) */}
                    <td className="erp-num" style={{ verticalAlign: 'middle', padding: '8px 12px' }}>
                      {renderStockQty(stock.onHand, isFG, health === 'low' ? 'erp-num--danger' : undefined)}
                    </td>

                    {/* 4. Reserved (PCS + GRS for Finished Goods) */}
                    <td className="erp-num erp-num--muted" style={{ verticalAlign: 'middle', padding: '8px 12px' }}>
                      {renderStockQty(stock.reserved, isFG, 'erp-num--muted')}
                    </td>

                    {/* 5. Available (PCS + GRS for Finished Goods) */}
                    <td className="erp-num" style={{ verticalAlign: 'middle', padding: '8px 12px' }}>
                      {renderStockQty(
                        stock.available,
                        isFG,
                        health === 'reserved' ? 'erp-num--warning' : 'erp-num--success'
                      )}
                    </td>

                    {/* 6. Production Entries */}
                    <td className="erp-num" style={{ verticalAlign: 'middle', padding: '8px 12px' }}>
                      {item.production?.entryCount ?? 0}
                    </td>

                    {/* 7. Route / Manufacturable */}
                    <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 12px' }}>
                      <span
                        className={`erp-bool-chip ${
                          item.isManufacturable ? 'erp-bool-chip--yes' : 'erp-bool-chip--no'
                        }`}
                      >
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
          desc={
            search || (typeFilter && typeFilter !== 'ALL')
              ? 'Try clearing or changing your filters'
              : 'Items will appear once master data is configured'
          }
        />
      )}
    </SectionCard>
  );
};

export default ItemOverview;
