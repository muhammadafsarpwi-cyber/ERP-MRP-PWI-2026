import React, { useState } from 'react';
import {
  Modal,
  Button,
  Space,
  Typography,
  Select,
  InputNumber,
  Row,
  Col,
  Tag,
  Alert,
  message,
} from 'antd';
import {
  PrinterOutlined,
  SettingOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { ProductionUnitItem, productionUnitService } from '../../../services/productionUnitService';
import {
  ProductionUnitLabelCard,
  LABEL_PRESETS,
  printProductionUnitLabels,
} from './ProductionUnitLabel';

const { Text } = Typography;

interface ProductionUnitBulkPrintModalProps {
  open: boolean;
  onClose: () => void;
  units: ProductionUnitItem[];
  onPrinted?: (updatedUnits: ProductionUnitItem[]) => void;
}

export const ProductionUnitBulkPrintModal: React.FC<ProductionUnitBulkPrintModalProps> = ({
  open,
  onClose,
  units,
  onPrinted,
}) => {
  const [template, setTemplate] = useState<string>('PVC_COIL');
  const [dimensionPreset, setDimensionPreset] = useState<string>('ROLL_100x50');
  const [customWidthMm, setCustomWidthMm] = useState<number>(100);
  const [customHeightMm, setCustomHeightMm] = useState<number>(50);
  const [copies, setCopies] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const selectedPreset = LABEL_PRESETS[dimensionPreset] || LABEL_PRESETS.ROLL_100x50;
  const isSheet = selectedPreset.mode === 'sheet';

  const handlePrint = async () => {
    if (!units.length) return;
    setIsPrinting(true);

    try {
      // 1. Call backend to record print action in audit history
      const unitIds = units.map((u) => u.id);
      const res = await productionUnitService.recordPrint({
        unitIds,
        copies,
        labelTemplate: template,
        printerName: 'Default System Printer',
      });

      message.success(`Registered print job: ${res.printJobId} (${units.length * copies} label instances)`);

      // 2. Launch pure, isolated iframe print dialog
      printProductionUnitLabels({
        units,
        template,
        presetKey: dimensionPreset,
        customWidthMm,
        customHeightMm,
        copies,
      });

      if (onPrinted && res.data) {
        onPrinted(res.data);
      }
    } catch (err: any) {
      const rawMsg = err?.response?.data?.message || err?.message || 'Failed to record print job';
      const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
      message.error(msg);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={940}
      title={
        <Space>
          <PrinterOutlined style={{ color: '#10b981' }} />
          <span>Production Unit Label Bulk Printing ({units.length} Units Selected)</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="print"
          type="primary"
          icon={<PrinterOutlined />}
          loading={isPrinting}
          onClick={handlePrint}
          style={{ background: '#16a34a', borderColor: '#16a34a' }}
        >
          Print {units.length * copies} Label{units.length * copies > 1 ? 's' : ''} Now
        </Button>,
      ]}
      style={{ top: 20 }}
      destroyOnClose={false}
    >
      {/* Configuration Header */}
      <div
        style={{
          background: 'var(--theme-surface-alt, #f8fafc)',
          padding: '12px 16px',
          borderRadius: 8,
          marginBottom: 16,
          border: '1px solid var(--theme-border, #e2e8f0)',
        }}
      >
        <Row gutter={[16, 12]} align="middle">
          {/* Template Selection */}
          <Col xs={24} sm={7}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Label Template
            </Text>
            <Select
              style={{ width: '100%' }}
              value={template}
              onChange={setTemplate}
              options={[
                { value: 'PVC_COIL', label: 'PVC Coil Label (Standard)' },
                { value: 'CABLE_COIL', label: 'Cable Coil / Reel Label' },
                { value: 'SPOKE_LABEL', label: 'Spoke / Core Wire Label' },
                { value: 'FINISHED_PRODUCT', label: 'Finished Goods Box Label' },
              ]}
            />
          </Col>

          {/* Physical Media / Dimensions Preset */}
          <Col xs={24} sm={8}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Label Media / Dimensions
            </Text>
            <Select
              style={{ width: '100%' }}
              value={dimensionPreset}
              onChange={setDimensionPreset}
              options={Object.entries(LABEL_PRESETS).map(([key, val]) => ({
                value: key,
                label: val.label,
              }))}
            />
          </Col>

          {/* Copies */}
          <Col xs={12} sm={4}>
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
              Copies / Unit
            </Text>
            <InputNumber
              min={1}
              max={10}
              value={copies}
              onChange={(v) => setCopies(v || 1)}
              style={{ width: '100%' }}
            />
          </Col>

          {/* Total Badge */}
          <Col xs={12} sm={5}>
            <div style={{ textAlign: 'right', paddingTop: 16 }}>
              <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px', borderRadius: 4 }}>
                Total: <strong>{units.length * copies}</strong> Labels
              </Tag>
            </div>
          </Col>
        </Row>

        {/* Custom Dimensions Row (if Custom selected) */}
        {dimensionPreset === 'CUSTOM' && (
          <Row gutter={[16, 8]} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #cbd5e1' }} align="middle">
            <Col xs={24} sm={4}>
              <Text strong style={{ fontSize: 12 }}>
                <SettingOutlined /> Custom Size:
              </Text>
            </Col>
            <Col xs={12} sm={5}>
              <Space>
                <Text style={{ fontSize: 12 }}>Width (mm):</Text>
                <InputNumber
                  min={30}
                  max={300}
                  value={customWidthMm}
                  onChange={(v) => setCustomWidthMm(v || 100)}
                  style={{ width: 85 }}
                />
              </Space>
            </Col>
            <Col xs={12} sm={5}>
              <Space>
                <Text style={{ fontSize: 12 }}>Height (mm):</Text>
                <InputNumber
                  min={20}
                  max={300}
                  value={customHeightMm}
                  onChange={(v) => setCustomHeightMm(v || 50)}
                  style={{ width: 85 }}
                />
              </Space>
            </Col>
            <Col xs={24} sm={10}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Applied to @page size for direct thermal roll or sticker printing.
              </Text>
            </Col>
          </Row>
        )}
      </div>

      {/* Info Banner */}
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          <strong>Print Preview:</strong> Showing {units.length} unit label{units.length > 1 ? 's' : ''} (isolated from ERP navigation header).
        </Text>
        <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>
          <CheckCircleOutlined /> Direct Vector QR & Code 128 Barcode Enabled
        </span>
      </div>

      {/* Scrollable WYSIWYG Label Previews */}
      <div
        id="pwi-modal-label-preview-container"
        style={{
          maxHeight: '56vh',
          overflowY: 'auto',
          padding: '16px',
          background: '#334155',
          borderRadius: 8,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              dimensionPreset === 'SHEET_A4_3COL'
                ? 'repeat(3, 1fr)'
                : isSheet
                ? 'repeat(2, 1fr)'
                : '1fr',
            gap: 16,
          }}
        >
          {units.map((unit) => (
            <div key={unit.id} style={{ display: 'flex', justifyContent: 'center' }}>
              <ProductionUnitLabelCard unit={unit} template={template} />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default ProductionUnitBulkPrintModal;
