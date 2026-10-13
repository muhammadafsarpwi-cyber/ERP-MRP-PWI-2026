import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Descriptions, Tag, Button, Space, App, Typography, Divider, Popconfirm, Row, Col, Table, Alert, Skeleton,
} from 'antd';
import {
  ArrowLeftOutlined, EditOutlined, DeleteOutlined, ArrowRightOutlined,
  AimOutlined, AppstoreFilled, DeleteFilled, TrophyFilled, ThunderboltFilled, ClockCircleFilled, FieldTimeOutlined,
  ExclamationCircleOutlined, ArrowDownOutlined, ArrowUpOutlined, BarcodeOutlined, PrinterOutlined, FileTextOutlined,
  LeftOutlined, RightOutlined, CheckCircleFilled,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { calcActualKg, perUnitWeightLabel } from '../../../utils/productionWeight';
import { ITEM_TYPES } from '../../master-data/items/itemTypes';
import KpiPercentage from '../../../components/kpi/KpiPercentage';
import { GlobalLoading, DeleteConfirmModal } from '../../../components/shared';
import PageHeader from '../../../components/shared/PageHeader';
import { ProductionUnitsPage } from '../units';
import { convertProductToComponentQty } from './downtimeHours';
import { entryOvertimeHours } from './overtimeHours';
import { splitEntryItemLines } from './entryLines';
import ProductionEntryEditModal from './ProductionEntryEditModal';

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
  item?: { itemCode: string; name: string; wireSizeMm?: number | null; weightPerPiece?: number | null; weightPerMeter?: number | null } | null;
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
  itemId?: string | null;
  item?: { id?: string; itemCode: string; name: string } | null;
  warehouseId?: string | null;
  warehouse?: { id?: string; name: string } | null;
  uom?: { code: string } | null;
  referenceId?: string | null;
}

