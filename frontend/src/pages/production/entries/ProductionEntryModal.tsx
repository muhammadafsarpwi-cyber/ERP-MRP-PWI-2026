import React, { useState } from 'react';
import { Space, Button, Tooltip, Popconfirm, Tag, Modal } from 'antd';
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
} from '@ant-design/icons';
import { useEntryDockStore } from './entryDockStore';
import EntryForm from './EntryForm';
import './productionEntryModal.css';

export const ProductionEntryModal: React.FC = () => {
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
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`entry-modal-window ${isMaximized ? 'mode-maximized' : 'mode-normal'}`}
          data-testid="production-entry-modal"
        >
          {/* ── Window Header Bar ── */}
          <div className="entry-window-header">
            <div className="entry-window-title-group">
              <div className="entry-window-icon-badge">
                <ThunderboltFilled />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <h3 className="entry-window-title">{machineLabel}</h3>
                  <Tag color="var(--theme-accent, #10b981)" style={{ fontWeight: 700, margin: 0 }}>
                    {shiftLabel}
                  </Tag>
                  {dateLabel && (
                    <Tag style={{ margin: 0, background: 'rgba(255, 255, 255, 0.1)', color: '#e2e8f0', border: 'none' }}>
                      {dateLabel}
                    </Tag>
                  )}
                </div>
                <span className="entry-window-subtitle">
                  Split Book Entry Workflow • Steps 1 to 8 (Left: Form Entry • Right: Linked Live View)
                </span>
              </div>
            </div>

            {/* Window Controls */}
            <div className="entry-window-controls">
              {/* View Details Toggle */}
              <button
                type="button"
                className="entry-window-view-toggle"
                onClick={toggleLinkedView}
                title={showLinkedView ? 'Hide Linked Details Panel (Focus Form)' : 'Show Linked Details Panel'}
              >
                {showLinkedView ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                <span>{showLinkedView ? 'Hide Details' : 'View Details'}</span>
              </button>

              {/* Minimize */}
              <Tooltip title="Minimize to Bottom Dock (Preserve Data)">
                <button
                  type="button"
                  className="entry-window-ctrl-btn"
                  onClick={minimize}
                  aria-label="Minimize Window"
                >
                  <MinusOutlined />
                </button>
              </Tooltip>

              {/* Maximize / Restore */}
              <Tooltip title={isMaximized ? 'Restore Window Size' : 'Maximize Fullscreen'}>
                <button
                  type="button"
                  className="entry-window-ctrl-btn"
                  onClick={toggleMaximize}
                  aria-label="Toggle Fullscreen"
                >
                  {isMaximized ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
                </button>
              </Tooltip>

              {/* Close */}
              <Tooltip title="Close Entry Window">
                <button
                  type="button"
                  className="entry-window-ctrl-btn btn-close"
                  onClick={handleCloseClick}
                  aria-label="Close Window"
                >
                  <CloseOutlined />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* ── Window Content: EntryForm in Modal Split-Book Mode ── */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <EntryForm
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
