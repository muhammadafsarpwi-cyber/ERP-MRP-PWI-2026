import React, { useState, useEffect, useCallback } from 'react';
import {
  Input,
  Select,
  DatePicker,
  Button,
  Tag,
  Modal,
  Descriptions,
  Tooltip,
} from 'antd';
import {
  DownloadOutlined,
  ReloadOutlined,
  EyeOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { formatNumber } from '../../utils/numberFormat';
import { ERPTable, DirectionTag, TableActions, TableToolbar } from '../../components/shared/ERPTable';

const { RangePicker } = DatePicker;

const TRANSACTION_TYPES = [
  { value: 'PRODUCTION_RECEIPT', label: 'Production Receipt' },
  { value: 'PRODUCTION_CONSUMPTION', label: 'Production Consumption' },
  { value: 'PRODUCTION_SCRAP', label: 'Production Scrap' },
  { value: 'TRANSFER_IN', label: 'Transfer In' },
  { value: 'TRANSFER_OUT', label: 'Transfer Out' },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment In' },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment Out' },
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'OPENING', label: 'Opening' },
];

const DIRECTION_OPTIONS = [
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
];

const txTypeColorMap: Record<string, string> = {
  RECEIPT: 'green',
  PRODUCTION_RECEIPT: 'green',
  ISSUE: 'red',
  PRODUCTION_CONSUMPTION: 'orange',
  PRODUCTION_SCRAP: 'volcano',
  TRANSFER_OUT: 'blue',
  TRANSFER_IN: 'cyan',
  ADJUSTMENT_IN: 'purple',
  ADJUSTMENT_OUT: 'gold',
  OPENING: 'default',
};

