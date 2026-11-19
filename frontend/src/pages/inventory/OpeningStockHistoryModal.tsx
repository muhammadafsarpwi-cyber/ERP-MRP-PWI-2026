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
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { DraggableResizableModal } from '../../components/shared';

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
  createdAt: string;
}

export interface OpeningStockHistoryBatch {
  key: string;
  referenceNumber: string;
  transactionDate: string;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  divisionName: string;
  createdByName: string;
  lineCount: number;
  totalQuantity: number;
  totalValue?: number;
  lines: OpeningStockHistoryLine[];
}

export interface OpeningStockHistoryModalProps {
  open: boolean;
  onClose: () => void;
  warehouses: Array<{ id: string; name: string; code?: string }>;
  onHistoryChanged?: () => void;
}

export const OpeningStockHistoryModal: React.FC<OpeningStockHistoryModalProps> = ({
  open,
  onClose,
  warehouses,
  onHistoryChanged,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const [batches, setBatches] = useState<OpeningStockHistoryBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState<string | undefined>(undefined);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  // Inline line edit state
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editUnitCost, setEditUnitCost] = useState<number>(0);
  const [editNotes, setEditNotes] = useState<string>('');
  const [savingLine, setSavingLine] = useState(false);

  // Centered delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: 'line'; ledgerId: string; label: string }
    | { kind: 'batch'; referenceNumber: string; lineCount: number }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (warehouseFilter) params.warehouseId = warehouseFilter;
      if (searchText.trim()) params.search = searchText.trim();
      const res = await apiService.get<any>('/inventory/opening-stock/history', params);
      const list: OpeningStockHistoryBatch[] = Array.isArray(res) ? res : res?.data || [];
      setBatches(list);
      if (list.length === 1) {
        setExpandedKeys([list[0].key]);
      }
    } catch {
      message.error('Failed to load opening stock history');
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter, searchText, message]);

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
      message.success('Opening stock line updated and stock balance & cost synced');
      setEditingLedgerId(null);
      await fetchHistory();
      onHistoryChanged?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to update line');
    } finally {
      setSavingLine(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === 'line') {
        await apiService.delete(`/inventory/opening-stock/lines/${deleteTarget.ledgerId}`);
        message.success('Opening stock line reversed and deleted');
      } else {
        await apiService.delete(
          `/inventory/opening-stock/batches/${encodeURIComponent(deleteTarget.referenceNumber)}`,
        );
        message.success(`Opening stock batch ${deleteTarget.referenceNumber} reversed and deleted`);
      }
      setDeleteTarget(null);
      await fetchHistory();
      onHistoryChanged?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  const lineColumns: ColumnsType<OpeningStockHistoryLine> = [
    {
      title: '#',
      key: 'idx',
      width: 45,
      align: 'center',
      render: (_: any, __: any, i: number) => <Text type="secondary">{i + 1}</Text>,
    },
    {
      title: 'Item Code & Name',
      key: 'item',
      render: (_: any, r) => (
        <div>
          <Text strong style={{ color: token.colorPrimary, fontFamily: 'monospace' }}>
            {r.itemCode}
          </Text>
          <div style={{ fontSize: 12, color: token.colorTextSecondary }}>{r.itemName}</div>
        </div>
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 80,
      align: 'center',
      render: (v: string) => <Tag color="cyan" style={{ margin: 0 }}>{v || '—'}</Tag>,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 140,
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
              style={{ width: 95 }}
            />
          );
        }
        return <Text strong>{Number(v || 0).toLocaleString()}</Text>;
      },
    },
    {
      title: 'Unit Cost (PKR)',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 140,
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
              style={{ width: 105 }}
            />
          );
        }
        const cost = Number(v || 0);
        return cost > 0 ? (
          <Text strong style={{ color: '#1D4ED8' }}>Rs. {cost.toLocaleString()}</Text>
        ) : (
          <Text type="secondary">Rs. 0</Text>
        );
      },
    },
    {
      title: 'Total Cost (PKR)',
      key: 'totalCost',
      width: 135,
      align: 'right',
      render: (_: any, r) => {
        const val =
          editingLedgerId === r.ledgerId
            ? Number(editQty || 0) * Number(editUnitCost || 0)
            : Number(r.quantity || 0) * Number(r.unitCost || 0);
        return val > 0 ? <Text strong>Rs. {val.toLocaleString()}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Batch #',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 120,
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
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
        return v ? <Text style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>;
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 120,
      align: 'center',
      render: (_: any, r) => {
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
          <Space size={4}>
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
            <Tooltip title="Reverse & Delete Line">
              <Button
                type="text"
                danger
                size="small"
                icon={<DeleteOutlined />}
                onClick={() =>
                  setDeleteTarget({
                    kind: 'line',
                    ledgerId: r.ledgerId,
                    label: `${r.itemCode} (${r.quantity} ${r.uomCode || ''})`,
                  })
                }
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  const batchColumns: ColumnsType<OpeningStockHistoryBatch> = [
    {
      title: 'Reference #',
      dataIndex: 'referenceNumber',
      key: 'referenceNumber',
      width: 190,
      render: (v: string, r) => (
        <Button
          type="link"
          size="small"
          style={{ padding: 0, fontWeight: 700, fontFamily: 'monospace' }}
          onClick={() =>
            setExpandedKeys((prev) =>
              prev.includes(r.key) ? prev.filter((k) => k !== r.key) : [...prev, r.key],
            )
          }
        >
          {v}
        </Button>
      ),
    },
    {
      title: 'Posting Date',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 130,
      render: (v: string) => (v ? dayjs(v).format('DD-MMM-YYYY') : '—'),
    },
    {
      title: 'Division & Warehouse',
      key: 'warehouse',
      render: (_: any, r) => (
        <div>
          <Text strong style={{ fontSize: 12.5 }}>{r.warehouseName}</Text>
          {r.divisionName && (
            <div style={{ fontSize: 11, color: token.colorTextSecondary }}>{r.divisionName}</div>
          )}
        </div>
      ),
    },
    {
      title: 'Items',
      dataIndex: 'lineCount',
      key: 'lineCount',
      width: 90,
      align: 'center',
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Total Qty',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 110,
      align: 'right',
      render: (v: number) => <Text strong>{Number(v || 0).toLocaleString()}</Text>,
    },
    {
      title: 'Total Cost (PKR)',
      key: 'totalValue',
      width: 150,
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
          <Text strong style={{ color: '#1D4ED8' }}>
            Rs. {val.toLocaleString()}
          </Text>
        ) : (
          <Text type="secondary">Rs. 0</Text>
        );
      },
    },
    {
      title: 'Posted By',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 140,
      render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 150,
      align: 'center',
      render: (_: any, r) => (
        <Space size={4}>
          <Button
            size="small"
            onClick={() =>
              setExpandedKeys((prev) =>
                prev.includes(r.key) ? prev.filter((k) => k !== r.key) : [...prev, r.key],
              )
            }
          >
            {expandedKeys.includes(r.key) ? 'Hide Items' : 'View Items'}
          </Button>
          <Tooltip title="Reverse & Delete Entire Batch">
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                setDeleteTarget({
                  kind: 'batch',
                  referenceNumber: r.referenceNumber,
                  lineCount: r.lineCount,
                })
              }
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <>
      <DraggableResizableModal
        open={open}
        onCancel={onClose}
        title="Opening Stock History"
        subtitle="Inspect, edit unit cost/quantity, or reverse posted opening stock vouchers"
        infoTooltip="Drag header to move, drag edges or corner to resize, or click Minimize to collapse to a floating dock."
        footer={null}
        width={1140}
        height={660}
        minWidth={720}
        minHeight={420}
        allowMinimize
        allowMaximize
        destroyOnHidden
      >
        <div>
          <Space style={{ marginBottom: 14, width: '100%', justifyContent: 'space-between' }} wrap>
            <Space wrap>
              <Input
                placeholder="Search Reference #, Item Code, or Item Name..."
                prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onPressEnter={fetchHistory}
                style={{ width: 290 }}
                allowClear
              />
              <Select
                allowClear
                placeholder="All Warehouses"
                value={warehouseFilter}
                onChange={setWarehouseFilter}
                style={{ width: 240 }}
                showSearch
                optionFilterProp="label"
                options={warehouses.map((w) => ({
                  value: w.id,
                  label: `${w.code ? `${w.code} — ` : ''}${w.name}`,
                }))}
              />
            </Space>
            <Button icon={<ReloadOutlined />} onClick={fetchHistory} loading={loading}>
              Refresh
            </Button>
          </Space>

          <Table
            columns={batchColumns}
            dataSource={batches}
            rowKey="key"
            loading={loading}
            size="middle"
            scroll={{ x: 'max-content' }}
            pagination={{ pageSize: 10, showTotal: (t) => `${t} vouchers` }}
            expandable={{
              expandedRowKeys: expandedKeys,
              onExpandedRowsChange: (keys) => setExpandedKeys([...keys]),
              expandedRowRender: (batch) => (
                <Table
                  columns={lineColumns}
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

      {/* Centered Reverse/Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteTarget)}
        centered
        zIndex={2700}
        title={
          <Space>
            <ExclamationCircleOutlined style={{ color: '#ef4444' }} />
            <span>
              {deleteTarget?.kind === 'batch'
                ? 'Reverse & Delete Opening Stock Batch?'
                : 'Reverse & Delete Opening Stock Line?'}
            </span>
          </Space>
        }
        onCancel={() => !deleting && setDeleteTarget(null)}
        onOk={handleConfirmDelete}
        confirmLoading={deleting}
        okText="Confirm & Reverse"
        cancelText="Go Back"
        okButtonProps={{ danger: true }}
      >
        <Text type="secondary">
          {deleteTarget?.kind === 'batch'
            ? `This will reverse all ${deleteTarget.lineCount} items under ${deleteTarget.referenceNumber} and deduct their quantities from current warehouse stock.`
            : `This will reverse ${deleteTarget?.label || 'this line'} and deduct its quantity from current warehouse stock.`}
        </Text>
      </Modal>
    </>
  );
};

export default OpeningStockHistoryModal;
