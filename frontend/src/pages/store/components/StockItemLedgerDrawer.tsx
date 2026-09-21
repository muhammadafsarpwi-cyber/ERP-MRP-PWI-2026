import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  Tabs,
  Table,
  Tag,
  Row,
  Col,
  Card,
  Statistic,
  Spin,
  Empty,
  Button,
  Space,
  Typography,
  Popconfirm,
  message,
  Tooltip,
} from 'antd';
import {
  BookOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  HistoryOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  ReloadOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import {
  fetchItemLifecycle,
  deleteLedgerRow,
  deleteDummyLedgerRows,
  MaterialLifecycle,
  LedgerRow,
} from '../../../services/storeMaterialTrace';

const { Text, Title } = Typography;

interface StockItemLedgerModalProps {
  visible: boolean;
  onClose: () => void;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  storeId?: string;
  storeName?: string;
  warehouseId?: string;
  warehouseName?: string;
  currentOnHand?: number;
  currentAvailable?: number;
  uomCode?: string;
  onDataChanged?: () => void;
}

const fmt = (num?: number | null, decimals = 2) => {
  if (num === null || num === undefined || Number.isNaN(Number(num))) return '0';
  return Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
};

const fmtDateTime = (v?: string | Date | null) => {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(v);
  }
};

const getMovementTypeTag = (type?: string) => {
  const t = (type || '').toUpperCase();
  if (t === 'RECEIPT' || t === 'GOODS_RECEIPT' || t === 'MATERIAL_RECEIPT' || t === 'PRODUCTION_RECEIPT') {
    return <Tag color="green">RECEIPT / INFLOW</Tag>;
  }
  if (t === 'PRODUCTION_CONSUMPTION' || t === 'MANUFACTURING_ISSUE') {
    return <Tag color="volcano">PRODUCTION CONSUMPTION</Tag>;
  }
  if (t === 'PRODUCTION_SCRAP') {
    return <Tag color="magenta">PRODUCTION SCRAP</Tag>;
  }
  if (t === 'MATERIAL_ISSUE' || t === 'ISSUE') {
    return <Tag color="red">MATERIAL ISSUE</Tag>;
  }
  if (t === 'TRANSFER_IN' || t === 'STOCK_TRANSFER') {
    return <Tag color="blue">TRANSFER IN</Tag>;
  }
  if (t === 'TRANSFER_OUT') {
    return <Tag color="purple">TRANSFER OUT</Tag>;
  }
  if (t === 'MATERIAL_RETURN' || t === 'RETURN') {
    return <Tag color="orange">MATERIAL RETURN</Tag>;
  }
  if (t === 'ADJUSTMENT' || t === 'STOCK_ADJUSTMENT') {
    return <Tag color="gold">STOCK ADJUSTMENT</Tag>;
  }
  if (t === 'OPENING' || t === 'INITIAL_STOCK') {
    return <Tag color="cyan">OPENING BALANCE</Tag>;
  }
  return <Tag color="default">{type || 'TRANSACTION'}</Tag>;
};

