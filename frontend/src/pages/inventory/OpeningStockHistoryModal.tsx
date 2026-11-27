import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  Table,
  Button,
  Input,
  Select,
  Space,
  Tag,
  Typography,
  InputNumber,
  App,
  Tooltip,
  theme,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
  RollbackOutlined,
  RedoOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { DraggableResizableModal } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';

const { Text } = Typography;

export interface OpeningStockHistoryLine {
  ledgerId: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  itemType: string;
  uomId: string;
  uomCode: string;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  batchNumber: string | null;
  serialNumber: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface OpeningStockHistoryBatch {
  key: string;
  batchId?: string | null;
  referenceNumber: string;
  transactionDate: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  divisionId?: string | null;
  divisionName: string;
  status?: 'POSTED' | 'REVERSED' | string;
  source?: string;
  createdByName: string;
  createdAt?: string | null;
  reversedAt?: string | null;
  reversedByName?: string | null;
  restoredAt?: string | null;
  restoredByName?: string | null;
  lineCount: number;
  totalQuantity: number;
  totalValue?: number;
  lines: OpeningStockHistoryLine[];
}

export interface OpeningStockHistoryModalProps {
  open: boolean;
  onClose: () => void;
  warehouses: Array<{ id: string; name: string; code?: string; warehouseCode?: string; warehouse_code?: string; divisionId?: string; division_id?: string }>;
  divisions?: Array<{ id: string; name: string }>;
  onHistoryChanged?: () => void;
}

export const OpeningStockHistoryModal: React.FC<OpeningStockHistoryModalProps> = ({
  open,
  onClose,
  warehouses,
  divisions = [],
  onHistoryChanged,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { can } = usePermission();
  const canReverseRestore = can('inventory.opening_stock.reverse');
  const canUpdateLine = can('inventory.opening_stock.update');

  const [batches, setBatches] = useState<OpeningStockHistoryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [divisionFilter, setDivisionFilter] = useState<string | undefined>(undefined);
  const [warehouseFilter, setWarehouseFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'POSTED' | 'REVERSED'>('ALL');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // Inline line edit state (only active on POSTED batches)
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editUnitCost, setEditUnitCost] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingLine, setSavingLine] = useState(false);

  // Batch Reverse / Restore confirmation modal state
  const [actionTarget, setActionTarget] = useState<{
    kind: 'reverse' | 'restore';
    referenceNumber: string;
    warehouseId: string;
    warehouseName: string;
    lineCount: number;
    totalQuantity: number;
  } | null>(null);
  const [acting, setActing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (warehouseFilter) params.warehouseId = warehouseFilter;
      if (divisionFilter) params.divisionId = divisionFilter;
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (searchText.trim()) params.search = searchText.trim();
      const res = await apiService.get<any>('/inventory/opening-stock/history', params);
      const list: OpeningStockHistoryBatch[] = Array.isArray(res) ? res : res?.data || [];
      setBatches(list);
      if (list.length === 1) {
        setExpandedKeys([list[0].key]);
      }
    } catch {
      message.error('Failed to load opening stock batch history');
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter, divisionFilter, statusFilter, searchText, message]);

  useEffect(() => {
    if (open) {
      fetchHistory();
    }
  }, [open, fetchHistory]);

  const handleSaveLineEdit = async (ledgerId: string) => {
    setSavingLine(true);
    try {
      await apiService.put(`/inventory/opening-stock/lines/${ledgerId}`, {
        quantity: editQty,
        unitCost: editUnitCost,
        notes: editNotes,
      });
      message.success('Opening stock line updated and stock balance synced');
      setEditingLedgerId(null);
      await fetchHistory();
      onHistoryChanged?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to update line');
    } finally {
      setSavingLine(false);
    }
  };

