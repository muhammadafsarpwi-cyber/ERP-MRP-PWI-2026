import React from 'react';
import { Space, Button, Tooltip, Popconfirm, Tag } from 'antd';
import {
  MinusOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  ThunderboltFilled,
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

  if (!isOpen || isMinimized) {
    return null;
  }

  const machineLabel = entryParams?.machineName || entryParams?.machineCode || 'Machine Production Entry';
  const shiftLabel = entryParams?.shiftName || 'Current Shift';
  const dateLabel = entryParams?.entryDate || '';

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (window.confirm('You have unsaved production entry changes. Are you sure you want to close?')) {
        closeEntry();
      }
    } else {
      closeEntry();
    }
  };

  return (
    <div className="entry-modal-backdrop" onClick={(e) => e.stopPropagation()}>
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
                onClick={handleClose}
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
  );
};

export default ProductionEntryModal;