export const StockItemLedgerModal: React.FC<StockItemLedgerModalProps> = ({
  visible,
  onClose,
  itemId,
  itemCode,
  itemName,
  storeName,
  currentOnHand,
  currentAvailable,
  uomCode,
  onDataChanged,
}) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [lifecycle, setLifecycle] = useState<MaterialLifecycle | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(() => {
    if (!itemId) return;
    setLoading(true);
    fetchItemLifecycle(itemId)
      .then((res) => {
        setLifecycle(res);
      })
      .catch((err) => {
        console.error('Failed to load item lifecycle for ledger:', err);
        setLifecycle(null);
      })
      .finally(() => setLoading(false));
  }, [itemId]);

  useEffect(() => {
    if (visible && itemId) {
      loadData();
    } else {
      setLifecycle(null);
    }
  }, [visible, itemId, loadData]);

  // Handle single row deletion
  const handleDeleteRow = async (rowId: string) => {
    try {
      setActionLoading(true);
      await deleteLedgerRow(rowId);
      message.success('Ledger entry deleted successfully');
      loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      message.error(err?.message || 'Failed to delete ledger entry');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle dummy / test row cleanup
  const handleClearDummy = async () => {
    if (!itemId) return;
    try {
      setActionLoading(true);
      const res = await deleteDummyLedgerRows(itemId);
      message.success(`Removed ${res.deletedCount || 0} dummy / test ledger entries`);
      loadData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      message.error(err?.message || 'Failed to remove dummy entries');
    } finally {
      setActionLoading(false);
    }
  };

  // Calculate actual ledger rows and running balance purely from real data (no fake opening rows)
  const { ledgerRows, totalIn, totalOut, netMovement, lastBalance } = useMemo(() => {
    const rawRows: LedgerRow[] = lifecycle?.ledger?.rows || [];

    let runningBalance = 0;
    const computedRows: LedgerRow[] = rawRows.map((r, idx) => {
      const isOut = String(r.direction).toUpperCase() === 'OUT';
      const qty = Number(r.quantity) || 0;
      runningBalance = isOut ? runningBalance - qty : runningBalance + qty;

      return {
        ...r,
        key: r.id || `ledger-${idx}`,
        quantity: qty,
        balance: runningBalance,
        isOpening: false,
      };
    });

    const txnIn = rawRows
      .filter((r) => String(r.direction).toUpperCase() === 'IN')
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

    const txnOut = rawRows
      .filter((r) => String(r.direction).toUpperCase() === 'OUT')
      .reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);

    return {
      ledgerRows: computedRows,
      totalIn: txnIn,
      totalOut: txnOut,
      netMovement: txnIn - txnOut,
      lastBalance: runningBalance,
    };
  }, [lifecycle]);

  // Filtered rows for Inflow (Where it came from)
  const inRows = useMemo(
    () => ledgerRows.filter((r) => String(r.direction).toUpperCase() === 'IN'),
    [ledgerRows]
  );

  // Filtered rows for Outflow (Where it went)
  const outRows = useMemo(
    () => ledgerRows.filter((r) => String(r.direction).toUpperCase() === 'OUT'),
    [ledgerRows]
  );

  // Columns for Complete Ledger Table
  const ledgerColumns: ColumnsType<LedgerRow> = [
    {
      title: 'Date & Time',
      dataIndex: 'transaction_date',
      key: 'transaction_date',
      width: 170,
      render: (v: string) => <Text style={{ fontSize: 13 }}>{fmtDateTime(v)}</Text>,
    },
    {
      title: 'Movement Type',
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      width: 180,
      render: (v: string) => getMovementTypeTag(v),
    },
    {
      title: 'Ref / Document #',
      dataIndex: 'reference_number',
      key: 'reference_number',
      width: 160,
      render: (v: string, r) => (
        <Space direction="vertical" size={0}>
          <Text strong style={{ color: '#1677ff' }}>
            {v || r.reference_type || '—'}
          </Text>
          {r.reference_type && v && (
            <Text type="secondary" style={{ fontSize: 11 }}>
              {r.reference_type}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 95,
      align: 'center',
      render: (v: string) =>
        String(v).toUpperCase() === 'IN' ? (
          <Tag color="green" icon={<ArrowDownOutlined />}>
            IN
          </Tag>
        ) : (
          <Tag color="red" icon={<ArrowUpOutlined />}>
            OUT
          </Tag>
        ),
    },
    {
      title: `Quantity (${uomCode || 'UOM'})`,
      dataIndex: 'quantity',
      key: 'quantity',
      width: 130,
      align: 'right',
      render: (v: number, r) => {
        const isIn = String(r.direction).toUpperCase() === 'IN';
        return (
          <Text strong style={{ color: isIn ? '#389e0d' : '#cf1322', fontSize: 14 }}>
            {isIn ? `+${fmt(v)}` : `-${fmt(v)}`}
          </Text>
        );
      },
    },
    {
      title: `Running Balance (${uomCode || 'UOM'})`,
      dataIndex: 'balance',
      key: 'balance',
      width: 150,
      align: 'right',
      render: (v: number) => (
        <Tag color="blue" style={{ fontSize: 13, fontWeight: 700, padding: '2px 8px' }}>
          {fmt(v)}
        </Tag>
      ),
    },
    {
      title: 'Details / Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (v: string) => (
        <span title={v || ''} style={{ fontSize: 12, color: 'var(--theme-text)' }}>
          {v || '—'}
        </span>
      ),
    },
    {
      title: 'Store / Warehouse',
      dataIndex: 'warehouse_name',
      key: 'warehouse_name',
      width: 160,
      render: (v: string) => <Text type="secondary">{v || '—'}</Text>,
    },
    {
      title: 'Action',
      key: 'action',
      width: 80,
      align: 'center',
      render: (_: any, r) => (
        <Popconfirm
          title="Delete Ledger Entry"
          description="Are you sure you want to delete this ledger entry? This cannot be undone."
          onConfirm={() => handleDeleteRow(r.id)}
          okText="Delete"
          cancelText="Cancel"
          okButtonProps={{ danger: true, loading: actionLoading }}
        >
          <Tooltip title="Delete Entry">
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={actionLoading}
            />
          </Tooltip>
        </Popconfirm>
      ),
    },
  ];

  return (
    <Modal
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 28 }}>
          <Space direction="vertical" size={2}>
            <Space align="center" style={{ flexWrap: 'wrap' }}>
              <BookOutlined style={{ fontSize: 20, color: '#1677ff' }} />
              <Title level={4} style={{ margin: 0, color: 'var(--theme-text)' }}>
                Stock Movement Ledger (Where it Came From & Where it Went)
              </Title>
            </Space>
            <Space size={12} style={{ marginTop: 4, flexWrap: 'wrap' }}>
              <Tag color="blue" style={{ fontSize: 13, fontWeight: 700, padding: '2px 8px' }}>
                {itemCode || lifecycle?.item?.item_code}
              </Tag>
              <Text strong style={{ fontSize: 14, color: 'var(--theme-text)' }}>
                {itemName || lifecycle?.item?.name}
              </Text>
              {storeName && <Tag color="purple">Store: {storeName}</Tag>}
              {uomCode && <Tag color="cyan">UOM: {uomCode}</Tag>}
              {currentOnHand !== undefined && (
                <Tag color="geekblue">Total On Hand: {fmt(currentOnHand)} {uomCode}</Tag>
              )}
            </Space>
          </Space>
          <Space>
            <Tooltip title="Reload ledger data">
              <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
                Refresh
              </Button>
            </Tooltip>
            <Popconfirm
              title="Clean Dummy / Test Entries"
              description="Are you sure you want to remove test/dummy entries for this item?"
              onConfirm={handleClearDummy}
              okText="Clean"
              cancelText="Cancel"
              okButtonProps={{ danger: true, loading: actionLoading }}
            >
              <Button danger icon={<ClearOutlined />} loading={actionLoading}>
                Clean Test Entries
              </Button>
            </Popconfirm>
            {itemId && (
              <Button
                type="primary"
                ghost
                icon={<HistoryOutlined />}
                onClick={() => {
                  navigate(`/store/material-trace/${itemId}`);
                  onClose();
                }}
              >
                Full Lifecycle Trace
              </Button>
            )}
          </Space>
        </div>
      }
      open={visible}
      onCancel={onClose}
      width={1150}
      centered
      destroyOnClose
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <Spin spinning={loading || actionLoading}>
        {/* KPI Cards: Inflow, Outflow, Ledger Balance */}
        <Row gutter={[16, 16]} style={{ marginBottom: 20, marginTop: 10 }}>
          <Col xs={24} sm={8}>
            <Card
              bordered
              style={{
                background: 'rgba(82, 196, 26, 0.08)',
                borderColor: 'rgba(82, 196, 26, 0.3)',
              }}
            >
              <Statistic
                title={
                  <span style={{ fontWeight: 600, color: '#389e0d', fontSize: 13 }}>
                    📥 Total Received / Inflow (Where it Came From)
                  </span>
                }
                value={totalIn}
                precision={2}
                valueStyle={{ color: '#389e0d', fontWeight: 700 }}
                prefix="+"
                suffix={uomCode || ''}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#595959' }}>
                GRN receipts, stock transfers in & production receipts
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card
              bordered
              style={{
                background: 'rgba(245, 34, 45, 0.08)',
                borderColor: 'rgba(245, 34, 45, 0.3)',
              }}
            >
              <Statistic
                title={
                  <span style={{ fontWeight: 600, color: '#cf1322', fontSize: 13 }}>
                    📤 Total Issued / Consumption (Where it Went)
                  </span>
                }
                value={totalOut}
                precision={2}
                valueStyle={{ color: '#cf1322', fontWeight: 700 }}
                prefix="-"
                suffix={uomCode || ''}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#595959' }}>
                Production issues, material issues & scrap
              </div>
            </Card>
          </Col>

          <Col xs={24} sm={8}>
            <Card
              bordered
              style={{
                background: 'rgba(22, 119, 255, 0.08)',
                borderColor: 'rgba(22, 119, 255, 0.3)',
              }}
            >
              <Statistic
                title={
                  <span style={{ fontWeight: 600, color: '#0958d9', fontSize: 13 }}>
                    📦 Ledger Movement Balance
                  </span>
                }
                value={netMovement}
                precision={2}
                valueStyle={{ color: '#0958d9', fontWeight: 700 }}
                prefix={<DatabaseOutlined style={{ marginRight: 4 }} />}
                suffix={uomCode || ''}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: '#595959' }}>
                Net movement from recorded ledger entries
              </div>
            </Card>
          </Col>
        </Row>

        {/* Tabbed View: Complete Ledger / Receipts / Issues */}
        <Tabs
          defaultActiveKey="all"
          items={[
            {
              key: 'all',
              label: (
                <span>
                  <BookOutlined style={{ marginRight: 6 }} />
                  Complete Stock Ledger
                  <Tag color="blue" style={{ marginLeft: 6 }}>
                    {ledgerRows.length}
                  </Tag>
                </span>
              ),
              children: (
                <div>
                  {ledgerRows.length === 0 ? (
                    <Empty description="No recorded ledger entries found for this item" />
                  ) : (
                    <Table
                      dataSource={ledgerRows}
                      columns={ledgerColumns}
                      rowKey="key"
                      pagination={{ pageSize: 12, showSizeChanger: true }}
                      size="middle"
                      scroll={{ x: 1050 }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'inflow',
              label: (
                <span style={{ color: '#389e0d' }}>
                  <ArrowDownOutlined style={{ marginRight: 6 }} />
                  Where It Came From (Receipts & Inflow)
                  <Tag color="green" style={{ marginLeft: 6 }}>
                    {inRows.length}
                  </Tag>
                </span>
              ),
              children: (
                <div>
                  {inRows.length === 0 ? (
                    <Empty description="No receipt / inflow transactions recorded" />
                  ) : (
                    <Table
                      dataSource={inRows}
                      columns={ledgerColumns}
                      rowKey="key"
                      pagination={{ pageSize: 12, showSizeChanger: true }}
                      size="middle"
                      scroll={{ x: 1050 }}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'outflow',
              label: (
                <span style={{ color: '#cf1322' }}>
                  <ArrowUpOutlined style={{ marginRight: 6 }} />
                  Where It Went (Issues & Consumption)
                  <Tag color="red" style={{ marginLeft: 6 }}>
                    {outRows.length}
                  </Tag>
                </span>
              ),
              children: (
                <div>
                  {outRows.length === 0 ? (
                    <Empty description="No issue / consumption transactions recorded" />
                  ) : (
                    <Table
                      dataSource={outRows}
                      columns={ledgerColumns}
                      rowKey="key"
                      pagination={{ pageSize: 12, showSizeChanger: true }}
                      size="middle"
                      scroll={{ x: 1050 }}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Spin>
    </Modal>
  );
};

export default StockItemLedgerModal;
