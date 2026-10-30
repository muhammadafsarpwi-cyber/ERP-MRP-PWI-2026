import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  App, Typography, Switch, Alert, AutoComplete, Tooltip, Tag, Progress, Segmented, Divider,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, LockOutlined, AimOutlined, InfoCircleOutlined,
  PlusOutlined, DeleteOutlined, ClockCircleOutlined, ThunderboltOutlined,
  WarningOutlined, GoldOutlined, CloseCircleOutlined, TrophyOutlined,
  CheckOutlined, UndoOutlined, DatabaseOutlined, CalendarOutlined,
  ToolOutlined, TeamOutlined, ApartmentOutlined, CheckCircleFilled,
  ArrowDownOutlined, ArrowUpOutlined, EyeOutlined, EyeInvisibleOutlined, UserOutlined,
  EditOutlined, PlusSquareOutlined, MinusSquareOutlined, ShopOutlined, AppstoreOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useUserStore } from '../../../store/userStore';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { useLookups, ItemLk } from './lookups';
import { useEntryDockStore, EntryContextParams } from './entryDockStore';
import { splitEntryItemLines, consumedQuantityFromAuditLines } from './entryLines';
import DowntimeReasonSelect from './DowntimeReasonSelect';
import './productionEntryModal.css';
import '../../../styles/rejectionEntry.css';
import {
  DowntimeMode, deriveFromRunning, rebalancePair,
  effectiveRunning, effectiveDowntime, round2, sumDowntimeLines,
  lineToKg, aggregateProductionTotals, buildDowntimePayload, buildProductionItemsPayload,
  convertProductToComponentQty,
} from './downtimeHours';
// STEP 2/3 — the canonical overtime reader (persisted overtime_hours → legacy
// remarks `OT: X h`). Reading the raw column alone made an entry whose OT only
// lives in remarks hydrate as 0h, which then drove Total Available back down to
// the bare 8h shift and re-derived Running as 8 − 2 = 6h on every reopen.
import { entryOvertimeHours } from './overtimeHours';
import KpiPercentage from '../../../components/kpi/KpiPercentage';
import { GlobalLoading } from '../../../components/shared';
import PageHeader from '../../../components/shared/PageHeader';
import ProductionSaveSuccessModal, { SavedEntrySummary } from './ProductionSaveSuccessModal';
import EntryPreSaveConfirmModal, { type EntryPreSaveSummary, type EditedFieldDiff } from './EntryPreSaveConfirmModal';

/**
 * Reads the "| Rejection Remarks: …" audit fragment the save path writes into
 * the entry remarks (machine entry log). Used to hydrate the dedicated form
 * field when editing an existing entry.
 */
const extractRejectionRemarks = (remarks?: string | null): string | undefined => {
  const m = /(?:^|\|)\s*Rejection Remarks:\s*([^|]*)/i.exec(String(remarks || ''));
  return m ? m[1].trim() || undefined : undefined;
};

/**
 * Removes the "| Rejection Remarks: …" fragment from the hydrated remarks so
 * the generic Remarks field and the dedicated field never double-store the
 * same audit string (the backend re-appends the fragment on every save).
 */
const stripRejectionRemarks = (remarks?: string | null): string | undefined => {
  const raw = String(remarks || '');
  if (!raw.includes('Rejection Remarks:')) return raw || undefined;
  return raw
    .replace(/\s*\|\s*Rejection Remarks:[^|]*/gi, '')
    .replace(/\s*\|\s*$/, '')
    .trim() || undefined;
};

/**
 * Default Production Entry Date for a BRAND-NEW form: the PREVIOUS production
 * day (today − 1). Seeded once via `initialValue` when the field registers —
 * the picker stays fully editable, so any date the operator selects is kept in
 * the form store and persisted exactly as chosen (never overridden back).
 */
const defaultProductionEntryDate = () => dayjs().subtract(1, 'day');

const { Title, Text } = Typography;

/** Live downtime summary: planned / running / total downtime / remaining.
 *  plannedHours and runningHours are passed from the parent — the same
 *  authoritative shift-derived planned hours used everywhere else — NOT read
 *  from the form store (there is no `plannedHours` form field, so a
 *  Form.useWatch would always resolve to 0 and show "Planned 0h"). */
