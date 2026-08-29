import React, { useEffect, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { ClockCircleOutlined, DashboardOutlined, ReloadOutlined } from '@ant-design/icons';

export type SystemStatus = 'operational' | 'degraded' | 'loading';

interface DashboardHeaderProps {
  status: SystemStatus;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Command-center header with a live clock (minute precision), a derived
 * operational status indicator and a refresh action. The clock is updated on
 * a 30 s interval and fully cleaned up on unmount.
 */
const DashboardHeader: React.FC<DashboardHeaderProps> = ({ status, refreshing, onRefresh }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30 * 1000);
    return () => window.clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  const timeLabel = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  const statusText =
    status === 'operational'
      ? 'SYSTEM OPERATIONAL'
      : status === 'degraded'
        ? 'PARTIAL DATA'
        : 'LOADING DATA';

  return (
    <header className="erp-header">
      <div className="erp-header__left">
        <span className="erp-header__icon" aria-hidden="true">
          <DashboardOutlined />
        </span>
        <div className="erp-header__text">
          <h1 className="erp-header__title">Command Center</h1>
          <div className="erp-header__subtitle">Production · Inventory · Procurement · Sales</div>
        </div>
      </div>
      <div className="erp-header__right">
        <span className="erp-header__clock" aria-hidden="true">
          <ClockCircleOutlined />
          <span className="erp-header__clock-text">
            {dateLabel} · {timeLabel}
          </span>
        </span>
        <span
          className={`erp-header__status erp-header__status--${status}`}
          role="status"
          aria-label={statusText}
        >
          <span className="erp-header__status-dot" aria-hidden="true" />
          {statusText}
        </span>
        <Tooltip title="Refresh All Data">
          <Button
            className="erp-header__refresh"
            icon={<ReloadOutlined />}
            loading={refreshing}
            onClick={onRefresh}
            aria-label="Refresh all dashboard data"
          />
        </Tooltip>
      </div>
    </header>
  );
};

export default DashboardHeader;