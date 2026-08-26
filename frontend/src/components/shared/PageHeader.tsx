import React from 'react';
import { Card, Space, Typography } from 'antd';
import Breadcrumbs from './Breadcrumbs';

const { Text } = Typography;

interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  gradient?: string;
  showBreadcrumbs?: boolean;
  style?: React.CSSProperties;
}

const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, extra, gradient, showBreadcrumbs, style }) => (
  <Card
    style={{
      marginBottom: 16,
      background: gradient ?? 'linear-gradient(135deg, var(--theme-primary, #3f51b5) 0%, var(--theme-accent, #4f46e5) 100%)',
      borderRadius: 10,
      ...style,
    }}
    styles={{ body: { padding: '18px 24px' } }}
  >
    {showBreadcrumbs && (
      <div style={{ marginBottom: 8 }}>
        <Breadcrumbs style={{ marginBottom: 0 }} />
      </div>
    )}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: '#fff',
          }}
        >
          {icon}
        </div>
        <div>
          <Typography.Title level={4} style={{ margin: 0, color: '#fff' }}>{title}</Typography.Title>
          {subtitle && (
            <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{subtitle}</Text>
          )}
        </div>
      </div>
      {extra && (
        <Space wrap size={8}>{extra}</Space>
      )}
    </div>
  </Card>
);

export default PageHeader;
