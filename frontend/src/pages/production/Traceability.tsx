import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Descriptions, Empty, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography, Divider, Input,
} from 'antd';
import {
  ArrowDownOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, EmptyState } from '../../components/shared';
import { formatDimension, formatDecimal } from '../../utils/numberFormat';
import { ITEM_TYPES } from '../master-data/items/itemTypes';

const { Text } = Typography;

/* ── Types (mirror backend responses) ─────────────────────────────────── */

interface ItemSummary {
  id: string; itemCode: string; name: string; itemType: string;
  wireSizeMm?: number | null; thicknessMm?: number | null; widthMm?: number | null;
  uom?: { id: string; code: string; name: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  isManufacturable?: boolean; isPurchasable?: boolean; isStockItem?: boolean; trackInventory?: boolean;
}

interface BalanceInfo { onHand: number; reserved: number; available: number; }

interface OverviewResponse { item: ItemSummary; currentBalance: BalanceInfo; }

interface StatementResponse {
  item: ItemSummary; filters: Record<string, any>;
  openingBalance: number; categories: Record<string, number>; closingBalance: number;
  currentBalance: BalanceInfo;
  reconciliation: { inventoryBalance: number; ledgerBalance: number; difference: number; status: string };
}

interface LedgerRow {
  id: string; transactionDate: string; transactionType: string; direction: string; quantity: number;
  item?: { id: string; itemCode: string; name: string } | null;
  warehouse?: { id: string; warehouseCode: string; name: string } | null;
  uom?: { id: string; code: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  referenceType?: string | null; referenceId?: string | null; referenceNumber?: string | null;
  notes?: string | null;
}

interface HistoryRow {
  id: string; entryDate: string;
  item?: { id: string; itemCode: string; name: string; itemType: string } | null;
  uom?: { id: string; code: string; name: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string; departmentCode: string } | null;
  machine?: { id: string; machineCode: string; name: string } | null;
  machineNo?: string; shift?: { id: string; name: string; shiftCode: string } | null;
  operatorName?: string; supervisorName?: string | null;
  targetQuantity: number; actualQuantity: number; scrapQuantity: number;
  runningHours?: number; downtimeHours?: number;
  productionOrder?: { id: string; orderNumber: string; status: string } | null;
  inventoryReferenceId?: string | null; createdAt?: string; remarks?: string | null;
}

interface OpSummary {
  id: string; sequenceNo: number; operationCode: string; operationName: string;
  inputItem?: ItemSummary | null; outputItem?: ItemSummary | null;
  inputQuantity: number; outputQuantity: number;
  uom?: { id: string; code: string; name: string } | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string; departmentCode: string } | null;
  scrapPercentage: number; setupScrapPercentage: number;
  setupTimeMinutes?: number; runTimeMinutes?: number;
  additionalInputs?: Array<{ itemId: string; itemCode?: string; itemName?: string; quantity: number }> | null;
}

interface ChainNode { type: 'item' | 'process'; step: number; item?: ItemSummary | null; operation?: OpSummary | null; }

interface ChainResponse {
  item: ItemSummary; hasRouting: boolean; nodes: ChainNode[];
  routing?: { id: string; routingCode: string; name: string; status: string } | null;
  previousProcess?: OpSummary | null; nextProcess?: OpSummary | null;
  previousItem?: ItemSummary | null; nextItem?: ItemSummary | null;
}

interface WipRow {
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  process?: { id: string; operationCode: string; operationName: string; sequenceNo: number } | null;
  previousItem?: { id: string; itemCode: string; name: string } | null;
  previousProcess?: { id: string; operationCode: string; operationName: string } | null;
  nextItem?: { id: string; itemCode: string; name: string } | null;
  nextProcess?: { id: string; operationCode: string; operationName: string } | null;
  item?: { id: string; itemCode: string; name: string; itemType: string; wireSizeMm?: number | null; thicknessMm?: number | null; widthMm?: number | null } | null;
  warehouse?: { id: string; warehouseCode: string; name: string } | null;
  location?: { id: string; locationCode: string; name: string } | null;
  uom?: { id: string; code: string; name: string } | null;
  wipQuantity: number; onHand: number; reserved: number; available: number;
  produced: number; consumed: number; scrap: number;
  openingWip?: number | null; closingWip?: number | null;
  lastProductionDate?: string | null; lastMovementDate?: string | null;
  reconciliation?: { inventoryBalance: number; ledgerBalance: number; difference: number; status: string };
}

interface DeptRow {
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  item?: { id: string; itemCode: string; name: string; itemType: string; wireSizeMm?: number | null; thicknessMm?: number | null; widthMm?: number | null } | null;
  uom?: { id: string; code: string; name: string } | null;
  warehouse?: { id: string; warehouseCode: string; name: string } | null;
  onHand: number; reserved: number; available: number;
  produced: number; consumed: number; scrap: number;
}

interface ItemOption { id: string; itemCode: string; name: string; itemType: string; baseUomName?: string | null; }

const itemTypeLabel = (v?: string) => ITEM_TYPES.find((t) => t.value === v)?.label || v || '-';
const num = (v: unknown) => (v === null || v === undefined ? '-' : formatDecimal(v));
const dateShort = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '-');
const dateTime = (v?: string | null) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');

