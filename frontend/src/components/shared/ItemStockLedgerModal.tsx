import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Table, Tag, Typography, Row, Col, Card, Spin, Alert, Button, Space } from 'antd';
import {
  InboxOutlined, RollbackOutlined, DatabaseOutlined, HistoryOutlined,
  ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { formatApiError } from '../../utils/apiError';

const { Text } = Typography;

export interface StockLedgerMovement {
  id: string;
  date: string;
  transactionType: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  inQuantity: number;
  outQuantity: number;
  runningBalance: number;
  referenceType?: string;
  referenceNumber: string;
  notes?: string;
  warehouse?: { id: string; name: string; code?: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

export interface ItemStockLedgerData {
  item: {
    id: string;
    itemCode: string;
    name: string;
    uomCode: string;
  };
  summary: {
    totalIn: number;
    totalOut: number;
    currentBalance: number;
    totalMovements: number;
  };
  movements: StockLedgerMovement[];
}

interface ItemStockLedgerModalProps {
  open: boolean;
  itemId: string | null;
  itemCode?: string;
  itemName?: string;
  warehouseId?: string;
  warehouseName?: string;
  onClose: () => void;
}

export const ItemStockLedgerModal: React.FC<ItemStockLedgerModalProps> = ({
  open,
  itemId,
  itemCode,
  itemName,
  warehouseId,
  warehouseName,
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ItemStockLedgerData | null>(null);

  const fetchLedger = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (warehouseId) params.warehouseId = warehouseId;
      const res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
        `/inventory/receipts/items/${itemId}/ledger`,
        params,
      );
      setData(res.data);
    } catch (err) {
      setError(formatApiError(err, 'Failed to load item movement history.'));
    } finally {
      setLoading(false);
    }
  }, [itemId, warehouseId]);

  useEffect(() => {
    if (open && itemId) {
      void fetchLedger();
    } else {
      setData(null);
      setError(null);
    }
  }, [open, itemId, fetchLedger]);

  const exportCsv = () => {
    if (!data || !data.movements.length) return;
    const headers = ['Date', 'Type', 'Direction', 'Doc / Ref No', 'Received (+ IN)', 'Dispatched (- OUT)', 'Running Balance', 'UOM', 'Warehouse', 'Notes'];
    const rows = data.movements.map((m) => [
      dayjs(m.date).format('YYYY-MM-DD HH:mm'),
      m.transactionType,
      m.direction,
      m.referenceNumber,
      m.inQuantity > 0 ? m.inQuantity : '',
      m.outQuantity > 0 ? m.outQuantity : '',
      m.runningBalance,
      data.item.uomCode,
      m.warehouse?.name || '',
      `"${(m.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Ledger_${data.item.itemCode}_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBadgeForType = (type: string, direction: 'IN' | 'OUT') => {
    if (direction === 'IN') {
      return <Tag color="green" style={{ fontWeight: 600 }}>{type || 'RECEIPT (IN)'}</Tag>;
    }
    if (type.includes('RETURN')) {
      return <Tag color="orange" style={{ fontWeight: 600 }}>{type || 'RETURN (OUT)'}</Tag>;
    }
    if (type.includes('CONSUMPTION') || type.includes('ISSUE')) {
      return <Tag color="volcano" style={{ fontWeight: 600 }}>{type || 'ISSUE (OUT)'}</Tag>;
    }
    return <Tag color="blue" style={{ fontWeight: 600 }}>{type || 'OUT'}</Tag>;
  };

  const uom = data?.item?.uomCode || 'KG';

  const columns: ColumnsType<StockLedgerMovement> = [
    {
      title: '#',
      key: 'idx',
      width: 50,
      render: (_: any, __: any, idx: number) => <Text type="secondary">{idx + 1}</Text>,
    },
    {
      title: 'Date & Time',
      dataIndex: 'date',
      key: 'date',
      width: 140,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
          {v ? dayjs(v).format('DD-MMM-YYYY HH:mm') : '-'}
        </span>
      ),
    },
    {
      title: 'Movement Type',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 150,
      render: (type: string, r: StockLedgerMovement) => getBadgeForType(type, r.direction),
    },
    {
      title: 'Doc / Gate Pass Ref',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 150,
      render: (v: string) => (
        <Text strong style={{ color: 'var(--theme-accent, #2563eb)' }}>
          {v || '-'}
        </Text>
      ),
    },
    {
      title: 'Received (+ IN)',
      dataIndex: 'inQuantity',
      key: 'inQuantity',
      width: 130,
      align: 'right',
      render: (v: number) => (
        v > 0 ? (
          <span style={{ color: '#059669', fontWeight: 700 }}>
            +{formatNumber(v, 2)}
          </span>
        ) : (
          <span style={{ color: '#cbd5e1' }}>-</span>
        )
      ),
    },
    {
      title: 'Dispatched (- OUT)',
      dataIndex: 'outQuantity',
      key: 'outQuantity',
      width: 140,
      align: 'right',
      render: (v: number) => (
        v > 0 ? (
          <span style={{ color: '#dc2626', fontWeight: 700 }}>
            -{formatNumber(v, 2)}
          </span>
        ) : (
          <span style={{ color: '#cbd5e1' }}>-</span>
        )
      ),
    },
    {
      title: 'Balance After',
      dataIndex: 'runningBalance',
      key: 'runningBalance',
      width: 130,
      align: 'right',
      render: (v: number) => (
        <span style={{ color: '#1e40af', fontWeight: 800, background: 'rgba(59, 130, 246, 0.08)', padding: '2px 8px', borderRadius: 4 }}>
          {formatNumber(v, 2)}
        </span>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: ['warehouse', 'name'],
      key: 'warehouse',
      width: 140,
      render: (v?: string) => v || warehouseName || '-',
    },
    {
      title: 'Details & Remarks',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (v?: string) => <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 12 }}>{v || '-'}</span>,
    },
  ];

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 4 }}>
          <HistoryOutlined style={{ color: 'var(--theme-accent, #2563eb)', fontSize: 18 }} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 16 }}>Stock Movement History (Item Ledger)</span>
            <div style={{ fontSize: 12, fontWeight: 400, color: 'var(--theme-text-secondary, #64748b)', marginTop: 2 }}>
              Detailed chronological inflow (receipts) &amp; outflow (returns/issues) timeline with running balances
            </div>
          </div>
        </div>
      }
      width={1020}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchLedger} loading={loading}>
          Refresh
        </Button>,
        <Button key="csv" icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data || !data.movements.length}>
          Export CSV
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          Close
        </Button>,
      ]}
      onCancel={onClose}
      destroyOnHidden
      style={{ top: 24 }}
    >
      {/* Item Profile Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(16, 185, 129, 0.05) 100%)',
        border: '1px solid rgba(37, 99, 235, 0.18)',
        borderRadius: 8,
        padding: '10px 16px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <Space size="middle" wrap>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Item Code</Text>
            <Tag color="blue" style={{ fontSize: 14, fontWeight: 700, padding: '2px 8px', margin: 0 }}>
              {data?.item?.itemCode || itemCode || '...'}
            </Tag>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}>Item Description</Text>
            <Text strong style={{ fontSize: 14, color: 'var(--theme-text, #0f172a)' }}>
              {data?.item?.name || itemName || '-'}
            </Text>
          </div>
        </Space>
        <Space size="middle" wrap>
          <Tag color="purple" style={{ fontWeight: 600, margin: 0 }}>
            Unit: {uom}
          </Tag>
          {warehouseName && (
            <Tag color="cyan" style={{ fontWeight: 600, margin: 0 }}>
              Warehouse: {warehouseName}
            </Tag>
          )}
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 12, color: '#64748b' }}>Loading item ledger movements...</div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="Failed to load ledger history"
          description={error}
          action={<Button size="small" danger onClick={fetchLedger}>Retry</Button>}
          style={{ marginBottom: 16 }}
        />
      ) : (
        <>
          {/* Executive Summary Metric Cards */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Total Inflow (Received)</Text>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#059669', marginTop: 2 }}>
                      +{formatNumber(data?.summary.totalIn || 0, 2)} <span style={{ fontSize: 12, fontWeight: 500 }}>{uom}</span>
                    </div>
                  </div>
                  <InboxOutlined style={{ fontSize: 28, color: '#10b981', opacity: 0.8 }} />
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Total Outflow (Returned / Issued)</Text>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', marginTop: 2 }}>
                      -{formatNumber(data?.summary.totalOut || 0, 2)} <span style={{ fontSize: 12, fontWeight: 500 }}>{uom}</span>
                    </div>
                  </div>
                  <RollbackOutlined style={{ fontSize: 28, color: '#ef4444', opacity: 0.8 }} />
                </div>
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card size="small" style={{ borderRadius: 8, border: '1px solid rgba(37, 99, 235, 0.3)', background: 'rgba(37, 99, 235, 0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600 }}>Current On-Hand Balance</Text>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1d4ed8', marginTop: 2 }}>
                      ={formatNumber(data?.summary.currentBalance || 0, 2)} <span style={{ fontSize: 12, fontWeight: 500 }}>{uom}</span>
                    </div>
                  </div>
                  <DatabaseOutlined style={{ fontSize: 28, color: '#2563eb', opacity: 0.8 }} />
                </div>
              </Card>
            </Col>
          </Row>

          {/* Timeline Table */}
          <Table
            dataSource={data?.movements || []}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '25', '50', '100'] }}
            locale={{ emptyText: 'No stock movements recorded for this item yet.' }}
            scroll={{ x: 900 }}
          />
        </>
      )}
    </Modal>
  );
};

export default ItemStockLedgerModal;
