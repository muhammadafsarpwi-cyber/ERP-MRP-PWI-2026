import React, { useState } from 'react';
import { Space, Button, Tooltip, Popconfirm, Tag, Modal, message, theme, Grid } from 'antd';
import {
  MinusOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ThunderboltFilled,
  ExclamationCircleFilled,
  DeleteOutlined,
  ReloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useEntryDockStore } from './entryDockStore';
import EntryForm from './EntryForm';
import './productionEntryModal.css';

export const ProductionEntryModal: React.FC = () => {
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;

  const {
    isOpen,
    isMinimized,
    isMaximized,
    showLinkedView,
    entryParams,
    hasUnsavedChanges,
    closeEntry,
    minimize,
    toggleMaximize,
    toggleLinkedView,
  } = useEntryDockStore();

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setRefreshKey((prev) => prev + 1);
    setTimeout(() => {
      setIsRefreshing(false);
      message.success('Production entry data refreshed');
    }, 400);
  };

  // If the entry session is not active at all, do not render.
  // When minimized, we keep the component MOUNTED with display: none so all user input,
  // selections, and calculations are 100% preserved without blanking when restored!
  if (!isOpen) {
    return null;
  }

  const machineLabel = entryParams?.machineName || entryParams?.machineCode || 'Machine Production Entry';
  const shiftLabel = entryParams?.shiftName || 'Current Shift';
  const dateLabel = entryParams?.entryDate || '';

  const handleCloseClick = () => {
    if (hasUnsavedChanges) {
      setCloseConfirmOpen(true);
    } else {
      closeEntry();
    }
  };

  return (
    <>
      <div
        className="entry-modal-backdrop"
        style={{
          display: isMinimized ? 'none' : 'flex',
          pointerEvents: isMinimized ? 'none' : 'auto',
          zIndex: 60000,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`entry-modal-window ${isMaximized ? 'mode-maximized' : 'mode-normal'}`}
          data-testid="production-entry-modal"
          style={{ zIndex: 60001 }}
        >
          {/* ── Window Header Bar ── */}
          <div className="entry-window-header">
            <div className="entry-window-title-group">
              <div
                className="entry-window-icon-badge"
                style={{
                  width: isMobile ? 32 : 38,
                  height: isMobile ? 32 : 38,
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  boxShadow: '0 2px 10px rgba(234, 88, 12, 0.4)',
                }}
              >
                <ThunderboltFilled />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <h3 className="entry-window-title" style={{ fontSize: isMobile ? 14 : 16 }}>{machineLabel}</h3>
                  <Tag color="#10b981" style={{ fontWeight: 700, margin: 0 }}>
                    {shiftLabel}
                  </Tag>
                  {dateLabel && (
                    <Tag style={{ margin: 0, background: token.colorFillAlter, color: token.colorText, border: 'none', fontWeight: 600 }}>
                      {dateLabel}
                    </Tag>
                  )}
                </div>
                {!isMobile && (
                  <span className="entry-window-subtitle">
                    Daily Book Entry • Shift Production & Downtime Logging
                  </span>
                )}
              </div>
            </div>

            {/* Progression Step Indicator (Steps 1 & 2 -> Step 3 Active) */}
            <div className="entry-progression-stepper" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isMobile ? '2px 7px' : '4px 10px',
                  borderRadius: 16,
                  backgroundColor: token.colorFillAlter, color: token.colorTextSecondary,
                  fontWeight: 700,
                  fontSize: isMobile ? 10 : 11,
                  userSelect: 'none',
                }}
              >
                <span>{isMobile ? '1 Area' : '1 Shift & Area'}</span>
              </div>
              <span style={{ color: token.colorTextTertiary, fontSize: 10 }}>➔</span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isMobile ? '2px 7px' : '4px 10px',
                  borderRadius: 16,
                  backgroundColor: token.colorFillAlter, color: token.colorTextSecondary,
                  fontWeight: 700,
                  fontSize: isMobile ? 10 : 11,
                  userSelect: 'none',
                }}
              >
                <span>{isMobile ? '2 Machines' : '2 Department & Machines'}</span>
              </div>
              <span style={{ color: token.colorTextTertiary, fontSize: 10 }}>➔</span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: isMobile ? '2px 8px' : '4px 12px',
                  borderRadius: 16,
                  backgroundColor: '#ea580c',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: isMobile ? 10 : 11.5,
                  boxShadow: '0 2px 8px rgba(234, 88, 12, 0.45)',
                  userSelect: 'none',
                }}
              >
                <span>{isMobile ? '3 Feed Details' : '3 Production Details'}</span>
              </div>
            </div>

            {/* Window Controls */}
            <div className="entry-window-controls" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 5 : 8 }}>
              {/* Refresh Form & Data */}
              <Tooltip title="Refresh Form & Reload Live Data">
                <button
                  type="button"
                  className="entry-window-view-toggle"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  aria-label="Refresh Form"
                  style={{
                    background: 'rgba(56, 189, 248, 0.16)',
                    borderColor: '#38bdf8',
                    color: '#38bdf8',
                    cursor: isRefreshing ? 'wait' : 'pointer',
                    fontWeight: 600,
                    padding: isMobile ? '4px 8px' : '5px 12px',
                    fontSize: isMobile ? 11 : 12,
                  }}
                >
                  <ReloadOutlined spin={isRefreshing} />
                  <span>{isRefreshing ? '…' : 'Refresh'}</span>
                </button>
              </Tooltip>

              {/* View Details Toggle */}
              <Tooltip title={showLinkedView ? 'Hide Live Details' : 'View Live Details'}>
                <button
                  type="button"
                  className="entry-window-view-toggle"
                  onClick={toggleLinkedView}
                  style={{
                    padding: isMobile ? '4px 8px' : '5px 12px',
                    fontSize: isMobile ? 11 : 12,
                  }}
                >
                  {showLinkedView ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  <span>{showLinkedView ? 'Hide Details' : 'View Details'}</span>
                </button>
              </Tooltip>

              {/* Minimize */}
              <Tooltip title="Minimize to Dock (-)">
                <button
                  type="button"
                  className="entry-window-ctrl-btn"
                  onClick={minimize}
                  aria-label="Minimize Window"
                  style={{
                    background: '#1e293b',
                    border: '1.5px solid #475569',
                    color: '#ffffff',
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    fontSize: 15,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <MinusOutlined style={{ fontSize: 16, strokeWidth: 2, color: '#ffffff' }} />
                </button>
              </Tooltip>

              {/* Maximize / Restore */}
              <Tooltip title={isMaximized ? 'Restore Window Size' : 'Maximize Fullscreen'}>
                <button
                  type="button"
                  className="entry-window-ctrl-btn"
                  onClick={toggleMaximize}
                  aria-label="Toggle Fullscreen"
                  style={{
                    background: '#1e293b',
                    border: '1.5px solid #475569',
                    color: '#ffffff',
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    fontSize: 15,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  {isMaximized ? (
                    <FullscreenExitOutlined style={{ fontSize: 15, color: '#ffffff' }} />
                  ) : (
                    <FullscreenOutlined style={{ fontSize: 15, color: '#ffffff' }} />
                  )}
                </button>
              </Tooltip>

              {/* Close */}
              <Tooltip title="Close Entry Window (Esc)">
                <button
                  type="button"
                  className="entry-window-ctrl-btn btn-close"
                  onClick={handleCloseClick}
                  aria-label="Close Window"
                  style={{
                    background: '#ef4444',
                    border: '1.5px solid #dc2626',
                    color: '#ffffff',
                    width: 34,
                    height: 34,
                    borderRadius: 6,
                    fontSize: 15,
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <CloseOutlined style={{ fontSize: 15, fontWeight: 'bold', color: '#ffffff' }} />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Window Content: EntryForm in Modal Split-Book Mode ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <EntryForm
              key={`entry-form-${refreshKey}`}
              mode={(entryParams?.mode as 'create' | 'edit') || 'create'}
              isModal={true}
              modalParams={entryParams || undefined}
              showLinkedDetails={showLinkedView}
              onCloseModal={closeEntry}
            />
          </div>
        </div>
      </div>

      {/* ── Custom Unsaved Changes Confirmation Modal ── */}
      <Modal
        open={closeConfirmOpen}
        onCancel={() => setCloseConfirmOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'rgba(245, 158, 11, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}>
              <ExclamationCircleFilled style={{ fontSize: 18 }} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Unsaved Production Entry</span>
          </div>
        }
        footer={null}
        centered
        destroyOnClose
        zIndex={100000}
      >
        <div style={{ padding: '8px 0 12px' }}>
          <p style={{ fontSize: 13.5, color: 'var(--theme-text, #334155)', lineHeight: 1.6, marginBottom: 20 }}>
            You have unsaved production data for <strong>{machineLabel}</strong> ({shiftLabel}).
            Would you like to keep this in the background as a draft or discard your changes?
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Primary Action: Minimize and keep in dock */}
            <Button
              type="primary"
              icon={<MinusOutlined />}
              onClick={() => {
                setCloseConfirmOpen(false);
                minimize();
              }}
              style={{
                height: 42,
                borderRadius: 8,
                background: 'var(--theme-accent, #10b981)',
                borderColor: 'var(--theme-accent, #10b981)',
                fontWeight: 700,
                fontSize: 13.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
              }}
            >
              Minimize & Keep as Draft (Save Progress)
            </Button>

            {/* Danger Action: Discard and close */}
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setCloseConfirmOpen(false);
                closeEntry();
              }}
              style={{
                height: 40,
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              Discard Changes & Close
            </Button>

            {/* Neutral Action: Stay and keep editing */}
            <Button
              onClick={() => setCloseConfirmOpen(false)}
              style={{
                height: 38,
                borderRadius: 8,
                fontWeight: 500,
              }}
            >
              Keep Editing (Cancel)
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ProductionEntryModal;
