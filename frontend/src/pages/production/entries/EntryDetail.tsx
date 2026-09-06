import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, Spin, App, Typography, Divider, Popconfirm, Row, Col, Table, Alert, Skeleton,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, ArrowRightOutlined,
  AimOutlined, AppstoreFilled, DeleteFilled, TrophyFilled, ThunderboltFilled, ClockCircleFilled, FieldTimeOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { ITEM_TYPES } from '../../master-data/items/itemTypes';
import KpiPercentage from '../../../components/kpi/KpiPercentage';

const { Title, Text } = Typography;

interface DowntimeDetail {
  id: string;
  lineNumber: number;
  downtimeReasonId: string | null;
  downtimeReasonText?: string | null;
  downtimeReason?: { id: string; name: string } | null;
  downtimeHours: number | string;
  remarks: string | null;
}

interface ProductionItemDetail {
  id: string;
  lineNumber: number;
  itemId: string | null;
  item?: { itemCode: string; name: string; wireSizeMm?: number | null; weightPerMeter?: number | null } | null;
  uom?: { code: string; symbol: string } | null;
  targetQuantity: number | string;
  actualQuantity: number | string;
  scrapQuantity: number | string;
  runningHours: number | string;
  remarks: string | null;
}

interface StockBalance {
  id: string;
  item?: { id: string; name: string; itemCode: string };
  warehouse?: { id: string; name: string };
  onHand: number;
  reserved: number;
  available: number;
  uom?: { id: string; code: string; name: string };
}

interface LedgerMovement {
  id: string;
  transactionDate: string;
  transactionType: string;
  direction: string;
  quantity: number | string;
  notes?: string | null;
  item?: { itemCode: string; name: string } | null;
  warehouse?: { name: string } | null;
  uom?: { code: string } | null;
  referenceId?: string | null;
}

interface DetailData {
  id: string;
  entryDate: string;
  division?: { divisionCode: string; name: string };
  section?: { name: string };
  department?: { name: string; departmentCode: string };
  shiftId?: string;
  shift?: { id: string; name: string; startTime: string | null; endTime: string | null; plannedHours: number };
  machineNo: string;
  operatorName: string;
  supervisorName: string | null;
  coilSize: string | null;
  itemId: string;
  item?: {
    itemCode: string; name: string; wireSizeMm?: number | null; baseUom?: { code: string; symbol?: string } | null;
    /** TASK #34B: the exact input material consumed by the current item's production stage. */
    productionInItem?: { id: string; itemCode: string; name: string; wireSizeMm?: number | null; itemType?: string | null } | null;
  };
  uom?: { code: string; symbol: string };
  targetQuantity: number | string;
  actualQuantity: number | string;
  achievementPercentage: number | string;
  efficiencyPercentage: number | string;
  runningHours: number | string;
  downtimeHours: number | string;
  downtimeReasonText?: string | null;
  scrapQuantity: number | string;
  remarks: string | null;
  productionOrder?: { id: string; orderNumber: string } | null;
  productionOrderOperationId: string | null;
  inventoryReferenceId: string | null;
  createdByUser?: { fullName: string };
  downtime?: { plannedHours: number } | null;
  downtimes?: DowntimeDetail[];
  items?: ProductionItemDetail[];
  warehouseId?: string | null;
  rawMaterialWarehouseId?: string | null;
  route?: {
    routingCode?: string; name?: string;
    operations?: Array<{ sequenceNo: number; operationName?: string; department?: { name?: string } | null }>;
  } | null;
}

/** Short, reusable hierarchical section header (lettered one-screen view). */
const Section: React.FC<{ letter: string; title: string; children: React.ReactNode }> = ({ letter, title, children }) => (
  <Card
    size="small"
    style={{ marginTop: 12 }}
    title={
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            minWidth: 22, height: 22, borderRadius: 4,
            background: 'var(--theme-primary)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '0 6px',
          }}
        >
          {letter}
        </span>
        <span>{title}</span>
      </span>
    }
  >
    {children}
  </Card>
);

