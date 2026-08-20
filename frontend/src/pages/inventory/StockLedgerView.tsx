import React, { useState, useEffect, useCallback } from 'react';
import { Table, Card, Space, Select, DatePicker, Button, Tag } from 'antd';
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatDecimal } from '../../utils/numberFormat';

const { RangePicker } = DatePicker;

const TRANSACTION_TYPES = [
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  { value: 'TRANSFER_IN', label: 'Transfer In' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out' },
  { value: 'OPENING', label: 'Opening' },
];

const DIRECTION_OPTIONS = [
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
];

const txTypeColorMap: Record<string, string> = {
  RECEIPT: 'green',
  ISSUE: 'red',
  TRANSFER_OUT: 'blue',
  TRANSFER_IN: 'cyan',
  ADJUSTMENT_IN: 'purple',
  ADJUSTMENT_OUT: 'orange',
  OPENING: 'default',
};

interface LedgerEntry {
  id: string;
  transactionDate: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string };
  location?: { id: string; name: string };
  transactionType: string;
  direction: string;
  quantity: number;
  uom?: { id: string; code: string; name: string };
  referenceType: string;
  referenceNumber: string;
  batchNumber?: string;
  serialNumber?: string;
  notes: string;
  createdBy?: { id: string; firstName: string; lastName: string };
}

interface WarehouseOption {
  id: string;
  name: string;
}

const StockLedgerView: React.FC = () => {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterTxType, setFilterTxType] = useState<string | undefined>(undefined);
  const [filterDirection, setFilterDirection] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [pageSize] = useState(20);

  const fetchWarehouses = async () => {
    try {
      const res = await apiService.get<{ data: WarehouseOption[] }>('/organization/warehouses', { limit: 100 });
      setWarehouses(res.data);
    } catch (error) {
      // silently fail
    }
  };

  const fetchEntries = useCallback(async (pageNum: number = 1) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize };
      if (search) params.search = search;
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterTxType) params.transactionType = filterTxType;
      if (filterDirection) params.direction = filterDirection;
      if (dateRange && dateRange[0]) params.dateFrom = dateRange[0].format('YYYY-MM-DD');
      if (dateRange && dateRange[1]) params.dateTo = dateRange[1].format('YYYY-MM-DD');
      const response = await apiService.get<{ data: LedgerEntry[]; total: number }>('/inventory/reports/ledger', params);
      setEntries(response.data);
      setTotal(response.total);
    } catch (error) {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, filterTxType, filterDirection, dateRange, pageSize]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchEntries(page);
  }, [page, fetchEntries]);

  const handleExport = () => {
    // Placeholder for export functionality
  };

  const columns: ColumnsType<LedgerEntry> = [
    {
      title: 'Transaction Date', dataIndex: 'transactionDate', key: 'transactionDate', width: 170,
      render: (v: string) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: 'Item', key: 'itemName', width: 180, ellipsis: true,
      render: (_, r) => r.item ? `${r.item.itemCode} - ${r.item.name}` : '-',
    },
    { title: 'Warehouse', dataIndex: ['warehouse', 'name'], key: 'warehouseName', width: 130 },
    { title: 'Location', dataIndex: ['location', 'name'], key: 'locationName', width: 130 },
    {
      title: 'Transaction Type', dataIndex: 'transactionType', key: 'transactionType', width: 150,
      render: (v: string) => <Tag color={txTypeColorMap[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Direction', dataIndex: 'direction', key: 'direction', width: 90,
      render: (v: string) => (
        <span style={{ color: v === 'IN' ? '#52c41a' : '#f5222d', fontWeight: 600 }}>{v}</span>
      ),
    },
    { title: 'Quantity', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const, render: (v: unknown) => formatDecimal(v) },
    { title: 'UOM', dataIndex: ['uom', 'code'], key: 'uomCode', width: 80 },
    { title: 'Reference Type', dataIndex: 'referenceType', key: 'referenceType', width: 130 },
    { title: 'Reference Number', dataIndex: 'referenceNumber', key: 'referenceNumber', width: 150 },
    { title: 'Batch', dataIndex: 'batchNumber', key: 'batchNumber', width: 120 },
    { title: 'Serial Number', dataIndex: 'serialNumber', key: 'serialNumber', width: 120 },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
    {
      title: 'Created By', key: 'createdBy', width: 140,
      render: (_, r) => r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : '-',
    },
  ];

  return (
    <Card title="Stock Ledger">
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="Warehouse"
          value={filterWarehouse}
          onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
          style={{ width: 180 }}
          allowClear
          showSearch
          optionFilterProp="label"
          options={warehouses.map(w => ({ value: w.id, label: w.name }))}
        />
        <Select
          placeholder="Transaction Type"
          value={filterTxType}
          onChange={(v) => { setFilterTxType(v); setPage(1); }}
          style={{ width: 170 }}
          allowClear
          options={TRANSACTION_TYPES}
        />
        <Select
          placeholder="Direction"
          value={filterDirection}
          onChange={(v) => { setFilterDirection(v); setPage(1); }}
          style={{ width: 120 }}
          allowClear
          options={DIRECTION_OPTIONS}
        />
        <RangePicker
          value={dateRange}
          onChange={(dates) => { setDateRange(dates as [any, any]); setPage(1); }}
          style={{ width: 280 }}
        />
        <Button icon={<DownloadOutlined />} onClick={handleExport}>Export</Button>
      </Space>

      <Table
        columns={columns}
        dataSource={entries}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1800 }}
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: setPage,
          showSizeChanger: false,
        }}
      />
    </Card>
  );
};

export default StockLedgerView;
