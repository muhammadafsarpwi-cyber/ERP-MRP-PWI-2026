import React from 'react';
import { Button, Tooltip } from 'antd';
import { DownloadOutlined, AppstoreAddOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { usePwaInstall } from '../../context/PwaInstallContext';

interface Props {
  variant?: 'header' | 'ribbon' | 'compact';
  style?: React.CSSProperties;
}

export const InstallAppHeaderButton: React.FC<Props> = ({ variant = 'header', style }) => {
  const { isInstalled, promptInstall } = usePwaInstall();

  // If already running in standalone installed mode, show a discreet status indicator
  if (isInstalled) {
    if (variant === 'compact') return null;
    return (
      <Tooltip title="PWI ERP is installed and running in Desktop App mode">
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '2px 8px',
            borderRadius: 12,
            border: '1px solid rgba(16, 185, 129, 0.25)',
            fontWeight: 600,
            ...style,
          }}
        >
          <CheckCircleOutlined /> Installed
        </span>
      </Tooltip>
    );
  }

  if (variant === 'ribbon') {
    return (
      <button
        type="button"
        onClick={promptInstall}
        className="erp-top-action-btn"
        title="Install PWI ERP as a Desktop / Mobile Web App"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.25)',
          borderRadius: 16,
          padding: '4px 12px',
          fontSize: 11,
          fontWeight: 700,
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)',
          transition: 'all 0.2s ease',
          ...style,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'none';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.35)';
        }}
      >
        <DownloadOutlined style={{ fontSize: 13 }} />
        <span>Install App</span>
      </button>
    );
  }

  return (
    <Tooltip title="Install PWI ERP as a standalone Web App on your device (Desktop/Mobile)">
      <Button
        type="primary"
        size="small"
        icon={<DownloadOutlined />}
        onClick={promptInstall}
        style={{
          background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
          borderColor: '#38bdf8',
          fontWeight: 700,
          fontSize: 11,
          borderRadius: 14,
          padding: '0 10px',
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          boxShadow: '0 2px 8px rgba(2, 132, 199, 0.3)',
          ...style,
        }}
      >
        Install App
      </Button>
    </Tooltip>
  );
};

export default InstallAppHeaderButton;
