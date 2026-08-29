import React from 'react';
import {
  DatabaseOutlined, ToolOutlined, ShopOutlined, RiseOutlined,
  ShoppingCartOutlined, DollarOutlined, WarningOutlined, CheckCircleOutlined,
} from '@ant-design/icons';
import { SkeletonKpi } from './dashboardShared';
import type { DashboardSummary } from '../../services/dashboardService';

interface KpiStripProps {
  summary: DashboardSummary | null;
  loading: boolean;
  nav: (path: string) => void;
}

interface KpiDef {
  key: string;
  label: string;
  value: number;
  context: string;
  icon: React.ReactNode;
  tone: 'info' | 'success' | 'danger';
  nav: string;
}

const buildKpis = (summary: DashboardSummary | null): KpiDef[] => {
  const lowStock = summary?.inventory.lowStockItems ?? 0;
  return [
    {
      key: 'items',
      label: 'Active Items',
      value: summary?.items.active ?? 0,
      context: `${summary?.items.total ?? 0} total in system`,
      icon: <DatabaseOutlined />,
      tone: 'info',
      nav: '/master-data/items',
    },
    {
      key: 'machines',
      label: 'Machines',
      value: summary?.machines.active ?? 0,
      context: `${summary?.machines.total ?? 0} total registered`,
      icon: <ToolOutlined />,
      tone: 'info',
      nav: '/master-data/machines',
    },
    {
      key: 'entries',
      label: 'Production Entries',
      value: summary?.productionEntries.total ?? 0,
      context: `${summary?.productionEntries.today ?? 0} recorded today`,
      icon: <ShopOutlined />,
      tone: 'info',
      nav: '/production',
    },
    {
      key: 'targets',
      label: 'Active Targets',
      value: summary?.machineTargets.active ?? 0,
      context: `${summary?.machineTargets.total ?? 0} total targets`,
      icon: <RiseOutlined />,
      tone: 'info',
      nav: '/production/targets',
    },
    {
      key: 'lowstock',
      label: 'Low Stock',
      value: lowStock,
      context: lowStock > 0 ? 'Requires attention' : 'All stock levels healthy',
      icon: lowStock > 0 ? <WarningOutlined /> : <CheckCircleOutlined />,
      tone: lowStock > 0 ? 'danger' : 'success',
      nav: '/inventory',
    },
    {
      key: 'po',
      label: 'Active POs',
      value: summary?.purchaseOrders.active ?? 0,
      context: 'Open purchase orders',
      icon: <ShoppingCartOutlined />,
      tone: 'info',
      nav: '/procurement/orders',
    },
    {
      key: 'so',
      label: 'Active SOs',
      value: summary?.salesOrders.active ?? 0,
      context: 'Open sales orders',
      icon: <DollarOutlined />,
      tone: 'info',
      nav: '/sales/orders',
    },
  ];
};

const KpiStrip: React.FC<KpiStripProps> = ({ summary, loading, nav }) => {
  if (loading && !summary) {
    return (
      <div className="erp-kpi-grid" aria-hidden="true">
        <SkeletonKpi count={7} />
      </div>
    );
  }

  const kpis = buildKpis(summary);

  return (
    <div className="erp-kpi-grid">
      {kpis.map((kpi) => (
        <div
          key={kpi.key}
          className="erp-kpi-card"
          role="button"
          tabIndex={0}
          aria-label={`${kpi.label}: ${kpi.value}. ${kpi.context}`}
          onClick={() => nav(kpi.nav)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') nav(kpi.nav);
          }}
        >
          <span className={`erp-kpi-card__icon erp-kpi-card__icon--${kpi.tone}`} aria-hidden="true">
            {kpi.icon}
          </span>
          <div className="erp-kpi-card__body">
            <div className="erp-kpi-card__label">{kpi.label}</div>
            <div className={`erp-kpi-card__value${kpi.tone === 'danger' && kpi.value > 0 ? ' erp-kpi-card__value--danger' : ''}`}>
              {kpi.value}
            </div>
            <div className={`erp-kpi-card__detail${kpi.tone !== 'info' ? ` erp-kpi-card__detail--${kpi.tone}` : ''}`}>
              {kpi.context}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default KpiStrip;