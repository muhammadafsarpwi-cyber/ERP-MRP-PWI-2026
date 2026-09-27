import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Modal, Space, Alert, Input, Typography, Tooltip } from 'antd';
import {
  ScanOutlined, CloseOutlined, SearchOutlined, WarningOutlined,
  CameraOutlined, SyncOutlined, UploadOutlined, QrcodeOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

const playScanBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio context not allowed or failed
  }
};

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
  zIndex?: number;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  open,
  onClose,
  onScan,
  title = 'Scan QR Code / Barcode',
  zIndex = 1500,
}) => {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fileScanning, setFileScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [secureContext, setSecureContext] = useState(true);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      setSecureContext(window.isSecureContext);
    }
  }, [open]);

  const stopScanner = useCallback(async () => {
    try {
      if (html5QrCodeRef.current) {
        try {
          const state = html5QrCodeRef.current.getState();
          if (state !== 1) {
            await html5QrCodeRef.current.stop();
          }
        } catch {
          // Ignore stop errors
        }
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch {
      // Ignore cleanup errors
    }
  }, []);

  const diagnoseCamera = async (): Promise<string | null> => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'Browser does not support direct camera streaming. Please use the "Upload Photo" button below to scan directly from your device camera.';
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      if (videoDevices.length === 0) {
        return 'No camera detected on this device. You can snap a photo using the button below.';
      }
      return null;
    } catch {
      return 'Unable to detect camera devices. Use the "Upload Photo" button below to take a picture.';
    }
  };

  const startScanner = useCallback(async (facing: 'environment' | 'user' = facingMode) => {
    if (!scannerRef.current) return;

    if (html5QrCodeRef.current) {
      await stopScanner();
    }

    if (!window.isSecureContext) {
      setError('Camera requires a secure context (HTTPS or localhost). Use "Upload Photo" or manual entry below.');
      return;
    }

    try {
      setError(null);
      setScanning(true);

      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

      const formatsToSupport = [
        Html5QrcodeSupportedFormats.QR_CODE,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.DATA_MATRIX,
      ];

      const scanner = new Html5Qrcode('barcode-scanner-region', {
        formatsToSupport,
        verbose: false,
      });
      html5QrCodeRef.current = scanner;

      // Smart camera selection: try exact deviceId first to avoid mobile OverconstrainedError
      let cameraConfig: any = { facingMode: facing };
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (cameras && cameras.length > 0) {
          if (facing === 'environment') {
            const backCam = cameras.find((c) =>
              /back|rear|environment|macro/i.test(c.label)
            ) || cameras[cameras.length - 1];
            cameraConfig = backCam.id;
          } else {
            const frontCam = cameras.find((c) =>
              /front|user|selfie/i.test(c.label)
            ) || cameras[0];
            cameraConfig = frontCam.id;
          }
        }
      } catch {
        cameraConfig = { facingMode: facing };
      }

      await scanner.start(
        cameraConfig,
        {
          fps: 20,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const w = Math.floor(viewfinderWidth * 0.82);
            const h = Math.floor(Math.min(viewfinderHeight * 0.65, 260));
            return { width: Math.max(w, 220), height: Math.max(h, 160) };
          },
        },
        (decodedText: string) => {
          playScanBeep();
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {
          // Ignore frames without decoded code
        },
      );
    } catch (err: any) {
      console.error('Scanner error:', err);
      setScanning(false);

      const msg = err?.message || String(err);

      if (msg.includes('Permission') || msg.includes('NotAllowedError') || msg.includes('denied')) {
        setError(
          'Camera permission denied. If using mobile, tap "Upload / Snap Photo" below to take a picture with your camera without browser permissions, or enable camera access in browser site settings.',
        );
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setError('No camera found on this device. Use the "Upload / Snap Photo" option below.');
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        setError('Camera is in use by another application. Close other camera apps or upload a photo.');
      } else if (msg.includes('Overconstrained')) {
        setError('Camera does not support this facing mode. Trying to flip camera...');
      } else {
        const diagnosis = await diagnoseCamera();
        setError(diagnosis || `Unable to start camera: ${msg}. Try using "Upload / Snap Photo" or manual entry below.`);
      }
    }
  }, [facingMode, onScan, onClose, stopScanner]);

  const toggleFacingMode = useCallback(() => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (scanning) {
      startScanner(next);
    }
  }, [facingMode, scanning, startScanner]);

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileScanning(true);
    setError(null);
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      let scanner = html5QrCodeRef.current;
      if (!scanner) {
        scanner = new Html5Qrcode('barcode-scanner-region');
        html5QrCodeRef.current = scanner;
      }
      const decodedText = await scanner.scanFile(file, true);
      if (decodedText) {
        onScan(decodedText);
        stopScanner();
        onClose();
      } else {
        setError('No QR code or barcode detected in image. Please ensure the code is clearly visible and try again.');
      }
    } catch (err: any) {
      setError('Could not read code from the image. Please take a closer photo with good lighting, or type the code manually below.');
    } finally {
      setFileScanning(false);
      if (e.target) e.target.value = '';
    }
  };

  useEffect(() => {
    if (open) {
      setError(null);
      setScanning(false);
      setManualInput('');
      const timer = setTimeout(() => {
        startScanner();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopScanner();
    }
  }, [open, startScanner, stopScanner]);

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  const handleManualSubmit = () => {
    if (manualInput.trim()) {
      onScan(manualInput.trim());
      stopScanner();
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      zIndex={zIndex}
      onCancel={handleClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: 8 }}>
          <Space wrap>
            <Button
              icon={<CameraOutlined />}
              onClick={() => fileInputRef.current?.click()}
              loading={fileScanning}
              type={error ? 'primary' : 'default'}
            >
              Snap / Upload Photo
            </Button>
            <Button icon={<SyncOutlined />} onClick={toggleFacingMode} disabled={fileScanning}>
              Flip Camera ({facingMode === 'environment' ? 'Back' : 'Front'})
            </Button>
          </Space>
          <Space wrap>
            {error ? (
              <Button type="primary" onClick={() => startScanner()} icon={<SyncOutlined />}>
                Retry Live Camera
              </Button>
            ) : !scanning ? (
              <Button type="primary" onClick={() => startScanner()} icon={<ScanOutlined />}>
                Start Live Camera
              </Button>
            ) : null}
            <Button onClick={handleClose} icon={<CloseOutlined />}>Close</Button>
          </Space>
        </div>
      }
      title={
        <Space>
          <QrcodeOutlined style={{ color: 'var(--theme-primary, #4f46e5)' }} />
          <span>{title}</span>
        </Space>
      }
      width={500}
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
      destroyOnHidden
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileScan}
      />

      {!secureContext && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Insecure Context"
          description="Camera streaming requires HTTPS. Use the 'Snap / Upload Photo' button or manual entry below."
          style={{ margin: '0 0 8px 0', borderRadius: 0 }}
        />
      )}

      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 320,
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          id="barcode-scanner-region"
          ref={scannerRef}
          style={{
            width: '100%',
            minHeight: 320,
          }}
        />
        {scanning && (
          <>
            <style>
              {`
                @keyframes scanner-laser-sweep {
                  0% { top: 8%; opacity: 0.6; }
                  50% { top: 92%; opacity: 1; }
                  100% { top: 8%; opacity: 0.6; }
                }
              `}
            </style>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                pointerEvents: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
            >
              <div
                style={{
                  width: '84%',
                  maxWidth: 360,
                  height: 190,
                  border: '2px solid rgba(16, 185, 129, 0.85)',
                  borderRadius: 14,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                }}
              >
                {/* 4 corner accents */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 16, height: 16, borderTop: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '12px 0 0 0' }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderTop: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 12px 0 0' }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 16, height: 16, borderBottom: '4px solid #10b981', borderLeft: '4px solid #10b981', borderRadius: '0 0 0 12px' }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 16, borderBottom: '4px solid #10b981', borderRight: '4px solid #10b981', borderRadius: '0 0 12px 0' }} />

                {/* Animated laser line */}
                <div
                  style={{
                    position: 'absolute',
                    left: 4,
                    right: 4,
                    height: 2,
                    background: '#10b981',
                    boxShadow: '0 0 12px 3px #10b981',
                    animation: 'scanner-laser-sweep 2s infinite ease-in-out',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#fff',
                padding: '6px 16px',
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(6px)',
                zIndex: 10,
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              ⚡ Point camera steady at Barcode / QR Code
            </div>
          </>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 14px' }}>
          <Alert
            type="info"
            showIcon
            message="Camera Access / Mobile Camera Option"
            description={
              <div>
                <p style={{ margin: '0 0 10px', fontSize: 13 }}>
                  {error.includes('denied') || error.includes('Permission')
                    ? '1. If Chrome or your browser asked "Chrome needs permission to access your camera", tap "Continue / Allow" in Chrome, then click "Retry Live Camera" below.'
                    : error}
                </p>
                <Space wrap size="small">
                  <Button
                    type="primary"
                    icon={<CameraOutlined />}
                    style={{ background: '#722ed1', borderColor: '#722ed1', fontWeight: 600 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Take Photo with Mobile Camera
                  </Button>
                  <Button
                    type="default"
                    icon={<SyncOutlined />}
                    onClick={() => startScanner()}
                    style={{ fontWeight: 600 }}
                  >
                    Retry Live Camera
                  </Button>
                </Space>
              </div>
            }
          />
        </div>
      )}

      <div
        style={{
          padding: '10px 14px',
          borderTop: '1px solid var(--theme-border, #e2e8f0)',
          background: 'var(--theme-bg-secondary, #f8fafc)',
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>
            Or Enter Code Manually
          </Text>
        </div>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Type or paste code e.g. 0201000000100..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onPressEnter={handleManualSubmit}
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          />
          <Button type="primary" onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            Lookup
          </Button>
        </Space.Compact>
      </div>
    </Modal>
  );
};

export default BarcodeScanner;
