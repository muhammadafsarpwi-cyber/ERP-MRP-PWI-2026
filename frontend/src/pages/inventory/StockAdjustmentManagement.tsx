import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip, Segmented, Spin, Space,
} from 'antd';
import {
  PlusOutlined, EditOutlined, EyeOutlined, InfoCircleOutlined,
  WarningOutlined, ArrowRightOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const ADJUSTMENT_TYPES = [
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In (+)' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out (-)' },
];

const STATUS_OPTIONS = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED'];

interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  adjustmentCode?: string;
  itemId: string;
  itemName?: string;
  itemCode?: string;
  warehouseId: string;
  warehouseName?: string;
  adjustmentType: string;
  quantity: number;
  uomCode?: string;
  reason: string;
  status: string;
  countedQuantity?: number;
  currentStock?: number;
}

interface DropdownOption {
  id: string;
  name: string;
  itemCode?: string;
  warehouseCode?: string;
  code?: string;
  baseUom?: any;
  uom?: any;
}

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  APPROVED: 'green',
  REJECTED: 'red',
};

const StockAdjustmentManagement: React.FC = () => {
  const { message } = App.useApp();
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StockAdjustment | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchAdjustments = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: StockAdjustment[]; total: number }>('/inventory/adjustments', params);
      setAdjustments(response.data);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch adjustments');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load adjustment dropdowns';
      message.error(`Unable to load adjustment options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchAdjustments(page);
  }, [page, fetchAdjustments]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: StockAdjustment) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<StockAdjustment> = [
    {
      title: 'Adj #',
      dataIndex: 'adjustmentNumber',
      key: 'adjustmentNumber',
      width: 140,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: 'Item',
      dataIndex: 'itemName',
      key: 'itemName',
      ellipsis: true,
      render: (name: string, record: StockAdjustment) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name || record.itemId}</span>
          {record.itemCode && (
            <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--theme-text-muted)' }}>
              ({record.itemCode})
            </span>
          )}
        </div>
      ),
    },
    {
      title: 'Warehouse',
      dataIndex: 'warehouseName',
      key: 'warehouseName',
      width: 150,
      render: (wName: string) => <span>{wName || '—'}</span>,
    },
    {
      title: 'Type',
      dataIndex: 'adjustmentType',
      key: 'adjustmentType',
      width: 150,
      render: (v: string) => {
        const isIn = v === 'ADJUSTMENT_IN' || v === 'INCREASE';
        return (
          <Tag color={isIn ? 'green' : 'red'} className="erp-table-tag">
            {isIn ? '+ Adjustment In' : '- Adjustment Out'}
          </Tag>
        );
      },
    },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, record: StockAdjustment) => {
        const isIn = record.adjustmentType === 'ADJUSTMENT_IN' || record.adjustmentType === 'INCREASE';
        return (
          <span style={{ fontWeight: 600, fontFamily: 'monospace', color: isIn ? '#10b981' : '#ef4444' }}>
            {isIn ? '+' : '-'}{formatNumber(v, 4)}
          </span>
        );
      },
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 70,
      render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span>,
    },
    {
      title: 'Reason',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
      render: (r: string) => <span title={r}>{r || '—'}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'} className="erp-table-tag">{s}</Tag>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <TableActions>
          <Tooltip title={record.status === 'DRAFT' ? 'Edit Adjustment' : 'View Details'}>
            <Button
              type="text"
              size="small"
              icon={record.status === 'DRAFT' ? <EditOutlined /> : <EyeOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
          Stock Adjustments
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Reconcile warehouse discrepancies, stock counting corrections, and inventory adjustments.
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search adjustments..."
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        filters={[
          {
            key: 'status',
            placeholder: 'Status',
            value: filterStatus,
            onChange: (v) => { setFilterStatus(v); setPage(1); },
            options: STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
          },
        ]}
        onRefresh={() => fetchAdjustments(page)}
        primaryAction={{
          label: 'New Adjustment',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={adjustments}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1050 }}
        emptyTitle="No stock adjustments found"
        emptyDescription="No adjustment records match your current criteria."
        emptyActionLabel="Create Adjustment"
        onEmptyAction={handleCreate}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      <StockAdjustmentModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchAdjustments(page);
        }}
      />
    </div>
  );
};

interface StockAdjustmentModalProps {
  open: boolean;
  editingItem: StockAdjustment | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  open,
  editingItem,
  items,
  warehouses,
  onCancel,
  onSuccess,
}) => {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // Live item balance tracking
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(undefined);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>(undefined);
  const [itemBalances, setItemBalances] = useState<any[]>([]);
  const [fetchingBalances, setFetchingBalances] = useState(false);

  // Dual mode: PHYSICAL_COUNT (default) vs DIRECT
  const [adjustmentMode, setAdjustmentMode] = useState<'PHYSICAL_COUNT' | 'DIRECT'>('PHYSICAL_COUNT');
  const [countedQty, setCountedQty] = useState<number | null>(null);
  const [directQty, setDirectQty] = useState<number | null>(null);
  const [directType, setDirectType] = useState<string>('ADJUSTMENT_IN');

  useEffect(() => {
    if (open) {
      if (editingItem) {
        setSelectedItemId(editingItem.itemId);
        setSelectedWarehouseId(editingItem.warehouseId);
        setAdjustmentMode('DIRECT');
        const isOut = editingItem.adjustmentType === 'DECREASE' || editingItem.adjustmentType === 'ADJUSTMENT_OUT';
        setDirectType(isOut ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN');
        setDirectQty(Number(editingItem.quantity || 0));
        setCountedQty(null);

        form.setFieldsValue({
          itemId: editingItem.itemId,
          warehouseId: editingItem.warehouseId,
          adjustmentType: isOut ? 'ADJUSTMENT_OUT' : 'ADJUSTMENT_IN',
          quantity: Number(editingItem.quantity || 0),
          reason: editingItem.reason ?? '',
        });
      } else {
        form.resetFields();
        setSelectedItemId(undefined);
        setSelectedWarehouseId(undefined);
        setItemBalances([]);
        setAdjustmentMode('PHYSICAL_COUNT');
        setCountedQty(null);
        setDirectQty(null);
        setDirectType('ADJUSTMENT_IN');
        form.setFieldsValue({
          adjustmentType: 'ADJUSTMENT_IN',
          quantity: 0,
        });
      }
    }
  }, [open, editingItem, form]);

  // Fetch balances whenever selected item changes
  useEffect(() => {
    if (!open || !selectedItemId) {
      setItemBalances([]);
      return;
    }
    let active = true;
    setFetchingBalances(true);
    apiService
      .get<{ data: any[] }>('/inventory/balances', {
        itemId: selectedItemId,
        limit: 100,
      })
      .then((res) => {
        if (!active) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        setItemBalances(list);

        // Auto-select warehouse if not selected yet and item exists in warehouse(s)
        const currentWh = form.getFieldValue('warehouseId');
        if (!currentWh && list.length > 0 && list[0]?.warehouseId) {
          form.setFieldValue('warehouseId', list[0].warehouseId);
          setSelectedWarehouseId(list[0].warehouseId);
        }
      })
      .catch((err) => {
        console.error('Failed to load item balances', err);
        if (active) setItemBalances([]);
      })
      .finally(() => {
        if (active) setFetchingBalances(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedItemId, form]);

  const isReadOnly = Boolean(editingItem && editingItem.status !== 'DRAFT');

  // Active warehouse balance
  const currentBalance = useMemo(() => {
    if (!selectedWarehouseId || !itemBalances.length) return null;
    return itemBalances.find((b) => b.warehouseId === selectedWarehouseId) || null;
  }, [selectedWarehouseId, itemBalances]);

  const currentStock = currentBalance ? Number(currentBalance.onHand || 0) : 0;
  const reservedStock = currentBalance ? Number(currentBalance.reserved || 0) : 0;
  const availableStock = currentBalance ? Number(currentBalance.available ?? (currentStock - reservedStock)) : 0;

  const currentUom = useMemo(() => {
    if (currentBalance?.uom?.code) return currentBalance.uom.code;
    if (currentBalance?.uom?.symbol) return currentBalance.uom.symbol;
    const itemObj: any = items.find((i: any) => i.id === selectedItemId);
    return itemObj?.baseUom?.code || itemObj?.baseUom?.symbol || itemObj?.uom || '';
  }, [currentBalance, items, selectedItemId]);

  const otherWarehouseBalances = useMemo(() => {
    if (!itemBalances.length) return [];
    return itemBalances.filter(
      (b) => b.warehouseId !== selectedWarehouseId && (Number(b.onHand) !== 0 || Number(b.reserved) !== 0)
    );
  }, [itemBalances, selectedWarehouseId]);

  // Calculations for Physical Count Mode
  const variance = useMemo(() => {
    if (countedQty === null || countedQty === undefined || isNaN(countedQty)) return null;
    return Number(countedQty) - currentStock;
  }, [countedQty, currentStock]);

  const countAdjQty = variance !== null ? Math.abs(variance) : 0;

  // Calculations for Direct Mode
  const computedDirectAdjType = useMemo(() => {
    if (directQty !== null && directQty < 0) {
      return 'ADJUSTMENT_OUT';
    }
    return directType;
  }, [directQty, directType]);

  const computedDirectQty = useMemo(() => {
    if (directQty === null || directQty === undefined || isNaN(directQty)) return 0;
    return Math.abs(directQty);
  }, [directQty]);

  const projectedBalance = useMemo(() => {
    if (computedDirectAdjType === 'ADJUSTMENT_OUT') {
      return currentStock - computedDirectQty;
    } else {
      return currentStock + computedDirectQty;
    }
  }, [currentStock, computedDirectAdjType, computedDirectQty]);

  const handleSubmit = async () => {
    if (isReadOnly) {
      onCancel();
      return;
    }
    try {
      const values = await form.validateFields();

      let finalType: string;
      let finalQty: number;
      let finalCounted: number | undefined = undefined;
      let finalCurrent: number | undefined = undefined;

      if (adjustmentMode === 'PHYSICAL_COUNT') {
        if (countedQty === null || countedQty === undefined || isNaN(countedQty)) {
          message.error('Please enter the physical counted quantity');
          return;
        }
        const diff = Number(countedQty) - currentStock;
        if (diff === 0) {
          message.warning('Physical count matches system stock. No adjustment needed.');
          return;
        }
        finalType = diff >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT';
        finalQty = Math.abs(diff);
        finalCounted = Number(countedQty);
        finalCurrent = Number(currentStock);
      } else {
        const rawQty = Number(values.quantity);
        if (isNaN(rawQty) || rawQty === 0) {
          message.error('Please enter a valid non-zero adjustment quantity');
          return;
        }
        if (rawQty < 0) {
          finalType = 'ADJUSTMENT_OUT';
          finalQty = Math.abs(rawQty);
        } else {
          finalType = values.adjustmentType || 'ADJUSTMENT_IN';
          finalQty = rawQty;
        }
      }

      setSubmitting(true);
      if (editingItem) {
        await apiService.patch(`/inventory/adjustments/${editingItem.id}`, {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          adjustmentType: finalType,
          quantity: finalQty,
          countedQuantity: finalCounted,
          currentStock: finalCurrent,
          reason: values.reason,
        });
        message.success('Adjustment updated successfully');
      } else {
        await apiService.post('/inventory/adjustments', {
          itemId: values.itemId,
          warehouseId: values.warehouseId,
          adjustmentType: finalType,
          quantity: finalQty,
          countedQuantity: finalCounted,
          currentStock: finalCurrent,
          reason: values.reason,
        });
        message.success('Stock adjustment created successfully');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Operation failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        editingItem
          ? isReadOnly
            ? `View Adjustment (${editingItem.status})`
            : 'Edit Adjustment'
          : 'Stock Adjustment & Reconciliation'
      }
      open={open}
      onOk={isReadOnly ? onCancel : handleSubmit}
      confirmLoading={submitting}
      onCancel={onCancel}
      width={700}
      destroyOnHidden
      footer={
        isReadOnly
          ? [
              <Button key="close" type="primary" onClick={onCancel}>
                Close
              </Button>,
            ]
          : undefined
      }
    >
      <Form form={form} layout="vertical" disabled={isReadOnly}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="itemId"
              label="Item"
              rules={[{ required: true, message: 'Please select an item' }]}
            >
              <Select
                showSearch
                placeholder="Search and select item"
                optionFilterProp="label"
                onChange={(val) => {
                  setSelectedItemId(val);
                }}
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="warehouseId"
              label="Warehouse"
              rules={[{ required: true, message: 'Please select warehouse' }]}
            >
              <Select
                showSearch
                placeholder="Select warehouse"
                optionFilterProp="label"
                onChange={(val) => {
                  setSelectedWarehouseId(val);
                }}
                options={warehouses.map((w: any) => ({
                  value: w.id,
                  label: w.warehouseCode ? `${w.warehouseCode} — ${w.name}` : w.name || w.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Live Inventory Status Report */}
        {selectedItemId ? (
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--theme-border, #374151)',
              borderRadius: 8,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <InfoCircleOutlined style={{ color: '#3b82f6', fontSize: 16 }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--theme-text)' }}>
                  Current Inventory Position
                </span>
              </div>
              {fetchingBalances ? (
                <Spin size="small" />
              ) : (
                <div>
                  {currentStock > 0 && <Tag color="success">In Stock</Tag>}
                  {currentStock < 0 && <Tag color="error">Negative Stock</Tag>}
                  {currentStock === 0 && <Tag color="default">Zero Stock</Tag>}
                </div>
              )}
            </div>

            <Row gutter={12}>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    On-Hand
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: currentStock < 0 ? '#ef4444' : currentStock > 0 ? '#10b981' : 'var(--theme-text)',
                    }}
                  >
                    {formatNumber(currentStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    Reserved
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace', color: 'var(--theme-text)' }}>
                    {formatNumber(reservedStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div
                  style={{
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginBottom: 2 }}>
                    Available
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: 700,
                      fontFamily: 'monospace',
                      color: availableStock < 0 ? '#ef4444' : '#3b82f6',
                    }}
                  >
                    {formatNumber(availableStock, 4)} {currentUom}
                  </div>
                </div>
              </Col>
            </Row>

            {currentStock < 0 && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 6,
                  color: '#fca5a5',
                  fontSize: 12,
                }}
              >
                <WarningOutlined style={{ marginRight: 6 }} />
                This item currently has negative stock ({formatNumber(currentStock, 4)} {currentUom}). Adjusting after physical count will reconcile this balance.
              </div>
            )}

            {otherWarehouseBalances.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
                <span style={{ fontSize: 12, color: 'var(--theme-text-muted)', marginRight: 8 }}>
                  Other Warehouses:
                </span>
                <Space size={[4, 6]} wrap style={{ marginTop: 4 }}>
                  {otherWarehouseBalances.map((b) => (
                    <Tooltip key={b.warehouseId} title="Click to select this warehouse">
                      <Tag
                        color="cyan"
                        style={{ cursor: 'pointer', borderRadius: 4 }}
                        onClick={() => {
                          form.setFieldValue('warehouseId', b.warehouseId);
                          setSelectedWarehouseId(b.warehouseId);
                        }}
                      >
                        {b.warehouse?.warehouseCode || b.warehouse?.name}: <b>{formatNumber(b.onHand, 2)} {currentUom}</b>
                      </Tag>
                    </Tooltip>
                  ))}
                </Space>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              padding: 12,
              marginBottom: 16,
              borderRadius: 6,
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed var(--theme-border, #374151)',
              color: 'var(--theme-text-muted)',
              fontSize: 13,
              textAlign: 'center',
            }}
          >
            Select an item above to view its current inventory position and warehouse balances.
          </div>
        )}

        {/* Mode Selector */}
        {!isReadOnly && (
          <div style={{ marginBottom: 16 }}>
            <Segmented
              block
              value={adjustmentMode}
              onChange={(val) => setAdjustmentMode(val as 'PHYSICAL_COUNT' | 'DIRECT')}
              options={[
                {
                  label: (
                    <div style={{ padding: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Physical Count Reconciliation</span>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>Enter physical count (variance auto-calculated)</div>
                    </div>
                  ),
                  value: 'PHYSICAL_COUNT',
                },
                {
                  label: (
                    <div style={{ padding: '4px 0' }}>
                      <span style={{ fontWeight: 600 }}>Direct Quantity Adjustment</span>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>Directly enter quantity (+ or -)</div>
                    </div>
                  ),
                  value: 'DIRECT',
                },
              ]}
            />
          </div>
        )}

        {/* Mode 1: Physical Count Reconciliation */}
        {adjustmentMode === 'PHYSICAL_COUNT' && !isReadOnly && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: 'rgba(59, 130, 246, 0.04)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              marginBottom: 16,
            }}
          >
            <Form.Item
              label={<b>Counted / Target Stock in Warehouse</b>}
              required
              style={{ marginBottom: 12 }}
            >
              <InputNumber
                placeholder="Enter total physical stock counted in warehouse..."
                style={{ width: '100%' }}
                step={1}
                value={countedQty}
                onChange={(val) => {
                  setCountedQty(val);
                  if (val !== null && selectedItemId) {
                    const diff = Number(val) - currentStock;
                    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
                    form.setFieldValue(
                      'reason',
                      `Physical count reconciliation: system stock was ${currentStock} ${currentUom}, physical count is ${val} ${currentUom} (adjustment: ${diffStr} ${currentUom})`
                    );
                  }
                }}
              />
            </Form.Item>

            {variance !== null && (
              <div
                style={{
                  marginTop: 10,
                  padding: 12,
                  borderRadius: 6,
                  background:
                    variance > 0
                      ? 'rgba(16, 185, 129, 0.1)'
                      : variance < 0
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(59, 130, 246, 0.1)',
                  border: `1px solid ${
                    variance > 0 ? '#10b981' : variance < 0 ? '#ef4444' : '#3b82f6'
                  }`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span
                    style={{
                      fontWeight: 600,
                      color: variance > 0 ? '#10b981' : variance < 0 ? '#ef4444' : '#3b82f6',
                    }}
                  >
                    {variance > 0
                      ? `Surplus Detected: +${formatNumber(variance, 4)} ${currentUom}`
                      : variance < 0
                      ? `Shortage Detected: -${formatNumber(Math.abs(variance), 4)} ${currentUom}`
                      : 'Exact Match: No Stock Difference'}
                  </span>
                  <Tag color={variance > 0 ? 'green' : variance < 0 ? 'red' : 'blue'}>
                    {variance > 0 ? '+ Adjustment In' : variance < 0 ? '- Adjustment Out' : 'Balanced'}
                  </Tag>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, flexWrap: 'wrap' }}>
                  <span>Current: <b>{formatNumber(currentStock, 4)}</b></span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>Counted: <b>{formatNumber(countedQty, 4)}</b></span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>
                    Action:{' '}
                    <b style={{ color: variance >= 0 ? '#10b981' : '#ef4444' }}>
                      {variance >= 0 ? `+${formatNumber(countAdjQty, 4)} (In)` : `-${formatNumber(countAdjQty, 4)} (Out)`}
                    </b>
                  </span>
                  <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                  <span>Resulting Stock: <b style={{ color: '#10b981' }}>{formatNumber(countedQty, 4)} {currentUom}</b></span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode 2: Direct Adjustment */}
        {(adjustmentMode === 'DIRECT' || isReadOnly) && (
          <div
            style={{
              padding: 14,
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--theme-border, #374151)',
              marginBottom: 16,
            }}
          >
            <Row gutter={12}>
              <Col span={12}>
                <Form.Item
                  name="adjustmentType"
                  label="Adjustment Type"
                  rules={[{ required: true, message: 'Select adjustment type' }]}
                >
                  <Select
                    options={ADJUSTMENT_TYPES}
                    value={directType}
                    onChange={(val) => setDirectType(val)}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="quantity"
                  label="Quantity"
                  rules={[{ required: true, message: 'Please enter quantity' }]}
                >
                  <InputNumber
                    step={1}
                    style={{ width: '100%' }}
                    placeholder="e.g. 5 or -5"
                    value={directQty}
                    onChange={(val) => setDirectQty(val)}
                  />
                </Form.Item>
              </Col>
            </Row>

            {directQty !== null && directQty < 0 && (
              <div
                style={{
                  marginBottom: 10,
                  padding: '6px 10px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: 4,
                  color: '#fca5a5',
                  fontSize: 12,
                }}
              >
                <InfoCircleOutlined style={{ marginRight: 6 }} />
                Negative quantity entered. System will automatically process this as <b>Adjustment Out ({Math.abs(directQty)} {currentUom})</b>.
              </div>
            )}

            {directQty !== null && directQty !== 0 && (
              <div
                style={{
                  padding: 10,
                  borderRadius: 6,
                  background: 'rgba(0, 0, 0, 0.2)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  flexWrap: 'wrap',
                }}
              >
                <span>Current: <b>{formatNumber(currentStock, 4)}</b></span>
                <span>{computedDirectAdjType === 'ADJUSTMENT_OUT' ? '-' : '+'}</span>
                <span>
                  Qty:{' '}
                  <b style={{ color: computedDirectAdjType === 'ADJUSTMENT_OUT' ? '#ef4444' : '#10b981' }}>
                    {formatNumber(computedDirectQty, 4)}
                  </b>
                </span>
                <ArrowRightOutlined style={{ fontSize: 11, color: 'var(--theme-text-muted)' }} />
                <span>
                  Projected Balance:{' '}
                  <b style={{ color: projectedBalance < 0 ? '#ef4444' : '#10b981' }}>
                    {formatNumber(projectedBalance, 4)} {currentUom}
                  </b>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Reason Field */}
        <Form.Item
          name="reason"
          label="Reason for Adjustment"
          rules={[{ required: true, message: 'Reason is required' }]}
        >
          <Input.TextArea rows={2} placeholder="Explain reason for stock adjustment..." />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StockAdjustmentManagement;