const itemKey = (i: ItemSummary | null | undefined) => (i ? `${i.itemCode} - ${i.name}` : '-');
const specLine = (i: ItemSummary | null | undefined) => {
  if (!i) return '';
  if (i.thicknessMm != null || i.widthMm != null) return `${formatDimension(i.thicknessMm)} × ${formatDimension(i.widthMm)}`;
  if (i.wireSizeMm != null) return formatDimension(i.wireSizeMm);
  return '';
};

const Traceability: React.FC = () => {
  const [items, setItems] = useState<ItemOption[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [selected, setSelected] = useState<ItemOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [statement, setStatement] = useState<StatementResponse | null>(null);
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [chain, setChain] = useState<ChainResponse | null>(null);
  const [wip, setWip] = useState<WipRow[]>([]);
  const [wipSummary, setWipSummary] = useState<{ totalWipQuantity: number; wipItemCount: number; wipWarehouseCount: number; departmentCount: number; activeRecordCount: number } | null>(null);
  const [wipContext, setWipContext] = useState<{ wipWarehousesFound: number; wipWarehouses: Array<{ id: string; warehouseCode: string; name: string }> } | null>(null);
  const [dept, setDept] = useState<DeptRow[]>([]);

  const [dateFrom, setDateFrom] = useState<string | undefined>();
  const [dateTo, setDateTo] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState('overview');

  const loadItems = useCallback(async (q?: string) => {
    try {
      const res = await apiService.get<{ data: ItemOption[] }>('/master-data/items', { limit: 200, search: q, status: 'ACTIVE' });
      setItems(res.data || []);
    } catch { setItems([]); }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const loadAll = useCallback(async (item: ItemOption) => {
    setLoading(true); setError(null);
    const params: Record<string, string> = {};
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    try {
      const [ov, st, led, hist, chn, wipRes, deptRes] = await Promise.all([
        apiService.get<{ data: OverviewResponse }>(`/production/traceability/item/${item.id}`),
        apiService.get<{ data: StatementResponse }>(`/production/traceability/${item.id}/statement`, params),
        apiService.get<{ data: LedgerRow[]; total: number }>(`/production/traceability/${item.id}/ledger`, { ...params, page: 1, limit: 100 }),
        apiService.get<{ data: HistoryRow[]; total: number }>(`/production/traceability/${item.id}/history`, { ...params, page: 1, limit: 50 }),
        apiService.get<{ data: ChainResponse }>(`/production/traceability/${item.id}/chain`),
        apiService.get<{ summary: any; data: WipRow[]; context: any }>('/production/traceability/wip', { ...params, itemId: item.id }),
        apiService.get<{ data: DeptRow[] }>('/production/traceability/department-wise', { ...params, itemId: item.id }),
      ]);
      setOverview(ov.data); setStatement(st.data);
      setLedgerRows(led.data || []); setLedgerTotal(led.total || 0); setLedgerPage(1);
      setHistory(hist.data || []); setHistoryTotal(hist.total || 0); setHistoryPage(1);
      setChain(chn.data); setWip(wipRes.data || []); setWipSummary(wipRes.summary || null); setWipContext(wipRes.context || null); setDept(deptRes.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load traceability data');
    } finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  const selectItem = (id?: string) => {
    const found = items.find((i) => i.id === id);
    if (found) { setSelected(found); setActiveTab('overview'); void loadAll(found); }
  };

  const applyFilters = () => { if (selected) void loadAll(selected); };

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.itemCode.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || i.itemType.toLowerCase().includes(q));
  }, [items, itemSearch]);

  // ── Tables ─────────────────────────────────────────────────────────────

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: 'Date', dataIndex: 'transactionDate', key: 'date', width: 130, render: (v) => dateTime(v) },
    {
      title: 'Transaction', dataIndex: 'transactionType', key: 'type', width: 170,
      render: (v: string, r) => <Space size={4}><Tag color={r.direction === 'IN' ? 'green' : 'volcano'}>{v}</Tag><Text type="secondary" style={{ fontSize: 11 }}>{r.direction}</Text></Space>,
    },
    { title: 'Reference', key: 'ref', width: 150, render: (_, r) => r.referenceNumber || r.referenceType || '-' },
    { title: 'Warehouse', key: 'wh', width: 140, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Department', key: 'dept', width: 120, render: (_, r) => r.department?.name || '-' },
    { title: 'Input', key: 'in', align: 'right', width: 80, render: (_, r) => (r.direction === 'IN' ? num(r.quantity) : '-') },
    { title: 'Output', key: 'out', align: 'right', width: 80, render: (_, r) => (r.direction === 'OUT' ? num(r.quantity) : '-') },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ];

  const historyColumns: ColumnsType<HistoryRow> = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 100, render: (v) => dateShort(v) },
    { title: 'Department', key: 'dept', width: 130, render: (_, r) => r.department?.name || '-' },
    { title: 'Section', key: 'sec', width: 110, render: (_, r) => r.section?.name || '-' },
    { title: 'Machine', key: 'machine', width: 140, render: (_, r) => r.machine?.name || r.machineNo || '-' },
    { title: 'Shift', key: 'shift', width: 100, render: (_, r) => r.shift?.name || '-' },
    { title: 'Operator', dataIndex: 'operatorName', key: 'op', width: 110 },
    { title: 'Target', dataIndex: 'targetQuantity', key: 'target', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'Actual', dataIndex: 'actualQuantity', key: 'actual', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'Scrap', dataIndex: 'scrapQuantity', key: 'scrap', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'Order', key: 'order', width: 110, render: (_, r) => r.productionOrder?.orderNumber || '-' },
    { title: 'Created', dataIndex: 'createdAt', key: 'created', width: 130, render: (v) => dateTime(v) },
  ];

  const wipColumns: ColumnsType<WipRow> = [
    { title: 'Division', key: 'div', width: 140, render: (_, r) => r.division?.name || '-' },
    { title: 'Section', key: 'sec', width: 110, render: (_, r) => r.section?.name || '-' },
    { title: 'Department', key: 'dept', width: 120, render: (_, r) => r.department?.name || '-' },
    { title: 'Process', key: 'process', width: 130, render: (_, r) => r.process?.operationName || '-' },
    {
      title: 'Item', key: 'item', render: (_, r) => r.item ? (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectItem(r.item!.id)}>{r.item!.itemCode} - {r.item!.name}</Button>
      ) : '-',
    },
    { title: 'Type', key: 'type', width: 100, render: (_, r) => r.item ? itemTypeLabel(r.item.itemType) : '-' },
    { title: 'Wire Size', key: 'wire', width: 90, align: 'right', render: (_, r) => r.item?.wireSizeMm != null ? formatDimension(r.item.wireSizeMm) : '-' },
    { title: 'Flat Spec', key: 'flat', width: 110, align: 'right', render: (_, r) => (r.item?.thicknessMm != null || r.item?.widthMm != null) ? `${formatDimension(r.item.thicknessMm)} × ${formatDimension(r.item.widthMm)}` : '-' },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'WIP Warehouse', key: 'wh', width: 140, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Location', key: 'loc', width: 110, render: (_, r) => r.location?.name || '-' },
    { title: 'WIP Qty', dataIndex: 'onHand', key: 'wip', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Available', dataIndex: 'available', key: 'available', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Produced', dataIndex: 'produced', key: 'produced', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Consumed', dataIndex: 'consumed', key: 'consumed', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Scrap', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'Opening', dataIndex: 'openingWip', key: 'opening', align: 'right', width: 90, render: (v) => (v === null || v === undefined ? '-' : num(v)) },
    { title: 'Closing', dataIndex: 'closingWip', key: 'closing', align: 'right', width: 90, render: (v) => (v === null || v === undefined ? '-' : num(v)) },
    {
      title: 'Reconciled', key: 'recon', width: 110, align: 'center',
      render: (_, r) => {
        const st = r.reconciliation?.status;
        if (!st) return '-';
        return st === 'RECONCILED' ? <Tag color="green">RECONCILED</Tag> : <Tag color="red">MISMATCH</Tag>;
      },
    },
    { title: 'Last Production', dataIndex: 'lastProductionDate', key: 'lastProd', width: 120, render: (v) => dateShort(v) },
    { title: 'Last Movement', dataIndex: 'lastMovementDate', key: 'lastMov', width: 120, render: (v) => dateShort(v) },
  ];

  const deptColumns: ColumnsType<DeptRow> = [
    { title: 'Division', key: 'div', width: 150, render: (_, r) => r.division?.name || '-' },
    { title: 'Section', key: 'sec', width: 120, render: (_, r) => r.section?.name || '-' },
    { title: 'Department', key: 'dept', width: 130, render: (_, r) => r.department?.name || '-' },
    {
      title: 'Item', key: 'item', render: (_, r) => r.item ? (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectItem(r.item!.id)}>{r.item!.itemCode} - {r.item!.name}</Button>
      ) : '-',
    },
    { title: 'Type', key: 'type', width: 100, render: (_, r) => r.item ? itemTypeLabel(r.item.itemType) : '-' },
    { title: 'Wire Size', key: 'wire', width: 90, align: 'right', render: (_, r) => r.item?.wireSizeMm != null ? formatDimension(r.item.wireSizeMm) : '-' },
    { title: 'Flat Spec', key: 'flat', width: 110, align: 'right', render: (_, r) => (r.item?.thicknessMm != null || r.item?.widthMm != null) ? `${formatDimension(r.item.thicknessMm)} × ${formatDimension(r.item.widthMm)}` : '-' },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'Warehouse', key: 'wh', width: 140, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Available', dataIndex: 'available', key: 'available', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Produced', dataIndex: 'produced', key: 'produced', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Consumed', dataIndex: 'consumed', key: 'consumed', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Scrap', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 80, render: (v) => num(v) },
  ];

  // ── Summary cards for statement ────────────────────────────────────────

  const statementCards = useMemo(() => {
    if (!statement) return [];
    const c = statement.categories || {};
    const mk = (key: string, label: string, color?: string) => ({
      title: label, value: c[key] ?? 0, precision: 2, color: color || 'rgba(0,0,0,0.65)',
    });
    return [
      { title: 'Opening', value: statement.openingBalance, precision: 2, color: '#1677ff' },
      mk('productionReceipt', 'Received / Produced', '#52c41a'),
      mk('productionConsumption', 'Consumed', '#ff4d4f'),
      mk('transferIn', 'Transferred In', '#faad14'),
      mk('transferOut', 'Transferred Out', '#faad14'),
      mk('adjustmentIn', 'Adjusted In', '#722ed1'),
      mk('adjustmentOut', 'Adjusted Out', '#722ed1'),
      mk('scrap', 'Scrap', '#eb2f96'),
      { title: 'Closing', value: statement.closingBalance, precision: 2, color: '#1677ff' },
    ];
  }, [statement]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div>
      <PageHeader
        icon={<SearchOutlined />}
        title="Production Traceability"
        subtitle="Item-wise inventory, WIP and complete Input → Process → Output traceability"
        showBreadcrumbs
        extra={
          <Space>
            <Input.Search
              allowClear placeholder="Search items by code, name, type…"
              style={{ width: 260 }} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
            />
            <Button icon={<ReloadOutlined />} onClick={() => selected && loadAll(selected)}>Refresh</Button>
          </Space>
        }
      />

      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }} styles={{ body: { padding: 12 } }}>
        <Space wrap size={8}>
          <Text strong>Item:</Text>
          <Select
            showSearch allowClear placeholder="Select an item…" style={{ minWidth: 340 }}
            value={selected?.id} onChange={selectItem}
            filterOption={(input, option) => (option?.label || '').toLowerCase().includes(input.toLowerCase())}
            options={filteredItems.map((i) => ({
              value: i.id,
              label: `${i.itemCode} - ${i.name} (${itemTypeLabel(i.itemType)})`,
            }))}
            notFoundContent={items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items" /> : 'No match'}
          />
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value || undefined)} placeholder="From" style={{ width: 150 }} />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value || undefined)} placeholder="To" style={{ width: 150 }} />
          <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters} disabled={!selected}>Apply</Button>
        </Space>
      </Card>

      {error && <Alert message={error} type="warning" showIcon closable style={{ marginBottom: 12 }} onClose={() => setError(null)} />}

      {!selected ? (
        <Card size="small"><EmptyState title="No item selected" description="Search and select an item to view its inventory statement, production history, WIP and traceability chain." /></Card>
      ) : (
        <Spin spinning={loading}>
          <Tabs
            size="small" activeKey={activeTab} onChange={setActiveTab}
            items={[
              {
                key: 'overview', label: 'Item Overview',
                children: overview && (
                  <Card size="small">
                    <RowGrid>
                      <DescriptionsItem label="Item Code"><Text strong>{overview.item.itemCode}</Text></DescriptionsItem>
                      <DescriptionsItem label="Item Name">{overview.item.name}</DescriptionsItem>
                      <DescriptionsItem label="Item Type">{itemTypeLabel(overview.item.itemType)}</DescriptionsItem>
                      <DescriptionsItem label="Wire Size">{overview.item.wireSizeMm != null ? formatDimension(overview.item.wireSizeMm) : '—'}</DescriptionsItem>
                      <DescriptionsItem label="Flat Specification">{(overview.item.thicknessMm != null || overview.item.widthMm != null) ? `${formatDimension(overview.item.thicknessMm)} × ${formatDimension(overview.item.widthMm)}` : '—'}</DescriptionsItem>
                      <DescriptionsItem label="UOM">{overview.item.uom?.code || '-'}</DescriptionsItem>
                      <DescriptionsItem label="Division">{overview.item.division?.name || '-'}</DescriptionsItem>
                      <DescriptionsItem label="Section">{overview.item.section?.name || '-'}</DescriptionsItem>
                      <DescriptionsItem label="Department">{overview.item.department?.name || '-'}</DescriptionsItem>
                      <DescriptionsItem label="On Hand"><Statistic value={overview.currentBalance.onHand} precision={2} valueStyle={{ fontSize: 16 }} /></DescriptionsItem>
                      <DescriptionsItem label="Reserved"><Statistic value={overview.currentBalance.reserved} precision={2} valueStyle={{ fontSize: 16 }} /></DescriptionsItem>
                      <DescriptionsItem label="Available"><Statistic value={overview.currentBalance.available} precision={2} valueStyle={{ fontSize: 16 }} /></DescriptionsItem>
                    </RowGrid>
                    <ReconCard reconciliation={statement?.reconciliation} />
                  </Card>
                ),
              },
              {
                key: 'statement', label: 'Stock Statement',
                children: statement && (
                  <Card size="small">
                    <Space size={8} wrap style={{ marginBottom: 16 }}>
                      {statementCards.map((c) => (
                        <Card key={c.title} size="small" styles={{ body: { padding: '8px 14px' } }} style={{ minWidth: 150, borderRadius: 8 }}>
                          <Statistic title={c.title} value={c.value} precision={c.precision} valueStyle={{ fontSize: 18, color: c.color }} />
                        </Card>
                      ))}
                    </Space>
                    <ReconCard reconciliation={statement.reconciliation} />
                    <Divider orientation="left" style={{ margin: '12px 0' }}>Ledger Transactions</Divider>
                    <Table
                      size="small" rowKey="id" columns={ledgerColumns} dataSource={ledgerRows} loading={loading}
                      pagination={{ current: ledgerPage, pageSize: 100, total: ledgerTotal, showSizeChanger: false, onChange: (p) => setLedgerPage(p) }}
                      scroll={{ x: 1200 }} locale={{ emptyText: 'No ledger transactions for this period' }}
                    />
                  </Card>
                ),
              },
              {
                key: 'history', label: 'Production History',
                children: (
                  <Card size="small">
                    <Table
                      size="small" rowKey="id" columns={historyColumns} dataSource={history} loading={loading}
                      pagination={{ current: historyPage, pageSize: 50, total: historyTotal, showSizeChanger: false, onChange: (p) => setHistoryPage(p) }}
                      scroll={{ x: 1400 }} locale={{ emptyText: 'No production entries for this item' }}
                    />
                  </Card>
                ),
              },
              {
                key: 'chain', label: 'Traceability Chain',
                children: (
                  <Card size="small">
                    {chain?.hasRouting ? (
                      <div>
                        <Descriptions size="small" column={3} bordered style={{ marginBottom: 16 }}>
                          <Descriptions.Item label="Routing">{chain.routing?.routingCode || '-'}</Descriptions.Item>
                          <Descriptions.Item label="Routing Name">{chain.routing?.name || '-'}</Descriptions.Item>
                          <Descriptions.Item label="Status">{chain.routing?.status || '-'}</Descriptions.Item>
                        </Descriptions>
                        <ChainView nodes={chain.nodes} selectedItemId={chain.item.id} onSelect={selectItem} />
                        <Divider orientation="left">Previous / Next Process</Divider>
                        <RowGrid>
                          <DescriptionsItem label="Previous Item">{chain.previousItem ? itemKey(chain.previousItem) : '—'}</DescriptionsItem>
                          <DescriptionsItem label="Previous Process">{chain.previousProcess?.operationName || '—'}</DescriptionsItem>
                          <DescriptionsItem label="Previous Department">{chain.previousProcess?.department?.name || '—'}</DescriptionsItem>
                          <DescriptionsItem label="Next Item">{chain.nextItem ? itemKey(chain.nextItem) : '—'}</DescriptionsItem>
                          <DescriptionsItem label="Next Process">{chain.nextProcess?.operationName || '—'}</DescriptionsItem>
                          <DescriptionsItem label="Next Department">{chain.nextProcess?.department?.name || '—'}</DescriptionsItem>
                        </RowGrid>
                      </div>
                    ) : (
                      <EmptyState title="No routing chain" description="This item is not part of any active production routing. Check the routing definition or select an item from the Task #2 sample chain (e.g. RM-WIRE-120, FLAT-WIRE-040-260, SPIRAL-375, PVC-480)." />
                    )}
                  </Card>
                ),
              },
              {
                key: 'wip', label: 'WIP',
                children: (
                  <Card size="small">
                    {wipContext && (
                      <Space size={8} wrap style={{ marginBottom: 12 }}>
                        {[
                          { title: 'Total WIP Qty', value: wipSummary?.totalWipQuantity ?? 0 },
                          { title: 'WIP Items', value: wipSummary?.wipItemCount ?? 0 },
                          { title: 'WIP Warehouses', value: wipSummary?.wipWarehouseCount ?? 0 },
                          { title: 'Departments', value: wipSummary?.departmentCount ?? 0 },
                          { title: 'Active Records', value: wipSummary?.activeRecordCount ?? 0 },
                        ].map((c) => (
                          <Card key={c.title} size="small" styles={{ body: { padding: '8px 14px' } }} style={{ minWidth: 130, borderRadius: 8 }}>
                            <Statistic title={c.title} value={c.value} valueStyle={{ fontSize: 18 }} />
                          </Card>
                        ))}
                      </Space>
                    )}
                    {wip.length === 0 ? (
                      <EmptyState
                        title="No Work-in-Progress inventory is currently available"
                        description={
                          wipContext
                            ? `WIP warehouses found: ${wipContext.wipWarehousesFound} · WIP stock records found: 0 · Filters: ${dateFrom || 'no start'} → ${dateTo || 'no end'}.`
                            : 'No WORK_IN_PROGRESS warehouses are configured for this company.'
                        }
                      />
                    ) : (
                      <Table size="small" rowKey={(r) => `${r.item?.id}-${r.warehouse?.id}-${r.location?.id || ''}`} columns={wipColumns} dataSource={wip} loading={loading}
                        pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 2200 }} locale={{ emptyText: 'No WIP in WORK_IN_PROGRESS warehouses' }} />
                    )}
                  </Card>
                ),
              },
              {
                key: 'dept', label: 'Department Inventory',
                children: (
                  <Card size="small">
                    <Table size="small" rowKey={(r) => `${r.item?.id}-${r.warehouse?.id}-${r.department?.id}`} columns={deptColumns} dataSource={dept} loading={loading}
                      pagination={{ pageSize: 20, showSizeChanger: true }} scroll={{ x: 1500 }} locale={{ emptyText: 'No department inventory' }} />
                  </Card>
                ),
              },
            ]}
          />
        </Spin>
      )}
    </div>
  );
};

