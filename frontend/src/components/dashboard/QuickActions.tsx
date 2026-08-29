import React from 'react';
import { Button } from 'antd';
import {
  AppstoreAddOutlined, DeploymentUnitOutlined, ExportOutlined, ImportOutlined, RightOutlined,
} from '@ant-design/icons';
import { SectionCard } from './dashboardShared';

interface ActionDef {
  key: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
  path: string;
}

const ACTIONS: ActionDef[] = [
  { key: 'entry', label: 'Log Production', desc: 'Record a production entry', icon: <AppstoreAddOutlined />, path: '/production/entries/select' },
  { key: 'receive', label: 'Goods Receipt', desc: 'Confirm inbound receipt', icon: <ImportOutlined />, path: '/procurement/receipts' },
  { key: 'transfer', label: 'Transfer Stock', desc: 'Move stock between locations', icon: <ExportOutlined />, path: '/inventory/transfers' },
  { key: 'machines', label: 'Machines', desc: 'Machinery & capability sheet', icon: <DeploymentUnitOutlined />, path: '/master-data/machines' },
];

interface QuickActionsProps {
  nav: (path: string) => void;
}

const QuickActions: React.FC<QuickActionsProps> = ({ nav }) => (
  <SectionCard title="Quick Actions" subtitle="Frequently used operations">
    <div className="erp-qa-grid">
      {ACTIONS.map((action) => (
        <Button
          key={action.key}
          className="erp-qa"
          onClick={() => nav(action.path)}
          aria-label={`${action.label} — ${action.desc}`}
        >
          <span className="erp-qa__icon" aria-hidden="true">{action.icon}</span>
          <span className="erp-qa__text">
            <span className="erp-qa__label">{action.label}</span>
            <span className="erp-qa__desc">{action.desc}</span>
          </span>
          <RightOutlined className="erp-qa__arrow" aria-hidden="true" />
        </Button>
      ))}
    </div>
  </SectionCard>
);

export default QuickActions;