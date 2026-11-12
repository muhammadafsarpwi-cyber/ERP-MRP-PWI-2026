import React from 'react';
import { Button, Tooltip } from 'antd';
import { DownloadOutlined, AppstoreAddOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { usePwaInstall } from '../../context/PwaInstallContext';

interface Props {
  variant?: 'header' | 'ribbon' | 'compact';
  style?: React.CSSProperties;
}

export const InstallAppHeaderButton: React.FC<Props> = ({ variant = 'header', style }) => {
  const { isInstalled, promptInstall, openInstallModal } = usePwaInstall();

  const handleInstallClick = async () => {
    const success = await promptInstall();
    if (!success) {
      openInstallModal();
    }
  };

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
            color: 'var(--theme-success)',
            background: 'var(--theme-success-soft)',
            padding: '2px 8px',
            borderRadius: 12,
            border: '1px solid var(--theme-border)',
            fontWeight: 600,
            whiteSpace: 'nowrap',
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
        onClick={handleInstallClick}
        className="erp-top-install-pill"
        title="Install PWI ERP as a Desktop / Mobile Web App"
        style={style}
      >
        <DownloadOutlined style={{ fontSize: 13 }} />
        <span className="erp-top-install-label">Install App</span>
      </button>
    );
  }

  return (
    <Tooltip title="Install PWI ERP as a standalone Web App on your device (Desktop/Mobile)">
      <Button
        type="primary"
        size="small"
        icon={<DownloadOutlined />}
        onClick={handleInstallClick}
        style={{
          fontWeight: 700,
          fontSize: 11,
          borderRadius: 14,
          padding: '0 10px',
          height: 26,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
          ...style,
        }}
      >
        Install App
      </Button>
    </Tooltip>
  );
};

export default InstallAppHeaderButton;