/* ── Small helpers used above ─────────────────────────────────────────── */

const RowGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '4px 20px', marginBottom: 12 }}>
    {children}
  </div>
);

const DescriptionsItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
    <div style={{ fontSize: 13 }}>{children}</div>
  </div>
);

const ReconCard: React.FC<{ reconciliation?: { inventoryBalance: number; ledgerBalance: number; difference: number; status: string } }> = ({ reconciliation }) => {
  if (!reconciliation) return null;
  const reconciled = reconciliation.status === 'RECONCILED';
  return (
    <Card size="small" style={{ background: reconciled ? '#f6ffed' : '#fff7e6', borderColor: reconciled ? '#b7eb8f' : '#ffd591', marginBottom: 12, borderRadius: 8 }}>
      <Space wrap size={16}>
        <Statistic title="Inventory Balance" value={reconciliation.inventoryBalance} precision={2} valueStyle={{ fontSize: 16 }} />
        <Statistic title="Ledger Balance" value={reconciliation.ledgerBalance} precision={2} valueStyle={{ fontSize: 16 }} />
        <Statistic title="Difference" value={reconciliation.difference} precision={2} valueStyle={{ fontSize: 16, color: reconciled ? '#52c41a' : '#fa8c16' }} />
        <Statistic title="Status" value={reconciliation.status} valueStyle={{ fontSize: 16, color: reconciled ? '#52c41a' : '#fa8c16' }} />
      </Space>
    </Card>
  );
};

