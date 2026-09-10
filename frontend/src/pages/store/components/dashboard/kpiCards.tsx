import React from 'react';
import { Row, Col } from 'antd';
import {
  ShopOutlined,
  AppstoreOutlined,
  WarningOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  AuditOutlined,
  CrownOutlined,
  InboxOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { DashboardKpi } from '../../../../services/storeDashboard';
import { fmt } from './helpers';

const KPI_ICONS: Record<string, React.ReactNode> = {
  totalStores: <ShopOutlined />,
  totalStoreItems: <AppstoreOutlined />,
  lowStockItems: <WarningOutlined />,
  pendingRequests: <FileDoneOutlined />,
  pendingPrs: <FileTextOutlined />,
  pendingManagerApprovals: <AuditOutlined />,
  pendingGmApprovals: <CrownOutlined />,
  pendingReceipts: <InboxOutlined />,
  overdueDeliveries: <ClockCircleOutlined />,
};

const COLOR_HEX: Record<string, string> = {
  blue: '#1677ff',
  geekblue: '#2f54eb',
  volcano: '#fa541c',
  cyan: '#13c2c2',
  purple: '#722ed1',
  gold: '#faad14',
  orange: '#fa8c16',
  green: '#52c41a',
  red: '#f5222d',
  magent: '#eb2f96',
};

export type KpiPath = { key?: string; path?: string };

interface KpiCardsProps {
  kpis: DashboardKpi[];
  kpiPaths: Record<string, string>;
  onNavigate: (path: string) => void;
}

const KpiCards: React.FC<KpiCardsProps> = ({ kpis, kpiPaths, onNavigate }) => {
  return (
    <Row gutter={[10, 10]}>
      {kpis.map((kpi) => {
        const path = kpiPaths[kpi.key];
        const isClickable = !!path;
        const color = COLOR_HEX[kpi.color || 'blue'] || '#1677ff';
        return (
          <Col xs={12} sm={8} md={8} lg={8} xl={8} key={kpi.key}>
            <div
              onClick={isClickable ? () => onNavigate(path) : undefined}
              style={{
                background: 'var(--theme-surface)',
                border: '1px solid var(--theme-border)',
                borderLeft: `3px solid ${color}`,
                borderRadius: 8,
                padding: '10px 12px',
                cursor: isClickable ? 'pointer' : 'default',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                transition: 'box-shadow 0.15s ease, transform 0.15s ease',
              }}
              className={isClickable ? 'erp-kpi-card' : undefined}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 17,
                  flexShrink: 0,
                  color,
                  background: `${color}1f`,
                }}
              >
                {KPI_ICONS[kpi.key] ?? <AppstoreOutlined />}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 19,
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: 'var(--theme-text)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {fmt(kpi.value, 0)}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--theme-text-muted)',
                    lineHeight: 1.25,
                    marginTop: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={kpi.label}
                >
                  {kpi.label}
                </div>
              </div>
            </div>
          </Col>
        );
      })}
    </Row>
  );
};

export default KpiCards;