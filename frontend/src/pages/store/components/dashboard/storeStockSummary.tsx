import React from 'react';
import { Card, Table, Tag, Button, Empty } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { StockSummaryRow } from '../../../../services/storeDashboard';
import { cardStyle, fmt, sectionTitle } from './helpers';

interface StoreStockSummaryProps {
  rows: StockSummaryRow[];
  belowMinimum: number;
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
  onViewBalance,
}) => {
  const columns: ColumnsType<StockSummaryRow> = [
    { title: 'Item Code', dataIndex: 'itemCode', width: 120, fixed: 'left', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Item Name', dataIndex: 'itemName', width: 200, ellipsis: true },
    { title: 'Store', dataIndex: 'storeName', width: 140, ellipsis: true, render: (v, r) => v || r.storeCode || '—' },
    { title: 'UOM', dataIndex: 'uomCode', width: 60, render: (v) => v || '—' },
    { title: 'On Hand', dataIndex: 'onHand', width: 90, align: 'right', render: (v) => fmt(v) },
    { title: 'Reserved', dataIndex: 'reserved', width: 90, align: 'right', render: (v) => fmt(v) },
    { title: 'Available', dataIndex: 'available', width: 90, align: 'right', render: (v) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
    { title: 'Min', dataIndex: 'minimumStock', width: 80, align: 'right', render: (v, r) => fmt(r.minimumStock ?? v) },
    { title: 'Reorder', dataIndex: 'reorderLevel', width: 80, align: 'right', render: (v, r) => fmt(r.reorderLevel ?? v) },
    { title: 'Max', dataIndex: 'maximumStock', width: 80, align: 'right', render: (v, r) => fmt(r.maximumStock ?? v) },
    {
      title: 'Shortage',
      dataIndex: 'shortage',
      width: 90,
      align: 'right',
      render: (v) => (
        <span style={{ color: Number(v) > 0 ? 'var(--theme-error, #ff4d4f)' : 'inherit', fontWeight: Number(v) > 0 ? 600 : 400 }}>
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12.5, color: 'var(--theme-text-muted)' }}>
            {fmt(rows.length, 0)} items ·{' '}
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
        dataSource={rows}
        rowKey="storeItemId"
        pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (t) => `${t} rows` }}
        scroll={{ x: 'max-content', y: 360 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No stock records" /> }}
      />
    </Card>
  );
};

export default StoreStockSummary;