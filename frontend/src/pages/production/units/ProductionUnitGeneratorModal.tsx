import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  InputNumber,
  DatePicker,
  Select,
  Row,
  Col,
  Button,
  Space,
  Typography,
  Divider,
  Alert,
  message,
  Tag,
} from 'antd';
import {
  BuildOutlined,
  QrcodeOutlined,
  BarcodeOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { apiService } from '../../../services/api';
import {
  productionUnitService,
  ProductionUnitCodeType,
  ProductionUnitItem,
} from '../../../services/productionUnitService';

const { Text } = Typography;

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  baseUom?: { id: string; code: string };
}

interface ProductionUnitGeneratorModalProps {
  open: boolean;
  onClose: () => void;
  productionEntryId?: string | null;
  initialItem?: { id: string; itemCode: string; name: string } | null;
  initialValues?: {
    batchNo?: string;
    pvcBatchNo?: string;
    shiftName?: string;
    operatorName?: string;
    machineNo?: string;
    lengthMeters?: number;
    productionDate?: string;
  };
  onGenerated: (units: ProductionUnitItem[]) => void;
}

export const ProductionUnitGeneratorModal: React.FC<ProductionUnitGeneratorModalProps> = ({
  open,
  onClose,
  productionEntryId,
  initialItem,
  initialValues,
  onGenerated,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);

  // Watch fields for live preview
  const quantity = Form.useWatch('quantity', form) || 1;
  const prefix = Form.useWatch('coilPrefix', form) || 'CN';

  // Load items if not pre-provided
  useEffect(() => {
    if (open && !initialItem) {
      setItemsLoading(true);
      apiService
        .get<any>('/master-data/items', { limit: 100, is_active: true })
        .then((res) => {
          const list = res.data || res || [];
          setItems(Array.isArray(list) ? list : []);
        })
        .catch(() => setItems([]))
        .finally(() => setItemsLoading(false));
    }
  }, [open, initialItem]);

  // Set initial form values
  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        itemId: initialItem?.id,
        productionDate: initialValues?.productionDate ? dayjs(initialValues.productionDate) : dayjs(),
        quantity: 10,
        coilPrefix: 'CN',
        batchNo: initialValues?.batchNo || '01',
        pvcBatchNo: initialValues?.pvcBatchNo || '28',
        shiftName: initialValues?.shiftName || 'Shift A',
        operatorName: initialValues?.operatorName || 'Yousuf / Amir',
        machineNo: initialValues?.machineNo || 'EXT-01',
        lengthMeters: initialValues?.lengthMeters || 250,
        codeType: ProductionUnitCodeType.QR_BARCODE,
        labelTemplate: 'PVC_COIL',
      });
    }
  }, [open, initialItem, initialValues, form]);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      const payload: any = {
        itemId: values.itemId,
        productionDate: dayjs(values.productionDate).format('YYYY-MM-DD'),
        quantity: Number(values.quantity),
        coilPrefix: values.coilPrefix || 'CN',
        codeType: values.codeType || ProductionUnitCodeType.QR_BARCODE,
        labelTemplate: values.labelTemplate || 'PVC_COIL',
      };
      if (productionEntryId) payload.productionEntryId = productionEntryId;
      if (values.batchNo) payload.batchNo = values.batchNo;
      if (values.pvcBatchNo) payload.pvcBatchNo = values.pvcBatchNo;
      if (values.shiftName) payload.shiftName = values.shiftName;
      if (values.operatorName) payload.operatorName = values.operatorName;
      if (values.machineNo) payload.machineNo = values.machineNo;
      if (values.lengthMeters) payload.lengthMeters = Number(values.lengthMeters);

      const res = await productionUnitService.generate(payload);
      message.success(`Successfully generated ${res.count} production units with unique QR & Barcodes!`);
      onGenerated(res.data);
      onClose();
    } catch (err: any) {
      if (err?.errorFields) return; // Validation error
      const rawMsg = err?.response?.data?.message || err?.message || 'Failed to generate production units';
      const msg = Array.isArray(rawMsg) ? rawMsg.join(', ') : rawMsg;
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={720}
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#eab308' }} />
          <span>Generate Production Units & Unique Barcode/QR Labels</span>
        </Space>
      }
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="submit"
          type="primary"
          icon={<BuildOutlined />}
          loading={loading}
          onClick={handleSubmit}
          style={{ background: 'var(--theme-primary)' }}
        >
          Generate {quantity} Unique Units
        </Button>,
      ]}
    >
      <Alert
        message="One-Action Bulk Serialization"
        description="Creates individual identities for multiple identical production units. Every physical unit receives a unique system serial (PWI-PU-YYYYNNNNNN), batch coil number, and unique QR/Barcode payload."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical">
        {/* Item & Date */}
        <Row gutter={16}>
          <Col xs={24} sm={14}>
            <Form.Item
              name="itemId"
              label="Production Item"
              rules={[{ required: true, message: 'Please select an item' }]}
            >
              {initialItem ? (
                <Input
                  disabled
                  value={`${initialItem.name} (${initialItem.itemCode})`}
                  style={{ color: '#0f172a', fontWeight: 600 }}
                />
              ) : (
                <Select
                  showSearch
                  placeholder="Select produced item"
                  loading={itemsLoading}
                  optionFilterProp="label"
                  options={items.map((i) => ({
                    value: i.id,
                    label: `${i.name} (${i.itemCode})`,
                  }))}
                />
              )}
            </Form.Item>
          </Col>
          <Col xs={24} sm={10}>
            <Form.Item
              name="productionDate"
              label="Production Date"
              rules={[{ required: true, message: 'Date is required' }]}
            >
              <DatePicker style={{ width: '100%' }} format="DD-MMM-YYYY" />
            </Form.Item>
          </Col>
        </Row>

        {/* Quantity & Coil Prefix */}
        <Row gutter={16}>
          <Col xs={12} sm={8}>
            <Form.Item
              name="quantity"
              label="Unit Quantity (Coils)"
              rules={[
                { required: true, message: 'Quantity is required' },
                { type: 'number', min: 1, max: 500, message: 'Between 1 and 500' },
              ]}
              extra="Number of physical labels"
            >
              <InputNumber min={1} max={500} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item
              name="coilPrefix"
              label="Coil / Reel Prefix"
              rules={[{ required: true, message: 'Prefix required' }]}
              extra="Human-readable prefix"
            >
              <Input placeholder="CN" maxLength={8} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="lengthMeters" label="Length per Unit (Mtrs)" extra="Default length per coil">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="250" />
            </Form.Item>
          </Col>
        </Row>

        {/* Batch & PVC Batch */}
        <Row gutter={16}>
          <Col xs={12} sm={8}>
            <Form.Item name="batchNo" label="Production Batch #">
              <Input placeholder="e.g. 01" />
            </Form.Item>
          </Col>
          <Col xs={12} sm={8}>
            <Form.Item name="pvcBatchNo" label="PVC / Compound Batch #">
              <Input placeholder="e.g. 28" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="machineNo" label="Machine No.">
              <Input placeholder="e.g. EXT-01" />
            </Form.Item>
          </Col>
        </Row>

        {/* Shift and Operator */}
        <Row gutter={16}>
          <Col xs={12} sm={12}>
            <Form.Item name="shiftName" label="Shift">
              <Select
                options={[
                  { value: 'Shift A', label: 'Shift A (Morning)' },
                  { value: 'Shift B', label: 'Shift B (Evening)' },
                  { value: 'Shift C', label: 'Shift C (Night)' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={12}>
            <Form.Item name="operatorName" label="Operator Name(s)">
              <Input placeholder="e.g. Yousuf / Amir" />
            </Form.Item>
          </Col>
        </Row>

        {/* Code Symbology & Label Template */}
        <Row gutter={16}>
          <Col xs={12} sm={12}>
            <Form.Item
              name="codeType"
              label="Unique Code Format"
              extra="Default: QR + Barcode for dual scanning"
            >
              <Select
                options={[
                  { value: ProductionUnitCodeType.QR_BARCODE, label: 'QR Code + 1D Barcode (Default)' },
                  { value: ProductionUnitCodeType.QR_ONLY, label: 'QR Code Only' },
                  { value: ProductionUnitCodeType.BARCODE_ONLY, label: '1D Barcode Only' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={12}>
            <Form.Item name="labelTemplate" label="Label Template" extra="Thermal / sticker format">
              <Select
                options={[
                  { value: 'PVC_COIL', label: 'PVC Coil Label (100×50mm)' },
                  { value: 'CABLE_COIL', label: 'Cable Coil / Reel Label' },
                  { value: 'SPOKE_LABEL', label: 'Spoke / Core Wire' },
                  { value: 'FINISHED_PRODUCT', label: 'Finished Product Box' },
                ]}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Live Identity Generation Preview Box */}
        <div
          style={{
            background: 'var(--theme-surface-alt, #f8fafc)',
            border: '1px dashed var(--theme-primary, #3b82f6)',
            borderRadius: 8,
            padding: '12px 16px',
            marginTop: 8,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-primary)' }}>
              IDENTITY GENERATION PREVIEW
            </span>
            <Tag color="cyan">Total {quantity} Unique Records</Tag>
          </div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: '20px' }}>
            <div>
              • <strong>Batch Coil Sequence:</strong>{' '}
              <Tag color="geekblue">{prefix.toUpperCase()}-001</Tag> through{' '}
              <Tag color="geekblue">
                {prefix.toUpperCase()}-{String(quantity).padStart(3, '0')}
              </Tag>
            </div>
            <div>
              • <strong>System Serial Format:</strong>{' '}
              <code>PWI-PU-{currentYear}######</code> (guaranteed collision-free across concurrent operators)
            </div>
            <div>
              • <strong>Barcode & 2D QR Symbology:</strong> QR Code (2D ISO/IEC 18004) + Code 128 (1D ISO/IEC 15417)
            </div>
          </div>
        </div>
      </Form>
    </Modal>
  );
};

export default ProductionUnitGeneratorModal;