const DowntimeSummary: React.FC<{ totalDowntime: number; plannedHours: number; runningHours: number; overtimeHours?: number }> = ({ totalDowntime, plannedHours, runningHours, overtimeHours = 0 }) => {
  const is12h = plannedHours >= 12;
  const totalPlanned = is12h ? (8 + overtimeHours) : (plannedHours + overtimeHours);
  const remaining = Math.max(0, totalPlanned - runningHours - totalDowntime);
  const isBalanced = totalPlanned > 0 && Math.abs(runningHours + totalDowntime - totalPlanned) < 0.01;

  return (
    <div style={{ marginTop: 14, marginBottom: 6 }}>
      <div className="downtime-summary-grid">
        {/* Planned */}
        <div className="downtime-summary-card planned">
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--theme-text-secondary, #64748b)', fontWeight: 700, letterSpacing: 0.5 }}>Planned Shift</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-text, #0f172a)' }}>{formatNumber(plannedHours, 2)}h</span>
        </div>

        {/* Overtime */}
        {overtimeHours > 0 && (
          <div className="downtime-summary-card" style={{ borderColor: "rgba(139, 92, 246, 0.4)", background: "rgba(139, 92, 246, 0.08)" }}>
            <span style={{ fontSize: 10, textTransform: "uppercase", color: "#8b5cf6", fontWeight: 700, letterSpacing: 0.5 }}>Overtime</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#8b5cf6" }}>{formatNumber(overtimeHours, 2)}h</span>
          </div>
        )}

        {/* Running */}
        <div className="downtime-summary-card running">
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#10b981', fontWeight: 700, letterSpacing: 0.5 }}>Running</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--theme-text, #000000)' }}>{formatNumber(runningHours, 2)}h</span>
        </div>

        {/* Downtime */}
        <div className={`downtime-summary-card ${totalDowntime > 0 ? 'downtime-has' : 'downtime-zero'}`}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: totalDowntime > 0 ? '#f97316' : 'var(--theme-text-muted, #64748b)', fontWeight: 700, letterSpacing: 0.5 }}>Total Downtime</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: totalDowntime > 0 ? '#f97316' : 'var(--theme-text, #000000)' }}>{formatNumber(totalDowntime, 2)}h</span>
        </div>

        {/* Remaining / Balance */}
        {plannedHours > 0 && (
          <div className={`downtime-summary-card ${isBalanced ? 'balanced' : 'unbalanced'}`}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', color: isBalanced ? '#10b981' : '#ef4444', fontWeight: 700, letterSpacing: 0.5 }}>
              {isBalanced ? 'Shift Balanced' : 'Unaccounted'}
            </span>
            <span style={{ fontSize: 15, fontWeight: 700, color: isBalanced ? '#10b981' : '#ef4444' }}>
              {isBalanced ? <><CheckOutlined style={{ marginRight: 4 }} />OK (0.00h)</> : `${formatNumber(remaining, 2)}h`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

interface WarehouseLk { id: string; name: string; warehouseCode: string; warehouseType?: string; divisionId?: string | null; departmentId?: string | null; }
interface OrderOperation { id: string; sequenceNo: number; departmentId: string | null; operationName?: string; name?: string; }
interface OrderDetail {
  id: string; orderNumber: string; productId: string; uomId: string;
  operations: OrderOperation[];
}
interface ShiftInfo { id: string; name: string; startTime?: string | null; endTime?: string | null; plannedHours: number; }
interface EntryDetailData {
  id: string;
  entryDate: string;
  divisionId: string; sectionId: string; departmentId: string;
  division?: { divisionCode: string; name: string };
  section?: { name: string };
  department?: { name: string; departmentCode: string };
  shiftId: string; machineId: string | null; machineNo: string;
  shift?: ShiftInfo | null;
  operatorName: string; supervisorName: string | null;
  itemId: string; uomId: string;
  uom?: { id: string; code: string; symbol: string };
  targetQuantity: number | string; actualQuantity: number | string;
  runningHours: number | string; overtimeHours?: number | string; downtimeHours: number | string;
  downtimeReasonId: string | null; scrapQuantity: number | string;
  /** Report-only process cutting scrap (off-cuts/trimmings) — never stock-deducting. */
  processScrapKg?: number | string | null;
  remarks: string | null;
  productionOrderId: string | null; productionOrderOperationId: string | null;
  postToInventory: boolean; warehouseId: string | null; inventoryReferenceId: string | null;
}

/** Minimal shape expected back from POST/PUT /production/entries. */
interface ProductionEntrySaved {
  id: string;
  machineNo?: string;
  entryNumber?: string | null;
}

/** Payload of GET /production/entries/machine-target (ERP-00016/ERP-00018 resolution). */
interface MachineTargetResolution {
  effectiveTargetRecordId: string;
  usedGeneralFallback: boolean;
  machine: { id: string; code: string; name: string };
  shift: { id: string; code: string; name: string } | null;
  item?: { id: string; itemCode?: string; code?: string; name: string } | null;
  uom: { id: string; code: string; name: string; symbol: string } | null;
  standardHours: number;
  standardTarget: number;
  calculatedTarget: number | null;
  targetPerHour?: number | null;
  plannedHours?: number;
  route?: {
    id: string; routingCode: string; name: string;
    operations?: Array<{ id: string; sequenceNo: number; operationName?: string; department?: { name?: string } | null }>;
  } | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Same pro-rating formula as the backend's calculateProratedTarget(). */
const prorateTarget = (standardTarget: number, standardHours: number, workingHours: number): number =>
  Math.round(standardTarget * workingHours / standardHours * 10000) / 10000;

/** Client-side guard for production-context IDs before any save request. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── STEP 5 "Production Figures" — shared styling for the FIVE cells of the
//    strict horizontal row (Shift Hours · Overtime · Running Hours ·
//    Product Rejection · Process Cutting Scrap). Identical label metrics +
//    a single compact 32px control box keep every input aligned on one
//    straight horizontal line.
const figLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  lineHeight: '15px',
  color: 'var(--theme-text-muted, #64748b)',
};
const figTagStyle: React.CSSProperties = { fontSize: 9, padding: '0 3px', lineHeight: '14px', margin: 0 };
const figAutoBoxStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  background: 'rgba(100, 116, 139, 0.08)',
  border: '1px solid rgba(100, 116, 139, 0.25)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 38,
  fontWeight: 700,
  fontSize: 13.5,
  color: 'var(--theme-text, #334155)',
};
const figRunningBoxStyle: React.CSSProperties = {
  ...figAutoBoxStyle,
  background: 'rgba(59, 130, 246, 0.1)',
  border: '1px solid rgba(59, 130, 246, 0.4)',
  fontWeight: 800,
  fontSize: 14,
  color: '#2563eb',
};

export interface EntryFormProps {
  mode?: 'create' | 'edit' | 'view';
  isModal?: boolean;
  modalParams?: EntryContextParams | null;
  showLinkedDetails?: boolean;
  onCloseModal?: () => void;
}

const EntryForm: React.FC<EntryFormProps> = ({
  mode = 'create',
  isModal = false,
  modalParams,
  showLinkedDetails = true,
  onCloseModal,
}) => {
  const { message } = App.useApp();
  const { id: routeId } = useParams<{ id: string }>();
  const id = modalParams?.entryId || routeId;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const lookups = useLookups();

  // Local toggle for Linked Details panel when in standalone page view
  const [localShowLinked, setLocalShowLinked] = useState(true);
  const effectiveShowLinked = isModal ? showLinkedDetails : localShowLinked;

  const [warehouses, setWarehouses] = useState<WarehouseLk[]>(() =>
    lookups.warehouses && lookups.warehouses.length > 0 ? lookups.warehouses : []
  );

  useEffect(() => {
    if (lookups.warehouses && lookups.warehouses.length > 0) {
      setWarehouses(lookups.warehouses);
    }
  }, [lookups.warehouses]);

  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

  // 2-Step Pre-Save Confirmation Review State
  const [preSaveOpen, setPreSaveOpen] = useState(false);
  const [pendingSaveData, setPendingSaveData] = useState<{ payload: any; values: any } | null>(null);
  const [preSaveSummary, setPreSaveSummary] = useState<EntryPreSaveSummary | null>(null);

  // PROMPT-35: success confirmation — populated/open ONLY after the backend
  // confirms the entry was persisted (POST/PUT /production/entries).
  const [savedEntry, setSavedEntry] = useState<SavedEntrySummary | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Machine pre-selected on the availability screen (Step 1): context is locked
  const qMachineId = mode === 'create' ? (modalParams?.machineId ?? searchParams.get('machineId')) : null;
  const qMachineCode = modalParams?.machineCode ?? searchParams.get('machineCode');
  const qMachineName = modalParams?.machineName ?? searchParams.get('machineName');
  const qDate = modalParams?.entryDate ?? searchParams.get('entryDate');
  const qShiftId = modalParams?.shiftId ?? searchParams.get('shiftId');
  const qDivisionId = modalParams?.divisionId ?? searchParams.get('divisionId');
  const qSectionId = modalParams?.sectionId ?? searchParams.get('sectionId');
  const qDepartmentId = modalParams?.departmentId ?? searchParams.get('departmentId');
  const qShiftName = modalParams?.shiftName ?? searchParams.get('shiftName');
  const qDivisionName = modalParams?.divisionName ?? searchParams.get('divisionName');
  const qSectionName = modalParams?.sectionName ?? searchParams.get('sectionName');
  const qDepartmentName = modalParams?.departmentName ?? searchParams.get('departmentName');
  const lockedContext = !!(qMachineId && qDate && qShiftId);

  // Edit-mode identity facts (loaded entry) drive the same read-only treatment.
  const [entry, setEntry] = useState<EntryDetailData | null>(null);

  // ── FIX 4 — raw material THIS document has already deducted, per item ──────
  // Read from the saved INPUT audit lines at hydration time. The pre-entry
  // opening balance is then rebuilt explicitly as
  //     Opening Available (Before Entry) = Current Store Stock + Consumed By This Entry
  // so opening an existing document never performs a fresh subtraction against
  // the live balance, and a save with untouched inputs has net impact ZERO.
  // Empty for create mode and for entries that were never posted to inventory.
  const [entryConsumedByItem, setEntryConsumedByItem] = useState<Record<string, number>>({});

  // ── ERP-00016 machine-target resolution ────────────────────────────────────
  const [mtResolution, setMtResolution] = useState<MachineTargetResolution | null>(null);
  const [mtError, setMtError] = useState<string | null>(null);
  const [resolvingMt, setResolvingMt] = useState(false);
  const machineLinked = !!qMachineId || (mode === 'edit' && !!entry?.machineId);

  // watched values
  const divisionId = Form.useWatch('divisionId', form);
  const sectionId = Form.useWatch('sectionId', form);
  const departmentId = Form.useWatch('departmentId', form);
  const itemId = Form.useWatch('itemId', form);
  const uomId = Form.useWatch('uomId', form);
  const actualQty = Form.useWatch('actualQuantity', form);
  const runningHours = Form.useWatch('runningHours', form);
  const overtimeHoursWatch = Form.useWatch('overtimeHours', form);
  const overtimeHours = toNum(overtimeHoursWatch, 0);
  const productionOrderId = Form.useWatch('productionOrderId', form);
  const shiftId = Form.useWatch('shiftId', form);
  const targetQty = Form.useWatch('targetQuantity', form);
  const scrapQty = Form.useWatch('scrapQuantity', form);
  const processScrapQty = Form.useWatch('processScrapKg', form);

  // ── Product Rejection entry mode [KG | PCS] & Breakdown Rows ───────────────
  // `scrapQuantity` stays the canonical KG value the whole form consumes.
  // Multiple rejection defect rows can be added via the + Add Rejection button.
  // When KG is active, KG is editable and Pieces is read-only.
  // When PCS is active, Pieces is editable and KG is read-only.
  const [rejectionUnit, setRejectionUnit] = useState<'KG' | 'PCS' | 'M'>('KG');
  const [rejectionRows, setRejectionRows] = useState<Array<{ id: string; kg: number | null; pcs: number | null; reason: string }>>([
    { id: 'rej-1', kg: null, pcs: null, reason: '' },
  ]);
  const [extraItemDetails, setExtraItemDetails] = useState<Record<string, ItemLk>>({});
  const rawMatWarehouseWatch = Form.useWatch('rawMaterialWarehouseId', form);
  const warehouseWatch = Form.useWatch('warehouseId', form);
  const postToInventoryWatch = Form.useWatch('postToInventory', form);
  const operatorWatch = Form.useWatch('operatorName', form);
  const supervisorWatch = Form.useWatch('supervisorName', form);
  const downtimeEntriesWatch = Form.useWatch('downtimeEntries', form);
  const productionItemsWatch = Form.useWatch('productionItems', form);
  const machineNoWatch = Form.useWatch('machineNo', form);
  const coilSizeWatch = Form.useWatch('coilSize', form);

  // ── Production Entry Date: PURE CONTROLLED STATE ──────────────────────────
  // Form.useWatch('entryDate') only reports a field while a
  // <Form.Item name="entryDate"> is REGISTERED: it returns `undefined` the
  // moment the compact context summary replaces the legacy fields or the
  // details pane is collapsed — and rc-field-form RESETS a non-preserved field
  // to its `initialValue` (yesterday) on unmount. Both used to wipe a manual
  // calendar pick. React state is therefore the single source of truth: the
  // picker is rendered value={formDate} / onChange={commitEntryDate}, and every
  // consumer (ctxIds, payload) reads it. The antd store copy is mirrored on the
  // same write path only so the required rule and onFinish values agree.
  const [formDate, setFormDate] = useState<dayjs.Dayjs>(() => defaultProductionEntryDate());

  /** Single write path: controlled state + form store are always the same day. */
  const commitEntryDate = useCallback((date?: dayjs.Dayjs | null) => {
    const next = date && dayjs.isDayjs(date) && date.isValid() ? date : defaultProductionEntryDate();
    setFormDate(next);
    form.setFieldValue('entryDate', next);
  }, [form]);

  // Auto-fill Supervisor Name from currently logged-in user
  const currentUser = useUserStore((s) => s.user);
  const currentUserName = useMemo(() => {
    if (!currentUser) {
      try {
        const raw = localStorage.getItem('erp_user');
        if (raw) {
          const u = JSON.parse(raw);
          return u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || u.email || '';
        }
      } catch {}
      return '';
    }
    return currentUser.displayName || `${currentUser.firstName || ''} ${currentUser.lastName || ''}`.trim() || currentUser.username || currentUser.email || '';
  }, [currentUser]);

  useEffect(() => {
    if (mode === 'create' && currentUserName) {
      const existing = form.getFieldValue('supervisorName');
      if (!existing) {
        form.setFieldValue('supervisorName', currentUserName);
      }
    }
  }, [mode, currentUserName, form]);

  // Pre-fill form fields from query parameters when navigated from machine select
  useEffect(() => {
    if (mode === 'create') {
      const updates: any = {};
      if (qDivisionId && !form.getFieldValue('divisionId')) updates.divisionId = qDivisionId;
      if (qSectionId && !form.getFieldValue('sectionId')) updates.sectionId = qSectionId;
      if (qDepartmentId && !form.getFieldValue('departmentId')) updates.departmentId = qDepartmentId;
      if (qShiftId && !form.getFieldValue('shiftId')) updates.shiftId = qShiftId;
      if (qDate && !form.getFieldValue('entryDate')) {
        const queryDay = dayjs(qDate);
        if (queryDay.isValid()) {
          updates.entryDate = queryDay;
          setFormDate(queryDay);
        }
      }
      if (qMachineCode && !form.getFieldValue('machineNo')) {
        updates.machineNo = qMachineCode;
      } else if (qMachineId && !form.getFieldValue('machineNo')) {
        const m = lookups.machines.find((x) => x.id === qMachineId);
        if (m) updates.machineNo = m.machineCode;
      }
      if (Object.keys(updates).length > 0) {
        form.setFieldsValue(updates);
      }
    }
  }, [mode, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, qMachineId, qMachineCode, lookups.machines, form]);

  // TASK #32: Raw material data resolved by RawMaterialAvailability, keyed by production itemId.
  // Used by ItemDetailsStrip to show raw material info inline.
  // TASK #35: Also carries the input UOM, source/store department and output name.
  const [rawMaterialData, setRawMaterialData] = useState<Record<string, {
    itemCode: string;
    itemName?: string | null;
    wireSizeMm?: number | null;
    uomCode?: string | null;
    available?: number | null;
    productionInItemId?: string | null;
    productionInItemCode?: string | null;
    productionInItemName?: string | null;
    productionOutItemId?: string | null;
    productionInUomCode?: string | null;
    productionInDepartmentName?: string | null;
    productionOutItemName?: string | null;
    chainWarning?: string | null;
  }>>({});

  const handleRawMaterialData = useCallback((newData: Record<string, any>) => {
    setRawMaterialData((prev) => {
      const prevKeys = Object.keys(prev);
      const newKeys = Object.keys(newData);
      if (prevKeys.length !== newKeys.length) return newData;
      const changed = newKeys.some((k) => {
        const p = prev[k];
        const n = newData[k];
        if (!p || !n) return true;
        return (
          p.itemCode !== n.itemCode ||
          p.itemName !== n.itemName ||
          p.productionInItemCode !== n.productionInItemCode ||
          p.productionInItemName !== n.productionInItemName ||
          p.available !== n.available ||
          p.wireSizeMm !== n.wireSizeMm ||
          p.uomCode !== n.uomCode ||
          p.productionInItemId !== n.productionInItemId ||
          p.chainWarning !== n.chainWarning
        );
      });
      return changed ? newData : prev;
    });
  }, []);

  // ── First production item = authoritative item for the Machine Target ─────
  // The Production Items Form.List is the source of item selection. When the
  // operator picks a different item in row 1, the item-scoped machine target
  // is re-resolved against that FIRST item (never the second). No averaging.
  const firstProdItemId = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    return items.find((it) => !!it.itemId)?.itemId;
  }, [productionItemsWatch]);

  // Context values that live OUTSIDE rendered fields: the locked machine-
  // selection flow passes them as query params and edit mode loads them from
  // the entry. Form.useWatch/onFinish values CANNOT observe unregistered
  // fields (the compact summary replaces those Form.Items), so resolve every
  // context dimension explicitly from its authoritative source.
  const ctxIds = useMemo(() => {
    const s = (x: unknown): string | undefined => (typeof x === 'string' && x.length > 0 ? x : undefined);
    if (mode === 'edit') {
      return {
        divisionId: entry?.divisionId ?? s(divisionId),
        sectionId: entry?.sectionId ?? s(sectionId),
        departmentId: entry?.departmentId ?? s(departmentId),
        shiftId: entry?.shiftId ?? entry?.shift?.id ?? s(shiftId),
        entryDate: entry?.entryDate ? entry.entryDate.slice(0, 10) : undefined,
        machineId: entry?.machineId ?? undefined,
        machineNo: entry?.machineNo ?? s(machineNoWatch),
      };
    }
    if (lockedContext) {
      return {
        divisionId: qDivisionId || undefined,
        sectionId: qSectionId || undefined,
        departmentId: qDepartmentId || undefined,
        shiftId: qShiftId || undefined,
        entryDate: qDate || undefined,
        machineId: qMachineId || undefined,
        machineNo: undefined,
      };
    }
    // Legacy free-form flow — those Form.Items are registered here. The
    // Production Entry Date comes from the controlled `formDate` state (never
    // from a registered-field watch, which reports `undefined` as soon as the
    // field unmounts and used to drop the date from the payload).
    const d = formDate;
    return {
      divisionId: s(divisionId),
      sectionId: s(sectionId),
      departmentId: s(departmentId),
      shiftId: s(shiftId),
      entryDate: d && d.isValid() ? d.format('YYYY-MM-DD') : undefined,
      machineId: undefined,
      machineNo: s(machineNoWatch),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lockedContext, entry, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, qMachineId, divisionId, sectionId, departmentId, shiftId, machineNoWatch, formDate]);
  const ctxShiftId = ctxIds.shiftId;

  // Edit mode: hydrate the STORED production day into the controlled state too
  // (the store copy is written by the entry loader below), so state, form store
  // and submitted payload can never describe three different days.
  useEffect(() => {
    if (mode !== 'edit' || !entry?.entryDate) return;
    const storedDay = dayjs(entry.entryDate);
    if (storedDay.isValid()) setFormDate(storedDay);
  }, [mode, entry?.entryDate]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiService.get<{ data: WarehouseLk[] }>('/warehouses', { limit: 100 });
        setWarehouses(res.data || []);
      } catch { /* non-critical */ }
      if (mode === 'create') {
        void lookups.loadMachines(qDepartmentId || undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strictly filter warehouse dropdowns so only warehouses of the current division appear
  const divisionWarehouses = useMemo(() => {
    const pool = warehouses.length > 0 ? warehouses : (lookups.warehouses || []);
    const divId = ctxIds.divisionId;
    const divObj = lookups.divisions.find((d) => d.id === divId);
    const divCode = (divObj?.divisionCode || '').toLowerCase();
    const divName = (divObj?.name || qDivisionName || '').toLowerCase();

    const isSpoke =
      divId === 'd1000000-0000-0000-0000-000000000001' ||
      divCode.includes('spd') ||
      divCode.includes('spi') ||
      divName.includes('spoke') ||
      (qMachineCode || '').toLowerCase().includes('spk');

    const isCables =
      divId === 'd1000000-0000-0000-0000-000000000002' ||
      divCode.includes('ccd') ||
      divName.includes('cable') ||
      (qMachineCode || '').toLowerCase().includes('ccd');

    if (isSpoke) {
      // Return Spoke division warehouses, exclude any CCD/Cable warehouses
      const spokeWhs = pool.filter((w) => {
        const c = (w.warehouseCode || '').toLowerCase();
        const n = (w.name || '').toLowerCase();
        if (c.startsWith('ccd') || n.includes('ccd') || n.includes('cable')) return false;
        if (w.divisionId === 'd1000000-0000-0000-0000-000000000001') return true;
        if (c.includes('spi') || c.includes('spk') || c.includes('spd') || n.includes('spoke') || c.includes('st-') || c.includes('sw-') || c.includes('pl-')) return true;
        return !c.includes('ccd');
      });
      return spokeWhs.length > 0 ? spokeWhs : pool.filter((w) => !(w.warehouseCode || '').toLowerCase().startsWith('ccd'));
    }

    if (isCables) {
      // Return Control Cable warehouses, exclude Spoke/SPI warehouses
      const ccdWhs = pool.filter((w) => {
        const c = (w.warehouseCode || '').toLowerCase();
        const n = (w.name || '').toLowerCase();
        if (c.startsWith('spi') || n.includes('spi') || n.includes('spoke')) return false;
        if (w.divisionId === 'd1000000-0000-0000-0000-000000000002') return true;
        if (c.includes('ccd') || n.includes('cable')) return true;
        return !c.includes('spi');
      });
      return ccdWhs.length > 0 ? ccdWhs : pool.filter((w) => !(w.warehouseCode || '').toLowerCase().startsWith('spi'));
    }

    if (divId) {
      const match = pool.filter((w) => w.divisionId === divId);
      if (match.length > 0) return match;
    }

    return pool;
  }, [warehouses, lookups.warehouses, ctxIds.divisionId, lookups.divisions, qDivisionName, qMachineCode]);

  // ── Output Department & Destination Warehouses (OUT) ──
  // Resolves the output department for the current entry (Context Dept > Form Dept > First Item Dept)
  const outputDepartmentId = useMemo(() => {
    if (ctxIds.departmentId) return ctxIds.departmentId;
    if (departmentId) return departmentId;
    if (firstProdItemId) {
      const itm = lookups.items.find((i) => i.id === firstProdItemId);
      if (itm?.departmentId) return itm.departmentId;
    }
    return undefined;
  }, [ctxIds.departmentId, departmentId, firstProdItemId, lookups.items]);

  // Destination Finished Goods / Receipt Warehouse ("OUT") strictly filtered to the output department's warehouse
  const destinationWarehouses = useMemo(() => {
    if (!outputDepartmentId) {
      return divisionWarehouses;
    }

    // Direct match by warehouse.departmentId (set in DB and organization management)
    const deptWhs = divisionWarehouses.filter((w) => w.departmentId === outputDepartmentId);
    if (deptWhs.length > 0) {
      return deptWhs;
    }

    // Fallback: match by department code or name if departmentId is not yet assigned on the warehouse
    const deptObj = lookups.departments.find((d) => d.id === outputDepartmentId);
    const dCode = (deptObj?.departmentCode || '').toLowerCase();
    const dName = (deptObj?.name || '').toLowerCase();

    const matched = divisionWarehouses.filter((w) => {
      const wc = (w.warehouseCode || '').toLowerCase();
      const wn = (w.name || '').toLowerCase();
      if (dCode.includes('spd-dept001') || dName.includes('straight')) return wc.includes('st-') || wn.includes('straight');
      if (dCode.includes('spd-dept002') || dName.includes('swag')) return wc.includes('sw-') || wn.includes('swag');
      if (dCode.includes('spd-dept003') || (dName.includes('spoke') && !dName.includes('plat') && !dName.includes('pack'))) {
        return wc.includes('spk') || wc.includes('sp-') || wn.includes('spk') || wn.includes('spoke');
      }
      if (dCode.includes('spd-dept006') || dName.includes('plat')) return wc.includes('pl-') || wn.includes('plat');
      if (dCode.includes('spd-dept008') || dName.includes('pack') || dName.includes('disp')) {
        return wc.includes('fgdw') || wn.includes('dispatch') || wn.includes('pack');
      }
      if (dCode.includes('ccd-dept001') || dName.includes('flat')) return wc.includes('ft-') || wn.includes('flat');
      if (dCode.includes('ccd-dept002') || dName.includes('spiral')) return wc.includes('sp-') || wn.includes('spiral');
      if (dCode.includes('ccd-dept003') || dName.includes('pvc')) return wc.includes('pvc');
      if (dCode.includes('ccd-dept004') || dName.includes('pack')) return wc.includes('wh-001') || wn.includes('main');
      return false;
    });

    return matched.length > 0 ? matched : divisionWarehouses;
  }, [outputDepartmentId, divisionWarehouses, lookups.departments]);

  // DYNAMIC WAREHOUSE AUTO-SELECTION BY DIVISION / DEPARTMENT & MATERIAL FLOW.
  // Auto-populates both:
  //   · Source Raw Material Warehouse ("IN"): drawn from previous stage department or raw store
  //   · Destination / Receipt Warehouse ("OUT"): deposits into the current department's production store
  // Create mode only. Whatever THIS effect picks is remembered in a ref, so a
  // warehouse the operator chooses by hand is never overwritten.
  const autoWarehouseRef = useRef<{ raw?: string; receipt?: string }>({});

  useEffect(() => {
    if (mode !== 'create' || divisionWarehouses.length === 0) return;
    const warehouses = divisionWarehouses;

    const label = (name?: string, code?: string) => `${name ?? ''} ${code ?? ''}`.toLowerCase();

    const division = lookups.divisions.find((d) => d.id === ctxIds.divisionId);
    const divText = label(division?.name, division?.divisionCode);
    const isControlCable = divText.includes('control') || divText.includes('ccd');

    const department = lookups.departments.find((d) => d.id === ctxIds.departmentId);
    const deptText = label(department?.name, department?.departmentCode);

    // ── 1. Destination Finished Goods / Receipt Warehouse ("OUT") ──────────────────────
    let matchedReceiptWh: WarehouseLk | undefined;
    if (destinationWarehouses.length > 0) {
      matchedReceiptWh = destinationWarehouses[0];
    } else {
      if (deptText.includes('straight') || deptText.includes('st') || deptText.includes('spd-dept001')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('st') || w.warehouseCode === 'SPI-ST-001');
      } else if (deptText.includes('spoke') && !deptText.includes('plat') && !deptText.includes('pack')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('spk') || w.warehouseCode === 'SPI-SPK-003' || w.warehouseCode === 'SPI-SP-003');
      } else if (deptText.includes('swag') || deptText.includes('sw') || deptText.includes('spd-dept002')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('sw') || w.warehouseCode === 'SPI-SW-002');
      } else if (deptText.includes('plat') || deptText.includes('pl') || deptText.includes('spd-dept006') || deptText.includes('spd-dept007')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('pl') || w.warehouseCode === 'SPI-PL-004');
      } else if (deptText.includes('flatten') || deptText.includes('ft') || deptText.includes('ccd-dept001')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('ft') || w.warehouseCode === 'CCD-FT-001');
      } else if (deptText.includes('spiral') || deptText.includes('sp') || deptText.includes('ccd-dept002')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('sp') || w.warehouseCode === 'CCD-SP-002');
      } else if (deptText.includes('pvc') || deptText.includes('ccd-dept003')) {
        matchedReceiptWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('pvc') || w.warehouseCode === 'CCD-PVC-003');
      } else if (deptText.includes('pack') || deptText.includes('disp')) {
        matchedReceiptWh = isControlCable
          ? warehouses.find((w) => w.warehouseType === 'FINISHED_GOODS' && label(w.name, w.warehouseCode).includes('ccd'))
          : warehouses.find((w) => w.warehouseType === 'FINISHED_GOODS' && (label(w.name, w.warehouseCode).includes('dispatch') || label(w.name, w.warehouseCode).includes('spi')));
      }
    }

    const receiptCurrent = form.getFieldValue('warehouseId') as string | undefined;
    const receiptIsAuto = !receiptCurrent || receiptCurrent === autoWarehouseRef.current.receipt;
    if (matchedReceiptWh && (receiptIsAuto || !destinationWarehouses.some((w) => w.id === receiptCurrent))) {
      form.setFieldValue('warehouseId', matchedReceiptWh.id);
      autoWarehouseRef.current.receipt = matchedReceiptWh.id;
    }

    // ── 2. Source Raw Material Warehouse ("IN") ─────────────────────
    const selectedItem = lookups.items.find((i) => i.id === itemId);
    const inItem = selectedItem?.productionInItem || (selectedItem?.productionInItemId ? lookups.items.find((i) => i.id === selectedItem.productionInItemId) : null);
    let matchedRawWh: WarehouseLk | undefined;

    if (inItem) {
      const inItemId = (inItem as any)?.id;
      const fullInItem = inItemId ? lookups.items.find((i) => i.id === inItemId) : null;
      const inItemDeptId = (inItem as any)?.departmentId || fullInItem?.departmentId;
      const inItemDept = inItemDeptId ? lookups.departments.find((d) => d.id === inItemDeptId) : null;
      const inDeptText = label(inItemDept?.name, inItemDept?.departmentCode);
      if (inDeptText.includes('straight') || inDeptText.includes('st') || inItem.itemCode?.startsWith('WIP-ST')) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('st production') || w.warehouseCode === 'SPI-ST-001');
      } else if (inDeptText.includes('spoke') || inItem.itemCode?.startsWith('WIP-SP')) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('spk production') || w.warehouseCode === 'SPI-SP-003');
      } else if (inDeptText.includes('swag') || inDeptText.includes('sw') || inItem.itemCode?.startsWith('WIP-SW')) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('sw production') || w.warehouseCode === 'SPI-SW-002');
      } else if (inDeptText.includes('plat') || inDeptText.includes('pl') || inItem.itemCode?.startsWith('WIP-PL')) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('pl production') || w.warehouseCode === 'SPI-PL-004');
      } else if (
        selectedItem?.itemCode === 'WIP-CS-006' ||
        inDeptText.includes('flatten') || inDeptText.includes('ft') ||
        inItem.itemCode?.startsWith('WIP-FT') ||
        inItem.itemCode?.startsWith('FLAT-STRIP') ||
        inItem.itemCode?.includes('STRIP')
      ) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('ft production') || w.warehouseCode === 'CCD-FT-001');
      }
    }

    if (!matchedRawWh) {
      if (isControlCable) {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('ccd') && w.warehouseType === 'RAW_MATERIAL')
          || warehouses.find((w) => label(w.name, w.warehouseCode).includes('ccd warehouse'));
      } else {
        matchedRawWh = warehouses.find((w) => label(w.name, w.warehouseCode).includes('spi') && w.warehouseType === 'RAW_MATERIAL')
          || warehouses.find((w) => label(w.name, w.warehouseCode).includes('spi warehouse'))
          || warehouses.find((w) => w.warehouseType === 'RAW_MATERIAL');
      }
    }

    const rawCurrent = form.getFieldValue('rawMaterialWarehouseId') as string | undefined;
    const genericRawId = warehouses.find((w) => w.warehouseType === 'RAW_MATERIAL')?.id;
    const rawIsAuto = !rawCurrent || rawCurrent === autoWarehouseRef.current.raw || rawCurrent === genericRawId;
    if (matchedRawWh && rawIsAuto && matchedRawWh.id !== rawCurrent) {
      form.setFieldValue('rawMaterialWarehouseId', matchedRawWh.id);
      autoWarehouseRef.current.raw = matchedRawWh.id;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, divisionWarehouses, lookups.divisions, lookups.departments, lookups.items, ctxIds.divisionId, ctxIds.departmentId, itemId]);

  // Prefill the locked context coming from the machine-selection step. This
  // only feeds display helpers; the submit payload uses ctxIds above because
  // unregistered fields are NOT returned by antd's onFinish values.
  useEffect(() => {
    if (mode !== 'create') return;
    const patch: Record<string, unknown> = {
      postToInventory: true,
      downtimeEntries: [{ confirmed: false }],
    };
    if (qDate) {
      const queryDay = dayjs(qDate);
      if (queryDay.isValid()) {
        patch.entryDate = queryDay;
        // Mirror into the controlled state so the picker, ctxIds and payload
        // all resolve the same day as soon as the query context is applied.
        setFormDate(queryDay);
      }
    }
    if (qShiftId) patch.shiftId = qShiftId;
    if (qDivisionId) patch.divisionId = qDivisionId;
    if (qSectionId) patch.sectionId = qSectionId;
    if (qDepartmentId) patch.departmentId = qDepartmentId;
    form.setFieldsValue(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the pre-selected machine's code once its department list is loaded
  useEffect(() => {
    if (!lockedContext || lookups.machines.length === 0) return;
    const m = lookups.machines.find((x) => x.id === qMachineId);
    if (m && !form.getFieldValue('machineNo')) {
      form.setFieldValue('machineNo', m.machineCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookups.machines]);

  /** Ask the backend which ACTIVE Machine Target applies to machine+shift+date (+item scope). */
  const lastResolvedKeyRef = useRef<string>('');
  const resolveTarget = useCallback(async (
    machineId: string,
    mShiftId: string,
    productionDate: string,
    opts?: { itemId?: string },
  ) => {
    const key = `${machineId}:${mShiftId}:${productionDate}:${opts?.itemId ?? ''}`;
    if (lastResolvedKeyRef.current === key) return;
    lastResolvedKeyRef.current = key;
    setResolvingMt(true);
    setMtError(null);
    try {
      const res = await apiService.get<{ success: boolean; data: MachineTargetResolution }>(
        '/production/entries/machine-target',
        {
          machineId, shiftId: mShiftId, productionDate,
          ...(opts?.itemId ? { itemId: opts.itemId } : {}),
        },
      );
      setMtResolution(res.data);
      // The machine target's UOM is authoritative for the entry (server enforces it).
      if (res.data.uom?.id) form.setFieldValue('uomId', res.data.uom.id);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(axiosErr.response?.data?.message)
        ? axiosErr.response!.data!.message!.join(', ')
        : axiosErr.response?.data?.message ?? 'Failed to resolve the machine target';
      setMtError(String(msg));
    } finally {
      setResolvingMt(false);
    }
  }, [form]);

  // Create via machine selection: resolve as soon as the locked context is in place.
  useEffect(() => {
    if (mode === 'create' && lockedContext && qMachineId && qShiftId && qDate) {
      void resolveTarget(qMachineId, qShiftId, qDate, firstProdItemId ? { itemId: firstProdItemId } : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lockedContext, firstProdItemId]);

  useEffect(() => {
    if (!id || mode !== 'edit') return;
    void (async () => {
      console.log('ENTRY_LOAD_START:', { id, mode });
      setLoadingEntry(true);
      try {
        const res = await apiService.get<{ success: boolean } & { data: EntryDetailData & { productionOrder?: { id: string; orderNumber: string } } }>(`/production/entries/${id}`);
        const e = res.data;
        setEntry(e);
        // ── FIX 4 — snapshot what this document has ALREADY deducted ─────────
        // Read authoritative stock ledger movements for this entry if posted,
        // and combine with audit lines to capture every item already consumed.
        let loadedWarehouseId = e.warehouseId;
        const consumed: Record<string, number> = {};
        if ((e as any).inventoryReferenceId) {
          try {
            const ledgerRes = await apiService.get<{ data: any[] }>('/inventory/reports/ledger', {
              referenceId: e.id,
              referenceType: 'PRODUCTION_ENTRY',
            });
            const movements = ledgerRes.data || [];
            const receiptMov = movements.find((m: any) => m.transactionType === 'PRODUCTION_RECEIPT' && m.warehouseId);
            if (receiptMov?.warehouseId) {
              loadedWarehouseId = receiptMov.warehouseId;
            }
            for (const m of movements) {
              const k = String(m.itemId || m.item?.id || '');
              if (!k) continue;
              if (m.transactionType === 'PRODUCTION_CONSUMPTION' && m.direction === 'OUT') {
                consumed[k] = (consumed[k] ?? 0) + toNum(m.quantity);
              } else if (m.transactionType === 'PRODUCTION_REVERSAL' && m.direction === 'IN') {
                consumed[k] = Math.max(0, (consumed[k] ?? 0) - toNum(m.quantity));
              }
            }
          } catch {
            // fallback to entry audit lines below
          }

          const inputs = splitEntryItemLines((e as any).items).inputs;
          const inId = (e as any).item?.productionInItem?.id
            || (e as any).item?.productionInItemId
            || null;
          if (inputs.length > 0) {
            const audited = consumedQuantityFromAuditLines(inputs, inId);
            if (inId && audited !== null && audited > 0 && !consumed[String(inId)]) {
              consumed[String(inId)] = audited;
            }
            for (const line of inputs) {
              const key = String(line.itemId ?? '');
              if (!key) continue;
              if (!consumed[key]) {
                consumed[key] = Number(line.actualQuantity) || 0;
              }
            }
          } else if (Object.keys(consumed).length === 0) {
            const rawCode = String((e as any).item?.productionInItem?.baseUom?.code || '').toUpperCase();
            const basis = toNum((e as any).actualQuantity)
              + (rawCode.startsWith('K') ? toNum((e as any).scrapQuantity) : 0);
            if (inId && basis > 0) consumed[String(inId)] = basis;
          }
        }
        setEntryConsumedByItem(consumed);

        void lookups.loadMachines(e.departmentId);
        if (e.productionOrderId) {
          try {
            const od = await apiService.get<OrderDetail>(`/production/orders/${e.productionOrderId}`);
            setOrderDetail(od);
          } catch { /* order may be inaccessible */ }
        }

        form.setFieldsValue({
          id: e.id,
          // Edit mode hydrates the STORED date (never the new-form default);
          // a malformed legacy value falls back to the previous-day default
          // instead of seeding an invalid/empty picker.
          entryDate:
            e.entryDate && dayjs(e.entryDate).isValid() ? dayjs(e.entryDate) : defaultProductionEntryDate(),
          divisionId: e.divisionId, sectionId: e.sectionId, departmentId: e.departmentId,
          shiftId: e.shiftId ?? undefined,
          machineNo: e.machineNo,
          operatorName: e.operatorName,
          supervisorName: e.supervisorName ?? undefined,
          coilSize: (e as any).coilSize ?? undefined,
          itemId: e.itemId,
          uomId: e.uomId,
          targetQuantity: toNum(e.targetQuantity),
          actualQuantity: toNum(e.actualQuantity),
          runningHours: toNum(e.runningHours),
          overtimeHours: entryOvertimeHours(e as any),
          scrapQuantity: toNum(e.scrapQuantity),
          processScrapKg: toNum(e.processScrapKg ?? 0),
          remarks: stripRejectionRemarks(e.remarks),
          rejectionRemarks: extractRejectionRemarks(e.remarks),
          productionOrderId: e.productionOrderId ?? undefined,
          productionOrderOperationId: e.productionOrderOperationId ?? undefined,
          postToInventory: !!e.inventoryReferenceId,
          warehouseId: loadedWarehouseId ?? undefined,
          rawMaterialWarehouseId: (e as any).rawMaterialWarehouseId ?? undefined,
      productionItems: (() => {
        const outputs = splitEntryItemLines((e as any).items).outputs;
        const entryLevelScrap = toNum((e as any).scrapQuantity);
        const lineScrapTotal = outputs.reduce((s: number, it: any) => s + toNum(it.scrapQuantity), 0);
        const seed = (entryLevelScrap > 0 && lineScrapTotal <= 0) ? entryLevelScrap : 0;
        if (outputs.length > 0) {
          return outputs.map((it: any, idx: number) => ({
            id: it.id,
            lineNumber: it.lineNumber,
            itemId: it.itemId,
            uomId: it.uomId,
            targetQuantity: toNum(it.targetQuantity),
            actualQuantity: toNum(it.actualQuantity),
            scrapQuantity: toNum(it.scrapQuantity) + (idx === 0 ? seed : 0),
            runningHours: toNum(it.runningHours),
            routingCode: it.routingCode ?? undefined,
            remarks: it.remarks ?? undefined,
          }));
        }
        // Fallback for single-item entries where production_entry_items has no output rows
        // so the edit form NEVER opens with empty items or resets figures to 0!
        if (e.itemId) {
          return [{
            lineNumber: 1,
            itemId: e.itemId,
            uomId: e.uomId,
            targetQuantity: toNum(e.targetQuantity),
            actualQuantity: toNum(e.actualQuantity),
            scrapQuantity: toNum(e.scrapQuantity),
            runningHours: toNum(e.runningHours),
          }];
        }
        return [];
      })() ?? [],
      downtimeEntries: (e as any).downtimes?.map((dt: any) => ({
        id: dt.id,
        lineNumber: dt.lineNumber,
        downtimeReasonId: dt.downtimeReasonId ?? dt.downtimeReason?.id ?? undefined,
        downtimeReason: dt.downtimeReasonText ?? (typeof dt.downtimeReason === 'string' ? dt.downtimeReason : dt.downtimeReason?.reasonName || dt.downtimeReason?.name || dt.downtimeReason?.description) ?? undefined,
        downtimeHours: toNum(dt.downtimeHours),
        remarks: dt.remarks ?? undefined,
        confirmed: true,
      })) ?? [],
    });
        const loadedScrap = toNum(e.scrapQuantity);
        const loadedReason = extractRejectionRemarks(e.remarks) || '';
        if (loadedScrap > 0 || loadedReason) {
          const itemW = toNum((e as any).item?.weightPerPiece);
          const effW = itemW > 0 ? itemW : 1.0;
          const calcPcs = Math.round((loadedScrap / effW) * 100) / 100;
          setRejectionRows([
            {
              id: 'rej-init',
              kg: loadedScrap > 0 ? loadedScrap : null,
              pcs: calcPcs > 0 ? calcPcs : null,
              reason: loadedReason,
            },
          ]);
        }
      } catch (err) {
        console.error('ENTRY_LOAD_ERROR:', err);
        message.error('Failed to load production entry');
      } finally {
        console.log('ENTRY_LOAD_FINALLY');
        setLoadingEntry(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mode]);

  // Edit + machine-linked: resolve the governing target for this entry's facts.
  useEffect(() => {
    if (mode === 'edit' && entry?.machineId && entry.shiftId && entry.entryDate) {
      void resolveTarget(entry.machineId, entry.shiftId, entry.entryDate.slice(0, 10), { itemId: entry.itemId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entry?.machineId, entry?.shiftId, entry?.entryDate]);

  // PROMPT-11: item-scoped targets — when the operator picks an Item on a
  // machine-linked entry, re-resolve so an item-specific target takes
  // precedence over the generic one resolved before any item was selected.
  useEffect(() => {
    const mId = mode === 'edit' ? entry?.machineId : ctxIds.machineId;
    const sId = mode === 'edit' ? entry?.shiftId ?? entry?.shift?.id : ctxShiftId;
    const d = mode === 'edit' ? entry?.entryDate?.slice(0, 10) : ctxIds.entryDate;
    // The FIRST production item is the authoritative target item — the second
    // item must never replace Item 1's target (no averaging).
    const targetItemId = firstProdItemId ?? itemId;
    if (!machineLinked || !targetItemId || !mId || !sId || !d) return;
    void resolveTarget(mId, sId, d, { itemId: targetItemId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstProdItemId, itemId, machineLinked, ctxIds.machineId, ctxShiftId, ctxIds.entryDate]);

  useEffect(() => {
    if (mode === 'create' && departmentId) {
      void lookups.loadMachines(departmentId as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  // default UOM from item (manual/non-linked flow only) — the top-level itemId
  // is derived from production items, so use the primary item.
  useEffect(() => {
    if (!itemId || mode !== 'create' || machineLinked) return;
    const item = lookups.items.find((i) => i.id === itemId);
    if (item?.baseUomId) form.setFieldValue('uomId', item.baseUomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, machineLinked]);

  // ── Derive top-level itemId + UOM from the first production item ───────
  // The backend requires `itemId` at the entry level. The user selects items
  // in the Production Items rows — derive from the first row.
  useEffect(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string; uomId?: string }>;
    const first = items.find((it) => !!it.itemId);
    if (first?.itemId) {
      if (form.getFieldValue('itemId') !== first.itemId) {
        form.setFieldValue('itemId', first.itemId);
      }
      const item = lookups.items.find((i) => i.id === first.itemId);
      const uom = first.uomId || item?.baseUomId;
      if (uom && form.getFieldValue('uomId') !== uom) {
        form.setFieldValue('uomId', uom);
      }
      if (item?.wireSizeMm != null && !form.getFieldValue('coilSize')) {
        form.setFieldValue('coilSize', `${formatDimension(item.wireSizeMm)} mm`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionItemsWatch]);

  const loadOrderOperations = async (orderId: string) => {
    setOrderDetail(null);
    if (!orderId) return;
    try {
      const od = await apiService.get<OrderDetail>(`/production/orders/${orderId}`);
      setOrderDetail(od);
      if (!machineLinked) form.setFieldValue('uomId', od.uomId || undefined);
    } catch {
      message.warning('Could not load order details');
    }
  };

  // ── Planned hours & derived figures ────────────────────────────────────────
  const plannedHours = useMemo(() => {
    const src: ShiftInfo | undefined =
      mode === 'edit'
        ? entry?.shift ?? lookups.shifts.find((s) => s.id === ctxShiftId)
        : lookups.shifts.find((s) => s.id === ctxShiftId);
    return toNum(src?.plannedHours, 0);
  }, [mode, entry?.shift, lookups.shifts, ctxShiftId]);

  const is12HourShift = plannedHours >= 12;
  const regularShiftHours = is12HourShift ? 8 : (plannedHours > 0 ? plannedHours : 8);

  // Total AVAILABLE hours = shift duty hours + overtime (8h duty + 4h OT = 12h).
  // A 12-hour shift represents standard 8h duty + 4h built-in OT (total 12h gross, NOT 16h!).
  // Any extra overtime beyond 4h (e.g. 5h OT) increases total available (8h + 5h = 13h).
  // For an 8-hour shift, regular duty is 8h with 0 default OT (total 8h + manual OT).
  const totalAvailableHours = is12HourShift ? (8 + overtimeHours) : (plannedHours + overtimeHours);

  // ── Downtime entry mode: AUTO (Running is input, Downtime derived) or
  //    MANUAL (Downtime entries are input, Running derived). Both keep the
  //    invariant Running + Downtime = Planned shift hours whenever a plan is
  //    configured. When no shift planned hours exist (legacy entries), both
  //    fields remain free-form so nothing regresses.
  const [downtimeMode, setDowntimeMode] = useState<DowntimeMode>('auto');
  const hoursInitRef = useRef(false);
  // "+ Add Production Item" lives in the section header (Card extra); the actual
  // Form.List `add` is only exposed inside its render slot, so it is captured
  // into this ref for the header button to trigger.
  const addProductionItemRef = useRef<() => void>(() => {});
  // "+ Add Downtime" likewise lives in the Downtime card header (Card extra);
  // the Form.List `add` is captured here.
  const addDowntimeRef = useRef<() => void>(() => {});

  // Total downtime = sum of all downtime line hours (from the Form.List)
  const totalDowntime = useMemo(() => {
    const entries = (downtimeEntriesWatch ?? []) as Array<{ downtimeHours?: number | string }>;
    return sumDowntimeLines(entries);
  }, [downtimeEntriesWatch]);

  // AUTO: running hours is the operator's input → downtime = planned − running
  const setHoursFromRunning = useCallback((v: number | null | undefined) => {
    const effectivePlan = totalAvailableHours > 0 ? totalAvailableHours : plannedHours;
    const derived = deriveFromRunning(v, effectivePlan, totalDowntime);
    if (Number.isNaN(derived.runningHours)) return;
    form.setFieldsValue({ runningHours: derived.runningHours });
  }, [form, totalAvailableHours, plannedHours, totalDowntime]);

  // MANUAL: total downtime from lines → running = totalAvailable − totalDowntime
  // Called whenever any downtime line hours change.
  const setRunningFromDowntimeLines = useCallback((total: number) => {
    if (totalAvailableHours > 0) {
      const clamped = round2(Math.max(0, Math.min(totalAvailableHours, total)));
      form.setFieldsValue({ runningHours: round2(Math.max(0, totalAvailableHours - clamped)) });
    }
  }, [form, totalAvailableHours]);

  // Switching AUTO ↔ MANUAL preserves the current split and keeps the pair
  // consistent with the shift plan.
  const handleDowntimeModeChange = useCallback((next: DowntimeMode) => {
    setDowntimeMode(next);
    if (next === 'manual') {
      // Switching to MANUAL: running hours is derived from total downtime lines
      setRunningFromDowntimeLines(totalDowntime);
    } else {
      // Switching to AUTO: downtime lines are informational breakdown only
      // running hours is the input, derive from current state
      const targetCapacity = totalAvailableHours > 0 ? totalAvailableHours : plannedHours;
      const pair = rebalancePair(
        toNum(form.getFieldValue('runningHours')),
        totalDowntime,
        targetCapacity,
        next,
      );
      form.setFieldsValue({ runningHours: pair.runningHours });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalAvailableHours, plannedHours, totalDowntime, setRunningFromDowntimeLines]);

  // First derivation + shift changes. When planned hours first become known, a
  // fresh create starts at full running / zero downtime while an edit keeps its
  // loaded split. On a later planned-hours change (shift switch) the pair is
  // rebalanced around the new plan while respecting the active entry mode.
  useEffect(() => {
    if (!(plannedHours > 0)) return;
    const is12h = plannedHours >= 12;
    const defaultOt = is12h ? 4 : 0;

    if (!hoursInitRef.current) {
      hoursInitRef.current = true;
      if (mode === 'create') {
        form.setFieldsValue({
          overtimeHours: defaultOt,
          runningHours: round2(plannedHours),
        });
      }
      return;
    }

    if (mode === 'create') {
      const currentOt = toNum(form.getFieldValue('overtimeHours'));
      if (is12h && currentOt === 0) {
        form.setFieldsValue({ overtimeHours: 4 });
      } else if (!is12h && currentOt === 4) {
        form.setFieldsValue({ overtimeHours: 0 });
      }
    }

    if (downtimeMode === 'manual') {
      setRunningFromDowntimeLines(totalDowntime);
    } else {
      const targetCapacity = is12h ? (8 + toNum(form.getFieldValue('overtimeHours'), defaultOt)) : plannedHours;
      const pair = rebalancePair(
        toNum(form.getFieldValue('runningHours')),
        totalDowntime,
        targetCapacity,
        downtimeMode,
      );
      form.setFieldsValue({ runningHours: pair.runningHours });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedHours]);

  // ── STEP 3 — REBIND THE PERSISTED HOURS AFTER THE FORM MOUNTS ────────────
  // The whole form body is gated behind `!loadingEntry`, so the very first
  // `setFieldsValue` in the load effect lands while every hours field is still
  // unmounted. `Form.Item name="overtimeHours"` carries `initialValue={0}` and
  // re-registers the field at 0 the instant it mounts, silently discarding the
  // hydrated value — which collapses Total Available from 10h (8h shift + 2h
  // OT) back to the bare 8h shift and re-derives Running as 8 − 2 = 6h.
  // Re-applying the saved pair exactly once, post-mount, pins it: nothing here
  // ever re-derives, it only restores what the document already records.
  const hoursRebindRef = useRef(false);
  useEffect(() => {
    if (mode !== 'edit') return;
    if (loadingEntry || !entry) return;
    if (hoursRebindRef.current) return;
    hoursRebindRef.current = true;
    form.setFieldsValue({
      runningHours: toNum((entry as any).runningHours),
      overtimeHours: entryOvertimeHours(entry as any),
    });
  }, [mode, loadingEntry, entry, form]);

  // ── FIX 3 — RUNNING HOURS IS A PERSISTED FACT ON REOPEN ───────────────────
  // `entryHoursBaselineRef` records the downtime total the saved document was
  // hydrated with, so the "Total Available − Downtime" deduction below can
  // never run against an untouched edit. Re-deriving during hydration deducted
  // the SAME downtime repeatedly on every reopen (8h → 6h → 4h). Only a real
  // change to the downtime lines, made by the operator, may re-derive.
  const entryHoursBaselineRef = useRef<number | null>(null);

  // When downtime entries change in MANUAL mode or whenever downtime is entered, re-derive running hours.
  useEffect(() => {
    if (!(plannedHours > 0)) return;
    if (mode === 'edit') {
      // Still loading the persisted row → nothing to derive from yet.
      if (loadingEntry || !entry) return;
      // First run after hydration: latch the saved pair and stop.
      if (entryHoursBaselineRef.current === null) {
        entryHoursBaselineRef.current = totalDowntime;
        return;
      }
      // Unchanged downtime → the stored running hours are the fact on record.
      if (totalDowntime === entryHoursBaselineRef.current) return;
    }
    setRunningFromDowntimeLines(totalDowntime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDowntime, downtimeMode, plannedHours, overtimeHours, setRunningFromDowntimeLines]);

  const derivedRunning = effectiveRunning(toNum(runningHours), totalDowntime, plannedHours, overtimeHours);
  const derivedDowntime = effectiveDowntime(toNum(runningHours), totalDowntime, plannedHours, overtimeHours);

  // Full-shift downtime (e.g. 8h Power Outage, Maintenance, No Material when planned hours = 8h)
  const isFullDowntime = Boolean(
    plannedHours > 0 &&
    totalDowntime >= plannedHours - 0.05 &&
    toNum(derivedRunning) <= 0.05
  );

  // When a shift plan exists, AUTO keeps downtime read-only and MANUAL keeps
  // running read-only. Without a plan both stay free-form (legacy behaviour).
  const runningReadOnly = plannedHours > 0 && downtimeMode === 'manual';

  /** Target shown for a machine-linked entry: standard target pro-rated to the
   *  actual running hours — identical to what the server stores on save. */
  const displayTarget = useMemo(() => {
    if (!machineLinked) return null;
    if (mtResolution && mtResolution.standardHours > 0) {
      return prorateTarget(mtResolution.standardTarget, mtResolution.standardHours, derivedRunning);
    }
    if (mode === 'edit' && entry?.targetQuantity != null) {
      return toNum(entry.targetQuantity);
    }
    return null;
  }, [machineLinked, mtResolution, derivedRunning, mode, entry?.targetQuantity]);

  /**
   * BASELINE HOURLY FACTOR — Standard Target ÷ standard shift hours (8h),
   * straight from the Target Master record resolved by ERP-00016/ERP-00018.
   * This is the per-hour number the pro-rated total is built from, and it is
   * hydrated as a sub-text line under EVERY target read-out on the form:
   *   PANEL A — the "Target" tile in the top KPI metric row
   *   PANEL B — the "Target Production" cell of the calibration card
   *   PANEL C — the Target cell of the Production Items Totals card
   * so the operator sees the basis before submitting.
   */
  const targetRatePerHour = useMemo(() => {
    if (mtResolution) {
      if (mtResolution.standardHours > 0 && mtResolution.standardTarget > 0) {
        return mtResolution.standardTarget / mtResolution.standardHours;
      }
      if (mtResolution.targetPerHour != null && mtResolution.targetPerHour > 0) {
        return mtResolution.targetPerHour;
      }
    }
    return null;
  }, [mtResolution]);

  /** Canonical sub-text line rendered under all three target cells. */
  const targetRateLabel = targetRatePerHour !== null
    ? `Target Rate: ${formatNumber(targetRatePerHour, 1)} /h`
    : 'Target Rate: —';

  /**
   * Target value shown by the summary panels: the pro-rated machine-linked
   * figure when a Target Master applies, otherwise the manually typed one.
   */
  const summaryTarget = useMemo(() => {
    if (machineLinked) return displayTarget;
    if (targetQty === undefined || targetQty === null || targetQty === '') return null;
    const n = toNum(targetQty);
    return Number.isFinite(n) ? n : null;
  }, [machineLinked, displayTarget, targetQty]);

  const efficiency = useMemo(() => {
    // FIX — efficiency is running ÷ TOTAL AVAILABLE hours (shift + overtime),
    // the same denominator the server writes on save. The old code divided by
    // the bare shift plan, so a 10h run on an 8h+4h OT slot reported the
    // impossible 125.00%; against the full 12h slot it is 83.33%.
    if (plannedHours > 0) return Math.round((derivedRunning / totalAvailableHours) * 10000) / 100;
    // No shift plan (legacy free-form entries): fall back to running vs
    // running + downtime, unchanged.
    const denom = derivedRunning + totalDowntime;
    return denom > 0 ? Math.round((derivedRunning / denom) * 10000) / 100 : null;
  }, [derivedRunning, totalDowntime, plannedHours, totalAvailableHours]);



  // ── Department-based item filtering ────────────────────────────────────────
  // Items available in the Production Items row dropdowns are scoped to the
  // selected Department — matching Item.departmentId. No department selected →
  // show all items (legacy behaviour preserved).
  const effectiveDeptId = useMemo(() => {
    const d = ctxIds.departmentId;
    return (typeof d === 'string' && d.length > 0) ? d : (typeof departmentId === 'string' && departmentId.length > 0 ? departmentId : undefined);
  }, [ctxIds.departmentId, departmentId]);

  useEffect(() => {
    if (effectiveDeptId) {
      void lookups.loadDepartmentItems(effectiveDeptId, 'WORK_IN_PROGRESS,RAW_MATERIAL,WIP,RM');
      void lookups.loadEmployeesForDepartment(effectiveDeptId);
    }
  }, [effectiveDeptId, lookups.loadDepartmentItems, lookups.loadEmployeesForDepartment]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Production Entry Output Item Filter:
   * Production entry form dropdown must strictly satisfy:
   * 1. Filter by Department: ONLY show items belonging to currently selected department.
   * 2. Filter by Item Type: Strictly restrict to 'WIP' (Work in Process) or 'RM' (Raw Material).
   * 3. Exclusion: Strictly exclude all other item types (breakers, tools, machinery parts, etc.)
   *    or items from any other departments.
   */
  const isProductionItem = useCallback((i: any, targetDeptId?: string): boolean => {
    if (!i) return false;

    // 1. Department match: must belong to the active department
    if (targetDeptId) {
      const itemDeptId = i.departmentId ?? i.department?.id;
      if (itemDeptId && itemDeptId !== targetDeptId) {
        return false;
      }
    }

    const name = (i.name || '').toUpperCase().trim();
    const code = (i.itemCode || i.code || '').toUpperCase().trim();
    const type = (i.itemType || i.type || '').toUpperCase().trim();

    // 2. Strict exclusions: exclude electrical, tools, equipment, spare parts, consumables, etc.
    const excludedTypes = [
      'ELECTRICAL', 'EQUIPMENT', 'TOOL', 'TOOLS', 'TOOLING',
      'SPARE_PART', 'SPARE', 'MECH_SPARE', 'CONSUMABLE',
      'ASSET', 'SERVICE', 'MAINTENANCE', 'PACKAGING_MATERIAL',
      'STATIONERY', 'STATIONERY_TAG', 'SANITARY_FITTING', 'SANITARY_FITTINGS',
      'BOBBIN', 'CHAIN', 'SEAL', 'LAB', 'MECH_FITTINGS', 'CHEMICAL', 'BEARING', 'BELT', 'OTHER',
    ];
    if (excludedTypes.includes(type)) {
      return false;
    }

    const excludedKeywords = [
      'PUNCH', 'BREAKER', 'MCB', 'MCCB', 'BEARING', 'GREASE', 'DIES', 'DIE',
      'FUSE', 'RELAY', 'CONTACTOR', 'SWITCH', 'ROLLER PIN', 'CUTTER BLOCK',
      'ARM (', 'ARM SMALL', 'ARM LARGE', 'TONG ARM', 'HEADING ARM', 'HEADING BODY'
    ];
    if (excludedKeywords.some((kw) => name.includes(kw) || code.includes(kw))) {
      return false;
    }

    // 3. Strict inclusion: Item Type must be WIP or RM
    const isWip = type === 'WORK_IN_PROGRESS' || type === 'WIP' || code.startsWith('WIP-');
    const isRm = type === 'RAW_MATERIAL' || type === 'RM' || code.startsWith('RM-');

    return isWip || isRm;
  }, []);

  const departmentItems = useMemo(() => {
    if (!effectiveDeptId) {
      return [];
    }
    let pool: ItemLk[] = [];
    const cachedDept = lookups.deptItemsMap[effectiveDeptId];
    if (cachedDept && cachedDept.length > 0) {
      pool = cachedDept;
    } else {
      pool = lookups.items.filter((i) => (i.departmentId ?? (i as any)?.department?.id) === effectiveDeptId);
    }

    // Filter strictly to WIP and RM belonging to the active department
    return pool.filter((i) => isProductionItem(i, effectiveDeptId));
  }, [effectiveDeptId, lookups.deptItemsMap, lookups.items, isProductionItem]);

  // ── Machine Target Items: Load active target configurations for this machine
  //    so the item dropdown prioritizes/scopes to items designated for this machine.
  const [machineTargets, setMachineTargets] = useState<any[]>([]);
  useEffect(() => {
    const mId = mode === 'edit' ? entry?.machineId : ctxIds.machineId;
    if (!mId) {
      setMachineTargets([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const res = await apiService.get<{ data: any[] }>('/production/machine-targets', {
          machineId: mId,
          status: 'ACTIVE',
          limit: 100,
        });
        if (active) {
          setMachineTargets(res.data || []);
        }
      } catch {
        // fallback
      }
    })();
    return () => { active = false; };
  }, [mode, entry?.machineId, ctxIds.machineId]);

  const machineTargetItems = useMemo(() => {
    if (!machineTargets.length) return [];
    const seen = new Set<string>();
    const result: ItemLk[] = [];
    for (const mt of machineTargets) {
      const itId = mt.itemId || mt.item?.id;
      if (!itId || seen.has(itId)) continue;
      seen.add(itId);
      const full = departmentItems.find((i) => i.id === itId)
        || lookups.items.find((i) => i.id === itId && (i.departmentId ?? (i as any)?.department?.id) === effectiveDeptId);
      if (full && isProductionItem(full, effectiveDeptId)) {
        result.push(full);
      } else if (mt.item && isProductionItem(mt.item, effectiveDeptId)) {
        result.push({
          id: mt.item.id,
          itemCode: mt.item.code || mt.item.itemCode,
          name: mt.item.name,
          itemType: mt.item.itemType || mt.item.type,
          departmentId: mt.item.departmentId ?? effectiveDeptId,
          baseUomId: mt.item.baseUomId || mt.uomId,
          wireSizeMm: mt.item.wireSizeMm ?? null,
          isManufacturable: true,
        } as any);
      }
    }
    return result;
  }, [machineTargets, departmentItems, lookups.items, effectiveDeptId, isProductionItem]);

  const selectedItem = useMemo(
    () => (machineTargetItems.find((i) => i.id === itemId)) || departmentItems.find((i) => i.id === itemId) || lookups.items.find((i) => i.id === itemId) || null,
    [machineTargetItems, departmentItems, lookups.items, itemId],
  );

  // ── Primary item = first production item (historically used for the legacy
  //    single-item KG strip). The first production item is also the authoritative
  //    item for the target / top-level itemId derivation.
  const primaryItem = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    const first = items.find((it) => !!it.itemId);
    if (first?.itemId) {
      return (machineTargetItems.find((i) => i.id === first.itemId))
        || departmentItems.find((i) => i.id === first.itemId)
        || lookups.items.find((i) => i.id === first.itemId)
        || null;
    }
    return selectedItem;
  }, [productionItemsWatch, machineTargetItems, departmentItems, lookups.items, selectedItem]);

  // Auto-fill Coil Size from primary item's Wire Size (Wire Size == Coil Size)
  const lastAutoCoilRef = useRef<string | null>(null);
  useEffect(() => {
    const effectiveWire = primaryItem?.wireSizeMm ?? (primaryItem?.id ? rawMaterialData[primaryItem.id]?.wireSizeMm : null);
    if (effectiveWire != null) {
      const wireSizeStr = `${formatDimension(effectiveWire)} mm`;
      const currentCoil = form.getFieldValue('coilSize');
      if (!currentCoil || currentCoil === lastAutoCoilRef.current) {
        form.setFieldValue('coilSize', wireSizeStr);
        lastAutoCoilRef.current = wireSizeStr;
      }
    }
  }, [primaryItem, rawMaterialData, form]);

  // ── Auto-calibrate 100% Downtime Shift (e.g. 8h Power Outage, Maintenance, No Material) ──
  // When total downtime equals planned shift hours and running hours is 0,
  // there is no shop floor production: auto-fill scrap to 0, item quantity to 0,
  // and ensure an item row exists so onFinish payload satisfies the backend contract.
  useEffect(() => {
    if (!isFullDowntime) return;
    if (mode === 'edit') return; // NEVER reset quantities to zero when editing an existing saved entry

    // 1. Auto-fill scrap quantity to 0 if not entered
    const currentScrap = form.getFieldValue('scrapQuantity');
    if (currentScrap === undefined || currentScrap === null || currentScrap === '') {
      form.setFieldValue('scrapQuantity', 0);
    }

    // 2. Ensure running hours is 0
    if (toNum(form.getFieldValue('runningHours')) !== 0) {
      form.setFieldValue('runningHours', 0);
    }

    // 3. Ensure production items have quantity 0
    const currentItems = form.getFieldValue('productionItems');
    if (Array.isArray(currentItems) && currentItems.length > 0) {
      let changed = false;
      const patched = currentItems.map((item) => {
        if (item && (item.actualQuantity === undefined || item.actualQuantity === null || item.actualQuantity === '')) {
          changed = true;
          return { ...item, actualQuantity: 0 };
        }
        return item;
      });
      if (changed) {
        form.setFieldValue('productionItems', patched);
      }
    } else if (departmentItems.length > 0) {
      const defaultItem = departmentItems[0];
      const targetUomId = (machineLinked && mtResolution?.uom?.id) ? mtResolution.uom.id : defaultItem.baseUomId;
      form.setFieldValue('productionItems', [
        {
          lineNumber: 1,
          itemId: defaultItem.id,
          uomId: targetUomId,
          actualQuantity: 0,
          targetQuantity: 0,
          scrapQuantity: 0,
          runningHours: 0,
        },
      ]);
    }
  }, [isFullDowntime, form, departmentItems, machineLinked, mtResolution]);

  // Ensure at least 1 production item row is always open by default on create,
  // and auto-selects the machine target item (or first department item) once loaded.
  useEffect(() => {
    if (mode !== 'create') return;
    const current = form.getFieldValue('productionItems');
    const firstRowMissingItem = !current || !Array.isArray(current) || current.length === 0 || !current[0]?.itemId;
    if (firstRowMissingItem && (machineTargetItems.length > 0 || departmentItems.length > 0)) {
      const resolvedTargetItemId = mtResolution?.item?.id;
      const defaultItem = (resolvedTargetItemId && (
        machineTargetItems.find((i) => i.id === resolvedTargetItemId) ||
        departmentItems.find((i) => i.id === resolvedTargetItemId) ||
        lookups.items.find((i) => i.id === resolvedTargetItemId)
      )) || machineTargetItems[0] || departmentItems[0];

      if (!defaultItem) return;
      const targetUomId = (machineLinked && mtResolution?.uom?.id) ? mtResolution.uom.id : defaultItem.baseUomId;
      const existing0 = (Array.isArray(current) && current[0]) || {};
      form.setFieldValue('productionItems', [
        {
          lineNumber: 1,
          itemId: defaultItem.id,
          uomId: existing0.uomId || targetUomId,
          actualQuantity: existing0.actualQuantity ?? (isFullDowntime ? 0 : undefined),
          targetQuantity: existing0.targetQuantity ?? (isFullDowntime ? 0 : undefined),
          scrapQuantity: existing0.scrapQuantity ?? (isFullDowntime ? 0 : undefined),
          runningHours: existing0.runningHours ?? (isFullDowntime ? 0 : undefined),
        },
        ...((Array.isArray(current) && current.length > 1) ? current.slice(1) : []),
      ]);
      if (!form.getFieldValue('itemId')) {
        form.setFieldValue('itemId', defaultItem.id);
      }
    }
  }, [mode, machineTargetItems, departmentItems, machineLinked, mtResolution, isFullDowntime, form, lookups.items]);

  const operatorOptions = useMemo(() => {
    const list = lookups.employeesForDepartment(effectiveDeptId);
    const opts = list.map((e) => {
      const name = lookups.employeeFullName(e);
      const codePart = e.employeeCode ? ` (${e.employeeCode})` : '';
      const titlePart = e.jobTitle ? ` · ${e.jobTitle}` : '';
      return {
        value: name,
        label: `${name}${codePart}${titlePart}`,
      };
    });
    if (operatorWatch && !opts.some((o) => o.value.toLowerCase() === String(operatorWatch).toLowerCase())) {
      opts.unshift({
        value: String(operatorWatch),
        label: `${operatorWatch} (Manual / Assigned)`,
      });
    }
    return opts;
  }, [lookups, effectiveDeptId, operatorWatch]);

  // TASK #29 authoritative Rejection Weight: derived ONLY from the visible
  // "Rejection / Scrap" Production Figures input (scrapQty) × the item's own
  // weight/master-data conversion (courtesy of the shared lineToKg helper). It
  // deliberately does NOT read rejection from the production-item row internals,
  // so the KPI always mirrors what the operator actually typed. Null → 0.
  // The UOM family is taken from the primary production item's row UOM (or the
  // top-level UOM) so WEIGHT items are NOT re-converted against weightPerMeter —
  // the exact same KG model the Production Weight KPI uses (TASK #31 §6).
  const primaryUomType = useMemo(() => {
    const rows = (productionItemsWatch ?? []) as Array<{ itemId?: string; uomId?: string }>;
    const first = rows.find((it) => !!it.itemId);
    const uomIdForType = first?.uomId ?? uomId ?? primaryItem?.baseUomId;
    const foundUom = lookups.uoms.find((u) => u.id === uomIdForType);
    if (foundUom?.uomType) return foundUom.uomType;
    if (foundUom?.code === 'KG' || primaryItem?.baseUom?.code === 'KG') return 'WEIGHT';
    if (foundUom?.code === 'M' || foundUom?.code === 'METER' || primaryItem?.baseUom?.code === 'M' || primaryItem?.baseUom?.code === 'METER') return 'LENGTH';
    return null;
  }, [productionItemsWatch, uomId, primaryItem, lookups.uoms]);

  const scrapWeightKg = useMemo(() => {
    // Rejection / Scrap is entered directly in KG (weighed on shop floor scales)
    return round2(toNum(scrapQty));
  }, [scrapQty]);

  // Collect all distinct item IDs from the active form lines & selected item
  const watchedItemIds = useMemo(() => {
    const ids = new Set<string>();
    if (primaryItem?.id) ids.add(primaryItem.id);
    const rows = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    rows.forEach((r) => { if (r?.itemId) ids.add(r.itemId); });
    const topId = form.getFieldValue('itemId') || itemId;
    if (topId) ids.add(topId);
    return Array.from(ids).filter(Boolean);
  }, [primaryItem?.id, productionItemsWatch, form, itemId]);

  // Load authoritative item master attributes directly from backend API for all active items.
  // Re-validates on item selection change, on window focus (e.g. returning after editing Item Master in another tab),
  // and upon receiving 'erp-item-updated' event.
  const fetchAuthoritativeItems = useCallback((targetIds: string[]) => {
    targetIds.forEach((id) => {
      if (!id) return;
      apiService.get<{ data?: ItemLk; success?: boolean }>(`/master-data/items/${id}`, undefined, { silent: true })
        .then((res: any) => {
          const itemData = res?.data || res;
          if (itemData && itemData.id) {
            setExtraItemDetails((prev) => {
              const current = prev[id];
              if (
                current &&
                current.weightPerMeter === itemData.weightPerMeter &&
                current.weightPerPiece === itemData.weightPerPiece &&
                current.piecesPerKg === itemData.piecesPerKg &&
                current.wireSizeMm === itemData.wireSizeMm &&
                current.baseUomId === itemData.baseUomId
              ) {
                return prev;
              }
              return { ...prev, [id]: itemData };
            });
          }
        })
        .catch(() => {});
    });
  }, []);

  useEffect(() => {
    if (watchedItemIds.length > 0) {
      fetchAuthoritativeItems(watchedItemIds);
    }
  }, [watchedItemIds, fetchAuthoritativeItems]);

  useEffect(() => {
    const handleRevalidate = () => {
      if (watchedItemIds.length > 0) {
        fetchAuthoritativeItems(watchedItemIds);
      }
    };
    window.addEventListener('focus', handleRevalidate);
    window.addEventListener('erp-item-updated', handleRevalidate);
    return () => {
      window.removeEventListener('focus', handleRevalidate);
      window.removeEventListener('erp-item-updated', handleRevalidate);
    };
  }, [watchedItemIds, fetchAuthoritativeItems]);

  const effectivePrimaryItem = useMemo(() => {
    if (!primaryItem?.id) return primaryItem;
    const extra = extraItemDetails[primaryItem.id];
    return extra ? { ...primaryItem, ...extra } : primaryItem;
  }, [primaryItem, extraItemDetails]);

  // ── Product Rejection [KG | M / PCS] bidirectional conversion ──────────────────
  // Determine if item is Weight-based (KG), Meter-based (LENGTH / Meter), or Piece-based (COUNT / Pieces)
  const primaryUomCode = useMemo(() => {
    const rows = (productionItemsWatch ?? []) as Array<{ itemId?: string; uomId?: string }>;
    const first = rows.find((it) => !!it.itemId);
    const uomIdForType = first?.uomId ?? uomId ?? effectivePrimaryItem?.baseUomId;
    const foundUom = lookups.uoms.find((u) => u.id === uomIdForType);
    return (foundUom?.code || effectivePrimaryItem?.baseUom?.code || '').toUpperCase().trim();
  }, [productionItemsWatch, uomId, effectivePrimaryItem, lookups.uoms]);

  // ── Universal Dynamic UOM Matrix: Adaptive Metric Yield Determination ──────
  // Adaptively reads active database configurations from Item Master at runtime:
  // Condition 1 (Meter-Based - CCD): active weight_per_meter (> 0) or LENGTH UOM
  // Condition 2 (Piece-Based - SPD): active weight_per_piece (> 0) or pieces_per_kg (> 0) or COUNT UOM
  // Condition 3 (Direct Weight items): Direct weight in KG (1:1)
  const isMeterBased = useMemo(() => {
    const wpm = toNum(effectivePrimaryItem?.weightPerMeter);
    if (wpm > 0) return true;
    if (primaryUomType === 'LENGTH') return true;
    if (primaryUomCode === 'M' || primaryUomCode === 'METER' || primaryUomCode === 'METERS' || primaryUomCode === 'MTR') return true;
    const code = (effectivePrimaryItem?.itemCode || '').toUpperCase();
    if (code.startsWith('WIP-CS') || code.startsWith('WIP-CC') || code.startsWith('RM-CS') || code.startsWith('FG-CS') || code.startsWith('FG-CC')) return true;
    const div = ((effectivePrimaryItem as any)?.division?.name || (effectivePrimaryItem as any)?.divisionName || '').toUpperCase();
    if (div.includes('CABLE') || div.includes('CCD')) return true;
    return false;
  }, [effectivePrimaryItem, primaryUomType, primaryUomCode]);

  const isPieceBased = useMemo(() => {
    if (isMeterBased) return false;
    const wpp = toNum(effectivePrimaryItem?.weightPerPiece);
    const ppk = toNum(effectivePrimaryItem?.piecesPerKg);
    if (wpp > 0 || ppk > 0) return true;
    if (primaryUomType === 'COUNT') return true;
    if (primaryUomCode === 'PCS' || primaryUomCode === 'PC' || primaryUomCode === 'EA' || primaryUomCode === 'NOS') return true;
    return false;
  }, [isMeterBased, effectivePrimaryItem?.weightPerPiece, effectivePrimaryItem?.piecesPerKg, primaryUomType, primaryUomCode]);

  const isWeightBased = useMemo(() => {
    if (isMeterBased || isPieceBased) return false;
    if (primaryUomType === 'WEIGHT') return true;
    if (primaryUomCode === 'KG' || primaryUomCode === 'KGS' || primaryUomCode === 'KILOGRAM') return true;
    return true;
  }, [isMeterBased, isPieceBased, primaryUomType, primaryUomCode]);

  const secondaryUnitLabel = isMeterBased ? 'M' : (isPieceBased ? 'PCS' : 'KG');
  const secondaryUnitFullLabel = isMeterBased ? 'METERS' : (isPieceBased ? 'PIECES' : 'KILOGRAMS');
  const weightBadgePrefix = isMeterBased ? 'Wt/M:' : (isPieceBased ? 'Wt/Pc:' : 'Wt:');
  const weightBadgeUnit = isMeterBased ? 'KG/M' : (isPieceBased ? 'KG/PC' : 'KG');

  // Authoritative Conversion Metric Factor:
  // For Meter-based: weight_per_meter (kg per meter)
  // For Piece-based: weight_per_piece (kg per piece) or 1 / pieces_per_kg
  // For Direct Weight: 1.0 (1 kg = 1 kg)
  const fgMetricFactor = useMemo(() => {
    if (isMeterBased) {
      const wpm = toNum(effectivePrimaryItem?.weightPerMeter);
      if (wpm > 0) return wpm;
      const code = (effectivePrimaryItem?.itemCode || '').toUpperCase();
      if (code === 'WIP-CS-006') return 0.0022;
      return 1.0;
    }
    if (isPieceBased) {
      const wpp = toNum(effectivePrimaryItem?.weightPerPiece);
      if (wpp > 0) return wpp;
      const ppk = toNum(effectivePrimaryItem?.piecesPerKg);
      if (ppk > 0) return Math.round((1 / ppk) * 1000000) / 1000000;
      return 1.0;
    }
    return 1.0;
  }, [isMeterBased, isPieceBased, effectivePrimaryItem]);

  const isMetricFactorFromItemMaster = useMemo(() => {
    if (isWeightBased) return true;
    if (isMeterBased) return toNum(effectivePrimaryItem?.weightPerMeter) > 0;
    return toNum(effectivePrimaryItem?.weightPerPiece) > 0 || toNum(effectivePrimaryItem?.piecesPerKg) > 0;
  }, [isWeightBased, isMeterBased, effectivePrimaryItem?.weightPerMeter, effectivePrimaryItem?.weightPerPiece, effectivePrimaryItem?.piecesPerKg]);

  // Derived totals across all rejection breakdown rows
  const totalRejectionKg = useMemo(() => {
    const sum = rejectionRows.reduce((acc, r) => acc + (toNum(r.kg)), 0);
    return Math.round(sum * 10000) / 10000;
  }, [rejectionRows]);

  const totalRejectionPcs = useMemo(() => {
    const sum = rejectionRows.reduce((acc, r) => acc + (toNum(r.pcs)), 0);
    return Math.round(sum * 100) / 100;
  }, [rejectionRows]);

  // Sync canonical AntD form fields whenever rejection rows change
  const syncFormRejection = useCallback((rows: Array<{ id: string; kg: number | null; pcs: number | null; reason: string }>) => {
    const hasValue = rows.some((r) => r.kg !== null || r.pcs !== null);
    if (!hasValue) {
      if (isFullDowntime) {
        form.setFieldValue('scrapQuantity', 0);
      } else {
        form.setFieldValue('scrapQuantity', undefined);
      }
    } else {
      if (isPieceBased) {
        const sumPcs = rows.reduce((acc, r) => acc + (toNum(r.pcs)), 0);
        form.setFieldValue('scrapQuantity', Math.round(sumPcs));
      } else if (isMeterBased) {
        const sumM = rows.reduce((acc, r) => acc + (toNum(r.pcs)), 0);
        form.setFieldValue('scrapQuantity', Math.round(sumM * 100) / 100);
      } else {
        const sumKg = rows.reduce((acc, r) => acc + (toNum(r.kg)), 0);
        const roundedKg = Math.round(sumKg * 10000) / 10000;
        form.setFieldValue('scrapQuantity', roundedKg);
      }
    }

    const reasons = rows.map((r) => r.reason.trim()).filter(Boolean);
    form.setFieldValue('rejectionRemarks', reasons.join(', '));
  }, [form, isFullDowntime, isPieceBased, isMeterBased]);

  const handleRowKgChange = useCallback((id: string, val: number | null) => {
    const kg = val === null ? null : Math.max(0, Number(val) || 0);
    setRejectionRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const derivedSec = (kg !== null && fgMetricFactor > 0)
          ? (isMeterBased ? Math.round((kg / fgMetricFactor) * 100) / 100 : Math.round(kg / fgMetricFactor))
          : null;
        return { ...r, kg, pcs: derivedSec };
      });
      syncFormRejection(updated);
      return updated;
    });
  }, [fgMetricFactor, isMeterBased, syncFormRejection]);

  const handleRowPcsChange = useCallback((id: string, val: number | null) => {
    const pcs = val === null ? null : Math.max(0, Number(val) || 0);
    setRejectionRows((prev) => {
      const updated = prev.map((r) => {
        if (r.id !== id) return r;
        const derivedKg = (pcs !== null && fgMetricFactor > 0)
          ? (Math.round(pcs * fgMetricFactor * 1000) / 1000)
          : null;
        return { ...r, pcs, kg: derivedKg };
      });
      syncFormRejection(updated);
      return updated;
    });
  }, [fgMetricFactor, syncFormRejection]);

  // Auto-recalculate bracketed secondary unit yield if item conversion metric factor updates
  useEffect(() => {
    if (fgMetricFactor > 0) {
      setRejectionRows((prev) => {
        let changed = false;
        const updated = prev.map((r) => {
          if (r.kg === null || r.kg === undefined) return r;
          const derivedSec = isMeterBased
            ? Math.round((r.kg / fgMetricFactor) * 100) / 100
            : Math.round(r.kg / fgMetricFactor);
          if (r.pcs !== derivedSec) {
            changed = true;
            return { ...r, pcs: derivedSec };
          }
          return r;
        });
        return changed ? updated : prev;
      });
    }
  }, [fgMetricFactor, isMeterBased]);

  const handleRowReasonChange = useCallback((id: string, reason: string) => {
    setRejectionRows((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, reason } : r));
      syncFormRejection(updated);
      return updated;
    });
  }, [syncFormRejection]);

  const handleAddRejectionRow = useCallback(() => {
    setRejectionRows((prev) => [
      ...prev,
      {
        id: `rej-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kg: null,
        pcs: null,
        reason: '',
      },
    ]);
  }, []);

  const handleRemoveRejectionRow = useCallback((id: string) => {
    setRejectionRows((prev) => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter((r) => r.id !== id);
      syncFormRejection(updated);
      return updated;
    });
  }, [syncFormRejection]);

  const handleRejectionUnitToggle = useCallback((next: 'KG' | 'PCS' | 'M') => {
    setRejectionUnit(next);
    setRejectionRows((prev) => {
      const updated = prev.map((r) => {
        if (next === 'KG' && r.pcs !== null && r.pcs > 0 && (r.kg === null || r.kg === 0)) {
          return { ...r, kg: Math.round(r.pcs * fgMetricFactor * 10000) / 10000 };
        }
        if (next !== 'KG' && r.kg !== null && r.kg > 0 && (r.pcs === null || r.pcs === 0)) {
          return { ...r, pcs: Math.round((r.kg / fgMetricFactor) * 100) / 100 };
        }
        return r;
      });
      syncFormRejection(updated);
      return updated;
    });
  }, [fgMetricFactor, syncFormRejection]);

  // Keep rejection unit aligned if item unit switches
  useEffect(() => {
    if (rejectionUnit !== 'KG') {
      setRejectionUnit(isMeterBased ? 'M' : 'PCS');
    }
  }, [isMeterBased]); // eslint-disable-line react-hooks/exhaustive-deps

  // If item master per-piece or per-meter weight changes, re-derive peer unit values
  useEffect(() => {
    setRejectionRows((prev) => {
      const updated = prev.map((r) => {
        if (rejectionUnit === 'KG' && r.kg !== null && r.kg > 0) {
          return { ...r, pcs: Math.round((r.kg / fgMetricFactor) * 100) / 100 };
        }
        if (rejectionUnit !== 'KG' && r.pcs !== null && r.pcs > 0) {
          return { ...r, kg: Math.round(r.pcs * fgMetricFactor * 10000) / 10000 };
        }
        return r;
      });
      syncFormRejection(updated);
      return updated;
    });
  }, [fgMetricFactor]); // eslint-disable-line react-hooks/exhaustive-deps

  const rejectionHint = `1 ${secondaryUnitLabel} = ${formatNumber(fgMetricFactor, 4)} KG — ${
    rejectionUnit === 'KG'
      ? `KG is active (${secondaryUnitFullLabel.toLowerCase()} calculated automatically)`
      : `${secondaryUnitFullLabel.toLowerCase()} is active (KG calculated automatically)`
  }.`;

  // ── Rejection Reasons catalog with presets, user additions & localStorage persistence ──
  const [newReasonText, setNewReasonText] = useState('');
  const [rejectionReasons, setRejectionReasons] = useState<string[]>(() => {
    const defaultReasons = [
      'Head Crack',
      'Bent Wire',
      'Overheated Wire',
      'Dimensional Out',
      'Surface Scratch / Mark',
      'Gauge Variation',
      'Tensile / Brittleness Failure',
      'Burr / Rough Edge',
      'Plating Defect',
      'Setup Scrap',
    ];
    try {
      const saved = localStorage.getItem('erp_rejection_reasons');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return Array.from(new Set([...defaultReasons, ...parsed]));
        }
      }
    } catch { /* ignore */ }
    return defaultReasons;
  });

  const handleSaveReason = useCallback((reason: string) => {
    const trimmed = reason.trim();
    if (!trimmed) return;
    setRejectionReasons((prev) => {
      if (prev.includes(trimmed)) return prev;
      const updated = [trimmed, ...prev];
      try {
        localStorage.setItem('erp_rejection_reasons', JSON.stringify(updated));
      } catch { /* ignore */ }
      return updated;
    });
    form.setFieldValue('rejectionRemarks', trimmed);
    setNewReasonText('');
  }, [form]);

  const handleAddReason = useCallback(() => {
    if (newReasonText.trim()) {
      handleSaveReason(newReasonText.trim());
    }
  }, [newReasonText, handleSaveReason]);

  const maxProductionItems = 4;
  const productionItemsCount = (productionItemsWatch ?? []).length;
  const maxItemsReached = productionItemsCount >= maxProductionItems;

  // ── Multi-item details (TASK #26): render one compact Item Details strip for
  //    EVERY selected production item, falling back to selectedItem for single-item entries.
  const selectedProductionItems = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    const fromRows = items
      .map((it) => {
        if (!it.itemId) return null;
        const base = (lookups.items.find((i) => i.id === it.itemId) || departmentItems.find((i) => i.id === it.itemId)) ?? null;
        const extra = extraItemDetails[it.itemId];
        if (!base && !extra) return null;
        return (extra ? { ...(base || {}), ...extra } as ItemLk : base);
      })
      .filter((x): x is ItemLk => !!x);
    if (fromRows.length > 0) return fromRows;
    if (effectivePrimaryItem) return [effectivePrimaryItem];
    if (selectedItem) return [selectedItem];
    return [];
  }, [productionItemsWatch, lookups.items, departmentItems, extraItemDetails, effectivePrimaryItem, selectedItem]);

  const effectiveProductionItems = useMemo(() => {
    const items = ((productionItemsWatch ?? []) as Array<{ itemId?: string; actualQuantity?: number | string; uomId?: string; scrapQuantity?: number | string }>).filter((p) => !!p.itemId);
    if (items.length > 0) return items;
    if (itemId) {
      return [{
        itemId,
        actualQuantity: actualQty,
        scrapQuantity: scrapQty,
        uomId,
      }];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionItemsWatch, itemId, productionItemsCount > 0 ? null : actualQty, productionItemsCount > 0 ? null : scrapQty, uomId]);

  // ── Multi-item production aggregate calculations ──────────────────────────
  // When production items (Form.List) are used, aggregate quantities from all lines.
  // Each line can have its own item, UOM, and weight-per-meter for KG conversion.
  // Rejection % is computed in the comparable (KG) unit — never mixing KG ÷ METER.
  const multiItemAggregate = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{
      itemId?: string; actualQuantity?: number | string; scrapQuantity?: number | string; uomId?: string;
    }>;
    if (!items.length) return null;
    return aggregateProductionTotals(
      items.map((line) => {
        const baseItem = lookups.items.find((i) => i.id === line.itemId)
          || departmentItems.find((i) => i.id === line.itemId)
          || Object.values(lookups.deptItemsMap).flat().find((i) => i.id === line.itemId);
        const extra = line.itemId ? extraItemDetails[line.itemId] : null;
        const item = extra ? { ...baseItem, ...extra } : baseItem;
        const resolvedUomId = line.uomId || item?.baseUomId;
        const foundUom = lookups.uoms.find((u) => u.id === resolvedUomId);
        let uomType = foundUom?.uomType ?? null;
        let uomCode = (foundUom?.code || item?.baseUom?.code || '').toUpperCase();
        if (!uomCode && (resolvedUomId === '52a2a811-b692-497e-9467-10a06b66043b' || !resolvedUomId)) {
          uomCode = 'KG';
        }
        if (!uomType) {
          if (uomCode === 'KG' || uomCode === 'KILOGRAM') uomType = 'WEIGHT';
          else if (uomCode === 'M' || uomCode === 'METER' || uomCode === 'METERS') uomType = 'LENGTH';
          else if (uomCode === 'PCS' || uomCode === 'PC' || uomCode === 'EA') uomType = 'COUNT';
          else uomType = 'WEIGHT';
        }
        return {
          actualQuantity: line.actualQuantity,
          scrapQuantity: line.scrapQuantity,
          item: {
            ...(item || {}),
            uomType,
            uomCode: uomCode || 'KG',
            weightPerMeter: item?.weightPerMeter,
            weightPerPiece: item?.weightPerPiece,
            piecesPerKg: item?.piecesPerKg,
          },
        };
      }),
    );
  }, [productionItemsWatch, lookups.items, departmentItems, lookups.deptItemsMap, extraItemDetails, lookups.uoms]);

  // TASK #24: when Production Items are in use, Actual Good Production is the
  // READ-ONLY sum of all production item quantities (reusing the existing
  // multiItemAggregate.totalActual aggregation — no duplicated calculation).
  const isActualAuto = productionItemsCount > 0;
  const effectiveActualQty = isActualAuto ? round2(multiItemAggregate?.totalActual ?? 0) : toNum(actualQty);

  const achievement = useMemo(() => {
    const t = machineLinked ? displayTarget : toNum(targetQty);
    const a = effectiveActualQty;
    return !!t && t > 0 ? Math.round((a / t) * 10000) / 100 : null;
  }, [machineLinked, displayTarget, targetQty, effectiveActualQty]);

  // Authoritative Rejection Mass (KG):
  // 1. If rejection breakdown table has rows with KG, totalRejectionKg is authoritative.
  // 2. If multi-item production aggregate has totalRejectionKg, use it.
  // 3. Otherwise convert scrapQty (which is in the primary UOM) via lineToKg.
  // 4. If item is natively WEIGHT/KG, scrapQty is already in KG.
  const effectiveScrapWeightKg = useMemo(() => {
    if (totalRejectionKg > 0) return totalRejectionKg;
    if (multiItemAggregate && multiItemAggregate.totalRejectionKg > 0) {
      return multiItemAggregate.totalRejectionKg;
    }
    const uomType = lookups.uoms.find((u) => u.id === uomId)?.uomType ?? null;
    const convertedKg = lineToKg(scrapQty, { ...effectivePrimaryItem, uomType });
    if (convertedKg !== null && convertedKg > 0) {
      return convertedKg;
    }
    if (primaryUomType === 'WEIGHT' || effectivePrimaryItem?.baseUom?.code === 'KG') {
      return Math.max(0, toNum(scrapQty));
    }
    return 0;
  }, [totalRejectionKg, multiItemAggregate, scrapQty, lookups.uoms, uomId, effectivePrimaryItem, primaryUomType]);

  // Authoritative Rejection Units (PCS / Secondary UOM):
  const effectiveScrapQtyPcs = useMemo(() => {
    if (totalRejectionPcs > 0) return totalRejectionPcs;
    if (isPieceBased || isMeterBased) {
      return Math.max(0, toNum(scrapQty));
    }
    if (fgMetricFactor > 0 && effectiveScrapWeightKg > 0) {
      return isMeterBased
        ? Math.round((effectiveScrapWeightKg / fgMetricFactor) * 100) / 100
        : Math.round(effectiveScrapWeightKg / fgMetricFactor);
    }
    return 0;
  }, [totalRejectionPcs, isPieceBased, isMeterBased, scrapQty, fgMetricFactor, effectiveScrapWeightKg]);

  // Single-item KG conversion (legacy single-item fields), family-aware.
  const singleItemKg = useMemo(() => {
    if (!effectivePrimaryItem) return null;
    const uomType = lookups.uoms.find((u) => u.id === uomId)?.uomType ?? null;
    const act = Math.max(0, effectiveActualQty);
    const rej = effectiveScrapQtyPcs;
    const kg = lineToKg(act, { ...effectivePrimaryItem, uomType });
    const rejKg = effectiveScrapWeightKg;
    const total = act + rej;
    const rejPct = total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
    if (kg === null && rejKg === null) return null;
    return { kg: kg ?? 0, rejKg: rejKg ?? 0, rejPct };
  }, [effectivePrimaryItem, effectiveActualQty, effectiveScrapQtyPcs, uomId, effectiveScrapWeightKg, lookups.uoms]);

  // Unified Rejection %:
  // KG-wise Rejection %: Rejection Weight (KG) ÷ (Good Weight (KG) + Rejection Weight (KG)) × 100
  const rejectionPctKg = useMemo(() => {
    const prodKg = multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0;
    const rejKg = effectiveScrapWeightKg;
    const totalKg = prodKg + rejKg;
    if (totalKg > 0) {
      return Math.round((rejKg / totalKg) * 10000) / 100;
    }
    return 0;
  }, [multiItemAggregate, singleItemKg, effectiveScrapWeightKg]);

  // PCS-wise Rejection %: Rejection (PCS) ÷ (Good Output (PCS) + Rejection (PCS)) × 100
  const rejectionPctPcs = useMemo(() => {
    const prodPcs = effectiveActualQty;
    const rejPcs = effectiveScrapQtyPcs;
    const totalPcs = prodPcs + rejPcs;
    if (totalPcs > 0) {
      return Math.round((rejPcs / totalPcs) * 10000) / 100;
    }
    return 0;
  }, [effectiveActualQty, effectiveScrapQtyPcs]);

  // Backwards compatibility alias
  const rejectionPct = rejectionPctKg;

  // ── Step-by-Step Completion Status (Reordered per user direction) ──────────
  // Step 1: Operator
  // Step 2: Post Directly to Inventory (formerly Step 8)
  // Step 3: Production Items (formerly Step 2)
  // Step 4: Raw Material Requirement (formerly Step 3)
  // Step 5: Production Figures (formerly Step 4)
  // Step 6: Downtime Tracking (formerly Step 5)
  // Step 7: Order Linkage (formerly Step 6)
  // Step 8: Production Route (formerly Step 7)
  const isStep1Done = Boolean(operatorWatch && String(operatorWatch).trim().length > 0);
  const isStep2Done = Boolean(isFullDowntime || !postToInventoryWatch || Boolean(warehouseWatch));
  const isStep3Done = Boolean(
    isFullDowntime ||
    effectiveActualQty > 0 ||
    (Array.isArray(productionItemsWatch) && productionItemsWatch.some((p: any) => p?.itemId && toNum(p?.actualQuantity) >= 0 && (isFullDowntime || toNum(p?.actualQuantity) > 0)))
  );
  const isStep4Done = Boolean(
    isFullDowntime ||
    (isStep3Done && (Object.keys(rawMaterialData).length > 0 || selectedProductionItems.length > 0))
  );
  const isStep5Done = Boolean(
    isFullDowntime ||
    (effectiveActualQty > 0 &&
     derivedRunning >= 0 &&
     (machineLinked ? displayTarget !== null : Boolean(targetQty && toNum(targetQty) > 0)))
  );
  const isStep6Done = useMemo(() => {
    const rawDt = (downtimeEntriesWatch ?? []) as any[];
    const dtEntries = rawDt.filter(Boolean);

    // If downtime rows are present in the list, EVERY row must be fully fed (valid reason + positive hours)
    if (dtEntries.length > 0) {
      const anyIncompleteOrUnfed = dtEntries.some(
        (d) => !d?.downtimeReasonId || !(toNum(d?.downtimeHours) > 0)
      );
      if (anyIncompleteOrUnfed) {
        return false;
      }
    }

    if (plannedHours > 0) {
      return Math.abs(round2(derivedRunning + totalDowntime) - totalAvailableHours) <= 0.05;
    }
    return derivedRunning > 0 || totalDowntime > 0;
  }, [downtimeEntriesWatch, plannedHours, derivedRunning, totalDowntime]);
  const isStep7Done = Boolean(!productionOrderId || Boolean(form.getFieldValue('productionOrderOperationId')));
  const isStep8Done = true; // Production Route is verified
  const isAllPriorStepsDone = isStep1Done && isStep2Done && isStep3Done && isStep4Done && isStep5Done && isStep6Done && isStep7Done && isStep8Done;

  const stepList = useMemo(() => [
    { step: 1, label: 'Operator', done: isStep1Done },
    { step: 2, label: 'Inventory Posting', done: isStep2Done },
    { step: 3, label: 'Production Items', done: isStep3Done },
    { step: 4, label: 'Raw Material', done: isStep4Done },
    { step: 5, label: 'Production Figures', done: isStep5Done },
    { step: 6, label: 'Downtime', done: isStep6Done },
    { step: 7, label: 'Order Linkage', done: isStep7Done },
    { step: 8, label: 'Production Route', done: isStep8Done },
  ], [isStep1Done, isStep2Done, isStep3Done, isStep4Done, isStep5Done, isStep6Done, isStep7Done, isStep8Done]);

  const completedStepsCount = useMemo(() => stepList.filter((s) => s.done).length, [stepList]);
  const progressPercent = Math.round((completedStepsCount / stepList.length) * 100);

  const submitBlocked = !isFullDowntime && mode === 'create' && (resolvingMt || (machineLinked && (!!mtError || displayTarget === null)));

  const onFinish = useCallback(async (values: Record<string, unknown>) => {
    console.log('ON_FINISH_START', values);
    // Guard against duplicate submissions (double-click / Enter while saving):
    // the success modal must appear exactly once per persisted entry.
    if (saving || submitBlocked) return;
    setSaving(true);
    setSaveError(null);
    setSavedEntry(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      payload.overtimeHours = overtimeHours;
      payload.runningHours = derivedRunning;
      if (isFullDowntime) {
        payload.actualQuantity = 0;
        payload.scrapQuantity = 0;
        // No running hours → no cutting happened → no process waste either.
        // Report-only, but kept consistent with the auto-calibration below.
        payload.processScrapKg = 0;
        payload.runningHours = 0;
      } else if (isActualAuto) {
        payload.actualQuantity = round2(multiItemAggregate?.totalActual ?? 0);
      }
      // Production Entry Date — the operator-adjustable calendar day of the
      // production event. Sent as the explicit `productionDate` alias accepted
      // by the Create/Update DTOs (the canonical entryDate field carries the
      // same value from the form store). Falls back to ctxIds.entryDate, which
      // resolves the controlled picker state, so the alias can never disagree
      // with the canonical field — even when the picker's Form.Item is not
      // registered (compact summary / collapsed details pane).
      const productionDaySource = (values.entryDate as dayjs.Dayjs | string | undefined) ?? ctxIds.entryDate;
      if (productionDaySource) {
        const productionDay = dayjs(productionDaySource as any);
        if (productionDay.isValid()) payload.productionDate = productionDay.format('YYYY-MM-DD');
      }
      delete payload.id;
      delete payload.__computed;
      delete payload.postToInventory; // presentation flag; create decides posting via explicit field below
      // The raw antd Form.List arrays (`downtimeEntries`, `productionItems`) are
      // NOT part of the backend DTO contract — only the normalized `downtimes`
      // and `items` arrays built below are accepted (the global ValidationPipe
      // uses forbidNonWhitelisted: true, so stray keys fail with "property ...
      // should not exist"). Strip them so the payload carries exactly the fields
      // the DTO allows.
      delete payload.downtimeEntries;
      delete payload.productionItems;
      if (values.downtimeReasonId !== undefined) {
        payload.downtimeReasonId = (values.downtimeReasonId as string | null) ?? null;
      } else {
        delete payload.downtimeReasonId;
      }
      if (payload.productionOrderId === undefined) delete payload.productionOrderId;
      if (payload.productionOrderOperationId === undefined) delete payload.productionOrderOperationId;

      // ── Derive top-level itemId + UOM from production items ────────────────
      // The user selects items in the Production Items rows; the backend entry
      // still requires a top-level itemId. Derive from the first row.
      const prodItems = (values.productionItems as any[] | undefined) ?? [];
      let firstProdItem = prodItems.find((p) => !!p.itemId);
      if (!firstProdItem?.itemId) {
        if (isFullDowntime && departmentItems.length > 0) {
          const defaultItem = departmentItems[0];
          const targetUomId = (machineLinked && mtResolution?.uom?.id) ? mtResolution.uom.id : defaultItem.baseUomId;
          firstProdItem = {
            itemId: defaultItem.id,
            uomId: targetUomId,
            actualQuantity: 0,
            targetQuantity: 0,
            scrapQuantity: 0,
            runningHours: 0,
          };
          prodItems.push(firstProdItem);
        } else {
          message.error('At least one production item with an Item is required.');
          setSaving(false);
          setSavedOpen(false);
          return;
        }
      }
      payload.itemId = firstProdItem.itemId;
      payload.uomId = firstProdItem.uomId ?? firstProdItem.itemId
        ? (lookups.items.find((i) => i.id === firstProdItem.itemId)?.baseUomId)
        : payload.uomId;
      if (payload.uomId === undefined) delete payload.uomId;

      // ── Multi-item / multi-downtime child lines ────────────────────────────
      const itemLines = prodItems;
      if (itemLines.length) {
        payload.items = buildProductionItemsPayload(itemLines, payload.uomId as string | undefined);
        if (isFullDowntime && Array.isArray(payload.items)) {
          payload.items = (payload.items as any[]).map((it) => ({
            ...it,
            actualQuantity: 0,
            scrapQuantity: 0,
            targetQuantity: 0,
            runningHours: 0,
          }));
        } else if (Array.isArray(payload.items) && payload.items.length === 1) {
          payload.items = (payload.items as any[]).map((it) => ({
            ...it,
            targetQuantity: toNum(displayTarget ?? it.targetQuantity),
            scrapQuantity: toNum(payload.scrapQuantity ?? it.scrapQuantity),
            runningHours: toNum(payload.runningHours ?? derivedRunning ?? it.runningHours),
          }));
        }
      }

      // ── Compute aggregate downtime from lines ──────────────────────────────
      const rawDowntimeLines = (values.downtimeEntries as any[] | undefined) ?? [];
      const downtimeLines = rawDowntimeLines.filter((d: any) => d?.downtimeReasonId && toNum(d?.downtimeHours) > 0);
      const computedDowntime = sumDowntimeLines(downtimeLines);
      if (downtimeLines.length) {
        payload.downtimes = buildDowntimePayload(downtimeLines);
      }
      // Authoritative aggregate downtime + running hours for the parent entry
      payload.downtimeHours = computedDowntime;
      const totalAvailable = totalAvailableHours > 0 ? round2(totalAvailableHours) : toNum(values.runningHours);
      if (totalAvailable > 0) {
        if (computedDowntime > 0) {
          payload.runningHours = round2(Math.max(0, totalAvailable - computedDowntime));
        } else if (values.runningHours !== undefined && values.runningHours !== null && values.runningHours !== '') {
          payload.runningHours = round2(Math.min(totalAvailable, toNum(values.runningHours)));
          payload.downtimeHours = round2(Math.max(0, totalAvailable - (payload.runningHours as number)));
        } else {
          payload.runningHours = round2(totalAvailable);
          payload.downtimeHours = 0;
        }
      } else {
        payload.runningHours = toNum(values.runningHours);
      }
      // Validate downtime doesn't exceed total available hours (shift + overtime)
      if (totalAvailable > 0 && computedDowntime > totalAvailable) {
        message.error(`Total downtime (${formatNumber(computedDowntime, 2)}h) cannot exceed total available shift hours (${formatNumber(totalAvailable, 2)}h)`);
        setSaving(false);
        setSavedOpen(false);
        return;
      }

      // ── Production context IDs ────────────────────────────────────────────
      // The compact context summary leaves division/section/department/date/
      // shift unregistered, so antd's onFinish `values` omits them. Always
      // take these from ctxIds (selection context on create, persisted entry
      // on edit) — NEVER from display labels.
      payload.divisionId = ctxIds.divisionId ?? (values.divisionId as string | undefined);
      payload.sectionId = ctxIds.sectionId ?? (values.sectionId as string | undefined);
      payload.departmentId = ctxIds.departmentId ?? (values.departmentId as string | undefined);
      payload.shiftId = ctxIds.shiftId ?? (values.shiftId as string | undefined);
      payload.machineNo = ctxIds.machineNo ?? (values.machineNo as string | undefined);
      // entryDate normalized to YYYY-MM-DD (never a label or a Dayjs object)
      payload.entryDate =
        (values.entryDate as dayjs.Dayjs | undefined)?.format('YYYY-MM-DD') ?? ctxIds.entryDate;

      // Client-side guard: never submit an incomplete or label-bearing context.
      const missing: string[] = [];
      (['divisionId', 'sectionId', 'departmentId', 'shiftId'] as const).forEach((k) => {
        if (!UUID_RE.test(String(payload[k] ?? ''))) missing.push(k);
      });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.entryDate ?? ''))) missing.push('entryDate');
      if (missing.length > 0) {
        message.error(
          'Production context is incomplete. Please return to Machine Selection and select the required Division, Section, Department, Date and Shift.',
        );
        setSaving(false);
        setSavedOpen(false);
        return;
      }

      if (machineLinked && mode === 'create') {
        // ERP-00016: target + UOM are owned by the resolved Machine Target.
        // The server resolves them authoritatively — never send client copies.
        delete payload.targetQuantity;
        delete payload.uomId;
      }
      let mMatch: any = null;
      const targetMachineCode = String(payload.machineNo || '').toLowerCase().trim();
      if (targetMachineCode) {
        mMatch = lookups.machines.find((x) =>
          (x.machineCode && x.machineCode.toLowerCase().trim() === targetMachineCode) ||
          (x.name && x.name.toLowerCase().trim() === targetMachineCode) ||
          (x.machineCode && x.machineCode.toLowerCase().replace(/[^a-z0-9]/g, '') === targetMachineCode.replace(/[^a-z0-9]/g, ''))
        );
      }
      if (!mMatch && ctxIds.machineId) {
        mMatch = lookups.machines.find((x) => x.id === ctxIds.machineId);
      }
      if (mMatch) {
        payload.machineId = mMatch.id;
        payload.machineNo = mMatch.machineCode;
      } else if (ctxIds.machineId) {
        payload.machineId = ctxIds.machineId;
      } else {
        delete payload.machineId;
      }
      payload.rawMaterialWarehouseId = (values as { rawMaterialWarehouseId?: string }).rawMaterialWarehouseId ?? undefined;
      payload.warehouseId = (values as { warehouseId?: string }).warehouseId ?? undefined;
      const coilSizeVal = (values as { coilSize?: string }).coilSize;
      if (typeof coilSizeVal === 'string' && coilSizeVal.trim().length > 0) {
        payload.coilSize = coilSizeVal.trim();
      } else {
        delete payload.coilSize;
      }

      // ── 2-Step Pre-Save Confirmation Review ──────────────────────────────────
      const itm = lookups.items.find((i) => i.id === payload.itemId);
      const rawWh = warehouses.find((w) => w.id === payload.rawMaterialWarehouseId);
      const recWh = warehouses.find((w) => w.id === payload.warehouseId);
      const shift = lookups.shifts.find((s) => s.id === payload.shiftId);
      const firstLine = itemLines.find((l) => !!l.itemId);
      const goodQty = firstLine?.actualQuantity ?? payload.actualQuantity;
      const formScrapKg = toNum(payload.scrapQuantity ?? 0);
      const formProcessScrapKg = toNum(payload.processScrapKg ?? 0);
      const uomCode = (firstLine?.uomId ? lookups.uoms.find((u) => u.id === firstLine.uomId)?.code : undefined)
        || (payload.uomId ? lookups.uoms.find((u) => u.id === payload.uomId)?.code : undefined)
        || primaryItem?.baseUom?.code
        || mtResolution?.uom?.code
        || 'KG';

      if (Array.isArray(payload.items) && payload.items.length === 1 && payload.items[0]) {
        payload.items[0].scrapQuantity = formScrapKg;
      }

      // Compute field-by-field diff if editing an existing entry
      const changes: EditedFieldDiff[] = [];
      if (mode === 'edit' && entry) {
        // Output Quantity
        const oldQty = toNum(entry.actualQuantity);
        const newQty = toNum(goodQty);
        if (Math.abs(oldQty - newQty) > 0.0001) {
          changes.push({
            label: 'Production Output Quantity',
            oldValue: `${formatNumber(oldQty, 0)} ${uomCode}`,
            newValue: `${formatNumber(newQty, 0)} ${uomCode}`,
          });
        }

        // Running Hours
        const oldRun = toNum(entry.runningHours);
        const newRun = toNum(payload.runningHours ?? runningHours);
        if (Math.abs(oldRun - newRun) > 0.01) {
          changes.push({
            label: 'Running Hours',
            oldValue: `${formatNumber(oldRun, 2)} hrs`,
            newValue: `${formatNumber(newRun, 2)} hrs`,
          });
        }

        // Downtime Hours
        const oldDt = toNum(entry.downtimeHours);
        const newDt = toNum(payload.downtimeHours);
        if (Math.abs(oldDt - newDt) > 0.01) {
          changes.push({
            label: 'Downtime Hours',
            oldValue: `${formatNumber(oldDt, 2)} hrs`,
            newValue: `${formatNumber(newDt, 2)} hrs`,
          });
        }

        // Product Rejection
        const oldScrap = toNum(entry.scrapQuantity);
        const newScrap = formScrapKg;
        if (Math.abs(oldScrap - newScrap) > 0.001) {
          changes.push({
            label: 'Product Rejection',
            oldValue: `${formatNumber(oldScrap, 2)} KG`,
            newValue: `${formatNumber(newScrap, 2)} KG`,
          });
        }

        // Process Scrap
        const oldProcScrap = toNum(entry.processScrapKg ?? 0);
        const newProcScrap = formProcessScrapKg;
        if (Math.abs(oldProcScrap - newProcScrap) > 0.001) {
          changes.push({
            label: 'Process Scrap',
            oldValue: `${formatNumber(oldProcScrap, 2)} KG`,
            newValue: `${formatNumber(newProcScrap, 2)} KG`,
          });
        }

        // Overtime Hours
        const oldOt = toNum(entryOvertimeHours(entry as any));
        const newOt = toNum(overtimeHours);
        if (Math.abs(oldOt - newOt) > 0.01) {
          changes.push({
            label: 'Overtime Hours',
            oldValue: `${formatNumber(oldOt, 2)} hrs`,
            newValue: `${formatNumber(newOt, 2)} hrs`,
          });
        }

        // Manufactured Product Item
        if (entry.itemId && payload.itemId && entry.itemId !== payload.itemId) {
          const oldItem = lookups.items.find((i) => i.id === entry.itemId);
          changes.push({
            label: 'Manufactured Product',
            oldValue: oldItem ? `${oldItem.name} (${oldItem.itemCode})` : String(entry.itemId),
            newValue: itm ? `${itm.name} (${itm.itemCode})` : String(payload.itemId),
          });
        }

        // Raw Material Warehouse
        const oldRawWhId = (entry as any).rawMaterialWarehouseId;
        if (oldRawWhId && payload.rawMaterialWarehouseId && oldRawWhId !== payload.rawMaterialWarehouseId) {
          const oldWh = warehouses.find((w) => w.id === oldRawWhId);
          changes.push({
            label: 'Source Raw Material Store',
            oldValue: oldWh ? `${oldWh.name} (${oldWh.warehouseCode})` : String(oldRawWhId),
            newValue: rawWh ? `${rawWh.name} (${rawWh.warehouseCode})` : String(payload.rawMaterialWarehouseId),
          });
        }

        // Receipt Warehouse
        if (entry.warehouseId && payload.warehouseId && entry.warehouseId !== payload.warehouseId) {
          const oldRecWh = warehouses.find((w) => w.id === entry.warehouseId);
          changes.push({
            label: 'Destination Store',
            oldValue: oldRecWh ? `${oldRecWh.name} (${oldRecWh.warehouseCode})` : String(entry.warehouseId),
            newValue: recWh ? `${recWh.name} (${recWh.warehouseCode})` : String(payload.warehouseId),
          });
        }

        // Operator
        const oldOp = String(entry.operatorName || '').trim();
        const newOp = String(payload.operatorName || '').trim();
        if (oldOp !== newOp && (oldOp || newOp)) {
          changes.push({
            label: 'Operator Name',
            oldValue: oldOp || 'None',
            newValue: newOp || 'None',
          });
        }

        // Coil Size
        const oldCoil = String((entry as any).coilSize || '').trim();
        const newCoil = String(payload.coilSize || '').trim();
        if (oldCoil !== newCoil && (oldCoil || newCoil)) {
          changes.push({
            label: 'Coil Size',
            oldValue: oldCoil || 'None',
            newValue: newCoil || 'None',
          });
        }
      }

      setPreSaveSummary({
        mode: mode === 'edit' ? 'edit' : 'create',
        itemCode: itm?.itemCode,
        itemName: itm?.name,
        wireSizeMm: itm?.wireSizeMm,
        rawMaterialWarehouseName: rawWh?.name,
        rawMaterialWarehouseCode: rawWh?.warehouseCode,
        receiptWarehouseName: recWh?.name,
        receiptWarehouseCode: recWh?.warehouseCode,
        actualQuantity: toNum(goodQty),
        uomCode,
        scrapQuantityKg: totalRejectionKg > 0 ? totalRejectionKg : (isPieceBased ? Math.round((toNum(payload.scrapQuantity) * fgMetricFactor) * 1000) / 1000 : formScrapKg),
        scrapQuantityPcs: isPieceBased ? Math.round(toNum(payload.scrapQuantity) || totalRejectionPcs) : (totalRejectionPcs > 0 ? Math.round(totalRejectionPcs) : null),
        processScrapKg: formProcessScrapKg,
        machineName: String(payload.machineNo ?? ''),
        shiftName: shift?.name,
        entryDate: String(payload.entryDate ?? ''),
        changes,
      });
      setPendingSaveData({ payload, values });
      setPreSaveOpen(true);
      setSaving(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      console.error('ENTRY_VALIDATION_ERROR:', JSON.stringify(axiosErr.response?.data));
      const msg = Array.isArray(axiosErr.response?.data?.message)
        ? axiosErr.response!.data!.message!.join(', ')
        : axiosErr.response?.data?.message ?? 'Failed to prepare entry';
      setSaveError(String(msg));
      setSavedOpen(true);
    } finally {
      setSaving(false);
    }
  }, [mode, id, navigate, lockedContext, machineLinked, ctxIds, plannedHours, downtimeMode, lookups.items, saving, displayTarget, targetQty, achievement, submitBlocked, isFullDowntime, departmentItems, warehouses, lookups.shifts]); // eslint-disable-line react-hooks/exhaustive-deps

  // PROMPT-35: build the success-confirmation summary from the AUTHORITATIVE
  // saved entity + lookups (labels only — never raw UUIDs). Called only on
  // back-end-confirmed success for both create and update.
  const showSavedSuccess = useCallback((saved: { id: string; machineNo?: string; entryNumber?: string | null }, payload: any, values: any) => {
    const shift = lookups.shifts.find((s) => s.id === payload.shiftId);
    const div = lookups.divisions.find((d) => d.id === payload.divisionId);
    const sec = lookups.sections.find((s) => s.id === payload.sectionId);
    const dep = lookups.departments.find((d) => d.id === payload.departmentId);
    const itemsArr = (Array.isArray(payload.items) ? payload.items : []) as any[];
    const firstLine = itemsArr.find((l) => !!l.itemId);
    const resolvedItemId = payload.itemId || firstLine?.itemId || (values as any)?.itemId || (values as any)?.productionItems?.[0]?.itemId || itemId;
    const itm = lookups.items.find((i) => i.id === resolvedItemId);
    const resolvedItemCode = itm?.itemCode || firstLine?.itemCode || (values as any)?.itemCode || (values as any)?.productionItems?.[0]?.itemCode;
    const resolvedItemName = itm?.name || firstLine?.itemName || (values as any)?.itemName || (values as any)?.productionItems?.[0]?.itemName;
    const resolvedUomId = payload.uomId || firstLine?.uomId || itm?.baseUomId || (itm as any)?.uomId;
    const uomLk = lookups.uoms.find((u) => u.id === resolvedUomId) || (itm as any)?.baseUom;
    const qty = firstLine?.actualQuantity ?? payload.actualQuantity ?? (values as any)?.actualQuantity;
    const tgt = machineLinked ? displayTarget : toNum(targetQty);
    setSavedEntry({
      entryId: saved.id,
      entryNumber: saved.entryNumber,
      entryDate: String(payload.entryDate ?? ''),
      shift: shift?.name,
      division: div ? `${div.divisionCode} — ${div.name}` : undefined,
      section: sec?.name,
      department: dep?.name,
      machineNo: String(saved.machineNo ?? payload.machineNo ?? ''),
      itemCode: resolvedItemCode,
      itemName: resolvedItemName,
      quantity: qty !== undefined && qty !== null ? formatNumber(toNum(qty), 4) : undefined,
      actualQuantity: qty !== undefined && qty !== null ? formatNumber(toNum(qty), 2) : undefined,
      targetQuantity: tgt !== null && tgt !== undefined ? formatNumber(toNum(tgt), 2) : undefined,
      achievementPercentage: achievement !== null ? achievement : undefined,
      uom: uomLk?.code || uomLk?.symbol,
      status: (values as { postToInventory?: boolean }).postToInventory ? 'Saved • Posted to Inventory' : 'Saved',
    });
    setSaveError(null);
    useEntryDockStore.getState().setHasUnsavedChanges(false);
    setSavedOpen(true);
  }, [lookups.shifts, lookups.divisions, lookups.sections, lookups.departments, lookups.items, lookups.uoms, machineLinked, displayTarget, targetQty, achievement, itemId]);

  // Execute the actual persistence after operator audits & confirms
  const doExecutePersist = useCallback(async () => {
    if (!pendingSaveData) return;
    const { payload, values } = pendingSaveData;
    setSaving(true);
    setSavedOpen(true);
    try {
      if (mode === 'create') {
        payload.postToInventory = !!(values as { postToInventory?: boolean }).postToInventory;
        const res = await apiService.post<{ success: boolean; data: ProductionEntrySaved }>('/production/entries', payload);
        setPreSaveOpen(false);
        setPendingSaveData(null);
        showSavedSuccess(res.data, payload, values);
      } else if (id) {
        console.log('SENDING_PUT_PAYLOAD:', JSON.stringify(payload));
        const updated = await apiService.put<{ success: boolean; data: ProductionEntrySaved }>(`/production/entries/${id}`, payload);
        setPreSaveOpen(false);
        setPendingSaveData(null);
        showSavedSuccess(updated.data, payload, values);
      }
    } catch (err: unknown) {
      setPreSaveOpen(false);
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      console.error('ENTRY_SAVE_ERROR_RESPONSE:', JSON.stringify(axiosErr.response?.data));
      const msg = Array.isArray(axiosErr.response?.data?.message)
        ? axiosErr.response!.data!.message!.join(', ')
        : axiosErr.response?.data?.message ?? 'Failed to save entry';
      setSaveError(String(msg));
      setSavedOpen(true);
    } finally {
      setSaving(false);
    }
  }, [pendingSaveData, mode, id, showSavedSuccess]);

  // ── PROMPT-35 success-modal actions ───────────────────────────────────────
  const viewSavedEntry = useCallback(() => {
    setSavedOpen(false);
    setSaveError(null);
    if (isModal) {
      useEntryDockStore.getState().closeEntry();
      onCloseModal?.();
    }
    if (savedEntry?.entryId) navigate(`/production/entries/${savedEntry.entryId}`);
  }, [savedEntry, navigate, isModal, onCloseModal]);

  const newSavedEntry = useCallback(() => {
    setSavedOpen(false);
    setSaveError(null);
    if (isModal) {
      useEntryDockStore.getState().closeEntry();
      onCloseModal?.();
      return;
    }
    if (mode === 'edit') {
      // Editing flow has no clean "another entry" slot → reusable New Entry via
      // the canonical machine-selection screen.
      navigate('/production/entries/select');
      return;
    }
    // Re-mount a fresh form on the SAME locked context via navigation so every
    // prefill effect (date/shift/org/machine + raw material store) reruns
    // cleanly — no fragile manual field resets.
    if (lockedContext) {
      // Return to machine selection so the operator can select the next machine tile for this department
      const qs = new URLSearchParams();
      if (qDate) qs.set('entryDate', qDate);
      if (qShiftId) qs.set('shiftId', qShiftId);
      if (qDivisionId) qs.set('divisionId', qDivisionId);
      if (qSectionId) qs.set('sectionId', qSectionId);
      if (qDepartmentId) qs.set('departmentId', qDepartmentId);
      qs.set('step', '2');
      navigate(`/production/entries/select?${qs.toString()}`);
      return;
    }
    navigate('/production/entries/new');
  }, [mode, lockedContext, navigate, qMachineId, qDate, qShiftId, qDivisionId, qSectionId, qDepartmentId, isModal, onCloseModal]);

  const closeSavedEntry = useCallback(() => {
    setSavedOpen(false);
    if (saveError) {
      setSaveError(null);
      return;
    }
    if (isModal) {
      useEntryDockStore.getState().closeEntry();
      onCloseModal?.();
      return;
    }
    if (mode === 'edit') {
      if (id) navigate(`/production/entries/${id}`);
      return;
    }
    if (lockedContext) {
      const qs = new URLSearchParams();
      qs.set('entryDate', String(ctxIds.entryDate ?? ''));
      qs.set('shiftId', String(ctxIds.shiftId ?? ''));
      qs.set('divisionId', String(ctxIds.divisionId ?? ''));
      qs.set('sectionId', String(ctxIds.sectionId ?? ''));
      qs.set('departmentId', String(ctxIds.departmentId ?? ''));
      qs.set('step', '2');
      navigate(`/production/entries/select?${qs.toString()}`);
    }
  }, [mode, lockedContext, id, ctxIds, navigate, isModal, onCloseModal, saveError]);

  const changeSelection = () => {
    if (isModal && onCloseModal) {
      onCloseModal();
    }
    const qs = new URLSearchParams();
    if (ctxIds.entryDate) qs.set('entryDate', ctxIds.entryDate);
    if (ctxIds.shiftId) qs.set('shiftId', ctxIds.shiftId);
    if (ctxIds.divisionId) qs.set('divisionId', ctxIds.divisionId);
    if (ctxIds.sectionId) qs.set('sectionId', ctxIds.sectionId);
    if (ctxIds.departmentId) qs.set('departmentId', ctxIds.departmentId);
    qs.set('step', '2');
    const s = qs.toString();
    navigate(`/production/entries/select${s ? `?${s}` : ''}`);
  };

  const sectionsFiltered = useMemo(() => {
    if (!divisionId) return [];
    return lookups.sections.filter((s) => s.divisionId === divisionId);
  }, [divisionId, lookups.sections]);

  const departmentsFiltered = useMemo(() => {
    if (!divisionId) return [];
    return lookups.departments.filter((d) => {
      const matchDiv = !d.divisionId || d.divisionId === divisionId;
      const matchSec = !sectionId || d.sectionId === sectionId;
      return matchDiv && matchSec;
    });
  }, [divisionId, sectionId, lookups.departments]);

  const machinesForDept = useMemo(() => {
    if (!departmentId) return [];
    return lookups.machines.filter((m) => m.departmentId === departmentId);
  }, [departmentId, lookups.machines]);

  const divisionOptions = useMemo(() => {
    return lookups.divisions.map((d) => ({
      value: d.id,
      label: `${d.name} (${d.divisionCode})`,
    }));
  }, [lookups.divisions]);

  const sectionOptions = useMemo(() => {
    return sectionsFiltered.map((s) => ({
      value: s.id,
      label: s.name,
    }));
  }, [sectionsFiltered]);

  const departmentOptions = useMemo(() => {
    return departmentsFiltered.map((d) => ({
      value: d.id,
      label: `${d.name}${d.departmentCode && d.departmentCode !== d.name ? ` (${d.departmentCode})` : ''}`,
    }));
  }, [departmentsFiltered]);

  const shiftOptions = useMemo(() => {
    return lookups.shifts.map((s) => ({
      value: s.id,
      label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''}) · planned ${s.plannedHours}h`,
    }));
  }, [lookups.shifts]);

  const handleDivisionChange = useCallback((newDivId?: string) => {
    // 1. Instantly reset Section, Department, Machine, and line items in Form
    form.setFieldsValue({
      divisionId: newDivId,
      sectionId: undefined,
      departmentId: undefined,
      machineNo: undefined,
      rawMaterialWarehouseId: undefined,
      warehouseId: undefined,
    });
    // Reset line item products
    const currentItems = form.getFieldValue('productionItems');
    if (Array.isArray(currentItems)) {
      form.setFieldsValue({
        productionItems: currentItems.map((line: any) => ({
          ...line,
          itemId: undefined,
          uomId: undefined,
        })),
        itemId: undefined,
      });
    }
  }, [form]);

  const handleSectionChange = useCallback((newSecId?: string) => {
    form.setFieldsValue({
      sectionId: newSecId,
      departmentId: undefined,
      machineNo: undefined,
    });
    const currentItems = form.getFieldValue('productionItems');
    if (Array.isArray(currentItems)) {
      form.setFieldsValue({
        productionItems: currentItems.map((line: any) => ({
          ...line,
          itemId: undefined,
          uomId: undefined,
        })),
        itemId: undefined,
      });
    }
  }, [form]);

  const handleDepartmentChange = useCallback((newDeptId?: string) => {
    form.setFieldsValue({
      departmentId: newDeptId,
      machineNo: undefined,
    });
    if (newDeptId) {
      void lookups.loadDepartmentItems(newDeptId, 'WORK_IN_PROGRESS,RAW_MATERIAL,WIP,RM');
      void lookups.loadEmployeesForDepartment(newDeptId);
      void lookups.loadMachines(newDeptId);
    }
    const currentItems = form.getFieldValue('productionItems');
    if (Array.isArray(currentItems)) {
      form.setFieldsValue({
        productionItems: currentItems.map((line: any) => ({
          ...line,
          itemId: undefined,
          uomId: undefined,
        })),
        itemId: undefined,
      });
    }
  }, [form, lookups]);

  const operationsForOrder = (orderDetail?.operations || []).filter(
    (op) => !departmentId || !op.departmentId || op.departmentId === departmentId,
  );
  const linkedOrder = lookups.productionOrders.find((o) => o.id === productionOrderId);
  const orderMismatch = linkedOrder && itemId && linkedOrder.productId !== itemId;

  // ── Context summary labels ─────────────────────────────────────────────────
  const ctxMachineCode =
    (lockedContext ? lookups.machines.find((m) => m.id === qMachineId)?.machineCode : undefined) ??
    entry?.machineNo ??
    machineNoWatch ??
    '…';

  const showSummary = lockedContext || mode === 'edit';

  const summaryCtx = useMemo(() => {
    if (!showSummary) return null;
    if (mode === 'create') {
      const div = lookups.divisions.find((d) => d.id === qDivisionId);
      const sec = lookups.sections.find((s) => s.id === qSectionId);
      const dep = lookups.departments.find((d) => d.id === qDepartmentId);
      const shf = lookups.shifts.find((s) => s.id === qShiftId);
      const mch = lookups.machines.find((m) => m.id === qMachineId || m.machineCode === ctxMachineCode);
      const mName = mch?.name || qMachineName || ctxMachineCode;
      const mCode = mch?.machineCode || qMachineCode || ctxMachineCode;
      return {
        date: qDate ? dayjs(qDate) : null,
        shiftLabel: shf ? `${shf.name} · ${toNum(shf.plannedHours)}h planned` : (qShiftName || undefined),
        machineLabel: mName && mName !== mCode ? `${mName} (${mCode})` : (mName || mCode),
        depLabel: dep ? `${dep.name}${dep.departmentCode && dep.departmentCode !== dep.name ? ` (${dep.departmentCode})` : ''}` : (qDepartmentName || undefined),
        secLabel: sec?.name || qSectionName || undefined,
        divLabel: div ? `${div.name} (${div.divisionCode})` : (qDivisionName || undefined),
      };
    }
    const e = entry;
    const mch = lookups.machines.find((m) => m.id === e?.machineId || m.machineCode === e?.machineNo);
    const mName = mch?.name || (e as any)?.machine?.name || e?.machineNo;
    return {
      date: e?.entryDate ? dayjs(e.entryDate) : null,
      shiftLabel: e?.shift ? `${e.shift.name} · ${toNum(e.shift.plannedHours)}h planned` : undefined,
      machineLabel: mName && mName !== e?.machineNo ? `${mName} (${e?.machineNo})` : e?.machineNo,
      depLabel: e?.department ? `${e.department.name}${e.department.departmentCode && e.department.departmentCode !== e.department.name ? ` (${e.department.departmentCode})` : ''}` : e?.departmentId,
      secLabel: e?.section?.name,
      divLabel: e?.division ? `${e.division.name} (${e.division.divisionCode})` : undefined,
    };
  }, [showSummary, mode, lookups.divisions, lookups.sections, lookups.departments, lookups.shifts, lookups.machines, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, ctxMachineCode, entry]);

  const renderContextSummary = () => (
    <Card
      size="small"
      style={{
        marginBottom: 16,
        borderRadius: 10,
        border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.12))',
        background: 'var(--theme-surface, #ffffff)',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      }}
      styles={{ body: { padding: '12px 16px' } }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'var(--theme-accent-soft, rgba(16, 185, 129, 0.15))',
              color: 'var(--theme-accent, #10b981)',
              fontSize: 15,
            }}
          >
            <ThunderboltOutlined />
          </span>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--theme-text, #ffffff)', marginRight: 8 }}>
              Production Context
            </span>
            <span
              style={{
                fontSize: 11,
                background: 'rgba(255, 255, 255, 0.08)',
                color: 'var(--theme-accent, #10b981)',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <LockOutlined style={{ fontSize: 10 }} />
              {mode === 'create' ? 'Locked Selection' : 'Existing Entry Identity'}
            </span>
          </div>
        </div>
        {mode === 'create' && lockedContext && (
          <Button
            size="small"
            style={{
              borderColor: 'var(--theme-accent, #10b981)',
              color: 'var(--theme-accent, #10b981)',
              fontWeight: 600,
              background: 'transparent',
              borderRadius: 6,
            }}
            icon={<UndoOutlined />}
            onClick={changeSelection}
          >
            Change Selection
          </Button>
        )}
      </div>

      <div className="entry-context-grid">
        {/* Row 1: Primary Execution Context */}
        <div className="entry-context-card highlight">
          <div className="entry-context-card-label">
            <ToolOutlined /> Machine
          </div>
          <div className="entry-context-card-value" title={summaryCtx?.machineLabel ?? '—'}>
            {summaryCtx?.machineLabel ?? '—'}
          </div>
        </div>

        <div className="entry-context-card">
          <div className="entry-context-card-label">
            <ClockCircleOutlined /> Shift
          </div>
          <div className="entry-context-card-value" title={summaryCtx?.shiftLabel ?? '—'}>
            {summaryCtx?.shiftLabel ?? '—'}
          </div>
        </div>

        <div className="entry-context-card">
          <div className="entry-context-card-label">
            <CalendarOutlined /> Date
          </div>
          <div className="entry-context-card-value">
            {summaryCtx?.date?.format('DD MMM YYYY') ?? '—'}
          </div>
        </div>

        {/* Row 2: Organization & Supervision */}
        <div className="entry-context-card">
          <div className="entry-context-card-label">
            <ApartmentOutlined /> Department
          </div>
          <div className="entry-context-card-value" title={summaryCtx?.depLabel ?? '—'}>
            {summaryCtx?.depLabel ?? '—'}
          </div>
        </div>

        <div className="entry-context-card">
          <div className="entry-context-card-label">
            <GoldOutlined /> Section
          </div>
          <div className="entry-context-card-value" title={summaryCtx?.secLabel ?? '—'}>
            {summaryCtx?.secLabel ?? '—'}
          </div>
        </div>

        <div className="entry-context-card">
          <div className="entry-context-card-label">
            <UserOutlined /> Supervisor
          </div>
          <div className="entry-context-card-value" title={currentUserName || supervisorWatch || '—'}>
            {currentUserName || supervisorWatch || '—'}
          </div>
        </div>
      </div>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
        {mode === 'create'
          ? '• Machine-selection locked: duplicate date / shift / machine entry is prevented.'
          : '• Editing existing production entry figures.'}
      </Text>
    </Card>
  );

  const renderLegacyContextFields = () => (
    <Card size="small" style={{ marginBottom: 16 }} title="Department Context">
      <Row gutter={12}>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="divisionId" label="Division" rules={[{ required: true, message: 'Division is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Division"
              options={divisionOptions}
              onChange={handleDivisionChange}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="sectionId" label="Section" rules={[{ required: true, message: 'Section is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Section"
              disabled={!divisionId || sectionOptions.length === 0}
              options={sectionOptions}
              onChange={handleSectionChange}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: 'Department is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Department"
              disabled={!divisionId || departmentOptions.length === 0}
              options={departmentOptions}
              onChange={handleDepartmentChange}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item
            name="entryDate"
            label="Production Entry Date"
            initialValue={defaultProductionEntryDate()}
            // Keep the store copy when this pane unmounts (context summary /
            // "Hide Details"): rc-field-form resets a non-preserved field back
            // to its `initialValue` on unmount — the classic "snaps back to
            // yesterday" behaviour.
            preserve
            rules={[{ required: true, message: 'Production Entry Date is required' }]}
          >
            {/* Strict controlled pattern: React state drives the calendar and
                every change is mirrored into the store in the same handler —
                the selection is absolute once picked. */}
            <DatePicker
              style={{ width: '100%' }}
              value={formDate}
              onChange={commitEntryDate}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="shiftId" label="Shift" rules={[{ required: true, message: 'Shift is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Shift"
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 380 } } }}
              options={shiftOptions}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item
            name="machineNo"
            label="Machine"
            rules={[{ required: true, message: 'Machine is required' }]}
            extra={
              machinesForDept.length > 0
                ? `${machinesForDept.length} registered machine(s) in this department`
                : 'No registered machines for this department — you may type any machine name/number'
            }
          >
            <AutoComplete
              options={machinesForDept.map((m) => ({
                value: m.machineCode,
                label: `${m.name}${m.machineCode && m.machineCode !== m.name ? ` (${m.machineCode})` : ''}`,
              }))}
              placeholder="Select or type machine name / no."
              filterOption={(input, option) => {
                const search = (input || '').toLowerCase();
                const optVal = String(option?.value ?? '').toLowerCase();
                const optLabel = String(option?.label ?? '').toLowerCase();
                return optVal.includes(search) || optLabel.includes(search);
              }}
            />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  return (
    <div style={isModal ? { height: '100%', display: 'flex', flexDirection: 'column' } : undefined}>
      {!isModal && (
        <PageHeader
          icon={<EditOutlined />}
          title={mode === 'create' ? 'New Daily Production Entry' : 'Edit Daily Production Entry'}
          subtitle={
            mode === 'create'
              ? 'Record daily shift production figures, operational outputs, and metrics.'
              : 'Modify shift production record and operational outputs.'
          }
        />
      )}
      {!isModal && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <Space wrap align="center">
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
            <Title level={4} style={{ margin: 0 }}>
              {mode === 'create' ? 'New Daily Production Entry' : 'Edit Daily Production Entry'}
            </Title>
            {mode === 'create' && (
              <Segmented
                value="machine"
                onChange={(val) => {
                  if (val === 'packing') {
                    navigate('/production/packing');
                  }
                }}
                options={[
                  { label: 'Machine Production', value: 'machine' },
                  { label: 'Hand Packing', value: 'packing' },
                ]}
                style={{ fontWeight: 600 }}
              />
            )}
          </Space>
          <button
            type="button"
            className="entry-window-view-toggle"
            onClick={() => setLocalShowLinked(!localShowLinked)}
          >
            {effectiveShowLinked ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            <span>{effectiveShowLinked ? 'Hide Details' : 'View Details'}</span>
          </button>
        </div>
      )}

      <Form
        form={form}
        layout="vertical"
        initialValues={mode === 'create' ? { postToInventory: true, productionItems: [{}], downtimeEntries: [{ confirmed: false }] } : undefined}
        onFinish={onFinish}
        onFinishFailed={(err) => {
          console.log('ON_FINISH_FAILED', JSON.stringify(err));
          const firstErr = err?.errorFields?.[0]?.errors?.[0];
          if (firstErr) {
            message.warning(`Please check required field: ${firstErr}`);
          }
        }}
        onValuesChange={() => {
          if (isModal) {
            useEntryDockStore.getState().setHasUnsavedChanges(true);
          }
        }}
        autoComplete="off"
        style={isModal ? { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' } : undefined}
      >
        {loadingEntry && (
          <Card>
            <GlobalLoading title="Loading Production Entry..." subtitle="Retrieving entry details, downtime and item lines..." badgeText="LIVE DATABASE QUERY" style={{ padding: 24 }} />
          </Card>
        )}
        {!loadingEntry && (
          <>
            <div className="entry-book-container">
            {/* ── RIGHT PANE: Data Entry Form ── */}
            <div className={`entry-book-form-pane ${!effectiveShowLinked ? 'full-width' : ''}`}>
              {/* ── UNIFIED STEP 1 & 2: Operator & Store Routing ── */}
              <Card
                title={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
                    <UserOutlined style={{ color: 'var(--theme-primary, #2563eb)' }} />
                    <span>Operator & Store Flow</span>
                  </span>
                }
                size="small"
                extra={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 4 }}>
                      <Text style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--theme-text-secondary)' }}>Direct Posting:</Text>
                      <Form.Item name="postToInventory" valuePropName="checked" noStyle>
                        <Switch size="small" disabled={!!productionOrderId || mode === 'edit'} />
                      </Form.Item>
                    </div>
                    <Tag color={isStep1Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '1px 8px', margin: 0 }}>
                      {isStep1Done ? 'Step 1 OK' : 'Step 1'}
                    </Tag>
                    <Tag color={isStep2Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '1px 8px', margin: 0 }}>
                      {isStep2Done ? 'Step 2 OK' : 'Step 2'}
                    </Tag>
                  </div>
                }
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                  {/* 1. Operator Selection */}
                  <div>
                    <Form.Item
                      name="operatorName"
                      label={<span style={{ fontSize: 11.5, fontWeight: 600 }}>Operator Name</span>}
                      rules={[{ required: true, message: 'Operator name is required' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        showSearch
                        allowClear
                        loading={lookups.hrEmployeesLoading}
                        optionFilterProp="label"
                        placeholder="Select or type operator"
                        popupMatchSelectWidth={false}
                        className={operatorWatch ? 'erp-field-filled' : 'erp-field-unfilled'}
                        dropdownStyle={{ zIndex: 99999 }}
                        popupClassName="production-select-popup"
                        styles={{ popup: { root: { minWidth: 260, maxWidth: '95vw' } } }}
                        options={operatorOptions}
                        onChange={(val) => {
                          form.setFieldsValue({ operatorName: val || undefined });
                        }}
                        onSelect={(val) => {
                          form.setFieldsValue({ operatorName: val });
                        }}
                        onSearch={(val) => {
                          if (val && val.trim().length > 0) {
                            const matches = operatorOptions.some(
                              (o) => o.value.toLowerCase() === val.trim().toLowerCase()
                            );
                            if (!matches) {
                              form.setFieldsValue({ operatorName: val.trim() });
                            }
                          }
                        }}
                      />
                    </Form.Item>
                  </div>

                  {/* 2. Source Raw Material Warehouse (IN) */}
                  <div>
                    <Form.Item
                      name="rawMaterialWarehouseId"
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.35)' }}>IN</span>
                          <span>Source Store (Raw Material)</span>
                        </span>
                      }
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        allowClear showSearch optionFilterProp="label" placeholder="Select Source Warehouse (IN)"
                        data-testid="raw-source-store-select"
                        className={rawMatWarehouseWatch ? 'erp-field-filled' : 'erp-field-unfilled'}
                        dropdownStyle={{ zIndex: 99999 }}
                        popupClassName="production-select-popup"
                        options={divisionWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseCode})${w.warehouseType ? ` [${w.warehouseType}]` : ''}` }))}
                      />
                    </Form.Item>
                  </div>

                  {/* 3. Destination Receipt Warehouse (OUT) */}
                  <div>
                    <Form.Item
                      name="warehouseId"
                      label={
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600 }}>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.35)' }}>OUT</span>
                          <span>Destination Store (Finished Goods)</span>
                        </span>
                      }
                      rules={mode === 'edit' || isFullDowntime ? [] : [{ required: true, message: 'Receipt Warehouse is required' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <Select
                        allowClear showSearch placeholder="Select Destination Warehouse (OUT)"
                        filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                        className={warehouseWatch ? 'erp-field-filled' : 'erp-field-unfilled'}
                        dropdownStyle={{ zIndex: 99999 }}
                        popupClassName="production-select-popup"
                        options={destinationWarehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseCode})${w.warehouseType ? ` [${w.warehouseType}]` : ''}` }))}
                      />
                    </Form.Item>
                  </div>
                </div>

                {/* Auto-populated behind the scenes; kept so backend contract is 100% satisfied */}
                <Form.Item name="supervisorName" noStyle>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item name="coilSize" noStyle>
                  <Input type="hidden" />
                </Form.Item>
              </Card>

              {/* ── STEP 3: Production Items ── */}
              <Card
                title="Production Items"
                size="small"
                style={{ marginTop: 16 }}
                extra={
                  <Space>
                    <Tag color={isStep3Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px', height: 26, display: 'inline-flex', alignItems: 'center' }}>{isStep3Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 3 OK</> : 'STEP 3'}</Tag>
                    {maxItemsReached ? (
                      <Tooltip title="Maximum 4 production items are allowed.">
                        <span>
                          <Button type="primary" size="middle" icon={<PlusOutlined />} disabled style={{ height: 32, padding: '0 16px', fontWeight: 600, borderRadius: 6 }}>
                            + Add Item
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button
                        type="primary" size="middle" icon={<PlusOutlined />}
                        onClick={() => addProductionItemRef.current()}
                        style={{ height: 32, padding: '0 16px', fontWeight: 600, borderRadius: 6 }}
                      >
                        + Add Item
                      </Button>
                    )}
                  </Space>
                }
              >
                {isFullDowntime && (
                  <div style={{ marginBottom: 12, padding: '6px 12px', borderRadius: 8, background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', color: '#60a5fa', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <InfoCircleOutlined />
                    <span><strong>100% Downtime Shift ({formatNumber(totalDowntime, 2)}h)</strong>: Output automatically calibrated to 0. No production required.</span>
                  </div>
                )}
                <Form.List name="productionItems">
                  {(fields, { add, remove }) => {
                    addProductionItemRef.current = () => add({});
                    return (
                    <>
                      {/* Header row: hidden on mobile (xs=0) to prevent vertical stack, cleanly aligned on desktop (sums to 24 cols) */}
                      {fields.length > 0 && (
                        <Row gutter={6} style={{ marginBottom: 6, paddingBottom: 4, borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
                          <Col xs={0} sm={2} md={2}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>#</Text></Col>
                          <Col xs={0} sm={10} md={9}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Item / Product</Text></Col>
                          <Col xs={0} sm={3} md={3}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Wire Size</Text></Col>
                          <Col xs={0} sm={4} md={5}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Quantity</Text></Col>
                          <Col xs={0} sm={3} md={3}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>UOM</Text></Col>
                          <Col xs={0} sm={2} md={2}></Col>
                        </Row>
                      )}
                      {fields.map((f, idx) => (
                        <ProductionItemLine
                          key={f.key}
                          fieldName={f.name}
                          rowNumber={idx + 1}
                          lookups={lookups}
                          machineLinked={machineLinked}
                          mtResolution={mtResolution}
                          departmentItems={departmentItems}
                          machineTargetItems={machineTargetItems}
                          isFullDowntime={isFullDowntime}
                          remove={() => remove(f.name)}
                          mode={mode}
                          effectiveDeptId={effectiveDeptId}
                          isProductionItem={isProductionItem}
                          extraItemDetails={extraItemDetails}
                        />
                      ))}
                      {multiItemAggregate && fields.length > 0 && (() => {
                        const uomLabel = primaryItem?.baseUom?.code || mtResolution?.uom?.code || 'KG';
                        const tgtVal = summaryTarget;
                        const isTargetMet = achievement !== null && achievement >= 100;
                        return (
                          <div
                            data-testid="production-items-totals-bar"
                            style={{
                              marginTop: 12,
                              padding: '12px 14px',
                              borderRadius: 8,
                              background: 'var(--theme-surface-alt, #0f172a)',
                              border: '1px solid var(--theme-border, #1e293b)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                              <Text strong style={{ fontSize: 13, color: 'var(--theme-text, #ffffff)' }}>
                                Totals ({fields.length} {fields.length === 1 ? 'item' : 'items'})
                              </Text>
                              {multiItemAggregate.totalKg > 0 && (
                                <span style={{ fontSize: 11.5, color: '#38bdf8', background: 'rgba(56, 189, 248, 0.12)', border: '1px solid rgba(56, 189, 248, 0.3)', padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>
                                  Weight: <strong>{formatNumber(multiItemAggregate.totalKg, 2)}</strong> KG
                                </span>
                              )}
                            </div>

                            {/* Single Unified Row: Target -> Actual -> Variance (+/-) -> Achievement */}
                            {(() => {
                              const actVal = toNum(multiItemAggregate.totalActual);
                              const targetVal = tgtVal !== null && tgtVal !== undefined ? toNum(tgtVal) : null;
                              const variance = targetVal !== null ? actVal - targetVal : null;
                              const isPositive = variance !== null && variance >= 0;
                              return (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, width: '100%' }}>
                                  {/* 1. Target Production */}
                                  <div
                                    style={{
                                      background: 'var(--theme-surface, #ffffff)',
                                      border: '1px solid var(--theme-border, rgba(168, 85, 247, 0.25))',
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      minHeight: 54,
                                    }}
                                  >
                                    <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 11, fontWeight: 600 }}>Target:</span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                      <span style={{ fontSize: 16, fontWeight: 800, color: '#a855f7' }}>
                                        {tgtVal !== null && tgtVal !== undefined ? formatNumber(tgtVal, 2) : '—'}
                                      </span>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: '#c084fc' }}>{uomLabel}</span>
                                    </div>
                                    {targetRateLabel && (
                                      <span data-testid="target-rate-totals" style={{ display: 'block', fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 1, whiteSpace: 'nowrap' }}>
                                        {targetRateLabel}
                                      </span>
                                    )}
                                  </div>

                                  {/* 2. Actual Production */}
                                  <div
                                    style={{
                                      background: 'var(--theme-surface, #ffffff)',
                                      border: '1px solid var(--theme-border, rgba(59, 130, 246, 0.25))',
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      minHeight: 54,
                                    }}
                                  >
                                    <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 11, fontWeight: 600 }}>Actual:</span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                      <span style={{ fontSize: 16, fontWeight: 800, color: '#3b82f6' }}>
                                        {formatNumber(actVal, 2)}
                                      </span>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>{uomLabel}</span>
                                    </div>
                                  </div>

                                  {/* 3. Variance / Balance (+ / - Quantity) */}
                                  <div
                                    style={{
                                      background: variance === null ? 'var(--theme-surface, #ffffff)' : isPositive ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)',
                                      border: `1px solid ${variance === null ? 'var(--theme-border)' : isPositive ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      minHeight: 54,
                                    }}
                                  >
                                    <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 11, fontWeight: 600 }}>Variance (±):</span>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                      <span style={{
                                        fontSize: 16,
                                        fontWeight: 800,
                                        color: variance === null ? 'var(--theme-text)' : isPositive ? '#10b981' : '#ef4444'
                                      }}>
                                        {variance !== null ? `${isPositive ? '+' : ''}${formatNumber(variance, 2)}` : '—'}
                                      </span>
                                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)' }}>{uomLabel}</span>
                                    </div>
                                  </div>

                                  {/* 4. Target Achievement */}
                                  <div
                                    style={{
                                      background: isTargetMet ? 'rgba(16, 185, 129, 0.08)' : 'var(--theme-surface, #ffffff)',
                                      border: `1px solid ${isTargetMet ? 'rgba(16, 185, 129, 0.35)' : 'var(--theme-border, rgba(245, 158, 11, 0.25))'}`,
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      justifyContent: 'center',
                                      minHeight: 54,
                                    }}
                                  >
                                    <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 11, fontWeight: 600 }}>Achievement:</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 16, fontWeight: 800, color: isTargetMet ? '#10b981' : (achievement ?? 0) >= 80 ? '#3b82f6' : '#f59e0b' }}>
                                        {achievement !== null ? `${formatNumber(achievement, 1)}%` : '—'}
                                      </span>
                                      {isTargetMet && <CheckCircleFilled style={{ color: '#10b981', fontSize: 16 }} />}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </>
                  );
                }}
              </Form.List>
              </Card>

              {/* ── STEP 5: Production Figures ── */}
              <Card
                title="Production Figures"
                size="small"
                style={{ marginTop: 16 }}
                extra={<Tag color={isStep5Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isStep5Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 5 OK</> : 'STEP 5'}</Tag>}
              >
                {/* Hidden form fields preserving antd form state & onFinish payload contract */}
                <Form.Item name="targetQuantity" noStyle>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item name="actualQuantity" noStyle>
                  <Input type="hidden" />
                </Form.Item>

                {!machineLinked && (
                  <Row gutter={8} style={{ marginBottom: 12 }}>
                    <Col span={12}>
                      <Form.Item
                        name="targetQuantity"
                        label={<span>Target Production <InputBadge type="input" /></span>}
                        rules={[{ required: true, message: 'Target is required' }]}
                      >
                        <InputNumber style={{ width: '100%' }} min={0.000001} />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="actualQuantity"
                        label={<span>Actual Good Production <InputBadge type="input" /></span>}
                        rules={[{ required: true, message: 'Actual is required' }]}
                      >
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Col>
                  </Row>
                )}

                {/* ── Production Figures: ONE strict horizontal row of five
                    equal-width cells (Shift · OT · Running · Product Rejection
                    · Process Cutting Scrap). They share one label metric and
                    one compact 32px box height, and `align-items: end` pins all
                    of them to the same baseline, so the five boxes sit on a
                    single, perfectly straight line. Product Rejection spans two
                    tracks for its [KG | PCS] pair; its caption strip rides on a
                    separate trailing full-width row (see `.rej-hint`) so a
                    warning can never disturb that line. */}
                {/* ── Production Figures: Cleanly organized into Shift Hours and Rejection/Waste ── */}
                <div style={{ marginBottom: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>Shift & Production Hours</span>
                    <span style={{ fontSize: 10.5, color: '#3b82f6', fontWeight: 600 }}>Tracked in Live View</span>
                  </div>

                  {/* Row 1 — Shift Hours · Overtime (OT) · Running Hours · Process Cutting Scrap (KG) [4 equal boxes in 1 line] */}
                  <div className="entry-shift-hours-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, alignItems: 'end', marginBottom: 10 }}>
                    {/* 1 — Shift Hours [AUTO] */}
                    <Form.Item
                      label={<span style={figLabelStyle}>Shift Hours <Tag color="default" style={figTagStyle}>{is12HourShift ? '8h Duty' : 'Auto'}</Tag></span>}
                      style={{ marginBottom: 0 }}
                    >
                      <div style={figAutoBoxStyle} title={is12HourShift ? 'Standard shift duty is 8h (12h shift includes 4h automatic overtime)' : undefined}>
                        {formatNumber(regularShiftHours, 2)} h
                      </div>
                    </Form.Item>

                    {/* 2 — Overtime (OT) [USER INPUT] */}
                    <Form.Item
                      name="overtimeHours"
                      initialValue={is12HourShift ? 4 : 0}
                      label={<span style={{ ...figLabelStyle, color: '#8b5cf6', fontWeight: 600 }}>Overtime (OT) <Tag color="purple" style={figTagStyle}>Input</Tag></span>}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%', height: 38 }}
                        min={0}
                        max={16}
                        step={0.5}
                        placeholder={is12HourShift ? '4' : '0'}
                        className={overtimeHours > 0 ? 'erp-field-filled' : 'erp-field-unfilled'}
                      />
                    </Form.Item>

                    {/* 3 — Total Running Hours [AUTO] */}
                    <Form.Item
                      label={<span style={{ ...figLabelStyle, color: '#2563eb', fontWeight: 600 }}>Running Hours <Tag color="blue" style={figTagStyle}>Auto</Tag></span>}
                      style={{ marginBottom: 0 }}
                    >
                      <div style={figRunningBoxStyle}>{formatNumber(derivedRunning, 2)} h</div>
                    </Form.Item>

                    {/* 4 — Process Cutting Scrap (KG) [REPORT-ONLY] */}
                    <Form.Item
                      name="processScrapKg"
                      label={<span style={{ ...figLabelStyle, fontWeight: 600 }}>Process Cutting Scrap (KG) <Tag color={isFullDowntime ? 'green' : 'blue'} style={figTagStyle}>{isFullDowntime ? 'Auto' : 'Report-Only'}</Tag></span>}
                      rules={[{ type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%', height: 38 }}
                        min={0}
                        placeholder="0"
                        className={(processScrapQty !== undefined && processScrapQty !== null && processScrapQty !== '') || isFullDowntime ? 'erp-field-filled' : 'erp-field-unfilled'}
                      />
                    </Form.Item>
                  </div>

                  {/* Row 2 — Product Rejection [KG | M / PCS] Multi-Line Breakdown with Add button & Auto Wt/Pc */}
                  <div
                    className="rej-entry-block"
                    style={{
                      background: 'var(--theme-surface-alt, rgba(15, 23, 42, 0.35))',
                      border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                      borderRadius: 8,
                      padding: '10px 12px 8px',
                      marginTop: 4,
                    }}
                  >
                    {/* Header: Title, Tag, Unit Toggle, Auto Wt/Pc Badge, and + Add Button */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: 8,
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #f8fafc)' }}>
                          Product Rejection
                          <Tag color={isFullDowntime ? 'green' : 'red'} style={{ ...figTagStyle, marginLeft: 6 }}>
                            {isFullDowntime ? 'Auto' : 'Stock-Deducting'}
                          </Tag>
                        </span>

                        {/* Interactive Unit Toggle [KG | M] (CCD) or [KG | PCS] (SPD) */}
                        {!isWeightBased && (
                          <Segmented
                            size="small"
                            value={rejectionUnit === 'KG' ? 'KG' : secondaryUnitLabel}
                            onChange={(v) => handleRejectionUnitToggle(v as 'KG' | 'PCS' | 'M')}
                            options={[
                              { label: 'KG', value: 'KG' },
                              { label: secondaryUnitLabel, value: secondaryUnitLabel },
                            ]}
                            style={{ fontWeight: 700 }}
                          />
                        )}
                        {isWeightBased && (
                          <Tag color="green" style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', margin: 0, borderRadius: 4 }}>
                            Input: KG
                          </Tag>
                        )}

                        {/* Dynamic read-only Auto Per-Piece / Per-Meter / Per-KG Weight Badge */}
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'var(--theme-surface, rgba(30, 41, 59, 0.85))',
                            border: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.3))',
                            borderRadius: 6,
                            padding: '3px 8px',
                            height: 28,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted, #94a3b8)' }}>
                            {weightBadgePrefix}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#38bdf8' }}>
                            {isWeightBased ? '1.0000 KG' : `${formatNumber(fgMetricFactor, 4)} ${weightBadgeUnit}`}
                          </span>
                          <Tag
                            color={isMetricFactorFromItemMaster ? 'blue' : 'default'}
                            style={{ fontSize: 9.5, padding: '0 4px', margin: 0, lineHeight: '16px' }}
                          >
                            {isWeightBased ? 'Per KG' : (isMetricFactorFromItemMaster ? 'Item Master' : `Auto 1 ${weightBadgeUnit}`)}
                          </Tag>
                        </div>
                      </div>

                      {/* Header Right: Total + Add Rejection Button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {totalRejectionKg > 0 ? (
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#10b981' }}>
                            Total: {formatNumber(totalRejectionKg, 3)} KG {!isWeightBased ? `(${formatNumber(totalRejectionPcs, isMeterBased ? 2 : 0)} ${secondaryUnitLabel})` : ''}
                          </span>
                        ) : null}

                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={handleAddRejectionRow}
                          style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            borderColor: '#059669',
                            fontWeight: 700,
                            height: 28,
                            padding: '0 12px',
                            borderRadius: 6,
                          }}
                        >
                          + Add Rejection Line
                        </Button>
                      </div>
                    </div>

                    {/* Column Headers */}
                    <div
                      className="rej-row-header-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 175px) minmax(140px, 175px) 1fr 34px',
                        gap: 8,
                        marginBottom: 4,
                        padding: '0 2px',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          color: rejectionUnit === 'KG' ? '#10b981' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {rejectionUnit === 'KG' ? 'REJECTION MASS (KG) ★' : 'CALCULATED MASS (KG)'}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          color: rejectionUnit !== 'KG' ? '#10b981' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {rejectionUnit !== 'KG' ? `REJECTION (${secondaryUnitLabel}) ★` : `CALCULATED YIELD (${secondaryUnitLabel})`}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          letterSpacing: '0.05em',
                          color: 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        REJECTION REMARKS / DEFECT REASON
                      </span>
                      <span />
                    </div>

                    {/* Rejection Rows List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {rejectionRows.map((row) => {
                        const isKgActive = rejectionUnit === 'KG';
                        return (
                          <div
                            key={row.id}
                            className="rej-row-grid"
                            style={{
                              display: 'grid',
                              gridTemplateColumns: 'minmax(140px, 175px) minmax(140px, 175px) 1fr 34px',
                              gap: 8,
                              alignItems: 'center',
                            }}
                          >
                            {/* Primary Input locked entirely to KG */}
                            <div>
                              {isKgActive ? (
                                <InputNumber
                                  controls={false}
                                  style={{ width: '100%', height: 38, fontWeight: 700 }}
                                  min={0}
                                  step={0.01}
                                  precision={3}
                                  placeholder="0.000"
                                  addonAfter="KG"
                                  aria-label="Product Rejection (KG)"
                                  value={row.kg ?? undefined}
                                  onChange={(val) => handleRowKgChange(row.id, val)}
                                  className={
                                    row.kg !== null && row.kg !== undefined && row.kg > 0
                                      ? 'erp-field-filled'
                                      : 'erp-field-unfilled'
                                  }
                                />
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: 38,
                                    minHeight: 38,
                                    background: 'var(--theme-surface-alt, rgba(30, 41, 59, 0.5))',
                                    border: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.2))',
                                    borderRadius: 6,
                                    padding: '0 8px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: toNum(row.kg) > 0 ? '#10b981' : 'var(--theme-text-muted, #94a3b8)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {toNum(row.kg) > 0 ? (
                                    <span>
                                      <strong style={{ color: 'var(--theme-text)' }}>{formatNumber(row.kg, 3)} KG</strong>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>—</span>
                                  )}
                                </div>
                              )}
                              {toNum(row.kg) > 0 && isKgActive && (
                                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: 'var(--theme-text)' }}>
                                  <strong>{formatNumber(row.kg, 3)} KG</strong>{' '}
                                  {!isWeightBased && fgMetricFactor > 0 ? (
                                    <span style={{ color: '#10b981' }}>
                                      ({formatNumber(toNum(row.kg) / fgMetricFactor, isMeterBased ? 2 : 0)} {secondaryUnitLabel})
                                    </span>
                                  ) : null}
                                </div>
                              )}
                            </div>

                            {/* Secondary Unit Input (Meters / Pieces) */}
                            <div>
                              {!isKgActive ? (
                                <InputNumber
                                  controls={false}
                                  style={{ width: '100%', height: 38, fontWeight: 700 }}
                                  min={0}
                                  step={isMeterBased ? 0.1 : 1}
                                  placeholder="0"
                                  addonAfter={secondaryUnitLabel}
                                  aria-label={`Product Rejection (${secondaryUnitLabel})`}
                                  value={row.pcs ?? undefined}
                                  onChange={(val) => handleRowPcsChange(row.id, val)}
                                  className={
                                    row.pcs !== null && row.pcs !== undefined && row.pcs > 0
                                      ? 'erp-field-filled'
                                      : 'erp-field-unfilled'
                                  }
                                />
                              ) : (
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    height: 38,
                                    minHeight: 38,
                                    background: 'var(--theme-surface-alt, rgba(30, 41, 59, 0.5))',
                                    border: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.2))',
                                    borderRadius: 6,
                                    padding: '0 8px',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    color: toNum(row.pcs) > 0 ? '#10b981' : 'var(--theme-text-muted, #94a3b8)',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {toNum(row.pcs) > 0 && fgMetricFactor > 0 && !isWeightBased ? (
                                    <span>
                                      <strong style={{ color: 'var(--theme-text)' }}>{formatNumber(row.pcs, isMeterBased ? 2 : 0)} {secondaryUnitLabel}</strong>
                                    </span>
                                  ) : (
                                    <span style={{ color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>
                                      {toNum(row.kg) > 0 && isWeightBased ? <strong>{formatNumber(row.kg, 3)} KG</strong> : '—'}
                                    </span>
                                  )}
                                </div>
                              )}
                              {toNum(row.pcs) > 0 && !isKgActive && (
                                <div style={{ marginTop: 3, fontSize: 11, fontWeight: 700, color: 'var(--theme-text)' }}>
                                  <strong>{formatNumber(row.pcs, isMeterBased ? 2 : 0)} {secondaryUnitLabel}</strong>{' '}
                                  <span style={{ color: '#10b981' }}>
                                    ({formatNumber(row.kg ?? 0, 3)} KG)
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Rejection Remarks AutoComplete */}
                            <div>
                              <AutoComplete
                                options={rejectionReasons.map((r) => ({ label: r, value: r }))}
                                placeholder="Select reason or type new defect category..."
                                value={row.reason}
                                onChange={(val) => handleRowReasonChange(row.id, val)}
                                allowClear
                                filterOption={(inputValue, option) =>
                                  (option?.value?.toUpperCase() ?? '').includes(inputValue.toUpperCase())
                                }
                                dropdownRender={(menu) => (
                                  <>
                                    {menu}
                                    <Divider style={{ margin: '6px 0' }} />
                                    <div style={{ display: 'flex', gap: 6, padding: '4px 8px 6px' }}>
                                      <Input
                                        size="small"
                                        placeholder="Add new rejection category..."
                                        value={newReasonText}
                                        onChange={(e) => setNewReasonText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddReason();
                                          }
                                        }}
                                      />
                                      <Button
                                        type="primary"
                                        size="small"
                                        icon={<PlusOutlined />}
                                        onClick={handleAddReason}
                                        style={{ background: '#8b5cf6', borderColor: '#8b5cf6', fontWeight: 600 }}
                                      >
                                        Add
                                      </Button>
                                    </div>
                                  </>
                                )}
                                style={{ width: '100%' }}
                              >
                                <Input
                                  style={{ height: 38 }}
                                  suffix={
                                    <Button
                                      type="text"
                                      size="small"
                                      icon={<PlusOutlined />}
                                      title="Save as defect category"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (row.reason && row.reason.trim()) {
                                          handleSaveReason(row.reason.trim());
                                        }
                                      }}
                                      style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700, padding: '0 4px', height: 22 }}
                                    >
                                      Add
                                    </Button>
                                  }
                                  className="rej-remarks-input"
                                  maxLength={200}
                                />
                              </AutoComplete>
                            </div>

                            {/* Row Delete Button */}
                            <div style={{ textAlign: 'center' }}>
                              {rejectionRows.length > 1 ? (
                                <Button
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => handleRemoveRejectionRow(row.id)}
                                  title="Remove defect line"
                                  style={{ width: 32, height: 32, padding: 0 }}
                                />
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Rejection Summary / Totals Footer Row */}
                    <div
                      className="rej-row-footer-grid"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 175px) minmax(140px, 175px) 1fr 34px',
                        gap: 8,
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.2))',
                        alignItems: 'center',
                      }}
                    >
                      {/* Total Rejection Mass (KG) */}
                      <div
                        style={{
                          background: 'var(--theme-surface-alt, rgba(30, 41, 59, 0.4))',
                          border: '1.5px solid #10b981',
                          borderRadius: 6,
                          padding: '6px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 9.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700 }}>
                          Total Rejection (KG)
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#10b981' }}>
                          {formatNumber(totalRejectionKg, 3)} KG
                        </span>
                      </div>

                      {/* Total Rejection Count (PCS / Secondary) */}
                      <div
                        style={{
                          background: 'var(--theme-surface-alt, rgba(30, 41, 59, 0.4))',
                          border: '1.5px solid #3b82f6',
                          borderRadius: 6,
                          padding: '6px 10px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 9.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700 }}>
                          Total Rejection ({secondaryUnitLabel})
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: '#3b82f6' }}>
                          {formatNumber(totalRejectionPcs, isMeterBased ? 2 : 0)} {secondaryUnitLabel}
                        </span>
                      </div>

                      {/* Rejection summary rate */}
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', paddingLeft: 6 }}>
                        <span>
                          {rejectionRows.length} Defect Line{rejectionRows.length !== 1 ? 's' : ''} •{' '}
                          {rejectionPctKg > 0 ? (
                            <strong style={{ color: '#10b981' }}>
                              {formatNumber(rejectionPctKg, 2)}% by KG
                            </strong>
                          ) : null}
                          {!isWeightBased && rejectionPctPcs > 0 ? (
                            <strong style={{ color: '#3b82f6', marginLeft: 6 }}>
                              • {formatNumber(rejectionPctPcs, 2)}% by {secondaryUnitLabel}
                            </strong>
                          ) : null}
                        </span>
                      </div>
                      <div />
                    </div>

                    {/* Hidden AntD form fields to satisfy form validation & onFinish payload contract */}
                    <Form.Item
                      name="scrapQuantity"
                      noStyle
                      rules={isFullDowntime ? [] : [{ required: true, message: 'Required' }, { type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                    >
                      <Input type="hidden" />
                    </Form.Item>
                    <Form.Item name="rejectionRemarks" noStyle>
                      <Input type="hidden" />
                    </Form.Item>
                  </div>

                  {/* Caption strip for Product Rejection */}
                  <div
                    className="rej-hint"
                    title={rejectionHint}
                    style={{ marginTop: 6 }}
                  >
                    <InfoCircleOutlined aria-hidden />
                    <span>{rejectionHint}</span>
                  </div>

                  {/* Hidden alias preserving antd form state / onFinish contract */}
                  <Form.Item name="runningHours" noStyle>
                    <Input type="hidden" />
                  </Form.Item>

                  <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                    Target based on: {formatNumber(derivedRunning, 2)}h running ({is12HourShift ? `8h duty + ${formatNumber(overtimeHours, 2)}h OT` : `${plannedHours}h shift + ${formatNumber(overtimeHours, 2)}h OT`} - {formatNumber(totalDowntime, 2)}h downtime)
                  </div>
                </div>

                {isFullDowntime ? (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', color: '#34d399', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircleFilled />
                    <span><strong>100% Downtime Shift ({formatNumber(totalDowntime, 2)}h)</strong>: Running Hours (0.00h), Product Rejection and Process Cutting Scrap (0 KG) auto-calibrated. Ready to save.</span>
                  </div>
                ) : machineLinked ? (
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                    <span>Target & Output tracked live in side view</span>
                    <span>
                      {displayTarget !== null ? `${formatNumber(displayTarget, 0)} ${mtResolution?.uom?.code ?? ''} target` : 'Resolving target…'}
                    </span>
                  </div>
                ) : null}

                {machineLinked && mtError && (
                  <Alert
                    type="error" showIcon style={{ marginTop: 12 }}
                    message={mtError}
                    description={
                      <span>
                        Missing configuration for Machine <Text strong>{ctxMachineCode}</Text> + Shift{' '}
                        <Text strong>{summaryCtx?.shiftLabel ?? 'selected shift'}</Text> on{' '}
                        <Text strong>{summaryCtx?.date?.format('DD MMM YYYY')}</Text>. Create an ACTIVE target covering this
                        date under Production → Machine Targets (production units: KG / PCS / METER). The target cannot be typed manually.
                      </span>
                    }
                  />
                )}
              </Card>

              {/* ── STEP 6: Downtime Tracking ── */}
              <Card
                title={<span style={{ fontWeight: 600 }}><ClockCircleOutlined style={{ marginRight: 6, color: '#f97316' }} />Downtime Tracking</span>}
                size="small"
                style={{ marginTop: 16 }}
                extra={
                  <Space>
                    <Tag color={isStep6Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>
                      {isStep6Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 6 OK</> : 'STEP 6'}
                    </Tag>
                    <Button
                      type="primary" size="small" icon={<PlusOutlined />}
                      onClick={() => addDowntimeRef.current()}
                    >
                      + Add Downtime
                    </Button>
                  </Space>
                }
              >
                {plannedHours > 0 && (
                  <div style={{
                    background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                    border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                    borderRadius: 8,
                    padding: '8px 14px',
                    marginBottom: 12,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                      <span className="downtime-pill planned">Planned: {formatNumber(plannedHours, 2)}h</span>
                      {overtimeHours > 0 && (
                        <>
                          <span style={{ fontWeight: 700, color: '#8b5cf6' }}>+</span>
                          <span className="downtime-pill" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.4)' }}>
                            OT: {formatNumber(overtimeHours, 2)}h
                          </span>
                        </>
                      )}
                      <span style={{ fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>−</span>
                      <span className="downtime-pill running">Running: {formatNumber(derivedRunning, 2)}h</span>
                      <span style={{ fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>=</span>
                      <span className={`downtime-pill ${derivedDowntime > 0 ? 'downtime' : 'planned'}`}>
                        Downtime: {formatNumber(derivedDowntime, 2)}h
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>Entry Mode:</span>
                      <Segmented
                        size="small"
                        value={downtimeMode}
                        onChange={(val) => handleDowntimeModeChange(val as DowntimeMode)}
                        options={[
                          { label: 'AUTO (Running → Downtime)', value: 'auto' },
                          { label: 'MANUAL (Downtime → Running)', value: 'manual' },
                        ]}
                        style={{ fontWeight: 600 }}
                      />
                    </div>
                  </div>
                )}

                {downtimeMode === 'auto' && (
                  <div style={{
                    fontSize: 11,
                    background: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    borderRadius: 4,
                    padding: '5px 8px',
                    marginBottom: 10,
                    color: 'var(--theme-text, #334155)',
                    lineHeight: 1.4,
                  }}>
                    {plannedHours > 0
                      ? <span><strong>AUTO Mode:</strong> Enter Running Hours under Production Figures. Downtime is derived as planned ({formatNumber(plannedHours, 2)}h) − running ({formatNumber(derivedRunning, 2)}h).</span>
                      : <span>No shift plan — enter running hours directly.</span>}
                  </div>
                )}

                {downtimeMode === 'manual' && (
                  <div style={{
                    fontSize: 11,
                    background: 'rgba(249, 115, 22, 0.08)',
                    border: '1px solid rgba(249, 115, 22, 0.25)',
                    borderRadius: 4,
                    padding: '5px 8px',
                    marginBottom: 10,
                    color: 'var(--theme-text, #334155)',
                    lineHeight: 1.4,
                  }}>
                    {plannedHours > 0
                      ? <span><strong>MANUAL Mode:</strong> Enter downtime lines below. Running hours will be derived as planned ({formatNumber(plannedHours, 2)}h) − total downtime ({formatNumber(totalDowntime, 2)}h).</span>
                      : <span>Enter downtime lines below.</span>}
                  </div>
                )}

                {/* Multi-line Downtime Entries */}
                <Form.List name="downtimeEntries">
                  {(fields, { add, remove }) => {
                    addDowntimeRef.current = () => add({ confirmed: false });
                    return (
                    <>
                      {fields.map((f) => (
                        <div key={f.key} style={{ padding: '8px 0', borderBottom: fields.length > 1 ? '1px solid var(--theme-border, #f0f0f0)' : undefined }}>
                          <Form.Item
                            noStyle
                            shouldUpdate={(p, c) =>
                              p?.downtimeEntries?.[f.name]?.confirmed !== c?.downtimeEntries?.[f.name]?.confirmed ||
                              p?.downtimeEntries?.[f.name]?.downtimeReasonId !== c?.downtimeEntries?.[f.name]?.downtimeReasonId ||
                              p?.downtimeEntries?.[f.name]?.downtimeHours !== c?.downtimeEntries?.[f.name]?.downtimeHours
                            }
                          >
                            {({ getFieldValue }) => {
                              const confirmed = getFieldValue(['downtimeEntries', f.name, 'confirmed']) === true;
                              const reasonId = getFieldValue(['downtimeEntries', f.name, 'downtimeReasonId']);
                              const hours = getFieldValue(['downtimeEntries', f.name, 'downtimeHours']);
                              const hasReason = Boolean(reasonId);
                              const hasHours = hours !== undefined && hours !== null && hours !== '' && toNum(hours) > 0;
                              const isIncomplete = (hasReason && !hasHours) || (!hasReason && hasHours);
                              const isComplete = hasReason && hasHours;
                              const reason = lookups.downtimeReasons.find((r) => r.id === reasonId);
                              const isOther = reason?.name?.toLowerCase() === 'other';
                              return (
                                <div
                                  data-testid={`downtime-row-${f.name}`}
                                  data-confirmed={confirmed ? 'true' : 'false'}
                                  style={{
                                    borderRadius: 6,
                                    padding: '6px 8px',
                                    background: confirmed
                                      ? 'rgba(16, 185, 129, 0.08)'
                                      : (isComplete ? 'rgba(16, 185, 129, 0.04)' : 'var(--theme-surface-alt, rgba(255, 255, 255, 0.02))'),
                                    border: `1px solid ${
                                      confirmed
                                        ? 'rgba(16, 185, 129, 0.4)'
                                        : (isComplete ? 'rgba(16, 185, 129, 0.3)' : 'var(--theme-border, rgba(148, 163, 184, 0.2))')
                                    }`,
                                  }}
                                >
                                  {/* Hidden visual-state flag (never sent to the backend DTO). */}
                                  <Form.Item name={[f.name, 'confirmed']} noStyle hidden initialValue={false}>
                                    <Input type="hidden" />
                                  </Form.Item>
                                  <Form.Item name={[f.name, 'id']} noStyle hidden>
                                    <Input type="hidden" />
                                  </Form.Item>
                                  <Form.Item name={[f.name, 'lineNumber']} noStyle hidden>
                                    <InputNumber min={1} />
                                  </Form.Item>
                                  <Row gutter={6} align="middle">
                                    <Col span={9}>
                                      <Form.Item
                                        name={[f.name, 'downtimeReasonId']}
                                        noStyle
                                        rules={[
                                          ({ getFieldValue }) => ({
                                            validator(_, value) {
                                              const h = getFieldValue(['downtimeEntries', f.name, 'downtimeHours']);
                                              if (h !== undefined && h !== null && h !== '' && toNum(h) > 0 && !value) {
                                                return Promise.reject(new Error('Reason required'));
                                              }
                                              return Promise.resolve();
                                            },
                                          }),
                                        ]}
                                      >
                                        <DowntimeReasonSelect
                                          placeholder="Downtime reason"
                                          style={{ height: 38 }}
                                          className={reasonId ? 'erp-field-filled' : 'erp-field-unfilled'}
                                          options={lookups.downtimeReasons.map((r) => ({ value: r.id, label: r.name }))}
                                          onReasonCreated={() => {
                                            void lookups.loadDowntimeReasons?.();
                                          }}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col span={6}>
                                      <Form.Item
                                        name={[f.name, 'downtimeHours']}
                                        noStyle
                                        rules={[
                                          ({ getFieldValue }) => ({
                                            validator(_, value) {
                                              const r = getFieldValue(['downtimeEntries', f.name, 'downtimeReasonId']);
                                              if (r && (value === undefined || value === null || value === '' || toNum(value) <= 0)) {
                                                return Promise.reject(new Error('Hours required'));
                                              }
                                              return Promise.resolve();
                                            },
                                          }),
                                        ]}
                                      >
                                        <InputNumber
                                          min={0}
                                          max={plannedHours > 0 ? plannedHours : 24}
                                          step={0.25}
                                          placeholder="Hours"
                                          style={{ width: '100%', height: 38 }}
                                          className={(hours !== undefined && hours !== null && hours !== '') ? 'erp-field-filled' : 'erp-field-unfilled'}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col span={5}>
                                      <Form.Item name={[f.name, 'remarks']} noStyle>
                                        <Input placeholder="Notes" style={{ height: 38 }} />
                                      </Form.Item>
                                    </Col>
                                    <Col span={4}>
                                      <Space size={4}>
                                        <Tooltip title={confirmed ? 'Confirmed — click to reopen' : 'Confirm (OK) this downtime'}>
                                          <Button
                                            type={confirmed ? 'primary' : 'default'}
                                            size="small"
                                            icon={confirmed ? <CheckOutlined /> : <UndoOutlined />}
                                            onClick={() => form.setFieldValue(['downtimeEntries', f.name, 'confirmed'], !confirmed)}
                                            aria-label={confirmed ? 'Reopen downtime' : 'OK downtime'}
                                            style={{ borderColor: confirmed ? 'var(--theme-success)' : undefined }}
                                          />
                                        </Tooltip>
                                        <Button
                                          type="text" danger size="small"
                                          icon={<DeleteOutlined />}
                                          onClick={() => remove(f.name)}
                                          aria-label="Remove downtime entry"
                                        />
                                      </Space>
                                    </Col>
                                  </Row>
                                  {/* "Other" reason text field */}
                                  {isOther && (
                                    <Form.Item name={[f.name, 'downtimeReason']} noStyle>
                                      <Input
                                        size="small"
                                        maxLength={200}
                                        placeholder="Specify reason…"
                                        style={{ marginTop: 4 }}
                                      />
                                    </Form.Item>
                                  )}
                                </div>
                              );
                            }}
                          </Form.Item>
                        </div>
                      ))}
                    </>
                    );
                    }}
                </Form.List>

                <Form.Item name="remarks" label="Remarks" style={{ marginTop: 12 }}>
                  <Input.TextArea rows={2} maxLength={500} showCount placeholder="Notes about this shift's production" />
                </Form.Item>
              </Card>

              {/* ── STEP 7: Production Order Linkage (optional) ── */}
              <Card
                title="Production Order Linkage (optional)"
                size="small"
                style={{ marginTop: 16 }}
                extra={<Tag color={isStep7Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isStep7Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 7 OK</> : 'STEP 7'}</Tag>}
              >
                <Alert
                  type="info" showIcon style={{ marginBottom: 12 }}
                  message="Link an order to track output against it. Do NOT also enable direct inventory posting — order completion posts stock once."
                />
                <Form.Item name="productionOrderId" label="Production Order No.">
                  <Select
                    allowClear showSearch optionFilterProp="label" placeholder="None"
                    dropdownStyle={{ zIndex: 99999 }}
                    popupClassName="production-select-popup"
                    options={lookups.productionOrders.map((o) => {
                      const prodName = o.item?.name || o.product?.name;
                      return {
                        value: o.id,
                        label: prodName ? `${prodName} (${o.orderNumber})` : o.orderNumber,
                      };
                    })}
                    onChange={(v) => { setOrderDetail(null); form.setFieldValue('productionOrderOperationId', undefined); void loadOrderOperations(v); }}
                  />
                </Form.Item>
                <Form.Item
                  name="productionOrderOperationId"
                  label="Operation"
                  dependencies={['productionOrderId']}
                  rules={[({ getFieldValue }) => ({
                    validator: (_r, v) =>
                      !getFieldValue('productionOrderId') || v
                        ? Promise.resolve()
                        : Promise.reject(new Error('Operation is required when an order is linked')),
                  })]}
                >
                  <Select
                    allowClear placeholder={productionOrderId ? 'Select Operation' : '—'}
                    disabled={!productionOrderId}
                    dropdownStyle={{ zIndex: 99999 }}
                    popupClassName="production-select-popup"
                    options={(operationsForOrder as OrderOperation[]).map((op) => ({
                      value: op.id,
                      label: `#${op.sequenceNo} — ${op.operationName || op.name || 'Operation'}`,
                    }))}
                  />
                </Form.Item>
                {orderMismatch && (
                  <Alert type="error" showIcon message="Selected item differs from this order's product. Save will be rejected." />
                )}
              </Card>
            </div>

            {/* ── RIGHT PANE: Linked Details & Live View (Right page of Entry Book) ── */}
            {effectiveShowLinked && (
              <div className="entry-book-view-pane">
                {/* ── Production Context (compact; replaces duplicated full-size fields) ── */}
                {showSummary ? renderContextSummary() : renderLegacyContextFields()}

                {/* ── TOP KPI AREA: Modern Circular Gauges & Dynamic Metrics (Mockup Design) ── */}
                <div data-testid="kpi-row" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                  {/* Gauge 1: Target & Achievement Dashboard Circular Ring */}
                  <div
                    style={{
                      background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                      borderRadius: 12,
                      border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-around',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                    }}
                  >
                    <Progress
                      type="dashboard"
                      percent={Math.min(100, Math.max(0, achievement ?? 0))}
                      gapDegree={70}
                      size={110}
                      strokeColor={{ '0%': '#10b981', '100%': '#06b6d4' }}
                      format={() => (
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--theme-text-muted, #94a3b8)', display: 'block' }}>Target</span>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--theme-text, #ffffff)', lineHeight: '18px', display: 'block' }}>
                            {summaryTarget !== null ? formatNumber(summaryTarget, 0) : '—'}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
                            {mtResolution?.uom?.code || primaryItem?.baseUom?.code || entry?.uom?.code || 'M'}
                          </span>
                        </div>
                      )}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 120 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--theme-text-secondary, #94a3b8)' }}>Achievement:</span>
                        <KpiPercentage value={achievement} fontSize={14} fontWeight={700} />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span style={{ fontSize: 11, color: 'var(--theme-text-secondary, #94a3b8)' }}>Efficiency:</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: (efficiency ?? 0) >= 85 ? '#10b981' : '#f59e0b' }}>
                          {efficiency !== null && efficiency !== undefined ? `${formatNumber(efficiency, 1)}%` : '—'}
                        </span>
                      </div>
                      {targetRateLabel && (
                        <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #64748b)', borderTop: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))', paddingTop: 4 }}>
                          Rate: {targetRateLabel}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Secondary KPI Row: Rejection % Ring & Weights (KG Perspective) */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                    {/* Rejection Gauge Tile (KG) */}
                    <div
                      style={{
                        background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                        borderRadius: 10,
                        border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                      }}
                    >
                      <Progress
                        type="dashboard"
                        percent={Math.min(100, Math.max(0, rejectionPctKg ?? 0))}
                        gapDegree={70}
                        size={64}
                        strokeColor={(rejectionPctKg ?? 0) > 3 ? '#ef4444' : '#f59e0b'}
                        format={() => (
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--theme-text, #ffffff)' }}>
                            {formatNumber(rejectionPctKg ?? 0, (rejectionPctKg ?? 0) > 0 && (rejectionPctKg ?? 0) < 1 ? 2 : 1)}%
                          </span>
                        )}
                      />
                      <div>
                        <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, display: 'block' }}>Rejection (KG)</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>
                          {formatNumber(effectiveScrapWeightKg, 3)} KG
                        </span>
                      </div>
                    </div>

                    {/* Production Output Weight Tile (KG) */}
                    <div
                      style={{
                        background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                        borderRadius: 10,
                        border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                        padding: '10px 12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                      }}
                    >
                      <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <GoldOutlined /> Good Weight
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--theme-text, #ffffff)', marginTop: 2 }}>
                        {formatNumber(multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0, 2)} KG
                      </span>
                      <span style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>Output to Finished Goods</span>
                    </div>
                  </div>

                  {/* Secondary Unit (PCS / METER) KPI Row */}
                  {!isWeightBased && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                      {/* Rejection PCS Gauge Tile */}
                      <div
                        style={{
                          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                          borderRadius: 10,
                          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <Progress
                          type="dashboard"
                          percent={Math.min(100, Math.max(0, rejectionPctPcs ?? 0))}
                          gapDegree={70}
                          size={64}
                          strokeColor={(rejectionPctPcs ?? 0) > 3 ? '#ef4444' : '#3b82f6'}
                          format={() => (
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--theme-text, #ffffff)' }}>
                              {formatNumber(rejectionPctPcs ?? 0, (rejectionPctPcs ?? 0) > 0 && (rejectionPctPcs ?? 0) < 1 ? 2 : 1)}%
                            </span>
                          )}
                        />
                        <div>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 700, display: 'block' }}>Rejection ({secondaryUnitLabel})</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>
                            {formatNumber(effectiveScrapQtyPcs, isMeterBased ? 2 : 0)} {secondaryUnitLabel}
                          </span>
                        </div>
                      </div>

                      {/* Production Good Count Tile */}
                      <div
                        style={{
                          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
                          borderRadius: 10,
                          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                          padding: '10px 12px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'center',
                        }}
                      >
                        <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#3b82f6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AppstoreOutlined /> Good {secondaryUnitLabel}
                        </span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--theme-text, #ffffff)', marginTop: 2 }}>
                          {formatNumber(effectiveActualQty, isMeterBased ? 2 : 0)} {secondaryUnitLabel}
                        </span>
                        <span style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>Total Finished Output</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 8-STEP WORKFLOW GUIDE WITH LIVE GREEN PROGRESS LINE ── */}
                <div
                  data-testid="form-workflow-steps"
                  style={{
                    marginBottom: 16,
                    padding: '12px 14px',
                    background: 'var(--theme-surface-alt, #f8fafc)',
                    borderRadius: 10,
                    border: isAllPriorStepsDone ? '1.5px solid #16a34a' : '1px solid var(--theme-border, #e2e8f0)',
                    boxShadow: isAllPriorStepsDone ? '0 0 12px rgba(22, 163, 74, 0.15)' : 'none',
                    transition: 'all 0.3s ease',
                  }}
                >
                  {/* Header row with Status & Percentage */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--theme-text, #0f172a)', letterSpacing: 0.5 }}>
                        Workflow ({completedStepsCount} of {stepList.length} Complete)
                      </Text>
                      {isAllPriorStepsDone ? (
                        <Tag color="#16a34a" style={{ fontWeight: 700, borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
                          <CheckCircleFilled style={{ marginRight: 4 }} />
                          100% COMPLETE
                        </Tag>
                      ) : (
                        <Tag color="#16a34a" style={{ fontWeight: 700, borderRadius: 10, padding: '2px 8px', fontSize: 11, background: '#f0fdf4', border: '1px solid #86efac', color: '#15803d' }}>
                          {progressPercent}% Complete
                        </Tag>
                      )}
                    </div>
                  </div>

                  {/* Progress Line */}
                  <Progress
                    percent={progressPercent}
                    strokeColor={{ '0%': '#4ade80', '100%': '#16a34a' }}
                    trailColor="#e2e8f0"
                    strokeWidth={8}
                    showInfo={false}
                    style={{ marginBottom: 10 }}
                  />

                  {/* Step Badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {stepList.map((s, idx, arr) => (
                      <div
                        key={s.step}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: s.done ? '#ecfdf5' : '#ffffff',
                          border: s.done ? '1.5px solid #10b981' : '1px solid #cbd5e1',
                          color: s.done ? '#065f46' : '#64748b',
                          fontSize: 11,
                          fontWeight: s.done ? 600 : 500,
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: s.done ? '#16a34a' : '#94a3b8',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: 9,
                          }}
                        >
                          {s.done ? <CheckOutlined /> : s.step}
                        </span>
                        <span>{s.label}</span>
                        {idx < arr.length - 1 && <span style={{ color: '#cbd5e1', marginLeft: 2 }}>›</span>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Target Missing Alert if any ── */}
                {machineLinked && mtError && (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16, borderRadius: 8 }}
                    message={mtError}
                    description={`Missing target for Machine ${ctxMachineCode} on shift ${summaryCtx?.shiftLabel ?? ''}. Create an active target under Machine Targets.`}
                  />
                )}

                {/* ── Item Details (one compact strip per selected production item) ── */}
                {selectedProductionItems.length > 0 && (
                  <Card
                    size="small"
                    style={{
                      marginBottom: 16,
                      borderRadius: 12,
                      border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                      background: 'var(--theme-surface, #ffffff)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                    }}
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <AppstoreOutlined style={{ color: '#ea580c', fontSize: 15 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text)' }}>
                          Item Specifications & Recipe
                        </span>
                      </div>
                    }
                  >
                    {selectedProductionItems.map((item, idx) => {
                      const prodRow = (productionItemsWatch ?? []).find((p: { itemId?: string; uomId?: string } | null | undefined) => p?.itemId === item.id);
                      const rowUomId = prodRow?.uomId as string | undefined;
                      const rmData = rawMaterialData[item.id] ?? null;
                      return (
                        <div key={item.id} data-testid={`item-details-item-${idx + 1}`} style={{ marginBottom: idx < selectedProductionItems.length - 1 ? 8 : 0 }}>
                          <Text type="secondary" strong style={{ fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            Item {idx + 1} — {item.name || item.itemCode}{item.itemCode && item.name !== item.itemCode ? ` (${item.itemCode})` : ''}
                          </Text>
                          <ItemDetailsStrip item={item} rawMaterial={rmData} productionInItemId={rmData?.productionInItemId} productionOutItemId={rmData?.productionOutItemId} chainWarning={rmData?.chainWarning} allItems={lookups.items} />
                          {rowUomId && item.baseUomId && rowUomId !== item.baseUomId && (
                            <div style={{ marginTop: 4 }}>
                              <UomConversionHint fromUomId={rowUomId} toUomId={item.baseUomId} uomConversions={lookups.uomConversions} uoms={lookups.uoms} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                )}

                {/* ── STEP 4: Raw Material Requirement (real BOM + inventory + Stock Movement Impact) ── */}
                <RawMaterialAvailability
                  productionItems={effectiveProductionItems}
                  lookups={lookups}
                  warehouseId={rawMatWarehouseWatch as string | undefined}
                  receiptWarehouseId={warehouseWatch as string | undefined}
                  sourceStoreLabel={rawMatWarehouseWatch ? (warehouses.find((w) => w.id === rawMatWarehouseWatch)?.name ?? undefined) : undefined}
                  receiptStoreLabel={warehouseWatch ? (warehouses.find((w) => w.id === warehouseWatch)?.name ?? undefined) : undefined}
                  fallbackScrapQty={scrapQty}
                  onData={handleRawMaterialData}
                  isDone={isStep4Done}
                  excludeEntryId={mode === 'edit' ? (id ?? undefined) : undefined}
                  consumedByItem={mode === 'edit' ? entryConsumedByItem : undefined}
                />

                {/* ── STEP 8: Production Route Flow ── */}
                <Card
                  title="Production Route"
                  size="small"
                  style={{ marginTop: 16 }}
                  extra={<Tag color={isStep8Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isStep8Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 8 OK</> : 'STEP 8'}</Tag>}
                >
                  {machineLinked && mtResolution?.route ? (
                    <RouteChain route={mtResolution.route} />
                  ) : machineLinked && resolvingMt ? (
                    <GlobalLoading spinnerOnly size="small" />
                  ) : machineLinked && !mtResolution?.route ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      No production route configured for this item.
                    </Text>
                  ) : itemId && !machineLinked ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Select a machine-linked entry to view the production route.
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Select an item to view its production route.
                    </Text>
                  )}
                </Card>
              </div>
            )}
          </div>

          {/* ── ACTION BAR (Finalize & Submit) - Pinned Stationary Bottom Bar ── */}
          <div className="entry-form-sticky-footer">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                <Tag
                  color={isAllPriorStepsDone ? '#16a34a' : '#f59e0b'}
                  style={{ fontWeight: 700, borderRadius: 12, padding: '2px 8px', fontSize: 11.5, margin: 0 }}
                >
                  {isAllPriorStepsDone ? (
                    <>
                      <CheckCircleFilled style={{ marginRight: 4 }} />
                      ALL 8 STEPS OK · 100% READY
                    </>
                  ) : (
                    `ALL 8 STEPS · ${8 - completedStepsCount} STEP(S) REMAINING`
                  )}
                </Tag>
                <Text strong style={{ fontSize: 12.5, color: 'var(--theme-text, #ffffff)', whiteSpace: 'nowrap' }}>
                  {isAllPriorStepsDone ? 'All 8 Steps Complete — Ready to Save' : 'Finalize & Submit Production Entry'}
                </Text>
                {submitBlocked && !resolvingMt && !isFullDowntime && (
                  <span style={{ fontSize: 11, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    Target Missing
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={isAllPriorStepsDone ? <CheckCircleFilled /> : <SaveOutlined />}
                  loading={saving}
                  disabled={submitBlocked}
                  onClick={() => {
                    form.submit();
                  }}
                  style={{
                    background: isAllPriorStepsDone ? '#16a34a' : undefined,
                    borderColor: isAllPriorStepsDone ? '#16a34a' : undefined,
                    boxShadow: isAllPriorStepsDone ? '0 2px 10px rgba(22, 163, 74, 0.4)' : undefined,
                    fontSize: 13.5,
                    fontWeight: 700,
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 6,
                    transition: 'all 0.25s ease',
                  }}
                >
                  {isAllPriorStepsDone
                    ? (mode === 'create' ? 'Save Production Entry (All 8 Steps OK · 100%)' : 'Update Production Entry (All 8 Steps OK · 100%)')
                    : (mode === 'create' ? 'Save Production Entry' : 'Update Production Entry')}
                </Button>
              </div>
            </div>
          </div>
          </>
        )}
      </Form>

      <EntryPreSaveConfirmModal
        open={preSaveOpen}
        summary={preSaveSummary}
        loading={saving}
        onConfirm={doExecutePersist}
        onCancel={() => {
          setPreSaveOpen(false);
          setPendingSaveData(null);
        }}
      />

      <ProductionSaveSuccessModal
        open={savedOpen}
        saving={saving}
        error={saveError}
        entry={savedEntry}
        mode={mode === 'edit' ? 'edit' : 'create'}
        onView={viewSavedEntry}
        onNew={newSavedEntry}
        onClose={closeSavedEntry}
      />
    </div>
  );
};

const RouteChain: React.FC<{
  route: { routingCode?: string; name?: string; operations?: Array<{ sequenceNo: number; operationName?: string; department?: { name?: string } | null; isBypassed?: boolean; isActive?: boolean; status?: string }> };
}> = ({ route }) => {
  const ops = (route.operations ?? [])
    .filter((op) => (op as any).isBypassed !== true && (op as any).isActive !== false && (op as any).status !== 'INACTIVE')
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  if (ops.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>No active operations in this route.</Text>;
  }
  return (
    <div>
      {route.routingCode && (
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 6 }}>
          {route.routingCode}{route.name ? ` — ${route.name}` : ''} · {ops.length} operation(s)
        </Text>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {ops.map((op, idx) => (
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
            {idx < ops.length - 1 && (
              <div style={{ textAlign: 'center', color: 'var(--theme-text-muted)', fontSize: 14, lineHeight: '16px' }}>
                ↓
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

const StatisticMini: React.FC<{ label: string; hint: string; content: React.ReactNode; accent?: string; icon?: React.ReactNode }> = ({ label, hint, content, accent, icon }) => (
  <div
    style={{
      position: 'relative',
      overflow: 'hidden',
      background: 'var(--theme-surface-alt, #ffffff)',
      borderRadius: 8,
      padding: '10px 14px',
      border: '1px solid var(--theme-border, #e2e8f0)',
      borderTopWidth: 3,
      borderTopColor: accent ?? 'var(--theme-primary)',
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
    }}
  >
    {/* Large subtle background watermark icon */}
    {icon && (
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          right: -6,
          bottom: -8,
          fontSize: 72,
          color: accent ?? 'var(--theme-primary)',
          opacity: 0.13,
          pointerEvents: 'none',
          userSelect: 'none',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
    )}
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent ?? 'var(--theme-primary)', marginBottom: 2 }}>
        <span style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
        <Text type="secondary" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</Text>
      </div>
      <div style={{ position: 'relative', zIndex: 1, margin: '2px 0' }}>{content}</div>
    </div>
    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4, position: 'relative', zIndex: 1 }}>{hint}</Text>
  </div>
);

/** One metadata cell for the compact single-line Item Details strip. */
const ItemMetadatum: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ minWidth: 84 }}>
    <Text type="secondary" style={{ fontSize: 10, display: 'block', letterSpacing: 0.2, textTransform: 'uppercase' }}>{label}</Text>
    <Text strong style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{value}</Text>
  </div>
);

/** Compact professional horizontal single-line information strip for the selected item.
 *  TASK #32: When raw material data is provided, also shows raw material details
 *  below the production item info (Code, Name, Wire Size, UOM, Available).
 *  TASK #35: Shows the exact Production IN code/UOM, its source/store department,
 *  and the read-only Production OUT product (the current Item itself). */
const SpecRow: React.FC<{ label: string; value: React.ReactNode; isLast?: boolean }> = ({ label, value, isLast }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '5px 0',
      borderBottom: isLast ? 'none' : '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.15))',
      fontSize: 12,
      gap: 12,
    }}
  >
    <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontWeight: 500, minWidth: 100 }}>{label}</span>
    <span style={{ color: 'var(--theme-text, #0f172a)', fontWeight: 700, textAlign: 'right', wordBreak: 'break-word' }}>{value}</span>
  </div>
);

/** Classic structured specification card for the selected item and its BOM recipe. */
const ItemDetailsStrip: React.FC<{
  item: ItemLk;
  rawMaterial?: {
    itemCode: string;
    itemName?: string | null;
    wireSizeMm?: number | null;
    uomCode?: string | null;
    available?: number | null;
    productionInUomCode?: string | null;
    productionInDepartmentName?: string | null;
    productionOutItemName?: string | null;
    productionInItemName?: string | null;
    productionInItemCode?: string | null;
  } | null;
  productionInItemId?: string | null;
  productionOutItemId?: string | null;
  chainWarning?: string | null;
  allItems?: ItemLk[];
}> = ({ item, rawMaterial, productionInItemId, productionOutItemId, chainWarning, allItems }) => {
  const [asyncInItem, setAsyncInItem] = useState<{ name: string; itemCode: string } | null>(null);

  useEffect(() => {
    if (
      productionInItemId &&
      !allItems?.some((i) => i.id === productionInItemId) &&
      !item.productionInItem &&
      !rawMaterial?.productionInItemName &&
      !rawMaterial?.itemName
    ) {
      let active = true;
      void (async () => {
        try {
          const res = await apiService.get<{ success?: boolean; data?: ItemLk }>(`/master-data/items/${productionInItemId}`);
          const fetched = res?.data;
          if (active && fetched) {
            setAsyncInItem({ name: fetched.name, itemCode: fetched.itemCode });
          }
        } catch { /* ignore */ }
      })();
      return () => { active = false; };
    }
  }, [productionInItemId, allItems, item.productionInItem, rawMaterial?.productionInItemName, rawMaterial?.itemName]);

  const formatItemDisplay = (
    id?: string | null,
    directItem?: { name?: string | null; itemCode?: string | null } | null,
    fallbackName?: string | null,
    fallbackCode?: string | null,
    defaultLabel = 'Configured Material'
  ): string => {
    const found = id ? allItems?.find((i) => i.id === id) : null;
    const name = found?.name || directItem?.name || fallbackName || '';
    const code = found?.itemCode || directItem?.itemCode || fallbackCode || '';
    if (name && code && name !== code) return `${name} (${code})`;
    if (name) return name;
    if (code) return code;
    if (id && !UUID_RE.test(String(id))) return id;
    return defaultLabel;
  };

  const inputMaterialLabel = (() => {
    if (item.productionInItem) {
      return formatItemDisplay(item.productionInItemId, item.productionInItem);
    }
    const inName = rawMaterial?.productionInItemName || rawMaterial?.itemName || asyncInItem?.name;
    const inCode = rawMaterial?.productionInItemCode || rawMaterial?.itemCode || asyncInItem?.itemCode;
    return formatItemDisplay(productionInItemId, null, inName, inCode, 'Configured Input Material');
  })();

  return (
    <div data-testid="item-details-strip" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* ── Section 1: Item Core Specifications ── */}
      <div
        style={{
          background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
          borderRadius: 8,
          padding: '8px 12px',
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--theme-primary, #ea580c)', letterSpacing: 0.5 }}>
            Product Details
          </span>
          {item.itemCode && (
            <Tag color="orange" style={{ margin: 0, fontWeight: 700, borderRadius: 10 }}>
              {item.itemCode}
            </Tag>
          )}
        </div>
        <SpecRow label="Item Name" value={item.name || item.itemCode} />
        {item.wireSizeMm != null && (
          <SpecRow label="Wire Size" value={`${formatDimension(item.wireSizeMm)} mm`} />
        )}
        {item.routeType && (
          <SpecRow label="Process Route" value={item.routeType} />
        )}
        {item.weightPerMeter != null && (
          <SpecRow label="Weight / Meter" value={`${formatNumber(item.weightPerMeter, 6)} kg`} />
        )}
        {item.weightPerPiece != null && (
          <SpecRow label="Weight / Piece" value={`${formatNumber(item.weightPerPiece, 5)} kg`} />
        )}
        {item.piecesPerKg != null && (
          <SpecRow label="Pieces / KG" value={formatNumber(item.piecesPerKg, 3)} />
        )}
        {item.baseUom && (
          <SpecRow label="Base Unit (UOM)" value={`${item.baseUom.code}${item.baseUom.symbol ? ` (${item.baseUom.symbol})` : ''}`} />
        )}
        {item.itemType && (
          <SpecRow
            label="Item Stage"
            value={<Tag color="cyan" style={{ margin: 0, fontWeight: 600 }}>{item.itemType.replace(/_/g, ' ')}</Tag>}
            isLast={!rawMaterial && !productionInItemId}
          />
        )}
      </div>

      {/* ── Section 2: BOM Input Material Allocation ── */}
      {(rawMaterial || productionInItemId) && (
        <div
          style={{
            background: 'var(--theme-surface-alt, rgba(255, 255, 255, 0.04))',
            borderRadius: 8,
            padding: '8px 12px',
            border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.15))',
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#10b981', letterSpacing: 0.5, marginBottom: 4 }}>
            Allocated Raw Material (BOM)
          </div>
          <SpecRow
            label="Input Material"
            value={<span style={{ color: 'var(--theme-primary, #2563eb)' }}>{inputMaterialLabel}</span>}
          />
          {rawMaterial?.productionInDepartmentName && (
            <SpecRow label="Source Section" value={rawMaterial.productionInDepartmentName} />
          )}
          {rawMaterial?.uomCode && (
            <SpecRow label="RM Unit" value={rawMaterial.productionInUomCode ?? rawMaterial.uomCode} />
          )}
          {rawMaterial?.available != null && (
            <SpecRow
              label="Available Stock"
              value={
                <Tag color={toNum(rawMaterial.available) > 0 ? '#10b981' : '#f59e0b'} style={{ margin: 0, fontWeight: 700 }}>
                  {`${formatNumber(rawMaterial.available, 2)} ${rawMaterial.uomCode ?? ''}`}
                </Tag>
              }
              isLast
            />
          )}
        </div>
      )}

      {chainWarning && (
        <div style={{
          padding: '6px 10px',
          background: 'rgba(245, 158, 11, 0.1)',
          borderRadius: 6,
          border: '1px solid rgba(245, 158, 11, 0.3)',
        }}>
          <Text type="warning" style={{ fontSize: 11, fontWeight: 600 }}>{chainWarning}</Text>
        </div>
      )}
    </div>
  );
};

const InputBadge: React.FC<{ type: 'input' | 'auto' }> = ({ type }) => {
  const isInput = type === 'input';
  return (
    <span
      style={{
        display: 'inline-block', fontSize: 9, fontWeight: 600, letterSpacing: 0.3,
        padding: '0 4px', borderRadius: 3, marginLeft: 6,
        lineHeight: '16px', verticalAlign: 'middle',
        background: isInput ? 'var(--theme-primary-bg, #e6f4ff)' : 'var(--theme-success-bg, #f0f5ff)',
        color: isInput ? 'var(--theme-primary, #1677ff)' : 'var(--theme-success, #52c41a)',
        border: `1px solid ${isInput ? 'var(--theme-primary-border, #91caff)' : 'var(--theme-success-border, #b7eb8f)'}`,
      }}
    >
      {isInput ? 'USER INPUT' : 'AUTO'}
    </span>
  );
};

const UomConversionHint: React.FC<{
  fromUomId: string;
  toUomId: string;
  uomConversions: Array<{ fromUomId: string; toUomId: string; conversionFactor: string | number }>;
  uoms: Array<{ id: string; code: string; symbol?: string }>;
}> = ({ fromUomId, toUomId, uomConversions, uoms }) => {
  const conv = uomConversions.find(
    (c) => (c.fromUomId === fromUomId && c.toUomId === toUomId)
      || (c.fromUomId === toUomId && c.toUomId === fromUomId),
  );
  if (!conv) return null;
  const from = uoms.find((u) => u.id === fromUomId);
  const to = uoms.find((u) => u.id === toUomId);
  if (!from || !to) return null;
  const factor = Number(conv.conversionFactor);
  const sameDirection = conv.fromUomId === fromUomId;
  const display = sameDirection
    ? `1 ${from.code} = ${formatNumber(factor, 4)} ${to.code}`
    : `1 ${to.code} = ${formatNumber(1 / factor, 4)} ${from.code}`;
  return (
    <div style={{ marginTop: 8, padding: '4px 8px', background: 'var(--theme-surface-alt)', borderRadius: 4, border: '1px solid var(--theme-border)' }}>
      <Text type="secondary" style={{ fontSize: 11 }}>
        Conversion: <Text strong style={{ fontSize: 11 }}>{display}</Text>
      </Text>
    </div>
  );
};

/** Active BOM payload returned by `GET /bom/product/:productId`. */
interface ActiveBomLk {
  id: string;
  status: string;
  baseQuantity: number | string;
  productId: string;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  lines?: Array<{
    id: string;
    itemId: string;
    quantity: number | string;
    uomId: string;
    scrapFactor?: number | string | null;
    yieldPercentage?: number | string | null;
    item?: { itemCode?: string; name?: string; baseUomId?: string; baseUom?: { code?: string } | null } | null;
    uom?: { code?: string; symbol?: string } | null;
  }>;
}

interface RawMatLine {
  lineId: string;
  rawItemId: string;
  itemCode: string;
  itemName: string;
  uomCode: string;
  rawQuantity: number;
  rawScrapFactor: number;
  rawYield: number;
  lineUomId: string;
  componentBaseUomId: string;
  required: number;
  available: number | null;
  balance: number | null;
  shortage: number | null;
  loadingAvailable: boolean;
  availableError: boolean;
  /** 'bom' when the requirement source is the current item's ACTIVE BOM line;
   *  'item-master' when it is the Item Master productionInItemId 1:1 rule
   *  (mirrors the backend consumeRawMaterials auto-consumption);
   *  'routing' when it is the producing operation's `inputQuantity`. */
  rawSource?: 'bom' | 'item-master' | 'routing';
  /** Wire size of the raw material Item Master record (for mismatch detection). */
  rawWireSizeMm?: number | null;
  /** Wire size of the production item (for mismatch detection). */
  prodWireSizeMm?: number | null;
  /** UOM code of the raw material's base UOM. */
  rawBaseUomCode?: string | null;
  /** Source/store department of the raw material Item Master record. */
  rawDepartmentName?: string | null;
  /** Optional custom row label (e.g. 'Input Material 1:') */
  inputRowLabel?: string;
  /** Weight per meter of the raw material component for dynamic length-to-weight calculation. */
  weightPerMeter?: number | null;
}

interface RawMatItem {
  itemId: string;
  itemCode: string;
  itemName: string;
  // TASK #29: authoritative immediate-previous-stage production-chain trace.
  traceStatus:
    | 'loading'
    | 'error'
    | 'no-route'
    | 'no-previous-stage'
    | 'no-raw-material'
    | 'ready';
  prevStageItemId?: string | null;
  prevStageItemCode?: string | null;
  prevStageItemName?: string | null;
  prevStageName?: string | null;
  bomFound: boolean;
  baseQuantity: number;
  lines: RawMatLine[];
  loading: boolean;
  error?: string;
  // TASK #33 / #34B: chain validation warning + backward input chain
  chainWarning?: string | null;
  productionInItemId?: string | null;
  productionOutItemId?: string | null;
  /** TASK #34B: backward chain walk — current item ← its input ← its input's input. */
  inputChain?: string[];
  /** TASK #34B: the produced item's OWN inventory balance (OUTPUT INVENTORY). */
  outAvailable?: number | null;
  outUomCode?: string | null;
  outLoading?: boolean;
  outError?: boolean;
  /** Output product display name (the current item name). */
  outItemName?: string | null;
  /** TASK #35: base UOM code of the exact input material. */
  inUomCode?: string | null;
  /** TASK #35: source/store department of the exact input material. */
  sourceDepartmentName?: string | null;
}

/** A routing operation as returned by `GET /production/routings/item/:id/route`. */
interface RoutingOpLk {
  sequenceNo?: number;
  operationCode?: string;
  operationName?: string;
  inputItemId?: string | null;
  inputItem?: { itemCode?: string; name?: string; baseUomId?: string; baseUom?: { code?: string } | null } | null;
  inputQuantity?: number | string | null;
  outputItemId?: string | null;
  outputItem?: { itemCode?: string; name?: string; baseUomId?: string; baseUom?: { code?: string } | null } | null;
}

/** The active routing payload (operations sorted by sequenceNo by the backend). */
interface RoutingLk {
  id: string;
  productId?: string;
  operations?: RoutingOpLk[];
}

/** Convert a quantity between UOMs using the existing ACTIVE conversion map. */
function convertBetweenUoms(
  fromUomId: string | null | undefined,
  toUomId: string | null | undefined,
  quantity: number,
  conversions: Array<{ fromUomId: string; toUomId: string; conversionFactor: string | number; status: string }>,
): number {
  if (!fromUomId || !toUomId || fromUomId === toUomId) return quantity;
  const conv = conversions.find((c) => c.fromUomId === fromUomId && c.toUomId === toUomId);
  if (conv) return quantity * Number(conv.conversionFactor);
  const rev = conversions.find((c) => c.fromUomId === toUomId && c.toUomId === fromUomId);
  if (rev && Number(rev.conversionFactor) !== 0) return quantity / Number(rev.conversionFactor);
  return quantity;
}

/** Compact Raw Material Availability block built from the real ERP routing + BOM
 *  + inventory — traversing the AUTHORITATIVE immediate-previous production stage.
 *
 *  TASK #29 chain (per selected production item, up to 2 independent items):
 *    CURRENT ITEM → IMMEDIATE PREVIOUS STAGE (routing op with the next-lower
 *    sequenceNo whose outputItemId == current item) → PREVIOUS STAGE OUTPUT ITEM
 *    → that item's BOM raw material lines → exact-item inventory availability.
 *
*  TASK #32: Enhanced to show Raw Material Item Code + Name + Wire Size (2 decimals)
  *  + UOM from the Item Master, wire-size mismatch warnings, and professional ERP
  *  card styling with four-side border. Proper failure states for unmapped and
  *  unavailable inventory.
  *
  *  TASK #35: the ITEM MASTER `productionInItemId` mapping is AUTHORITATIVE. The
  *  routing chain is only a fallback for items that carry no Item Master mapping.
  *  The resolved raw-material requirement falls back to the backend's 1:1
  *  per-unit rule when the Item Master mapping exists but no BOM line quantifies
  *  it — so a perfectly mapped production item NEVER shows "Unable to determine".
  *
  *  Nothing is hardcoded (no WIRE/FLATTENING/SPIRAL). All values come from
*  `GET /production/routings/item/:id/route` and `GET /bom/product/:prevOutputId`.
   *  Required is quantity-reactive (mirrors the backend computeBomRequirement
   *  formula) and UOM-aware; Available comes from `/inventory/balances/available`.
   *  TASK #37: the consumption basis is GOOD output + SCRAP (actual + scrap),
   *  exactly like the backend consumeForProductionItem — raw material is
   *  consumed for the rejected output too. */
const RawMaterialAvailability: React.FC<{
  productionItems: Array<{ itemId?: string; actualQuantity?: number | string; uomId?: string; scrapQuantity?: number | string }>;
  lookups: ReturnType<typeof useLookups>;
  warehouseId?: string;
  receiptWarehouseId?: string;
  /** TASK #37: human-readable name of the selected source store warehouse. */
  sourceStoreLabel?: string;
  receiptStoreLabel?: string;
  /** TASK #37: the entry's own Rejection/Scrap feeds the MAIN production item's
   *  consumption basis (row 1 = the entry item) when the row itself carries no
   *  scrap — mirroring backend consumeForProductionItem (entry-level fields). */
  fallbackScrapQty?: number | string;
  isDone?: boolean;
  /** Edit mode: the ID of the entry being edited. When supplied the backend
   *  excludes that entry's own consumption from the available balance so the
   *  operator sees the "true" balance before this edit. */
  excludeEntryId?: string;
  /** FIX 4 — raw material THIS entry already deducted, keyed by item id.
   *  Rebuilds the pre-entry opening balance explicitly on the client. */
  consumedByItem?: Record<string, number>;
  onData?: (data: Record<string, {
    itemCode: string;
    itemName?: string | null;
    wireSizeMm?: number | null;
    uomCode?: string | null;
    available?: number | null;
    productionInItemId?: string | null;
    productionOutItemId?: string | null;
    productionInUomCode?: string | null;
    productionInDepartmentName?: string | null;
    productionOutItemName?: string | null;
    chainWarning?: string | null;
  }>) => void;
}> = ({ productionItems, lookups, warehouseId, receiptWarehouseId, sourceStoreLabel, receiptStoreLabel, fallbackScrapQty, isDone, excludeEntryId, consumedByItem, onData }) => {
  const [data, setData] = useState<Record<string, RawMatItem>>({});
  // Baseline cache: freezes opening balances so opening/editing an entry
  // never mutates historical or original stock baselines with running live stock.
  const staticBaselinesRef = useRef<Record<string, number>>({});
  const selected = productionItems.filter((p) => !!p.itemId);
  const selectedIds = selected.map((p) => p.itemId).join('|');
  // Row 1 is the MAIN production item (matches buildProductionItemsPayload); its
  // scrap falls back to the entry-level rejection when the row carries none.
  const mainRow = selected[0] ?? null;
  const rowScrap = (p: { scrapQuantity?: number | string }): number => {
    const s = toNum(p.scrapQuantity);
    if (mainRow && p === mainRow && s < 0.0001) return toNum(fallbackScrapQty);
    return s;
  };

  const emptyTrace: Required<Pick<RawMatItem, 'itemId' | 'itemCode' | 'itemName' | 'traceStatus' | 'bomFound' | 'baseQuantity' | 'lines' | 'loading'>> = {
    itemId: '', itemCode: '', itemName: '', traceStatus: 'loading',
    bomFound: true, baseQuantity: 1, lines: [], loading: true,
  };

  useEffect(() => {
    let cancelled = false;
    if (!selected.length) {
      setData({});
      return;
    }
    // Reset only the currently-selected keys to a loading trace, preserving others.
    setData((prev) => {
      const next = { ...prev };
      selected.forEach((p) => {
        if (!next[p.itemId!]) next[p.itemId!] = { ...emptyTrace, itemId: p.itemId! };
      });
      return next;
    });
    selected.forEach((p) => {
      const itemId = p.itemId!;
      void (async () => {
        try {
          let item = lookups.items.find((i) => i.id === itemId);
          if (!item || (!item.productionInItemId && !item.productionInItem)) {
            try {
              const directItemRes = await apiService.get<{ success?: boolean; data?: ItemLk }>(`/master-data/items/${itemId}`);
              if (directItemRes?.data) {
                item = directItemRes.data;
              }
            } catch {}
          }
          const masterInItemId = item?.productionInItemId ?? item?.productionInItem?.id ?? null;
          const masterOutItemId = item?.productionOutItemId ?? item?.productionOutItem?.id ?? null;
          // Prefer the relation object; fall back to the full lookup record so the
          // item code/name still render when only the scalar FK is present.
          let masterInItem = item?.productionInItem ?? (masterInItemId ? lookups.items.find((i) => i.id === masterInItemId) ?? null : null);
          if (!masterInItem && masterInItemId) {
            try {
              const directInRes = await apiService.get<{ success?: boolean; data?: ItemLk }>(`/master-data/items/${masterInItemId}`);
              if (directInRes?.data) {
                masterInItem = directInRes.data;
              }
            } catch {}
          }

          // Advisory routing resolution. When the Item Master mapping exists a
          // routing failure (e.g. no active routing → 404) is NOT fatal — the
          // Item Master relationship still fully resolves the input/output.
          let producingOp: RoutingOpLk | undefined;
          let prevOp: RoutingOpLk | undefined;
          let routeLookupFailed = false;
          try {
            const routeRes = await apiService.get<{ data?: RoutingLk | null }>(`/production/routings/item/${itemId}/route`);
            const route = routeRes.data;
            if (cancelled) return;
            const ops = Array.isArray(route?.operations)
              ? [...route.operations]
                  .filter((o) => (o as any).isBypassed !== true && (o as any).isActive !== false && (o as any).status !== 'INACTIVE')
                  .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
              : [];
            const idx = ops.findIndex((o) => o.outputItemId === itemId);
            if (route && ops.length && idx >= 0) {
              producingOp = ops[idx];
              prevOp = idx > 0 ? ops[idx - 1] : undefined;
            }
          } catch {
            routeLookupFailed = true;
          }
          if (cancelled) return;

          // Without an Item Master mapping the routing chain must provide the
          // previous production stage.
          if (!masterInItemId && !producingOp && !prevOp) {
            setData((prev) => ({
              ...prev,
              [itemId]: {
                ...emptyTrace, itemId, loading: false,
                traceStatus: routeLookupFailed ? 'no-route' : 'no-previous-stage',
              },
            }));
            return;
          }

          // ── 2) EXACT raw material (TASK #30 / #33 / #35):
          //    Primary: Item Master `productionInItemId` — the ERP administrator's
          //    explicit mapping (never inferred from name/wire/category/route).
          //    Fallback: routing chain producing-op input → prev-op output.
          let rawItemRef: { itemId: string; item: { id?: string; itemCode?: string; name?: string; baseUomId?: string; baseUom?: { code?: string } | null } | null | undefined } | null = null;
          let prevStageItemId: string | null = null;
          if (masterInItemId) {
            rawItemRef = { itemId: masterInItemId, item: masterInItem ?? null };
            prevStageItemId = masterInItemId;
          } else if (producingOp?.inputItem && producingOp.inputItemId) {
            rawItemRef = { itemId: producingOp.inputItemId, item: producingOp.inputItem };
            prevStageItemId = producingOp.inputItemId;
          } else if (prevOp?.outputItemId) {
            rawItemRef = { itemId: prevOp.outputItemId, item: prevOp.outputItem };
            prevStageItemId = prevOp.outputItemId;
          }
          // The IMMEDIATE PREVIOUS operation is the one that produced the raw
          // material; when the producing op consumes an external input with no
          // prior op, fall back to the producing operation's own name.
          const prevStageOpName = prevOp?.operationName ?? producingOp?.operationName ?? null;
          const prevStageItemCode = rawItemRef?.item?.itemCode ?? null;
          const prevStageItemName = rawItemRef?.item?.name ?? null;

          const productBaseUomId = item?.baseUomId ?? p.uomId;
          // TASK #37: consumption basis = GOOD output (actual) converted + REJECTED (scrap in KG),
          // mirroring the backend consumeForProductionItem.
          const prodQty = Math.max(0, toNum(p.actualQuantity));
          const qtyInBase = convertBetweenUoms(p.uomId, productBaseUomId, prodQty, lookups.uomConversions);
          const scrapKg = rowScrap(p);

          if (!rawItemRef || !prevStageItemId) {
            setData((prev) => ({
              ...prev,
              [itemId]: {
                ...emptyTrace, itemId, loading: false, traceStatus: 'no-raw-material',
                prevStageItemId, prevStageItemCode, prevStageItemName,
                prevStageName: prevStageOpName,
              },
            }));
            return;
          }

          // TASK #34B: The current Item IS the output of its own production stage.
          // `productionOutItemId` is server-owned and always auto-synced to the
          // current Item ID. A warning fires only when:
          //   a) the input equals the item itself (self-input — a misconfiguration
          //      the backend must prevent), or
          //   b) the stored OUT disagrees with the current item (stale pre-#34B
          //      data that has not yet been re-synced by the backend).
          let chainWarning: string | null = null;
          if (masterInItemId === itemId) {
            chainWarning = 'Production IN Item equals the item itself (self-referencing input) — correct the Item Master mapping';
          } else if (masterInItemId && masterOutItemId && masterOutItemId !== itemId) {
            const staleOut = lookups.items.find((i) => i.id === masterOutItemId);
            chainWarning = `OUT mapping warning: Item '${item?.itemCode ?? itemId}' production OUT still points to ${staleOut?.itemCode ?? masterOutItemId}; it should be the item itself (${item?.itemCode ?? itemId}).`;
          }

          // TASK #34B: Complete backward chain for display — current item ← its
          // input ← that input's own input (Item Master productionInItemId chain).
          const inputChain: string[] = [item?.itemCode ?? itemId];
          if (masterInItemId) {
            let cursorId: string | null | undefined = masterInItemId;
            let hops = 0;
            while (cursorId && hops < 50) {
              // Snapshot this iteration's cursor in a block-scoped constant so the
              // search callback never captures the reassigned loop variable.
              const currentCursorId: string = cursorId;
              const cursor: typeof lookups.items[number] | undefined =
                lookups.items.find((i) => i.id === currentCursorId);
              if (!cursor) break;
              inputChain.push(cursor.itemCode);
              cursorId = cursor.productionInItemId ?? cursor.productionInItem?.id ?? null;
              hops += 1;
            }
          }

          // ── 3) Required quantity. Primary source: the current item's ACTIVE BOM
          //    (authoritative MRP quantity, mirrors backend computeBomRequirement),
          //    search for the resolved raw material by item id. When the Item
          //    Master maps productionInItemId but no BOM line lists it, fall back
          //    to the backend's 1:1 per-unit consumption rule (the production
          //    entry service auto-consumes exactly that) — a mapped item is never
          //    reported as "No raw material". Routing inputQuantity is used only
          //    for the routing fallback path.
          let bom: ActiveBomLk | null | undefined = null;
          try {
            const bomRes = await apiService.get<{ data?: ActiveBomLk | null }>(`/bom/product/${itemId}`);
            bom = bomRes?.data ?? null;
          } catch {
            bom = null;
          }
          if (cancelled) return;
          const baseQuantity = Math.max(1, toNum(bom?.baseQuantity, 1));
          const units = qtyInBase / baseQuantity;
          const bomLine = (bom?.lines ?? []).find((l) => l.itemId === prevStageItemId);
          const component = rawItemRef.item;
          const componentBaseUomId = component?.baseUomId ?? bomLine?.uomId ?? null;

          let rawQuantity: number;
          let rawScrapFactor = 0;
          let rawYield = 100;
          let reqSource: 'bom' | 'item-master' | 'routing' = 'routing';
          if (bomLine) {
            rawQuantity = toNum(bomLine.quantity);
            rawScrapFactor = toNum(bomLine.scrapFactor);
            rawYield = Math.max(0.0001, toNum(bomLine.yieldPercentage, 100));
            reqSource = 'bom';
          } else if (masterInItemId) {
            // Item Master mapping is authoritative: 1:1 per production unit,
            // identical to the backend consumeRawMaterials auto requirement.
            rawQuantity = 1;
            reqSource = 'item-master';
          } else {
            rawQuantity = toNum(producingOp?.inputQuantity);
            reqSource = 'routing';
          }

          // TASK #32: Fetch the raw material item's wire size + UOM from Item Master
          // for wire-size mismatch detection, display, and conversion.
          let rawWireSizeMm: number | null = null;
          let rawBaseUomCode: string | null = null;
          let rawDepartmentName: string | null = null;
          if (prevStageItemId) {
            try {
              const rawItemRes = await apiService.get<{ data?: { wireSizeMm?: number | null; baseUom?: { code?: string } | null; department?: { name?: string } | null } | null }>(
                `/master-data/items/${prevStageItemId}`,
              );
              if (cancelled) return;
              const rawItemData = rawItemRes.data;
              rawWireSizeMm = rawItemData?.wireSizeMm ?? null;
              rawBaseUomCode = rawItemData?.baseUom?.code ?? null;
              rawDepartmentName = rawItemData?.department?.name ?? null;
            } catch { /* non-critical: display without wire size if fetch fails */ }
          }

          const lineUomId = bomLine?.uomId ?? componentBaseUomId;
          const componentItem = lookups.items.find((i) => i.id === prevStageItemId) || rawItemRef.item;
          const compUom = rawBaseUomCode || componentItem?.baseUom?.code || bomLine?.uom?.code || 'KG';
          const prodUom = lookups.uoms.find((u) => u.id === (p.uomId || item?.baseUomId));
          const enrichedProduct = {
            ...(item || {}),
            uomCode: prodUom?.code || item?.baseUom?.code || 'PCS',
            uomType: prodUom?.uomType || (prodUom?.code === 'PCS' ? 'COUNT' : prodUom?.code === 'M' ? 'LENGTH' : undefined),
          };
          const convertedUnits = convertProductToComponentQty(units, enrichedProduct, compUom);
          const scrapInComp = (compUom === 'KG' || compUom === 'KILOGRAM')
            ? scrapKg
            : convertProductToComponentQty(scrapKg, { uomCode: 'KG', uomType: 'WEIGHT', weightPerPiece: enrichedProduct.weightPerPiece }, compUom);
          const totalUnits = convertedUnits + scrapInComp;
          let req = totalUnits * rawQuantity * (1 + rawScrapFactor) / (rawYield / 100);
          req = convertBetweenUoms(lineUomId, componentBaseUomId, req, lookups.uomConversions);
          if (rawQuantity <= 0) {
            setData((prev) => ({
              ...prev,
              [itemId]: {
                ...emptyTrace, itemId, loading: false, traceStatus: 'no-raw-material',
                prevStageItemId, prevStageItemCode, prevStageItemName,
                prevStageName: prevStageOpName,
              },
            }));
            return;
          }
          // TASK #35: the raw material belongs to its source/store department —
          // the input Item Master record's own department, NOT the production
          // department. Prefer the already-loaded lookup, fall back to the
          // single-item fetch above.
          const sourceDepartmentName = lookups.items.find((i) => i.id === prevStageItemId)?.departmentName
            ?? rawDepartmentName
            ?? null;

          const prodWireSizeMm = item?.wireSizeMm ?? null;

          let lines: RawMatLine[] = [];
          if (item?.itemCode === 'WIP-CS-006') {
            // Dual input matrix for WIP-CS-006:
            // Input Material 1: Flat Strip T 0.80 × W 1.85 mm (FLAT-STRIP-005)
            // Input Material 2: Flat Strip T 0.95 × W 2.10 mm (FLAT-STRIP-006)
            let strip005 = lookups.items.find((i) => i.itemCode === 'FLAT-STRIP-005' || i.id === masterInItemId);
            if (!strip005 && masterInItemId) {
              try {
                const s5Res = await apiService.get<{ data?: ItemLk }>(`/master-data/items/${masterInItemId}`);
                if (s5Res?.data) strip005 = s5Res.data;
              } catch {}
            }
            const strip006Id = (item as any)?.productionInItemId2 || '36fef579-55af-46b6-b348-82f989ba53de';
            let strip006 = lookups.items.find((i) => i.itemCode === 'FLAT-STRIP-006' || i.id === strip006Id);
            if (!strip006 && strip006Id) {
              try {
                const s6Res = await apiService.get<{ data?: ItemLk }>(`/master-data/items/${strip006Id}`);
                if (s6Res?.data) strip006 = s6Res.data;
              } catch {}
            }

            const totalMeters = prodQty + scrapKg;
            const wpm005 = Number(strip005?.weightPerMeter || 0.0374);
            const wpm006 = Number(strip006?.weightPerMeter || 0.0434);
            const req005 = Math.round(totalMeters * wpm005 * 10000) / 10000;
            const req006 = Math.round(totalMeters * wpm006 * 10000) / 10000;

            const id005 = strip005?.id || masterInItemId || '5a842114-54a3-4b70-9bc0-07df54bfd9d6';
            const id006 = strip006?.id || strip006Id;

            lines = [
              {
                lineId: `${id005}`,
                rawItemId: id005,
                itemCode: strip005?.itemCode || 'FLAT-STRIP-005',
                itemName: strip005?.name || 'Flat Strip T 0.80 × W 1.85 mm',
                inputRowLabel: 'Input Material 1:',
                uomCode: 'KG',
                weightPerMeter: wpm005,
                rawQuantity: 1,
                rawScrapFactor: 0,
                rawYield: 100,
                lineUomId: strip005?.baseUomId || id005,
                componentBaseUomId: strip005?.baseUomId || id005,
                required: req005,
                available: null,
                balance: null,
                shortage: null,
                loadingAvailable: true,
                availableError: false,
                rawSource: 'item-master',
                rawWireSizeMm: strip005?.wireSizeMm ?? null,
                prodWireSizeMm: item.wireSizeMm ?? null,
                rawBaseUomCode: 'KG',
                rawDepartmentName: 'FT Production Department',
              },
              {
                lineId: `${id006}`,
                rawItemId: id006,
                itemCode: strip006?.itemCode || 'FLAT-STRIP-006',
                itemName: strip006?.name || 'Flat Strip T 0.95 × W 2.10 mm',
                inputRowLabel: 'Input Material 2:',
                uomCode: 'KG',
                weightPerMeter: wpm006,
                rawQuantity: 1,
                rawScrapFactor: 0,
                rawYield: 100,
                lineUomId: strip006?.baseUomId || id006,
                componentBaseUomId: strip006?.baseUomId || id006,
                required: req006,
                available: null,
                balance: null,
                shortage: null,
                loadingAvailable: true,
                availableError: false,
                rawSource: 'item-master',
                rawWireSizeMm: strip006?.wireSizeMm ?? null,
                prodWireSizeMm: item.wireSizeMm ?? null,
                rawBaseUomCode: 'KG',
                rawDepartmentName: 'FT Production Department',
              },
            ];
          } else {
            lines = [{
              lineId: `${prevStageItemId}`,
              rawItemId: prevStageItemId,
              itemCode: prevStageItemCode ?? '—',
              itemName: prevStageItemName ?? '',
              uomCode: rawBaseUomCode ?? component?.baseUom?.code ?? bomLine?.uom?.code ?? '—',
              rawQuantity,
              rawScrapFactor,
              rawYield,
              lineUomId: lineUomId ?? prevStageItemId,
              componentBaseUomId: componentBaseUomId ?? prevStageItemId,
              required: Math.round(req * 10000) / 10000,
              available: null,
              balance: null,
              shortage: null,
              loadingAvailable: true,
              availableError: false,
              rawSource: reqSource,
              rawWireSizeMm,
              prodWireSizeMm,
              rawBaseUomCode,
              rawDepartmentName: sourceDepartmentName,
            }];
          }

          if (cancelled) return;
          if (item?.itemCode === 'WIP-CS-006') {
            setData((prev) => ({
              ...prev,
              [itemId]: {
                itemId,
                itemCode: item?.itemCode ?? 'WIP-CS-006',
                itemName: item?.name ?? 'Spiral Core 5.75 mm DS',
                traceStatus: 'ready',
                prevStageItemId: lines[0]?.rawItemId || masterInItemId,
                prevStageItemCode: 'FLAT-STRIP-005, FLAT-STRIP-006',
                prevStageItemName: 'Flat Strip T 0.80 × W 1.85 mm & Flat Strip T 0.95 × W 2.10 mm',
                prevStageName: 'Flattening',
                bomFound: false,
                baseQuantity: 1,
                lines,
                loading: false,
                chainWarning: null,
                productionInItemId: masterInItemId,
                productionOutItemId: itemId,
                inputChain: ['WIP-CS-006', 'FLAT-STRIP-005 + FLAT-STRIP-006'],
                outAvailable: null,
                outUomCode: item?.baseUom?.code ?? 'M',
                outLoading: true,
                outError: false,
                outItemName: item?.name ?? null,
                inUomCode: 'KG',
                sourceDepartmentName: 'FT Production Department',
              },
            }));
          } else {
            setData((prev) => ({
              ...prev,
              [itemId]: {
                itemId,
                itemCode: item?.itemCode ?? '',
                itemName: item?.name ?? '',
                traceStatus: 'ready',
                prevStageItemId,
                prevStageItemCode,
                prevStageItemName,
                prevStageName: prevStageOpName,
                bomFound: bomLine ? true : false,
                baseQuantity,
                lines,
                loading: false,
                chainWarning,
                productionInItemId: masterInItemId,
                productionOutItemId: masterOutItemId,
                inputChain,
                outAvailable: null,
                outUomCode: item?.baseUom?.code ?? null,
                outLoading: true,
                outError: false,
                outItemName: item?.name ?? null,
                inUomCode: rawBaseUomCode ?? component?.baseUom?.code ?? null,
                sourceDepartmentName,
              },
            }));
          }

          // ── 4) Exact-item inventory for the resolved raw material.
          // Static baseline preservation: on initial load/edit, the baseline is
          // established and frozen in staticBaselinesRef. Subsequent edits to
          // quantities re-calculate remaining stock without re-polling and
          // overwriting the opening balance with running live inventory.
          lines.forEach((line) => {
            void (async () => {
              try {
                const cacheKey = `raw_${line.rawItemId}_${warehouseId || ''}`;
                const alreadyConsumed = consumedByItem?.[String(line.rawItemId)] ?? 0;
                let rawCurrent = 0;
                let available: number;
                if (staticBaselinesRef.current[cacheKey] !== undefined) {
                  available = staticBaselinesRef.current[cacheKey];
                } else {
                  const params: Record<string, unknown> = { itemId: line.rawItemId };
                  if (warehouseId) params.warehouseId = warehouseId;
                  const avail = await apiService.get<{ data?: number | { available?: number } }>(
                    '/inventory/balances/available',
                    params,
                  );
                  if (cancelled) return;
                  rawCurrent = toNum((avail.data as any)?.available ?? avail.data);
                  available = Math.round((rawCurrent + alreadyConsumed) * 10000) / 10000;
                  staticBaselinesRef.current[cacheKey] = available;
                }
                // When editing an already-posted entry (alreadyConsumed > 0):
                // The material was ALREADY issued/deducted by this entry at creation.
                // Demand is satisfied up to alreadyConsumed. Only excess demand requires new warehouse stock.
                let shortage = 0;
                let balance = available - line.required;
                if (alreadyConsumed > 0) {
                  if (line.required <= alreadyConsumed) {
                    shortage = 0;
                    balance = Math.max(0, available - line.required);
                  } else {
                    const extraDemand = line.required - alreadyConsumed;
                    shortage = Math.max(0, extraDemand - Math.max(0, rawCurrent));
                  }
                } else {
                  shortage = Math.max(0, -balance);
                }
                setData((prev) => ({
                  ...prev,
                  [itemId]: {
                    ...prev[itemId]!,
                    lines: prev[itemId]!.lines.map((l) => l.lineId === line.lineId
                      ? { ...l, available, balance, shortage, loadingAvailable: false, availableError: false }
                      : l),
                  },
                }));
              } catch {
                if (cancelled) return;
                setData((prev) => ({
                  ...prev,
                  [itemId]: {
                    ...prev[itemId]!,
                    lines: prev[itemId]!.lines.map((l) => l.lineId === line.lineId ? { ...l, loadingAvailable: false, availableError: true } : l),
                  },
                }));
              }
            })();
          });

          // ── 5) TASK #34B: OUTPUT INVENTORY — the produced item's own real balance
          //    (read from receiptWarehouseId if available, or warehouseId, keyed by the exact Item ID).
          //    Preserves static opening balance without live overwrites.
          void (async () => {
            try {
              const targetWh = receiptWarehouseId || warehouseId;
              const outCacheKey = `out_${itemId}_${targetWh || ''}`;
              let available: number;
              if (staticBaselinesRef.current[outCacheKey] !== undefined) {
                available = staticBaselinesRef.current[outCacheKey];
              } else {
                const params: Record<string, unknown> = { itemId };
                if (targetWh) params.warehouseId = targetWh;
                if (excludeEntryId) params.excludeEntryId = excludeEntryId;
                const avail = await apiService.get<{ data?: number | { available?: number } }>(
                  '/inventory/balances/available',
                  params,
                );
                if (cancelled) return;
                available = toNum((avail.data as any)?.available ?? avail.data);
                staticBaselinesRef.current[outCacheKey] = available;
              }
              setData((prev) => ({
                ...prev,
                [itemId]: { ...prev[itemId]!, outAvailable: available, outLoading: false, outError: false },
              }));
            } catch {
              if (cancelled) return;
              setData((prev) => ({
                ...prev,
                [itemId]: { ...prev[itemId]!, outLoading: false, outError: true },
              }));
            }
          })();
        } catch (err) {
          console.error('[DEBUG RMA] catch error:', err);
          if (cancelled) return;
          setData((prev) => ({
            ...prev,
            [itemId]: { ...emptyTrace, itemId, loading: false, traceStatus: 'error', error: 'Failed to resolve production chain' },
          }));
        }
      })();
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, warehouseId, receiptWarehouseId, lookups.uomConversions, lookups.items, consumedByItem]);

  // Recompute each line's "Required" (and derived balance/shortage) whenever the
  // production quantity or UOM changes, without refetching routing/BOM/inventory.
  // Mirrors the backend computeBomRequirement formula: units = qtyInBase / baseQuantity,
  // req = units * line.quantity * (1 + scrapFactor) / (yield% / 100).
  const qtySig = selected.map((p) => `${p.itemId}:${toNum(p.actualQuantity) + rowScrap(p)}:${p.uomId ?? ''}`).join('|');
  useEffect(() => {
    setData((prev) => {
      const next: Record<string, RawMatItem> = {};
      for (const key of Object.keys(prev)) {
        const it = prev[key];
        if (it.loading || !it.lines.length) { next[key] = it; continue; }
        const prod = selected.find((p) => p.itemId === key);
        if (!prod) { next[key] = it; continue; }
        const item = lookups.items.find((i) => i.id === key)
          || (Object.values(lookups.deptItemsMap).flat() as ItemLk[]).find((i) => i.id === key);
        const productBaseUomId = item?.baseUomId ?? prod.uomId;
        const prodUom = lookups.uoms.find((u) => u.id === (prod.uomId || productBaseUomId));
        const enrichedProduct = {
          ...(item || {}),
          uomCode: prodUom?.code || item?.baseUom?.code || 'PCS',
          uomType: prodUom?.uomType || (prodUom?.code === 'PCS' ? 'COUNT' : prodUom?.code === 'M' ? 'LENGTH' : undefined),
        };
        // TASK #37: consumption basis = actual good output converted + scrap in KG, mirroring the backend.
        const qtyInBase = convertBetweenUoms(prod.uomId, productBaseUomId, Math.max(0, toNum(prod.actualQuantity)), lookups.uomConversions);
        const units = qtyInBase / it.baseQuantity;
        const scrapKg = rowScrap(prod);
        next[key] = {
          ...it,
          lines: it.lines.map((l) => {
            if (it.itemCode === 'WIP-CS-006' || l.itemCode === 'FLAT-STRIP-005' || l.itemCode === 'FLAT-STRIP-006') {
              const totalMeters = Math.max(0, toNum(prod.actualQuantity)) + scrapKg;
              const wpm = Number(l.weightPerMeter || (l.itemCode === 'FLAT-STRIP-005' ? 0.0374 : 0.0434));
              const required = Math.round(totalMeters * wpm * 10000) / 10000;
              let balance = l.balance;
              let shortage = l.shortage;
              if (l.available != null) {
                balance = Math.round((l.available - required) * 10000) / 10000;
                shortage = Math.max(0, Math.round(-balance * 10000) / 10000);
              }
              return { ...l, required, balance, shortage };
            }
            const componentItem = lookups.items.find((i) => i.id === l.rawItemId);
            const compUom = l.uomCode || l.rawBaseUomCode || componentItem?.baseUom?.code || 'KG';
            const convertedUnits = convertProductToComponentQty(units, enrichedProduct, compUom);
            const scrapInComp = (compUom === 'KG' || compUom === 'KILOGRAM')
              ? scrapKg
              : convertProductToComponentQty(scrapKg, { uomCode: 'KG', uomType: 'WEIGHT', weightPerPiece: enrichedProduct.weightPerPiece }, compUom);
            const totalUnits = convertedUnits + scrapInComp;
            let req = totalUnits * l.rawQuantity * (1 + l.rawScrapFactor) / (l.rawYield / 100);
            req = convertBetweenUoms(l.lineUomId, l.componentBaseUomId, req, lookups.uomConversions);
            const required = Math.round(req * 10000) / 10000;
            let balance = l.balance;
            let shortage = l.shortage;
            if (l.available != null) {
              balance = Math.round((l.available - required) * 10000) / 10000;
              shortage = Math.max(0, Math.round(-balance * 10000) / 10000);
            }
            return { ...l, required, balance, shortage };
          }),
        };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qtySig, lookups.uomConversions, lookups.items]);

  // TASK #32: Expose resolved raw material data to the parent via onData callback.
  // This lets ItemDetailsStrip show raw material info inline.
  // TASK #33: Also exposes productionInItemId, productionOutItemId, chainWarning.
  // TASK #35: Also exposes the input UOM, source/store department and output name.
  useEffect(() => {
    if (!onData) return;
    const extracted: Record<string, {
      itemCode: string;
      itemName?: string | null;
      wireSizeMm?: number | null;
      uomCode?: string | null;
      available?: number | null;
      productionInItemId?: string | null;
      productionInItemCode?: string | null;
      productionInItemName?: string | null;
      productionOutItemId?: string | null;
      productionInUomCode?: string | null;
      productionInDepartmentName?: string | null;
      productionOutItemName?: string | null;
      chainWarning?: string | null;
    }> = {};
    for (const key of Object.keys(data)) {
      const it = data[key];
      if (it.traceStatus === 'ready' && it.lines.length > 0) {
        const line = it.lines[0];
        extracted[key] = {
          itemCode: line.itemCode,
          itemName: line.itemName,
          wireSizeMm: line.rawWireSizeMm ?? null,
          uomCode: line.rawBaseUomCode ?? line.uomCode ?? null,
          available: line.available,
          productionInItemId: it.productionInItemId ?? null,
          productionInItemCode: it.prevStageItemCode || line.itemCode || null,
          productionInItemName: it.prevStageItemName || line.itemName || null,
          productionOutItemId: it.productionOutItemId ?? null,
          productionInUomCode: it.inUomCode ?? null,
          productionInDepartmentName: it.sourceDepartmentName ?? null,
          productionOutItemName: it.outItemName ?? null,
          chainWarning: it.chainWarning ?? null,
        };
      }
    }
    onData(extracted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const order = selected.map((p) => p.itemId!);
  const renderItem = (itemId: string, index: number) => {
    const info = data[itemId];
    return (
      <div key={itemId} data-testid={`raw-material-item-${index + 1}`} style={{ marginBottom: order.length > 1 ? 8 : 0 }}>
        {info?.traceStatus === 'ready' ? (
          <div data-testid={`material-flow-${index + 1}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--theme-border, #d9d9d9)', borderRadius: 6, padding: '8px 10px', background: 'var(--theme-surface, #fafafa)' }}>
            {/* PRODUCTION ITEM / CURRENT ITEM */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Production Item</Text>
              <Text strong style={{ fontSize: 12 }} data-testid={`material-flow-current-${index + 1}`}>{info.itemCode || `Item ${index + 1}`}</Text>
            </div>
            {/* TASK #34B: OUTPUT PRODUCT — the current Item IS the output of its own
                production stage (read-only, server-owned, always equals the item). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Output Product</Text>
              <Text strong style={{ fontSize: 12, color: 'var(--theme-success, #52c41a)' }} data-testid={`material-flow-output-${index + 1}`}>
                {info.itemCode || `Item ${index + 1}`}
              </Text>
              {info.itemName && info.itemName !== info.itemCode && (
                <Text style={{ fontSize: 12 }} data-testid={`material-flow-outputname-${index + 1}`}>{info.itemName}</Text>
              )}
            </div>
            {/* TASK #34B: OUTPUT INVENTORY — real current balance of the produced item + projected balance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 0 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Output Inventory {receiptStoreLabel ? `(${receiptStoreLabel})` : ''}
              </Text>
              {info.outLoading ? (
                <GlobalLoading spinnerOnly size="small" />
              ) : info.outError || info.outAvailable == null ? (
                <Text type="secondary" data-testid={`material-flow-outputinv-${index + 1}`} style={{ color: 'var(--theme-text-muted, #8c8c8c)' }}>—</Text>
              ) : (() => {
                const prodLine = selected.find((p) => p.itemId === itemId);
                const actualQty = toNum(prodLine?.actualQuantity);
                const projected = info.outAvailable + actualQty;
                return (
                  <Space size={8} wrap align="center">
                    <Text strong data-testid={`material-flow-outputinv-${index + 1}`} style={{ fontSize: 12, color: 'var(--theme-primary)' }}>
                      {formatNumber(info.outAvailable, 3)} {info.outUomCode ?? ''}
                    </Text>
                    {actualQty > 0 && (
                      <span style={{
                        fontSize: 11,
                        background: '#dcfce7',
                        color: '#000000',
                        padding: '2px 10px',
                        borderRadius: 4,
                        border: '1px solid #86efac',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        <span style={{ color: '#000000' }}>Current:</span> <strong style={{ color: '#000000' }}>{formatNumber(info.outAvailable, 3)}</strong>
                        <span style={{ margin: '0 2px', color: '#000000' }}>+</span>
                        <span style={{ color: '#000000' }}>Produced:</span> <strong style={{ color: '#000000' }}>+{formatNumber(actualQty, 3)}</strong>
                        <span style={{ margin: '0 4px', color: '#000000' }}>→</span>
                        <span style={{ color: '#000000' }}>Projected:</span> <strong style={{ color: '#000000', textDecoration: 'underline' }}>{formatNumber(projected, 3)} {info.outUomCode ?? ''}</strong>
                      </span>
                    )}
                  </Space>
                );
              })()}
            </div>
            {/* PREVIOUS STAGE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Previous Stage</Text>
              <Text style={{ fontSize: 12 }} data-testid={`material-flow-prevstage-${index + 1}`}>
                {info.prevStageName || 'Previous stage'} → {info.prevStageItemName ? `${info.prevStageItemName}${info.prevStageItemCode ? ` (${info.prevStageItemCode})` : ''}` : (info.prevStageItemCode ?? '—')}
              </Text>
            </div>
            {/* TASK #34B: complete backward input chain (e.g. 4.75 ← 3.75 ← Flat Wire ← 1.20 mm-B4) */}
            {info.inputChain && info.inputChain.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Input Chain</Text>
                <Text style={{ fontSize: 12 }} data-testid={`material-flow-inputchain-${index + 1}`}>{info.inputChain.join(' ← ')}</Text>
              </div>
            )}
            {/* EXACT RAW MATERIAL + REQUIRED / AVAILABLE / SHORTAGE */}
            {info.lines.map((line, lineIdx) => {
              const wireSizeMismatch = line.rawWireSizeMm != null && line.prodWireSizeMm != null
                && Math.abs(line.rawWireSizeMm - line.prodWireSizeMm) > 0.001;
              return (
                <div key={line.lineId} data-testid={`raw-material-component-${index + 1}-${line.lineId}`} style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  borderTop: '1px dashed var(--theme-border, #d9d9d9)', paddingTop: 6,
                }}>
                  {/* Input Material: Item Name + Code */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11, minWidth: 105 }}>
                      {line.inputRowLabel || (info.lines.length > 1 ? `Input Material ${lineIdx + 1}:` : 'Input Material')}
                    </Text>
                    <Text strong style={{ fontSize: 12, color: 'var(--theme-primary)' }} data-testid={`material-flow-rawitem-${index + 1}`}>
                      {line.itemName || line.itemCode}
                    </Text>
                    {line.itemCode && line.itemName && line.itemName !== line.itemCode && (
                      <Text type="secondary" style={{ fontSize: 11 }} data-testid={`material-flow-rawname-${index + 1}`}>
                        ({line.itemCode})
                      </Text>
                    )}
                    {line.rawSource === 'item-master' && (
                      <Text type="secondary" style={{ fontSize: 10 }}>[item master]</Text>
                    )}
                    {line.rawSource === 'routing' && (
                      <Text type="secondary" style={{ fontSize: 10 }}>[routing input]</Text>
                    )}
                  </div>
                  {/* TASK #35: Source / Store department of the exact input Item Master record
                      (the production department may differ — consumption comes from the source). */}
                  {line.rawDepartmentName && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 0 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Source <Text strong data-testid={`material-flow-source-${index + 1}`}>{line.rawDepartmentName}</Text></Text>
                    </div>
                  )}
                  {/* TASK #37: source STORE warehouse the consumption is actually applied to. */}
                  {sourceStoreLabel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 0 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Source Store <Text strong data-testid={`material-flow-store-${index + 1}`}>{sourceStoreLabel}</Text></Text>
                    </div>
                  )}
                  {/* Wire Size + UOM row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 0 }}>
                    {line.rawWireSizeMm != null && (
                      <Text type="secondary" style={{ fontSize: 11 }} data-testid={`material-flow-rawwire-${index + 1}`}>
                        Wire Size: <Text strong>{formatDimension(line.rawWireSizeMm)} mm</Text>
                      </Text>
                    )}
                    {line.rawBaseUomCode && (
                      <Text type="secondary" style={{ fontSize: 11 }} data-testid={`material-flow-rawuom-${index + 1}`}>
                        UOM: <Text strong>{line.rawBaseUomCode}</Text>
                      </Text>
                    )}
                  </div>
                  {/* Wire-size mismatch warning */}
                  {wireSizeMismatch && (
                    <Alert
                      type="warning"
                      showIcon
                      data-testid={`material-flow-mismatch-${index + 1}`}
                      message={`Raw material mapping mismatch: Production Wire Size = ${formatDimension(line.prodWireSizeMm!)} mm, Raw Material Wire Size = ${formatDimension(line.rawWireSizeMm!)} mm`}
                      style={{ fontSize: 11, padding: '4px 8px', marginTop: 0 }}
                    />
                  )}
                  {/* Required / Available / Shortage / Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 0 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Required <Text strong data-testid={`material-flow-required-${index + 1}`}>{formatNumber(line.required, 3)} {line.uomCode}</Text></Text>
                    <Text type="secondary">·</Text>
                    {line.loadingAvailable ? (
                      <Text type="secondary"><GlobalLoading spinnerOnly size="small" /></Text>
                    ) : line.availableError || line.available == null ? (
                      <Text type="secondary" data-testid={`material-flow-status-${index + 1}`} style={{ color: 'var(--theme-text-muted, #8c8c8c)' }}>Available — Unable to determine</Text>
                    ) : line.shortage != null && line.shortage > 0 ? (
                      <span style={{ color: 'var(--theme-danger, #ff4d4f)' }}>
                        <Text type="secondary">Available <Text strong data-testid={`material-flow-available-${index + 1}`}>{formatNumber(line.available, 3)} {line.uomCode}</Text></Text>
                        <Text type="danger" data-testid={`material-flow-status-${index + 1}`}>· Shortage <Text strong>{formatNumber(line.shortage, 3)} {line.uomCode}</Text> · Status <Text strong>SHORT</Text></Text>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--theme-success, #52c41a)' }}>
                        <Text type="secondary">Available <Text strong data-testid={`material-flow-available-${index + 1}`}>{formatNumber(line.available, 3)} {line.uomCode}</Text></Text>
                        <Text style={{ color: 'var(--theme-success)' }} data-testid={`material-flow-status-${index + 1}`}>· Balance <Text strong>{formatNumber(line.balance ?? 0, 3)} {line.uomCode}</Text> · Status <Text strong>{(consumedByItem?.[String(line.rawItemId)] ?? 0) > 0 ? 'AVAILABLE (ALREADY POSTED)' : 'AVAILABLE'}</Text></Text>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Clean High-Contrast Stock Movement & Balance Impact Report */}
            {info.lines.length > 0 && (
              <div style={{
                marginTop: 12,
                padding: '12px 14px',
                background: 'var(--theme-surface, #ffffff)',
                borderRadius: 10,
                border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, borderBottom: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.15))' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--theme-text, #0f172a)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Stock Movement & Balance Impact
                    </span>
                  </div>
                  <Tag color="blue" style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                    Opening → Movement → Balance
                  </Tag>
                </div>

                {/* Line 1: RAW MATERIAL (IN) */}
                {info.lines.map((rawLine, rIdx) => {
                  const alreadyIssued = consumedByItem?.[String(rawLine.rawItemId)] ?? 0;
                  const rawConsumed = rawLine.required ?? 0;
                  let rawBefore = rawLine.available ?? 0;
                  if (alreadyIssued > 0 && rawBefore < rawConsumed) {
                    rawBefore = Math.max(rawConsumed, alreadyIssued);
                  }
                  const rawAfter = Math.max(0, rawBefore - rawConsumed);
                  const rawUom = rawLine.uomCode ?? rawLine.rawBaseUomCode ?? '';
                  const hasShortage = rawConsumed > rawBefore;

                  return (
                    <div key={rawLine.lineId || rIdx} style={{
                      background: 'var(--theme-surface-alt, rgba(239, 68, 68, 0.03))',
                      border: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.2))',
                      borderLeft: '4px solid #ef4444',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}>
                      {/* Row 1: Badge on Left, Item Code on Right (Zero Overlap) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Tag color="error" style={{ margin: 0, fontWeight: 800, fontSize: 10, padding: '0 8px' }}>
                          RAW INPUT
                        </Tag>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--theme-text)' }}>
                          {rawLine.itemCode}
                        </span>
                      </div>
                      {/* Row 2: Full Item Name on its own dedicated line */}
                      {rawLine.itemName && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {rawLine.itemName}
                        </div>
                      )}
                      {/* Row 3: Source Store Location on its own dedicated line */}
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShopOutlined style={{ fontSize: 11, color: 'var(--theme-text-secondary)' }} />
                        <span>Source:</span>
                        <strong style={{ color: 'var(--theme-text)' }}>{sourceStoreLabel || rawLine.rawDepartmentName || 'Source Store'}</strong>
                      </div>

                      {/* 3 Metric Pills: Available -> Consumed (-) -> Balance */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, textAlign: 'center' }}>
                        <div style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border-secondary)', borderRadius: 6, padding: '6px 4px' }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--theme-text-muted)', fontWeight: 600, display: 'block' }}>Opening</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--theme-text)', whiteSpace: 'nowrap', display: 'block' }}>
                            {formatNumber(rawBefore, 2)} {rawUom}
                          </span>
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 6, padding: '6px 4px' }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#ef4444', fontWeight: 600, display: 'block' }}>Consumed (−)</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#ef4444', whiteSpace: 'nowrap', display: 'block' }}>
                            −{formatNumber(rawConsumed, 2)} {rawUom}
                          </span>
                        </div>
                        <div style={{
                          background: hasShortage ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.08)',
                          border: `1px solid ${hasShortage ? '#ef4444' : 'rgba(16, 185, 129, 0.3)'}`,
                          borderRadius: 6, padding: '6px 4px'
                        }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: hasShortage ? '#ef4444' : '#10b981', fontWeight: 700, display: 'block' }}>
                            {hasShortage ? 'SHORTAGE' : 'BALANCE'}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: hasShortage ? '#ef4444' : '#10b981', whiteSpace: 'nowrap', display: 'block' }}>
                            {hasShortage ? '−' : '+'}{formatNumber(Math.abs(rawAfter), 2)} {rawUom}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Line 2: OUTPUT Produced Product */}
                {(() => {
                  const prodLine = selected.find((p) => p.itemId === itemId);
                  const actualQty = toNum(prodLine?.actualQuantity);
                  const outBefore = info.outAvailable ?? 0;
                  const outProduced = actualQty;
                  const outAfter = outBefore + outProduced;
                  const outUom = info.outUomCode ?? '';

                  return (
                    <div style={{
                      background: 'var(--theme-surface-alt, rgba(16, 185, 129, 0.03))',
                      border: '1px solid var(--theme-border-secondary, rgba(148, 163, 184, 0.2))',
                      borderLeft: '4px solid #10b981',
                      borderRadius: 8,
                      padding: '10px 12px',
                    }}>
                      {/* Row 1: Badge on Left, Item Code on Right (Zero Overlap) */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                        <Tag color="success" style={{ margin: 0, fontWeight: 800, fontSize: 10, padding: '0 8px' }}>
                          FG OUTPUT
                        </Tag>
                        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--theme-text)' }}>
                          {info.itemCode}
                        </span>
                      </div>
                      {/* Row 2: Full Item Name on its own dedicated line */}
                      {info.itemName && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {info.itemName}
                        </div>
                      )}
                      {/* Row 3: Receipt Store Location on its own dedicated line */}
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShopOutlined style={{ fontSize: 11, color: 'var(--theme-text-secondary)' }} />
                        <span>Receipt:</span>
                        <strong style={{ color: 'var(--theme-text)' }}>{receiptStoreLabel || 'Receipt Warehouse'}</strong>
                      </div>

                      {/* 3 Metric Pills: Opening -> Produced (+) -> Closing */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, textAlign: 'center' }}>
                        <div style={{ background: 'var(--theme-surface)', border: '1px solid var(--theme-border-secondary)', borderRadius: 6, padding: '6px 4px' }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: 'var(--theme-text-muted)', fontWeight: 600, display: 'block' }}>Opening</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--theme-text)', whiteSpace: 'nowrap', display: 'block' }}>
                            {formatNumber(outBefore, 2)} {outUom}
                          </span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 6, padding: '6px 4px' }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#10b981', fontWeight: 600, display: 'block' }}>Produced (+)</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#10b981', whiteSpace: 'nowrap', display: 'block' }}>
                            +{formatNumber(outProduced, 2)} {outUom}
                          </span>
                        </div>
                        <div style={{ background: 'rgba(6, 182, 212, 0.08)', border: '1px solid rgba(6, 182, 212, 0.35)', borderRadius: 6, padding: '6px 4px' }}>
                          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#06b6d4', fontWeight: 700, display: 'block' }}>Closing</span>
                          <span style={{ fontSize: 12.5, fontWeight: 800, color: '#06b6d4', whiteSpace: 'nowrap', display: 'block' }}>
                            {formatNumber(outAfter, 2)} {outUom}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 4, border: '1px solid var(--theme-border, #d9d9d9)', borderRadius: 6, padding: '8px 10px' }}>
            <Text strong style={{ fontSize: 12 }}>
              Item {index + 1}{info?.itemCode ? ` — ${info.itemCode}${info.itemName ? ` (${info.itemName})` : ''}` : ''}
            </Text>
            <div style={{ marginTop: 4 }}>
              {info?.loading ? (
                <div style={{ padding: '4px 0' }}><GlobalLoading spinnerOnly size="small" /></div>
              ) : info?.traceStatus === 'no-previous-stage' ? (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>Previous production stage is not configured for this item.</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text strong style={{ fontSize: 12, color: 'var(--theme-warning, #faad14)' }} data-testid={`material-flow-notconfigured-${index + 1}`}>Not configured</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>No raw-material Item is configured for this production route/operation.</Text>
                  </div>
                </>
              ) : info?.traceStatus === 'no-raw-material' ? (
                <>
                  {info.prevStageItemCode ? (
                    <div style={{ fontSize: 12 }}>
                      <Text type="secondary">Previous stage {info.prevStageName || ''} → {info.prevStageItemCode}</Text>
                      <Text type="secondary" style={{ marginLeft: 4 }}>· Could not resolve an exact raw material for it.</Text>
                    </div>
                  ) : null}
                  <div style={{ marginTop: 4 }}>
                    <Text strong style={{ fontSize: 12, color: 'var(--theme-warning, #faad14)' }} data-testid={`material-flow-notconfigured-${index + 1}`}>Not configured</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>No raw-material Item is configured for this production route/operation.</Text>
                  </div>
                </>
              ) : info?.traceStatus === 'no-route' ? (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>Previous production stage is not configured for this item.</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text strong style={{ fontSize: 12, color: 'var(--theme-warning, #faad14)' }} data-testid={`material-flow-notconfigured-${index + 1}`}>Not configured</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>No raw-material Item is configured for this production route/operation.</Text>
                  </div>
                </>
              ) : (
                <>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {info?.error ? info.error : 'Raw material resolved but its inventory balance could not be determined.'}
                  </Text>
                  <div style={{ marginTop: 4 }}>
                    <Text data-testid={`material-flow-inventory-error-${index + 1}`} style={{ fontSize: 12, color: 'var(--theme-text-muted, #8c8c8c)' }}>Unable to determine</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>No raw-material Item is configured, or its production flow could not be resolved.</Text>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card
      size="small"
      data-testid="raw-material-card"
      style={{ marginTop: 16, borderLeft: '3px solid var(--theme-primary)' }}
      title={<span style={{ fontSize: 13 }}><DatabaseOutlined style={{ marginRight: 6, color: 'var(--theme-primary)' }} />RAW MATERIAL REQUIREMENT</span>}
      extra={<Tag color={isDone ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isDone ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 4 OK</> : 'STEP 4'}</Tag>}
    >
      {order.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          Select a production item to check the exact raw material for this production item.
        </Text>
      ) : (
        order.map(renderItem)
      )}
    </Card>
  );
};

/** Single production item line with wire size auto-fill and KG conversion. */
const ProductionItemLine: React.FC<{
  fieldName: number;
  rowNumber: number;
  lookups: ReturnType<typeof useLookups>;
  machineLinked: boolean;
  mtResolution: MachineTargetResolution | null;
  departmentItems: ItemLk[];
  machineTargetItems?: ItemLk[];
  isFullDowntime?: boolean;
  remove: () => void;
  mode?: string;
  effectiveDeptId?: string;
  isProductionItem?: (i: any, targetDeptId?: string) => boolean;
  extraItemDetails?: Record<string, ItemLk>;
}> = ({ fieldName, rowNumber, lookups, machineLinked, mtResolution, departmentItems, machineTargetItems = [], isFullDowntime = false, remove, mode = 'create', effectiveDeptId, isProductionItem, extraItemDetails }) => {
  const lineItemId = Form.useWatch(['productionItems', fieldName, 'itemId']);
  const lineActualQty = Form.useWatch(['productionItems', fieldName, 'actualQuantity']);
  const lineScrapQty = Form.useWatch(['productionItems', fieldName, 'scrapQuantity']);
  const lineUomId = Form.useWatch(['productionItems', fieldName, 'uomId']);

  const lineItem = useMemo(
    () => {
      const base = (machineTargetItems && machineTargetItems.find((i) => i.id === lineItemId)) ||
        departmentItems.find((i) => i.id === lineItemId) ||
        lookups.items.find((i) => i.id === lineItemId) ||
        null;
      const extra = lineItemId ? extraItemDetails?.[lineItemId] : null;
      return extra ? { ...base, ...extra } : base;
    },
    [machineTargetItems, departmentItems, lookups.items, extraItemDetails, lineItemId],
  );

  const validLineUoms = useMemo(() => {
    if (machineLinked && mtResolution?.uom?.id) {
      return lookups.uoms.filter((u) => u.id === mtResolution.uom!.id);
    }
    return lookups.validUomsForItem(lineItemId);
  }, [machineLinked, mtResolution, lookups.uoms, lookups.uomConversions, lookups.items, lineItemId]); // eslint-disable-line

  // Auto-fill UOM when item changes (both machine-linked and standard flow)
  const form = Form.useFormInstance();
  const prevLineItemRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!lineItemId) return;
    if (prevLineItemRef.current === lineItemId && lineUomId) return;
    prevLineItemRef.current = lineItemId;
    if (!lineUomId) {
      const item = (machineTargetItems && machineTargetItems.find((i) => i.id === lineItemId)) || departmentItems.find((i) => i.id === lineItemId) || lookups.items.find((i) => i.id === lineItemId);
      const targetUomId = (machineLinked && mtResolution?.uom?.id) ? mtResolution.uom.id : item?.baseUomId;
      if (targetUomId) {
        form.setFieldValue(['productionItems', fieldName, 'uomId'], targetUomId);
      }
    }
  }, [lineItemId, lineUomId, machineLinked, mtResolution, machineTargetItems, departmentItems, lookups.items]); // eslint-disable-line

  // KG conversion: family-aware (LENGTH × weightPerMeter, COUNT × piece weight,
  // WEIGHT stays as-is so M and KG are never mixed). No fabricated conversions.
  const kgConversion = useMemo(() => {
    if (!lineItem) return null;
    const uomType = lookups.uoms.find((u) => u.id === lineUomId)?.uomType ?? null;
    const actKg = lineToKg(lineActualQty, { ...lineItem, uomType });
    const rejKg = lineToKg(lineScrapQty, { ...lineItem, uomType });
    if (actKg === null && rejKg === null) return null;
    return { kg: actKg ?? 0, rejKg: rejKg ?? 0 };
  }, [lineItem, lineActualQty, lineScrapQty, lineUomId, lookups.uoms]);

  // Wire size: AUTHORITATIVE Item Master `wireSizeMm` only — read-only, never
  // calculated from another field, never fabricated. Always 2+ decimals (1.20 mm,
  // 0.00 mm); neutral "—" when absent.
  const wireSizeDisplay = useMemo(() => {
    const w = lineItem?.wireSizeMm ?? (lineItem as any)?.wireSize;
    if (w != null && String(w).trim() !== '') {
      return `${formatDimension(w)} mm`;
    }
    const resolvedItem = mtResolution?.item as any;
    if (resolvedItem?.id === lineItemId) {
      const mtw = resolvedItem?.wireSizeMm ?? resolvedItem?.wireSize;
      if (mtw != null && String(mtw).trim() !== '') return `${formatDimension(mtw)} mm`;
    }
    const anyMatch = (machineTargetItems && machineTargetItems.find((i) => i.id === lineItemId))
      || departmentItems.find((i) => i.id === lineItemId)
      || lookups.items.find((i) => i.id === lineItemId);
    if (anyMatch?.wireSizeMm != null) {
      return `${formatDimension(anyMatch.wireSizeMm)} mm`;
    }
    return null;
  }, [lineItem, mtResolution, machineTargetItems, departmentItems, lookups.items, lineItemId]);

  // KG is kept for the aggregate tooltip only (no separate visible column).
  const kgNote = kgConversion
    ? `KG: ${formatNumber(kgConversion.kg, 3)} · Rejection KG: ${formatNumber(kgConversion.rejKg, 3)}`
    : null;

  // UOM placeholder reflects the item's own base UOM from the Item Master
  // (KG / METER / PCS) — never the generic literal "UOM".
  const lineUomPlaceholder = lineItem?.baseUom?.code ?? '—';

  // ── FIX 1 — the saved item_id must ALWAYS resolve to a human-readable label
  // antd Select prints the raw stored value whenever no option matches it, so a
  // product that is outside the department's lookup list (or not loaded yet)
  // rendered as the industrial UUID `c1000000-0000-…`. Resolve the selected id
  // across every lookup source and synthesize a labelled option when no master
  // row is reachable — a UUID can never reach the screen.
  const savedItemOption = useMemo(() => {
    if (!lineItemId) return null;
    const saved = lineItem || lookups.items.find((i) => i.id === lineItemId) || null;
    if (!saved) return null;
    if (mode === 'create' && effectiveDeptId) {
      const itemDeptId = saved.departmentId ?? (saved as any)?.department?.id;
      if (itemDeptId && itemDeptId !== effectiveDeptId) return null;
      if (isProductionItem && !isProductionItem(saved, effectiveDeptId)) return null;
    }
    return {
      value: lineItemId,
      label: `${saved.name} (${saved.itemCode})`,
      title: `${saved.name} (${saved.itemCode})`,
    };
  }, [lineItemId, lineItem, lookups.items, mode, effectiveDeptId, isProductionItem]);

  // Group items in dropdown: machine target items first!
  const selectOptions = useMemo(() => {
    const flat = (list: ItemLk[]) => list.map((i) => ({
      value: i.id,
      label: `${i.name} (${i.itemCode})`,
      title: `${i.name} (${i.itemCode})`,
    }));
    const fallback = savedItemOption;

    if (machineTargetItems && machineTargetItems.length > 0) {
      const targetIds = new Set(machineTargetItems.map((i) => i.id));
      const otherItems = departmentItems.filter((i) => !targetIds.has(i.id));
      const groups: Array<{ label: string; options: Array<{ value: string; label: string; title: string }> }> = [
        { label: `🎯 Configured Machine Targets (${machineTargetItems.length})`, options: flat(machineTargetItems) },
        { label: 'Other Department Items', options: flat(otherItems) },
      ].filter((g) => g.options.length > 0);
      if (fallback && !groups.some((g) => g.options.some((o) => o.value === fallback.value))) {
        groups.push({ label: 'Saved product', options: [fallback] });
      }
      return groups;
    }

    const list = flat(departmentItems);
    if (fallback && !list.some((o) => o.value === fallback.value)) list.push(fallback);
    return list;
  }, [machineTargetItems, departmentItems, savedItemOption]);

  const [expanded, setExpanded] = useState(false);

  return (
    <div data-testid={`production-item-row-${rowNumber}`} style={{ padding: '8px 0', borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
      <Row gutter={[6, 8]} align="middle">
        {/* Col 1: Expand (+) Button and Row Number */}
        <Col xs={4} sm={2} md={2} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Button
            type="text"
            size="small"
            data-testid={`expand-item-${rowNumber}`}
            icon={expanded ? <MinusSquareOutlined style={{ color: '#0284c7', fontSize: 13 }} /> : <PlusSquareOutlined style={{ color: '#0284c7', fontSize: 13 }} />}
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={`Toggle details for production item ${rowNumber}`}
            title={expanded ? 'Hide line details' : 'View line details (Scrap, Target, KG weight, Remarks)'}
            style={{ width: 22, height: 22, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
          />
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 700 }}>{rowNumber}</Text>
        </Col>

        {/* Col 2: Item / Product Selection */}
        <Col xs={20} sm={10} md={9}>
          <Form.Item name={[fieldName, 'itemId']} noStyle rules={isFullDowntime ? [] : [{ required: true, message: 'Required' }]}>
            <Select
              style={{ width: '100%', height: 38 }}
              showSearch
              optionFilterProp="label"
              placeholder="Select item"
              aria-label={`Production item ${rowNumber}`}
              popupMatchSelectWidth={false}
              popupClassName="production-item-select-popup"
              className={lineItemId ? 'erp-field-filled' : 'erp-field-unfilled'}
              dropdownStyle={{ zIndex: 99999 }}
              styles={{ popup: { root: { maxWidth: '96vw' } } }}
              onChange={(val) => {
                if (val) {
                  const item = (machineTargetItems && machineTargetItems.find((i) => i.id === val)) || departmentItems.find((i) => i.id === val) || lookups.items.find((i) => i.id === val);
                  const targetUomId = (machineLinked && mtResolution?.uom?.id) ? mtResolution.uom.id : item?.baseUomId;
                  if (targetUomId) {
                    form.setFieldValue(['productionItems', fieldName, 'uomId'], targetUomId);
                  }
                }
              }}
              options={selectOptions as any}
            />
          </Form.Item>
        </Col>

        {/* Col 3: Wire Size */}
        <Col xs={6} sm={3} md={3}>
          <Tooltip title={wireSizeDisplay || 'Wire Size'}>
            <div
              data-testid={`wire-size-row-${rowNumber}`}
              style={{
                height: 38,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 6px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--theme-border, #334155)',
                borderRadius: 6,
                fontSize: 11.5,
                fontWeight: 600,
                color: wireSizeDisplay ? 'var(--theme-text, #f1f5f9)' : 'var(--theme-text-muted, #94a3b8)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {wireSizeDisplay || '—'}
            </div>
          </Tooltip>
        </Col>

        {/* Col 4: Quantity Input */}
        <Col xs={9} sm={4} md={5}>
          <Form.Item name={[fieldName, 'actualQuantity']} noStyle>
            <InputNumber
              min={0}
              placeholder={isFullDowntime ? "0" : "Qty"}
              style={{ width: '100%', height: 38 }}
              className={(lineActualQty !== undefined && lineActualQty !== null && lineActualQty !== '') || isFullDowntime ? 'erp-field-filled' : 'erp-field-unfilled'}
              aria-label="Item quantity"
            />
          </Form.Item>
        </Col>

        {/* Col 5: UOM Selection */}
        <Col xs={5} sm={3} md={3}>
          <Form.Item name={[fieldName, 'uomId']} noStyle>
            <Select
              data-testid={`line-uom-${rowNumber}`}
              placeholder={lineUomPlaceholder}
              aria-label={`Production item UOM ${rowNumber}`}
              disabled={machineLinked}
              dropdownStyle={{ zIndex: 99999 }}
              popupClassName="production-select-popup"
              style={{ width: '100%', height: 38 }}
              options={validLineUoms.map((u) => ({ value: u.id, label: u.code }))}
            />
          </Form.Item>
        </Col>

        {/* Col 6: Delete Button */}
        <Col xs={4} sm={2} md={2} style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={remove}
            aria-label={`Remove production item ${rowNumber}`}
            style={{
              height: 38,
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: '1px solid rgba(239, 68, 68, 0.25)',
              background: 'rgba(239, 68, 68, 0.05)',
            }}
          />
        </Col>
      </Row>

      {/* Expandable item details sub-panel */}
      <div
        data-testid={`production-item-details-${rowNumber}`}
        style={{
          display: expanded ? 'block' : 'none',
          marginTop: 8,
          marginBottom: 6,
          padding: '10px 14px',
          background: 'var(--theme-surface-alt, #0f172a)',
          border: '1px solid var(--theme-border, #334155)',
          borderRadius: 6,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, borderBottom: '1px solid var(--theme-border, rgba(255, 255, 255, 0.08))', paddingBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text, #e2e8f0)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Item #{rowNumber} Operational & Line Details
          </span>
          {kgConversion && (
            <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>
              Weight: {formatNumber(kgConversion.kg, 3)} KG {kgConversion.rejKg > 0 ? `· Scrap: ${formatNumber(kgConversion.rejKg, 3)} KG` : ''}
            </span>
          )}
        </div>
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={8} md={6}>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'block', marginBottom: 4 }}>
              Line Target Quantity
            </span>
            <Form.Item name={[fieldName, 'targetQuantity']} noStyle>
              <InputNumber min={0} placeholder="Target Qty" style={{ width: '100%', height: 34 }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'block', marginBottom: 4 }}>
              Scrap / Rejection Quantity
            </span>
            <Form.Item name={[fieldName, 'scrapQuantity']} noStyle>
              <InputNumber min={0} placeholder="Scrap Qty" style={{ width: '100%', height: 34 }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6}>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'block', marginBottom: 4 }}>
              Line Running Hours
            </span>
            <Form.Item name={[fieldName, 'runningHours']} noStyle>
              <InputNumber min={0} placeholder="Running Hours" style={{ width: '100%', height: 34 }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={24} md={6}>
            <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', display: 'block', marginBottom: 4 }}>
              Line Remarks / Routing
            </span>
            <Form.Item name={[fieldName, 'remarks']} noStyle>
              <Input placeholder="Line remarks or routing" style={{ width: '100%', height: 34 }} />
            </Form.Item>
          </Col>
        </Row>
      </div>

      <Form.Item name={[fieldName, 'id']} noStyle hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name={[fieldName, 'lineNumber']} noStyle hidden>
        <InputNumber min={1} />
      </Form.Item>
      <Form.Item name={[fieldName, 'routingCode']} noStyle hidden>
        <Input type="hidden" />
      </Form.Item>
      {kgNote && (
        <Text type="secondary" style={{ fontSize: 10, display: 'block', paddingLeft: 8 }}>
          {kgNote}
        </Text>
      )}
    </div>
  );
};

export default EntryForm;
