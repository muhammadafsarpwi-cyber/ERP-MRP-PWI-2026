import React, { useState, useEffect } from 'react';
import { Card, Typography, Input, Button, Space, Alert, Result, Tag, Divider, QRCode, Row, Col } from 'antd';
import {
  ScanOutlined,
  SearchOutlined,
  ArrowRightOutlined,
  ToolOutlined,
  PrinterOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import BarcodeScanner from '../../components/shared/BarcodeScanner';
import BarcodePrint from '../../components/shared/BarcodePrint';
import ScannedMachineHistoryModal from './ScannedMachineHistoryModal';
import { apiService } from '../../services/api';
import { BarcodeRecord, ENTITY_TYPE_LABELS, ENTITY_TYPE_ROUTES, BarcodeEntityType } from './types';

const { Title, Text } = Typography;

const ScanBarcode: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [result, setResult] = useState<BarcodeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [machineModalOpen, setMachineModalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => {
    const state = location.state as any;
    if (state?.barcode) {
      setSearchValue(state.barcode);
      lookupBarcode(state.barcode);
    } else if (state?.entityId && state?.entityType) {
      const fakeResult: BarcodeRecord = {
        id: '',
        companyId: '',
        barcodeValue: state.barcode || '',
        entityType: state.entityType,
        entityId: state.entityId,
        barcodeLabel: null,
        entityLabel: state.entityLabel,
        entityCode: state.entityCode,
        status: 'ACTIVE' as any,
        isPrimary: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setResult(fakeResult);
    }
  }, [location.state]);

  const lookupBarcode = async (barcodeValue: string) => {
    if (!barcodeValue || !barcodeValue.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const res = await apiService.get<{ success: boolean; data: BarcodeRecord }>(
        `/barcode-management/lookup/${encodeURIComponent(barcodeValue.trim())}`
      );
      if (res && (res.success || res.data)) {
        setResult(res.data || (res as any));
      } else {
        setError(`Barcode "${barcodeValue}" not found`);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        setError(`Barcode "${barcodeValue}" not found in the system`);
      } else {
        setError('Failed to look up barcode. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleScan = (barcode: string) => {
    setSearchValue(barcode);
    lookupBarcode(barcode);
  };

  const handleSearch = () => {
    lookupBarcode(searchValue);
  };

  const handleNavigateToEntity = () => {
    if (!result) return;
    const route = ENTITY_TYPE_ROUTES[result.entityType];
    if (route) {
      navigate(route, {
        state: {
          entityId: result.entityId,
          entityLabel: result.entityLabel,
          entityCode: result.entityCode,
          openBarcode: true,
        },
      });
    }
  };

  const isMachine = result?.entityType === BarcodeEntityType.MACHINE || (result?.entityType as any) === 'MACHINE';

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ScanOutlined style={{ marginRight: 8 }} />
          Scan Barcode & QR Code
        </Title>
        <Text type="secondary">Scan or enter any Barcode / QR Code to look up ERP records and full machine history</Text>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              size="large"
              placeholder="Enter or paste Barcode / QR code value..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined />}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              size="large"
              onClick={handleSearch}
              loading={loading}
              icon={<SearchOutlined />}
            >
              Lookup
            </Button>
            <Button
              size="large"
              onClick={() => setScannerOpen(true)}
              icon={<ScanOutlined />}
            >
              Scan with Camera
            </Button>
          </div>
        </Space>
      </Card>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="Code Not Found"
          description={error}
          style={{ marginBottom: 16 }}
          closable
          onClose={() => setError(null)}
        />
      )}

      {result && (
        <Card>
          <Result
            status="success"
            title="Barcode / QR Code Resolved"
            subTitle={`Found ${ENTITY_TYPE_LABELS[result.entityType] || result.entityType}: ${result.entityCode || result.entityLabel || result.barcodeValue}`}
            extra={[
              isMachine && (
                <Button
                  type="primary"
                  key="machine-history"
                  icon={<ToolOutlined />}
                  style={{ background: '#722ed1', borderColor: '#722ed1' }}
                  onClick={() => setMachineModalOpen(true)}
                >
                  View Machine Lifecycle History
                </Button>
              ),
              <Button type="default" key="print" icon={<PrinterOutlined />} onClick={() => setPrintOpen(true)}>
                Print Label
              </Button>,
              <Button type="primary" key="navigate" onClick={handleNavigateToEntity}>
                Open {ENTITY_TYPE_LABELS[result.entityType] || result.entityType} <ArrowRightOutlined />
              </Button>,
              <Button key="scan-another" onClick={() => { setResult(null); setSearchValue(''); }}>
                Scan Another
              </Button>,
            ].filter(Boolean)}
          >
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col xs={24} md={16}>
                <div
                  style={{
                    textAlign: 'left',
                    background: 'var(--theme-bg-secondary, #fafafa)',
                    padding: 16,
                    borderRadius: 8,
                    height: '100%',
                  }}
                >
                  <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <div><Text strong>Scanned Code:</Text> <Text code style={{ fontSize: 13 }}>{result.barcodeValue}</Text></div>
                    <div><Text strong>Entity Type:</Text> <Tag color="blue">{ENTITY_TYPE_LABELS[result.entityType] || result.entityType}</Tag></div>
                    {result.entityCode && <div><Text strong>Entity Code:</Text> <Text strong>{result.entityCode}</Text></div>}
                    {result.entityLabel && <div><Text strong>Name / Label:</Text> <Text>{result.entityLabel}</Text></div>}
                    <div><Text strong>Status:</Text> <Tag color={result.status === 'ACTIVE' ? 'green' : 'red'}>{result.status}</Tag></div>
                    {isMachine && (
                      <Alert
                        type="info"
                        showIcon
                        message="Machine History Available"
                        description="Click 'View Machine Lifecycle History' to inspect all maintenance job cards, replaced parts/tooling, and daily production entries."
                        style={{ marginTop: 12 }}
                      />
                    )}
                  </Space>
                </div>
              </Col>

              <Col xs={24} md={8}>
                <div
                  style={{
                    textAlign: 'center',
                    background: 'var(--theme-bg-secondary, #fafafa)',
                    padding: 16,
                    borderRadius: 8,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    height: '100%',
                  }}
                >
                  <Text strong style={{ fontSize: 12 }}>
                    <QrcodeOutlined style={{ marginRight: 6 }} />
                    QR Code Preview
                  </Text>
                  <QRCode value={result.barcodeValue} size={110} />
                  <Text code style={{ fontSize: 11 }}>{result.barcodeValue}</Text>
                </div>
              </Col>
            </Row>
          </Result>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <ScanOutlined style={{ fontSize: 48, color: 'var(--theme-text-tertiary, #d9d9d9)', marginBottom: 16 }} />
            <div>
              <Text type="secondary">
                Scan a barcode or QR code with your camera (or upload an image) to look up any entity and complete machine history.
              </Text>
            </div>
            <Divider />
            <div style={{ textAlign: 'left', maxWidth: 450, margin: '0 auto' }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>Supported Entities:</Text>
              <Space wrap size={[8, 4]}>
                {Object.values(BarcodeEntityType).map((type) => (
                  <Tag key={type} style={{ margin: 0 }}>{ENTITY_TYPE_LABELS[type]}</Tag>
                ))}
              </Space>
            </div>
          </div>
        </Card>
      )}

      {/* Camera / Photo Scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan ERP Barcode / QR Code"
      />

      {/* Machine Lifecycle History Modal */}
      {isMachine && result && (
        <ScannedMachineHistoryModal
          open={machineModalOpen}
          onClose={() => setMachineModalOpen(false)}
          machineId={result.entityId}
          machineCode={result.entityCode || undefined}
          barcodeValue={result.barcodeValue}
        />
      )}

      {/* Print Modal */}
      {result && (
        <BarcodePrint
          open={printOpen}
          onClose={() => setPrintOpen(false)}
          itemCode={result.entityCode || result.entityId}
          itemName={result.entityLabel || ENTITY_TYPE_LABELS[result.entityType]}
          barcode={result.barcodeValue}
          initialFormat="BOTH"
        />
      )}
    </div>
  );
};

export default ScanBarcode;

