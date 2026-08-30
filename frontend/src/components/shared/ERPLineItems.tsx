import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Select, InputNumber,  Space,  Divider, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';

export interface ERPLine {
  id: string;
  itemId?: string;
  itemCode?: string;
  itemName?: string;
  uomId?: string;
  uomCode?: string;
  quantity: number;
  rate: number;
  discountPercent: number;
  taxPercent: number;
  warehouseId?: string;
  lineTotal: number;
}

export interface ERPLineItemsProps {
  companyId: string;
  value: ERPLine[];
  onChange: (lines: ERPLine[]) => void;
  showWarehouse?: boolean;
  showDiscount?: boolean;
  showTax?: boolean;
  warehouses?: Array<{ id: string; warehouseCode: string; name: string }>;
  disabled?: boolean;
  label?: string;
}

interface ItemOption {
  id: string;
  itemCode: string;
  name: string;
  uomCode?: string;
  sellingPrice?: number;
  costPrice?: number;
}

let lineIdCounter = 0;
const nextId = () => `line-${++lineIdCounter}-${Date.now()}`;

const ERPLineItems: React.FC<ERPLineItemsProps> = ({
  companyId,
  value,
  onChange,
  showWarehouse = false,
  showDiscount = true,
  showTax = true,
  warehouses = [],
  disabled = false,
  label = 'Items',
}) => {
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [searchText, setSearchText] = useState('');

  const loadItems = useCallback(async (search?: string) => {
    if (!companyId) return;
    try {
      const res = await apiService.get<{ data: ItemOption[] }>('/master-data/items', {
        companyId,
        search: search || undefined,
        limit: 50,
      });
      setItemOptions(res.data || []);
    } catch {
      // keep existing options; item search is non-blocking
    }
  }, [companyId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const addLine = () => {
    onChange([
      ...value,
      { id: nextId(), quantity: 1, rate: 0, discountPercent: 0, taxPercent: 0, lineTotal: 0 },
    ]);
  };

  const updateLine = (id: string, patch: Partial<ERPLine>) => {
    onChange(value.map((l) => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      const qty = Number(next.quantity || 0);
      const rate = Number(next.rate || 0);
      const discount = Number(next.discountPercent || 0);
      const tax = Number(next.taxPercent || 0);
      const base = qty * rate;
      const afterDiscount = base * (1 - discount / 100);
      const afterTax = afterDiscount * (1 + tax / 100);
      next.lineTotal = Math.round(afterTax * 100) / 100;
      return next;
    }));
  };

  const selectItem = (id: string, itemId: string) => {
    const item = itemOptions.find((o) => o.id === itemId);
    if (!item) return;
    updateLine(id, {
      itemId: item.id,
      itemCode: item.itemCode,
      itemName: item.name,
      uomId: item.uomCode ? item.uomCode : undefined,
      uomCode: item.uomCode,
      rate: item.sellingPrice ?? item.costPrice ?? 0,
    });
  };

  const removeLine = (id: string) => onChange(value.filter((l) => l.id !== id));

  const totals = value.reduce(
    (acc, l) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const base = qty * rate;
      const afterDiscount = base * (1 - Number(l.discountPercent || 0) / 100);
      const afterTax = afterDiscount * (1 + Number(l.taxPercent || 0) / 100);
      return {
        quantity: acc.quantity + qty,
        baseAmount: acc.baseAmount + base,
        totalAmount: acc.totalAmount + afterTax,
      };
    },
    { quantity: 0, baseAmount: 0, totalAmount: 0 },
  );

  const columns: ColumnsType<ERPLine> = [
    {
      title: 'Item',
      key: 'item',
      width: 260,
      render: (_, record) => (
        <Select
          showSearch
          placeholder="Search item"
          value={record.itemId}
          style={{ width: '100%' }}
          disabled={disabled}
          filterOption={false}
          onSearch={setSearchText}
          onPopupScroll={() => {}}
          onChange={(v) => selectItem(record.id, v)}
          onDropdownVisibleChange={(open) => { if (open) loadItems(searchText); }}
          options={itemOptions.map((o) => ({ value: o.id, label: `${o.itemCode} — ${o.name}` }))}
          notFoundContent="No matching items"
        />
      ),
    },
    { title: 'Item Code', dataIndex: 'itemCode', key: 'itemCode', width: 110 },
    { title: 'UOM', dataIndex: 'uomCode', key: 'uom', width: 80 },
    {
      title: 'Qty', key: 'qty', width: 90,
      render: (_, record) => (
        <InputNumber
          min={0} value={record.quantity} disabled={disabled}
          onChange={(v) => updateLine(record.id, { quantity: Number(v || 0) })}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Rate', key: 'rate', width: 110,
      render: (_, record) => (
        <InputNumber
          min={0} value={record.rate} disabled={disabled}
          onChange={(v) => updateLine(record.id, { rate: Number(v || 0) })}
          style={{ width: '100%' }}
          prefix="$"
        />
      ),
    },
    ...(showDiscount ? [{
      title: 'Disc %', key: 'disc', width: 90,
      render: (_: unknown, record: ERPLine) => (
        <InputNumber min={0} max={100} value={record.discountPercent} disabled={disabled}
          onChange={(v) => updateLine(record.id, { discountPercent: Number(v || 0) })}
          style={{ width: '100%' }} />
      ),
    }] : []),
    ...(showTax ? [{
      title: 'Tax %', key: 'tax', width: 90,
      render: (_: unknown, record: ERPLine) => (
        <InputNumber min={0} max={100} value={record.taxPercent} disabled={disabled}
          onChange={(v) => updateLine(record.id, { taxPercent: Number(v || 0) })}
          style={{ width: '100%' }} />
      ),
    }] : []),
    {
      title: 'Amount', key: 'lineTotal', width: 120, align: 'right' as const,
      render: (_, record) => <span>{record.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>,
    },
    ...(showWarehouse ? [{
      title: 'Warehouse', key: 'wh', width: 150,
      render: (_: unknown, record: ERPLine) => (
        <Select
          placeholder="Warehouse"
          value={record.warehouseId}
          disabled={disabled}
          onChange={(v) => updateLine(record.id, { warehouseId: v })}
          style={{ width: '100%' }}
          options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
        />
      ),
    }] : []),
    {
      title: '', key: 'actions', width: 50,
      render: (_, record) => (
        <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled}
          onClick={() => removeLine(record.id)} aria-label="Remove line" />
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 8, justifyContent: 'space-between', width: '100%' }}>
        <Typography.Text strong>{label}</Typography.Text>
        <Button type="dashed" icon={<PlusOutlined />} onClick={addLine} disabled={disabled}>Add Line</Button>
      </Space>
      <Table
        size="small"
        columns={columns as ColumnsType<ERPLine>}
        dataSource={value}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: 'No line items. Click "Add Line" to add items.' }}
      />
      <Divider style={{ margin: '12px 0' }} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 32 }}>
        <div><Typography.Text type="secondary">Total Qty: </Typography.Text><Typography.Text strong>{totals.quantity.toLocaleString()}</Typography.Text></div>
        <div><Typography.Text type="secondary">Base Amount: </Typography.Text><Typography.Text strong>${totals.baseAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography.Text></div>
        <div><Typography.Text type="secondary">Total Amount: </Typography.Text><Typography.Text strong style={{ fontSize: 15 }}>${totals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Typography.Text></div>
      </div>
    </div>
  );
};

export default ERPLineItems;