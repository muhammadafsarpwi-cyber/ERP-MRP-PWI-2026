import React, { useState, useMemo } from 'react';
import { Modal, Button, Card, Typography, Space, QRCode, message, theme, Tooltip, Alert } from 'antd';
import {
  DownloadOutlined,
  CloseOutlined,
  MobileOutlined,
  DesktopOutlined,
  CheckCircleFilled,
  ShareAltOutlined,
  PlusSquareOutlined,
  ThunderboltFilled,
  WhatsAppOutlined,
  CopyOutlined,
  QrcodeOutlined,
  InfoCircleOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import { usePwaInstall } from '../../context/PwaInstallContext';

const { Text, Title, Paragraph } = Typography;

export const InstallAppPrompt: React.FC = () => {
  const { token } = theme.useToken();
  const {
    isInstalled,
    isInstallable,
    showBanner,
    dismissBanner,
    promptInstall,
    isIos,
    isInstallModalOpen,
    closeInstallModal,
  } = usePwaInstall();

  const [desktopInstalling, setDesktopInstalling] = useState(false);
  const [showAddressBarHint, setShowAddressBarHint] = useState(false);
  const [showMobileQr, setShowMobileQr] = useState(true);

  // Compute LAN IP URL for mobile devices so scanning QR code works on phones on the same Wi-Fi
  const mobileInstallUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'http://192.168.1.2:3000';
    const { protocol, hostname, port, pathname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//192.168.1.2${port ? `:${port}` : ''}${pathname && pathname !== '/' ? pathname : ''}`;
    }
    return window.location.href;
  }, []);

  const handleDesktopInstall = async () => {
    if (isInstalled) {
      message.info('Pakistan Wire Industries ERP is already installed as a desktop application!');
      return;
    }
    setDesktopInstalling(true);
    try {
      const installed = await promptInstall();
      if (installed) {
        closeInstallModal();
      } else {
        setShowAddressBarHint(true);
        message.info(
          'If the browser popup did not open, click the Install icon (⊕ or computer icon) in the right side of your browser address bar.'
        );
      }
    } catch {
      setShowAddressBarHint(true);
    } finally {
      setDesktopInstalling(false);
    }
  };

  const handleWhatsAppShare = () => {
    const text = encodeURIComponent(
      `Pakistan Wire Industries (PWI) ERP Mobile App:\n${mobileInstallUrl}\n\nOpen this link in Chrome/Safari on your mobile phone to install the PWI ERP application.`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(mobileInstallUrl);
      message.success('Mobile installation link copied to clipboard!');
    } else {
      message.info(mobileInstallUrl);
    }
  };

  const isMobileUser = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  }, []);

  return (
    <>
      {/* ── Auto Slide-in Install Banner on Site Open ───────────────────── */}
      {showBanner && !isInstalled && (
        <div
          role="dialog"
          aria-label="Install App Prompt"
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 9999,
            maxWidth: 420,
            width: 'calc(100vw - 32px)',
            animation: 'slideUpBounce 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <Card
            bordered={false}
            style={{
              borderRadius: 16,
              background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
              color: '#ffffff',
              boxShadow: '0 20px 45px -10px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.12)',
              overflow: 'hidden',
              position: 'relative',
            }}
            bodyStyle={{ padding: '16px 18px' }}
          >
            {/* Ambient top glowing line */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 3,
                background: 'linear-gradient(90deg, #3b82f6, #06b6d4, #10b981)',
              }}
            />

            {/* Close Button */}
            <button
              onClick={dismissBanner}
              aria-label="Close install prompt"
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = '#94a3b8';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <CloseOutlined style={{ fontSize: 14 }} />
            </button>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
              {/* App Icon */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 14,
                  background: 'linear-gradient(135deg, #1e3a8a 0%, #0284c7 100%)',
                  padding: 4,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(2, 132, 199, 0.35)',
                }}
              >
                <img
                  src={`${process.env.PUBLIC_URL || ''}/logo-mark.png`}
                  alt="PWI Logo"
                  style={{ width: 36, height: 36, objectFit: 'contain' }}
                />
              </div>

              {/* Text Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Title
                    level={5}
                    style={{
                      margin: 0,
                      color: '#ffffff',
                      fontSize: 15,
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                    }}
                  >
                    Install PWI ERP App
                  </Title>
                  <span
                    style={{
                      background: 'rgba(56, 189, 248, 0.18)',
                      color: '#38bdf8',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 10,
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                    }}
                  >
                    WEB APP
                  </span>
                </div>

                <Text style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.4, display: 'block' }}>
                  Install on your device for instant launch, full-screen workspace, and faster offline access.
                </Text>

                {/* Feature Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 12 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#a7f3d0',
                      background: 'rgba(16, 185, 129, 0.15)',
                      padding: '2px 7px',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <ThunderboltFilled style={{ fontSize: 10 }} /> 1-Click Launch
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: '#bae6fd',
                      background: 'rgba(2, 132, 199, 0.15)',
                      padding: '2px 7px',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <DesktopOutlined style={{ fontSize: 10 }} /> Full Screen Mode
                  </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={() => void promptInstall()}
                    style={{
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      borderColor: '#3b82f6',
                      fontWeight: 700,
                      fontSize: 12,
                      borderRadius: 8,
                      height: 32,
                      padding: '0 14px',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
                    }}
                  >
                    Install Now
                  </Button>

                  <Button
                    type="text"
                    onClick={dismissBanner}
                    style={{
                      color: '#94a3b8',
                      fontSize: 12,
                      height: 32,
                      padding: '0 8px',
                    }}
                  >
                    Maybe Later
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Detailed Install Guide Modal (Interactive Actions for Desktop & Mobile) ── */}
      <Modal
        open={isInstallModalOpen}
        onCancel={closeInstallModal}
        footer={[
          <Button key="close" onClick={closeInstallModal}>
            Close
          </Button>,
        ]}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={`${process.env.PUBLIC_URL || ''}/logo-mark.png`}
              alt="PWI Logo"
              style={{ width: 24, height: 24, objectFit: 'contain' }}
            />
            <span style={{ fontWeight: 700, fontSize: 16, color: token.colorText }}>
              Install PWI ERP Application
            </span>
          </div>
        }
        centered
        width={560}
      >
        {isInstalled ? (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 44, marginBottom: 12 }} />
            <Title level={4} style={{ margin: 0, color: token.colorSuccess }}>
              PWI ERP is already installed!
            </Title>
            <Paragraph style={{ fontSize: 13, color: token.colorTextSecondary, marginTop: 8 }}>
              Pakistan Wire Industries ERP is running as an installed standalone app. You can launch it anytime from your desktop shortcut, taskbar, or mobile home screen.
            </Paragraph>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 6 }}>
            <Paragraph style={{ fontSize: 13, color: token.colorTextSecondary, margin: 0 }}>
              Easily install Pakistan Wire Industries ERP on your computer or mobile phone for 1-click launch and full-screen experience:
            </Paragraph>

            {/* 1. Desktop & Laptop Installation Box (Clickable Action Card) */}
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: 'rgba(37, 99, 235, 0.1)',
                      color: token.colorPrimary,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      flexShrink: 0,
                    }}
                  >
                    <DesktopOutlined />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: token.colorText }}>
                      Google Chrome or Microsoft Edge (Desktop / Laptop)
                    </div>
                    <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4, lineHeight: 1.4 }}>
                      Install as a dedicated desktop software on your Windows PC, Mac, or Laptop.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Button for Desktop */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Button
                  type="primary"
                  icon={<DownloadOutlined />}
                  loading={desktopInstalling}
                  onClick={handleDesktopInstall}
                  style={{
                    fontWeight: 700,
                    borderRadius: 8,
                    height: 36,
                    padding: '0 18px',
                  }}
                >
                  Install on This Computer
                </Button>

                <span style={{ fontSize: 11, color: token.colorTextTertiary }}>
                  Click to open browser install dialog
                </span>
              </div>

              {/* Browser Address Bar Hint (if native popup didn't fire) */}
              {showAddressBarHint && (
                <Alert
                  type="info"
                  showIcon
                  icon={<InfoCircleOutlined />}
                  style={{ marginTop: 12, borderRadius: 8, fontSize: 12 }}
                  message={
                    <span>
                      In your browser address bar (top right next to the URL/star ⭐), look for the <strong>Install icon (⊕ or 💻)</strong>, then click <strong>Install</strong>.
                    </span>
                  }
                />
              )}
            </div>

            {/* 2. Android & Mobile Phone Box (Clickable Action Card with QR & WhatsApp) */}
            <div
              style={{
                borderRadius: 12,
                border: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgContainer,
                padding: '16px 18px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: token.colorSuccess,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <MobileOutlined />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: token.colorText }}>
                    Android & iOS Mobile Devices
                  </div>
                  <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 4, lineHeight: 1.4 }}>
                    Install Pakistan Wire Industries ERP on your mobile home screen.
                  </div>
                </div>
              </div>

              {/* If user is already on a mobile device */}
              {isMobileUser ? (
                <div style={{ marginTop: 12 }}>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={() => void promptInstall()}
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      borderColor: '#10b981',
                      fontWeight: 700,
                      borderRadius: 8,
                      height: 36,
                    }}
                  >
                    Install on this Mobile Phone
                  </Button>
                </div>
              ) : (
                /* When on desktop/laptop: show QR Code to scan with mobile + WhatsApp / Copy link */
                <div style={{ marginTop: 14 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      background: token.colorFillAlter,
                      padding: 14,
                      borderRadius: 10,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* High-visibility QR Code */}
                    <div
                      style={{
                        background: '#ffffff',
                        padding: 8,
                        borderRadius: 8,
                        display: 'inline-block',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                      }}
                    >
                      <QRCode
                        value={mobileInstallUrl}
                        size={120}
                        icon={`${process.env.PUBLIC_URL || ''}/logo-mark.png`}
                        iconSize={26}
                        bordered={false}
                        errorLevel="M"
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: token.colorText, marginBottom: 4 }}>
                        Scan with your Mobile Camera:
                      </div>
                      <div style={{ fontSize: 12, color: token.colorTextSecondary, lineHeight: 1.4, marginBottom: 10 }}>
                        Point your Android or iPhone camera at this QR code. It opens PWI ERP on your phone where you can tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong>.
                      </div>

                      <Space size="small" wrap>
                        <Button
                          size="small"
                          icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                          onClick={handleWhatsAppShare}
                          style={{ fontWeight: 600 }}
                        >
                          Send to WhatsApp
                        </Button>
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={handleCopyLink}
                          style={{ fontWeight: 600 }}
                        >
                          Copy Link
                        </Button>
                      </Space>
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: token.colorTextTertiary }}>Mobile URL:</span>
                    <Text code style={{ fontSize: 11 }}>
                      {mobileInstallUrl}
                    </Text>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Slide-up CSS animation */}
      <style>{`
        @keyframes slideUpBounce {
          0% {
            opacity: 0;
            transform: translateY(30px) scale(0.96);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </>
  );
};

export default InstallAppPrompt;