/** Compact KPI strip cell with watermark background icon */
const KpiCell: React.FC<{
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: 'warn' | 'ok';
  icon?: React.ReactNode;
}> = ({ label, value, sub, accent, icon }) => (
  <Col xs={12} sm={8} md={6} lg={3}>
    <div
      style={{
        background: accent === 'warn' ? 'var(--theme-warning-soft)' : 'var(--theme-surface-alt)',
        border: '1px solid var(--theme-border)',
        borderRadius: 6,
        padding: '8px 12px',
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {icon && (
        <div
          style={{
            position: 'absolute',
            right: 4,
            bottom: -6,
            fontSize: 48,
            opacity: 0.13,
            color: 'var(--theme-text)',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          {icon}
        </div>
      )}
      <Text type="secondary" style={{ fontSize: 11, display: 'block', textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {label}
      </Text>
      <div style={{ fontSize: 17, fontWeight: 700, lineHeight: '22px' }}>{value}</div>
      {sub ? <Text type="secondary" style={{ fontSize: 11 }}>{sub}</Text> : null}
    </div>
  </Col>
);

/** 2-Line Material Flow & Inventory Balance Impact Report (Before vs Movement vs After) */
const InventoryImpactReport: React.FC<{
  posted: boolean;
  rawItemCode?: string;
  rawItemName?: string;
  rawStoreName?: string;
  rawBefore: number;
  rawConsumed: number;
  rawAfter: number;
  rawUom: string;
  outItemCode?: string;
  outItemName?: string;
  outStoreName?: string;
  outBefore: number;
  outProduced: number;
  outAfter: number;
  outUom: string;
}> = ({
  posted,
  rawItemCode, rawItemName, rawStoreName, rawBefore, rawConsumed, rawAfter, rawUom,
  outItemCode, outItemName, outStoreName, outBefore, outProduced, outAfter, outUom,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
    {/* LINE 1: INPUT (RAW MATERIAL INFLOW & DEDUCTION) */}
    <div style={{
      background: 'rgba(239, 68, 68, 0.04)',
      border: '1px solid rgba(239, 68, 68, 0.28)',
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
            fontWeight: 700, fontSize: 11, borderRadius: 4, padding: '2px 8px', letterSpacing: 0.3,
          }}>
            📥 INPUT (RAW MATERIAL INFLOW)
          </span>
          <Text strong style={{ fontSize: 12 }}>{rawItemCode ?? 'Raw Material'}</Text>
          {rawItemName && <Text type="secondary" style={{ fontSize: 12 }}>— {rawItemName}</Text>}
        </div>
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted)', background: 'var(--theme-surface-alt)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--theme-border)' }}>
          Source: <strong style={{ color: 'var(--theme-text)' }}>{rawStoreName ?? '—'}</strong>
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto 1fr',
        gap: 6,
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Before */}
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569', fontWeight: 700, display: 'block' }}>
            {posted ? 'Opening Available' : 'Current Available'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formatNumber(rawBefore, 3)} {rawUom}</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#ef4444' }}>−</span>
        {/* Consumed */}
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#991b1b', fontWeight: 700, display: 'block' }}>
            Consumed (Out)
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#b91c1c' }}>−{formatNumber(rawConsumed, 3)} {rawUom}</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#64748b' }}>=</span>
        {/* After */}
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#166534', fontWeight: 700, display: 'block' }}>
            {posted ? 'Remaining Balance' : 'Projected Balance'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>{formatNumber(rawAfter, 3)} {rawUom}</span>
        </div>
      </div>
    </div>

    {/* LINE 2: OUTPUT (GOOD PRODUCTION OUTFLOW & ADDITION) */}
    <div style={{
      background: 'rgba(16, 185, 129, 0.04)',
      border: '1px solid rgba(16, 185, 129, 0.28)',
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            background: '#dcfce7', color: '#166534', border: '1px solid #86efac',
            fontWeight: 700, fontSize: 11, borderRadius: 4, padding: '2px 8px', letterSpacing: 0.3,
          }}>
            📤 OUTPUT (GOOD PRODUCTION OUTFLOW)
          </span>
          <Text strong style={{ fontSize: 12 }}>{outItemCode ?? 'Produced Item'}</Text>
          {outItemName && <Text type="secondary" style={{ fontSize: 12 }}>— {outItemName}</Text>}
        </div>
        <span style={{ fontSize: 11, color: 'var(--theme-text-muted)', background: 'var(--theme-surface-alt)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--theme-border)' }}>
          Receipt: <strong style={{ color: 'var(--theme-text)' }}>{outStoreName ?? '—'}</strong>
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto 1fr',
        gap: 6,
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Before */}
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#475569', fontWeight: 700, display: 'block' }}>
            {posted ? 'Opening Balance' : 'Current Balance'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{formatNumber(outBefore, 3)} {outUom}</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#10b981' }}>+</span>
        {/* Produced */}
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#166534', fontWeight: 700, display: 'block' }}>
            Produced (In)
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d' }}>+{formatNumber(outProduced, 3)} {outUom}</span>
        </div>
        <span style={{ fontSize: 18, fontWeight: 800, color: '#64748b' }}>=</span>
        {/* After */}
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '6px 8px' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#166534', fontWeight: 700, display: 'block' }}>
            {posted ? 'New Balance in Store' : 'Projected Balance'}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#15803d', textDecoration: 'underline' }}>{formatNumber(outAfter, 3)} {outUom}</span>
        </div>
      </div>
    </div>
  </div>
);

const EntryDetail: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balancesError, setBalancesError] = useState<string | null>(null);
  // TASK #39 Part C: the ENTRY's own output-item balances are loaded above; the
  // input material availability additionally queries the exact source store.
  const [inputBalances, setInputBalances] = useState<StockBalance[]>([]);
  const [inputLoading, setInputLoading] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  // TASK #41 Part E/H: this entry's REAL stock-ledger movements (referenceId =
  // entry id) — the basis of the on-screen inventory reconciliation.
  const [movements, setMovements] = useState<LedgerMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiService.get<{ success: boolean } & { data: DetailData }>(`/production/entries/${id}`);
        setEntry(res.data);
      } catch {
        message.error('Failed to load production entry');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, message]);

  // Real inventory balances from the existing inventory-balance architecture
  // (never fabricated): the same /inventory/balances endpoint + filter the
  // Inventory Reports screen uses, scoped to this entry's item.
  useEffect(() => {
    if (!entry?.itemId) return;
    let cancelled = false;
    setBalancesLoading(true);
    setBalancesError(null);
    void (async () => {
      try {
        const r = await apiService.get<{ data: StockBalance[] }>('/inventory/balances', { itemId: entry.itemId, limit: 100 });
        if (!cancelled) setBalances(r.data || []);
      } catch {
        if (!cancelled) setBalancesError('Stock balances are unavailable for this item (inventory.view permission required).');
      } finally {
        if (!cancelled) setBalancesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry?.itemId]);

  // TASK #39 Part C: raw-material availability at the EXACT source store.
  // The resource consumed by the current stage is the Item Master `productionInItemId`
  // and its balance must be read from the entry's `rawMaterialWarehouseId` store —
  // never fabricated and never guessed from the produced item's balance.
  const productionInItemId = entry?.item?.productionInItem?.id ?? null;
  useEffect(() => {
    if (!entry?.itemId || !productionInItemId) return;
    let cancelled = false;
    setInputLoading(true);
    setInputError(null);
    void (async () => {
      try {
        const r = await apiService.get<{ data: StockBalance[] }>('/inventory/balances', { itemId: productionInItemId, limit: 100 });
        if (!cancelled) setInputBalances(r.data || []);
      } catch {
        if (!cancelled) setInputError('Input material balances are unavailable (inventory.view permission required).');
      } finally {
        if (!cancelled) setInputLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry?.itemId, productionInItemId]);

  // TASK #41 Part E/H: every stock-ledger row this entry posted. The backend
  // stamps referenceType=PRODUCTION_ENTRY + referenceId=entry.id on each IN/OUT
  // (PRODUCTION_RECEIPT / PRODUCTION_SCRAP / PRODUCTION_CONSUMPTION).
  useEffect(() => {
    if (!entry?.id) return;
    let cancelled = false;
    setMovementsLoading(true);
    setMovementsError(null);
    void (async () => {
      try {
        const r = await apiService.get<{ data: LedgerMovement[] }>('/inventory/reports/ledger', { referenceId: entry.id, referenceType: 'PRODUCTION_ENTRY', limit: 200 });
        if (!cancelled) setMovements(r.data || []);
      } catch {
        if (!cancelled) setMovementsError('Stock ledger movements are unavailable (inventory.reports.view permission required).');
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [entry?.id]);

  if (loading) return <Card><Spin style={{ width: '100%', marginTop: 80 }} /></Card>;
  if (!entry) return <Card>Entry not found.</Card>;

  const ach = toNum(entry.achievementPercentage);
  const eff = toNum(entry.efficiencyPercentage);
  const planned = entry.downtime?.plannedHours ?? null;
  const totalDowntime = toNum(entry.downtimeHours);
  const running = toNum(entry.runningHours);
  const remaining = planned != null ? Math.max(0, planned - running - totalDowntime) : null;
  const wireSize = entry.item?.wireSizeMm != null ? `${formatDimension(entry.item.wireSizeMm)} mm` : '—';
  const productionInItem = entry.item?.productionInItem ?? null;
  const sourceStoreId = entry.rawMaterialWarehouseId ?? null;
  const sourceStoreRow = inputBalances.find((b) => b.warehouse?.id === sourceStoreId) ?? null;
  const sourceStoreAvail =
    sourceStoreRow != null ? toNum(sourceStoreRow.available) : null;

  // TASK #41 Part F: company-wide availability of the exact input material (sum
  // of every ACTIVE balance row) — the single check that caught the same item
  // stocked in ANOTHER store while the source store shows zero.
  const aggregateInputAvail = inputBalances.reduce((s, b) => s + toNum(b.available), 0);

  // ── TASK #41 Part E/H: real inventory reconciliation ─────────────────────
  const goodQty = toNum(entry.actualQuantity);
  const scrapQty = toNum(entry.scrapQuantity);
  const demandTotal = goodQty + scrapQty;
  const posted = !!entry.inventoryReferenceId;
  const outputReceiptTotal = movements
    .filter((m) => m.transactionType === 'PRODUCTION_RECEIPT' && m.direction === 'IN')
    .reduce((s, m) => s + toNum(m.quantity), 0);
  const scrapOutTotal = movements
    .filter((m) => m.transactionType === 'PRODUCTION_SCRAP' && m.direction === 'OUT')
    .reduce((s, m) => s + toNum(m.quantity), 0);
  const consumptionOutTotal = movements
    .filter((m) => m.transactionType === 'PRODUCTION_CONSUMPTION' && m.direction === 'OUT')
    .reduce((s, m) => s + toNum(m.quantity), 0);
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.001;
  const expectedConsumption = productionInItemId ? demandTotal : 0;
  const reconciliationOk =
    !posted ? movements.length === 0
      : near(outputReceiptTotal, goodQty) && near(scrapOutTotal, scrapQty) && near(consumptionOutTotal, expectedConsumption);
  const sourceShortage =
    posted && productionInItemId && sourceStoreId && sourceStoreAvail !== null && sourceStoreAvail + 0.001 < demandTotal;
  const aggregateShortage =
    posted && productionInItemId && aggregateInputAvail + 0.001 < demandTotal;
  const noBalancesAnywhere = inputBalances.length === 0;

  // ── Calculations for 2-Line Material Movement & Balance Impact Report ──
  const rawItem = productionInItem;
  const rawStoreName = sourceStoreRow?.warehouse?.name ?? (entry as any).rawMaterialWarehouse?.name ?? 'CCD Stores';
  const rawConsumed = demandTotal;
  const rawUom = rawItem?.wireSizeMm != null ? 'KG' : (entry.uom?.code ?? 'KG');
  const rawCurrentAvail = sourceStoreAvail ?? 0;
  const rawBefore = posted ? rawCurrentAvail + rawConsumed : rawCurrentAvail;
  const rawAfter = posted ? rawCurrentAvail : Math.max(0, rawCurrentAvail - rawConsumed);

  const outItem = entry.item;
  const receiptStoreName = (entry as any).warehouse?.name ?? (movements.find(m => m.transactionType === 'PRODUCTION_RECEIPT')?.warehouse?.name) ?? balances[0]?.warehouse?.name ?? 'FT Production Department';
  const outProduced = goodQty;
  const outUom = entry.uom?.code ?? 'KG';
  const outCurrentAvail = balances.find(b => b.warehouse?.name === receiptStoreName)?.available ?? balances[0]?.available ?? 0;
  const outAfter = posted ? outCurrentAvail : outCurrentAvail + outProduced;
  const outBefore = posted ? Math.max(0, outCurrentAvail - outProduced) : outCurrentAvail;

  const sectionCtx = (
    <Descriptions column={3} size="small" bordered>
      <Descriptions.Item label="Entry ID"><Text type="secondary" style={{ fontSize: 12 }}>{entry.id}</Text></Descriptions.Item>
      <Descriptions.Item label="Division">{entry.division?.divisionCode} — {entry.division?.name}</Descriptions.Item>
      <Descriptions.Item label="Section">{entry.section?.name}</Descriptions.Item>
      <Descriptions.Item label="Department">{entry.department?.departmentCode} — {entry.department?.name}</Descriptions.Item>
      <Descriptions.Item label="Date">{dayjs(entry.entryDate).format('DD-MMM-YYYY')}</Descriptions.Item>
      <Descriptions.Item label="Shift">
        {entry.shift ? `${entry.shift.name} (${entry.shift.startTime ?? ''}–${entry.shift.endTime ?? ''})` : '—'}
      </Descriptions.Item>
      <Descriptions.Item label="Machine No."><Text strong>{entry.machineNo}</Text></Descriptions.Item>
      <Descriptions.Item label="Operator">{entry.operatorName}</Descriptions.Item>
      <Descriptions.Item label="Supervisor">{entry.supervisorName ?? '—'}</Descriptions.Item>
    </Descriptions>
  );

  const sectionSummary = (
    <Descriptions column={3} size="small" bordered>
      <Descriptions.Item label="Item" span={2}>
        <Text strong>{entry.item?.itemCode}</Text> — {entry.item?.name}
      </Descriptions.Item>
      <Descriptions.Item label="Wire Size"><Text strong>{wireSize}</Text></Descriptions.Item>
      {/* TASK #39: explicit "Not configured" state instead of a bare dash. */}
      <Descriptions.Item label="Input Material" span={2}>
        {productionInItem ? (
          <span style={{ color: 'var(--theme-primary)' }}>
            <Text strong>{productionInItem.itemCode}</Text> — {productionInItem.name}
          </span>
        ) : (
          <Text type="secondary">Input Material: Not configured</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Target Production">{formatNumber(entry.targetQuantity, 3)}</Descriptions.Item>
      <Descriptions.Item label="UOM">{entry.uom?.code}{entry.uom?.symbol ? ` (${entry.uom.symbol})` : ''}</Descriptions.Item>
      <Descriptions.Item label="Base UOM">{entry.item?.baseUom?.code ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Actual Good Production"><Text strong>{formatNumber(entry.actualQuantity, 3)}</Text></Descriptions.Item>
      <Descriptions.Item label="Rejection / Scrap">{formatNumber(entry.scrapQuantity, 3)}</Descriptions.Item>
      <Descriptions.Item label="Running Hours">{formatNumber(running, 2)}h</Descriptions.Item>
      <Descriptions.Item
        label="Downtime Hours"
        contentStyle={totalDowntime > 0 ? { background: 'var(--theme-warning-soft)' } : undefined}
      >
        {formatNumber(totalDowntime, 2)}h
      </Descriptions.Item>
      <Descriptions.Item label="Achievement %"><KpiPercentage value={ach} /></Descriptions.Item>
      <Descriptions.Item label="Efficiency %"><KpiPercentage value={eff} /></Descriptions.Item>
      <Descriptions.Item label="Coil Size">{entry.coilSize ?? '—'}</Descriptions.Item>
    </Descriptions>
  );

  const inputTypeLabel =
    productionInItem?.itemType && ITEM_TYPES.find((t) => t.value === productionInItem.itemType)?.label
      ? ITEM_TYPES.find((t) => t.value === productionInItem.itemType)!.label
      : productionInItem?.itemType ?? '';

  const sectionInputMaterial = (
    <div>
      {!productionInItem ? (
        <Text type="secondary">Input Material: Not configured.</Text>
      ) : (
        <div>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label="Input Item" span={2}>
              <Text strong>{productionInItem.itemCode}</Text> — {productionInItem.name}
            </Descriptions.Item>
            <Descriptions.Item label="Type">{inputTypeLabel || '—'}</Descriptions.Item>
            <Descriptions.Item label="Wire Size">
              {productionInItem.wireSizeMm != null ? `${formatDimension(productionInItem.wireSizeMm)} mm` : '—'}
            </Descriptions.Item>
            <Descriptions.Item
              label={sourceStoreId ? 'Available at Source Store' : 'Available'}
              contentStyle={sourceStoreAvail === 0 ? { background: 'var(--theme-warning-soft)' } : undefined}
            >
              {inputLoading ? <Skeleton active paragraph={{ rows: 1 }} /> : inputError ? (
                <Alert type="warning" showIcon message={inputError} />
              ) : sourceStoreAvail != null ? (
                <Text strong style={{ color: sourceStoreAvail > 0 ? 'var(--theme-success)' : undefined }}>
                  {formatNumber(sourceStoreAvail, 3)}
                </Text>
              ) : (
                <Text type="secondary">No balance row</Text>
              )}
            </Descriptions.Item>
          </Descriptions>
          {sourceStoreId && sourceStoreRow?.warehouse?.name ? (
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Source store: <Text strong>{sourceStoreRow.warehouse.name}</Text> · on-hand{' '}
                {formatNumber(toNum(sourceStoreRow.onHand), 3)} · reserved {formatNumber(toNum(sourceStoreRow.reserved), 3)}
              </Text>
            </div>
          ) : null}
          {!inputLoading && !inputError && (
            <div style={{ marginTop: 6 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Aggregate available (all ACTIVE stores):{' '}
                <Text strong style={{ color: noBalancesAnywhere ? undefined : (aggregateInputAvail > 0 ? 'var(--theme-success)' : undefined) }}>
                  {noBalancesAnywhere ? 'no balance rows' : formatNumber(aggregateInputAvail, 3)}
                </Text>
                <Text type="secondary"> · Demand this stage: <Text strong>{formatNumber(demandTotal, 3)}</Text> {entry.uom?.code ?? ''}</Text>
              </Text>
              {aggregateShortage && (
                <Alert type="error" showIcon style={{ marginTop: 6 }} data-testid="aggregate-shortage-alert"
                  message={`Company-wide availability (${formatNumber(aggregateInputAvail, 3)}) is below this stage's consumption demand (${formatNumber(demandTotal, 3)}).`}
                />
              )}
              {!aggregateShortage && sourceShortage && (
                <Alert type="warning" showIcon style={{ marginTop: 6 }} data-testid="source-shortage-alert"
                  message={`Source store availability (${formatNumber(sourceStoreAvail!, 3)}) is below this stage's consumption demand (${formatNumber(demandTotal, 3)}), but ${formatNumber(aggregateInputAvail, 3)} is available across other stores.`}
                />
              )}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              The consumption basis for this stage is Good output + Scrap, deducted 1:1 from this store by the backend.
            </Text>
          </div>
        </div>
      )}
    </div>
  );

  // Material flow (Part A redesign): the raw material consumed in this stage →
  // the current produced item (→ any extra output lines).
  const flowUnits = entry.uom?.code ?? '';
  const sectionMaterialFlow = (
    <div>
      <InventoryImpactReport
        posted={posted}
        rawItemCode={rawItem?.itemCode}
        rawItemName={rawItem?.name}
        rawStoreName={rawStoreName}
        rawBefore={rawBefore}
        rawConsumed={rawConsumed}
        rawAfter={rawAfter}
        rawUom={rawUom}
        outItemCode={outItem?.itemCode}
        outItemName={outItem?.name}
        outStoreName={receiptStoreName}
        outBefore={outBefore}
        outProduced={outProduced}
        outAfter={outAfter}
        outUom={outUom}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {productionInItem && (
          <React.Fragment>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', background: 'var(--theme-surface-alt)', borderRadius: 4,
                border: '1px solid var(--theme-border)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 4, background: 'var(--theme-text-muted)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 4px' }}>
                IN
              </span>
              <Text strong style={{ fontSize: 12 }}>{productionInItem.itemCode}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>— {productionInItem.name}</Text>
              {productionInItem.wireSizeMm != null && (
                <Text type="secondary" style={{ fontSize: 12 }}>· {formatDimension(productionInItem.wireSizeMm)} mm</Text>
              )}
            </div>
            <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 14, lineHeight: '16px' }}>
              ▾ consumed {formatNumber(toNum(entry.actualQuantity) + toNum(entry.scrapQuantity), 3)} {flowUnits} (good + scrap)
            </div>
          </React.Fragment>
        )}
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 8px', background: 'var(--theme-success-soft)', borderRadius: 4,
            border: '1px solid var(--theme-success)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 20, borderRadius: 4, background: 'var(--theme-success)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 4px' }}>
            OUT
          </span>
          <Text strong style={{ fontSize: 12 }}>{entry.item?.itemCode}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>— {entry.item?.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>· {wireSize}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            → {formatNumber(toNum(entry.actualQuantity), 3)} {flowUnits}{toNum(entry.scrapQuantity) > 0 ? ` + scrap ${formatNumber(toNum(entry.scrapQuantity), 3)}` : ''}
          </Text>
        </div>
        {(entry.items ?? []).filter((l) => l.item && l.itemId !== entry.itemId).map((line) => (
          <React.Fragment key={line.id}>
            <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 14, lineHeight: '16px' }}>
              <ArrowRightOutlined /> secondary output
            </div>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px', background: 'var(--theme-surface-alt)', borderRadius: 4,
                border: '1px solid var(--theme-border)',
              }}
            >
              <Text strong style={{ fontSize: 12 }}>{line.item?.itemCode}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>— {line.item?.name}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                → {formatNumber(toNum(line.actualQuantity), 3)} {line.uom?.code ?? ''}
              </Text>
            </div>
          </React.Fragment>
        ))}
      </div>
      {entry.uom?.code && entry.item?.baseUom?.code && entry.uom.code !== entry.item.baseUom.code && (
        <div style={{ marginTop: 6 }}>
          <Tag color="blue">UOM conversion: entry UOM {entry.uom.code} → base {entry.item.baseUom.code}</Tag>
        </div>
      )}
    </div>
  );

  const sectionDowntime = (
    <DowntimeView
      downtimeHours={entry.downtimeHours}
      runningHours={entry.runningHours}
      plannedHours={planned}
      remainingHours={remaining}
      lines={entry.downtimes ?? []}
    />
  );

  const sectionRoute = entry.route && entry.route.operations && entry.route.operations.length > 0 ? (
    <div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
        {entry.route.routingCode}{entry.route.name ? ` — ${entry.route.name}` : ''} · {entry.route.operations.length} operation(s)
      </Text>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {entry.route.operations.slice().sort((a, b) => a.sequenceNo - b.sequenceNo).map((op, idx, arr) => (
          <React.Fragment key={idx}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px',
                background: 'var(--theme-surface-alt)',
                borderRadius: 4,
                border: '1px solid var(--theme-border)',
              }}
            >
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, borderRadius: '50%',
                background: 'var(--theme-primary)', color: '#fff',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>
                {idx + 1}
              </span>
              <Text strong style={{ fontSize: 12 }}>{op.operationName ?? 'Operation'}</Text>
              {op.department?.name && (
                <Text type="secondary" style={{ fontSize: 11 }}>({op.department.name})</Text>
              )}
            </div>
            {idx < arr.length - 1 && (
              <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 14, lineHeight: '16px' }}>
                ↓
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  ) : (
    <Text type="secondary">No production route configured for this item.</Text>
  );

  const sectionStock = (
    <div>
      <div style={{ marginBottom: 12 }}>
        {entry.inventoryReferenceId ? (
          <Tag color="green">Posted to stock (ref {entry.inventoryReferenceId.slice(0, 8)}…)</Tag>
        ) : (
          <Tag>Not posted to stock</Tag>
        )}
      </div>
      <InventoryImpactReport
        posted={posted}
        rawItemCode={rawItem?.itemCode}
        rawItemName={rawItem?.name}
        rawStoreName={rawStoreName}
        rawBefore={rawBefore}
        rawConsumed={rawConsumed}
        rawAfter={rawAfter}
        rawUom={rawUom}
        outItemCode={outItem?.itemCode}
        outItemName={outItem?.name}
        outStoreName={receiptStoreName}
        outBefore={outBefore}
        outProduced={outProduced}
        outAfter={outAfter}
        outUom={outUom}
      />
      {balancesLoading ? (
        <Skeleton active paragraph={{ rows: 1 }} />
      ) : balancesError ? (
        <Alert type="warning" showIcon message={balancesError} />
      ) : balances.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          No stock balances recorded for {entry.item?.itemCode ?? 'this item'} across any warehouse.
        </Text>
      ) : (
        <Table
          key={balances.map((b) => b.id).join('|')}
          rowKey="id" size="small" pagination={false}
          dataSource={balances}
          columns={[
            { title: 'Warehouse', key: 'warehouse', render: (_, r) => r.warehouse?.name ?? '—' },
            { title: 'On Hand', dataIndex: 'onHand', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'Reserved', dataIndex: 'reserved', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'Available', dataIndex: 'available', align: 'right' as const, render: (v) => formatNumber(v, 3) },
            { title: 'UOM', key: 'uom', render: (_, r) => r.uom?.code ?? '—' },
          ]}
        />
      )}
    </div>
  );

  const typeLabel = (t: string) =>
    t === 'PRODUCTION_RECEIPT' ? 'Production Receipt' :
    t === 'PRODUCTION_CONSUMPTION' ? 'Production Consumption' :
    t === 'PRODUCTION_SCRAP' ? 'Production Scrap' : t;

  const sectionMovements = (
    <div data-testid="movements-section">
      <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {entry.inventoryReferenceId ? (
          <Tag color="green">Ledger movements available</Tag>
        ) : (
          <Tag>No ledger movements expected</Tag>
        )}
        {movementsLoading ? (
          <Tag color="processing">Loading movements…</Tag>
        ) : movementsError ? null : (
          <Tag data-testid="reconciliation-status" color={reconciliationOk ? 'green' : 'red'}>
            {!posted ? 'No movements expected' : reconciliationOk ? 'Inventory Reconciled' : 'Reconciliation Mismatch'}
          </Tag>
        )}
      </div>

      {movementsError ? (
        <Alert type="warning" showIcon message={movementsError} />
      ) : movementsLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} />
      ) : !posted ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          This entry was not posted to inventory, so no stock movements are expected.
        </Text>
      ) : movements.length === 0 ? (
        <Alert type="warning" showIcon message="This entry reports posted-to-stock but no stock ledger movements were found for it." />
      ) : (
        <div>
          <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="Production Output (Receipt IN)">
              <Text strong>{formatNumber(goodQty, 3)}</Text>
              <Text type="secondary"> recorded · </Text>
              <Text strong>{formatNumber(outputReceiptTotal, 3)}</Text>
              <Text type="secondary"> in ledger</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Scrap (OUT)">
              <Text strong>{formatNumber(scrapQty, 3)}</Text>
              <Text type="secondary"> recorded · </Text>
              <Text strong>{formatNumber(scrapOutTotal, 3)}</Text>
              <Text type="secondary"> in ledger</Text>
            </Descriptions.Item>
            {productionInItemId && (
              <Descriptions.Item label="Raw Material Consumption (OUT)">
                <Text strong>{formatNumber(demandTotal, 3)}</Text>
                <Text type="secondary"> demanded · </Text>
                <Text strong>{formatNumber(consumptionOutTotal, 3)}</Text>
                <Text type="secondary"> in ledger</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          <Table
            rowKey="id" size="small" pagination={false}
            dataSource={movements}
            columns={[
              { title: 'Date', key: 'date', width: 120, render: (_, m) => m.transactionDate ? dayjs(m.transactionDate).format('DD-MMM HH:mm') : '—' },
              { title: 'Type', dataIndex: 'transactionType', render: (t) => typeLabel(t) },
              {
                title: 'Dir', dataIndex: 'direction', width: 70,
                render: (d) => d === 'IN' ? <Tag color="green">IN</Tag> : <Tag color="red">OUT</Tag>,
              },
              { title: 'Item', key: 'item', render: (_, m) => m.item ? `${m.item.itemCode} — ${m.item.name}` : '—' },
              { title: 'Warehouse', key: 'wh', render: (_, m) => m.warehouse?.name ?? '—' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' as const, width: 100, render: (v) => formatNumber(v, 3) },
              { title: 'Notes', key: 'notes', render: (_, m) => m.notes ?? '—' },
            ]}
          />
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* ── Global header: identity + machine/department + date + actions ── */}
      <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} align="start">
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
          <Title level={4} style={{ margin: 0 }}>
            Production Entry — {dayjs(entry.entryDate).format('DD-MMM-YYYY')}
          </Title>
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {entry.department?.name} · {entry.machineNo} · {dayjs(entry.entryDate).format('YYYY-MM-DD')}
          </Text>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/production/entries/${id}/edit`)}>
            Edit
          </Button>
          <PopconfirmDelete onDeleted={() => navigate('/production/entries')} id={id!} />
        </Space>
      </Space>

      {/* ── Compact KPI strip ── */}
      <Row gutter={[8, 8]} style={{ marginBottom: 4 }}>
        <KpiCell label="Target" value={formatNumber(entry.targetQuantity, 3)} sub={entry.uom?.code} icon={<AimOutlined />} />
        <KpiCell label="Actual Good" value={formatNumber(entry.actualQuantity, 3)} sub={entry.uom?.code} icon={<AppstoreFilled />} />
        <KpiCell label="Scrap" value={formatNumber(entry.scrapQuantity, 3)} sub={entry.uom?.code} accent={toNum(entry.scrapQuantity) > 0 ? 'warn' : undefined} icon={<DeleteFilled />} />
        <KpiCell label="Achievement" value={<KpiPercentage value={ach} fontSize={16} fontWeight={700} />} sub="% of target" icon={<TrophyFilled />} />
        <KpiCell label="Efficiency" value={<KpiPercentage value={eff} fontSize={16} fontWeight={700} />} sub="% of shift" icon={<ThunderboltFilled />} />
        <KpiCell label="Running" value={`${formatNumber(running, 2)}h`} sub={planned != null ? `of ${formatNumber(planned, 2)}h` : undefined} icon={<ClockCircleFilled />} />
        <KpiCell label="Downtime" value={`${formatNumber(totalDowntime, 2)}h`} sub={remaining != null ? `remaining ${formatNumber(remaining, 2)}h` : undefined} accent={totalDowntime > 0 ? 'warn' : undefined} icon={<FieldTimeOutlined />} />
      </Row>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Section letter="A" title="Production Context">{sectionCtx}</Section>

          <Section letter="B" title="Production Summary">{sectionSummary}</Section>

          <Section letter="C" title="Input Material & Raw Material Availability">{sectionInputMaterial}</Section>

          <Section letter="D" title="Material Flow">{sectionMaterialFlow}</Section>

          {entry.items && entry.items.length > 0 && (
            <Section letter="E" title="Production Output Lines">
              <Table rowKey="id" size="small" pagination={false}
                dataSource={entry.items}
                columns={[
                  { title: '#', dataIndex: 'lineNumber', width: 40 },
                  {
                    title: 'Item', key: 'item',
                    render: (_, r) => r.item ? <Text strong>{r.item.itemCode} — {r.item.name}</Text> : '—',
                  },
                  {
                    title: 'Wire Size', key: 'wire', width: 110,
                    render: (_, r) => r.item?.wireSizeMm != null ? `${formatDimension(r.item.wireSizeMm)} mm` : '—',
                  },
                  { title: 'Actual', dataIndex: 'actualQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'Scrap', dataIndex: 'scrapQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                  { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '—' },
                  { title: 'KG', key: 'kg', width: 90, align: 'right', render: (_, r) => r.item?.weightPerMeter != null ? formatNumber(toNum(r.actualQuantity) * toNum(r.item.weightPerMeter), 3) : '—' },
                ]}
              />
            </Section>
          )}

          <Section letter="F" title="Downtime Breakdown">{sectionDowntime}</Section>

          <Section letter="G" title="Production Route">{sectionRoute}</Section>

          <Section letter="H" title="Linkages">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Production Order">
                {entry.productionOrder ? (
                  <Button type="link" size="small" onClick={() => navigate(`/production/orders/${entry.productionOrder!.id}`)}>
                    {entry.productionOrder.orderNumber}
                  </Button>
                ) : (
                  '—'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Operation ID">{entry.productionOrderOperationId?.slice(0, 8) || '—'}</Descriptions.Item>
            </Descriptions>
          </Section>

          <Section letter="I" title="Remarks & Entry Metadata">
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="Remarks" span={2}>{entry.remarks ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Created By">{entry.createdByUser?.fullName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Entry ID"><Text type="secondary" style={{ fontSize: 12 }}>{entry.id}</Text></Descriptions.Item>
            </Descriptions>
          </Section>

          <Section letter="K" title="Inventory Movements & Reconciliation">
            {sectionMovements}
          </Section>
        </Col>

        <Col xs={24} lg={8}>
          <Card size="small" style={{ marginTop: 12 }}>
            <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
              <Text type="secondary">Achievement vs Target</Text>
              <div>
                <KpiPercentage value={ach} fontSize={40} fontWeight={700} />
              </div>
              <Divider />
              <Text type="secondary">Efficiency</Text>
              <div>
                <KpiPercentage value={eff} fontSize={28} fontWeight={600} />
              </div>
              <div style={{ marginTop: 4 }}>
                <Text type="secondary">
                  {formatNumber(entry.actualQuantity, 3)} of {formatNumber(entry.targetQuantity, 3)} {entry.uom?.code} produced
                </Text>
              </div>
            </div>
          </Card>

          <Section letter="J" title="Inventory Posting Summary">{sectionStock}</Section>

          <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
            <Button type="primary" icon={<EditOutlined />} block onClick={() => navigate(`/production/entries/${id}/edit`)}>
              Edit Entry
            </Button>
            <PopconfirmDelete onDeleted={() => navigate('/production/entries')} id={id!} />
          </Space>
        </Col>
      </Row>
    </div>
  );
};

const PopconfirmDelete: React.FC<{ id: string; onDeleted: () => void }> = ({ id, onDeleted }) => {
  const { message } = App.useApp();
  return (
    <Popconfirm
      title="Delete this production entry?"
      onConfirm={async () => {
        try {
          await apiService.delete(`/production/entries/${id}`);
          message.success('Entry deleted');
          onDeleted();
        } catch { message.error('Failed to delete entry'); }
      }}
    >
      <Button danger icon={<DeleteOutlined />} block>Delete Entry</Button>
    </Popconfirm>
  );
};

/** Downtime breakdown: planned / running / total / remaining summary + every line. */
const DowntimeView: React.FC<{
  downtimeHours: number | string;
  runningHours: number | string;
  plannedHours: number | null;
  remainingHours: number | null;
  lines: DowntimeDetail[];
}> = ({ downtimeHours, runningHours, plannedHours, remainingHours, lines }) => {
  const total = toNum(downtimeHours);
  const running = toNum(runningHours);
  const summary = [
    { label: 'Planned', value: plannedHours != null ? `${formatNumber(plannedHours, 2)}h` : '—' },
    { label: 'Running', value: `${formatNumber(running, 2)}h` },
    { label: 'Total Downtime', value: `${formatNumber(total, 2)}h`, accent: total > 0 },
    { label: 'Remaining', value: remainingHours != null ? `${formatNumber(remainingHours, 2)}h` : '—', strong: true },
  ];
  return (
    <div>
      <Row gutter={[8, 8]}>
        {summary.map((s) => (
          <Col xs={12} md={6} key={s.label}>
            <div style={{
              background: s.accent ? 'var(--theme-warning-soft)' : 'var(--theme-surface-alt)',
              borderRadius: 6, padding: '4px 8px',
            }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
              <div><Text strong={s.strong}>{s.value}</Text></div>
            </div>
          </Col>
        ))}
      </Row>
      <Divider style={{ margin: '12px 0' }} />
      {lines.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>No downtime entries were recorded for this production entry.</Text>
      ) : (
        <Table
          rowKey={(l) => l.id || `${l.lineNumber}`}
          size="small" pagination={false}
          dataSource={lines}
          columns={[
            { title: '#', key: 'idx', width: 40, render: (_: unknown, _r: DowntimeDetail, idx: number) => idx + 1 },
            { title: 'Reason', key: 'reason', render: (_: unknown, l: DowntimeDetail) => <Text strong style={{ fontSize: 12 }}>{l.downtimeReason?.name ?? l.downtimeReasonText ?? 'Downtime'}</Text> },
            { title: 'Hours', key: 'hours', width: 90, align: 'right', render: (_: unknown, l: DowntimeDetail) => `${formatNumber(l.downtimeHours, 2)}h` },
            {
              title: 'Other / Custom Text', key: 'other', render: (_: unknown, l: DowntimeDetail) => {
                const showOther = l.downtimeReasonText && (!l.downtimeReason?.name || (l.downtimeReasonText.toLowerCase() === 'other' ? true : l.downtimeReasonText !== l.downtimeReason?.name));
                return showOther ? <Text style={{ fontSize: 12 }}>{l.downtimeReasonText}</Text> : '—';
              },
            },
            { title: 'Notes', key: 'notes', render: (_: unknown, l: DowntimeDetail) => l.remarks ? <Text style={{ fontSize: 12 }}>{l.remarks}</Text> : '—' },
          ]}
        />
      )}
    </div>
  );
};

export default EntryDetail;