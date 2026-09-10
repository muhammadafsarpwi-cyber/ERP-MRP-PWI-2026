import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Select, InputNumber, Space, Typography, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../../services/api';

export interface StoreLineItem {
  key: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  uomId?: string;
  uomCode?: string;
  requestedQuantity?: number;
  quantity?: number;
  availableStock?: number;
  minimumStock?: number;
  maximumStock?: number;
  currentShortage?: number;
  requiredDate?: string;
  conditionCode?: string;
  remarks?: string;
  poLineId?: string;
  unitPrice?: number;
}

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  baseUomId?: string;
  uomId?: string;
  baseUom?: { id: string; code?: string };
  uomCode?: string;
}

interface UomOption {
  id: string;
  code?: string;
  name?: string;
  symbol?: string;
}

export interface StoreLineItemsEditorProps {
  mode: 'request' | 'issue' | 'return';
  value: StoreLineItem[];
  onChange: (lines: StoreLineItem[]) => void;
  disabled?: boolean;
  label?: string;
}

let lineIdCounter = 0;
const nextKey = () => `sl-${++lineIdCounter}-${Date.now()}`;

const emptyLine = (mode: 'request' | 'issue' | 'return'): StoreLineItem => {
  const line: StoreLineItem = { key: nextKey() };
  if (mode === 'request') {
    line.requestedQuantity = 1;
    line.availableStock = 0;
    line.minimumStock = 0;
    line.maximumStock = 0;
    line.currentShortage = 0;
  } else {
    line.quantity = 1;
  }
  if (mode === 'return') line.conditionCode = 'GOOD';
  return line;
};