function formatTxType(type: string): string {
  if (!type) return '—';
  return type
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

interface LedgerEntry {
  id: string;
  transactionDate: string;
  item?: { id: string; name: string; itemCode: string; description?: string };
  warehouse?: { id: string; name: string; warehouseCode?: string };
  location?: { id: string; name: string };
  transactionType: string;
  direction: string;
  quantity: number | string;
  uom?: { id: string; code: string; name: string };
  referenceType: string;
  referenceId?: string;
  referenceNumber?: string;
  batchNumber?: string;
  serialNumber?: string;
  notes?: string;
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
  const [pageSize, setPageSize] = useState(20);

  const [search, setSearch] = useState('');
  const [filterWarehouse, setFilterWarehouse] = useState<string | undefined>(undefined);
  const [filterTxType, setFilterTxType] = useState<string | undefined>(undefined);
  const [filterDirection, setFilterDirection] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<LedgerEntry | null>(null);

  const fetchWarehouses = async () => {
    try {
      const res = await apiService.get<{ data: WarehouseOption[] }>('/warehouses', { limit: 100 });
      setWarehouses(Array.isArray(res?.data) ? res.data : []);
    } catch {
      // ignore
    }
  };

  const fetchEntries = useCallback(async (pageNum: number = 1, curPageSize: number = pageSize) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: curPageSize };
      if (search) params.search = search.trim();
      if (filterWarehouse) params.warehouseId = filterWarehouse;
      if (filterTxType) params.transactionType = filterTxType;
      if (filterDirection) params.direction = filterDirection;
      if (dateRange && dateRange[0]) params.dateFrom = dateRange[0].format('YYYY-MM-DD');
      if (dateRange && dateRange[1]) params.dateTo = dateRange[1].format('YYYY-MM-DD');
      const response = await apiService.get<{ data: LedgerEntry[]; total: number }>('/inventory/reports/ledger', params);
      setEntries(response.data || []);
      setTotal(response.total || 0);
    } catch {
      setEntries([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, filterWarehouse, filterTxType, filterDirection, dateRange, pageSize]);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchEntries(page, pageSize);
  }, [page, pageSize, fetchEntries]);

  const handleExport = () => {
    // Generate CSV export of current ledger entries
    if (!entries.length) return;
    const headers = ['Date', 'Item Code', 'Item Name', 'Warehouse', 'Type', 'Direction', 'Quantity', 'UOM', 'Reference'];
    const rows = entries.map((e) => [
      e.transactionDate ? new Date(e.transactionDate).toISOString() : '',
      `"${e.item?.itemCode || ''}"`,
      `"${e.item?.name || ''}"`,
      `"${e.warehouse?.name || ''}"`,
      `"${e.transactionType || ''}"`,
      `"${e.direction || ''}"`,
      formatNumber(e.quantity, 4),
      `"${e.uom?.code || ''}"`,
      `"${e.referenceNumber || e.referenceType || ''}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `stock_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const columns: ColumnsType<LedgerEntry> = [
    {
      title: 'Date & Time',
      dataIndex: 'transactionDate',
      key: 'transactionDate',
      width: 160,
      render: (v: string) => {
        if (!v) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        const d = new Date(v);
        return (
          <div style={{ whiteSpace: 'nowrap', lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500 }}>{d.toLocaleDateString()}</div>
            <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
              {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Item',
      key: 'item',
      width: 230,
      render: (_, r) => {
        if (!r.item) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 600, color: 'var(--theme-text)' }}>{r.item.itemCode}</div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--theme-text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: 210,
              }}
              title={r.item.name}
            >
              {r.item.name}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Warehouse',
      key: 'warehouse',
      width: 170,
      render: (_, r) => {
        if (!r.warehouse) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500 }}>{r.warehouse.name}</div>
            {r.location?.name && (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>
                Loc: {r.location.name}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Transaction Type',
      dataIndex: 'transactionType',
      key: 'transactionType',
      width: 175,
      render: (v: string) => {
        const color = txTypeColorMap[v] || 'default';
        return <Tag color={color} className="erp-table-tag">{formatTxType(v)}</Tag>;
      },
    },
    {
      title: 'Direction',
      dataIndex: 'direction',
      key: 'direction',
      width: 90,
      render: (v: string) => <DirectionTag direction={v} />,
    },
    {
      title: 'Quantity',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      align: 'right',
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 13 }}>
          {formatNumber(v, 4)}
        </span>
      ),
    },
    {
      title: 'UOM',
      dataIndex: ['uom', 'code'],
      key: 'uomCode',
      width: 75,
      render: (v: string) => (
        <span style={{ color: 'var(--theme-text-muted)', fontSize: 12, fontWeight: 500 }}>
          {v || '—'}
        </span>
      ),
    },
    {
      title: 'Reference',
      key: 'reference',
      width: 165,
      render: (_, r) => {
        const refNum = r.referenceNumber;
        const refType = r.referenceType ? formatTxType(r.referenceType) : '';
        const shortId = r.referenceId ? `${r.referenceId.slice(0, 8)}…` : '';
        return (
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
              {refNum || shortId || '—'}
            </div>
            {refType && (
              <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
                {refType}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: 'Notes',
      dataIndex: 'notes',
      key: 'notes',
      ellipsis: true,
      render: (v: string) => v || <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 65,
      fixed: 'right',
      align: 'center',
      render: (_, r) => (
        <TableActions>
          <Tooltip title="View Transaction Details">
            <Button
              type="text"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => setSelectedEntry(r)}
            />
          </Tooltip>
        </TableActions>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── Page Header Identity ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
            Stock Ledger
          </h2>
          <span style={{ fontSize: 13, color: 'var(--theme-text-muted)' }}>
            Real-time material transactions, audit trail, and stock movements.
          </span>
        </div>
      </div>

      {/* ── Standardized Table Toolbar (Aligned, no huge empty areas) ── */}
      <TableToolbar
        left={
          <>
            <Input
              placeholder="Search item, code, reference…"
              prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => { setPage(1); fetchEntries(1, pageSize); }}
              style={{ width: 230 }}
              allowClear
            />
            <Select
              placeholder="All Warehouses"
              value={filterWarehouse}
              onChange={(v) => { setFilterWarehouse(v); setPage(1); }}
              style={{ width: 175 }}
              allowClear
              showSearch
              optionFilterProp="label"
              options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
            />
            <Select
              placeholder="Transaction Type"
              value={filterTxType}
              onChange={(v) => { setFilterTxType(v); setPage(1); }}
              style={{ width: 185 }}
              allowClear
              options={TRANSACTION_TYPES}
            />
            <Select
              placeholder="Direction"
              value={filterDirection}
              onChange={(v) => { setFilterDirection(v); setPage(1); }}
              style={{ width: 105 }}
              allowClear
              options={DIRECTION_OPTIONS}
            />
            <RangePicker
              value={dateRange}
              onChange={(dates) => { setDateRange(dates as [any, any]); setPage(1); }}
              style={{ width: 240 }}
            />
          </>
        }
        right={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => fetchEntries(page, pageSize)}>
              Refresh
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExport} disabled={!entries.length}>
              Export
            </Button>
          </>
        }
      />

      {/* ── Unified Enterprise Table (Clean subtle container, no heavy side borders) ── */}
      <ERPTable<LedgerEntry>
        columns={columns}
        dataSource={entries}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1320 }}
        emptyTitle="No stock ledger transactions found"
        emptyDescription="No material movements match your current search or filter criteria."
        pagination={{
          current: page,
          total,
          pageSize,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          },
        }}
      />

      {/* ── Transaction Details Modal ── */}
      <Modal
        title="Transaction Details"
        open={!!selectedEntry}
        onCancel={() => setSelectedEntry(null)}
        footer={[
          <Button key="close" type="primary" onClick={() => setSelectedEntry(null)}>
            Close
          </Button>,
        ]}
        width={600}
      >
        {selectedEntry && (
          <Descriptions column={2} size="small" bordered style={{ marginTop: 12 }}>
            <Descriptions.Item label="Date & Time" span={2}>
              {selectedEntry.transactionDate ? new Date(selectedEntry.transactionDate).toLocaleString() : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Item Code">
              <span style={{ fontWeight: 600 }}>{selectedEntry.item?.itemCode || '—'}</span>
            </Descriptions.Item>
            <Descriptions.Item label="Item Name">
              {selectedEntry.item?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Transaction Type">
              <Tag color={txTypeColorMap[selectedEntry.transactionType] || 'default'}>
                {formatTxType(selectedEntry.transactionType)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Direction">
              <DirectionTag direction={selectedEntry.direction} />
            </Descriptions.Item>
            <Descriptions.Item label="Quantity">
              <span style={{ fontWeight: 600 }}>
                {formatNumber(selectedEntry.quantity, 4)} {selectedEntry.uom?.code || ''}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="Warehouse">
              {selectedEntry.warehouse?.name || '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Reference Type">
              {formatTxType(selectedEntry.referenceType)}
            </Descriptions.Item>
            <Descriptions.Item label="Reference ID / No.">
              {selectedEntry.referenceNumber || selectedEntry.referenceId || '—'}
            </Descriptions.Item>
            {selectedEntry.batchNumber && (
              <Descriptions.Item label="Batch Number" span={2}>
                {selectedEntry.batchNumber}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Notes" span={2}>
              {selectedEntry.notes || '—'}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
};

export default StockLedgerView;
