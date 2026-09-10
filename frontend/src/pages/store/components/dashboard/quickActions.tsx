import React from 'react';
import { Card, Button, Empty } from 'antd';
import {
  FileAddOutlined,
  FileSearchOutlined,
  ShoppingCartOutlined,
  ImportOutlined,
  SwapOutlined,
  EditOutlined,
  ExportOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { cardStyle, sectionTitle } from './helpers';

interface QuickActionDef {
  key: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  path: string;
  permission: string;
  color: string;
}

const ACTIONS: QuickActionDef[] = [
  { key: 'mr', label: 'New Material Request', desc: 'Create request from a store', icon: <FileAddOutlined />, path: '/store/material-requests', permission: 'store.request.create', color: '#1677ff' },
  { key: 'pr', label: 'Create Purchase Requisition', desc: 'Raise a PR from requests', icon: <FileSearchOutlined />, path: '/procurement/requisitions', permission: 'procurement.requisition.create', color: '#fa8c16' },
  { key: 'po', label: 'Create Purchase Order', desc: 'Convert PR into an order', icon: <ShoppingCartOutlined />, path: '/procurement/orders', permission: 'procurement.order.create', color: '#722ed1' },
  { key: 'grn', label: 'Receive Goods (GRN)', desc: 'Confirm inbound material receipt', icon: <ImportOutlined />, path: '/store/material-receipts', permission: 'store.receive.create', color: '#52c41a' },
  { key: 'transfer', label: 'Stock Transfer', desc: 'Move stock between stores', icon: <SwapOutlined />, path: '/inventory/transfers', permission: 'inventory.transfer.create', color: '#13c2c2' },
  { key: 'adjust', label: 'Stock Adjustment', desc: 'Correct stock levels', icon: <EditOutlined />, path: '/inventory/adjustments', permission: 'inventory.adjustment.create', color: '#eb2f96' },
  { key: 'issue', label: 'Material Issue', desc: 'Issue material from store', icon: <ExportOutlined />, path: '/store/material-issues', permission: 'store.issue.create', color: '#ff4d4f' },
  { key: 'return', label: 'Material Return', desc: 'Return material to store', icon: <RollbackOutlined />, path: '/store/material-returns', permission: 'store.return.create', color: '#faad14' },
];

interface QuickActionsProps {
  can: (permission: string) => boolean;
  onNavigate: (path: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ can, onNavigate }) => {
  const actions = ACTIONS.filter((action) => can(action.permission));

  return (
    <Card
      size="small"
      title={sectionTitle('Quick Actions')}
      style={cardStyle}
      styles={{ body: { padding: 10 } }}
    >
      {actions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No quick actions available" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: 8,
          }}
        >
          {actions.map((action) => (
            <Button
              key={action.key}
              onClick={() => onNavigate(action.path)}
              style={{
                height: 'auto',
                padding: '8px 10px',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 8,
                borderColor: 'var(--theme-border)',
              }}
            >
              <span
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  flexShrink: 0,
                  color: action.color,
                  background: `${action.color}1f`,
                }}
              >
                {action.icon}
              </span>
              <span style={{ lineHeight: 1.25 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{action.label}</span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 11,
                    color: 'var(--theme-text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 120,
                  }}
                >
                  {action.desc}
                </span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
};

export default QuickActions;