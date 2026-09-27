import React, { useState } from 'react';
import {
  Modal,
  Input,
  Button,
  Descriptions,
  Tag,
  Space,
  Typography,
  Alert,
  Spin,
  QRCode,
} from 'antd';
import {
  ScanOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import {
  ProductionUnitItem,
  productionUnitService,
  ProductionUnitStatus,
} from '../../../services/productionUnitService';

const { Text } = Typography;

interface ProductionUnitScanModalProps {
  open: boolean;
  onClose: () => void;
  onPrintSingle?: (unit: ProductionUnitItem) => void;
}

export const ProductionUnitScanModal: React.FC<ProductionUnitScanModalProps> = ({
  open,
  onClose,
  onPrintSingle,
}) => {
  const [payload, setPayload] = useState('');
  const [loading, setLoading] = useState(false);
  const [unit, setUnit] = useState<ProductionUnitItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!payload.trim()) return;
    setLoading(true);
    setError(null);
    setUnit(null);

    try {
      const res = await productionUnitService.scanLookup(payload.trim());
      setUnit(res.data);
    } catch (err: any) {
      setError(err?.message || `No production unit found for barcode/serial "${payload}"`);
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (st: ProductionUnitStatus) => {
    switch (st) {
      case ProductionUnitStatus.PRINTED:
        return 'green';
      case ProductionUnitStatus.GENERATED:
        return 'blue';
      case ProductionUnitStatus.VOID:
      case ProductionUnitStatus.CANCELLED:
        return 'red';
      case ProductionUnitStatus.USED:
        return 'purple';
      default:
        return 'default';
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={680}
      title={
        <Space>
          <ScanOutlined style={{ color: 'var(--theme-primary)' }} />
          <span>Scan Production Unit QR / Barcode</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        unit && onPrintSingle && (
          <Button
            key="reprint"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => onPrintSingle(unit)}
          >
            Print / Reprint Label
          </Button>
        ),
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Input.Search
          autoFocus
          placeholder="Scan barcode, QR code or enter serial number (e.g. PWI-PU-2026000001)..."
          enterButton={
            <Button type="primary" icon={<SearchOutlined />}>
              Lookup
            </Button>
          }
          size="large"
          value={payload}
          onChange={(e) => setPayload(e.target.value)}
          onSearch={handleSearch}
          loading={loading}
        />
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin size="large" />
          <div style={{ marginTop: 8 }}>Searching production unit registry...</div>
        </div>
      )}

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />}

      {unit && !loading && (
        <div
          style={{
            background: 'var(--theme-surface-alt, #f8fafc)',
            padding: 16,
            borderRadius: 8,
            border: '1px solid var(--theme-border, #e2e8f0)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <div>
              <Text strong style={{ fontSize: 18, color: '#1d4ed8' }}>
                {unit.coilNo}
              </Text>{' '}
              <Tag color={statusColor(unit.status)} style={{ marginLeft: 8 }}>
                {unit.status}
              </Tag>
              {unit.printCount > 0 ? (
                <Tag color="cyan">Printed ({unit.printCount}x)</Tag>
              ) : (
                <Tag color="orange">Not Yet Printed</Tag>
              )}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <QRCode value={unit.qrPayload} size={70} bordered={false} />
              <div style={{ fontSize: 9, fontFamily: 'monospace', color: '#64748b', marginTop: 2 }}>{unit.unitSerialNo}</div>
            </div>
          </div>

          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="Serial No">
              <Text code strong copyable>
                {unit.unitSerialNo}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="Item">
              <strong>{unit.item?.name}</strong> ({unit.item?.itemCode})
            </Descriptions.Item>
            <Descriptions.Item label="Coil Weight (Kg)">
              <strong style={{ fontSize: 15, color: '#b45309' }}>
                {unit.weightKg != null ? `${Number(unit.weightKg).toFixed(2)} KG` : 'Not entered'}
              </strong>
            </Descriptions.Item>
            <Descriptions.Item label="Length (M)">
              {unit.lengthMeters ? `${unit.lengthMeters} M` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Production Batch">
              {unit.batchNo || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="PVC Batch #">
              {unit.pvcBatchNo || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Production Date">
              {unit.productionDate}
            </Descriptions.Item>
            <Descriptions.Item label="Shift / Machine">
              {unit.shiftName || '—'} / {unit.machineNo || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Operator">
              {unit.operatorName || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Spark Test (S.T.)">
              {unit.stValue || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Joints">
              {unit.jointCount != null ? unit.jointCount : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="First Printed">
              {unit.firstPrintedAt ? new Date(unit.firstPrintedAt).toLocaleString() : 'Never'}
            </Descriptions.Item>
            {unit.productionEntryId && (
              <Descriptions.Item label="Source Production Entry" span={2}>
                <a href={`#/production/entries/${unit.productionEntryId}`} target="_blank" rel="noreferrer">
                  View Production Entry Batch ↗
                </a>
              </Descriptions.Item>
            )}
            {unit.voidReason && (
              <Descriptions.Item label="Void Reason" span={2}>
                <Text type="danger">{unit.voidReason}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        </div>
      )}
    </Modal>
  );
};

export default ProductionUnitScanModal;
