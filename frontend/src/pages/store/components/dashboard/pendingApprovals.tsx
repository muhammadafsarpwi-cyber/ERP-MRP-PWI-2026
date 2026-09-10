import React from 'react';
import { Card, Table, Tag, Button, Empty } from 'antd';
import { AuditOutlined, CrownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { PendingApprovalRow } from '../../../../services/storeDashboard';
import { cardStyle, fmt, statusColor } from './helpers';

interface PendingApprovalsProps {
  manager: PendingApprovalRow[];
  gm: PendingApprovalRow[];
  onReview: (path: string) => void;
}

const statusTag = (status: string) => (
  <Tag color={statusColor(status)} style={{ marginInlineEnd: 0 }}>
    {status}
  </Tag>
);

const renderTable = (rows: PendingApprovalRow[], onReview: (path: string) => void): JSX.Element => {
  const columns: ColumnsType<PendingApprovalRow> = [
    { title: 'Document', dataIndex: 'requestNumber', width: 150, fixed: 'left', render: (v) => <span style={{ fontWeight: 600 }}>{v}</span> },
    { title: 'Store', dataIndex: 'storeName', width: 160, ellipsis: true, render: (v, r) => v || r.storeCode || '—' },
    { title: 'Department', dataIndex: 'departmentName', width: 150, ellipsis: true, render: (v) => v || '—' },
    { title: 'Items', dataIndex: 'items', width: 60, align: 'right', render: (v) => fmt(v, 0) },
    { title: 'Qty', dataIndex: 'quantity', width: 90, align: 'right', render: (v) => fmt(v) },
    { title: 'Age', dataIndex: 'ageDays', width: 70, align: 'right', render: (v) => (v <= 0 ? 'Today' : `${v}d`) },
    { title: 'Status', dataIndex: 'status', width: 110, render: statusTag },
    {
      title: '',
      key: 'review',
      width: 90,
      fixed: 'right',
      render: () => (
        <Button size="small" type="primary" ghost onClick={() => onReview('/store/pending-approvals')}>
          Review
        </Button>
      ),
    },
  ];

  return (
    <Table
      size="small"
      columns={columns}
      dataSource={rows}
      rowKey="id"
      pagination={false}
      scroll={{ x: 'max-content', y: 300 }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No pending approvals" /> }}
    />
  );
};

const PendingApprovals: React.FC<PendingApprovalsProps> = ({ manager, gm, onReview }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 12 }}>
      <Card
        size="small"
        title={
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>
            <AuditOutlined style={{ marginRight: 8, color: 'var(--theme-accent)' }} />
            Manager Approvals
            <Tag color="gold" style={{ marginLeft: 8 }}>{manager.length}</Tag>
          </span>
        }
        style={cardStyle}
        styles={{ body: { padding: 8 } }}
      >
        {renderTable(manager, onReview)}
      </Card>
      <Card
        size="small"
        title={
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>
            <CrownOutlined style={{ marginRight: 8, color: 'var(--theme-accent)' }} />
            GM Approvals
            <Tag color="orange" style={{ marginLeft: 8 }}>{gm.length}</Tag>
          </span>
        }
        style={cardStyle}
        styles={{ body: { padding: 8 } }}
      >
        {renderTable(gm, onReview)}
      </Card>
    </div>
  );
};

export default PendingApprovals;