  const handleConfirmBatchAction = async () => {
    if (!actionTarget) return;
    setActing(true);
    try {
      const encodedRef = encodeURIComponent(actionTarget.referenceNumber);
      if (actionTarget.kind === 'reverse') {
        await apiService.post(`/inventory/opening-stock/batches/${encodedRef}/reverse`, {
          warehouseId: actionTarget.warehouseId,
        });
        message.success(`Batch ${actionTarget.referenceNumber} safely reversed and stock deducted`);
      } else {
        await apiService.post(`/inventory/opening-stock/batches/${encodedRef}/restore`, {
          warehouseId: actionTarget.warehouseId,
        });
        message.success(`Batch ${actionTarget.referenceNumber} restored and re-posted to stock`);
      }
      setActionTarget(null);
      await fetchHistory();
      onHistoryChanged?.();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Batch operation failed';
      message.error(Array.isArray(msg) ? msg.join('; ') : String(msg));
    } finally {
      setActing(false);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const buildLineColumns = (batchStatus: string): ColumnsType<OpeningStockHistoryLine> => {
    const isReversed = String(batchStatus || 'POSTED').toUpperCase() === 'REVERSED';
    return [
      {
        title: '#',
        key: 'idx',
        width: 45,
        align: 'center',
        render: (_: any, __: any, i: number) => (
          <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>{i + 1}</Text>
        ),
      },
      {
        title: 'Item Code',
        dataIndex: 'itemCode',
        key: 'itemCode',
        width: 140,
        render: (v: string) => (
          <Text strong style={{ color: token.colorPrimary, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
            {v || '—'}
          </Text>
        ),
      },
      {
        title: 'Item Name',
        dataIndex: 'itemName',
        key: 'itemName',
        width: 240,
        ellipsis: true,
        render: (v: string) => (
          <Tooltip title={v}>
            <span style={{ whiteSpace: 'nowrap' }}>{v || '—'}</span>
          </Tooltip>
        ),
      },
      {
        title: 'UOM',
        dataIndex: 'uomCode',
        key: 'uomCode',
        width: 75,
        align: 'center',
        render: (v: string) => <Tag color="cyan" style={{ margin: 0 }}>{v || '—'}</Tag>,
      },
      {
        title: 'Quantity',
        dataIndex: 'quantity',
        key: 'quantity',
        width: 120,
        align: 'right',
        render: (v: number, r) => {
          if (editingLedgerId === r.ledgerId) {
            return (
              <InputNumber
                size="small"
                min={0}
                controls={false}
                value={editQty}
                onChange={(val) => setEditQty(Number(val ?? 0))}
                style={{ width: 95, fontVariantNumeric: 'tabular-nums' }}
              />
            );
          }
          return (
            <Text strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {Number(v || 0).toLocaleString()}
            </Text>
          );
        },
      },
      {
        title: 'Unit Cost (PKR)',
        dataIndex: 'unitCost',
        key: 'unitCost',
        width: 135,
        align: 'right',
        render: (v: number | undefined, r) => {
          if (editingLedgerId === r.ledgerId) {
            return (
              <InputNumber
                size="small"
                min={0}
                controls={false}
                value={editUnitCost}
                onChange={(val) => setEditUnitCost(Number(val ?? 0))}
                style={{ width: 105, fontVariantNumeric: 'tabular-nums' }}
              />
            );
          }
          const cost = Number(v || 0);
          return cost > 0 ? (
            <Text strong style={{ color: token.colorPrimary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              Rs. {cost.toLocaleString()}
            </Text>
          ) : (
            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums' }}>Rs. 0</Text>
          );
        },
      },
      {
        title: 'Total Value (PKR)',
        key: 'totalCost',
        width: 140,
        align: 'right',
        render: (_: any, r) => {
          const val =
            editingLedgerId === r.ledgerId
              ? Number(editQty || 0) * Number(editUnitCost || 0)
              : Number(r.quantity || 0) * Number(r.unitCost || 0);
          return val > 0 ? (
            <Text strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              Rs. {val.toLocaleString()}
            </Text>
          ) : (
            <Text type="secondary">—</Text>
          );
        },
      },
      {
        title: 'Batch #',
        dataIndex: 'batchNumber',
        key: 'batchNumber',
        width: 115,
        ellipsis: true,
        render: (v: string | null) => <span style={{ whiteSpace: 'nowrap' }}>{v || '—'}</span>,
      },
      {
        title: 'Notes',
        dataIndex: 'notes',
        key: 'notes',
        width: 170,
        ellipsis: true,
        render: (v: string | null, r) => {
          if (editingLedgerId === r.ledgerId) {
            return (
              <Input
                size="small"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Optional notes"
              />
            );
          }
          return v ? (
            <Tooltip title={v}>
              <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{v}</Text>
            </Tooltip>
          ) : (
            <Text type="secondary">—</Text>
          );
        },
      },
      {
        title: 'Edit',
        key: 'actions',
        width: 85,
        align: 'center',
        render: (_: any, r) => {
          if (isReversed) {
            return (
              <Tooltip title="Restore batch first to edit lines">
                <Text type="secondary" style={{ fontSize: 11 }}>Locked</Text>
              </Tooltip>
            );
          }
          if (!canUpdateLine) {
            return <Text type="secondary" style={{ fontSize: 11 }}>Read-only</Text>;
          }
          if (editingLedgerId === r.ledgerId) {
            return (
              <Space size={4}>
                <Button
                  type="primary"
                  size="small"
                  icon={<CheckOutlined />}
                  loading={savingLine}
                  onClick={() => handleSaveLineEdit(r.ledgerId)}
                />
                <Button
                  size="small"
                  icon={<CloseOutlined />}
                  disabled={savingLine}
                  onClick={() => setEditingLedgerId(null)}
                />
              </Space>
            );
          }
          return (
            <Tooltip title="Edit Quantity / Unit Cost / Notes">
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditingLedgerId(r.ledgerId);
                  setEditQty(Number(r.quantity || 0));
                  setEditUnitCost(Number(r.unitCost || 0));
                  setEditNotes(r.notes || '');
                }}
              />
            </Tooltip>
          );
        },
      },
    ];
  };

  const batchColumns: ColumnsType<OpeningStockHistoryBatch> = [
    {
      title: 'Batch Reference #',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 175,
      render: (v: string, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}
          onClick={() => toggleExpand(r.key)}
        >
          {v}
        </Button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 105,
      render: (v: string) => (
        <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          {v ? dayjs(v).format('DD-MMM-YYYY') : '—'}
        </span>
      ),
    },
    {
      title: 'Division',
      dataIndex: 'divisionName',
      key: 'divisionName',
      width: 165,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <span style={{ whiteSpace: 'nowrap' }}>{v || '—'}</span>
        </Tooltip>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 185,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text strong style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{v || '—'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Items Count',
      dataIndex: 'lineCount',
      key: 'lineCount',
      width: 95,
      align: 'center',
      render: (v: number) => (
        <Tag color="blue" style={{ margin: 0, fontVariantNumeric: 'tabular-nums' }}>
          {v}
        </Tag>
      ),
    },
    {
      title: 'Total Qty',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 105,
      align: 'right',
      render: (v: number) => (
        <Text strong style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {Number(v || 0).toLocaleString()}
        </Text>
      ),
    },
    {
      title: 'Total Value',
      key: 'totalValue',
      width: 135,
      align: 'right',
      render: (_: any, r) => {
        const val =
          r.totalValue != null
            ? Number(r.totalValue)
            : (r.lines || []).reduce(
                (sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0),
                0,
              );
        return val > 0 ? (
          <Text strong style={{ color: token.colorPrimary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            PKR {val.toLocaleString()}
          </Text>
        ) : (
          <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            PKR 0
          </Text>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 105,
      align: 'center',
      render: (st: string | undefined, r) => {
        const normalized = String(st || 'POSTED').toUpperCase();
        if (normalized === 'REVERSED') {
          const tip = r.reversedAt
            ? `Reversed on ${dayjs(r.reversedAt).format('DD-MMM-YYYY HH:mm')}${r.reversedByName ? ` by ${r.reversedByName}` : ''}`
            : 'Reversed';
          return (
            <Tooltip title={tip}>
              <Tag color="volcano" style={{ margin: 0, fontWeight: 700 }}>
                REVERSED
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Tag color="success" style={{ margin: 0, fontWeight: 700 }}>
            POSTED
          </Tag>
        );
      },
    },
    {
      title: 'Posted By',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 120,
      ellipsis: true,
      render: (v: string) => (
        <Tooltip title={v}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{v || 'System'}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 220,
      align: 'center',
      render: (_: any, r) => {
        const isReversed = String(r.status || 'POSTED').toUpperCase() === 'REVERSED';
        const isExpanded = expandedKeys.includes(r.key);
        return (
          <Space size={6} style={{ whiteSpace: 'nowrap' }}>
            <Button
              size="small"
              icon={isExpanded ? <EyeInvisibleOutlined /> : <EyeOutlined />}
              onClick={() => toggleExpand(r.key)}
            >
              {isExpanded ? 'Hide Lines' : 'View Lines'}
            </Button>
            {canReverseRestore && !isReversed && (
              <Tooltip title="Safely undo / reverse batch and deduct stock balances">
                <Button
                  size="small"
                  danger
                  icon={<RollbackOutlined />}
                  onClick={() =>
                    setActionTarget({
                      kind: 'reverse',
                      referenceNumber: r.referenceNumber,
                      warehouseId: r.warehouseId,
                      warehouseName: r.warehouseName,
                      lineCount: r.lineCount,
                      totalQuantity: Number(r.totalQuantity || 0),
                    })
                  }
                >
                  Undo / Reverse
                </Button>
              </Tooltip>
            )}
            {canReverseRestore && isReversed && (
              <Tooltip title="Restore and re-post this reversed batch into stock">
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<RedoOutlined />}
                  onClick={() =>
                    setActionTarget({
                      kind: 'restore',
                      referenceNumber: r.referenceNumber,
                      warehouseId: r.warehouseId,
                      warehouseName: r.warehouseName,
                      lineCount: r.lineCount,
                      totalQuantity: Number(r.totalQuantity || 0),
                    })
                  }
                >
                  Restore / Re-Post
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  const scopedWarehouses = divisionFilter
    ? warehouses.filter((w) => (w.divisionId || w.division_id) === divisionFilter)
    : warehouses;

  return (
    <>
      <style>{`
        .opening-stock-history-compact .ant-table-cell {
          white-space: nowrap;
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      <DraggableResizableModal
        open={open}
        onCancel={onClose}
        title="Opening Stock Batch History"
        subtitle="Inspect batch lines, safely undo/reverse accidental imports, or restore reversed batches"
        infoTooltip="Drag header to move, drag edges or corner to resize, or click Minimize to collapse to a floating dock."
        footer={null}
        width={1240}
        height={680}
        minWidth={820}
        minHeight={440}
        allowMinimize
        allowMaximize
        destroyOnHidden
      >
        <div>
          <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap size={8}>
              <Input
                placeholder="Search Batch #, Item Code, or Item Name..."
                prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onPressEnter={fetchHistory}
                style={{ width: 250 }}
                allowClear
              />
              {divisions.length > 0 && (
                <Select
                  allowClear
                  placeholder="All Divisions"
                  value={divisionFilter}
                  onChange={(v) => {
                    setDivisionFilter(v);
                    setWarehouseFilter(undefined);
                  }}
                  style={{ width: 190 }}
                  showSearch
                  optionFilterProp="label"
                  options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                />
              )}
              <Select
                allowClear
                placeholder="All Warehouses"
                value={warehouseFilter}
                onChange={setWarehouseFilter}
                style={{ width: 215 }}
                showSearch
                optionFilterProp="label"
                options={scopedWarehouses.map((w) => ({
                  value: w.id,
                  label: `${w.warehouseCode || w.code || w.warehouse_code || ''} — ${w.name}`.replace(/^ — /, ''),
                }))}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 145 }}
                options={[
                  { value: 'ALL', label: 'All Statuses' },
                  { value: 'POSTED', label: 'Posted Only' },
                  { value: 'REVERSED', label: 'Reversed Only' },
                ]}
              />
            </Space>
            <Button icon={<ReloadOutlined />} onClick={fetchHistory} loading={loading}>
              Refresh
            </Button>
          </Space>

          <Table
            className="opening-stock-history-compact"
            columns={batchColumns}
            dataSource={batches}
            rowKey="key"
            loading={loading}
            size="small"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 12, showTotal: (t) => `${t} batch vouchers` }}
            expandable={{
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
              expandedRowRender: (batch) => (
                <Table
                  className="opening-stock-history-compact"
                  columns={buildLineColumns(batch.status || 'POSTED')}
                  dataSource={batch.lines}
                  rowKey="ledgerId"
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                />
              ),
            }}
          />
        </div>
      </DraggableResizableModal>

      {/* Centered Safe Reverse / Restore Confirmation Modal */}
      <Modal
        open={Boolean(actionTarget)}
        centered
        zIndex={2700}
        title={
          <Space>
            <ExclamationCircleOutlined
              style={{ color: actionTarget?.kind === 'reverse' ? token.colorError : token.colorPrimary }}
            />
            <span>
              {actionTarget?.kind === 'reverse'
                ? 'Undo / Reverse Opening Stock Batch?'
                : 'Restore / Re-Post Opening Stock Batch?'}
            </span>
          </Space>
        }
        onCancel={() => !acting && setActionTarget(null)}
        onOk={handleConfirmBatchAction}
        confirmLoading={acting}
        okText={actionTarget?.kind === 'reverse' ? 'Confirm Safe Reversal' : 'Confirm Restore & Re-Post'}
        cancelText="Cancel"
        okButtonProps={actionTarget?.kind === 'reverse' ? { danger: true } : { type: 'primary' }}
      >
        <Text type="secondary">
          {actionTarget?.kind === 'reverse'
            ? `This will post exact reversing OUT ledger entries for all ${actionTarget.lineCount} item(s) (${actionTarget.totalQuantity.toLocaleString()} total qty) under ${actionTarget.referenceNumber} and deduct stock from ${actionTarget.warehouseName}. Reversal will be blocked automatically if any quantity has already been consumed.`
            : `This will re-post all ${actionTarget?.lineCount || 0} preserved item(s) (${actionTarget?.totalQuantity.toLocaleString() || 0} total qty) under ${actionTarget?.referenceNumber} back into ${actionTarget?.warehouseName} and set the batch status back to POSTED.`}
        </Text>
      </Modal>
    </>
  );
};

export default OpeningStockHistoryModal;
