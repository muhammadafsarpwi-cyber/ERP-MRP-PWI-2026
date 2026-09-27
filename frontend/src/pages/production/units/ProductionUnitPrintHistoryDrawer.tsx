import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Table,
  Tag,
  Typography,
  Spin,
  Alert,
  Descriptions,
} from 'antd';
import { HistoryOutlined, PrinterOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import {
  ProductionUnitItem,
  ProductionUnitPrintLog,
  productionUnitService,
} from '../../../services/productionUnitService';

const { Text } = Typography;

interface ProductionUnitPrintHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  unit: ProductionUnitItem | null;
}

export const ProductionUnitPrintHistoryDrawer: React.FC<ProductionUnitPrintHistoryDrawerProps> = ({
  open,
  onClose,
  unit,
}) => {
  const [logs, setLogs] = useState<ProductionUnitPrintLog[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && unit?.id) {
      setLoading(true);
      setError(null);
      productionUnitService
        .getPrintLogs(unit.id)
        .then((res) => setLogs(res.data || []))
        .catch((err) => setError(err?.message || 'Failed to load print logs'))
        .finally(() => setLoading(false));
    }
  }, [open, unit?.id]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={560}
      title={
        <span>
          <HistoryOutlined style={{ marginRight: 8, color: 'var(--theme-primary)' }} />
          Print Audit History — {unit?.coilNo} ({unit?.unitSerialNo})
        </span>
      }
    >
      {unit && (
        <div style={{ marginBottom: 16 }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label="Item">{unit.item?.name}</Descriptions.Item>
            <Descriptions.Item label="Coil Weight">
              {unit.weightKg != null ? `${unit.weightKg} KG` : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Total Print Count">
              <Tag color={unit.printCount > 0 ? 'blue' : 'default'}>{unit.printCount} prints</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Current Status">
              <Tag color={unit.status === 'PRINTED' ? 'green' : 'blue'}>{unit.status}</Tag>
            </Descriptions.Item>
          </Descriptions>
        </div>
      )}

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      <Table
        rowKey="id"
        loading={loading}
        dataSource={logs}
        pagination={false}
        size="small"
        columns={[
          {
            title: 'Action',
            dataIndex: 'eventType',
            width: 100,
            render: (type: string) => (
              <Tag color={type === 'REPRINT' ? 'volcano' : 'green'}>
                {type === 'REPRINT' ? 'REPRINT' : 'FIRST PRINT'}
              </Tag>
            ),
          },
          {
            title: 'Printed At',
            dataIndex: 'printedAt',
            width: 150,
            render: (d: string) => dayjs(d).format('DD-MMM-YYYY HH:mm:ss'),
          },
          {
            title: 'Copies',
            dataIndex: 'copies',
            width: 70,
            align: 'center',
          },
          {
            title: 'Job ID',
            dataIndex: 'printJobId',
            render: (v: string) => <Text code>{v || '—'}</Text>,
          },
        ]}
      />
    </Drawer>
  );
};

export default ProductionUnitPrintHistoryDrawer;
