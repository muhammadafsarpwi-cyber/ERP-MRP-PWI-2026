import React, { useState, useEffect } from 'react';
import { Card, Typography, Input, Button, Space, Alert, Result, Tag, Divider } from 'antd';
import { ScanOutlined, SearchOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import BarcodeScanner from '../../components/shared/BarcodeScanner';
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
    if (!barcodeValue.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      const res = await apiService.get<{ success: boolean; data: BarcodeRecord }>(
        `/barcode-management/lookup/${encodeURIComponent(barcodeValue.trim())}`
      );
      if (res.success && res.data) {
        setResult(res.data);
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

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <ScanOutlined style={{ marginRight: 8 }} />
          Scan Barcode
        </Title>
        <Text type="secondary">Scan or enter a barcode to look up any ERP entity</Text>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              size="large"
              placeholder="Enter or paste barcode value..."
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
              Scan
            </Button>
          </div>
        </Space>
      </Card>

      {error && (
        <Alert
          type="warning"
          showIcon
          message="Barcode Not Found"
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
            title="Barcode Resolved"
            subTitle={`Found ${ENTITY_TYPE_LABELS[result.entityType]}: ${result.entityCode || result.entityLabel || result.barcodeValue}`}
            extra={[
              <Button type="primary" key="navigate" onClick={handleNavigateToEntity}>
                Open {ENTITY_TYPE_LABELS[result.entityType]} <ArrowRightOutlined />
              </Button>,
              <Button key="scan-another" onClick={() => { setResult(null); setSearchValue(''); }}>
                Scan Another
              </Button>,
            ]}
          >
            <div
              style={{
                textAlign: 'left',
                background: 'var(--theme-bg-secondary, #fafafa)',
                padding: 16,
                borderRadius: 8,
              }}
            >
              <Space direction="vertical" size="small">
                <div><Text strong>Barcode:</Text> <Text code>{result.barcodeValue}</Text></div>
                <div><Text strong>Type:</Text> <Tag color="blue">{ENTITY_TYPE_LABELS[result.entityType]}</Tag></div>
                {result.entityCode && <div><Text strong>Code:</Text> <Text>{result.entityCode}</Text></div>}
                {result.entityLabel && <div><Text strong>Name:</Text> <Text>{result.entityLabel}</Text></div>}
                <div><Text strong>Status:</Text> <Tag color={result.status === 'ACTIVE' ? 'green' : 'red'}>{result.status}</Tag></div>
              </Space>
            </div>
          </Result>
        </Card>
      )}

      {!result && !error && (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <ScanOutlined style={{ fontSize: 48, color: 'var(--theme-text-tertiary, #d9d9d9)', marginBottom: 16 }} />
            <div>
              <Text type="secondary">
                Scan a barcode with your camera or enter a barcode value to look up any entity in the ERP system.
              </Text>
            </div>
            <Divider />
            <div style={{ textAlign: 'left', maxWidth: 400, margin: '0 auto' }}>
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

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan ERP Barcode"
      />
    </div>
  );
};

export default ScanBarcode;
