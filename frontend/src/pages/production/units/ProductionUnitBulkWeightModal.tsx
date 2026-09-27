import React, { useState, useEffect } from 'react';
import {
  Modal,
  Table,
  InputNumber,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  message,
  Alert,
} from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import {
  ProductionUnitItem,
  productionUnitService,
  BulkUpdateUnitRow,
} from '../../../services/productionUnitService';

const { Text } = Typography;

interface ProductionUnitBulkWeightModalProps {
  open: boolean;
  onClose: () => void;
  units: ProductionUnitItem[];
  onSaved: (updatedUnits: ProductionUnitItem[]) => void;
}

export const ProductionUnitBulkWeightModal: React.FC<ProductionUnitBulkWeightModalProps> = ({
  open,
  onClose,
  units,
  onSaved,
}) => {
  const [rows, setRows] = useState<BulkUpdateUnitRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && units.length) {
      setRows(
        units.map((u) => ({
          id: u.id,
          weightKg: u.weightKg != null ? Number(u.weightKg) : undefined,
          jointCount: u.jointCount != null ? Number(u.jointCount) : 0,
          stValue: u.stValue || '04',
          remarks: u.remarks || '',
        })),
      );
    }
  }, [open, units]);

  const updateRow = (id: string, field: keyof BulkUpdateUnitRow, value: any) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await productionUnitService.bulkUpdate(rows);
      message.success(`Successfully saved weights and attributes for ${res.count} coils!`);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      message.error(err?.message || 'Failed to update weights');
    } finally {
      setLoading(false);
    }
  };

  const totalWeight = rows.reduce((sum, r) => sum + (Number(r.weightKg) || 0), 0);
  const filledCount = rows.filter((r) => r.weightKg != null && r.weightKg > 0).length;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={780}
      title={
        <Space>
          <EditOutlined style={{ color: 'var(--theme-primary)' }} />
          <span>Batch Weight & Quality Entry ({units.length} Coils)</span>
        </Space>
      }
      footer={[
        <Button key="close" onClick={onClose}>
          Cancel
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          loading={loading}
          onClick={handleSave}
          style={{ background: 'var(--theme-primary)' }}
        >
          Save All Weights ({filledCount}/{units.length} Filled)
        </Button>,
      ]}
    >
      <div
        style={{
          background: 'var(--theme-surface-alt, #f8fafc)',
          padding: '8px 14px',
          borderRadius: 6,
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          Key in the individual weight (Kg) and spark test value for each physical coil.
        </Text>
        <Space>
          <Tag color="cyan">
            Coils: <strong>{units.length}</strong>
          </Tag>
          <Tag color="gold" style={{ fontSize: 12, fontWeight: 700 }}>
            Total Batch Weight: {totalWeight.toFixed(2)} KG
          </Tag>
        </Space>
      </div>

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 380 }}
        dataSource={units}
        columns={[
          {
            title: 'Coil #',
            dataIndex: 'coilNo',
            width: 95,
            render: (v: string) => <strong style={{ color: '#1d4ed8' }}>{v}</strong>,
          },
          {
            title: 'Serial Number',
            dataIndex: 'unitSerialNo',
            width: 160,
            render: (v: string) => <Text code>{v}</Text>,
          },
          {
            title: 'Weight (KG) *',
            key: 'weightKg',
            width: 140,
            render: (_, record) => {
              const rowVal = rows.find((r) => r.id === record.id);
              return (
                <InputNumber
                  min={0.01}
                  step={0.05}
                  precision={2}
                  placeholder="e.g. 26.10"
                  style={{ width: '100%', borderColor: rowVal?.weightKg ? '#22c55e' : undefined }}
                  value={rowVal?.weightKg}
                  onChange={(val) => updateRow(record.id, 'weightKg', val)}
                />
              );
            },
          },
          {
            title: 'S.T. (Spark)',
            key: 'stValue',
            width: 100,
            render: (_, record) => {
              const rowVal = rows.find((r) => r.id === record.id);
              return (
                <Input
                  placeholder="04"
                  maxLength={10}
                  value={rowVal?.stValue}
                  onChange={(e) => updateRow(record.id, 'stValue', e.target.value)}
                />
              );
            },
          },
          {
            title: 'Joints',
            key: 'jointCount',
            width: 90,
            render: (_, record) => {
              const rowVal = rows.find((r) => r.id === record.id);
              return (
                <InputNumber
                  min={0}
                  max={20}
                  value={rowVal?.jointCount}
                  onChange={(val) => updateRow(record.id, 'jointCount', val || 0)}
                  style={{ width: '100%' }}
                />
              );
            },
          },
          {
            title: 'Remarks',
            key: 'remarks',
            render: (_, record) => {
              const rowVal = rows.find((r) => r.id === record.id);
              return (
                <Input
                  placeholder="Optional notes"
                  value={rowVal?.remarks}
                  onChange={(e) => updateRow(record.id, 'remarks', e.target.value)}
                />
              );
            },
          },
        ]}
      />
    </Modal>
  );
};

export default ProductionUnitBulkWeightModal;
