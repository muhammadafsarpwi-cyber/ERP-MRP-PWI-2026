import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Drawer,
  Button,
  Space,
  Typography,
  Tag,
  Input,
  Alert,
  Popconfirm,
  Modal,
  notification,
  Divider,
  Spin,
  Badge,
} from 'antd';
import {
  ScanOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  DeleteOutlined,
  LockOutlined,
  PrinterOutlined,
  CarOutlined,
  CloseOutlined,
  BarcodeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  DispatchPackage,
  DispatchPackageStatus,
  dispatchPackageService,
} from '../../services/dispatchPackageService';
import { DispatchPackagePrintModal } from './DispatchPackagePrint';

const { Title, Text } = Typography;

// ── Web Audio Feedback Helper ────────────────────────────────────────────────
function playAudioTone(freq: number, durationSec: number, type: OscillatorType = 'sine'): void {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
  } catch {
    // Ignore audio permission or failure on restricted browsers
  }
}

function playSuccessChime() {
  playAudioTone(880, 0.12, 'sine');
  setTimeout(() => playAudioTone(1320, 0.18, 'sine'), 120);
}

function playWarningBuzz() {
  playAudioTone(220, 0.25, 'sawtooth');
  setTimeout(() => playAudioTone(180, 0.35, 'sawtooth'), 260);
}

interface MobilePackageBuilderProps {
  open: boolean;
  onClose: () => void;
  pkgId: string | null;
  onPackageUpdated?: (pkg: DispatchPackage) => void;
  onOpenGatePassModal?: (pkg: DispatchPackage) => void;
}

