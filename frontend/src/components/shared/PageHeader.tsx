import React from 'react';
import { Card, Space, Typography } from 'antd';
import { useLocation } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import { resolveNavMeta } from '../layout/navigationConfig';

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

const PageHeader: React.FC<PageHeaderProps> = ({ icon, title, subtitle, extra, gradient, showBreadcrumbs, style }) => {
  const location = useLocation();
  const navMeta = React.useMemo(() => resolveNavMeta(location.pathname), [location.pathname]);
  const HeaderIcon = navMeta?.icon;
  const iconColor = navMeta
    ? `color-mix(in srgb, ${navMeta.colorVar} 55%, #ffffff)`
    : '#ffffff';

  return (
    <Card
      style={{
        marginBottom: 0,
        background: gradient ?? 'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-accent) 100%)',
        borderRadius: 6,
        border: 'none',
        ...style,
      }}
      styles={{ body: { padding: '16px 24px' } }}
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
              width: 36, height: 36, borderRadius: 8,
              background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: iconColor,
            }}
          >
            {HeaderIcon ? <HeaderIcon /> : icon}
          </div>
          <div>
            <Typography.Title level={4} style={{ margin: 0, color: '#fff', fontWeight: 600 }}>{title}</Typography.Title>
            {subtitle && (
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: '18px' }}>{subtitle}</Text>
            )}
          </div>
        </div>
        {extra && (
          <Space wrap size={8}>{extra}</Space>
        )}
      </div>
    </Card>
  );
};

export default PageHeader;