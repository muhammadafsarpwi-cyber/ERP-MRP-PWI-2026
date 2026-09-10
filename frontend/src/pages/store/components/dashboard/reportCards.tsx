import React from 'react';
import { Card } from 'antd';
import {
  BarChartOutlined,
  FileTextOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SwapOutlined,
  EditOutlined,
  DatabaseOutlined,
  InboxOutlined,
  ClockCircleOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { cardStyle, sectionTitle } from './helpers';

interface ReportCard {
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  critical?: boolean;
}

const REPORTS: ReportCard[] = [
  { title: 'Pending Approvals', description: 'Items awaiting approval', icon: <ClockCircleOutlined />, path: '/store/pending-approvals', color: '#ff4d4f', critical: true },
  { title: 'Replenishment Queue', description: 'Low stock items to reorder', icon: <BarChartOutlined />, path: '/store/low-stock', color: '#fa541c', critical: true },
  { title: 'Stock Balance', description: 'Current stock levels per store', icon: <InboxOutlined />, path: '/store/stock-balance', color: '#52c41a' },
  { title: 'Material Requests', description: 'All requests and fulfillment', icon: <FileTextOutlined />, path: '/store/material-requests', color: '#1890ff' },
  { title: 'Material Issues', description: 'Issued from store', icon: <ArrowUpOutlined />, path: '/store/material-issues', color: '#f5222d' },
  { title: 'Material Receipts', description: 'Received into store', icon: <ArrowDownOutlined />, path: '/store/material-receipts', color: '#52c41a' },
  { title: 'GRN Report', description: 'Goods receipt notes', icon: <InboxOutlined />, path: '/store/material-receipts', color: '#faad14' },
  { title: 'Transfers', description: 'Stock between stores', icon: <SwapOutlined />, path: '/inventory/transfers', color: '#722ed1' },
  { title: 'Adjustments', description: 'Stock corrections', icon: <EditOutlined />, path: '/inventory/adjustments', color: '#eb2f96' },
  { title: 'Purchase Requisitions', description: 'PRs and status', icon: <FileTextOutlined />, path: '/procurement/requisitions', color: '#fa8c16' },
  { title: 'Stock Ledger', description: 'All stock movements', icon: <DatabaseOutlined />, path: '/store/ledger', color: '#13c2c2' },
  { title: 'Store Performance', description: 'Efficiency metrics', icon: <RiseOutlined />, path: '/store/reports', color: '#2f54eb' },
];

interface ReportCardsProps {
  onNavigate: (path: string) => void;
}

const ReportCards: React.FC<ReportCardsProps> = ({ onNavigate }) => {
  return (
    <Card
      size="small"
      title={sectionTitle('Reports')}
      style={cardStyle}
      styles={{ body: { padding: 10 } }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 8,
        }}
      >
        {REPORTS.map((report) => (
          <div
            key={report.path + report.title}
            onClick={() => onNavigate(report.path)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onNavigate(report.path);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 10px',
              border: report.critical
                ? '1px solid rgba(255, 77, 79, 0.45)'
                : '1px solid var(--theme-border)',
              borderRadius: 8,
              cursor: 'pointer',
              background: 'var(--theme-surface)',
              boxShadow: report.critical ? 'inset 3px 0 0 rgba(255, 77, 79, 0.55)' : 'none',
              transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            }}
            className={report.critical ? 'erp-report-card erp-report-card--critical' : 'erp-report-card'}
          >
            <span
              style={{
                width: 30,
                height: 30,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 15,
                flexShrink: 0,
                color: report.color,
                background: `${report.color}1f`,
              }}
            >
              {report.icon}
            </span>
            <span style={{ minWidth: 0, lineHeight: 1.25 }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600 }}>{report.title}</span>
              <span
                style={{
                  display: 'block',
                  fontSize: 11,
                  color: 'var(--theme-text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {report.description}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default ReportCards;