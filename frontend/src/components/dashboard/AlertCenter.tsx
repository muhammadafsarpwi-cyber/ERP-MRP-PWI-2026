import React from 'react';
import { Badge } from 'antd';
import {
  AlertOutlined, CheckCircleOutlined, CloseCircleOutlined, InfoCircleOutlined, RightOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { EmptyState, SectionCard, SkeletonRows } from './dashboardShared';
import type { AlertItem } from '../../services/dashboardService';
import { useNavigate } from 'react-router-dom';

interface AlertCenterProps {
  alerts: AlertItem[];
  loading: boolean;
}

const severityIcon = (severity: AlertItem['severity']): React.ReactNode => {
  if (severity === 'error') return <CloseCircleOutlined />;
  if (severity === 'warning') return <WarningOutlined />;
  return <InfoCircleOutlined />;
};

const AlertCenter: React.FC<AlertCenterProps> = ({ alerts, loading }) => {
  const navigate = useNavigate();
  const critical = alerts.filter((a) => a.severity === 'error').length;
  const warning = alerts.filter((a) => a.severity === 'warning').length;

  if (loading && alerts.length === 0) {
    return (
      <SectionCard icon={<AlertOutlined />} title="Alerts" subtitle="Operational exceptions">
        <SkeletonRows rows={5} />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      icon={<AlertOutlined />}
      title="Alerts"
      subtitle="Operational exceptions"
      extra={
        alerts.length > 0 ? (
          <span className="erp-alert-summary">
            {critical > 0 && <span className="erp-alert-summary__chip erp-alert-summary__chip--error">{critical} Critical</span>}
            {warning > 0 && <span className="erp-alert-summary__chip erp-alert-summary__chip--warning">{warning} Warning</span>}
          </span>
        ) : (
          <span className="erp-alert-summary__clear">
            <CheckCircleOutlined aria-hidden="true" /> All Clear
          </span>
        )
      }
    >
      {alerts.length > 0 ? (
        <div className="erp-alert-list">
          {alerts.slice(0, 10).map((alert, idx) => (
            <div
              key={`${alert.title}-${idx}`}
              className={`erp-alert-row${alert.link ? ' erp-alert-row--link' : ''}`}
              onClick={() => alert.link && navigate(alert.link)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && alert.link) navigate(alert.link);
              }}
              role={alert.link ? 'button' : undefined}
              tabIndex={alert.link ? 0 : undefined}
              aria-label={alert.title}
            >
              <span className={`erp-alert-row__icon erp-alert-row__icon--${alert.severity}`} aria-hidden="true">
                {severityIcon(alert.severity)}
              </span>
              <div className="erp-alert-row__body">
                <div className="erp-alert-row__title">{alert.title}</div>
                {alert.description && <div className="erp-alert-row__desc">{alert.description}</div>}
              </div>
              <div className="erp-alert-row__meta">
                {alert.count && alert.count > 1 && (
                  <Badge count={alert.count} size="small" showZero={false} className="erp-alert-row__badge" />
                )}
                {alert.link && <RightOutlined className="erp-alert-row__arrow" aria-hidden="true" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<CheckCircleOutlined />}
          title="ALL CLEAR"
          desc="No active exceptions — all systems nominal"
        />
      )}
    </SectionCard>
  );
};

export default AlertCenter;