import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Button, Modal, Space, Alert, Input, Typography } from 'antd';
import { ScanOutlined, CloseOutlined, SearchOutlined, WarningOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface BarcodeScannerProps {
  open: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({
  open,
  onClose,
  onScan,
  title = 'Scan Barcode',
}) => {
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [secureContext, setSecureContext] = useState(true);

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
      return 'Browser does not support camera access. Use a modern browser (Chrome, Firefox, Safari, Edge).';
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');
      if (videoDevices.length === 0) {
        return 'No camera detected on this device.';
      }
      return null;
    } catch {
      return 'Unable to detect camera devices. Check if camera hardware is available.';
    }
  };

  const startScanner = useCallback(async () => {
    if (!scannerRef.current || html5QrCodeRef.current) return;

    if (!window.isSecureContext) {
      setError('Camera requires a secure context (HTTPS or localhost). Please access the app via HTTPS or use manual barcode input below.');
      return;
    }

    try {
      setError(null);
      setScanning(true);

      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('barcode-scanner-region');
      html5QrCodeRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 150 },
          aspectRatio: 1.5,
        },
        (decodedText: string) => {
          onScan(decodedText);
          stopScanner();
          onClose();
        },
        () => {
          // Ignore scan failures (expected while scanning)
        },
      );
    } catch (err: any) {
      console.error('Scanner error:', err);
      setScanning(false);

      const msg = err?.message || String(err);

      if (msg.includes('Permission') || msg.includes('NotAllowedError') || msg.includes('denied')) {
        setError('Camera permission denied. Please allow camera access in your browser settings and try again.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setError('No camera found. Make sure your device has a camera connected.');
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        setError('Camera is in use by another application. Close other apps using the camera and try again.');
      } else if (msg.includes('Overconstrained')) {
        setError('Camera does not support the required resolution. Try a different device.');
      } else if (msg.includes('HTTPS') || msg.includes('secure context')) {
        setError('Camera requires HTTPS. Make sure you are accessing the app over a secure connection.');
      } else {
        const diagnosis = await diagnoseCamera();
        setError(diagnosis || `Unable to start camera: ${msg}. Try using manual barcode input below.`);
      }
    }
  }, [onScan, onClose, stopScanner]);

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
      onCancel={handleClose}
      footer={
        <Space>
          <Button onClick={handleClose} icon={<CloseOutlined />}>Cancel</Button>
          {!scanning && !error && (
            <Button type="primary" onClick={startScanner} icon={<ScanOutlined />}>
              Start Scanner
            </Button>
          )}
          {scanning && (
            <Button onClick={stopScanner} icon={<CloseOutlined />}>
              Stop Scanner
            </Button>
          )}
        </Space>
      }
      title={
        <Space>
          <ScanOutlined />
          {title}
        </Space>
      }
      width={480}
      styles={{ body: { padding: 0, overflow: 'hidden' } }}
      destroyOnHidden
    >
      {!secureContext && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          message="Insecure Context"
          description="You are not accessing this app over HTTPS. Camera scanning may not work. Use manual barcode input below."
          style={{ margin: '0 0 8px 0', borderRadius: 0 }}
        />
      )}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: 300,
          background: '#000',
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
            minHeight: 300,
          }}
        />
        {scanning && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0, 0, 0, 0.7)',
              color: '#fff',
              padding: '4px 12px',
              borderRadius: 4,
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            Point camera at the barcode
          </div>
        )}
      </div>
      {error && (
        <div style={{ padding: 12 }}>
          <Alert type="error" showIcon message="Scanner Error" description={error} />
        </div>
      )}
      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--theme-border, #f0f0f0)',
          background: 'var(--theme-bg-secondary, #fafafa)',
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <Text type="secondary" style={{ fontSize: 11 }}>Manual Entry</Text>
        </div>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder="Enter barcode manually..."
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            onPressEnter={handleManualSubmit}
            prefix={<SearchOutlined />}
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
