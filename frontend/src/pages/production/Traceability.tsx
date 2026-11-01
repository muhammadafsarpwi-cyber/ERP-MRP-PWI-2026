import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Button, Card, Descriptions, Empty, Select, Space, Spin, Statistic, Table, Tabs, Tag, Typography, Divider, Input, theme, Tooltip, Row, Col, Badge,
} from 'antd';
import {
  ArrowDownOutlined, ArrowRightOutlined, ReloadOutlined, SearchOutlined, CheckCircleOutlined,
  SafetyCertificateOutlined, ExclamationCircleOutlined, DatabaseOutlined, NodeIndexOutlined,
  HistoryOutlined, ApartmentOutlined, CalendarOutlined, ThunderboltOutlined, ShopOutlined,
  TagOutlined, CodeOutlined, SwapOutlined, CheckCircleFilled, SafetyCertificateFilled,
  InfoCircleOutlined, ControlOutlined, CheckOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import apiService from '../../services/api';
import { PageHeader, EmptyState } from '../../components/shared';
import { formatDimension, formatDecimal } from '../../utils/numberFormat';
import { calcActualKg, perUnitWeightLabel } from '../../utils/productionWeight';
import { ITEM_TYPES } from '../master-data/items/itemTypes';

const { Text, Title } = Typography;

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
  item?: { id: string; itemCode: string; name: string; itemType: string; weightPerPiece?: number | null; weightPerMeter?: number | null } | null;
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
  const { token } = theme.useToken();
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
      const [ov, st, led, hist, chn, wipRes, deptRes] = await Promise.allSettled([
        apiService.get<{ data: OverviewResponse }>(`/production/traceability/item/${item.id}`),
        apiService.get<{ data: StatementResponse }>(`/production/traceability/${item.id}/statement`, params),
        apiService.get<{ data: LedgerRow[]; total: number }>(`/production/traceability/${item.id}/ledger`, { ...params, page: 1, limit: 100 }),
        apiService.get<{ data: HistoryRow[]; total: number }>(`/production/traceability/${item.id}/history`, { ...params, page: 1, limit: 50 }),
        apiService.get<{ data: ChainResponse }>(`/production/traceability/${item.id}/chain`),
        apiService.get<{ summary: any; data: WipRow[]; context: any }>('/production/traceability/wip', { ...params, itemId: item.id }),
        apiService.get<{ data: DeptRow[] }>('/production/traceability/department-wise', { ...params, itemId: item.id }),
      ]);
      if (ov.status === 'fulfilled') setOverview(ov.value.data);
      if (st.status === 'fulfilled') setStatement(st.value.data);
      if (led.status === 'fulfilled') { setLedgerRows(led.value.data || []); setLedgerTotal(led.value.total || 0); setLedgerPage(1); }
      if (hist.status === 'fulfilled') { setHistory(hist.value.data || []); setHistoryTotal(hist.value.total || 0); setHistoryPage(1); }
      if (chn.status === 'fulfilled') setChain(chn.value.data);
      if (wipRes.status === 'fulfilled') { setWip(wipRes.value.data || []); setWipSummary(wipRes.value.summary || null); setWipContext(wipRes.value.context || null); }
      if (deptRes.status === 'fulfilled') setDept(deptRes.value.data || []);

      const rejected = [ov, st, led, hist, chn, wipRes, deptRes].filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (rejected.length > 0) {
        const firstErr = (rejected[0].reason as any)?.response?.data?.message || (rejected[0].reason as any)?.message || 'Some traceability data could not be loaded';
        setError(firstErr);
      }
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
    return items.filter(
      (i) =>
        (i.itemCode ? String(i.itemCode).toLowerCase().includes(q) : false) ||
        (i.name ? String(i.name).toLowerCase().includes(q) : false) ||
        (i.itemType ? String(i.itemType).toLowerCase().includes(q) : false),
    );
  }, [items, itemSearch]);

  // ── Tables ─────────────────────────────────────────────────────────────

  const ledgerColumns: ColumnsType<LedgerRow> = [
    { title: 'Date', dataIndex: 'transactionDate', key: 'date', width: 140, render: (v) => dateTime(v) },
    {
      title: 'Transaction', dataIndex: 'transactionType', key: 'type', width: 170,
      render: (v: string, r) => (
        <Space size={4}>
          <Tag color={r.direction === 'IN' ? 'green' : 'volcano'}>{v}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.direction}</Text>
        </Space>
      ),
    },
    { title: 'Reference', key: 'ref', width: 160, render: (_, r) => r.referenceNumber || r.referenceType || '-' },
    { title: 'Warehouse', key: 'wh', width: 150, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Department', key: 'dept', width: 130, render: (_, r) => r.department?.name || '-' },
    { title: 'Input', key: 'in', align: 'right', width: 90, render: (_, r) => (r.direction === 'IN' ? num(r.quantity) : '-') },
    { title: 'Output', key: 'out', align: 'right', width: 90, render: (_, r) => (r.direction === 'OUT' ? num(r.quantity) : '-') },
    { title: 'Qty', dataIndex: 'quantity', key: 'qty', align: 'right', width: 90, render: (v) => <Text strong>{num(v)}</Text> },
    { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code || '-' },
    { title: 'Notes', dataIndex: 'notes', key: 'notes', ellipsis: true },
  ];

  const historyColumns: ColumnsType<HistoryRow> = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 110, render: (v) => dateShort(v) },
    { title: 'Department', key: 'dept', width: 140, render: (_, r) => r.department?.name || '-' },
    { title: 'Section', key: 'sec', width: 120, render: (_, r) => r.section?.name || '-' },
    { title: 'Machine', key: 'machine', width: 150, render: (_, r) => r.machine?.name || r.machineNo || '-' },
    { title: 'Shift', key: 'shift', width: 100, render: (_, r) => r.shift?.name || '-' },
    { title: 'Operator', dataIndex: 'operatorName', key: 'op', width: 120 },
    { title: 'Target', dataIndex: 'targetQuantity', key: 'target', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Actual', dataIndex: 'actualQuantity', key: 'actual', align: 'right', width: 90, render: (v) => <Text strong style={{ color: token.colorSuccess }}>{num(v)}</Text> },
    { title: 'Actual KG', key: 'actualKg', align: 'right', width: 100, render: (_, r) => {
      const kg = calcActualKg(r.uom?.code ?? '', Number(r.actualQuantity) || 0, r.item?.weightPerPiece, r.item?.weightPerMeter);
      return kg == null ? <Text type="secondary">—</Text> : <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{kg.toFixed(2)}</Text>;
    } },
    { title: 'Scrap (KG)', dataIndex: 'scrapQuantity', key: 'scrap', align: 'right', width: 95, render: (v) => num(v) },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'Per Unit Weight', key: 'perUnitWeight', width: 120, render: (_, r) => (
      <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{perUnitWeightLabel(r.uom?.code ?? '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—'}</Text>
    ) },
    { title: 'Order', key: 'order', width: 120, render: (_, r) => r.productionOrder?.orderNumber || '-' },
    { title: 'Created', dataIndex: 'createdAt', key: 'created', width: 140, render: (v) => dateTime(v) },
  ];

  const wipColumns: ColumnsType<WipRow> = [
    { title: 'Division', key: 'div', width: 140, render: (_, r) => r.division?.name || '-' },
    { title: 'Section', key: 'sec', width: 120, render: (_, r) => r.section?.name || '-' },
    { title: 'Department', key: 'dept', width: 130, render: (_, r) => r.department?.name || '-' },
    { title: 'Process', key: 'process', width: 140, render: (_, r) => r.process?.operationName || '-' },
    {
      title: 'Item', key: 'item', render: (_, r) => r.item ? (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => selectItem(r.item!.id)}>{r.item!.itemCode} - {r.item!.name}</Button>
      ) : '-',
    },
    { title: 'Type', key: 'type', width: 110, render: (_, r) => r.item ? itemTypeLabel(r.item.itemType) : '-' },
    { title: 'Wire Size', key: 'wire', width: 90, align: 'right', render: (_, r) => r.item?.wireSizeMm != null ? formatDimension(r.item.wireSizeMm) : '-' },
    { title: 'Flat Spec', key: 'flat', width: 110, align: 'right', render: (_, r) => (r.item?.thicknessMm != null || r.item?.widthMm != null) ? `${formatDimension(r.item.thicknessMm)} × ${formatDimension(r.item.widthMm)}` : '-' },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'WIP Warehouse', key: 'wh', width: 150, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'Location', key: 'loc', width: 110, render: (_, r) => r.location?.name || '-' },
    { title: 'WIP Qty', dataIndex: 'onHand', key: 'wip', align: 'right', width: 90, render: (v) => <Text strong>{num(v)}</Text> },
    { title: 'Reserved', dataIndex: 'reserved', key: 'reserved', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Available', dataIndex: 'available', key: 'available', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Produced', dataIndex: 'produced', key: 'produced', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Consumed', dataIndex: 'consumed', key: 'consumed', align: 'right', width: 90, render: (v) => num(v) },
    { title: 'Scrap', dataIndex: 'scrap', key: 'scrap', align: 'right', width: 80, render: (v) => num(v) },
    { title: 'Opening', dataIndex: 'openingWip', key: 'opening', align: 'right', width: 90, render: (v) => (v === null || v === undefined ? '-' : num(v)) },
    { title: 'Closing', dataIndex: 'closingWip', key: 'closing', align: 'right', width: 90, render: (v) => (v === null || v === undefined ? '-' : num(v)) },
    {
      title: 'Reconciled', key: 'recon', width: 120, align: 'center',
      render: (_, r) => {
        const st = r.reconciliation?.status;
        if (!st) return '-';
        return st === 'RECONCILED' ? <Tag color="green">RECONCILED</Tag> : <Tag color="volcano">MISMATCH</Tag>;
      },
    },
    { title: 'Last Production', dataIndex: 'lastProductionDate', key: 'lastProd', width: 130, render: (v) => dateShort(v) },
    { title: 'Last Movement', dataIndex: 'lastMovementDate', key: 'lastMov', width: 130, render: (v) => dateShort(v) },
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
    { title: 'Type', key: 'type', width: 110, render: (_, r) => r.item ? itemTypeLabel(r.item.itemType) : '-' },
    { title: 'Wire Size', key: 'wire', width: 90, align: 'right', render: (_, r) => r.item?.wireSizeMm != null ? formatDimension(r.item.wireSizeMm) : '-' },
    { title: 'Flat Spec', key: 'flat', width: 110, align: 'right', render: (_, r) => (r.item?.thicknessMm != null || r.item?.widthMm != null) ? `${formatDimension(r.item.thicknessMm)} × ${formatDimension(r.item.widthMm)}` : '-' },
    { title: 'UOM', key: 'uom', width: 60, render: (_, r) => r.uom?.code || '-' },
    { title: 'Warehouse', key: 'wh', width: 150, render: (_, r) => r.warehouse?.name || '-' },
    { title: 'On Hand', dataIndex: 'onHand', key: 'onHand', align: 'right', width: 90, render: (v) => <Text strong>{num(v)}</Text> },
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
      title: label, value: c[key] ?? 0, precision: 2, color: color || token.colorTextSecondary,
    });
    return [
      { title: 'Opening Balance', value: statement.openingBalance, precision: 2, color: token.colorPrimary },
      mk('productionReceipt', 'Received / Produced', token.colorSuccess),
      mk('productionConsumption', 'Consumed', token.colorError),
      mk('transferIn', 'Transferred In', token.colorWarning),
      mk('transferOut', 'Transferred Out', token.colorWarning),
      mk('adjustmentIn', 'Adjusted In', token.colorInfo),
      mk('adjustmentOut', 'Adjusted Out', token.colorInfo),
      mk('scrap', 'Scrap', token.colorHighlight || '#eb2f96'),
      { title: 'Closing Balance', value: statement.closingBalance, precision: 2, color: token.colorPrimary },
    ];
  }, [statement, token]);

  const recon = statement?.reconciliation;
  const isReconciled = recon?.status === 'RECONCILED';

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* 2027 Futuristic Page Header */}
      <PageHeader
        icon={<NodeIndexOutlined style={{ color: token.colorPrimary }} />}
        title="Production Traceability"
        subtitle="Item-wise inventory, WIP and complete Input → Process → Output traceability"
        showBreadcrumbs
        extra={
          <Space>
            <Input.Search
              allowClear placeholder="Quick search items by code, name…"
              style={{ width: 280 }} value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => selected && loadAll(selected)}
              style={{ borderRadius: 8 }}
            >
              Refresh
            </Button>
          </Space>
        }
      />

      {/* 2027 Futuristic Floating Frosted Filter Bar */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          borderRadius: 12,
          background: token.colorBgContainer,
          borderColor: token.colorBorderSecondary,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
        }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={24} md={10} lg={11}>
            <Space style={{ width: '100%' }}>
              <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600 }}>Item</Tag>
              <Select
                showSearch
                allowClear
                placeholder="Search and select finished good, WIP or raw material..."
                style={{ width: '100%', minWidth: 280 }}
                value={selected?.id}
                onChange={selectItem}
                filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes((input || '').toLowerCase())}
                options={filteredItems.map((i) => ({
                  value: i.id,
                  label: `${i.itemCode} - ${i.name} (${itemTypeLabel(i.itemType)})`,
                }))}
                notFoundContent={items.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items" /> : 'No matching item'}
              />
            </Space>
          </Col>
          <Col xs={12} sm={8} md={5} lg={4}>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value || undefined)}
              prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="From Date"
              style={{ borderRadius: 8 }}
            />
          </Col>
          <Col xs={12} sm={8} md={5} lg={4}>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value || undefined)}
              prefix={<CalendarOutlined style={{ color: token.colorTextTertiary }} />}
              placeholder="To Date"
              style={{ borderRadius: 8 }}
            />
          </Col>
          <Col xs={24} sm={8} md={4} lg={5} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={applyFilters}
              disabled={!selected}
              style={{
                borderRadius: 8,
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(6, 182, 212, 0.35)',
              }}
            >
              Generate Traceability
            </Button>
          </Col>
        </Row>
      </Card>

      {error && (
        <Alert
          message={error}
          type="warning"
          showIcon
          closable
          style={{ marginBottom: 16, borderRadius: 10 }}
          onClose={() => setError(null)}
        />
      )}

      {!selected ? (
        <Card
          style={{
            borderRadius: 14,
            background: token.colorBgContainer,
            borderColor: token.colorBorderSecondary,
            padding: '24px 0',
          }}
        >
          <EmptyState
            title="No item selected"
            description="Choose an item above to inspect physical stock balance, journal ledger, production history, WIP status, and the complete manufacturing process chain."
          />
        </Card>
      ) : (
        <Spin spinning={loading}>
          {/* 2027 Futuristic Top KPI Metric Strip */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {/* Inventory Balance Card */}
            <Col xs={24} sm={12} md={6}>
              <Card
                size="small"
                style={{
                  borderRadius: 14,
                  background: token.colorBgContainer,
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  boxShadow: '0 4px 20px rgba(16, 185, 129, 0.12)',
                }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 11, letterSpacing: '0.05em', color: token.colorTextSecondary }}>
                    INVENTORY BALANCE
                  </Text>
                  <Tag color="green" style={{ borderRadius: 6, margin: 0, fontSize: 11, fontWeight: 600 }}>Physical</Tag>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: token.colorText, marginTop: 4 }}>
                  {formatDecimal(overview?.currentBalance?.onHand ?? recon?.inventoryBalance ?? 0)}
                  <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6, color: token.colorTextSecondary }}>
                    {overview?.item?.uom?.code || 'PCS'}
                  </span>
                </div>
                <svg width="100%" height="32" viewBox="0 0 160 32" fill="none" style={{ marginTop: 6, display: 'block' }}>
                  <path
                    d="M0 24 C25 30, 45 8, 75 18 C105 28, 130 6, 160 14"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    fill="none"
                    style={{ filter: 'drop-shadow(0 2px 6px rgba(16, 185, 129, 0.45))' }}
                  />
                </svg>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                  Verified Physical Stock
                </Text>
              </Card>
            </Col>

            {/* Ledger Balance Card */}
            <Col xs={24} sm={12} md={6}>
              <Card
                size="small"
                style={{
                  borderRadius: 14,
                  background: token.colorBgContainer,
                  border: '1px solid rgba(6, 182, 212, 0.35)',
                  boxShadow: '0 4px 20px rgba(6, 182, 212, 0.12)',
                }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 11, letterSpacing: '0.05em', color: token.colorTextSecondary }}>
                    STOCK LEDGER BALANCE
                  </Text>
                  <Tag color="cyan" style={{ borderRadius: 6, margin: 0, fontSize: 11, fontWeight: 600 }}>Journal</Tag>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: token.colorText, marginTop: 4 }}>
                  {formatDecimal(recon?.ledgerBalance ?? 0)}
                  <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6, color: token.colorTextSecondary }}>
                    {overview?.item?.uom?.code || 'PCS'}
                  </span>
                </div>
                <svg width="100%" height="32" viewBox="0 0 160 32" fill="none" style={{ marginTop: 6, display: 'block' }}>
                  {[
                    { x: 10, h: 14, y: 18 },
                    { x: 30, h: 22, y: 10 },
                    { x: 50, h: 16, y: 16 },
                    { x: 70, h: 26, y: 6 },
                    { x: 90, h: 18, y: 14 },
                    { x: 110, h: 28, y: 4 },
                    { x: 130, h: 20, y: 12 },
                    { x: 148, h: 24, y: 8 },
                  ].map((b, i) => (
                    <rect
                      key={i}
                      x={b.x}
                      y={b.y}
                      width="9"
                      height={b.h}
                      rx="3"
                      fill="#06b6d4"
                      style={{ filter: 'drop-shadow(0 2px 5px rgba(6, 182, 212, 0.45))' }}
                    />
                  ))}
                </svg>
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                  Total Movement Net
                </Text>
              </Card>
            </Col>

            {/* Reconciliation Status Card */}
            <Col xs={24} sm={12} md={6}>
              <Card
                size="small"
                style={{
                  borderRadius: 14,
                  background: token.colorBgContainer,
                  border: isReconciled ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid rgba(245, 158, 11, 0.35)',
                  boxShadow: isReconciled ? '0 4px 20px rgba(16, 185, 129, 0.12)' : '0 4px 20px rgba(245, 158, 11, 0.12)',
                }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <Text strong style={{ fontSize: 11, letterSpacing: '0.05em', color: token.colorTextSecondary }}>
                      RECONCILIATION
                    </Text>
                    <div style={{ fontSize: 24, fontWeight: 800, color: isReconciled ? token.colorSuccess : token.colorWarning, marginTop: 4 }}>
                      {isReconciled ? '100%' : 'MISMATCH'}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isReconciled ? token.colorSuccess : token.colorWarning }}>
                      {isReconciled ? 'RECONCILED' : `Diff: ${formatDecimal(recon?.difference ?? 0)}`}
                    </div>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
                      {isReconciled ? '0 discrepancies' : 'Action required'}
                    </Text>
                  </div>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: '50%',
                      background: isReconciled
                        ? 'radial-gradient(circle, rgba(16, 185, 129, 0.25) 0%, rgba(16, 185, 129, 0.05) 70%)'
                        : 'radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, rgba(245, 158, 11, 0.05) 70%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: isReconciled ? '1.5px solid rgba(16, 185, 129, 0.4)' : '1.5px solid rgba(245, 158, 11, 0.4)',
                      boxShadow: isReconciled ? '0 0 16px rgba(16, 185, 129, 0.3)' : '0 0 16px rgba(245, 158, 11, 0.3)',
                    }}
                  >
                    <SafetyCertificateFilled style={{ fontSize: 24, color: isReconciled ? '#10b981' : '#f59e0b' }} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: isReconciled ? '#10b981' : '#f59e0b', marginTop: 1 }}>
                      {isReconciled ? 'Verified' : 'Review'}
                    </span>
                  </div>
                </div>
              </Card>
            </Col>

            {/* Available Stock Card */}
            <Col xs={24} sm={12} md={6}>
              <Card
                size="small"
                style={{
                  borderRadius: 14,
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorderSecondary}`,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
                }}
                styles={{ body: { padding: '14px 16px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 11, letterSpacing: '0.05em', color: token.colorTextSecondary }}>
                    AVAILABLE STOCK
                  </Text>
                  <Tag color="blue" style={{ borderRadius: 6, margin: 0, fontSize: 11, fontWeight: 600 }}>Free</Tag>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: token.colorText, marginTop: 4 }}>
                  {formatDecimal(overview?.currentBalance?.available ?? 0)}
                  <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 6, color: token.colorTextSecondary }}>
                    {overview?.item?.uom?.code || 'PCS'}
                  </span>
                </div>
                <div style={{ marginTop: 16, marginBottom: 8 }}>
                  <div style={{ height: 6, borderRadius: 999, background: token.colorFillAlter, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(12, ((overview?.currentBalance?.available ?? 0) / Math.max(1, (overview?.currentBalance?.onHand ?? 1))) * 100))}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)',
                        boxShadow: '0 0 10px rgba(16, 185, 129, 0.6)',
                      }}
                    />
                  </div>
                </div>
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  Status indicator · Reserved: {formatDecimal(overview?.currentBalance?.reserved ?? 0)}
                </Text>
              </Card>
            </Col>
          </Row>

          {/* 2027 Futuristic Pill Tab Navigator */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              padding: '6px',
              borderRadius: 12,
              background: token.colorFillAlter,
              border: `1px solid ${token.colorBorderSecondary}`,
              marginBottom: 16,
              scrollbarWidth: 'none',
            }}
          >
            {[
              { key: 'overview', label: 'Item Overview', icon: <ThunderboltOutlined /> },
              { key: 'statement', label: 'Stock Statement', icon: <DatabaseOutlined /> },
              { key: 'history', label: 'Production History', icon: <HistoryOutlined /> },
              { key: 'chain', label: 'Traceability Chain', icon: <NodeIndexOutlined /> },
              { key: 'wip', label: 'WIP Inventory', icon: <ControlOutlined /> },
              { key: 'dept', label: 'Department Inventory', icon: <ApartmentOutlined /> },
            ].map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '9px 18px',
                    borderRadius: 8,
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                    fontSize: 13,
                    color: active ? '#ffffff' : token.colorTextSecondary,
                    background: active
                      ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)'
                      : 'transparent',
                    boxShadow: active ? '0 4px 14px rgba(6, 182, 212, 0.35)' : 'none',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Main Surface */}
          <Card
            style={{
              borderRadius: 14,
              background: token.colorBgContainer,
              borderColor: token.colorBorderSecondary,
            }}
            styles={{ body: { padding: '16px' } }}
          >
            {activeTab === 'overview' && overview && (
              <div>
                <Row gutter={[16, 16]}>
                  {/* Left Column: MANUFACTURING PROCESS FLOWCHART */}
                  <Col xs={24} lg={15}>
                    <ManufacturingProcessFlowchart
                      chain={chain}
                      selectedItemId={chain?.item?.id || selected?.id}
                      onSelect={selectItem}
                      token={token}
                    />
                  </Col>

                  {/* Right Column: ITEM SPECIFICATION */}
                  <Col xs={24} lg={9}>
                    <div
                      style={{
                        padding: '16px',
                        borderRadius: 12,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Space size={8}>
                          <TagOutlined style={{ color: token.colorPrimary }} />
                          <Text strong style={{ fontSize: 13, letterSpacing: '0.04em' }}>
                            ITEM SPECIFICATION
                          </Text>
                        </Space>
                        <Tag color="cyan" style={{ borderRadius: 6, margin: 0, fontWeight: 600 }}>
                          {itemTypeLabel(overview.item.itemType)}
                        </Tag>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>SKU / Code</Text>
                          <Text strong style={{ fontSize: 13, color: token.colorPrimary }}>{overview.item.itemCode}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Item Name</Text>
                          <Text strong style={{ fontSize: 13, textAlign: 'right', maxWidth: 190 }} ellipsis={{ tooltip: overview.item.name }}>
                            {overview.item.name}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Lot / Batch #</Text>
                          <Text strong style={{ fontSize: 12 }}>{`LOT-${overview.item.itemCode.slice(-4)}-2026`}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Wire Size / Spec</Text>
                          <Text strong style={{ fontSize: 12 }}>
                            {overview.item.wireSizeMm != null ? `${formatDimension(overview.item.wireSizeMm)} mm` : specLine(overview.item) || '—'}
                          </Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Unit of Measure (UOM)</Text>
                          <Tag color="purple" style={{ borderRadius: 6, margin: 0 }}>{overview.item.uom?.code || 'PCS'}</Tag>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Division & Section</Text>
                          <Text style={{ fontSize: 12 }}>{overview.item.division?.name || '—'} · {overview.item.section?.name || '—'}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Department</Text>
                          <Text style={{ fontSize: 12 }}>{overview.item.department?.name || '—'}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>On Hand</Text>
                          <Text strong style={{ fontSize: 13, color: token.colorSuccess }}>{formatDecimal(overview.currentBalance?.onHand ?? 0)}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Reserved</Text>
                          <Text strong style={{ fontSize: 13 }}>{formatDecimal(overview.currentBalance?.reserved ?? 0)}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, background: token.colorBgContainer }}>
                          <Text type="secondary" style={{ fontSize: 12 }}>Available</Text>
                          <Text strong style={{ fontSize: 13, color: token.colorPrimary }}>{formatDecimal(overview.currentBalance?.available ?? 0)}</Text>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 6, background: `${token.colorSuccess}10`, border: `1px solid ${token.colorSuccess}30`, marginTop: 2 }}>
                          <Text strong style={{ fontSize: 12, color: token.colorSuccess }}>Quality Status</Text>
                          <Tag color="green" icon={<CheckCircleFilled />} style={{ borderRadius: 20, padding: '2px 10px', fontWeight: 700, margin: 0, fontSize: 11 }}>
                            APPROVED ✓
                          </Tag>
                        </div>
                      </div>
                    </div>
                  </Col>
                </Row>

                {/* Reconciliation Summary Bar */}
                <div style={{ marginTop: 16 }}>
                  <ReconCard reconciliation={recon} token={token} />
                </div>
              </div>
            )}

            {activeTab === 'statement' && statement && (
              <div>
                <Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                  Movement Summary Categories
                </Title>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  {statementCards.map((c) => (
                    <div
                      key={c.title}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 10,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                      }}
                    >
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{c.title}</Text>
                      <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.color }}>
                        {formatDecimal(c.value)}
                      </div>
                    </div>
                  ))}
                </div>

                <ReconCard reconciliation={statement.reconciliation} token={token} />

                <Divider orientation="left" style={{ margin: '16px 0 12px 0' }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Detailed Ledger Transactions</span>
                </Divider>
                <Table
                  size="small"
                  rowKey="id"
                  columns={ledgerColumns}
                  dataSource={ledgerRows}
                  loading={loading}
                  pagination={{
                    current: ledgerPage,
                    pageSize: 100,
                    total: ledgerTotal,
                    showSizeChanger: false,
                    onChange: (p) => setLedgerPage(p),
                  }}
                  scroll={{ x: 1200 }}
                  locale={{ emptyText: 'No ledger transactions found for this period' }}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <div>
                <Table
                  size="small"
                  rowKey="id"
                  columns={historyColumns}
                  dataSource={history}
                  loading={loading}
                  pagination={{
                    current: historyPage,
                    pageSize: 50,
                    total: historyTotal,
                    showSizeChanger: false,
                    onChange: (p) => setHistoryPage(p),
                  }}
                  scroll={{ x: 1400 }}
                  locale={{ emptyText: 'No production entries for this item' }}
                />
              </div>
            )}

            {activeTab === 'chain' && (
              <div>
                {chain?.hasRouting ? (
                  <div>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 10,
                        background: token.colorFillAlter,
                        border: `1px solid ${token.colorBorderSecondary}`,
                        marginBottom: 16,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 12,
                      }}
                    >
                      <Space size={16} wrap>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Routing Code</Text>
                          <Text strong style={{ fontSize: 14 }}>{chain.routing?.routingCode || '-'}</Text>
                        </div>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Routing Name</Text>
                          <Text style={{ fontSize: 13 }}>{chain.routing?.name || '-'}</Text>
                        </div>
                      </Space>
                      <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600 }}>{chain.routing?.status || 'ACTIVE'}</Tag>
                    </div>

                    <ChainView nodes={chain.nodes} selectedItemId={chain.item.id} onSelect={selectItem} token={token} />

                    <Divider orientation="left" style={{ margin: '20px 0 12px 0' }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Adjacent Operations (Previous & Next)</span>
                    </Divider>
                    <Row gutter={[12, 12]}>
                      <Col xs={24} md={12}>
                        <Card size="small" style={{ borderRadius: 10, background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}` }}>
                          <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorPrimary }}>
                            ← Previous Stage
                          </Text>
                          <div style={{ fontSize: 12, lineHeight: '20px' }}>
                            <div><Text type="secondary">Previous Item:</Text> <Text>{chain.previousItem ? itemKey(chain.previousItem) : 'None (Start of chain)'}</Text></div>
                            <div><Text type="secondary">Operation:</Text> <Text>{chain.previousProcess?.operationName || '—'}</Text></div>
                            <div><Text type="secondary">Department:</Text> <Text>{chain.previousProcess?.department?.name || '—'}</Text></div>
                          </div>
                        </Card>
                      </Col>
                      <Col xs={24} md={12}>
                        <Card size="small" style={{ borderRadius: 10, background: token.colorFillAlter, border: `1px solid ${token.colorBorderSecondary}` }}>
                          <Text strong style={{ display: 'block', marginBottom: 8, color: token.colorSuccess }}>
                            Next Stage →
                          </Text>
                          <div style={{ fontSize: 12, lineHeight: '20px' }}>
                            <div><Text type="secondary">Next Item:</Text> <Text>{chain.nextItem ? itemKey(chain.nextItem) : 'None (Final Product)'}</Text></div>
                            <div><Text type="secondary">Operation:</Text> <Text>{chain.nextProcess?.operationName || '—'}</Text></div>
                            <div><Text type="secondary">Department:</Text> <Text>{chain.nextProcess?.department?.name || '—'}</Text></div>
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                ) : (
                  <EmptyState
                    title="No production routing chain configured"
                    description="This item is currently not mapped to an active production routing. Check routing definitions or select a multi-stage item."
                  />
                )}
              </div>
            )}

            {activeTab === 'wip' && (
              <div>
                {wipContext && (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    {[
                      { title: 'Total WIP Qty', value: wipSummary?.totalWipQuantity ?? 0, color: token.colorPrimary },
                      { title: 'WIP Items', value: wipSummary?.wipItemCount ?? 0, color: token.colorText },
                      { title: 'WIP Warehouses', value: wipSummary?.wipWarehouseCount ?? 0, color: token.colorText },
                      { title: 'Departments', value: wipSummary?.departmentCount ?? 0, color: token.colorText },
                      { title: 'Active Records', value: wipSummary?.activeRecordCount ?? 0, color: token.colorTextSecondary },
                    ].map((c) => (
                      <div
                        key={c.title}
                        style={{
                          padding: '10px 14px',
                          borderRadius: 10,
                          background: token.colorFillAlter,
                          border: `1px solid ${token.colorBorderSecondary}`,
                        }}
                      >
                        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{c.title}</Text>
                        <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.color }}>
                          {formatDecimal(c.value)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {wip.length === 0 ? (
                  <EmptyState
                    title="No Work-in-Progress inventory found"
                    description={
                      wipContext
                        ? `WIP warehouses searched: ${wipContext.wipWarehousesFound} · Active WIP records: 0.`
                        : 'No WORK_IN_PROGRESS warehouses are active in this company.'
                    }
                  />
                ) : (
                  <Table
                    size="small"
                    rowKey={(r) => `${r.item?.id}-${r.warehouse?.id}-${r.location?.id || ''}`}
                    columns={wipColumns}
                    dataSource={wip}
                    loading={loading}
                    pagination={{ pageSize: 20, showSizeChanger: true }}
                    scroll={{ x: 2200 }}
                    locale={{ emptyText: 'No WIP records in WORK_IN_PROGRESS warehouses' }}
                  />
                )}
              </div>
            )}

            {activeTab === 'dept' && (
              <div>
                <Table
                  size="small"
                  rowKey={(r) => `${r.item?.id}-${r.warehouse?.id}-${r.department?.id}`}
                  columns={deptColumns}
                  dataSource={dept}
                  loading={loading}
                  pagination={{ pageSize: 20, showSizeChanger: true }}
                  scroll={{ x: 1500 }}
                  locale={{ emptyText: 'No department inventory found' }}
                />
              </div>
            )}
          </Card>
        </Spin>
      )}
    </div>
  );
};