interface DetailData {
  id: string;
  entryNumber?: string | null;
  entryDate: string;
  division?: { divisionCode: string; name: string };
  section?: { name: string };
  department?: { name: string; departmentCode: string };
  shiftId?: string;
  shift?: { id: string; name: string; startTime: string | null; endTime: string | null; plannedHours: number };
  machineNo: string;
  machine?: { id: string; name: string; machineCode: string } | null;
  operatorName: string;
  supervisorName: string | null;
  coilSize: string | null;
  itemId: string;
  item?: {
    itemCode: string; name: string; wireSizeMm?: number | null; baseUom?: { code: string; symbol?: string } | null;
    weightPerPiece?: number | null; weightPerMeter?: number | null;
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
  /** Process Cutting Scrap (KG) — report-only audit metric, never stock-deducting. */
  processScrapKg?: number | string | null;
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
  outCompanyBefore?: number;
  outCompanyTotal?: number;
}> = ({
  posted,
  rawItemCode, rawItemName, rawStoreName, rawBefore, rawConsumed, rawAfter, rawUom,
  outItemCode, outItemName, outStoreName, outBefore, outProduced, outAfter, outUom,
  outCompanyBefore, outCompanyTotal,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
    {/* LINE 1: INPUT (RAW MATERIAL INFLOW & DEDUCTION) */}
    <div style={{
      background: 'var(--theme-card-bg, rgba(15, 23, 42, 0.6))',
      border: '1px solid rgba(239, 68, 68, 0.3)',
      borderRadius: 8,
      padding: '12px 14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            background: 'var(--theme-danger-soft, rgba(239, 68, 68, 0.15))',
            color: '#ef4444',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            fontWeight: 700, fontSize: 11, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.3,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <ArrowDownOutlined style={{ fontSize: 11 }} /> INPUT (RAW MATERIAL)
          </span>
          <Text strong style={{ fontSize: 13, color: 'var(--theme-text, #f8fafc)' }}>
            {rawItemCode ? `${rawItemCode} — ` : ''}{rawItemName ?? 'Raw Material'}
          </Text>
        </div>
        <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.05))', padding: '3px 10px', borderRadius: 4, border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))' }}>
          Source: <strong style={{ color: 'var(--theme-text, #f8fafc)' }}>{rawStoreName ?? '—'}</strong>
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto 1fr',
        gap: 8,
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Before */}
        <div style={{
          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            {posted ? 'Opening Available' : 'Current Available'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--theme-text, #f8fafc)', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(rawBefore, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{rawUom}</span>
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#ef4444' }}>−</span>
        {/* Consumed */}
        <div style={{
          background: 'var(--theme-danger-soft, rgba(239, 68, 68, 0.12))',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#f87171', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            Consumed (Out)
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>
            −{formatNumber(rawConsumed, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{rawUom}</span>
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--theme-text-muted, #94a3b8)' }}>=</span>
        {/* After */}
        <div style={{
          background: 'var(--theme-success-soft, rgba(16, 185, 129, 0.12))',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#34d399', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            {posted ? 'Remaining Balance' : 'Projected Balance'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(rawAfter, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{rawUom}</span>
          </span>
        </div>
      </div>
    </div>

    {/* LINE 2: OUTPUT (GOOD PRODUCTION OUTFLOW & ADDITION) */}
    <div style={{
      background: 'var(--theme-card-bg, rgba(15, 23, 42, 0.6))',
      border: '1px solid rgba(16, 185, 129, 0.3)',
      borderRadius: 8,
      padding: '12px 14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            background: 'var(--theme-success-soft, rgba(16, 185, 129, 0.15))',
            color: '#10b981',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            fontWeight: 700, fontSize: 11, borderRadius: 4, padding: '3px 8px', letterSpacing: 0.3,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <ArrowUpOutlined style={{ fontSize: 11 }} /> OUTPUT (GOOD PRODUCTION)
          </span>
          <Text strong style={{ fontSize: 13, color: 'var(--theme-text, #f8fafc)' }}>
            {outItemCode ? `${outItemCode} — ` : ''}{outItemName ?? 'Produced Item'}
          </Text>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.05))', padding: '3px 10px', borderRadius: 4, border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))' }}>
            Receipt: <strong style={{ color: 'var(--theme-text, #f8fafc)' }}>{outStoreName ?? '—'}</strong>
          </span>
          {outCompanyBefore != null && outCompanyBefore > outBefore && (
            <span style={{ fontSize: 11, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(56, 189, 248, 0.35)', fontWeight: 600 }}>
              Company Prior: {formatNumber(outCompanyBefore, 3)} {outUom}
            </span>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto 1fr',
        gap: 8,
        alignItems: 'center',
        textAlign: 'center',
      }}>
        {/* Before */}
        <div style={{
          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            {posted ? 'Opening Balance' : 'Current Balance'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--theme-text, #f8fafc)', fontVariantNumeric: 'tabular-nums' }}>
            {formatNumber(outBefore, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{outUom}</span>
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: '#10b981' }}>+</span>
        {/* Produced */}
        <div style={{
          background: 'var(--theme-success-soft, rgba(16, 185, 129, 0.12))',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#34d399', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            Produced (In)
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums' }}>
            +{formatNumber(outProduced, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{outUom}</span>
          </span>
        </div>
        <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--theme-text-muted, #94a3b8)' }}>=</span>
        {/* After */}
        <div style={{
          background: 'var(--theme-success-soft, rgba(16, 185, 129, 0.18))',
          border: '1px solid rgba(16, 185, 129, 0.45)',
          borderRadius: 8,
          padding: '8px 10px',
        }}>
          <span style={{ fontSize: 11, textTransform: 'uppercase', color: '#34d399', fontWeight: 700, display: 'block', marginBottom: 2 }}>
            {posted ? 'New Balance in Store' : 'Projected Balance'}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#10b981', fontVariantNumeric: 'tabular-nums', textDecoration: 'underline' }}>
            {formatNumber(outAfter, 3)} <span style={{ fontSize: 12, fontWeight: 600 }}>{outUom}</span>
          </span>
        </div>
      </div>
      {outCompanyBefore != null && outCompanyBefore > outBefore && (
        <div style={{ marginTop: 8, padding: '6px 12px', background: 'rgba(2, 132, 199, 0.12)', borderRadius: 6, fontSize: 11.5, color: '#38bdf8', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6, border: '1px solid rgba(56, 189, 248, 0.3)' }}>
          <span>
            ℹ️ <strong>Store Notice:</strong> Store <em>{outStoreName}</em> had 0 {outUom} prior opening balance.
          </span>
          <span>
            <strong>{formatNumber(outCompanyBefore, 3)} {outUom}</strong> is available in other active warehouse(s) (Total Company Stock: <strong>{formatNumber(outCompanyTotal ?? (outCompanyBefore + outProduced), 3)} {outUom}</strong>).
          </span>
        </div>
      )}
    </div>
  </div>
);

type DetailStepKey = 'items' | 'downtime' | 'material' | 'ledger' | 'route' | 'coils' | 'audit';

export interface EntryDetailProps {
  id?: string;
  isModal?: boolean;
  onClose?: () => void;
  onEdit?: (entryId: string) => void;
  onDeleted?: () => void;
}

export const EntryDetail: React.FC<EntryDetailProps> = ({
  id: propId,
  isModal = false,
  onClose,
  onEdit: onEditProp,
  onDeleted: onDeletedProp,
}) => {
  const { message } = App.useApp();
  const { id: paramId } = useParams<{ id: string }>();
  const id = propId || paramId;
  const navigate = useNavigate();
  const [entry, setEntry] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeStep, setActiveStep] = useState<DetailStepKey>('items');
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
  }, [id, message, reloadKey]);

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

  if (loading) return <Card><GlobalLoading title="Loading Production Entry..." subtitle="Retrieving entry details, downtime and item lines..." badgeText="LIVE DATABASE QUERY" style={{ padding: 24 }} /></Card>;
  if (!entry) return <Card>Entry not found.</Card>;

  const ach = toNum(entry.achievementPercentage);
  const totalDowntime = toNum(entry.downtimeHours);
  const running = toNum(entry.runningHours);
  const shiftPlanned = entry.shift?.plannedHours != null && toNum(entry.shift.plannedHours) > 0
    ? toNum(entry.shift.plannedHours)
    : null;
  const planned = shiftPlanned ?? (entry.downtime?.plannedHours != null && toNum(entry.downtime.plannedHours) > 0 ? toNum(entry.downtime.plannedHours) : null);
  // PHASE 3 — canonical OT (persisted overtime_hours → legacy remarks `OT: X h`),
  // the same definition as the KPI and the OT column. Never runningHours - 8.
  const ot = entryOvertimeHours(entry as any);
  // ── STEP 2 — CALCULATION MATRIX ──────────────────────────────────────────
  // Total Available Hours = stored planned shift + stored overtime.
  // Actual Running Hours  = Total Available Hours − Total Downtime Hours.
  //
  // The running figure is recomputed from that matrix whenever the shift's
  // duty hours (running + downtime) were fully consumed — the exact signature
  // of a row whose overtime was not carried into the stored running hours
  // (8h shift + 2h OT − 2h downtime must resolve to 8h, never 6h).
  //
  // An EARLY FINISH — duty still below the planned shift — keeps its own
  // recorded running hours, so the Remaining figure stays meaningful instead
  // of being silently inflated to fill the shift.
  const totalAvailableHours = planned != null ? planned + ot : null;
  const dutyHours = running + totalDowntime;
  const shiftFullyConsumed = planned != null && dutyHours >= planned;
  const mustUsePlanMath = totalAvailableHours != null
    && totalAvailableHours > 0
    && totalDowntime > 0
    && (dutyHours > totalAvailableHours || shiftFullyConsumed);
  const effectiveRunning = (mustUsePlanMath && totalAvailableHours != null)
    ? Math.max(0, totalAvailableHours - totalDowntime)
    : running;
  const remaining = totalAvailableHours != null ? Math.max(0, totalAvailableHours - effectiveRunning - totalDowntime) : null;
  // Efficiency follows the corrected running figure only when it was re-derived.
  const eff = (mustUsePlanMath && totalAvailableHours != null)
    ? Math.round((effectiveRunning / totalAvailableHours) * 10000) / 100
    : toNum(entry.efficiencyPercentage);
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

  const rawItem = productionInItem;
  // Resolve the actual UOM of the input material (ledger, store balance, or item base UOM)
  const consumptionLedger = movements.find((m) => m.transactionType === 'PRODUCTION_CONSUMPTION');
  const rawUom = consumptionLedger?.uom?.code
    || sourceStoreRow?.uom?.code
    || inputBalances[0]?.uom?.code
    || (rawItem as any)?.baseUom?.code
    || (rawItem?.wireSizeMm != null && !entry.item?.weightPerPiece ? 'KG' : (entry.uom?.code ?? 'KG'));

  // Derive raw material consumption (OUTPUT lines only — see entryLines.ts).
  let calculatedRawDemand = 0;
  const outputItemLines = splitEntryItemLines(entry.items).outputs;
  if (outputItemLines.length > 0) {
    for (const line of outputItemLines) {
      const lineItem = line.item || entry.item;
      const lUom = line.uom?.code || entry.uom?.code || '';
      const lGood = toNum(line.actualQuantity);
      const lScrap = toNum(line.scrapQuantity);
      if (rawUom === 'KG') {
        const kgGood = calcActualKg(lUom, lGood, lineItem?.weightPerPiece, lineItem?.weightPerMeter);
        calculatedRawDemand += (kgGood ?? lGood) + lScrap;
      } else {
        // Raw material is in PCS / other discrete units
        const pcsScrap = (rawUom === 'PCS' && lineItem?.weightPerPiece && lineItem.weightPerPiece > 0)
          ? Math.round((lScrap / lineItem.weightPerPiece) * 100) / 100
          : 0;
        calculatedRawDemand += lGood + pcsScrap;
      }
    }
  }
  if (calculatedRawDemand <= 0) {
    const entryUom = entry.uom?.code || '';
    if (rawUom === 'KG') {
      const kgGood = calcActualKg(entryUom, goodQty, entry.item?.weightPerPiece, entry.item?.weightPerMeter);
      calculatedRawDemand = (kgGood ?? goodQty) + scrapQty;
    } else {
      const pcsScrap = (rawUom === 'PCS' && entry.item?.weightPerPiece && entry.item.weightPerPiece > 0)
        ? Math.round((scrapQty / entry.item.weightPerPiece) * 100) / 100
        : 0;
      calculatedRawDemand = goodQty + pcsScrap;
    }
  }
  calculatedRawDemand = Math.round(calculatedRawDemand * 10000) / 10000;

  // The actual consumed raw material (authoritative from ledger if posted, or calculated)
  const rawConsumed = consumptionOutTotal > 0
    ? consumptionOutTotal
    : (calculatedRawDemand > 0 ? calculatedRawDemand : (productionInItem ? 0 : goodQty + scrapQty));

  const rawDemandTotal = consumptionOutTotal > 0 ? consumptionOutTotal : calculatedRawDemand;
  const demandTotal = rawDemandTotal; // backward-compat

  const near = (a: number, b: number) => Math.abs(a - b) <= 0.005;
  const expectedConsumption = productionInItemId ? (calculatedRawDemand > 0 ? calculatedRawDemand : consumptionOutTotal) : 0;
  const reconciliationOk =
    !posted ? movements.length === 0
      : near(outputReceiptTotal, goodQty) && near(scrapOutTotal, scrapQty) && near(consumptionOutTotal, expectedConsumption);
  const sourceShortage =
    posted && productionInItemId && sourceStoreId && sourceStoreAvail !== null && sourceStoreAvail + 0.001 < rawDemandTotal;
  const aggregateShortage =
    posted && productionInItemId && aggregateInputAvail + 0.001 < rawDemandTotal;
  const noBalancesAnywhere = inputBalances.length === 0;

  // ── Calculations for 2-Line Material Movement & Balance Impact Report ──
  const rawStoreName = (entry as any).rawMaterialWarehouse?.name ?? sourceStoreRow?.warehouse?.name ?? 'Source Store';
  const rawCurrentAvail = sourceStoreAvail ?? 0;
  const rawBefore = posted ? rawCurrentAvail + rawConsumed : rawCurrentAvail;
  const rawAfter = posted ? rawCurrentAvail : Math.max(0, rawCurrentAvail - rawConsumed);

  const outItem = entry.item;
  const receiptStoreName = (entry as any).warehouse?.name ?? (movements.find(m => m.transactionType === 'PRODUCTION_RECEIPT')?.warehouse?.name) ?? balances[0]?.warehouse?.name ?? 'Receipt Store';
  const outProduced = goodQty;
  const outUom = entry.uom?.code ?? 'KG';
  const outCurrentAvail = balances.find(b => b.warehouse?.name === receiptStoreName)?.available ?? balances[0]?.available ?? 0;
  const outAfter = posted ? outCurrentAvail : outCurrentAvail + outProduced;
  const outBefore = posted ? Math.max(0, outCurrentAvail - outProduced) : outCurrentAvail;
  const realOutBalances = balances.filter(b => toNum(b.available) < 1000000);
  const outCompanyTotal = realOutBalances.reduce((s, b) => s + toNum(b.available), 0);
  const outCompanyBefore = posted ? Math.max(0, outCompanyTotal - outProduced) : outCompanyTotal;

  const ContextInfoTile: React.FC<{
    label: string;
    value: React.ReactNode;
    fullWidth?: boolean;
    highlight?: boolean;
  }> = ({ label, value, fullWidth, highlight }) => (
    <div
      style={{
        gridColumn: fullWidth ? '1 / -1' : undefined,
        background: highlight
          ? 'var(--theme-primary-soft, rgba(2, 132, 199, 0.08))'
          : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.03))',
        border: highlight
          ? '1px solid var(--theme-primary, rgba(2, 132, 199, 0.35))'
          : '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
        borderRadius: 6,
        padding: '7px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          color: 'var(--theme-text-muted, #64748b)',
          lineHeight: 1.2,
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--theme-text, #0f172a)',
          lineHeight: 1.35,
          overflowWrap: 'anywhere',
          wordBreak: 'break-word',
        }}
      >
        {value || '—'}
      </div>
    </div>
  );

  const sectionCtx = (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: '8px',
      }}
    >
      <ContextInfoTile
        label="Entry ID"
        value={
          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--theme-primary, #0284c7)', fontSize: 13 }}>
            {entry.entryNumber ?? '—'}
          </span>
        }
      />
      <ContextInfoTile
        label="Status"
        value={
          posted ? (
            <Tag color="green" style={{ margin: 0, fontWeight: 700, fontSize: 11 }}>POSTED</Tag>
          ) : (
            <Tag color="orange" style={{ margin: 0, fontWeight: 700, fontSize: 11 }}>DRAFT</Tag>
          )
        }
      />
      <ContextInfoTile
        label="Entry Date"
        value={dayjs(entry.entryDate).format('DD-MMM-YYYY')}
      />
      <ContextInfoTile
        label="Shift"
        value={entry.shift ? `${entry.shift.name} (${entry.shift.startTime ?? ''}–${entry.shift.endTime ?? ''})` : '—'}
      />
      <ContextInfoTile
        label="Machine No."
        value={
          <span style={{ color: 'var(--theme-primary, #0284c7)', fontWeight: 700 }}>
            {entry.machine?.name ? `${entry.machine.name} (${entry.machineNo})` : entry.machineNo}
          </span>
        }
        fullWidth
        highlight
      />
      <ContextInfoTile
        label="Division"
        value={entry.division?.name ? `${entry.division.name} (${entry.division.divisionCode})` : (entry.division?.divisionCode || '—')}
      />
      <ContextInfoTile
        label="Department"
        value={entry.department?.name ? `${entry.department.name} (${entry.department.departmentCode})` : (entry.department?.departmentCode || '—')}
      />
      <ContextInfoTile
        label="Section"
        value={entry.section?.name ?? '—'}
        fullWidth
      />
      <ContextInfoTile
        label="Operator"
        value={entry.operatorName || '—'}
      />
      <ContextInfoTile
        label="Supervisor"
        value={entry.supervisorName || '—'}
      />
    </div>
  );

  const sectionSummary = (
    <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered className="erp-detail-descriptions">
      <Descriptions.Item label="Item" span={2}>
        <Text strong>{entry.item?.name}</Text>{entry.item?.itemCode ? ` (${entry.item.itemCode})` : ''}
      </Descriptions.Item>
      <Descriptions.Item label="Wire Size"><Text strong>{wireSize}</Text></Descriptions.Item>
      {/* TASK #39: explicit "Not configured" state instead of a bare dash. */}
      <Descriptions.Item label="Input Material" span={2}>
        {productionInItem ? (
          <span style={{ color: 'var(--theme-primary)' }}>
            <Text strong>{productionInItem.name}</Text>{productionInItem.itemCode ? ` (${productionInItem.itemCode})` : ''}
          </span>
        ) : (
          <Text type="secondary">Input Material: Not configured</Text>
        )}
      </Descriptions.Item>
      <Descriptions.Item label="Target Production">{formatNumber(entry.targetQuantity, 3)}</Descriptions.Item>
      <Descriptions.Item label="UOM">{entry.uom?.code}{entry.uom?.symbol ? ` (${entry.uom.symbol})` : ''}</Descriptions.Item>
      <Descriptions.Item label="Base UOM">{entry.item?.baseUom?.code ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="Actual Good Production"><Text strong>{formatNumber(entry.actualQuantity, 3)}</Text></Descriptions.Item>
      <Descriptions.Item label="Product Rejection (KG)">{formatNumber(entry.scrapQuantity, 3)} KG</Descriptions.Item>
      <Descriptions.Item label="Process Cutting Scrap (KG)">{formatNumber(entry.processScrapKg ?? 0, 3)} KG</Descriptions.Item>
      <Descriptions.Item label="Running Hours">{formatNumber(effectiveRunning, 2)}h</Descriptions.Item>
      <Descriptions.Item label="Overtime Hours">{formatNumber(ot, 2)}h</Descriptions.Item>
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
          <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered className="erp-detail-descriptions">
            <Descriptions.Item label="Input Item" span={2}>
              <Text strong>{productionInItem.name}</Text>{productionInItem.itemCode ? ` (${productionInItem.itemCode})` : ''}
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
                </Text>{!noBalancesAnywhere ? ` ${rawUom}` : ''}
                <Text type="secondary"> · Demand this stage: <Text strong>{formatNumber(rawDemandTotal, 3)}</Text> {rawUom}</Text>
              </Text>
              {aggregateShortage && (
                <Alert type="error" showIcon style={{ marginTop: 6 }} data-testid="aggregate-shortage-alert"
                  message={`Company-wide availability (${formatNumber(aggregateInputAvail, 3)}) is below this stage's consumption demand (${formatNumber(rawDemandTotal, 3)}).`}
                />
              )}
              {!aggregateShortage && sourceShortage && (
                <Alert type="warning" showIcon style={{ marginTop: 6 }} data-testid="source-shortage-alert"
                  message={`Source store availability (${formatNumber(sourceStoreAvail!, 3)}) is below this stage's consumption demand (${formatNumber(rawDemandTotal, 3)}), but ${formatNumber(aggregateInputAvail, 3)} is available across other stores.`}
                />
              )}
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              The consumption basis for this stage is Good output converted to weight + Scrap in KG, deducted from this store by the backend.
            </Text>
          </div>
        </div>
      )}
    </div>
  );

  // Material flow (Part A redesign): the raw material consumed in this stage →
  // Material flow for all production output items:
  // Each output item displays its own exact produced quantity and matched raw material consumption.
  const activeOutputLines = outputItemLines.length > 0
    ? outputItemLines
    : [{ id: entry.id, item: entry.item, itemId: entry.itemId, actualQuantity: entry.actualQuantity, scrapQuantity: entry.scrapQuantity, uom: entry.uom }];

  const sectionMaterialFlow = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {activeOutputLines.map((line, idx) => {
        const lineItem = line.item || entry.item;
        const lineProdQty = toNum(line.actualQuantity);
        const lineScrapQty = toNum(line.scrapQuantity);
        const lineUomCode = line.uom?.code || entry.uom?.code || 'PCS';
        const lineRawItem = (lineItem as any)?.productionInItem || (line.itemId === entry.itemId ? entry.item?.productionInItem : null);

        // Match movements specifically for this raw material item
        const itemConsumptions = movements.filter((m) =>
          m.transactionType === 'PRODUCTION_CONSUMPTION' &&
          m.direction === 'OUT' &&
          (lineRawItem ? (m.itemId === lineRawItem.id || (m.item && (m.item as any).id === lineRawItem.id) || (m.item && m.item.itemCode === lineRawItem.itemCode)) : true)
        );
        const lineRawConsumed = itemConsumptions.length > 0
          ? itemConsumptions.reduce((s, m) => s + toNum(m.quantity), 0)
          : (lineProdQty + lineScrapQty);
        const lineRawUom = itemConsumptions[0]?.uom?.code
          || (lineRawItem as any)?.baseUom?.code
          || rawUom;

        let lineRawBefore = posted ? rawCurrentAvail + lineRawConsumed : rawCurrentAvail;
        if (posted && lineRawBefore < lineRawConsumed) {
          lineRawBefore = lineRawConsumed;
        }
        const lineRawAfter = posted ? Math.max(0, lineRawBefore - lineRawConsumed) : Math.max(0, rawCurrentAvail - lineRawConsumed);

        const lineOutBal = balances.find((b) => b.warehouse?.name === receiptStoreName)?.available ?? balances[0]?.available ?? 0;
        const lineOutBefore = posted ? Math.max(0, toNum(lineOutBal) - lineProdQty) : toNum(lineOutBal);
        const lineOutAfter = posted ? toNum(lineOutBal) : toNum(lineOutBal) + lineProdQty;

        return (
          <div key={line.id || idx}>
            {activeOutputLines.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Tag color="cyan" style={{ fontWeight: 700, borderRadius: 4, margin: 0 }}>Item {idx + 1}</Tag>
                <Text strong style={{ fontSize: 13, color: 'var(--theme-text)' }}>
                  {lineItem?.itemCode}{lineItem?.name ? ` — ${lineItem.name}` : ''}
                </Text>
              </div>
            )}
            <InventoryImpactReport
              posted={posted}
              rawItemCode={lineRawItem?.itemCode}
              rawItemName={lineRawItem?.name}
              rawStoreName={rawStoreName}
              rawBefore={lineRawBefore}
              rawConsumed={lineRawConsumed}
              rawAfter={lineRawAfter}
              rawUom={lineRawUom}
              outItemCode={lineItem?.itemCode}
              outItemName={lineItem?.name}
              outStoreName={receiptStoreName}
              outBefore={lineOutBefore}
              outProduced={lineProdQty}
              outAfter={lineOutAfter}
              outUom={lineUomCode}
              outCompanyBefore={outCompanyBefore}
              outCompanyTotal={outCompanyTotal}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
              {lineRawItem && (
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
                    <Text strong style={{ fontSize: 12 }}>{lineRawItem.itemCode}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>— {lineRawItem.name}</Text>
                    {lineRawItem.wireSizeMm != null && (
                      <Text type="secondary" style={{ fontSize: 12 }}>· {formatDimension(lineRawItem.wireSizeMm)} mm</Text>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 13, lineHeight: '18px', padding: '4px 0' }}>
                    ▾ consumed <strong style={{ color: '#b91c1c' }}>{formatNumber(lineRawConsumed, 3)} {lineRawUom}</strong>{lineScrapQty > 0 ? ` (+ scrap ${formatNumber(lineScrapQty, 3)} KG)` : ''}
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
                <Text strong style={{ fontSize: 12 }}>{lineItem?.itemCode}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>— {lineItem?.name}</Text>
                {lineItem?.wireSizeMm != null && (
                  <Text type="secondary" style={{ fontSize: 12 }}>· {formatDimension(lineItem.wireSizeMm)} mm</Text>
                )}
                <Text type="secondary" style={{ fontSize: 12 }}>
                  → {formatNumber(lineProdQty, 3)} {lineUomCode}{lineScrapQty > 0 ? ` + scrap ${formatNumber(lineScrapQty, 3)}` : ''}
                </Text>
              </div>
            </div>
          </div>
        );
      })}
      {entry.uom?.code && entry.item?.baseUom?.code && entry.uom.code !== entry.item.baseUom.code && (
        <div style={{ marginTop: 4 }}>
          <Tag color="blue">UOM conversion: entry UOM {entry.uom.code} → base {entry.item.baseUom.code}</Tag>
        </div>
      )}
    </div>
  );

  const sectionDowntime = (
    <DowntimeView
      downtimeHours={entry.downtimeHours}
      runningHours={effectiveRunning}
      plannedHours={planned}
      overtimeHours={ot}
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
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {op.sequenceNo}
              </span>
              <Text strong style={{ fontSize: 12 }}>{op.operationName ?? `Op #${op.sequenceNo}`}</Text>
              {op.department?.name && (
                <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{op.department.name}</Tag>
              )}
            </div>
            {idx < arr.length - 1 && (
              <div style={{ paddingLeft: 18, color: 'var(--theme-text-muted)', fontSize: 11, lineHeight: '14px' }}>
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
        outCompanyBefore={outCompanyBefore}
        outCompanyTotal={outCompanyTotal}
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
          scroll={{ x: 'max-content' }}
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
                <Text strong>{formatNumber(rawDemandTotal, 3)} {rawUom}</Text>
                <Text type="secondary"> demanded · </Text>
                <Text strong>{formatNumber(consumptionOutTotal, 3)} {rawUom}</Text>
                <Text type="secondary"> in ledger</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          <Table
            rowKey="id" size="small" pagination={false}
            scroll={{ x: 'max-content' }}
            dataSource={movements}
            columns={[
              { title: 'Date', key: 'date', width: 120, render: (_, m) => m.transactionDate ? dayjs(m.transactionDate).format('DD-MMM HH:mm') : '—' },
              { title: 'Type', dataIndex: 'transactionType', render: (t) => typeLabel(t) },
              {
                title: 'Dir', dataIndex: 'direction', width: 70,
                render: (d) => d === 'IN' ? <Tag color="green">IN</Tag> : <Tag color="red">OUT</Tag>,
              },
              { title: 'Item', key: 'item', render: (_, m) => m.item ? `${m.item.name}${m.item.itemCode ? ` (${m.item.itemCode})` : ''}` : '—' },
              { title: 'Warehouse', key: 'wh', render: (_, m) => m.warehouse?.name ?? '—' },
              { title: 'Qty', dataIndex: 'quantity', align: 'right' as const, width: 100, render: (v) => formatNumber(v, 3) },
              { title: 'Notes', key: 'notes', render: (_, m) => m.notes ?? '—' },
            ]}
          />
        </div>
      )}
    </div>
  );

  const stepDefinitions: Array<{
    key: DetailStepKey;
    stepNum: number;
    title: string;
    badge?: React.ReactNode;
    icon: React.ReactNode;
  }> = [
    { key: 'items', stepNum: 1, title: 'Production Items & Output Lines', badge: outputItemLines.length > 0 ? `${outputItemLines.length} lines` : undefined, icon: <AppstoreFilled /> },
    { key: 'downtime', stepNum: 2, title: 'Shift Duty & Downtime Tracking', badge: entry.downtimes?.length ? `${entry.downtimes.length} logs` : undefined, icon: <FieldTimeOutlined /> },
    { key: 'material', stepNum: 3, title: 'Material Flow & Store Balances', icon: <ThunderboltFilled /> },
    { key: 'ledger', stepNum: 4, title: 'Stock Ledger Movements & Reconciliation', badge: movements.length > 0 ? `${movements.length} rows` : undefined, icon: <BarcodeOutlined /> },
    { key: 'route', stepNum: 5, title: 'Machine Route & Sequence Operations', badge: entry.route?.operations?.length ? `${entry.route.operations.length} ops` : undefined, icon: <AimOutlined /> },
    { key: 'coils', stepNum: 6, title: 'Coil QR & Barcode Labels', icon: <PrinterOutlined /> },
    { key: 'audit', stepNum: 7, title: 'Order Linkages & Entry Metadata', icon: <FileTextOutlined /> },
  ];

  const currentStepIdx = stepDefinitions.findIndex((s) => s.key === activeStep);
  const currentStep = stepDefinitions[currentStepIdx] || stepDefinitions[0];
  const prevStep = currentStepIdx > 0 ? stepDefinitions[currentStepIdx - 1] : null;
  const nextStep = currentStepIdx < stepDefinitions.length - 1 ? stepDefinitions[currentStepIdx + 1] : null;

  return (
    <div>
      <style>{`
        .erp-detail-descriptions .ant-descriptions-item-label {
          min-width: 135px;
          font-weight: 600 !important;
          color: var(--theme-text-muted, #475569) !important;
          background: var(--theme-surface-alt, #f8fafc) !important;
          font-size: 12.5px;
          padding: 8px 12px !important;
        }
        .erp-detail-descriptions .ant-descriptions-item-content {
          font-size: 13px;
          color: var(--theme-text, #0f172a);
          padding: 8px 12px !important;
        }
        @media (max-width: 640px) {
          .erp-detail-descriptions .ant-descriptions-item-label {
            width: 40% !important;
            min-width: 110px !important;
            white-space: normal !important;
            word-break: break-word !important;
          }
          .erp-detail-descriptions .ant-descriptions-item-content {
            width: 60% !important;
            word-break: break-word !important;
          }
        }
      `}</style>

      {/* ── PageHeader provider for application header & tabs ── */}
      {!isModal && (
        <PageHeader
          icon={<FileTextOutlined />}
          title="Production Entry Details"
          subtitle={`Shift production details, raw material reconciliation, and inventory impacts for ${entry.entryNumber || entry.id.slice(0, 8)}`}
        />
      )}

      {/* ── Action bar: identity + machine/department + date + actions ── */}
      <div style={{ marginBottom: 12, width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <Space style={{ flexWrap: 'wrap' }}>
          <Button
            icon={isModal ? undefined : <ArrowLeftOutlined />}
            onClick={isModal ? (onClose || (() => navigate('/production/entries'))) : () => navigate('/production/entries')}
          >
            {isModal ? 'Close' : 'Back'}
          </Button>
          <Title level={4} style={{ margin: 0, fontSize: isModal ? 16 : 18 }}>
            Production Entry — {dayjs(entry.entryDate).format('DD-MMM-YYYY')}
          </Title>
          {posted ? (
            <Tag color="green" style={{ margin: 0, fontWeight: 700 }}>POSTED</Tag>
          ) : (
            <Tag color="orange" style={{ margin: 0, fontWeight: 700 }}>DRAFT</Tag>
          )}
        </Space>
        <Space style={{ flexWrap: 'wrap' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {entry.department?.name} · {entry.machine?.name ? `${entry.machine.name} (${entry.machineNo})` : entry.machineNo} · {dayjs(entry.entryDate).format('YYYY-MM-DD')}
          </Text>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              if (onEditProp && id) {
                onEditProp(id);
              } else {
                setEditModalOpen(true);
              }
            }}
          >
            Edit
          </Button>
          <DeleteEntryButton
            onDeleted={onDeletedProp || (() => navigate('/production/entries'))}
            id={id!}
            entry={entry}
          />
        </Space>
      </div>

      {/* ── Compact KPI strip ── */}
      <Row gutter={[8, 8]} style={{ marginBottom: 4 }}>
        <KpiCell label="Target" value={formatNumber(entry.targetQuantity, 3)} sub={entry.uom?.code} icon={<AimOutlined />} />
        <KpiCell label="Actual Good" value={formatNumber(entry.actualQuantity, 3)} sub={entry.uom?.code} icon={<AppstoreFilled />} />
        <KpiCell label="Scrap" value={formatNumber(entry.scrapQuantity, 3)} sub="KG" accent={toNum(entry.scrapQuantity) > 0 ? 'warn' : undefined} icon={<DeleteFilled />} />
        <KpiCell label="Achievement" value={<KpiPercentage value={ach} fontSize={16} fontWeight={700} />} sub="% of target" icon={<TrophyFilled />} />
        <KpiCell label="Efficiency" value={<KpiPercentage value={eff} fontSize={16} fontWeight={700} />} sub="% of shift" icon={<ThunderboltFilled />} />
        <KpiCell label="Running" value={`${formatNumber(effectiveRunning, 2)}h`} sub={planned != null ? `of ${formatNumber(planned, 2)}h` : undefined} icon={<ClockCircleFilled />} />
        <KpiCell label="Downtime" value={`${formatNumber(totalDowntime, 2)}h`} sub={remaining != null ? `remaining ${formatNumber(remaining, 2)}h` : undefined} accent={totalDowntime > 0 ? 'warn' : undefined} icon={<FieldTimeOutlined />} />
      </Row>

      {/* ── Step-to-Step Interactive Navigation Ribbon ── */}
      <div
        style={{
          marginTop: 8,
          marginBottom: 12,
          padding: '6px 8px',
          background: 'var(--theme-card-bg, rgba(15, 23, 42, 0.6))',
          borderRadius: 8,
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {stepDefinitions.map((step) => {
          const isActive = activeStep === step.key;
          return (
            <button
              key={step.key}
              type="button"
              onClick={() => setActiveStep(step.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 14px',
                borderRadius: 6,
                fontSize: 12.5,
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                border: isActive
                  ? '1px solid var(--theme-primary, #0284c7)'
                  : '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
                background: isActive
                  ? 'var(--theme-primary, #0284c7)'
                  : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                color: isActive ? '#ffffff' : 'var(--theme-text, #e2e8f0)',
                boxShadow: isActive ? '0 2px 6px rgba(2, 132, 199, 0.35)' : 'none',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 13, display: 'inline-flex' }}>{step.icon}</span>
              <span>{step.stepNum}. {step.title.split('&')[0].trim()}</span>
              {step.badge && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: isActive ? 'rgba(255, 255, 255, 0.25)' : 'var(--theme-primary-soft, rgba(2, 132, 199, 0.15))',
                    color: isActive ? '#ffffff' : 'var(--theme-primary, #0284c7)',
                  }}
                >
                  {step.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Row gutter={[16, 16]}>
        {/* ── LEFT PANE: Executive Station & Production Context ── */}
        <Col xs={24} lg={8} xl={7}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card
              size="small"
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AimOutlined style={{ color: 'var(--theme-primary, #0284c7)' }} />
                    Production Station Context
                  </span>
                  {posted ? (
                    <Tag color="green" style={{ margin: 0 }}>POSTED</Tag>
                  ) : (
                    <Tag color="orange" style={{ margin: 0 }}>DRAFT</Tag>
                  )}
                </div>
              }
            >
              {sectionCtx}

              <Divider style={{ margin: '12px 0' }} />

              {/* Achievement & Efficiency Visual Gauges */}
              <div
                style={{
                  background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.02))',
                  borderRadius: 8,
                  border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.12))',
                  padding: '10px 8px',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  textAlign: 'center',
                }}
              >
                <div style={{ borderRight: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))', paddingRight: 6 }}>
                  <Text type="secondary" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>
                    Achievement
                  </Text>
                  <div style={{ margin: '2px 0' }}>
                    <KpiPercentage value={ach} fontSize={22} fontWeight={800} />
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {formatNumber(entry.actualQuantity, 2)} / {formatNumber(entry.targetQuantity, 2)}
                  </Text>
                </div>
                <div style={{ paddingLeft: 6 }}>
                  <Text type="secondary" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>
                    Efficiency
                  </Text>
                  <div style={{ margin: '2px 0' }}>
                    <KpiPercentage value={eff} fontSize={22} fontWeight={800} />
                  </div>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {formatNumber(effectiveRunning, 2)}h / {planned != null ? `${formatNumber(planned, 2)}h` : 'shift'}
                  </Text>
                </div>
              </div>

              <Divider style={{ margin: '12px 0' }} />

              {/* Quick Actions in Left Pane */}
              <Space direction="vertical" style={{ width: '100%' }}>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  block
                  onClick={() => {
                    if (onEditProp && id) {
                      onEditProp(id);
                    } else {
                      setEditModalOpen(true);
                    }
                  }}
                >
                  Edit Entry (In-Modal)
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  block
                  onClick={() => setActiveStep('coils')}
                >
                  Coil Barcode Labels
                </Button>
                <DeleteEntryButton
                  onDeleted={onDeletedProp || (() => navigate('/production/entries'))}
                  id={id!}
                  entry={entry}
                  block
                />
              </Space>
            </Card>
          </div>
        </Col>

        {/* ── RIGHT PANE: Active Interactive Step & Table View ── */}
        <Col xs={24} lg={16} xl={17}>
          <Card
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 14 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      background: 'var(--theme-primary, #0284c7)',
                      color: '#ffffff',
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {currentStep.stepNum}
                  </span>
                  <span>{currentStep.title}</span>
                </span>
                <Space>
                  <Button
                    size="small"
                    icon={<LeftOutlined />}
                    disabled={!prevStep}
                    onClick={() => prevStep && setActiveStep(prevStep.key)}
                  >
                    Previous
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    disabled={!nextStep}
                    onClick={() => nextStep && setActiveStep(nextStep.key)}
                  >
                    Next <RightOutlined />
                  </Button>
                </Space>
              </div>
            }
          >
            {/* Step 1: Production Items & Outputs */}
            {activeStep === 'items' && (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    Primary Manufactured Product
                  </Text>
                  {sectionSummary}
                </div>
                {outputItemLines.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                      Secondary Output Production Lines ({outputItemLines.length})
                    </Text>
                    <Table
                      rowKey="id"
                      size="small"
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      dataSource={outputItemLines}
                      columns={[
                        { title: '#', dataIndex: 'lineNumber', width: 40 },
                        {
                          title: 'Item',
                          key: 'item',
                          render: (_, r) =>
                            r.item ? (
                              <Text strong>
                                {r.item.name}
                                {r.item.itemCode ? ` (${r.item.itemCode})` : ''}
                              </Text>
                            ) : (
                              '—'
                            ),
                        },
                        {
                          title: 'Wire Size',
                          key: 'wire',
                          width: 110,
                          render: (_, r) =>
                            r.item?.wireSizeMm != null
                              ? `${formatDimension(r.item.wireSizeMm)} mm`
                              : '—',
                        },
                        { title: 'UOM', key: 'uom', width: 70, render: (_, r) => r.uom?.code ?? '—' },
                        {
                          title: 'Per Unit Weight',
                          key: 'perUnitWeight',
                          width: 115,
                          render: (_, r) => (
                            <Text type="secondary" style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>
                              {perUnitWeightLabel(r.uom?.code ?? '', r.item?.weightPerPiece, r.item?.weightPerMeter) ?? '—'}
                            </Text>
                          ),
                        },
                        { title: 'Actual', dataIndex: 'actualQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                        {
                          title: 'Actual KG',
                          key: 'actualKg',
                          width: 100,
                          align: 'right',
                          render: (_, r) => {
                            const kg = calcActualKg(r.uom?.code ?? '', toNum(r.actualQuantity), r.item?.weightPerPiece, r.item?.weightPerMeter);
                            return kg == null ? <Text type="secondary">—</Text> : <Text style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(kg, 3)}</Text>;
                          },
                        },
                        { title: 'Scrap', dataIndex: 'scrapQuantity', width: 90, align: 'right', render: (v) => formatNumber(v, 3) },
                      ]}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Downtime Tracking & Shift Duty */}
            {activeStep === 'downtime' && (
              <div>
                {sectionDowntime}
              </div>
            )}

            {/* Step 3: Material Flow & Store Balances */}
            {activeStep === 'material' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    Raw Material Inventory Availability
                  </Text>
                  {sectionInputMaterial}
                </div>
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    2-Line Material Movement & Balance Impact Analysis
                  </Text>
                  {sectionMaterialFlow}
                </div>
              </div>
            )}

            {/* Step 4: Stock Ledger Movements & Reconciliation */}
            {activeStep === 'ledger' && (
              <div>
                {sectionMovements}
              </div>
            )}

            {/* Step 5: Machine Route Operations Sequence */}
            {activeStep === 'route' && (
              <div>
                {sectionRoute}
              </div>
            )}

            {/* Step 6: Coil Serialization & Unique Barcode/QR Labels */}
            {activeStep === 'coils' && (
              <div id="coil-serialization-section">
                <ProductionUnitsPage
                  embedded
                  productionEntryId={entry.id}
                  initialItem={entry.item ? { id: entry.itemId, itemCode: entry.item.itemCode, name: entry.item.name } : null}
                  initialValues={{
                    shiftName: entry.shift?.name,
                    operatorName: entry.operatorName,
                    machineNo: entry.machineNo,
                    productionDate: entry.entryDate,
                    lengthMeters: 250,
                  }}
                />
              </div>
            )}

            {/* Step 7: Order Linkages & Audit Trail */}
            {activeStep === 'audit' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                    Production Order & Operations Linkage
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <ContextInfoTile
                      label="Production Order"
                      value={
                        entry.productionOrder ? (
                          <Button type="link" size="small" style={{ padding: 0, fontWeight: 700 }} onClick={() => navigate(`/production/orders/${entry.productionOrder!.id}`)}>
                            {entry.productionOrder.orderNumber}
                          </Button>
                        ) : '—'
                      }
                    />
                    <ContextInfoTile
                      label="Operation ID"
                      value={entry.productionOrderOperationId?.slice(0, 8) || '—'}
                    />
                  </div>
                </div>
                <div>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                    Remarks & Entry Audit Metadata
                  </Text>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                    <ContextInfoTile
                      label="Remarks"
                      value={entry.remarks ?? '—'}
                      fullWidth
                    />
                    <ContextInfoTile
                      label="Created By"
                      value={entry.createdByUser?.fullName ?? '—'}
                    />
                    <ContextInfoTile
                      label="Entry ID"
                      value={<span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--theme-text-muted)' }}>{entry.entryNumber ?? '—'}</span>}
                    />
                  </div>
                </div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Enterprise In-Modal Dual-Pane Edit Dialog ── */}
      <ProductionEntryEditModal
        open={editModalOpen}
        entryId={id || null}
        onClose={() => setEditModalOpen(false)}
        onSuccess={() => {
          setReloadKey((k) => k + 1);
        }}
      />
    </div>
  );
};

const DeleteEntryButton: React.FC<{ id: string; onDeleted: () => void; block?: boolean; entry?: any }> = ({ id, onDeleted, block, entry }) => {
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  return (
    <>
      <Button danger icon={<DeleteOutlined />} block={block} onClick={() => setDeleteModalOpen(true)}>
        Delete Entry
      </Button>

      <DeleteConfirmModal
        open={deleteModalOpen}
        title="Delete this daily production entry?"
        itemType="Daily Production Entry"
        itemCode={entry?.item?.itemCode || id}
        itemName={entry?.item?.name || entry?.item?.shortName || 'Production Entry'}
        recordType="ITEM CODE"
        description="Are you sure you want to permanently delete this production entry? This will reverse any posted stock ledger movements and unlock the machine for fresh entry. This action cannot be undone."
        userName={entry?.operatorName || entry?.createdByName || 'Operator'}
        tags={[
          entry?.department?.name || '',
          entry?.shift ? `Shift ${entry.shift}` : '',
          entry?.entryDate ? dayjs(entry.entryDate).format('DD MMM YYYY') : '',
          entry?.actualQuantity ? `${Number(entry.actualQuantity).toLocaleString()} PCS` : '',
        ].filter(Boolean)}
        successTitle="Successfully Deleted"
        successMessage="Daily Production Entry Deleted Successfully"
        okLabel="OK"
        onConfirm={async () => {
          await apiService.delete(`/production/entries/${id}`);
        }}
        onSuccessClose={() => {
          setDeleteModalOpen(false);
          onDeleted();
        }}
        onCancel={() => setDeleteModalOpen(false)}
      />
    </>
  );
};

/** Downtime breakdown: planned / overtime / running / total / remaining summary + every line. */
const DowntimeView: React.FC<{
  downtimeHours: number | string;
  runningHours: number | string;
  plannedHours: number | null;
  overtimeHours: number | null;
  remainingHours: number | null;
  lines: DowntimeDetail[];
}> = ({ downtimeHours, runningHours, plannedHours, overtimeHours, remainingHours, lines }) => {
  const total = toNum(downtimeHours);
  const running = toNum(runningHours);
  const ot = toNum(overtimeHours);
  const summary: Array<{ label: string; value: string; accent?: boolean; strong?: boolean; tone?: string }> = [
    { label: 'Planned', value: plannedHours != null ? `${formatNumber(plannedHours, 2)}h` : '—' },
    // STEP 1 — the stored overtime_hours is rendered next to the planned shift,
    // so the shift summary itself explains Total Available = Planned + Overtime.
    { label: 'Overtime (Hours)', value: `${formatNumber(ot, 2)}h`, tone: ot > 0 ? '#8b5cf6' : undefined },
    { label: 'Running', value: `${formatNumber(running, 2)}h` },
    { label: 'Total Downtime', value: `${formatNumber(total, 2)}h`, accent: total > 0 },
    { label: 'Remaining', value: remainingHours != null ? `${formatNumber(remainingHours, 2)}h` : '—', strong: true },
  ];
  return (
    <div>
      <Row gutter={[8, 8]}>
        {summary.map((s) => (
          <Col xs={12} md={4} key={s.label}>
            <div style={{
              background: s.accent ? 'var(--theme-warning-soft)' : 'var(--theme-surface-alt)',
              borderRadius: 6, padding: '4px 8px',
            }}>
              <Text type="secondary" style={{ fontSize: 11 }}>{s.label}</Text>
              <div>
                <Text strong={s.strong} style={s.tone ? { color: s.tone, fontWeight: 700 } : undefined}>{s.value}</Text>
              </div>
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
          scroll={{ x: 'max-content' }}
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