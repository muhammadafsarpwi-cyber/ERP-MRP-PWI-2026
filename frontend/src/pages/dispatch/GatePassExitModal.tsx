import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Space,
  Typography,
  Input,
  Form,
  Alert,
  Tag,
  Descriptions,
  Divider,
  notification,
  Select,
  Card,
  Spin,
} from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  ScanOutlined,
  SafetyCertificateOutlined,
  BarcodeOutlined,
  EnvironmentOutlined,
  ThunderboltOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import {
  DispatchPackage,
  DispatchPackageStatus,
  dispatchPackageService,
} from '../../services/dispatchPackageService';
import { apiService } from '../../services/api';

const { Title, Text } = Typography;

interface GatePassExitModalProps {
  open: boolean;
  onClose: () => void;
  pkg?: DispatchPackage | null;
  onPackageUpdated?: (pkg: DispatchPackage) => void;
  gateScanMode?: boolean; // When true, starts with Package QR scan input for Gate Security Guard
}

export const GatePassExitModal: React.FC<GatePassExitModalProps> = ({
  open,
  onClose,
  pkg: initialPkg,
  onPackageUpdated,
  gateScanMode = false,
}) => {
  const [activePkg, setActivePkg] = useState<DispatchPackage | null>(initialPkg || null);
  const [loading, setLoading] = useState(false);
  const [gateQrInput, setGateQrInput] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [exitLoading, setExitLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [cameraActive, setCameraActive] = useState(false);
  const html5QrCodeRef = React.useRef<any>(null);

  const [form] = Form.useForm();

  // Load existing sales deliveries / gate passes for dropdown
  useEffect(() => {
    if (open) {
      apiService
        .get<{ data: any[] }>('/sales/deliveries', { limit: 50 })
        .then((res) => {
          if (Array.isArray(res.data)) {
            setDeliveries(res.data);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    setActivePkg(initialPkg || null);
    if (initialPkg) {
      form.setFieldsValue({
        gatePassNo: initialPkg.gatePassNo || '',
        vehicleNo: initialPkg.vehicleNo || '',
        driverName: initialPkg.driverName || '',
        salesDeliveryId: initialPkg.salesDeliveryId || undefined,
        remarks: initialPkg.remarks || '',
      });
    } else {
      form.resetFields();
      setGateQrInput('');
    }
  }, [initialPkg, open, form]);

  // Gate Scan Verification
  const handleVerifyPackageQr = async (targetCode?: string) => {
    const query = (targetCode || gateQrInput).trim();
    if (!query) return;

    setVerifyLoading(true);
    try {
      const res = await dispatchPackageService.gateVerify(query);
      setActivePkg(res.data);
      form.setFieldsValue({
        gatePassNo: res.data.gatePassNo || '',
        vehicleNo: res.data.vehicleNo || '',
        driverName: res.data.driverName || '',
        salesDeliveryId: res.data.salesDeliveryId || undefined,
      });
      stopCameraScanner();
      notification.success({
        message: 'Package Verified at Gate',
        description: `Package ${res.data.packageNo} verified. Ready for authorized exit.`,
      });
    } catch (err: any) {
      notification.error({
        message: 'Gate Verification Failed',
        description: err?.response?.data?.message || err?.message || 'Package not found',
      });
    } finally {
      setVerifyLoading(false);
    }
  };

  const startCameraScanner = async (facing: 'environment' | 'user' = 'environment') => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      notification.error({
        message: 'Camera Requires Secure Context (HTTPS)',
        description: 'Mobile camera requires HTTPS or localhost. Please type the package number below.',
      });
      return;
    }
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (html5QrCodeRef.current) {
        await stopCameraScanner();
      }
      const scanner = new Html5Qrcode('gate-pass-mobile-viewfinder');
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
          handleVerifyPackageQr(decodedText);
        },
        () => {}
      );
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('Overconstrained') && facing === 'environment') {
        return startCameraScanner('user');
      }
      setCameraActive(false);
      notification.warning({
        message: 'Camera Scanner Unavailable',
        description: msg || 'Please use manual input.',
      });
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

  useEffect(() => {
    return () => {
      stopCameraScanner();
    };
  }, []);

  // Save / Link Gate Pass metadata
  const handleSaveGatePassLinkage = async (values: any) => {
    if (!activePkg) return;
    setLoading(true);
    try {
      const res = await dispatchPackageService.linkGatePass(activePkg.id, values);
      setActivePkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);
      notification.success({
        message: 'Gate Pass Linked',
        description: `Package ${activePkg.packageNo} successfully linked to Gate Pass ${values.gatePassNo || ''}`,
      });
    } catch (err: any) {
      notification.error({
        message: 'Failed to link Gate Pass',
        description: err?.message || 'Error occurred',
      });
    } finally {
      setLoading(false);
    }
  };

  // Final Gate Exit Confirmation
  const handleConfirmGateExit = async () => {
    if (!activePkg) return;
    setExitLoading(true);
    try {
      const values = form.getFieldsValue();
      const res = await dispatchPackageService.gateExit(activePkg.id, values);
      setActivePkg(res.data);
      if (onPackageUpdated) onPackageUpdated(res.data);
      notification.success({
        message: 'Factory Exit Authorized',
        description: `Package ${activePkg.packageNo} has officially EXITED the factory and marked DISPATCHED!`,
      });
      onClose();
    } catch (err: any) {
      notification.error({
        message: 'Gate Exit Authorization Failed',
        description: err?.response?.data?.message || err?.message || 'Could not authorize factory exit',
      });
    } finally {
      setExitLoading(false);
    }
  };

  const isDispatched = activePkg?.status === DispatchPackageStatus.DISPATCHED;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={640}
      title={
        <Space>
          <CarOutlined style={{ color: '#8b5cf6', fontSize: 18 }} />
          <span>Gate Pass &amp; Factory Exit Verification</span>
        </Space>
      }
      footer={null}
    >
      <div style={{ padding: '8px 0' }}>
        {/* If Gate Scan Mode or no active package loaded, show scan lookup first */}
        {(!activePkg || gateScanMode) && (
          <div
            style={{
              background: 'var(--theme-surface-alt, #f8fafc)',
              border: '1px solid var(--theme-border, #e2e8f0)',
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text strong>
                Scan Package QR at Gate:
              </Text>
              <Button
                size="small"
                type={cameraActive ? 'primary' : 'default'}
                danger={cameraActive}
                icon={<CameraOutlined />}
                onClick={() => (cameraActive ? stopCameraScanner() : startCameraScanner())}
              >
                {cameraActive ? 'Stop Camera' : 'Use Camera'}
              </Button>
            </div>

            <div
              id="gate-pass-mobile-viewfinder"
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

            <Space style={{ width: '100%' }}>
              <Input
                size="large"
                placeholder="Scan or enter Package QR (e.g. PKG-2026000001)"
                value={gateQrInput}
                onChange={(e) => setGateQrInput(e.target.value)}
                onPressEnter={() => handleVerifyPackageQr()}
                prefix={<ScanOutlined style={{ color: '#8b5cf6' }} />}
              />
              <Button
                type="primary"
                size="large"
                loading={verifyLoading}
                onClick={() => handleVerifyPackageQr()}
                style={{ background: '#8b5cf6', borderColor: '#7c3aed' }}
              >
                Verify QR
              </Button>
            </Space>
          </div>
        )}

        {/* Package Verified Card */}
        {activePkg && (
          <div>
            <Card
              size="small"
              style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <Title level={5} style={{ margin: 0, color: '#0f172a' }}>
                    {activePkg.packageNo}
                  </Title>
                  <Text type="secondary">{activePkg.customerName || 'Standard Customer'}</Text>
                </div>
                <Tag
                  color={
                    activePkg.status === DispatchPackageStatus.DISPATCHED
                      ? 'purple'
                      : activePkg.status === DispatchPackageStatus.FINALIZED
                      ? 'green'
                      : 'blue'
                  }
                  style={{ fontSize: 13, padding: '2px 8px' }}
                >
                  {activePkg.status}
                </Tag>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 8,
                  background: '#ffffff',
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>UNITS</div>
                  <div style={{ fontWeight: 800, color: '#0284c7' }}>{activePkg.totalUnits}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>TOTAL WEIGHT</div>
                  <div style={{ fontWeight: 800, color: '#15803d' }}>
                    {Number(activePkg.totalWeight || 0).toFixed(2)} KG
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>TOTAL LENGTH</div>
                  <div style={{ fontWeight: 800, color: '#7e22ce' }}>
                    {Number(activePkg.totalLength || 0).toLocaleString()} M
                  </div>
                </div>
              </div>
            </Card>

            {isDispatched ? (
              <Alert
                type="success"
                showIcon
                icon={<CheckCircleOutlined />}
                message="Package Dispatched &amp; Exited Factory"
                description={`Dispatched at: ${activePkg.dispatchedAt ? new Date(activePkg.dispatchedAt).toLocaleString() : 'Done'} by ${activePkg.dispatchedBy || 'Authorized Officer'}. Gate Pass: ${activePkg.gatePassNo || 'N/A'}, Vehicle: ${activePkg.vehicleNo || 'N/A'}`}
              />
            ) : (
              <Form form={form} layout="vertical" onFinish={handleSaveGatePassLinkage}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item name="gatePassNo" label="Outward Gate Pass No / Delivery Note">
                    <Input placeholder="e.g. GP-2026-0001 or DN-0001" />
                  </Form.Item>

                  <Form.Item name="salesDeliveryId" label="Link Existing Sales Delivery">
                    <Select
                      placeholder="Select Sales Delivery (Optional)"
                      allowClear
                      onChange={(val) => {
                        const d = deliveries.find((x) => x.id === val);
                        if (d) {
                          form.setFieldsValue({
                            gatePassNo: d.deliveryNumber || '',
                            vehicleNo: d.carrier || form.getFieldValue('vehicleNo'),
                          });
                        }
                      }}
                    >
                      {deliveries.map((d) => (
                        <Select.Option key={d.id} value={d.id}>
                          {d.deliveryNumber} &bull; {d.customer?.name || 'Customer'}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Form.Item name="vehicleNo" label="Vehicle No / Carrier">
                    <Input placeholder="e.g. LEA-1234" prefix={<CarOutlined />} />
                  </Form.Item>

                  <Form.Item name="driverName" label="Driver Name / Phone">
                    <Input placeholder="e.g. Muhammad Akram" />
                  </Form.Item>
                </div>

                <Form.Item name="remarks" label="Exit / Security Remarks">
                  <Input.TextArea rows={2} placeholder="Optional gate security or dispatch notes..." />
                </Form.Item>

                <Divider style={{ margin: '12px 0' }} />

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <Button onClick={onClose}>Close</Button>
                  <Button htmlType="submit" loading={loading}>
                    Save Linkage
                  </Button>
                  <Button
                    type="primary"
                    icon={<SafetyCertificateOutlined />}
                    style={{ background: '#059669', borderColor: '#047857', fontWeight: 700 }}
                    loading={exitLoading}
                    onClick={handleConfirmGateExit}
                  >
                    Confirm Factory Exit / Mark Exited
                  </Button>
                </div>
              </Form>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
