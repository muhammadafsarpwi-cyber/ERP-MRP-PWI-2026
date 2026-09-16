import React from 'react';
import { Button, Space } from 'antd';
import { CloseOutlined, InboxOutlined, RedoOutlined } from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRawReceiptDraftStore } from '../../store/rawReceiptDraftStore';
import './rawReceiptMinimizedDock.css';

const RECEIVING_ROUTE = '/production/receiving';

/**
 * Application-level persistent minimized bar for the Raw Material Receiving
 * "New Receipt (Gate Pass)" workflow (RMR-01-A).
 *
 * Rendered inside MainLayout so it survives SPA navigation. It does NOT live
 * in the page component (which unmounts on route change). Only ONE instance
 * exists for the whole session — minimizing the same receipt repeatedly just
 * keeps this bar visible (the store holds a single draft).
 *
 * Restore -> returns to the source page and re-opens the same draft.
 * Close (X) -> fully discards the receipt draft.
 */
const RawReceiptMinimizedDock: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const minimized = useRawReceiptDraftStore((s) => s.minimized);
  const draft = useRawReceiptDraftStore((s) => s.draft);

  if (!minimized || !draft) return null;

  const lineCount = (draft.rows || []).filter((r) => r.itemId).length;
  const label = draft.editingId ? 'Edit Receipt' : 'New Receipt (Gate Pass)';

  const handleRestore = () => {
    useRawReceiptDraftStore.getState().requestRestore();
    if (location.pathname !== RECEIVING_ROUTE) {
      navigate(RECEIVING_ROUTE);
    }
  };

  const handleClose = () => {
    useRawReceiptDraftStore.getState().closeDraft();
  };

  return (
    <div className="rm-persistent-dock" data-testid="rm-persistent-minimized-bar">
      <div
        className="rm-persistent-dock-tab"
        role="button"
        tabIndex={0}
        aria-label={`${label} — draft preserved. Click to restore.`}
        onClick={handleRestore}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRestore();
          }
        }}
      >
        <span className="rm-minimized-window-pulse" aria-hidden="true" />
        <InboxOutlined className="rm-persistent-dock-icon" />
        <span className="rm-persistent-dock-label">{label}</span>
        <span className="rm-persistent-dock-badge" aria-label="Minimized">
          MINIMIZED
        </span>
        <span className="rm-persistent-dock-meta" data-testid="rm-dock-lines">
          {lineCount} line{lineCount === 1 ? '' : 's'} · draft preserved
        </span>
        <Space size={4} className="rm-persistent-dock-actions">
          <Button
            size="small"
            type="primary"
            ghost
            icon={<RedoOutlined />}
            data-testid="rm-dock-restore"
            onClick={(e) => {
              e.stopPropagation();
              handleRestore();
            }}
          >
            Restore
          </Button>
          <Button
            size="small"
            type="text"
            danger
            icon={<CloseOutlined />}
            data-testid="rm-dock-close"
            aria-label="Close receipt draft"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
          >
            Close
          </Button>
        </Space>
      </div>
    </div>
  );
};

export default RawReceiptMinimizedDock;