import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalProps } from 'antd';
import { MinusOutlined } from '@ant-design/icons';
import './draggableResizableModal.css';

/**
 * Centered modal that can be moved by dragging its header and resized from the
 * bottom-right corner. Positions are transform-based so the modal never loses
 * keyboard focus during drag. Resets to a centered, default size on open.
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
  /**
   * Optional callback when user clicks the minimize (-) button in the modal header.
   */
  onMinimize?: () => void;
  /**
   * Clicking the mask NEVER closes an ERP modal (PROMPT-35). Closing is only
   * possible via the header close (X), footer buttons, or Escape.
   */
  maskClosable?: boolean;
  /**
   * Optional initial pixel offset from center (transform-based translate).
   * Used to position two modals side-by-side on open. Values are clamped so
   * the modal stays within the viewport (≥ 24 px from each edge).
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
  onMinimize,
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
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    active: false, startX: 0, startY: 0, baseX: 0, baseY: 0,
  });
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; baseW: number; baseH: number }>({
    active: false, startX: 0, startY: 0, baseW: parseDim(width, 880), baseH: parseDim(height, 560),
  });

  useEffect(() => {
    if (!open) return;
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

    // Clamp initialOffset so the modal stays within viewport (≥ 24 px from each edge).
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

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
      const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
      if (vw <= 768) return;

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
  }, [size, minWidth, minHeight]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
    const target = e.target as HTMLElement;
    if (!target.closest('.ant-modal-header')) return;
    if (
      target.closest('button, input, select, textarea, a, [role="button"], .ant-select, .ant-tag, .ant-switch, .ant-btn, .erp-modal-minimize-btn')
    ) {
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) return;
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

  const modalRender = (modalNode: React.ReactNode) => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    return (
      <div
        className={`erp-draggable-modal ${isMobile ? 'erp-draggable-modal--mobile' : ''}`}
        style={{
          width: isMobile ? '100vw' : size.w,
          pointerEvents: 'auto',
          transform: isMobile ? 'none' : `translate(${pos.x}px, ${pos.y}px)`,
          transition: dragRef.current.active ? 'none' : 'transform 0.08s ease-out',
        }}
        onMouseDown={onHeaderMouseDown}
      >
        <div
          className="erp-draggable-modal-inner"
          style={{
            height: isMobile ? '100vh' : size.h,
            maxHeight: isMobile ? '100vh' : size.h,
          }}
        >
          {modalNode}
        </div>
        {!isMobile && (
          <div className="erp-draggable-modal-resize-handle" onMouseDown={onResizeMouseDown} aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      centered={centered}
      width={size.w}
      maskClosable={maskClosable}
      wrapClassName={[wrapClassName, 'erp-draggable-modal-wrap'].filter(Boolean).join(' ')}
      modalRender={modalRender}
      title={
        title || subtitle || extra || onMinimize ? (
          <div
            className="erp-draggable-modal-title-row"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
          >
            <div className="erp-draggable-modal-title-text" style={{ minWidth: 0, flex: '1 1 auto' }}>
              {title}
              {subtitle ? (
                <div className="erp-draggable-modal-subtitle">{subtitle}</div>
              ) : null}
            </div>
            <div className="erp-draggable-modal-title-actions" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {extra ? <div className="erp-draggable-modal-title-extra" style={{ flex: '0 0 auto' }}>{extra}</div> : null}
              {onMinimize ? (
                <button
                  type="button"
                  className="erp-modal-minimize-btn"
                  title="Minimize to Dock"
                  aria-label="Minimize"
                  data-testid="modal-minimize-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMinimize();
                  }}
                >
                  <MinusOutlined />
                </button>
              ) : null}
            </div>
          </div>
        ) : undefined
      }
      {...rest}
    >
      {children}
    </Modal>
  );
};

export default DraggableResizableModal;