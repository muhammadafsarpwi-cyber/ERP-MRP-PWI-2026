import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Modal, Space, Alert, Input, Typography, Tooltip } from 'antd';
import {
  ScanOutlined, CloseOutlined, SearchOutlined, WarningOutlined,
  CameraOutlined, SyncOutlined, UploadOutlined, QrcodeOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

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

      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('barcode-scanner-region');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: facing },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const edge = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72);
            return { width: edge, height: edge };
          },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {
          // Ignore scan frames without barcode/QR
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
            {!scanning && !error && (
              <Button type="primary" onClick={() => startScanner()} icon={<ScanOutlined />}>
                Start Live Camera
              </Button>
            )}
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
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(15, 23, 42, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#fff',
              padding: '5px 14px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(4px)',
            }}
          >
            Point camera at Barcode or QR Code
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '12px 14px' }}>
          <Alert
            type="error"
            showIcon
            message="Camera Notice"
            description={
              <div>
                <p style={{ margin: '0 0 8px' }}>{error}</p>
                <Button
                  size="small"
                  type="primary"
                  icon={<CameraOutlined />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Snap / Upload Photo to Scan
                </Button>
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
