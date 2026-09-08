import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Button, Space, Tag, Input, Typography, Modal, Descriptions, message, Tooltip, Alert, Spin } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  PrinterOutlined,
  ScanOutlined,
  EyeOutlined,
  BarcodeOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import { apiService } from '../../services/api';
import BarcodePrint from '../../components/shared/BarcodePrint';
import BarcodeScanner from '../../components/shared/BarcodeScanner';
import { BarcodeRecord, BarcodeEntityType, ENTITY_TYPE_LABELS } from './types';

const { Text } = Typography;

interface EntityBarcodeListProps {
  entityType: BarcodeEntityType;
  title: string;
  loadEntityDetail?: (entityId: string) => Promise<any>;
  resolveEntityInfo?: (record: BarcodeRecord) => { code?: string; name?: string; extra?: Record<string, any> };
  renderEntityDetail?: (data: any) => React.ReactNode;
}

const EntityBarcodeList: React.FC<EntityBarcodeListProps> = ({
  entityType,
  title,
  loadEntityDetail,
  resolveEntityInfo,
  renderEntityDetail,
}) => {
  const [barcodes, setBarcodes] = useState<BarcodeRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printData, setPrintData] = useState<{ code: string; name: string; sku?: string; barcode: string } | null>(null);
  const [detailModal, setDetailModal] = useState<{ open: boolean; data: any }>({ open: false, data: null });
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBarcodes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = { entityType, page, limit: 50 };
      if (search) params.search = search;
      const res = await apiService.get<{ success: boolean; data: BarcodeRecord[]; total: number }>(
        '/barcode-management',
        params,
      );
      if (res.success) {
        setBarcodes(res.data || []);
        setTotal(res.total || 0);
      } else {
        setError('Failed to load barcodes');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Failed to load barcodes';
      setError(msg);
      setBarcodes([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [entityType, page, search]);

  useEffect(() => {
    loadBarcodes();
  }, [loadBarcodes]);

  const handleScanResult = async (barcodeValue: string) => {
    try {
      const res = await apiService.get<{ success: boolean; data: BarcodeRecord }>(
        `/barcode-management/lookup/${encodeURIComponent(barcodeValue)}`
      );
      if (res.success && res.data) {
        if (res.data.entityType === entityType) {
          message.success(`Found ${ENTITY_TYPE_LABELS[entityType]}: ${res.data.entityLabel || res.data.entityCode || barcodeValue}`);
          loadBarcodes();
        } else {
          message.warning(`Barcode belongs to ${ENTITY_TYPE_LABELS[res.data.entityType]}, not ${ENTITY_TYPE_LABELS[entityType]}`);
        }
      }
    } catch {
      message.error('Barcode not found');
    }
  };

  const handleViewDetail = async (record: BarcodeRecord) => {
    if (!loadEntityDetail) return;
    try {
      setDetailLoading(true);
      setDetailModal({ open: true, data: null });
      const data = await loadEntityDetail(record.entityId);
      setDetailModal({ open: true, data });
    } catch (err) {
      message.error('Failed to load entity details');
      setDetailModal({ open: false, data: null });
    } finally {
      setDetailLoading(false);
    }
  };

  const handlePrint = (record: BarcodeRecord) => {
    const info = resolveEntityInfo?.(record);
    setPrintData({
      code: info?.code || record.entityCode || record.entityId,
      name: info?.name || record.entityLabel || ENTITY_TYPE_LABELS[entityType],
      sku: info?.extra?.sku,
      barcode: record.barcodeValue,
    });
    setPrintOpen(true);
  };

  const handleExport = () => {
    const headers = ['Barcode', 'Entity Type', 'Entity Code', 'Entity Name', 'Status', 'Created'];
    const rows = barcodes.map((b) => [
      b.barcodeValue,
      ENTITY_TYPE_LABELS[b.entityType],
      b.entityCode || '',
      b.entityLabel || '',
      b.status,
      new Date(b.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityType.toLowerCase()}-barcodes.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success('Exported successfully');
  };

  const columns = [
    {
      title: 'Barcode',
      dataIndex: 'barcodeValue',
      key: 'barcodeValue',
      width: 180,
      render: (val: string) => <Text code style={{ fontSize: 12 }}>{val}</Text>,
    },
    {
      title: 'Entity Code',
      dataIndex: 'entityCode',
      key: 'entityCode',
      width: 150,
      render: (val: string) => val || <Text type="secondary">-</Text>,
    },
    {
      title: 'Entity Name',
      dataIndex: 'entityLabel',
      key: 'entityLabel',
      ellipsis: true,
      render: (val: string) => val || <Text type="secondary">-</Text>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (val: string) => (
        <Tag color={val === 'ACTIVE' ? 'green' : 'red'}>{val}</Tag>
      ),
    },
    {
      title: 'Created',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (val: string) => new Date(val).toLocaleDateString(),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: BarcodeRecord) => (
        <Space size={4}>
          {loadEntityDetail && (
            <Tooltip title="View Details">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewDetail(record)}
              />
            </Tooltip>
          )}
          <Tooltip title="Print Barcode">
            <Button
              type="text"
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => handlePrint(record)}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  const renderDefaultDetail = (data: any) => {
    if (!data) return null;
    const skipFields = ['__proto__', 'password', 'token'];
    const entries = Object.entries(data).filter(
      ([key, val]) => !skipFields.includes(key) && val !== null && val !== undefined && typeof val !== 'object'
    );
    return (
      <Descriptions bordered size="small" column={2} labelStyle={{ width: 160 }}>
        {entries.map(([key, val]) => (
          <Descriptions.Item key={key} label={key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}>
            {String(val)}
          </Descriptions.Item>
        ))}
      </Descriptions>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 16 }}>
          <BarcodeOutlined style={{ marginRight: 8 }} />
          {title}
        </Text>
        <div>
          <Text type="secondary">Manage {ENTITY_TYPE_LABELS[entityType].toLowerCase()} barcodes</Text>
        </div>
      </div>

      <Card>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Space>
            <Input
              placeholder="Search barcodes..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => { setPage(1); loadBarcodes(); }}
              onClear={() => { setSearch(''); setPage(1); }}
              style={{ width: 250 }}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={loadBarcodes}>Refresh</Button>
          </Space>
          <Space>
            <Button icon={<ExportOutlined />} onClick={handleExport}>Export</Button>
            <Button icon={<ScanOutlined />} onClick={() => setScannerOpen(true)}>Scan</Button>
          </Space>
        </div>

        {error && (
          <Alert
            type="error"
            showIcon
            message="Error"
            description={error}
            style={{ marginBottom: 16 }}
            closable
            onClose={() => setError(null)}
          />
        )}

        <Table
          columns={columns}
          dataSource={barcodes}
          rowKey="id"
          loading={loading}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showSizeChanger: false,
            showTotal: (t) => `Total ${t} barcodes`,
          }}
          scroll={{ x: 800 }}
          size="small"
        />
      </Card>

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScanResult}
        title={`Scan ${ENTITY_TYPE_LABELS[entityType]} Barcode`}
      />

      {printData && (
        <BarcodePrint
          open={printOpen}
          onClose={() => { setPrintOpen(false); setPrintData(null); }}
          itemCode={printData.code}
          itemName={printData.name}
          sku={printData.sku}
          barcode={printData.barcode}
        />
      )}

      <Modal
        title={`${ENTITY_TYPE_LABELS[entityType]} Details`}
        open={detailModal.open}
        onCancel={() => setDetailModal({ open: false, data: null })}
        footer={null}
        width={640}
        destroyOnHidden
      >
        <Spin spinning={detailLoading}>
          {detailModal.data && (
            renderEntityDetail
              ? renderEntityDetail(detailModal.data)
              : renderDefaultDetail(detailModal.data)
          )}
        </Spin>
      </Modal>
    </div>
  );
};

export default EntityBarcodeList;
