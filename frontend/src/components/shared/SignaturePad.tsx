import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Space, Typography } from 'antd';
import { ClearOutlined, EditOutlined } from '@ant-design/icons';

/**
 * SIGNATURE PAD (Prompt #19 §14).
 *
 * A minimal canvas signature pad: Draw → Clear → Save, exactly the three actions
 * the brief asks for.
 *
 * WHY A DEDICATED COMPONENT
 *   `PhotoCapture` is a camera/file input for a photograph; reusing it would
 *   mean a 5 MB budget, a file input and a snapshot flow for what is a 20 KB line
 *   drawing. The host signature is a different artifact, so it gets its own
 *   control — while keeping the project's shared-component conventions
 *   (`testId` prefix, antd controls, a `hint`, a default export).
 *
 * WHY IT IS OPTIONAL
 *   The printed slip ALWAYS carries a physical signature area (§13), so nothing
 *   here is ever required. "Clear" simply removes the digital one; "Skip
 *   signature" is the page's job, not this component's.
 *
 * The value handed out is a PNG data URL — the exact format the backend accepts
 * and decodes (`ConfirmHostVisitDto.signature`). It is never put in a URL, and
 * the base64 string is only ever POSTed, never stored in a list row (§22).
 */
export interface SignaturePadProps {
  /** Current signature as a PNG data URL, or null for "not signed yet". */
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
  /** Stable test id prefix; every control appends its own suffix. */
  testId?: string;
  width?: number;
  height?: number;
  hint?: string;
}

/** The pad's own drawing size — the export is scaled down before it leaves. */
const DEFAULT_WIDTH = 460;
const DEFAULT_HEIGHT = 160;
const MAX_EXPORT_EDGE = 480;

export function SignaturePad({
  value,
  onChange,
  disabled,
  testId = 'signature-pad',
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  hint = 'Sign with the mouse, a finger or a stylus. Optional — the printed slip always has a signature box.',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasInk, setHasInk] = useState<boolean>(!!value);

  /**
   * Repaint whatever `value` currently holds. Used when a saved signature is
   * loaded back (re-opening a detail) or after a Clear, so the canvas and the
   * value can never disagree.
   */
  const paint = useCallback((dataUrl: string | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!dataUrl) {
      setHasInk(false);
      return;
    }

    const image = new Image();
    image.onload = () => {
      // Contain-fit: an externally supplied image is never stretched.
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height, 1);
      const w = image.width * scale;
      const h = image.height * scale;
      context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      setHasInk(true);
    };
    // A value that cannot be decoded simply leaves the pad empty — the printed
    // slip's physical signature area is unaffected either way.
    image.onerror = () => setHasInk(false);
    image.src = dataUrl;
  }, []);

  useEffect(() => {
    paint(value ?? null);
  }, [value, paint]);

  /** Pointer position in canvas coordinates, independent of CSS scaling. */
  const pointFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const point = pointFrom(event);
    const context = canvasRef.current?.getContext('2d');
    if (!point || !context) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    context.lineWidth = 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';
    context.beginPath();
    context.moveTo(point.x, point.y);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || !drawingRef.current) return;
    const point = pointFrom(event);
    const context = canvasRef.current?.getContext('2d');
    if (!point || !context) return;
    context.lineTo(point.x, point.y);
    context.stroke();
    setHasInk(true);
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    publish();
  };

  const onPointerLeave = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    publish();
  };

  /** Export the current canvas as a PNG data URL and hand it to the page. */
  const publish = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onChange?.(dataUrl);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    setHasInk(false);
    drawingRef.current = false;
    onChange?.(null);
  };

  return (
    <div data-testid={testId}>
      <div
        style={{
          border: '1px dashed #94a3b8',
          borderRadius: 4,
          background: '#ffffff',
          padding: 4,
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          width={Math.min(width, MAX_EXPORT_EDGE)}
          height={height}
          data-testid={`${testId}-canvas`}
          aria-label="Signature drawing area"
          role="img"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          style={{
            display: 'block',
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'crosshair',
            background: '#ffffff',
            width: '100%',
            maxWidth: `${width}px`,
            height: `${height}px`,
          }}
        />
      </div>

      <Space style={{ marginTop: 8 }} wrap>
        <Button
          size="small"
          icon={<ClearOutlined />}
          onClick={clear}
          disabled={disabled || !hasInk}
          data-testid={`${testId}-clear`}
        >
          Clear
        </Button>
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={publish}
          disabled={disabled || !hasInk}
          data-testid={`${testId}-save`}
        >
          Save Signature
        </Button>
        {hasInk ? (
          <Typography.Text type="success" data-testid={`${testId}-status`}>
            Signature captured
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" data-testid={`${testId}-status`}>
            No signature captured
          </Typography.Text>
        )}
      </Space>

      <div>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {hint}
        </Typography.Text>
      </div>
    </div>
  );
}

export default SignaturePad;
