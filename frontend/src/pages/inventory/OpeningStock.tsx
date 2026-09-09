import React, { useState, useEffect, useCallback } from 'react';
import {
  Button, Form, Input, Select, InputNumber, Table, Card, App, Typography, Space, Popconfirm, DatePicker,
} from 'antd';
import { PlusOutlined, DeleteOutlined, SendOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { usePermission } from '../../hooks/usePermission';

interface DropdownOption {
  id: string;
  name: string;
  code?: string;
}

interface OpeningStockLine {
  key: string;
  itemId: string;
  itemName?: string;
  warehouseId: string;
  uomId: string;
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
}

const OpeningStock: React.FC = () => {
  const { message } = App.useApp();
  const { can } = usePermission();
  const canCreate = can('inventory.opening_stock.create');

  const [form] = Form.useForm();
  const [lines, setLines] = useState<OpeningStockLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState<DropdownOption[]>([]);
  const [warehouses, setWarehouses] = useState<DropdownOption[]>([]);
  const [uoms, setUoms] = useState<DropdownOption[]>([]);
  const [loadingDropdowns, setLoadingDropdowns] = useState(false);

  const fetchDropdowns = useCallback(async () => {
    setLoadingDropdowns(true);
    try {
      const [itemRes, warehouseRes, uomRes] = await Promise.all([
        apiService.get<{ data: DropdownOption[] }>('/master-data/items', { limit: 500 }),
        apiService.get<{ data: DropdownOption[] }>('/warehouses', { limit: 100 }),
        apiService.get<{ data: DropdownOption[] }>('/master-data/uom', { limit: 100 }),
      ]);
      setItems(Array.isArray(itemRes?.data) ? itemRes.data : []);
      setWarehouses(Array.isArray(warehouseRes?.data) ? warehouseRes.data : []);
      setUoms(Array.isArray(uomRes?.data) ? uomRes.data : []);
    } catch {
      message.error('Failed to load dropdown data');
    } finally {
      setLoadingDropdowns(false);
    }
  }, [message]);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  const addLine = () => {
    setLines(prev => [
      ...prev,
      { key: `line-${Date.now()}-${prev.length}`, itemId: '', warehouseId: '', uomId: '', quantity: 1 },
    ]);
  };

  const removeLine = (key: string) => {
    setLines(prev => prev.filter(l => l.key !== key));
  };

  const updateLine = (key: string, field: keyof OpeningStockLine, value: any) => {
    setLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async () => {
    if (lines.length === 0) {
      message.warning('Add at least one opening stock line');
      return;
    }
    const values = await form.validateFields().catch(() => null);
    if (!values) return;

    setSubmitting(true);
    try {
      const payload = {
        companyId: values.companyId,
        warehouseId: values.warehouseId,
        referenceNumber: values.referenceNumber,
        transactionDate: values.transactionDate?.toISOString(),
        lines: lines.map(l => ({
          itemId: l.itemId,
          uomId: l.uomId,
          quantity: l.quantity,
          unitCost: l.unitCost,
          batchNumber: l.batchNumber || undefined,
          serialNumber: l.serialNumber || undefined,
          notes: l.notes || undefined,
        })),
      };
      await apiService.post('/inventory/opening-stock', payload);
      message.success('Opening stock posted successfully');
      setLines([]);
      form.resetFields();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to post opening stock';
      message.error(Array.isArray(msg) ? msg[0] : String(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const lineColumns: ColumnsType<OpeningStockLine> = [
    {
      title: 'Item',
      dataIndex: 'itemId',
      key: 'itemId',
      width: 200,
      render: (_: unknown, record) => (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Select item"
          value={record.itemId || undefined}
          onChange={(v) => updateLine(record.key, 'itemId', v)}
          style={{ width: '100%' }}
          options={items.map(i => ({ value: i.id, label: `${i.code || ''} ${i.name}`.trim() }))}
        />
      ),
    },
    {
      title: 'UOM',
      dataIndex: 'uomId',
      key: 'uomId',
      width: 120,
      render: (_: unknown, record) => (
        <Select
          placeholder="UOM"
          value={record.uomId || undefined}
          onChange={(v) => updateLine(record.key, 'uomId', v)}
          style={{ width: '100%' }}
          options={uoms.map(u => ({ value: u.id, label: u.code || u.name }))}
        />
      ),
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (_: unknown, record) => (
        <InputNumber
          min={0.0001}
          value={record.quantity}
          onChange={(v) => updateLine(record.key, 'quantity', v || 1)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Unit Cost',
      dataIndex: 'unitCost',
      key: 'unitCost',
      width: 100,
      render: (_: unknown, record) => (
        <InputNumber
          min={0}
          precision={6}
          value={record.unitCost}
          onChange={(v) => updateLine(record.key, 'unitCost', v)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Batch #',
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      width: 120,
      render: (_: unknown, record) => (
        <Input
          placeholder="Optional"
          value={record.batchNumber}
          onChange={(e) => updateLine(record.key, 'batchNumber', e.target.value)}
        />
      ),
    },
    {
      title: 'Serial #',
      dataIndex: 'serialNumber',
      key: 'serialNumber',
      width: 120,
      render: (_: unknown, record) => (
        <Input
          placeholder="Optional"
          value={record.serialNumber}
          onChange={(e) => updateLine(record.key, 'serialNumber', e.target.value)}
        />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 40,
      render: (_: unknown, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeLine(record.key)}
          size="small"
        />
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Typography.Title level={2} style={{ margin: 0 }}>Opening Stock</Typography.Title>
        <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
          Post initial stock balances for items in warehouses
        </span>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="inline" style={{ flexWrap: 'wrap', gap: '8px 16px' }}>
          <Form.Item name="companyId" label="Company" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 200 }}>
            <Select placeholder="Select company" showSearch optionFilterProp="label">
              {/* Company options would come from context/API */}
            </Select>
          </Form.Item>
          <Form.Item name="warehouseId" label="Warehouse" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 200 }}>
            <Select
              placeholder="Select warehouse"
              showSearch
              optionFilterProp="label"
              options={warehouses.map(w => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
          <Form.Item name="referenceNumber" label="Reference #" rules={[{ required: true, message: 'Required' }]} style={{ minWidth: 160 }}>
            <Input placeholder="e.g. OPN-001" />
          </Form.Item>
          <Form.Item name="transactionDate" label="Date" style={{ minWidth: 160 }}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Card>

      <Card
        title={
          <Space>
            <span>Opening Stock Lines</span>
            <span style={{ fontSize: 12, color: 'var(--theme-text-muted)' }}>({lines.length} items)</span>
          </Space>
        }
        extra={
          canCreate ? (
            <Button icon={<PlusOutlined />} onClick={addLine} type="dashed">
              Add Line
            </Button>
          ) : null
        }
      >
        <Table
          dataSource={lines}
          columns={lineColumns}
          rowKey="key"
          pagination={false}
          size="small"
          locale={{ emptyText: 'No lines added. Click "Add Line" to begin.' }}
          scroll={{ x: 800 }}
        />
      </Card>

      {canCreate && lines.length > 0 && (
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <Popconfirm
            title="Post opening stock?"
            description="This will create ledger entries and update balances."
            onConfirm={handleSubmit}
            okButtonProps={{ loading: submitting }}
          >
            <Button type="primary" icon={<SendOutlined />} loading={submitting} size="large">
              Post Opening Stock
            </Button>
          </Popconfirm>
        </div>
      )}
    </div>
  );
};

export default OpeningStock;
