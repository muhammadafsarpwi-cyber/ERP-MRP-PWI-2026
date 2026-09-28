import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Space, Typography } from 'antd';
import {
  CameraOutlined,
  UploadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';

export interface PhotoCaptureProps {
  /** Currently selected image (the page owns the File it will upload). */
  value?: File | null;
  onChange?: (file: File | null) => void;
  disabled?: boolean;
  /** Stable test id prefix; every control appends its own suffix. */
  testId?: string;
  hint?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;

type CameraState = 'idle' | 'starting' | 'active' | 'unsupported' | 'denied';

/**
 * Visitor photo input with BOTH capture paths the brief requires:
 *
 *   • "Take Photo"  → MediaDevices.getUserMedia + canvas snapshot
 *   • "Upload Photo" → plain file input (fallback, and the only path on
 *     devices/browsers without a camera or with a denied permission)
 *
 * A preview is always shown before saving, and the photo can be retaken or
 * removed. Camera failure is handled gracefully — it never blocks visitor
 * creation, because the upload fallback stays available.
 *
 * No camera component existed in the project, so this one is new and generic
 * (the Host Signature capture of Prompt #19 can reuse it).
 */
export function PhotoCapture({
  value,
  onChange,
  disabled,
  testId = 'photo-capture',
  hint = 'JPEG, PNG or WebP · up to 5 MB',
}: PhotoCaptureProps) {
  const { message } = App.useApp();
  const [preview, setPreview] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Preview comes from the File itself so the same code path covers camera
  // captures and uploads (and survives a form re-render).
  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPreview(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => setPreview(null);
    reader.readAsDataURL(value);
    return () => reader.abort();
  }, [value]);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraState('idle');
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  // Attach the live stream once the <video> is actually in the DOM.
  useEffect(() => {
    if (cameraState !== 'active') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
  }, [cameraState]);

  const startCamera = useCallback(async () => {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
      setCameraState('unsupported');
      message.warning('No camera is available here — use Upload Photo instead.');
      return;
    }
    setCameraState('starting');
    try {
      const stream = await mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setCameraState('active');
    } catch {
      setCameraState('denied');
      message.warning('Camera access was denied or is unavailable — use Upload Photo instead.');
    }
  }, [message]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      message.error('The camera is not ready yet.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      message.error('This browser cannot capture from the camera — use Upload Photo instead.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          message.error('Could not capture the photo — use Upload Photo instead.');
          return;
        }
        stopCamera();
        onChange?.(new File([blob], `visitor-photo-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  }, [message, onChange, stopCamera]);

  const handleFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        message.error('Please choose an image file.');
        onChange?.(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        message.error('The photo must be 5 MB or smaller.');
        onChange?.(null);
        return;
      }
      onChange?.(file);
    },
    [message, onChange],
  );

  const previewPanel = (
    <div data-testid={`${testId}-preview`} style={{ textAlign: 'center' }}>
      <img
        src={preview ?? ''}
        alt="Visitor preview"
        data-testid={`${testId}-preview-image`}
        style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, border: '1px solid #d9d9d9' }}
      />
      <div style={{ marginTop: 8 }}>
        <Space>
          <Button
            icon={<CameraOutlined />}
            onClick={() => void startCamera()}
            disabled={disabled}
            data-testid={`${testId}-retake`}
          >
            Retake
          </Button>
          <Button
            icon={<DeleteOutlined />}
            onClick={() => onChange?.(null)}
            disabled={disabled}
            danger
            data-testid={`${testId}-remove`}
          >
            Remove
          </Button>
        </Space>
      </div>
    </div>
  );

  const cameraPanel = (
    <div data-testid={`${testId}-camera`} style={{ textAlign: 'center' }}>
      <video
        ref={videoRef}
        data-testid={`${testId}-video`}
        autoPlay
        playsInline
        muted
        style={{ width: '100%', maxWidth: 320, background: '#000', borderRadius: 8 }}
      />
      <div style={{ marginTop: 8 }}>
        <Space>
          <Button
            type="primary"
            icon={<CameraOutlined />}
            onClick={capture}
            data-testid={`${testId}-capture`}
          >
            Capture
          </Button>
          <Button onClick={stopCamera} data-testid={`${testId}-cancel-camera`}>
            Cancel
          </Button>
        </Space>
      </div>
    </div>
  );

  const picker = (
    <Space direction="vertical" size={4} data-testid={`${testId}-picker`}>
      <Space>
        <Button
          icon={<CameraOutlined />}
          onClick={() => void startCamera()}
          disabled={disabled}
          data-testid={`${testId}-take-photo`}
        >
          Take Photo
        </Button>
        <Button
          icon={<UploadOutlined />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          data-testid={`${testId}-upload-photo`}
        >
          Upload Photo
        </Button>
      </Space>
      {(cameraState === 'denied' || cameraState === 'unsupported') && (
        <Typography.Text type="warning" data-testid={`${testId}-camera-fallback`}>
          Camera unavailable — use Upload Photo instead.
        </Typography.Text>
      )}
    </Space>
  );

  return (
    <div data-testid={testId}>
      {preview ? previewPanel : cameraState === 'active' || cameraState === 'starting' ? cameraPanel : picker}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        disabled={disabled}
        data-testid={`${testId}-file`}
        onChange={handleFile}
      />
      <div style={{ marginTop: 4 }}>
        <Typography.Text type="secondary">{hint}</Typography.Text>
      </div>
    </div>
  );
}

export default PhotoCapture;
