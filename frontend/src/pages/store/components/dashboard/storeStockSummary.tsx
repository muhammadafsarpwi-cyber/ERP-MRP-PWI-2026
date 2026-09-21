import React, { useMemo } from 'react';
import { Card, Table, Tag, Button, Empty, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { type StockSummaryRow, type StoreOption, ITEM_TYPES } from '../../../../services/storeDashboard';
import { cardStyle, fmt, sectionTitle } from './helpers';

interface StoreStockSummaryProps {
  rows: StockSummaryRow[];
  belowMinimum: number;
  stores?: StoreOption[];
  selectedStoreId?: string;
  onStoreChange?: (storeId?: string) => void;
  itemType?: string;
  onItemTypeChange?: (itemType?: string) => void;
  onViewBalance: (path: string) => void;
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  LOW: { color: 'red', label: 'Low' },
  REORDER: { color: 'orange', label: 'Reorder' },
  OK: { color: 'green', label: 'Ok' },
};

const StoreStockSummary: React.FC<StoreStockSummaryProps> = ({
  rows,
  belowMinimum,
  stores = [],
  selectedStoreId,
  onStoreChange,
  itemType,
  onItemTypeChange,
  onViewBalance,
}) => {
  // Filter rows by storeId on client side as well for immediate responsiveness
  const filteredRows = useMemo(() => {
    if (!selectedStoreId || selectedStoreId === 'ALL') return rows;
    return rows.filter((r) => r.storeId === selectedStoreId);
  }, [rows, selectedStoreId]);

  // Columns: Store column removed as requested, now selected via dropdown in header
  const columns: ColumnsType<StockSummaryRow> = [
    {
      title: 'Item Code',
      dataIndex: 'itemCode',
      width: 125,
      fixed: 'left',
      render: (v) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: 'Item Name',
      dataIndex: 'itemName',
      width: 220,
      ellipsis: true,
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      width: 70,
      render: (v) => v || '—',
    },
    {
      title: 'On Hand',
      dataIndex: 'onHand',
      width: 95,
      align: 'right',
      render: (v) => fmt(v),
    },
    {
      title: 'Reserved',
      dataIndex: 'reserved',
      width: 90,
      align: 'right',
      render: (v) => fmt(v),
    },
    {
      title: 'Available',
      dataIndex: 'available',
      width: 95,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span>,
    },
    {
      title: 'Min',
      dataIndex: 'minimumStock',
      width: 80,
      align: 'right',
      render: (v, r) => fmt(r.minimumStock ?? v),
    },
    {
      title: 'Reorder',
      dataIndex: 'reorderLevel',
      width: 80,
      align: 'right',
      render: (v, r) => fmt(r.reorderLevel ?? v),
    },
    {
      title: 'Max',
      dataIndex: 'maximumStock',
      width: 80,
      align: 'right',
      render: (v, r) => fmt(r.maximumStock ?? v),
    },
    {
      title: 'Shortage',
      dataIndex: 'shortage',
      width: 90,
      align: 'right',
      render: (v) => (
        <span
          style={{
            color: Number(v) > 0 ? 'var(--theme-error, #ff4d4f)' : 'inherit',
            fontWeight: Number(v) > 0 ? 600 : 400,
          }}
        >
          {fmt(v)}
        </span>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 92,
      render: (v) => {
        const meta = STATUS_META[String(v || '').toUpperCase()] ?? { color: 'default', label: v || '—' };
        return <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>{meta.label}</Tag>;
      },
    },
  ];

  return (
    <Card
      size="small"
      title={sectionTitle('Store Stock Summary')}
      style={cardStyle}
      styles={{ body: { padding: 8 } }}
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {onStoreChange ? (
            <Select
              size="small"
              style={{ minWidth: 180 }}
              placeholder="All Stores"
              value={selectedStoreId || 'ALL'}
              onChange={(val) => onStoreChange(val === 'ALL' ? undefined : val)}
              options={[
                { value: 'ALL', label: 'All Stores' },
                ...stores.map((s) => ({
                  value: s.id,
                  label: s.storeName ? `${s.storeName} (${s.storeCode || ''})` : s.storeCode || s.id,
                })),
              ]}
              showSearch
              filterOption={(input, opt) =>
                (opt?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          ) : null}
          {onItemTypeChange ? (
            <Select
              size="small"
              style={{ width: 160 }}
              value={itemType || 'ALL'}
              onChange={(val) => onItemTypeChange(val === 'ALL' ? undefined : val)}
              options={ITEM_TYPES.map((t) => ({ value: t.value, label: t.label }))}
            />
          ) : null}
          <span style={{ fontSize: 12.5, color: 'var(--theme-text-muted)' }}>
            {fmt(filteredRows.length, 0)} items ·{' '}
            <span style={{ color: 'var(--theme-error, #ff4d4f)', fontWeight: 600 }}>{fmt(belowMinimum, 0)} below min</span>
          </span>
          <Button size="small" type="primary" ghost onClick={() => onViewBalance('/store/stock-balance')}>
            View Stock Balance
          </Button>
        </div>
      }
    >
      <Table
        size="small"
        columns={columns}
        dataSource={filteredRows}
        rowKey={(r) => r.storeItemId || r.itemId}
        pagination={{
          defaultPageSize: 10,
          pageSizeOptions: ['10', '20', '50', '100'],
          showSizeChanger: true,
          showTotal: (total) => `${total} items`,
        }}
        scroll={{ x: 'max-content', y: 360 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No inventory items found for the selected filters."
            />
          ),
        }}
      />
    </Card>
  );
};

export default StoreStockSummary;