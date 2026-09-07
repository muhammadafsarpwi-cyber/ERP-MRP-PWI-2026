import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Tag, Modal, Form, Input, Select, App,
  InputNumber, Row, Col, Tooltip, Alert, Divider, Spin,
} from 'antd';
import { PlusOutlined, EditOutlined, SwapOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const STATUS_OPTIONS = ['DRAFT', 'PENDING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];

interface StockTransfer {
  id: string;
  transferNumber: string;
  itemId: string;
  itemName?: string;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  quantity: number;
  uomCode?: string;
  status: string;
  notes: string;
}

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
  itemCode?: string;
  warehouseCode?: string;
}

interface WarehouseBalanceInfo {
  onHand: number;
  available: number;
  reserved: number;
  uomCode: string;
  whName?: string;
  whCode?: string;
}

const statusColorMap: Record<string, string> = {
  DRAFT: 'default',
  PENDING: 'orange',
  IN_TRANSIT: 'blue',
  COMPLETED: 'green',
  POSTED: 'green',
  APPROVED: 'cyan',
  CANCELLED: 'red',
};

const StockTransferManagement: React.FC = () => {
  const { message } = App.useApp();
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<StockTransfer | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string | undefined>(undefined);

  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [pageSize] = useState(20);

  const fetchTransfers = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterStatus) params.status = filterStatus;
      const response = await apiService.get<{ data: any[]; total: number }>('/inventory/transfers', params);
      const mapped: StockTransfer[] = (response.data || []).map((t: any) => {
        const line = t.lines?.[0];
        return {
          id: t.id,
          transferNumber: t.transferCode || t.transferNumber || '—',
          itemId: line?.itemId || t.itemId || '',
          itemName: line?.item?.name
            ? `${line.item.itemCode ? line.item.itemCode + ' — ' : ''}${line.item.name}`
            : t.itemName || '—',
          fromWarehouseId: t.fromWarehouseId,
          fromWarehouseName: t.fromWarehouse?.name || t.fromWarehouseName || '—',
          toWarehouseId: t.toWarehouseId,
          toWarehouseName: t.toWarehouse?.name || t.toWarehouseName || '—',
          quantity: line?.quantity != null ? Number(line.quantity) : (t.quantity != null ? Number(t.quantity) : 0),
          uomCode: line?.uom?.code || t.uomCode || '',
          status: t.status,
          notes: t.notes || '',
        };
      });
      setTransfers(mapped);
      setTotal(response.total);
    } catch (error) {
      message.error('Failed to fetch transfers');
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, pageSize, message]);

  const fetchDropdowns = useCallback(async () => {
    try {
      const [itemRes, warehouseRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 200 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Failed to load transfer dropdowns';
      message.error(`Unable to load transfer options: ${Array.isArray(msg) ? msg[0] : msg}`);
    }
  }, [message]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  useEffect(() => {
    fetchTransfers(page);
  }, [page, fetchTransfers]);

  const handleCreate = () => {
    setEditingItem(null);
    setModalVisible(true);
  };

  const handleEdit = (record: StockTransfer) => {
    setEditingItem(record);
    setModalVisible(true);
  };

  const columns: ColumnsType<StockTransfer> = [
    {
      title: 'Transfer #',
      dataIndex: 'transferNumber',
      key: 'transferNumber',
      width: 140,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    { title: 'Item', dataIndex: 'itemName', key: 'itemName', ellipsis: true },
    { title: 'From Warehouse', dataIndex: 'fromWarehouseName', key: 'fromWarehouseName', width: 160 },
    { title: 'To Warehouse', dataIndex: 'toWarehouseName', key: 'toWarehouseName', width: 160 },
    {
      title: 'Qty',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{formatNumber(v, 3)}</span>,
    },
    {
      title: 'UOM',
      dataIndex: 'uomCode',
      key: 'uomCode',
      width: 75,
      render: (v: string) => <span style={{ color: 'var(--theme-text-muted)' }}>{v || '—'}</span>,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (s: string) => <Tag color={statusColorMap[s] || 'default'} className="erp-table-tag">{s}</Tag>,
    },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
    {
      title: 'Actions',
      key: 'actions',
      width: 70,
      fixed: 'right',
      align: 'center',
      render: (_, record) => (
        <TableActions>
          <Tooltip title="Edit Transfer">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
          Stock Transfers
        </h2>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Manage inter-warehouse inventory transfers and real-time stock relocation.
        </span>
      </div>

      <TableToolbar
        searchPlaceholder="Search transfers..."
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
        onRefresh={() => fetchTransfers(page)}
        primaryAction={{
          label: 'New Transfer',
          icon: <PlusOutlined />,
          onClick: handleCreate,
        }}
      />

      <ERPTable
        columns={columns}
        dataSource={transfers}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1050 }}
        emptyTitle="No stock transfers found"
        emptyDescription="No transfer records match your current criteria."
        emptyActionLabel="Create Transfer"
        onEmptyAction={handleCreate}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />

      <StockTransferModal
        open={modalVisible}
        editingItem={editingItem}
        items={items}
        warehouses={warehouses}
        onCancel={() => setModalVisible(false)}
        onSuccess={() => {
          setModalVisible(false);
          fetchTransfers(page);
        }}
      />
    </div>
  );
};

interface StockTransferModalProps {
  open: boolean;
  editingItem: StockTransfer | null;
  items: DropdownOption[];
  warehouses: DropdownOption[];
  onCancel: () => void;
  onSuccess: () => void;
}

const StockTransferModal: React.FC<StockTransferModalProps> = ({
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
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [balances, setBalances] = useState<Record<string, WarehouseBalanceInfo>>({});
  const [itemUom, setItemUom] = useState<string>('');
  const [selectedItemInfo, setSelectedItemInfo] = useState<{ code: string; name: string } | null>(null);

  const selectedItemId = Form.useWatch('itemId', form);
  const fromWhId = Form.useWatch('fromWarehouseId', form);
  const toWhId = Form.useWatch('toWarehouseId', form);
  const rawQty = Form.useWatch('quantity', form);
  const qtyNum = Number(rawQty || 0);

  const isEditing = Boolean(editingItem);
  const isPosted = Boolean(
    editingItem &&
    (editingItem.status === 'POSTED' || editingItem.status === 'COMPLETED' || editingItem.status === 'APPROVED')
  );
  const originalTransferQty = isEditing ? Number(editingItem?.quantity || 0) : 0;

  // Initialize or reset form values
  useEffect(() => {
    if (open) {
      if (editingItem) {
        form.setFieldsValue({
          itemId: editingItem.itemId,
          quantity: Number(editingItem.quantity),
          fromWarehouseId: editingItem.fromWarehouseId,
          toWarehouseId: editingItem.toWarehouseId,
          notes: editingItem.notes ?? '',
        });
      } else {
        form.resetFields();
        form.setFieldsValue({ quantity: undefined });
      }
    }
  }, [open, editingItem, form]);

  // Load real-time stock balances across all warehouses for the selected item
  useEffect(() => {
    if (!open || !selectedItemId) {
      setBalances({});
      setItemUom('');
      setSelectedItemInfo(null);
      return;
    }
    let cancelled = false;
    setLoadingBalances(true);
    (async () => {
      try {
        const res = await apiService.get<{ data: any[] }>('/inventory/balances', {
          itemId: selectedItemId,
          limit: 100,
        });
        if (cancelled) return;
        const bMap: Record<string, WarehouseBalanceInfo> = {};
        let uom = '';
        let code = '';
        let name = '';

        for (const row of res.data || []) {
          const whId = row.warehouseId || row.warehouse?.id;
          if (whId) {
            bMap[whId] = {
              onHand: Number(row.onHand || 0),
              available: Number(row.available || 0),
              reserved: Number(row.reserved || 0),
              uomCode: row.uom?.code || row.item?.baseUom?.code || '',
              whName: row.warehouse?.name,
              whCode: row.warehouse?.warehouseCode,
            };
          }
          if (!uom && (row.uom?.code || row.item?.baseUom?.code)) {
            uom = row.uom?.code || row.item?.baseUom?.code;
          }
          if (!code && row.item?.itemCode) code = row.item.itemCode;
          if (!name && row.item?.name) name = row.item.name;
        }

        // Fallback item info from items prop if not found in balance rows
        if (!code || !name) {
          const matched = items.find((i: any) => i.id === selectedItemId);
          if (matched) {
            code = (matched as any).itemCode || matched.code || code;
            name = matched.name || name;
          }
        }

        setBalances(bMap);
        setItemUom(uom || 'KG');
        setSelectedItemInfo(code || name ? { code, name } : null);
      } catch (err) {
        console.error('Failed to load item balances', err);
      } finally {
        if (!cancelled) setLoadingBalances(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, selectedItemId, items]);

  // Warehouse balances resolution
  const fromWhName = warehouses.find((w: any) => w.id === fromWhId)?.name || 'Source Warehouse';
  const toWhName = warehouses.find((w: any) => w.id === toWhId)?.name || 'Destination Warehouse';

  const fromBalInfo = fromWhId ? balances[fromWhId] : null;
  const toBalInfo = toWhId ? balances[toWhId] : null;

  const rawFromAvailable = fromBalInfo ? fromBalInfo.available : (fromWhId ? 0 : null);
  const rawToCurrent = toBalInfo ? toBalInfo.available : (toWhId ? 0 : null);

  const isSameFromWh = Boolean(isEditing && editingItem?.fromWarehouseId === fromWhId && editingItem?.itemId === selectedItemId);
  const isSameToWh = Boolean(isEditing && editingItem?.toWarehouseId === toWhId && editingItem?.itemId === selectedItemId);

  // If already posted, the stock in source prior to this transfer was (current on-hand + transferred quantity)
  const effectiveFromAvailable = rawFromAvailable !== null
    ? (isSameFromWh && isPosted ? rawFromAvailable + originalTransferQty : rawFromAvailable)
    : null;

  // For destination warehouse, stock prior to this transfer was (current on-hand - transferred quantity)
  const effectiveToCurrent = rawToCurrent !== null
    ? (isSameToWh && isPosted ? Math.max(0, rawToCurrent - originalTransferQty) : rawToCurrent)
    : null;

  const fromRemaining = isPosted && isSameFromWh
    ? rawFromAvailable
    : (effectiveFromAvailable !== null ? effectiveFromAvailable - qtyNum : null);

  const toProjected = isPosted && isSameToWh
    ? rawToCurrent
    : (effectiveToCurrent !== null ? effectiveToCurrent + qtyNum : null);

  const isSameWarehouse = Boolean(fromWhId && toWhId && fromWhId === toWhId);
  const isOverTransfer = !isPosted && Boolean(effectiveFromAvailable !== null && qtyNum > effectiveFromAvailable);
  const isValidQuantity = qtyNum > 0;
  const canSubmit = isPosted
    ? true
    : (!isSameWarehouse && !isOverTransfer && isValidQuantity && Boolean(selectedItemId && fromWhId && toWhId));

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!isPosted && values.fromWarehouseId === values.toWarehouseId) {
        message.error('Source and Destination warehouses must be different');
        return;
      }
      setSubmitting(true);
      if (editingItem) {
        if (isPosted) {
          // If transfer was already posted, update only notes to protect inventory ledger audit trail
          await apiService.patch(`/inventory/transfers/${editingItem.id}`, {
            notes: values.notes,
          });
          message.success('Transfer remarks updated successfully!');
        } else {
          await apiService.patch(`/inventory/transfers/${editingItem.id}`, {
            itemId: values.itemId,
            quantity: Number(values.quantity),
            fromWarehouseId: values.fromWarehouseId,
            toWarehouseId: values.toWarehouseId,
            notes: values.notes,
          });
          message.success('Stock transfer updated successfully!');
        }
      } else {
        await apiService.post('/inventory/transfers', {
          itemId: values.itemId,
          quantity: Number(values.quantity),
          fromWarehouseId: values.fromWarehouseId,
          toWarehouseId: values.toWarehouseId,
          notes: values.notes,
          autoPost: true,
        });
        message.success('Stock transfer created and posted successfully!');
      }
      onSuccess();
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Transfer operation failed';
      message.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SwapOutlined style={{ color: 'var(--theme-primary, #10b981)', fontSize: 18 }} />
          <span style={{ fontSize: 16, fontWeight: 700 }}>
            {isPosted ? 'Edit Transfer Remarks (Posted)' : (editingItem ? 'Edit Stock Transfer' : 'New Stock Transfer')}
          </span>
        </div>
      }
      open={open}
      onOk={handleSubmit}
      confirmLoading={submitting}
      okButtonProps={{ disabled: !canSubmit }}
      okText={isPosted ? 'Update Remarks' : (editingItem ? 'Update Transfer' : 'Transfer & Post Stock')}
      onCancel={onCancel}
      width={720}
      style={{ top: 20 }}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          {/* Posted Transfer Notice */}
          {isPosted && (
            <Col span={24}>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontWeight: 600 }}>
                      Transfer #{editingItem?.transferNumber || ''} — Status: POSTED
                    </span>
                    <Tag color="green">COMPLETED</Tag>
                  </div>
                }
                description="This stock transfer was already posted in the inventory ledger. Quantities and warehouse routes are locked to protect stock ledger audit integrity. You can edit and update Notes / Remarks below."
              />
            </Col>
          )}

          {/* Item Selector */}
          <Col span={14}>
            <Form.Item
              name="itemId"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Item <span style={{ color: '#ef4444' }}>*</span></span>
                  {loadingBalances && (
                    <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                      <Spin size="small" style={{ marginRight: 4 }} /> Loading stock...
                    </span>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select an item' }]}
            >
              <Select
                showSearch
                disabled={isPosted}
                placeholder="Select item to transfer"
                optionFilterProp="label"
                options={items.map((i: any) => ({
                  value: i.id,
                  label: i.itemCode ? `${i.itemCode} — ${i.name}` : i.name || i.id,
                }))}
              />
            </Form.Item>
          </Col>

          {/* Transfer Quantity */}
          <Col span={10}>
            <Form.Item
              name="quantity"
              label={
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <span>Transfer Quantity <span style={{ color: '#ef4444' }}>*</span></span>
                  {isPosted ? (
                    <Tag color="green" style={{ marginRight: 0, fontSize: 11 }}>
                      Transferred: {formatNumber(qtyNum, 3)} {itemUom || 'KG'}
                    </Tag>
                  ) : (
                    effectiveFromAvailable !== null && (
                      <span style={{ fontSize: 11, color: isOverTransfer ? '#ef4444' : 'var(--theme-text-muted)' }}>
                        Max: <strong>{formatNumber(effectiveFromAvailable, 3)}</strong>
                      </span>
                    )
                  )}
                </div>
              }
              rules={[
                { required: true, message: 'Please enter quantity' },
                {
                  validator: (_, value) => {
                    if (!value || Number(value) <= 0) {
                      return Promise.reject(new Error('Quantity must be greater than 0'));
                    }
                    if (!isPosted && effectiveFromAvailable !== null && Number(value) > effectiveFromAvailable) {
                      return Promise.reject(new Error(`Exceeds available stock (${formatNumber(effectiveFromAvailable, 3)} ${itemUom || 'KG'})`));
                    }
                    return Promise.resolve();
                  },
                },
              ]}
            >
              <InputNumber
                min={0.0001}
                step={1}
                disabled={isPosted}
                style={{ width: '100%' }}
                addonAfter={itemUom || 'KG'}
                placeholder="0.000"
              />
            </Form.Item>
          </Col>

          {/* From Warehouse (Source) */}
          <Col span={12}>
            <Form.Item
              name="fromWarehouseId"
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>From Warehouse (Source) <span style={{ color: '#ef4444' }}>*</span></span>
                  {rawFromAvailable !== null && (
                    <Tag color={rawFromAvailable > 0 ? 'blue' : 'default'} style={{ marginRight: 0, fontSize: 11 }}>
                      {isPosted ? `Store Left: ${formatNumber(rawFromAvailable, 3)} ${itemUom || 'KG'}` : `Avail: ${formatNumber(rawFromAvailable, 3)} ${itemUom || 'KG'}`}
                    </Tag>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select source warehouse' }]}
            >
              <Select
                showSearch
                disabled={isPosted}
                placeholder="Select source warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => {
                  const b = balances[w.id];
                  const availText = b ? ` · (${formatNumber(b.available, 1)} ${itemUom || 'KG'} avail)` : '';
                  return {
                    value: w.id,
                    label: `${w.warehouseCode ? w.warehouseCode + ' — ' : ''}${w.name}${availText}`,
                  };
                })}
              />
            </Form.Item>

            {/* Source Warehouse Balance Badge */}
            {fromWhId && (
              <div style={{
                marginTop: -16, marginBottom: 16, padding: '6px 10px', borderRadius: 6,
                background: isOverTransfer ? 'rgba(239, 68, 68, 0.08)' : 'rgba(2, 132, 199, 0.06)',
                border: `1px solid ${isOverTransfer ? 'rgba(239, 68, 68, 0.35)' : 'rgba(2, 132, 199, 0.25)'}`,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
              }}>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    {isPosted ? 'Current Store Balance: ' : 'Store Available: '}
                  </span>
                  <strong style={{ color: 'var(--theme-text)' }}>
                    {formatNumber(rawFromAvailable ?? 0, 3)} {itemUom || 'KG'}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    {isPosted ? 'Deducted in Transfer: ' : 'After Transfer: '}
                  </span>
                  <strong style={{ color: isPosted ? '#10b981' : (isOverTransfer ? '#ef4444' : '#10b981') }}>
                    {isPosted ? `−${formatNumber(qtyNum, 3)} ${itemUom || 'KG'}` : `${formatNumber(fromRemaining ?? 0, 3)} ${itemUom || 'KG'}`}
                  </strong>
                </span>
              </div>
            )}
          </Col>

          {/* To Warehouse (Destination) */}
          <Col span={12}>
            <Form.Item
              name="toWarehouseId"
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>To Warehouse (Destination) <span style={{ color: '#ef4444' }}>*</span></span>
                  {rawToCurrent !== null && (
                    <Tag color="green" style={{ marginRight: 0, fontSize: 11 }}>
                      Store: {formatNumber(rawToCurrent, 3)} {itemUom || 'KG'}
                    </Tag>
                  )}
                </div>
              }
              rules={[{ required: true, message: 'Please select destination warehouse' }]}
            >
              <Select
                showSearch
                disabled={isPosted}
                placeholder="Select destination warehouse"
                optionFilterProp="label"
                options={warehouses.map((w: any) => {
                  const b = balances[w.id];
                  const curText = b ? ` · (${formatNumber(b.available, 1)} ${itemUom || 'KG'} in store)` : ' · (0 in store)';
                  return {
                    value: w.id,
                    label: `${w.warehouseCode ? w.warehouseCode + ' — ' : ''}${w.name}${curText}`,
                  };
                })}
              />
            </Form.Item>

            {/* Destination Warehouse Balance Badge */}
            {toWhId && (
              <div style={{
                marginTop: -16, marginBottom: 16, padding: '6px 10px', borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.06)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11,
              }}>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>Current Store Balance: </span>
                  <strong style={{ color: 'var(--theme-text)' }}>
                    {formatNumber(rawToCurrent ?? 0, 3)} {itemUom || 'KG'}
                  </strong>
                </span>
                <span>
                  <span style={{ color: 'var(--theme-text-muted)' }}>
                    {isPosted ? 'Received in Transfer: ' : 'New Balance: '}
                  </span>
                  <strong style={{ color: '#10b981' }}>
                    {isPosted ? `+${formatNumber(qtyNum, 3)} ${itemUom || 'KG'}` : `${formatNumber(toProjected ?? 0, 3)} ${itemUom || 'KG'}`}
                  </strong>
                </span>
              </div>
            )}
          </Col>

          {/* Interactive Transfer Impact Visual Flow Card */}
          {selectedItemId && fromWhId && toWhId && (
            <Col span={24}>
              <div style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--theme-surface-alt, #0f172a)',
                border: '1px solid var(--theme-border, #334155)',
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: 'var(--theme-primary, #10b981)',
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 4,
                }}>
                  <span>{isPosted ? '✓ Executed Stock Transfer Details (POSTED)' : '🔄 Stock Transfer Balance Impact Preview'}</span>
                  <span>{selectedItemInfo ? `${selectedItemInfo.code} — ${selectedItemInfo.name}` : ''}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'center' }}>
                  {/* Source Warehouse Box */}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: isOverTransfer ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                    border: `1px solid ${isOverTransfer ? 'rgba(239, 68, 68, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {isPosted ? 'SOURCE (DEDUCTED)' : 'SOURCE (DEDUCTION)'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)', margin: '2px 0 4px' }}>{fromWhName}</div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>{isPosted ? 'Prior to Transfer:' : 'Available:'}</span>
                      <strong style={{ color: 'var(--theme-text)' }}>{formatNumber(effectiveFromAvailable ?? 0, 3)} {itemUom}</strong>
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#ef4444' }}>
                      <span>Transfer Out:</span>
                      <strong>−{formatNumber(qtyNum, 3)} {itemUom}</strong>
                    </div>
                    <Divider style={{ margin: '4px 0' }} />
                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, color: isOverTransfer ? '#ef4444' : 'var(--theme-text-muted)' }}>
                        {isPosted ? 'Store Remaining:' : 'Remaining:'}
                      </span>
                      <strong style={{ color: isOverTransfer ? '#ef4444' : '#10b981', fontSize: 13 }}>
                        {formatNumber(fromRemaining ?? 0, 3)} {itemUom}
                      </strong>
                    </div>
                  </div>

                  {/* Center Transfer Arrow Box */}
                  <div style={{ textAlign: 'center', padding: '0 8px' }}>
                    <div style={{ fontSize: 20, color: isOverTransfer ? '#ef4444' : 'var(--theme-primary, #10b981)' }}>➔</div>
                    <div style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isOverTransfer ? '#ef4444' : 'var(--theme-primary, #10b981)',
                      background: isOverTransfer ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 12,
                      marginTop: 2,
                    }}>
                      {formatNumber(qtyNum, 3)} {itemUom}
                    </div>
                  </div>

                  {/* Destination Warehouse Box */}
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--theme-text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>
                      {isPosted ? 'DESTINATION (RECEIVED)' : 'DESTINATION (RECEIPT)'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)', margin: '2px 0 4px' }}>{toWhName}</div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--theme-text-muted)' }}>{isPosted ? 'Prior to Transfer:' : 'Current Stock:'}</span>
                      <strong style={{ color: 'var(--theme-text)' }}>{formatNumber(effectiveToCurrent ?? 0, 3)} {itemUom}</strong>
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                      <span>Transfer In:</span>
                      <strong>+{formatNumber(qtyNum, 3)} {itemUom}</strong>
                    </div>
                    <Divider style={{ margin: '4px 0' }} />
                    <div style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, color: 'var(--theme-text-muted)' }}>
                        {isPosted ? 'Store Balance:' : 'New Balance:'}
                      </span>
                      <strong style={{ color: '#10b981', fontSize: 13 }}>
                        {formatNumber(toProjected ?? 0, 3)} {itemUom}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Validation Warnings Inside Card (only if not posted) */}
                {!isPosted && isSameWarehouse && (
                  <Alert
                    type="error"
                    showIcon
                    message="Source and Destination warehouses cannot be the same. Please select different warehouses."
                    style={{ marginTop: 10 }}
                  />
                )}
                {!isPosted && isOverTransfer && (
                  <Alert
                    type="error"
                    showIcon
                    message={`Transfer quantity (${formatNumber(qtyNum, 3)} ${itemUom}) exceeds available stock in ${fromWhName} (${formatNumber(effectiveFromAvailable ?? 0, 3)} ${itemUom}).`}
                    style={{ marginTop: 10 }}
                  />
                )}
              </div>
            </Col>
          )}

          {/* Notes / Remarks */}
          <Col span={24}>
            <Form.Item
              name="notes"
              label={
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>Notes / Remarks</span>
                  {isPosted && (
                    <span style={{ fontSize: 11, color: 'var(--theme-primary, #10b981)', fontWeight: 600 }}>
                      ✏️ Editable — write or update your remarks here
                    </span>
                  )}
                </div>
              }
            >
              <Input.TextArea
                rows={3}
                placeholder="Enter transfer remarks / notes..."
                autoFocus={isPosted}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default StockTransferManagement;