const ChainView: React.FC<{ nodes: ChainNode[]; selectedItemId: string; onSelect: (id?: string) => void }> = ({ nodes, selectedItemId, onSelect }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
      {nodes.map((node, idx) => (
        <React.Fragment key={`${node.type}-${node.step}-${idx}`}>
          {node.type === 'item' && node.item && (
            <Card size="small" style={{
              minWidth: 320, borderRadius: 8,
              borderColor: node.item.id === selectedItemId ? '#1677ff' : undefined,
              boxShadow: node.item.id === selectedItemId ? '0 0 0 2px rgba(22,119,255,0.2)' : undefined,
            }} styles={{ body: { padding: '8px 12px' } }}>
              <Space size={6}>
                {node.item.id === selectedItemId && <Tag color="blue">Selected</Tag>}
                <Button type="link" size="small" style={{ padding: 0, fontWeight: 700 }} onClick={() => onSelect(node.item!.id)}>{node.item!.itemCode}</Button>
                <Text>{node.item!.name}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{specLine(node.item)}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>{node.item!.uom?.code || ''}</Text>
              </Space>
            </Card>
          )}
          {node.type === 'process' && node.operation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
              <ArrowDownOutlined style={{ color: '#1677ff' }} />
              <Card size="small" style={{ minWidth: 380, background: '#f5f7fa', borderRadius: 8 }} styles={{ body: { padding: '8px 12px' } }}>
                <Space size={8} wrap>
                  <Tag color="cyan">{node.operation.operationCode}</Tag>
                  <Text strong>{node.operation.operationName}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {node.operation.division?.name} · {node.operation.section?.name} · {node.operation.department?.name}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {node.operation.inputQuantity} → {node.operation.outputQuantity} {node.operation.uom?.code || ''} · Scrap {node.operation.scrapPercentage}%
                  </Text>
                  {node.operation.additionalInputs && node.operation.additionalInputs.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Additional inputs: {node.operation.additionalInputs.map((a) => `${a.itemCode || a.itemName} (${num(a.quantity)})`).join(', ')}
                    </Text>
                  )}
                </Space>
              </Card>
            </div>
          )}
          {node.type === 'item' && idx < nodes.length - 1 && <ArrowDownOutlined style={{ color: '#1677ff', marginLeft: 40 }} />}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Traceability;