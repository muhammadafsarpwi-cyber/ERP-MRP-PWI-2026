import React from 'react';
import { Modal, Button, Card, Typography, Space } from 'antd';
import {
  DownloadOutlined,
  CloseOutlined,
  MobileOutlined,
  DesktopOutlined,
  CheckCircleFilled,
  ShareAltOutlined,
  PlusSquareOutlined,
  ThunderboltFilled,
} from '@ant-design/icons';
import { usePwaInstall } from '../../context/PwaInstallContext';

const { Text, Title, Paragraph } = Typography;

export const InstallAppPrompt: React.FC = () => {
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
                  <span style={{ fontSize: 10, color: '#a7f3d0', background: 'rgba(16, 185, 129, 0.15)', padding: '2px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ThunderboltFilled style={{ fontSize: 10 }} /> 1-Click Launch
                  </span>
                  <span style={{ fontSize: 10, color: '#bae6fd', background: 'rgba(2, 132, 199, 0.15)', padding: '2px 7px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <DesktopOutlined style={{ fontSize: 10 }} /> Full Screen Mode
                  </span>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={promptInstall}
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

      {/* ── Detailed Install Guide Modal (for iOS or Desktop fallback) ── */}
      <Modal
        open={isInstallModalOpen}
        onCancel={closeInstallModal}
        footer={[
          <Button key="close" onClick={closeInstallModal}>
            Close
          </Button>,
          ...(isInstallable
            ? [
                <Button
                  key="install"
                  type="primary"
                  icon={<DownloadOutlined />}
                  onClick={() => {
                    void promptInstall();
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
                    borderColor: '#38bdf8',
                    fontWeight: 700,
                  }}
                >
                  Install Now
                </Button>,
              ]
            : []),
        ]}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <img
              src={`${process.env.PUBLIC_URL || ''}/logo-mark.png`}
              alt="PWI Logo"
              style={{ width: 22, height: 22 }}
            />
            <span>How to Install PWI ERP as an App</span>
          </div>
        }
        centered
        width={500}
      >
        {isInstalled ? (
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <CheckCircleFilled style={{ color: '#10b981', fontSize: 36, marginBottom: 8 }} />
            <Title level={5} style={{ margin: 0, color: '#10b981' }}>
              PWI ERP is already installed!
            </Title>
            <Paragraph style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>
              Pakistan Wire Industries ERP is already installed on this device. You can launch it anytime directly from your home screen or desktop application launcher.
            </Paragraph>
          </div>
        ) : isIos ? (
          <div>
            <Paragraph style={{ fontSize: 13, color: '#475569' }}>
              Follow these simple steps in <strong>Safari</strong> on your iPhone or iPad to install PWI ERP directly to your home screen:
            </Paragraph>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '16px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  1
                </div>
                <div>
                  <Text strong>Tap the Share button</Text>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Tap the <ShareAltOutlined /> icon in the Safari navigation bar at the bottom.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  2
                </div>
                <div>
                  <Text strong>Select "Add to Home Screen"</Text>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Scroll down and tap <PlusSquareOutlined /> <strong>Add to Home Screen</strong>.
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                  3
                </div>
                <div>
                  <Text strong>Confirm Installation</Text>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    Tap <strong>Add</strong> in the top right corner. The app icon will appear on your home screen!
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <Paragraph style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
              Easily install Pakistan Wire Industries ERP on your laptop, desktop, or mobile device:
            </Paragraph>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <DesktopOutlined style={{ color: '#2563eb', fontSize: 20, marginTop: 2 }} />
                <div>
                  <Text strong>Google Chrome or Microsoft Edge (Desktop / Laptop)</Text>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                    In the browser address bar, click the <strong>Install icon (⊕ or computer icon)</strong> on the right side, then click <strong>Install</strong>.
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#f8fafc', padding: 12, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <MobileOutlined style={{ color: '#10b981', fontSize: 20, marginTop: 2 }} />
                <div>
                  <Text strong>Android Devices</Text>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                    Tap the browser menu (three dots ⋮ in top right corner), then select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
                  </div>
                </div>
              </div>
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
