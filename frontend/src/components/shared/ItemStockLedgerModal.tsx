import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Modal, Table, Tag, Typography, Row, Col, Card, Spin, Alert, Button, Space, Input } from 'antd';
import {
  InboxOutlined, RollbackOutlined, DatabaseOutlined, HistoryOutlined,
  ReloadOutlined, DownloadOutlined, ArrowUpOutlined, ArrowDownOutlined,
  SearchOutlined, FileTextOutlined, ApartmentOutlined,
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
  const [filterText, setFilterText] = useState('');

  const fetchLedger = useCallback(async () => {
    if (!itemId) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (warehouseId) params.warehouseId = warehouseId;
      
      let res: any;
      try {
        res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
          `/inventory/balances/items/${itemId}/ledger`,
          params,
        );
      } catch {
        res = await apiService.get<{ success: boolean; data: ItemStockLedgerData }>(
          `/inventory/receipts/items/${itemId}/ledger`,
          params,
        );
      }
      setData(res?.data || res);
    } catch (err) {
      setError(formatApiError(err, 'Failed to load item movement history.'));
    } finally {
      setLoading(false);
    }
  }, [itemId, warehouseId]);

  useEffect(() => {
    if (open && itemId) {
      setFilterText('');
      void fetchLedger();
    } else {
      setData(null);
      setError(null);
    }
  }, [open, itemId, fetchLedger]);

  const filteredMovements = useMemo(() => {
    if (!data?.movements) return [];
    if (!filterText.trim()) return data.movements;
    const q = filterText.toLowerCase().trim();
    return data.movements.filter((m) => {
      const type = (m.transactionType || '').toLowerCase();
      const ref = (m.referenceNumber || '').toLowerCase();
      const notes = (m.notes || '').toLowerCase();
      const wh = (m.warehouse?.name || '').toLowerCase();
      const dept = (m.department?.name || '').toLowerCase();
      return type.includes(q) || ref.includes(q) || notes.includes(q) || wh.includes(q) || dept.includes(q);
    });
  }, [data?.movements, filterText]);

  const exportCsv = () => {
    if (!data || !data.movements.length) return;
    const headers = [
      'Date & Time',
      'Transaction Type',
      'Direction',
      'Doc / Reference No',
      'Flow (Where From / Where To)',
      'Received (+ IN)',
      'Issued (- OUT)',
      'Running Balance',
      'UOM',
      'Warehouse',
      'Department',
      'Notes & Remarks',
    ];

    const rows = data.movements.map((m) => {
      const flow = m.direction === 'IN'
        ? `Received from ${m.department?.name || m.referenceNumber || 'Vendor/Receipt'}`
        : `Issued to ${m.department?.name || m.referenceNumber || 'Production/Issue'}`;
      return [
        dayjs(m.date).format('YYYY-MM-DD HH:mm:ss'),
        m.transactionType,
        m.direction,
        m.referenceNumber,
        `"${flow.replace(/"/g, '""')}"`,
        m.inQuantity > 0 ? m.inQuantity : '',
        m.outQuantity > 0 ? m.outQuantity : '',
        m.runningBalance,
        data.item.uomCode,
        m.warehouse?.name || warehouseName || '',
        m.department?.name || '',
        `"${(m.notes || '').replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Stock_Ledger_${data.item.itemCode}_${dayjs().format('YYYYMMDD_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBadgeForType = (type: string, direction: 'IN' | 'OUT') => {
    const isDirIn = direction === 'IN';
    let label = type.replace(/_/g, ' ');
    let color = '#38bdf8';
    let bg = 'rgba(56, 189, 248, 0.12)';
    let border = 'rgba(56, 189, 248, 0.3)';

    if (type.includes('RECEIPT')) {
      label = 'RECEIPT (IN)';
      color = '#34d399';
      bg = 'rgba(52, 211, 153, 0.14)';
      border = 'rgba(52, 211, 153, 0.35)';
    } else if (type.includes('PRODUCTION_OUTPUT')) {
      label = 'PROD OUTPUT (IN)';
      color = '#a78bfa';
      bg = 'rgba(167, 139, 250, 0.14)';
      border = 'rgba(167, 139, 250, 0.35)';
    } else if (type.includes('PRODUCTION_CONSUMPTION') || type.includes('CONSUMPTION')) {
      label = 'PROD CONSUMPTION (OUT)';
      color = '#fb923c';
      bg = 'rgba(251, 146, 60, 0.14)';
      border = 'rgba(251, 146, 60, 0.35)';
    } else if (type.includes('RETURN')) {
      label = 'RETURN (OUT)';
      color = '#f87171';
      bg = 'rgba(248, 113, 113, 0.14)';
      border = 'rgba(248, 113, 113, 0.35)';
    } else if (type.includes('TRANSFER')) {
      label = isDirIn ? 'TRANSFER IN' : 'TRANSFER OUT';
      color = '#38bdf8';
      bg = 'rgba(56, 189, 248, 0.14)';
      border = 'rgba(56, 189, 248, 0.35)';
    } else if (type.includes('ADJUSTMENT')) {
      label = isDirIn ? 'ADJUSTMENT (+)' : 'ADJUSTMENT (-)';
      color = '#fbbf24';
      bg = 'rgba(251, 191, 36, 0.14)';
      border = 'rgba(251, 191, 36, 0.35)';
    }

    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 700,
          color,
          background: bg,
          border: `1px solid ${border}`,
          whiteSpace: 'nowrap',
        }}
      >
        {isDirIn ? <ArrowUpOutlined style={{ fontSize: 10 }} /> : <ArrowDownOutlined style={{ fontSize: 10 }} />}
        <span>{label}</span>
      </span>
    );
  };

  const uom = data?.item?.uomCode || 'UOM';

  const columns: ColumnsType<StockLedgerMovement> = [
    {
      title: '#',
      key: 'idx',
      width: 45,
      align: 'center',
      render: (_: any, __: any, idx: number) => (
        <span style={{ color: '#64748b', fontSize: 12 }}>{idx + 1}</span>
      ),
    },
    {
      title: 'Date & Time',
      dataIndex: 'date',
      key: 'date',
      width: 140,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#e2e8f0', fontSize: 12 }}>
          {v ? dayjs(v).format('DD-MMM-YYYY HH:mm') : '—'}
        </span>
      ),
    },
    {
      title: 'Transaction Type',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 160,
      render: (type: string, r: StockLedgerMovement) => getBadgeForType(type, r.direction),
    },
    {
      title: 'Movement Flow (کہاں سے آیا / کہاں گیا)',
      key: 'flow',
      width: 240,
      render: (_, r: StockLedgerMovement) => {
        const isIncoming = r.direction === 'IN';
        return (
          <div style={{ fontSize: 12, lineHeight: 1.4 }}>
            {isIncoming ? (
              <div>
                <span style={{ color: '#34d399', fontWeight: 700 }}>
                  ↳ Received (IN)
                </span>
                <span style={{ color: '#cbd5e1', marginLeft: 6 }}>
                  {r.referenceType === 'MATERIAL_RECEIPT'
                    ? `Gate Pass / Vendor (${r.referenceNumber})`
                    : r.department?.name || r.notes || 'Inflow'}
                </span>
              </div>
            ) : (
              <div>
                <span style={{ color: '#f87171', fontWeight: 700 }}>
                  ↱ Issued / Consumed (OUT)
                </span>
                <span style={{ color: '#cbd5e1', marginLeft: 6 }}>
                  {r.referenceType === 'PRODUCTION_ENTRY'
                    ? `Production (${r.referenceNumber})`
                    : r.department?.name || r.notes || 'Outflow'}
                </span>
              </div>
            )}
            {r.warehouse?.name && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                📍 {r.warehouse.name}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Doc / Ref #',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 130,
      render: (v: string) => (
        <span
          style={{
            fontFamily: 'monospace, var(--theme-font-mono, sans-serif)',
            fontSize: 12,
            fontWeight: 700,
            color: '#38bdf8',
            background: 'rgba(56, 189, 248, 0.1)',
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid rgba(56, 189, 248, 0.25)',
          }}
        >
          {v || '—'}
        </span>
      ),
    },
    {
      title: 'Received (+ IN)',
      dataIndex: 'inQuantity',
      key: 'inQuantity',
      width: 120,
      align: 'right',
      render: (v: number) => (
        v > 0 ? (
          <span style={{ color: '#34d399', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            +{formatNumber(v, 2)}
          </span>
        ) : (
          <span style={{ color: '#475569' }}>—</span>
        )
      ),
    },
    {
      title: 'Issued (- OUT)',
      dataIndex: 'outQuantity',
      key: 'outQuantity',
      width: 120,
      align: 'right',
      render: (v: number) => (
        v > 0 ? (
          <span style={{ color: '#f87171', fontWeight: 800, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
            -{formatNumber(v, 2)}
          </span>
        ) : (
          <span style={{ color: '#475569' }}>—</span>
        )
      ),
    },
    {
      title: 'Running Balance',
      dataIndex: 'runningBalance',
      key: 'runningBalance',
      width: 140,
      align: 'right',
      render: (v: number) => (
        <span
          style={{
            color: '#38bdf8',
            fontWeight: 800,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            background: 'rgba(56, 189, 248, 0.12)',
            padding: '3px 8px',
            borderRadius: 4,
            border: '1px solid rgba(56, 189, 248, 0.28)',
            display: 'inline-block',
          }}
        >
          {formatNumber(v, 2)} {uom}
        </span>
      ),
    },
    {
      title: 'Notes & Remarks',
      dataIndex: 'notes',
      key: 'notes',
      width: 220,
      render: (v?: string) => (
        <span style={{ color: '#94a3b8', fontSize: 11, wordBreak: 'break-word' }}>
          {v || '—'}
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            <HistoryOutlined style={{ color: '#38bdf8', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: '#f8fafc', letterSpacing: '-0.02em' }}>
              Stock Movement History &amp; Item Ledger (اسٹاک لیجر)
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>
              Complete chronological audit trail showing where stock came from (+ IN), where it went (- OUT), and live running balances
            </div>
          </div>
        </div>
      }
      width={1240}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} onClick={fetchLedger} loading={loading} style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}>
          Refresh
        </Button>,
        <Button key="csv" icon={<DownloadOutlined />} onClick={exportCsv} disabled={!data || !data.movements.length} style={{ background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}>
          Export CSV
        </Button>,
        <Button key="close" type="primary" onClick={onClose} style={{ background: '#0284c7', borderColor: '#0ea5e9', fontWeight: 600 }}>
          Close
        </Button>,
      ]}
      onCancel={onClose}
      destroyOnHidden
      style={{ top: 20 }}
      styles={{
        content: {
          background: '#0b1329',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          borderRadius: 12,
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
        },
        header: {
          background: 'transparent',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          paddingBottom: 14,
        },
        body: {
          background: 'transparent',
          padding: '16px 0',
        },
        footer: {
          background: 'transparent',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: 12,
        },
      }}
    >
      {/* ━━━ ITEM PROFILE BANNER (DARK THEME) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.85) 0%, rgba(15, 23, 42, 0.95) 100%)',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          borderRadius: 10,
          padding: '12px 18px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        }}
      >
        <Space size="large" wrap align="center">
          <div>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>
              ITEM CODE
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#38bdf8', fontFamily: 'monospace', marginTop: 2 }}>
              {data?.item?.itemCode || itemCode || '—'}
            </div>
          </div>

          <div style={{ borderLeft: '1px solid rgba(255, 255, 255, 0.1)', paddingLeft: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.5px' }}>
              ITEM DESCRIPTION
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', marginTop: 2 }}>
              {data?.item?.name || itemName || '—'}
            </div>
          </div>
        </Space>

        <Space size="middle" wrap>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              background: 'rgba(192, 132, 252, 0.15)',
              border: '1px solid rgba(192, 132, 252, 0.3)',
              color: '#c084fc',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Unit: {uom}
          </span>
          {warehouseName && (
            <span
              style={{
                padding: '3px 10px',
                borderRadius: 6,
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#38bdf8',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              📍 {warehouseName}
            </span>
          )}
        </Space>
      </div>

      {loading && !data ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 14, color: '#94a3b8', fontSize: 13 }}>
            Retrieving real-time stock ledger movements from database…
          </div>
        </div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="Failed to Load Ledger History"
          description={error}
          action={
            <Button size="small" danger onClick={fetchLedger}>
              Retry
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      ) : (
        <>
          {/* ━━━ EXECUTIVE METRIC CARDS (DARK NEON) ━━━━━━━━━━━━━━━━━━━━━━━ */}
          <Row gutter={[14, 14]} style={{ marginBottom: 16 }}>
            <Col xs={24} sm={6}>
              <div
                style={{
                  background: '#131d35',
                  border: '1px solid rgba(52, 211, 153, 0.35)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                      Total Received (+ IN)
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#34d399', marginTop: 4 }}>
                      +{formatNumber(data?.summary.totalIn || 0, 2)}
                      <span style={{ fontSize: 12, color: '#6ee7b7', marginLeft: 4 }}>{uom}</span>
                    </div>
                  </div>
                  <InboxOutlined style={{ fontSize: 28, color: '#34d399', opacity: 0.8 }} />
                </div>
              </div>
            </Col>

            <Col xs={24} sm={6}>
              <div
                style={{
                  background: '#131d35',
                  border: '1px solid rgba(248, 113, 113, 0.35)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                      Total Issued (- OUT)
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#f87171', marginTop: 4 }}>
                      -{formatNumber(data?.summary.totalOut || 0, 2)}
                      <span style={{ fontSize: 12, color: '#fca5a5', marginLeft: 4 }}>{uom}</span>
                    </div>
                  </div>
                  <RollbackOutlined style={{ fontSize: 28, color: '#f87171', opacity: 0.8 }} />
                </div>
              </div>
            </Col>

            <Col xs={24} sm={6}>
              <div
                style={{
                  background: '#131d35',
                  border: '1px solid rgba(56, 189, 248, 0.35)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(56, 189, 248, 0.12)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                      Current Balance
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#38bdf8', marginTop: 4 }}>
                      ={formatNumber(data?.summary.currentBalance || 0, 2)}
                      <span style={{ fontSize: 12, color: '#7dd3fc', marginLeft: 4 }}>{uom}</span>
                    </div>
                  </div>
                  <DatabaseOutlined style={{ fontSize: 28, color: '#38bdf8', opacity: 0.8 }} />
                </div>
              </div>
            </Col>

            <Col xs={24} sm={6}>
              <div
                style={{
                  background: '#131d35',
                  border: '1px solid rgba(192, 132, 252, 0.35)',
                  borderRadius: 8,
                  padding: '12px 16px',
                  boxShadow: '0 4px 14px rgba(192, 132, 252, 0.1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
                      Total Movements
                    </div>
                    <div style={{ fontSize: 19, fontWeight: 800, color: '#c084fc', marginTop: 4 }}>
                      {data?.summary.totalMovements || 0}
                      <span style={{ fontSize: 12, color: '#d8b4fe', marginLeft: 4 }}>entries</span>
                    </div>
                  </div>
                  <ApartmentOutlined style={{ fontSize: 28, color: '#c084fc', opacity: 0.8 }} />
                </div>
              </div>
            </Col>
          </Row>

          {/* ━━━ FILTER SEARCH BAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Input
              placeholder="Search movements by doc #, type, flow, or notes…"
              prefix={<SearchOutlined style={{ color: '#64748b' }} />}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              allowClear
              style={{
                width: 380,
                background: '#131d35',
                borderColor: '#334155',
                color: '#f8fafc',
              }}
            />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>
              Showing {filteredMovements.length} of {data?.movements.length || 0} transactions
            </span>
          </div>

          {/* ━━━ MOVEMENTS TABLE (DARK THEME) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <div
            style={{
              background: '#090e1f',
              border: '1px solid rgba(56, 189, 248, 0.18)',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <Table
              dataSource={filteredMovements}
              columns={columns}
              rowKey="id"
              size="small"
              pagination={{
                pageSize: 15,
                showSizeChanger: true,
                pageSizeOptions: ['15', '30', '50', '100'],
                showTotal: (total, range) => (
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>
                    Showing {range[0]}–{range[1]} of {total} ledger entries
                  </span>
                ),
              }}
              locale={{ emptyText: <span style={{ color: '#64748b' }}>No stock movements found matching filter.</span> }}
              scroll={{ x: 1100, y: 380 }}
            />
          </div>
        </>
      )}
    </Modal>
  );
};

export default ItemStockLedgerModal;