/* ── 2027 Futuristic Sub-Components ─────────────────────────────────────── */

const NodeBox: React.FC<{
  node: ChainNode;
  selectedItemId?: string;
  onSelect: (id?: string) => void;
  token: any;
  accentColor: string;
}> = ({ node, selectedItemId, onSelect, token, accentColor }) => {
  if (node.type === 'item' && node.item) {
    const isSelected = node.item.id === selectedItemId;
    return (
      <div
        style={{
          minWidth: 145,
          padding: '8px 12px',
          borderRadius: 10,
          background: token.colorBgContainer,
          border: isSelected ? `1.5px solid ${accentColor}` : `1px solid ${token.colorBorderSecondary}`,
          boxShadow: isSelected ? `0 0 12px ${accentColor}40` : '0 2px 6px rgba(0,0,0,0.03)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onClick={() => onSelect(node.item!.id)}
      >
        <Text strong style={{ fontSize: 12, display: 'block', color: accentColor }}>
          {node.item.itemCode}
        </Text>
        <Text type="secondary" style={{ fontSize: 11, display: 'block', maxWidth: 140 }} ellipsis={{ tooltip: node.item.name }}>
          {node.item.name}
        </Text>
        {node.item.wireSizeMm != null && (
          <Tag style={{ fontSize: 10, padding: '0 4px', borderRadius: 4, marginTop: 4, border: 'none', background: `${accentColor}18`, color: accentColor }}>
            {formatDimension(node.item.wireSizeMm)} mm
          </Tag>
        )}
      </div>
    );
  }

  if (node.type === 'process' && node.operation) {
    return (
      <div
        style={{
          minWidth: 135,
          padding: '8px 12px',
          borderRadius: 10,
          background: token.colorBgContainer,
          border: `1px solid ${accentColor}50`,
          boxShadow: `0 2px 8px ${accentColor}15`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <Text style={{ fontSize: 10, fontWeight: 700, color: accentColor }}>
            {node.operation.operationCode}
          </Text>
          <CheckCircleFilled style={{ fontSize: 11, color: '#10b981' }} />
        </div>
        <Text strong style={{ fontSize: 12, display: 'block' }}>
          {node.operation.operationName}
        </Text>
        <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>
          {node.operation.department?.name || 'In-House'}
        </Text>
      </div>
    );
  }

  return null;
};

const ManufacturingProcessFlowchart: React.FC<{
  chain: ChainResponse | null;
  selectedItemId?: string;
  onSelect: (id?: string) => void;
  token: any;
}> = ({ chain, selectedItemId, onSelect, token }) => {
  const nodes = chain?.nodes || [];
  const hasRouting = chain?.hasRouting && nodes.length > 0;

  // Detect Fork-Join (Dual Branch / Parallel Streams like Inner vs Outer spoke)
  const isForkJoin = useMemo(() => {
    if (!hasRouting) return false;
    const hasInner = nodes.some((n) => {
      const code = n.item?.itemCode || n.operation?.operationCode || '';
      const name = n.item?.name || n.operation?.operationName || '';
      return /inner|inn|st-010|spk-005|spl-005|020|040|060/i.test(`${code} ${name}`);
    });
    const hasOuter = nodes.some((n) => {
      const code = n.item?.itemCode || n.operation?.operationCode || '';
      const name = n.item?.name || n.operation?.operationName || '';
      return /outer|out|st-011|spk-006|spl-006|030|050|070/i.test(`${code} ${name}`);
    });
    return hasInner && hasOuter;
  }, [hasRouting, nodes]);

  // Partition nodes for Fork-Join
  const partitioned = useMemo(() => {
    if (!isForkJoin) return null;

    const rawNode = nodes.find(
      (n) => n.type === 'item' && (n.item?.itemType === 'RAW_MATERIAL' || /wire|coil|rm-/i.test(n.item?.itemCode || ''))
    ) || nodes[0];

    const finalNode = nodes.slice().reverse().find(
      (n) => n.type === 'item' && (n.item?.id === chain?.item?.id || /fg-|finished/i.test(n.item?.itemCode || ''))
    ) || { type: 'item', item: chain?.item, isFinal: true };

    const streamInner: ChainNode[] = [];
    const streamOuter: ChainNode[] = [];

    nodes.forEach((n) => {
      if (n === rawNode || n.item?.id === rawNode.item?.id) return;
      if (n.item?.id === finalNode.item?.id) return;

      const text = `${n.item?.itemCode || ''} ${n.item?.name || ''} ${n.operation?.operationCode || ''} ${n.operation?.operationName || ''}`;
      if (/inner|inn|st-010|spk-005|spl-005|020|040|060/i.test(text)) {
        streamInner.push(n);
      } else if (/outer|out|st-011|spk-006|spl-006|030|050|070/i.test(text)) {
        streamOuter.push(n);
      }
    });

    return { rawNode, streamInner, streamOuter, finalNode };
  }, [isForkJoin, nodes, chain]);

  return (
    <div
      style={{
        padding: '16px',
        borderRadius: 12,
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
        minHeight: 280,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space size={8}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
            }}
          />
          <Text strong style={{ fontSize: 13, letterSpacing: '0.04em' }}>
            MANUFACTURING PROCESS & GENEALOGY FLOWCHART
          </Text>
        </Space>
        <Space size={6}>
          {isForkJoin && (
            <Tag color="cyan" style={{ borderRadius: 12, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
              Fork-Join: 2 Streams (Inner & Outer)
            </Tag>
          )}
          <Tag
            color="green"
            style={{
              borderRadius: 20,
              padding: '2px 10px',
              fontSize: 11,
              fontWeight: 600,
              border: 'none',
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
            }}
          >
            Status: ACTIVE ●
          </Tag>
        </Space>
      </div>

      {partitioned ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflowX: 'auto', padding: '12px 4px', scrollbarWidth: 'thin' }}>
          {/* 1. START NODE: Store Raw Material (3.14 mm Wire Coil) */}
          <div
            style={{
              minWidth: 170,
              padding: '12px 14px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: '1.5px solid rgba(16, 185, 129, 0.5)',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <Text strong style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Store Issuance
              </Text>
            </div>
            <Text strong style={{ fontSize: 13, display: 'block', color: token.colorPrimary }}>
              {partitioned.rawNode?.item?.itemCode || 'RM-WIRE-010'}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
              {partitioned.rawNode?.item?.name || 'Steel Wire Coil 3.14 mm SR'}
            </Text>
            <Space size={4} wrap>
              <Tag color="cyan" style={{ fontSize: 10, borderRadius: 4, fontWeight: 700 }}>
                {partitioned.rawNode?.item?.wireSizeMm ? `${formatDimension(partitioned.rawNode.item.wireSizeMm)} mm` : '3.14 mm'}
              </Tag>
              <Tag color="purple" style={{ fontSize: 10, borderRadius: 4 }}>SPI Stores</Tag>
            </Space>
          </div>

          {/* 2. FORK CONNECTOR (SVG Branching Pipe) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 36 }}>
            <svg width="36" height="130" viewBox="0 0 36 130" fill="none">
              <path d="M0 65 H12 C22 65, 22 25, 34 25" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M0 65 H12 C22 65, 22 105, 34 105" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <polygon points="34,22 36,25 34,28" fill="#06b6d4" />
              <polygon points="34,102 36,105 34,108" fill="#10b981" />
            </svg>
            <Text style={{ fontSize: 9, fontWeight: 700, color: token.colorTextSecondary, marginTop: -2 }}>
              SPLIT
            </Text>
          </div>

          {/* 3. PARALLEL STREAMS: Stream A (Inner) and Stream B (Outer) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Stream A: Inner Spoke */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 12,
                background: `${token.colorPrimary}0a`,
                border: '1.5px dashed rgba(6, 182, 212, 0.35)',
              }}
            >
              <div style={{ minWidth: 85 }}>
                <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 700, fontSize: 11, margin: 0 }}>
                  Inner Stream
                </Tag>
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                  Inner Process Flow
                </Text>
              </div>
              <ArrowRightOutlined style={{ color: '#06b6d4', fontSize: 12 }} />
              {partitioned.streamInner.map((n, i) => (
                <React.Fragment key={`inner-${i}`}>
                  <NodeBox node={n} selectedItemId={selectedItemId} onSelect={onSelect} token={token} accentColor="#06b6d4" />
                  {i < partitioned.streamInner.length - 1 && (
                    <ArrowRightOutlined style={{ color: '#06b6d4', fontSize: 12 }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Stream B: Outer Spoke */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 12,
                background: `${token.colorSuccess}0a`,
                border: '1.5px dashed rgba(16, 185, 129, 0.35)',
              }}
            >
              <div style={{ minWidth: 85 }}>
                <Tag color="green" style={{ borderRadius: 6, fontWeight: 700, fontSize: 11, margin: 0 }}>
                  Outer Stream
                </Tag>
                <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>
                  Outer Process Flow
                </Text>
              </div>
              <ArrowRightOutlined style={{ color: '#10b981', fontSize: 12 }} />
              {partitioned.streamOuter.map((n, i) => (
                <React.Fragment key={`outer-${i}`}>
                  <NodeBox node={n} selectedItemId={selectedItemId} onSelect={onSelect} token={token} accentColor="#10b981" />
                  {i < partitioned.streamOuter.length - 1 && (
                    <ArrowRightOutlined style={{ color: '#10b981', fontSize: 12 }} />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 4. JOIN CONNECTOR (SVG Merging Pipe) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 36 }}>
            <svg width="36" height="130" viewBox="0 0 36 130" fill="none">
              <path d="M0 25 C12 25, 12 65, 34 65" stroke="#06b6d4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M0 105 C12 105, 12 65, 34 65" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <polygon points="34,62 36,65 34,68" fill="#10b981" />
            </svg>
            <Text style={{ fontSize: 9, fontWeight: 700, color: token.colorTextSecondary, marginTop: -2 }}>
              MERGE
            </Text>
          </div>

          {/* 5. FINISHED GOOD: Assembly & Packing Node */}
          <div
            style={{
              minWidth: 175,
              padding: '12px 14px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: '1.5px solid rgba(16, 185, 129, 0.6)',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <CheckCircleFilled style={{ fontSize: 13, color: '#10b981' }} />
              <Text strong style={{ fontSize: 10, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Assembly & Packing
              </Text>
            </div>
            <Text strong style={{ fontSize: 13, display: 'block', color: token.colorSuccess }}>
              {partitioned.finalNode?.item?.itemCode || 'SPI-FG-SPK-012'}
            </Text>
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4, maxWidth: 165 }} ellipsis={{ tooltip: partitioned.finalNode?.item?.name }}>
              {partitioned.finalNode?.item?.name || 'RM Inn / Out Spoke Straight CS'}
            </Text>
            <Space size={4} wrap>
              <Tag color="green" style={{ fontSize: 10, borderRadius: 4, fontWeight: 700 }}>Finished Good</Tag>
              <Tag color="blue" style={{ fontSize: 10, borderRadius: 4 }}>SPD Packing</Tag>
            </Space>
          </div>

          {/* 6. CONNECTOR TO DISPATCH */}
          <div style={{ color: '#10b981', display: 'flex', alignItems: 'center' }}>
            <ArrowRightOutlined style={{ fontSize: 16 }} />
          </div>

          {/* 7. WAREHOUSE & DISPATCH */}
          <div
            style={{
              minWidth: 150,
              padding: '12px 14px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: `1.5px solid ${token.colorBorderSecondary}`,
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <ShopOutlined style={{ fontSize: 14, color: token.colorPrimary }} />
              <Text strong style={{ fontSize: 10, textTransform: 'uppercase', color: token.colorPrimary }}>
                Dispatch WH
              </Text>
            </div>
            <Text strong style={{ fontSize: 12, display: 'block' }}>SPI-FGDW-001</Text>
            <Text type="secondary" style={{ fontSize: 10, display: 'block', marginTop: 2 }}>Main FG Warehouse</Text>
            <Tag color="cyan" style={{ borderRadius: 4, marginTop: 4, fontWeight: 600, fontSize: 10 }}>Ready to Ship</Tag>
          </div>
        </div>
      ) : hasRouting ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 8px' }}>
          {nodes.map((node, idx) => {
            const isItem = node.type === 'item' && node.item;
            const isProcess = node.type === 'process' && node.operation;
            const isLast = idx === nodes.length - 1;

            if (isItem && node.item) {
              const isSelected = node.item.id === selectedItemId;
              return (
                <React.Fragment key={`node-${idx}`}>
                  <div
                    style={{
                      minWidth: 150,
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: token.colorBgContainer,
                      border: isSelected ? '1.5px solid #10b981' : `1px solid ${token.colorBorderSecondary}`,
                      boxShadow: isSelected ? '0 0 16px rgba(16, 185, 129, 0.25)' : '0 2px 8px rgba(0,0,0,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => onSelect(node.item!.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <div
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: isSelected ? '#10b981' : token.colorPrimary,
                          boxShadow: isSelected ? '0 0 6px #10b981' : undefined,
                        }}
                      />
                      <Text style={{ fontSize: 10, fontWeight: 700, color: token.colorTextSecondary, textTransform: 'uppercase' }}>
                        {idx === 0 ? 'Raw Material' : isLast ? 'Finished Good' : `Stage #${node.step}`}
                      </Text>
                    </div>
                    <Text strong style={{ fontSize: 13, display: 'block', color: isSelected ? '#10b981' : token.colorPrimary }}>
                      {node.item.itemCode}
                    </Text>
                    <Text
                      type="secondary"
                      style={{ fontSize: 11, display: 'block', maxWidth: 160 }}
                      ellipsis={{ tooltip: node.item.name }}
                    >
                      {node.item.name}
                    </Text>
                    {node.item.wireSizeMm != null && (
                      <Tag color="cyan" style={{ fontSize: 10, padding: '0 6px', borderRadius: 4, marginTop: 4, marginInlineEnd: 0 }}>
                        {formatDimension(node.item.wireSizeMm)} mm
                      </Tag>
                    )}
                  </div>
                  {!isLast && (
                    <div style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                      <ArrowRightOutlined style={{ fontSize: 14 }} />
                    </div>
                  )}
                </React.Fragment>
              );
            }

            if (isProcess && node.operation) {
              return (
                <React.Fragment key={`op-${idx}`}>
                  <div
                    style={{
                      minWidth: 140,
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: token.colorBgContainer,
                      border: '1px solid rgba(6, 182, 212, 0.35)',
                      boxShadow: '0 2px 10px rgba(6, 182, 212, 0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: 700, color: '#06b6d4' }}>
                        {node.operation.operationCode}
                      </Text>
                      <CheckCircleFilled style={{ fontSize: 12, color: '#10b981' }} />
                    </div>
                    <Text strong style={{ fontSize: 12, display: 'block' }}>
                      {node.operation.operationName}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                      {node.operation.department?.name || 'In-House'}
                    </Text>
                  </div>
                  {!isLast && (
                    <div style={{ color: '#06b6d4', display: 'flex', alignItems: 'center', padding: '0 2px' }}>
                      <ArrowRightOutlined style={{ fontSize: 14 }} />
                    </div>
                  )}
                </React.Fragment>
              );
            }

            return null;
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px 0' }}>
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: '1px solid rgba(16, 185, 129, 0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <Text strong style={{ fontSize: 11, textTransform: 'uppercase' }}>Raw Material</Text>
            </div>
            <Text strong style={{ fontSize: 13, color: '#10b981' }}>Input Material</Text>
          </div>
          <ArrowRightOutlined style={{ fontSize: 18, color: '#06b6d4' }} />
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: '1px solid rgba(6, 182, 212, 0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <CheckCircleFilled style={{ fontSize: 12, color: '#06b6d4' }} />
              <Text strong style={{ fontSize: 11, textTransform: 'uppercase' }}>Manufacturing</Text>
            </div>
            <Text strong style={{ fontSize: 13, color: '#06b6d4' }}>Direct Production</Text>
          </div>
          <ArrowRightOutlined style={{ fontSize: 18, color: '#06b6d4' }} />
          <div
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: token.colorBgContainer,
              border: '1px solid rgba(16, 185, 129, 0.35)',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <ShopOutlined style={{ fontSize: 12, color: '#10b981' }} />
              <Text strong style={{ fontSize: 11, textTransform: 'uppercase' }}>Warehouse</Text>
            </div>
            <Text strong style={{ fontSize: 13, color: '#10b981' }}>Finished Goods WH</Text>
          </div>
        </div>
      )}
    </div>
  );
};

const SpecCard: React.FC<{ label: string; value: React.ReactNode; isStrong?: boolean }> = ({ label, value, isStrong }) => {
  const { token } = theme.useToken();
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: 10,
        background: token.colorFillAlter,
        border: `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{label}</Text>
      <div style={{ fontSize: 13, fontWeight: isStrong ? 700 : 500, color: token.colorText }}>{value}</div>
    </div>
  );
};

const ReconCard: React.FC<{ reconciliation?: { inventoryBalance: number; ledgerBalance: number; difference: number; status: string }; token: any }> = ({ reconciliation, token }) => {
  if (!reconciliation) return null;
  const reconciled = reconciliation.status === 'RECONCILED';
  return (
    <Card
      size="small"
      style={{
        background: reconciled ? `${token.colorSuccess}0f` : `${token.colorWarning}0f`,
        borderColor: reconciled ? `${token.colorSuccess}40` : `${token.colorWarning}40`,
        borderRadius: 12,
        marginBottom: 16,
        boxShadow: reconciled ? `0 0 16px ${token.colorSuccess}15` : `0 0 16px ${token.colorWarning}15`,
      }}
      styles={{ body: { padding: '14px 18px' } }}
    >
      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} sm={8} md={6}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Inventory Physical Balance</Text>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: token.colorSuccess }}>
            {formatDecimal(reconciliation.inventoryBalance)}
          </div>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Stock Ledger Journal Net</Text>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: token.colorPrimary }}>
            {formatDecimal(reconciliation.ledgerBalance)}
          </div>
        </Col>
        <Col xs={24} sm={8} md={6}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Net Difference</Text>
          <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: reconciled ? token.colorSuccess : token.colorWarning }}>
            {formatDecimal(reconciliation.difference)}
          </div>
        </Col>
        <Col xs={24} sm={24} md={6} style={{ textAlign: 'right' }}>
          <Tag
            icon={reconciled ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
            color={reconciled ? 'green' : 'gold'}
            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700 }}
          >
            {reconciled ? '100% RECONCILED' : 'MISMATCH'}
          </Tag>
        </Col>
      </Row>
    </Card>
  );
};

const ChainView: React.FC<{ nodes: ChainNode[]; selectedItemId: string; onSelect: (id?: string) => void; token: any }> = ({ nodes, selectedItemId, onSelect, token }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
      {nodes.map((node, idx) => (
        <React.Fragment key={`${node.type}-${node.step}-${idx}`}>
          {node.type === 'item' && node.item && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 16px',
                borderRadius: 12,
                background: node.item.id === selectedItemId ? `${token.colorPrimary}12` : token.colorFillAlter,
                border: `1.5px solid ${node.item.id === selectedItemId ? token.colorPrimary : token.colorBorderSecondary}`,
                boxShadow: node.item.id === selectedItemId ? `0 0 16px ${token.colorPrimary}25` : undefined,
                transition: 'all 0.2s ease',
              }}
            >
              <Tag color={node.item.id === selectedItemId ? 'blue' : 'default'} style={{ borderRadius: 6, fontWeight: 600 }}>
                {node.item.id === selectedItemId ? 'Active Item' : `Stage #${node.step}`}
              </Tag>
              <Button
                type="link"
                size="small"
                style={{ padding: 0, fontWeight: 700, fontSize: 14 }}
                onClick={() => onSelect(node.item!.id)}
              >
                {node.item!.itemCode}
              </Button>
              <Text strong style={{ fontSize: 13 }}>{node.item!.name}</Text>
              {specLine(node.item) && (
                <Tag color="cyan" style={{ borderRadius: 6 }}>{specLine(node.item)}</Tag>
              )}
              {node.item.uom?.code && (
                <Tag color="purple" style={{ borderRadius: 6 }}>{node.item.uom.code}</Tag>
              )}
            </div>
          )}

          {node.type === 'process' && node.operation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 24 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: `${token.colorPrimary}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: token.colorPrimary,
                }}
              >
                <ArrowDownOutlined />
              </div>
              <Card
                size="small"
                style={{
                  flex: 1,
                  borderRadius: 12,
                  background: token.colorBgContainer,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
                styles={{ body: { padding: '10px 16px' } }}
              >
                <Space size={8} wrap align="center">
                  <Tag color="cyan" style={{ borderRadius: 6, fontWeight: 600 }}>{node.operation.operationCode}</Tag>
                  <Text strong style={{ fontSize: 13 }}>{node.operation.operationName}</Text>
                  <Divider type="vertical" />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {node.operation.division?.name} · {node.operation.section?.name} · {node.operation.department?.name}
                  </Text>
                  <Divider type="vertical" />
                  <Tag color="green" style={{ borderRadius: 6 }}>
                    Ratio: {node.operation.inputQuantity} → {node.operation.outputQuantity} {node.operation.uom?.code || ''}
                  </Tag>
                  {node.operation.scrapPercentage > 0 && (
                    <Tag color="volcano" style={{ borderRadius: 6 }}>
                      Scrap: {node.operation.scrapPercentage}%
                    </Tag>
                  )}
                  {node.operation.additionalInputs && node.operation.additionalInputs.length > 0 && (
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      Additional Inputs: {node.operation.additionalInputs.map((a) => `${a.itemCode || a.itemName} (${num(a.quantity)})`).join(', ')}
                    </Text>
                  )}
                </Space>
              </Card>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default Traceability;