export const MobilePackageBuilder: React.FC<MobilePackageBuilderProps> = ({
  open,
  onClose,
  pkgId,
  onPackageUpdated,
  onOpenGatePassModal,
}) => {
  const [pkg, setPkg] = useState<DispatchPackage | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanInput, setScanInput] = useState('');
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [flashFeedback, setFlashFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    title: string;
    message: string;
    unit?: any;
  } | null>(null);

  const [finalizeConfirmOpen, setFinalizeConfirmOpen] = useState(false);
  const [finalizeLoading, setFinalizeLoading] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);

  const inputRef = useRef<any>(null);
  const html5QrCodeRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedTextRef = useRef<string>('');

  const isLocked = pkg?.status === DispatchPackageStatus.FINALIZED ||
                   pkg?.status === DispatchPackageStatus.DISPATCHED ||
                   pkg?.status === DispatchPackageStatus.CANCELLED;

  // Load package details
  const fetchPackage = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await dispatchPackageService.getOne(id);
      setPkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);
    } catch (err: any) {
      notification.error({
        message: 'Failed to load package',
        description: err?.message || 'Package not found',
      });
    } finally {
      setLoading(false);
    }
  }, [onPackageUpdated]);

  useEffect(() => {
    if (open && pkgId) {
      fetchPackage(pkgId);
      setFlashFeedback(null);
      setCameraActive(false);
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      stopCameraScanner();
      setPkg(null);
    }
  }, [open, pkgId, fetchPackage]);

  // Clean up scanner on unmount or drawer close
  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  // Process a Scanned QR/Barcode string
  const handleProcessScan = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code || !pkg) return;

    // Concurrency / rapid double-read guard (1200ms debounce for same physical label)
    const now = Date.now();
    if (code === lastScannedTextRef.current && now - lastScanTimeRef.current < 1200) {
      return;
    }
    lastScannedTextRef.current = code;
    lastScanTimeRef.current = now;

    setScanLoading(true);
    try {
      const res = await dispatchPackageService.scanAndAddUnit(pkg.id, code);
      setPkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);

      playSuccessChime();
      setFlashFeedback({
        type: 'success',
        title: '✓ ADDED TO PACKAGE',
        message: `${res.unit?.coilNo || ''} (${res.unit?.unitSerialNo || code})`,
        unit: res.unit,
      });
      setScanInput('');
    } catch (err: any) {
      playWarningBuzz();
      const errorMsg = err?.response?.data?.message || err?.message || 'Scan error';
      const isDuplicate = errorMsg.toLowerCase().includes('already in this package') ||
                          errorMsg.toLowerCase().includes('already');
      const isNotFound = errorMsg.toLowerCase().includes('not found');

      setFlashFeedback({
        type: isDuplicate ? 'warning' : 'error',
        title: isDuplicate ? '⚠ ALREADY IN THIS PACKAGE' : isNotFound ? 'QR Code Not Recognized' : 'Scan Failed',
        message: errorMsg,
      });
    } finally {
      setScanLoading(false);
      setTimeout(() => {
        if (!cameraActive) {
          inputRef.current?.focus();
        }
      }, 100);
    }
  };

  const handleManualScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (scanInput) {
      handleProcessScan(scanInput);
    }
  };

  // Camera Scanning Controls
  const startCameraScanner = async (facing: 'environment' | 'user' = 'environment') => {
    // 1. Secure context check for mobile camera API
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      notification.error({
        message: 'Camera Requires Secure Context (HTTPS)',
        description:
          'Modern mobile browsers require HTTPS or localhost for camera streaming. If running on local network, serve with HTTPS=true npm start or use the manual serial input below.',
        duration: 7,
      });
      return;
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (html5QrCodeRef.current) {
        await stopCameraScanner();
      }
      const scanner = new Html5Qrcode('dispatch-mobile-viewfinder');
      html5QrCodeRef.current = scanner;

      setCameraActive(true);
      await scanner.start(
        { facingMode: facing },
        {
          fps: 15,
          qrbox: (w, h) => {
            const side = Math.floor(Math.min(w, h) * 0.75);
            return { width: side, height: side };
          },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          handleProcessScan(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Overconstrained') && facing === 'environment') {
        // Fallback if environment back-camera is overconstrained
        return startCameraScanner('user');
      }

      setCameraActive(false);

      if (msg.includes('Permission') || msg.includes('NotAllowedError') || msg.includes('denied')) {
        notification.error({
          message: 'Camera Permission Denied',
          description:
            'Camera permission is required to scan QR codes. Please allow camera access in your mobile browser settings, or enter coil serial number manually.',
          duration: 6,
        });
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        notification.warning({
          message: 'No Camera Available',
          description: 'No camera available on this device. Please use manual serial / wedge entry.',
          duration: 6,
        });
      } else if (msg.includes('NotReadable') || msg.includes('TrackStartError')) {
        notification.warning({
          message: 'Camera Already in Use',
          description: 'Camera is currently in use by another application. Please close other camera tabs/apps and try again.',
          duration: 6,
        });
      } else {
        notification.warning({
          message: 'Camera Scanner Unavailable',
          description: msg || 'Unable to access camera. Please use manual serial entry or barcode scanner gun.',
          duration: 6,
        });
      }
    }
  };

  const stopCameraScanner = async () => {
    try {
      if (html5QrCodeRef.current) {
        const state = html5QrCodeRef.current.getState();
        if (state !== 1) {
          await html5QrCodeRef.current.stop();
        }
        html5QrCodeRef.current.clear();
        html5QrCodeRef.current = null;
      }
    } catch {
      // Ignored
    }
    setCameraActive(false);
  };

  const handleToggleCamera = () => {
    if (cameraActive) {
      stopCameraScanner();
    } else {
      startCameraScanner();
    }
  };

  // Remove Unit
  const handleRemoveUnit = async (unitRowId: string, coilNo: string) => {
    if (!pkg) return;
    try {
      const res = await dispatchPackageService.removeUnit(pkg.id, unitRowId);
      setPkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);
      notification.success({
        message: 'Unit Removed',
        description: `Coil ${coilNo} removed from package. Production unit remains available.`,
      });
    } catch (err: any) {
      notification.error({
        message: 'Remove failed',
        description: err?.message || 'Could not remove unit',
      });
    }
  };

  // Authoritative Finalization
  const handleConfirmFinalize = async () => {
    if (!pkg) return;
    setFinalizeLoading(true);
    try {
      const res = await dispatchPackageService.finalize(pkg.id);
      setPkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);
      setFinalizeConfirmOpen(false);
      stopCameraScanner();
      playSuccessChime();
      notification.success({
        message: 'Package Finalized',
        description: `Package ${pkg.packageNo} is now locked and ready for Gate Pass / Dispatch!`,
      });
    } catch (err: any) {
      notification.error({
        message: 'Finalization Failed',
        description: err?.message || 'Could not finalize package',
      });
    } finally {
      setFinalizeLoading(false);
    }
  };

  const activeUnits = (pkg?.units || []).filter((u) => u.status === 'PACKED');

  return (
    <Drawer
      open={open}
      onClose={() => {
        stopCameraScanner();
        onClose();
      }}
      width={window.innerWidth < 640 ? '100%' : 540}
      styles={{
        body: { padding: '12px 16px', background: 'var(--theme-bg, #0b1120)' },
        header: { background: 'var(--theme-surface, #1e293b)', borderBottom: '1px solid #334155' },
      }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Space>
              <BarcodeOutlined style={{ color: '#38bdf8', fontSize: 18 }} />
              <span style={{ color: '#f8fafc', fontWeight: 800, fontSize: 16 }}>
                {pkg?.packageNo || 'Package Builder'}
              </span>
            </Space>
            {pkg?.status && (
              <div style={{ marginTop: 2 }}>
                <Tag color={pkg.status === DispatchPackageStatus.FINALIZED ? 'green' : pkg.status === DispatchPackageStatus.DISPATCHED ? 'purple' : 'blue'}>
                  {pkg.status}
                </Tag>
                {pkg.customerName && (
                  <Text style={{ color: '#94a3b8', fontSize: 12 }}>&bull; {pkg.customerName}</Text>
                )}
              </div>
            )}
          </div>
        </div>
      }
      extra={
        <Button type="text" icon={<CloseOutlined style={{ color: '#94a3b8' }} />} onClick={onClose} />
      }
      footer={
        <div style={{ padding: '6px 0', background: 'var(--theme-surface, #1e293b)' }}>
          {!isLocked ? (
            <Button
              type="primary"
              size="large"
              block
              icon={<LockOutlined />}
              disabled={activeUnits.length === 0}
              style={{
                height: 48,
                fontSize: 16,
                fontWeight: 700,
                background: activeUnits.length > 0 ? '#10b981' : undefined,
                borderColor: activeUnits.length > 0 ? '#059669' : undefined,
              }}
              onClick={() => setFinalizeConfirmOpen(true)}
            >
              FINALIZE PACKAGE ({activeUnits.length} Units)
            </Button>
          ) : (
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Button
                type="primary"
                size="large"
                icon={<PrinterOutlined />}
                style={{ flex: 1, height: 44, fontWeight: 700 }}
                onClick={() => setPrintModalOpen(true)}
              >
                Print Package
              </Button>
              {onOpenGatePassModal && pkg && (
                <Button
                  size="large"
                  icon={<CarOutlined />}
                  style={{
                    flex: 1,
                    height: 44,
                    fontWeight: 700,
                    background: '#8b5cf6',
                    borderColor: '#7c3aed',
                    color: '#fff',
                  }}
                  onClick={() => onOpenGatePassModal(pkg)}
                >
                  {pkg.status === DispatchPackageStatus.DISPATCHED ? 'View Gate Pass' : 'Gate Pass / Exit'}
                </Button>
              )}
            </Space>
          )}
        </div>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ color: '#94a3b8', marginTop: 12 }}>Loading dispatch package...</div>
        </div>
      ) : !pkg ? (
        <Alert type="warning" message="No package selected" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 1. Running Totals Ribbon (Prominent, Always Visible) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 8,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 10,
              padding: '10px 8px',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                UNITS
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#38bdf8' }}>
                {pkg.totalUnits || activeUnits.length}
              </div>
            </div>
            <div style={{ borderLeft: '1px solid #334155', borderRight: '1px solid #334155' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                TOTAL WEIGHT
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#4ade80' }}>
                {Number(pkg.totalWeight || 0).toFixed(1)} <span style={{ fontSize: 11 }}>KG</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                TOTAL LENGTH
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#c084fc' }}>
                {Number(pkg.totalLength || 0).toLocaleString()} <span style={{ fontSize: 11 }}>M</span>
              </div>
            </div>
          </div>

          {/* 2. Scanning Section (When Package is OPEN) */}
          {!isLocked ? (
            <div
              style={{
                background: '#1e293b',
                border: '1px solid #0284c7',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Space>
                  <ScanOutlined style={{ color: '#38bdf8', fontSize: 16 }} />
                  <Text strong style={{ color: '#f8fafc', fontSize: 13 }}>
                    Scan Production Unit QR
                  </Text>
                </Space>
                <Button
                  size="small"
                  type={cameraActive ? 'primary' : 'default'}
                  danger={cameraActive}
                  icon={<CameraOutlined />}
                  onClick={handleToggleCamera}
                >
                  {cameraActive ? 'Stop Camera' : 'Use Camera'}
                </Button>
              </div>

              {/* Live Camera Viewfinder */}
              <div
                id="dispatch-mobile-viewfinder"
                style={{
                  width: '100%',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#0f172a',
                  display: cameraActive ? 'block' : 'none',
                  marginBottom: cameraActive ? 10 : 0,
                  minHeight: cameraActive ? 220 : 0,
                }}
              />

              {/* Fast Barcode / Manual Input */}
              <form onSubmit={handleManualScanSubmit}>
                <Space style={{ width: '100%' }}>
                  <Input
                    ref={inputRef}
                    size="large"
                    placeholder="Scan coil QR or serial (PWI-PU-...)"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    disabled={scanLoading}
                    prefix={<ThunderboltOutlined style={{ color: '#38bdf8' }} />}
                    style={{
                      background: '#0f172a',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      borderRadius: 6,
                    }}
                  />
                  <Button
                    type="primary"
                    size="large"
                    htmlType="submit"
                    loading={scanLoading}
                    icon={<ScanOutlined />}
                    style={{ fontWeight: 700 }}
                  >
                    Add
                  </Button>
                </Space>
              </form>
            </div>
          ) : (
            <Alert
              type="info"
              showIcon
              icon={<LockOutlined />}
              message="Package Locked"
              description={`This package is ${pkg.status}. Modifying unit contents is restricted.`}
            />
          )}

          {/* 3. Real-Time Scan Flash Feedback Banner */}
          {flashFeedback && (
            <div
              style={{
                borderRadius: 8,
                padding: '10px 14px',
                background:
                  flashFeedback.type === 'success'
                    ? '#064e3b'
                    : flashFeedback.type === 'warning'
                    ? '#78350f'
                    : '#7f1d1d',
                border: `1px solid ${
                  flashFeedback.type === 'success'
                    ? '#10b981'
                    : flashFeedback.type === 'warning'
                    ? '#f59e0b'
                    : '#ef4444'
                }`,
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 900, fontSize: 13, letterSpacing: '0.04em' }}>
                  {flashFeedback.title}
                </span>
                <Button
                  size="small"
                  type="text"
                  icon={<CloseOutlined style={{ color: '#cbd5e1', fontSize: 11 }} />}
                  onClick={() => setFlashFeedback(null)}
                />
              </div>
              <div style={{ fontSize: 12, marginTop: 4, fontWeight: 600 }}>{flashFeedback.message}</div>
              {flashFeedback.unit && (
                <div style={{ fontSize: 11, color: '#a7f3d0', marginTop: 2 }}>
                  {flashFeedback.unit.item?.name || 'Unit'} &bull; Weight:{' '}
                  {Number(flashFeedback.unit.weightKg || 0).toFixed(2)} KG &bull; Length:{' '}
                  {Number(flashFeedback.unit.lengthMeters || 0).toFixed(0)} M
                </div>
              )}
            </div>
          )}

          {/* 4. Scanned Production Units List (Mobile Optimized Cards) */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text strong style={{ color: '#94a3b8', fontSize: 12, textTransform: 'uppercase' }}>
                Scanned Coils / Units ({activeUnits.length})
              </Text>
              <Text style={{ color: '#64748b', fontSize: 11 }}>
                Tap remove if scanned by mistake
              </Text>
            </div>

            {activeUnits.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  background: '#1e293b',
                  borderRadius: 8,
                  border: '1px dashed #334155',
                }}
              >
                <ScanOutlined style={{ fontSize: 32, color: '#475569', marginBottom: 8 }} />
                <div style={{ color: '#94a3b8', fontWeight: 600 }}>No Units Scanned Yet</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>
                  Scan a Production Unit QR code to start building this dispatch package
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeUnits.map((u, idx) => (
                  <div
                    key={u.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: 8,
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <Badge
                        count={activeUnits.length - idx}
                        style={{
                          backgroundColor: '#0284c7',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                      />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: 14 }}>
                            {u.productionUnit?.coilNo || 'Coil'}
                          </span>
                          <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>
                            {u.productionUnit?.unitSerialNo}
                          </span>
                        </div>
                        <div
                          style={{
                            color: '#94a3b8',
                            fontSize: 11,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 240,
                          }}
                        >
                          {u.productionUnit?.item?.name || 'Production Unit'}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'right' }}>
                      <div>
                        <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 13 }}>
                          {Number(u.productionUnit?.weightKg || 0).toFixed(2)} KG
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: 10 }}>
                          {Number(u.productionUnit?.lengthMeters || 0).toFixed(0)} M
                        </div>
                      </div>

                      {!isLocked && (
                        <Popconfirm
                          title="Remove unit from package?"
                          description={`Remove ${u.productionUnit?.coilNo || 'unit'}? It will remain untouched in inventory.`}
                          okText="Remove"
                          cancelText="Cancel"
                          okButtonProps={{ danger: true }}
                          onConfirm={() => handleRemoveUnit(u.id, u.productionUnit?.coilNo || 'unit')}
                        >
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            style={{ padding: '0 4px' }}
                          />
                        </Popconfirm>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Authoritative Finalize Confirmation Modal */}
      <Modal
        open={finalizeConfirmOpen}
        onCancel={() => setFinalizeConfirmOpen(false)}
        title={
          <Space>
            <LockOutlined style={{ color: '#10b981' }} />
            <span>Confirm Package Finalization</span>
          </Space>
        }
        footer={[
          <Button key="cancel" onClick={() => setFinalizeConfirmOpen(false)} disabled={finalizeLoading}>
            Cancel / Keep Scanning
          </Button>,
          <Button
            key="finalize"
            type="primary"
            style={{ background: '#10b981', borderColor: '#059669', fontWeight: 700 }}
            loading={finalizeLoading}
            onClick={handleConfirmFinalize}
          >
            Yes, Finalize &amp; Lock Package
          </Button>,
        ]}
      >
        <div style={{ padding: '8px 0' }}>
          <Alert
            type="warning"
            showIcon
            message="Package Finalization Locks Contents"
            description="Once finalized, units cannot be added or removed without authorization. Authoritative totals will be locked."
            style={{ marginBottom: 14 }}
          />

          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Package Number:</Text>
              <Text strong>{pkg?.packageNo}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Customer:</Text>
              <Text strong>{pkg?.customerName || 'N/A'}</Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Sales Order:</Text>
              <Text strong>{pkg?.salesOrderNo || 'N/A'}</Text>
            </div>
            <Divider style={{ margin: '8px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Total Units:</Text>
              <Text strong style={{ color: '#0284c7', fontSize: 16 }}>
                {activeUnits.length}
              </Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text type="secondary">Authoritative Weight:</Text>
              <Text strong style={{ color: '#15803d', fontSize: 16 }}>
                {Number(pkg?.totalWeight || 0).toFixed(2)} KG
              </Text>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Text type="secondary">Authoritative Length:</Text>
              <Text strong style={{ color: '#7e22ce', fontSize: 16 }}>
                {Number(pkg?.totalLength || 0).toLocaleString()} M
              </Text>
            </div>
          </div>
        </div>
      </Modal>

      {/* 6. Package Document / Label Print Modal */}
      <DispatchPackagePrintModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        pkg={pkg}
        onPrintRecorded={() => {
          if (pkg) fetchPackage(pkg.id);
        }}
      />
    </Drawer>
  );
};
