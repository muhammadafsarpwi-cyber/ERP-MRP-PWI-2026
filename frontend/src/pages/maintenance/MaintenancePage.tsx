import React from 'react';
import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  BuildOutlined,
  CalendarOutlined,
  FileProtectOutlined,
  TeamOutlined,
  TagsOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/shared';

export type MaintenancePageKey = 'dashboard' | 'job-cards' | 'teams' | 'categories' | 'preventive-maintenance' | 'reports';

const pageConfig: Record<MaintenancePageKey, {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  permission: string;
}> = {
  dashboard: {
    title: 'Maintenance',
    subtitle: 'Maintenance operations foundation',
    icon: <BuildOutlined />,
    permission: 'maintenance.job_card.view',
  },
  'job-cards': {
    title: 'Job Cards',
    subtitle: 'Maintenance work orders and service history',
    icon: <FileProtectOutlined />,
    permission: 'maintenance.job_card.view',
  },
  teams: {
    title: 'Maintenance Teams',
    subtitle: 'Teams and technician assignments',
    icon: <TeamOutlined />,
    permission: 'maintenance.team.view',
  },
  categories: {
    title: 'Maintenance Categories',
    subtitle: 'Complaint, root-cause, and failure classifications',
    icon: <TagsOutlined />,
    permission: 'maintenance.category.view',
  },
  'preventive-maintenance': {
    title: 'Preventive Maintenance',
    subtitle: 'Preventive maintenance plans and schedules',
    icon: <CalendarOutlined />,
    permission: 'maintenance.pm.view',
  },
  reports: {
    title: 'Maintenance Reports',
    subtitle: 'Downtime analysis, MTBF, and top problem machines',
    icon: <BarChartOutlined />,
    permission: 'maintenance.job_card.view',
  },
};

const links: Array<{ key: MaintenancePageKey; path: string; label: string }> = [
  { key: 'dashboard', path: '/maintenance', label: 'Maintenance Overview' },
  { key: 'job-cards', path: '/maintenance/job-cards', label: 'Job Cards' },
  { key: 'teams', path: '/maintenance/teams', label: 'Teams' },
  { key: 'categories', path: '/maintenance/categories', label: 'Categories' },
  { key: 'preventive-maintenance', path: '/maintenance/pm-plans', label: 'PM Plans' },
  { key: 'reports', path: '/maintenance/reports', label: 'Reports' },
];

interface MaintenancePageProps {
  page: MaintenancePageKey;
}

const MaintenancePage: React.FC<MaintenancePageProps> = ({ page }) => {
  const config = pageConfig[page];

  return (
    <div>
      <PageHeader
        icon={config.icon}
        title={config.title}
        subtitle={config.subtitle}
        showBreadcrumbs
      />
      <Card>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={4} style={{ marginTop: 0 }}>Maintenance foundation</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
              This route is connected to the existing NestJS Maintenance API and RBAC permissions. Operational screens will be added in the next Maintenance phase.
            </Typography.Paragraph>
          </div>
          <Tag color="cyan">Required permission: {config.permission}</Tag>
        </Space>
      </Card>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {links.filter(link => link.key !== page).map(link => (
          <Col xs={24} sm={12} lg={8} key={link.key}>
            <Card size="small" hoverable>
              <Link to={link.path}>{link.label}</Link>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default MaintenancePage;
