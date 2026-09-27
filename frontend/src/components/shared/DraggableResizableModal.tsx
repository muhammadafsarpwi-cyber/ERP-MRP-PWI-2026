import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalProps, Tooltip } from 'antd';
import {
  MinusOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  CloseOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import './draggableResizableModal.css';

/**
 * Centered modal that can be moved by dragging its header and resized from the
 * bottom-right corner. Supports minimize, maximize/restore, info tooltip, and
 * drag/resize capabilities across all ERP forms.
 */
export interface DraggableResizableModalProps extends ModalProps {
  /** Initial width (also used when `open` becomes true). Defaults to 880. */
  width?: number | string;
  /** Initial/restored height when opened. Defaults to 560. */
  height?: number | string;
  minWidth?: number;
  minHeight?: number;
  /** Extra actions rendered on the right side of the modal header. */
  extra?: React.ReactNode;
  /** Optional muted subtitle rendered under the header title. */
  subtitle?: React.ReactNode;
  /** Optional info tooltip message shown beside title */
  infoTooltip?: React.ReactNode;
  /** Allow maximizing to full screen. Defaults to true. */
  allowMaximize?: boolean;
  /** Allow minimizing to a floating dock. Defaults to true. */
  allowMinimize?: boolean;
  /**
   * Optional callback when user clicks the minimize (-) button in the modal header.
   */
  onMinimize?: () => void;
  /**
   * Clicking the mask NEVER closes an ERP modal. Closing is only
   * possible via the header close (X), footer buttons, or Escape.
   */
  maskClosable?: boolean;
  /**
   * Optional initial pixel offset from center (transform-based translate).
   */
  initialOffset?: { x?: number; y?: number };
}

const MIN_WIDTH = 640;
const MIN_HEIGHT = 360;
const EDGE_MARGIN = 24;
const VISIBLE_EDGE = 72;

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

const DraggableResizableModal: React.FC<DraggableResizableModalProps> = ({
  open = false,
  width = 880,
  height = 560,
  minWidth = MIN_WIDTH,
  minHeight = MIN_HEIGHT,
  centered = true,
  maskClosable = false,
  children,
  title,
  subtitle,
  extra,
  infoTooltip,
  allowMaximize = true,
  allowMinimize = true,
  onMinimize,
  onCancel,
  wrapClassName,
  initialOffset,
  ...rest
}) => {
  const parseDim = (val: number | string | undefined, defaultVal: number): number => {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return defaultVal;
  };

  const [size, setSize] = useState({ w: parseDim(width, 880), h: parseDim(height, 560) });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const prevSizeAndPos = useRef<{ size: { w: number; h: number }; pos: { x: number; y: number } } | null>(null);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    active: false, startX: 0, startY: 0, baseX: 0, baseY: 0,
  });
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; baseW: number; baseH: number }>({
    active: false, startX: 0, startY: 0, baseW: parseDim(width, 880), baseH: parseDim(height, 560),
  });

  useEffect(() => {
    if (!open) {
      setIsMinimized(false);
      setIsMaximized(false);
      return;
    }
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const isMobile = vw <= 768;

    if (isMobile) {
      setSize({ w: vw, h: vh });
      setPos({ x: 0, y: 0 });
      return;
    }

    const numW = parseDim(width, 880);
    const numH = parseDim(height, 560);
    const effectiveMinW = Math.min(minWidth, vw - EDGE_MARGIN);
    const effectiveMinH = Math.min(minHeight, vh - EDGE_MARGIN);
    const w = clamp(numW, effectiveMinW, vw - EDGE_MARGIN);
    const h = clamp(numH, effectiveMinH, vh - EDGE_MARGIN);
    setSize({ w, h });

    const rawX = initialOffset?.x ?? 0;
    const rawY = initialOffset?.y ?? 0;
    const minX = 24 + w / 2 - vw / 2;
    const maxX = vw / 2 - w / 2 - 24;
    const minY = 24 + h / 2 - vh / 2;
    const maxY = vh / 2 - h / 2 - 24;
    setPos({
      x: clamp(rawX, Math.min(minX, 0), Math.max(maxX, 0)),
      y: clamp(rawY, Math.min(minY, 0), Math.max(maxY, 0)),
    });
  }, [open, width, height, minWidth, minHeight, initialOffset]);

  const toggleMaximize = () => {
    if (isMaximized) {
      if (prevSizeAndPos.current) {
        setSize(prevSizeAndPos.current.size);
        setPos(prevSizeAndPos.current.pos);
      }
      setIsMaximized(false);
    } else {
      prevSizeAndPos.current = { size: { ...size }, pos: { ...pos } };
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      setSize({ w: vw - 24, h: vh - 24 });
      setPos({ x: 0, y: 0 });
      setIsMaximized(true);
    }
  };

  const handleMinimizeClick = () => {
    if (onMinimize) {
      onMinimize();
    } else {
      setIsMinimized(true);
    }
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      if (vw <= 768 || isMaximized) return;

      if (dragRef.current.active) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPos({
          x: clamp(dragRef.current.baseX + dx, -(size.w - VISIBLE_EDGE), vw - VISIBLE_EDGE),
          y: clamp(dragRef.current.baseY + dy, -(size.h - VISIBLE_EDGE), vh - VISIBLE_EDGE),
        });
      } else if (resizeRef.current.active) {
        const dw = e.clientX - resizeRef.current.startX;
        const dh = e.clientY - resizeRef.current.startY;
        setSize({
          w: clamp(resizeRef.current.baseW + dw, minWidth, vw - EDGE_MARGIN),
          h: clamp(resizeRef.current.baseH + dh, minHeight, vh - EDGE_MARGIN),
        });
      }
    };

    const onMouseUp = () => {
      dragRef.current.active = false;
      resizeRef.current.active = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [size, minWidth, minHeight, isMaximized]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (isMaximized) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.ant-modal-header')) return;
    if (
      target.closest('button, input, select, textarea, a, [role="button"], .ant-select, .ant-tag, .ant-switch, .ant-btn, .erp-modal-action-btn')
    ) {
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    if (isMaximized) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseW: size.w,
      baseH: size.h,
    };
  };

  if (!open) return null;

  if (isMinimized) {
    return (
      <div
        className="erp-modal-minimized-dock"
        onClick={() => setIsMinimized(false)}
        title="Click to restore window"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 24,
          zIndex: 9999,
          background: '#181f2c',
          color: '#ffffff',
          padding: '8px 16px',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
          border: '1px solid #334155',
          userSelect: 'none',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
        <span style={{ fontSize: 13, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {typeof title === 'string' ? title : 'Minimized Window'}
        </span>
        <span style={{ fontSize: 11, background: 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
          Restore
        </span>
      </div>
    );
  }

  const modalRender = (modalNode: React.ReactNode) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    return (
      <div
        className={`erp-draggable-modal ${isMobile ? 'erp-draggable-modal--mobile' : ''} ${isMaximized ? 'erp-draggable-modal--maximized' : ''}`}
        style={{
          width: isMobile || isMaximized ? '100vw' : size.w,
          pointerEvents: 'auto',
          transform: isMobile || isMaximized ? 'none' : `translate(${pos.x}px, ${pos.y}px)`,
          transition: dragRef.current.active ? 'none' : 'transform 0.08s ease-out, width 0.15s ease, height 0.15s ease',
        }}
        onMouseDown={onHeaderMouseDown}
      >
        <div
          className="erp-draggable-modal-inner"
          style={{
            height: isMobile || isMaximized ? 'calc(100vh - 24px)' : size.h,
            maxHeight: isMobile || isMaximized ? 'calc(100vh - 24px)' : size.h,
          }}
        >
          {modalNode}
        </div>
        {!isMobile && !isMaximized && (
          <div className="erp-draggable-modal-resize-handle" onMouseDown={onResizeMouseDown} aria-hidden="true" title="Drag to resize" />
        )}
      </div>
    );
  };

  const headerTitle = (
    <div
      className="erp-draggable-modal-title-row"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%' }}
    >
      <div className="erp-draggable-modal-title-text" style={{ minWidth: 0, flex: '1 1 auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
        {subtitle && (
          <div className="erp-draggable-modal-subtitle">{subtitle}</div>
        )}
      </div>
      <div className="erp-draggable-modal-title-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {infoTooltip && (
          <Tooltip title={infoTooltip}>
            <button type="button" className="erp-modal-action-btn" aria-label="Information">
              <InfoCircleOutlined style={{ fontSize: 15, color: '#94a3b8' }} />
            </button>
          </Tooltip>
        )}
        {extra && (
          <div className="erp-draggable-modal-title-extra" style={{ flex: '0 0 auto' }}>{extra}</div>
        )}
        {allowMinimize && (
          <Tooltip title="Minimize">
            <button
              type="button"
              className="erp-modal-action-btn"
              title="Minimize"
              aria-label="Minimize"
              onClick={(e) => {
                e.stopPropagation();
                handleMinimizeClick();
              }}
            >
              <MinusOutlined style={{ fontSize: 14 }} />
            </button>
          </Tooltip>
        )}
        {allowMaximize && (
          <Tooltip title={isMaximized ? 'Restore' : 'Maximize'}>
            <button
              type="button"
              className="erp-modal-action-btn"
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
              onClick={(e) => {
                e.stopPropagation();
                toggleMaximize();
              }}
            >
              {isMaximized ? (
                <FullscreenExitOutlined style={{ fontSize: 14 }} />
              ) : (
                <FullscreenOutlined style={{ fontSize: 14 }} />
              )}
            </button>
          </Tooltip>
        )}
        {onCancel && (
          <Tooltip title="Close (Esc)">
            <button
              type="button"
              className="erp-modal-action-btn erp-modal-close-btn"
              aria-label="Close"
              onClick={(e) => {
                e.stopPropagation();
                onCancel(e as any);
              }}
            >
              <CloseOutlined style={{ fontSize: 15 }} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      centered={centered}
      width={size.w}
      closable={false}
      maskClosable={maskClosable}
      zIndex={1060}
      wrapClassName={[wrapClassName, 'erp-draggable-modal-wrap'].filter(Boolean).join(' ')}
      modalRender={modalRender}
      title={headerTitle}
      onCancel={onCancel}
      {...rest}
    >
      {children}
    </Modal>
  );
};

export default DraggableResizableModal;