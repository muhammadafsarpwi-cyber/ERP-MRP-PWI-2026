import React, { useEffect, useRef, useState } from 'react';
import { Modal, ModalProps } from 'antd';
import './draggableResizableModal.css';

/**
 * Centered modal that can be moved by dragging its header and resized from the
 * bottom-right corner. Positions are transform-based so the modal never loses
 * keyboard focus during drag. Resets to a centered, default size on open.
 */
export interface DraggableResizableModalProps extends ModalProps {
  /** Initial width (also used when `open` becomes true). Defaults to 880. */
  width?: number;
  /** Initial/restored height when opened. Defaults to 560. */
  height?: number;
  minWidth?: number;
  minHeight?: number;
  /** Extra actions rendered on the right side of the modal header. */
  extra?: React.ReactNode;
  /** Optional muted subtitle rendered under the header title. */
  subtitle?: React.ReactNode;
  /**
   * Clicking the mask NEVER closes an ERP modal (PROMPT-35). Closing is only
   * possible via the header close (X), footer buttons, or Escape.
   */
  maskClosable?: boolean;
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
  wrapClassName,
  ...rest
}) => {
  const [size, setSize] = useState({ w: width, h: height });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    active: false, startX: 0, startY: 0, baseX: 0, baseY: 0,
  });
  const resizeRef = useRef<{ active: boolean; startX: number; startY: number; baseW: number; baseH: number }>({
    active: false, startX: 0, startY: 0, baseW: width, baseH: height,
  });

  useEffect(() => {
    if (!open) return;
    setPos({ x: 0, y: 0 });
    const vw = window.innerWidth || 1280;
    const vh = window.innerHeight || 768;
    setSize({
      w: clamp(width, minWidth, vw - EDGE_MARGIN),
      h: clamp(height, minHeight, vh - EDGE_MARGIN),
    });
  }, [open, width, height, minWidth, minHeight]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragRef.current.active) {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 768;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPos({
          x: clamp(dragRef.current.baseX + dx, -(size.w - VISIBLE_EDGE), vw - VISIBLE_EDGE),
          y: clamp(dragRef.current.baseY + dy, -(size.h - VISIBLE_EDGE), vh - VISIBLE_EDGE),
        });
      } else if (resizeRef.current.active) {
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 768;
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
    const target = e.target as HTMLElement;
    if (!target.closest('.ant-modal-header')) return;
    if (
      target.closest('button, input, select, textarea, a, [role="button"], .ant-select, .ant-tag, .ant-switch, .ant-btn')
    ) {
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  };

  const onResizeMouseDown = (e: React.MouseEvent) => {
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

  const modalRender = (modalNode: React.ReactNode) => (
    <div
      className="erp-draggable-modal"
      style={{
        width: size.w,
        pointerEvents: 'auto',
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        transition: dragRef.current.active ? 'none' : 'transform 0.08s ease-out',
      }}
      onMouseDown={onHeaderMouseDown}
    >
      <div className="erp-draggable-modal-inner" style={{ height: size.h, maxHeight: size.h }}>
        {modalNode}
      </div>
      <div className="erp-draggable-modal-resize-handle" onMouseDown={onResizeMouseDown} aria-hidden="true" />
    </div>
  );

  return (
    <Modal
      open={open}
      centered={centered}
width={size.w}
        maskClosable={maskClosable}
        wrapClassName={[wrapClassName, 'erp-draggable-modal-wrap'].filter(Boolean).join(' ')}
        modalRender={modalRender}
        title={
          title || subtitle || extra ? (
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
              {extra ? <div className="erp-draggable-modal-title-extra" style={{ flex: '0 0 auto' }}>{extra}</div> : null}
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