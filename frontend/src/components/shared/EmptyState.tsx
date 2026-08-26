import React from 'react';
import { Empty, Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No data',
  description = 'No records found.',
  actionLabel,
  onAction,
}) => (
  <div style={{ padding: '48px 0', textAlign: 'center' }}>
    <Empty description={null} />
    <div style={{ fontSize: 15, fontWeight: 500, marginTop: 8, color: 'var(--theme-text, #222)' }}>{title}</div>
    <div style={{ fontSize: 13, color: 'var(--theme-text-muted, #999)', marginTop: 4 }}>{description}</div>
    {actionLabel && onAction && (
      <Button type="primary" icon={<PlusOutlined />} onClick={onAction} style={{ marginTop: 16 }}>
        {actionLabel}
      </Button>
    )}
  </div>
);

export default EmptyState;
