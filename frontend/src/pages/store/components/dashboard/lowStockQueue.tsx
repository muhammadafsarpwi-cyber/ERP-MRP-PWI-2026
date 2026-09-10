import React from 'react';
import { Card, Table, Tag, Button, Empty, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { LowStockRow } from '../../../../services/storeDashboard';
import { cardStyle, fmt, fmtDate, sectionTitle, statusColor } from './helpers';

interface LowStockQueueProps {
  available: boolean;
  rows: LowStockRow[];
  onOpen: (path: string) => void;
}

const LowStockQueue: React.FC<LowStockQueueProps> = ({ available, rows, onOpen }) => {
  const columns: ColumnsType<LowStockRow> = [
    { title: 'Item', dataIndex: 'itemName', width: 180, ellipsis: true, render: (v, r) => <span style={{ fontWeight: 600 }}>{v || r.itemCode}</span> },
    { title: 'Code', dataIndex: 'itemCode', width: 110, render: (v) => <span style={{ color: 'var(--theme-text-muted)' }}>{v}</span> },
    { title: 'Store', dataIndex: 'storeName', width: 130, ellipsis: true, render: (v, r) => v || r.storeCode || '—' },
    { title: 'Available', dataIndex: 'available', width: 90, align: 'right', render: (v) => <span style={{ color: 'var(--theme-error, #ff4d4f)', fontWeight: 600 }}>{fmt(v)}</span> },
    { title: 'Min', dataIndex: 'minimumStock', width: 80, align: 'right', render: (v) => fmt(v) },
    { title: 'Reorder', dataIndex: 'reorderLevel', width: 80, align: 'right', render: (v, r) => fmt(r.reorderLevel ?? v) },
    { title: 'Max', dataIndex: 'maximumStock', width: 80, align: 'right', render: (v, r) => fmt(r.maximumStock ?? v) },
    { title: 'Required', dataIndex: 'remainingRequirement', width: 90, align: 'right', render: (v, r) => fmt(v ?? r.requiredQuantity) },
    { title: 'In Procurement', dataIndex: 'alreadyInProcurement', width: 100, align: 'right', render: (v) => fmt(v) },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 130,
      render: (v) => <Tag color={statusColor(v)} style={{ marginInlineEnd: 0 }}>{v}</Tag>,
    },
    {
      title: 'Reference',
      dataIndex: 'materialRequestNumber',
      width: 150,
      render: (v, r) => r.materialRequestNumber || r.prNumber || r.poNumber || '—',
    },
    {
      title: 'ETA',
      dataIndex: 'expectedDeliveryDate',
      width: 100,
      render: (v, r) => {
        if (r.overdueSince) return <Tag color="volcano" style={{ marginInlineEnd: 0 }}>Overdue</Tag>;
        return fmtDate(v);
      },
    },
  ];

  return (
    <Card
      size="small"
      title={sectionTitle('Low Stock Queue')}
      style={cardStyle}
      styles={{ body: { padding: 8 } }}
      extra={
        <Button size="small" type="primary" ghost onClick={() => onOpen('/store/low-stock')}>
          Open Queue
        </Button>
      }
    >
      {!available ? (
        <Alert
          type="info"
          showIcon
          message="Replenishment queue currently unavailable"
          description="The store replenishment feature is not enabled yet. This section will populate once the schedule runs."
        />
      ) : (
        <Table
          size="small"
          columns={columns}
          dataSource={rows.slice(0, 8)}
          rowKey="id"
          pagination={false}
          scroll={{ x: 'max-content', y: 320 }}
          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No low stock items" /> }}
        />
      )}
    </Card>
  );
};

export default LowStockQueue;