const StoreLineItemsEditor: React.FC<StoreLineItemsEditorProps> = ({
  mode,
  value,
  onChange,
  disabled = false,
  label = 'Line Items',
}) => {
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [uomOptions, setUomOptions] = useState<UomOption[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiService.get<{ data: ItemOption[] }>('/master-data/items', { limit: 200 });
        setItemOptions(res.data || []);
      } catch {
        setItemOptions([]);
      }
      try {
        const u = await apiService.get<{ data: UomOption[] }>('/master-data/uom', { limit: 200 });
        setUomOptions(u.data || []);
      } catch {
        setUomOptions([]);
      }
    })();
  }, []);

  const addLine = () => onChange([...value, emptyLine(mode)]);

  const updateLine = (key: string, patch: Partial<StoreLineItem>) => {
    onChange(
      value.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        if (mode === 'request') {
          const requested = Number(next.requestedQuantity || 0);
          const available = Number(next.availableStock || 0);
          next.currentShortage = Math.max(requested - available, 0);
        }
        return next;
      }),
    );
  };

  const selectItem = (key: string, itemId: string) => {
    const item = itemOptions.find((o) => o.id === itemId);
    if (!item) return;
    updateLine(key, {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      uomId: item.baseUomId || item.uomId,
      uomCode: item.baseUom?.code || item.uomCode,
    });
  };

  const removeLine = (key: string) => onChange(value.filter((l) => l.key !== key));

  const count = value.reduce((acc, l) => {
    const qty = mode === 'request' ? Number(l.requestedQuantity || 0) : Number(l.quantity || 0);
    return acc + qty;
  }, 0);

  const itemColumn = {
    title: 'Item',
    key: 'item',
    width: 260,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        showSearch
        placeholder="Search item"
        value={record.itemId}
        style={{ width: '100%' }}
        disabled={disabled}
        filterOption={(input, option) => {
          const label = String(option?.label || '');
          return label.toLowerCase().includes(input.toLowerCase());
        }}
        onChange={(v) => selectItem(record.key, v)}
        options={itemOptions.map((o) => ({ value: o.id, label: `${o.itemCode} — ${o.name}` }))}
        notFoundContent="No matching items"
      />
    ),
  };

  const qtyColumn = {
    title: mode === 'request' ? 'Req Qty' : 'Qty',
    key: 'qty',
    width: 100,
    render: (_: unknown, record: StoreLineItem) => (
      <InputNumber
        min={0}
        value={mode === 'request' ? record.requestedQuantity : record.quantity}
        disabled={disabled}
        onChange={(v) => updateLine(record.key, mode === 'request' ? { requestedQuantity: Number(v || 0) } : { quantity: Number(v || 0) })}
        style={{ width: '100%' }}
      />
    ),
  };

  const uomColumn = {
    title: 'UOM',
    key: 'uom',
    width: 90,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        placeholder="UOM"
        value={record.uomId}
        disabled={disabled}
        style={{ width: '100%' }}
        onChange={(v) => updateLine(record.key, { uomId: v })}
        options={uomOptions.map((u) => ({ value: u.id, label: u.code || u.symbol || u.name }))}
      />
    ),
  };

  const shortageColumn = {
    title: 'Shortage',
    key: 'shortage',
    width: 90,
    render: (_: unknown, record: StoreLineItem) => {
      const shortage = Number(record.currentShortage ?? 0);
      return (
        <Typography.Text type={shortage > 0 ? 'danger' : 'success'} strong>
          {shortage.toLocaleString() || '0'}
        </Typography.Text>
      );
    },
  };

  const availableColumn = {
    title: 'Available',
    key: 'available',
    width: 90,
    render: (_: unknown, record: StoreLineItem) => (
      <InputNumber
        min={0}
        value={record.availableStock}
        disabled
        style={{ width: '100%' }}
      />
    ),
  };

  const minColumn = {
    title: 'Min',
    key: 'min',
    width: 80,
    render: (_: unknown, record: StoreLineItem) => (
      <InputNumber
        min={0}
        value={record.minimumStock}
        disabled={disabled}
        onChange={(v) => updateLine(record.key, { minimumStock: Number(v || 0) })}
        style={{ width: '100%' }}
      />
    ),
  };

  const maxColumn = {
    title: 'Max',
    key: 'max',
    width: 80,
    render: (_: unknown, record: StoreLineItem) => (
      <InputNumber
        min={0}
        value={record.maximumStock}
        disabled={disabled}
        onChange={(v) => updateLine(record.key, { maximumStock: Number(v || 0) })}
        style={{ width: '100%' }}
      />
    ),
  };

  const conditionColumn = {
    title: 'Condition',
    key: 'condition',
    width: 120,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        value={record.conditionCode || 'GOOD'}
        disabled={disabled}
        style={{ width: '100%' }}
        onChange={(v) => updateLine(record.key, { conditionCode: v })}
        options={['GOOD', 'DAMAGED', 'DEFECTIVE', 'EXPIRED'].map((c) => ({ value: c, label: c }))}
      />
    ),
  };

  const remarksColumn = {
    title: 'Remarks',
    key: 'remarks',
    width: 160,
    render: (_: unknown, record: StoreLineItem) => (
      <Select
        placeholder="Remarks"
        value={record.remarks}
        disabled={disabled}
        style={{ width: '100%' }}
        onChange={(v) => updateLine(record.key, { remarks: v })}
        options={['NORMAL', 'URGENT', 'SPECIAL'].map((r) => ({ value: r, label: r }))}
      />
    ),
  };

  const actionColumn = {
    title: '',
    key: 'actions',
    width: 50,
    render: (_: unknown, record: StoreLineItem) => (
      <Tooltip title="Remove line">
        <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} onClick={() => removeLine(record.key)} aria-label="Remove line" />
      </Tooltip>
    ),
  };

  let columns: ColumnsType<StoreLineItem> = [itemColumn, qtyColumn, uomColumn];
  if (mode === 'request') {
    columns = [...columns, availableColumn, minColumn, maxColumn, shortageColumn];
  }
  if (mode === 'return') {
    columns = [...columns, conditionColumn];
  }
  columns = [...columns, remarksColumn, actionColumn];

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Text strong>{label}</Typography.Text>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} disabled={disabled}>Add Line</Button>
      </Space>
      <Table
        size="small"
        columns={columns}
        dataSource={value}
        rowKey="key"
        pagination={false}
        locale={{ emptyText: 'No line items. Click "Add Line" to add items.' }}
        scroll={{ x: 900 }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Typography.Text type="secondary">Total {mode === 'request' ? 'Requested' : 'Quantity'}: </Typography.Text>
        <Typography.Text strong>{count.toLocaleString()}</Typography.Text>
      </div>
    </div>
  );
};

export default StoreLineItemsEditor;