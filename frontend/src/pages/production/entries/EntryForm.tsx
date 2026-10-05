import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  App, Typography, Switch, Alert, AutoComplete, Tooltip, Tag, Progress, Segmented,
} from 'antd';
import {
  ArrowLeftOutlined, SaveOutlined, LockOutlined, AimOutlined, InfoCircleOutlined,
  PlusOutlined, DeleteOutlined, ClockCircleOutlined, ThunderboltOutlined,
  WarningOutlined, GoldOutlined, CloseCircleOutlined, TrophyOutlined,
  CheckOutlined, UndoOutlined, DatabaseOutlined, CalendarOutlined,
  ToolOutlined, TeamOutlined, ApartmentOutlined, CheckCircleFilled,
  ArrowDownOutlined, ArrowUpOutlined, EyeOutlined, EyeInvisibleOutlined, UserOutlined,
  EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useUserStore } from '../../../store/userStore';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { useLookups, ItemLk } from './lookups';
import { useEntryDockStore, EntryContextParams } from './entryDockStore';
import './productionEntryModal.css';
import {
  DowntimeMode, deriveFromRunning, rebalancePair,
  effectiveRunning, effectiveDowntime, round2, sumDowntimeLines,
  lineToKg, aggregateProductionTotals, buildDowntimePayload, buildProductionItemsPayload,
  convertProductToComponentQty,
} from './downtimeHours';
import KpiPercentage from '../../../components/kpi/KpiPercentage';
import { GlobalLoading } from '../../../components/shared';
import PageHeader from '../../../components/shared/PageHeader';
import ProductionSaveSuccessModal, { SavedEntrySummary } from './ProductionSaveSuccessModal';

const { Title, Text } = Typography;

/** Live downtime summary: planned / running / total downtime / remaining.
 *  plannedHours and runningHours are passed from the parent — the same
 *  authoritative shift-derived planned hours used everywhere else — NOT read
 *  from the form store (there is no `plannedHours` form field, so a
 *  Form.useWatch would always resolve to 0 and show "Planned 0h"). */
const DowntimeSummary: React.FC<{ totalDowntime: number; plannedHours: number; runningHours: number; overtimeHours?: number }> = ({ totalDowntime, plannedHours, runningHours, overtimeHours = 0 }) => {
  const totalPlanned = plannedHours + overtimeHours;
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

interface WarehouseLk { id: string; name: string; warehouseCode: string; warehouseType?: string; }
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

  const [warehouses, setWarehouses] = useState<WarehouseLk[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

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
  const rawMatWarehouseWatch = Form.useWatch('rawMaterialWarehouseId', form);
  const warehouseWatch = Form.useWatch('warehouseId', form);
  const postToInventoryWatch = Form.useWatch('postToInventory', form);
  const operatorWatch = Form.useWatch('operatorName', form);
  const supervisorWatch = Form.useWatch('supervisorName', form);
  const downtimeEntriesWatch = Form.useWatch('downtimeEntries', form);
  const productionItemsWatch = Form.useWatch('productionItems', form);
  const machineNoWatch = Form.useWatch('machineNo', form);
  const entryDateWatch = Form.useWatch('entryDate', form);
  const coilSizeWatch = Form.useWatch('coilSize', form);

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
      if (qDate && !form.getFieldValue('entryDate')) updates.entryDate = dayjs(qDate);
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
    // Legacy free-form flow — those Form.Items are registered here.
    const d = entryDateWatch as dayjs.Dayjs | undefined;
    return {
      divisionId: s(divisionId),
      sectionId: s(sectionId),
      departmentId: s(departmentId),
      shiftId: s(shiftId),
      entryDate: d && typeof d.format === 'function' ? d.format('YYYY-MM-DD') : undefined,
      machineId: undefined,
      machineNo: s(machineNoWatch),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lockedContext, entry, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, qMachineId, divisionId, sectionId, departmentId, shiftId, machineNoWatch, entryDateWatch]);
  const ctxShiftId = ctxIds.shiftId;

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

  // TASK #37: default the Raw Material source store to the company's first
  // ACTIVE RAW_MATERIAL warehouse when no explicit one is supplied (no-op when
  // none exist, e.g. inventory-independent test scenarios).
  useEffect(() => {
    if (mode !== 'create' || form.getFieldValue('rawMaterialWarehouseId')) return;
    const rawStore = warehouses.find((w) => w.warehouseType === 'RAW_MATERIAL');
    if (rawStore) form.setFieldValue('rawMaterialWarehouseId', rawStore.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouses, mode]);

  // Prefill the locked context coming from the machine-selection step. This
  // only feeds display helpers; the submit payload uses ctxIds above because
  // unregistered fields are NOT returned by antd's onFinish values.
  useEffect(() => {
    if (mode !== 'create') return;
    const patch: Record<string, unknown> = {
      postToInventory: true,
      downtimeEntries: [{ confirmed: false }],
    };
    if (qDate) patch.entryDate = dayjs(qDate);
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
    if (m && form.getFieldValue('machineNo') !== m.machineCode) {
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
        void lookups.loadMachines(e.departmentId);
        if (e.productionOrderId) {
          try {
            const od = await apiService.get<OrderDetail>(`/production/orders/${e.productionOrderId}`);
            setOrderDetail(od);
          } catch { /* order may be inaccessible */ }
        }
        // Only scalar/field values go into the form store — spreading the whole
        // entity (with division/section/item/uom relation objects) triggers
        // antd's "circular references" clone warning.
        let loadedWarehouseId = e.warehouseId;
        if (!loadedWarehouseId && e.inventoryReferenceId) {
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
          } catch {
            // fallback lookup
          }
        }

        form.setFieldsValue({
          id: e.id,
          entryDate: dayjs(e.entryDate),
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
          overtimeHours: toNum((e as any).overtimeHours, 0),
          scrapQuantity: toNum(e.scrapQuantity),
          remarks: e.remarks ?? undefined,
          productionOrderId: e.productionOrderId ?? undefined,
          productionOrderOperationId: e.productionOrderOperationId ?? undefined,
          postToInventory: !!e.inventoryReferenceId,
          warehouseId: loadedWarehouseId ?? undefined,
          rawMaterialWarehouseId: (e as any).rawMaterialWarehouseId ?? undefined,
      // Child lines: production items + downtime entries
      productionItems: (e as any).items?.map((it: any) => ({
        id: it.id,
        lineNumber: it.lineNumber,
        itemId: it.itemId,
        uomId: it.uomId,
        targetQuantity: toNum(it.targetQuantity),
        actualQuantity: toNum(it.actualQuantity),
        scrapQuantity: toNum(it.scrapQuantity),
        runningHours: toNum(it.runningHours),
        routingCode: it.routingCode ?? undefined,
        remarks: it.remarks ?? undefined,
      })) ?? [],
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
    const derived = deriveFromRunning(v, plannedHours, totalDowntime);
    if (Number.isNaN(derived.runningHours)) return;
    form.setFieldsValue({ runningHours: derived.runningHours });
  }, [form, plannedHours, totalDowntime]); // eslint-disable-line react-hooks/exhaustive-deps

  // MANUAL: total downtime from lines → running = planned − totalDowntime
  // Called whenever any downtime line hours change.
  const setRunningFromDowntimeLines = useCallback((total: number) => {
    if (plannedHours > 0) {
      const totalAvailable = plannedHours + overtimeHours;
      const clamped = round2(Math.max(0, Math.min(totalAvailable, total)));
      form.setFieldsValue({ runningHours: round2(Math.max(0, totalAvailable - clamped)) });
    }
  }, [form, plannedHours, overtimeHours]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const pair = rebalancePair(
        toNum(form.getFieldValue('runningHours')),
        totalDowntime,
        plannedHours,
        next,
      );
      form.setFieldsValue({ runningHours: pair.runningHours });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedHours, totalDowntime]);

  // First derivation + shift changes. When planned hours first become known, a
  // fresh create starts at full running / zero downtime while an edit keeps its
  // loaded split. On a later planned-hours change (shift switch) the pair is
  // rebalanced around the new plan while respecting the active entry mode.
  useEffect(() => {
    if (!(plannedHours > 0)) return;
    if (!hoursInitRef.current) {
      hoursInitRef.current = true;
      if (mode === 'create') form.setFieldsValue({ runningHours: round2(plannedHours) });
      return;
    }
    if (downtimeMode === 'manual') {
      setRunningFromDowntimeLines(totalDowntime);
    } else {
      const pair = rebalancePair(
        toNum(form.getFieldValue('runningHours')),
        totalDowntime,
        plannedHours,
        downtimeMode,
      );
      form.setFieldsValue({ runningHours: pair.runningHours });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedHours]);

  // When downtime entries change in MANUAL mode or whenever downtime is entered, re-derive running hours.
  useEffect(() => {
    if (plannedHours > 0) {
      setRunningFromDowntimeLines(totalDowntime);
    }
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

  const efficiency = useMemo(() => {
    if (plannedHours > 0) return Math.round((derivedRunning / plannedHours) * 10000) / 100;
    const denom = derivedRunning + totalDowntime;
    return denom > 0 ? Math.round((derivedRunning / denom) * 10000) / 100 : null;
  }, [derivedRunning, totalDowntime, plannedHours]);



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
      void lookups.loadDepartmentItems(effectiveDeptId);
      void lookups.loadEmployeesForDepartment(effectiveDeptId);
    }
  }, [effectiveDeptId, lookups.loadDepartmentItems, lookups.loadEmployeesForDepartment]); // eslint-disable-line react-hooks/exhaustive-deps

  const departmentItems = useMemo(() => {
    if (!effectiveDeptId) return lookups.items;
    // 1. Items specifically assigned to this department (either cached from loadDepartmentItems or in lookups.items)
    const cachedDept = lookups.deptItemsMap[effectiveDeptId];
    if (cachedDept && cachedDept.length > 0) return cachedDept;

    const filtered = lookups.items.filter((i) => i.departmentId === effectiveDeptId);
    if (filtered.length > 0) return filtered;

    // 2. If no items match this department directly, check division-linked items
    const divId = ctxIds.divisionId || (typeof divisionId === 'string' ? divisionId : undefined);
    if (divId) {
      const divFiltered = lookups.items.filter((i) => i.divisionId === divId);
      if (divFiltered.length > 0) return divFiltered;
    }

    // 3. Fallback to manufacturable items or all items so the picker is never dead/empty
    const mfg = lookups.items.filter((i) => i.isManufacturable);
    return mfg.length > 0 ? mfg : lookups.items;
  }, [effectiveDeptId, lookups.deptItemsMap, lookups.items, ctxIds.divisionId, divisionId]);

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
        || lookups.items.find((i) => i.id === itId);
      if (full) {
        result.push(full);
      } else if (mt.item) {
        result.push({
          id: mt.item.id,
          itemCode: mt.item.code || mt.item.itemCode,
          name: mt.item.name,
          baseUomId: mt.item.baseUomId || mt.uomId,
          wireSizeMm: mt.item.wireSizeMm ?? null,
          isManufacturable: true,
        } as any);
      }
    }
    return result;
  }, [machineTargets, departmentItems, lookups.items]);

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

  const maxProductionItems = 2;
  const productionItemsCount = (productionItemsWatch ?? []).length;
  const maxItemsReached = productionItemsCount >= maxProductionItems;

  // ── Multi-item details (TASK #26): render one compact Item Details strip for
  //    EVERY selected production item, falling back to selectedItem for single-item entries.
  const selectedProductionItems = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    const fromRows = items
      .map((it) => it.itemId ? (lookups.items.find((i) => i.id === it.itemId) || departmentItems.find((i) => i.id === it.itemId)) ?? null : null)
      .filter((x): x is ItemLk => !!x);
    if (fromRows.length > 0) return fromRows;
    if (selectedItem) return [selectedItem];
    return [];
  }, [productionItemsWatch, lookups.items, departmentItems, selectedItem]);

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
        const item = lookups.items.find((i) => i.id === line.itemId)
          || departmentItems.find((i) => i.id === line.itemId)
          || Object.values(lookups.deptItemsMap).flat().find((i) => i.id === line.itemId);
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
  }, [productionItemsWatch, lookups.items, departmentItems, lookups.deptItemsMap, lookups.uoms]);

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

  // Single-item KG conversion (legacy single-item fields), family-aware.
  const singleItemKg = useMemo(() => {
    if (!primaryItem) return null;
    const uomType = lookups.uoms.find((u) => u.id === uomId)?.uomType ?? null;
    const act = Math.max(0, effectiveActualQty);
    const rej = Math.max(0, toNum(scrapQty));
    const kg = lineToKg(act, { ...primaryItem, uomType });
    const rejKg = lineToKg(rej, { ...primaryItem, uomType });
    const total = act + rej;
    const rejPct = total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
    if (kg === null && rejKg === null) return null;
    return { kg: kg ?? 0, rejKg: rejKg ?? 0, rejPct };
  }, [primaryItem, effectiveActualQty, scrapQty, uomId, lookups.uoms]);

  // Combined scrap weight: prefer direct scrapQty (entered in KG), else line-aggregated scrap KG
  const effectiveScrapWeightKg = useMemo(() => {
    const rawVal = Math.max(0, toNum(scrapQty));
    if (rawVal > 0) return rawVal;
    if (multiItemAggregate && multiItemAggregate.totalRejectionKg > 0) {
      return multiItemAggregate.totalRejectionKg;
    }
    return 0;
  }, [scrapQty, multiItemAggregate]);

  // Unified Rejection %:
  // Derived from Production Weight (KG) and Rejection Weight (KG).
  // When item is in METERS or PIECES, converting both to KG provides true like-for-like comparison.
  // Rejection % = Rejection Weight (KG) ÷ (Production Weight (KG) + Rejection Weight (KG)) × 100.
  const rejectionPct = useMemo(() => {
    const prodKg = multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0;
    const rejKg = effectiveScrapWeightKg;
    const totalKg = prodKg + rejKg;
    if (totalKg > 0) {
      return Math.round((rejKg / totalKg) * 10000) / 100;
    }
    const good = Math.max(0, toNum(effectiveActualQty));
    const rej = Math.max(0, toNum(scrapQty));
    const total = good + rej;
    return total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
  }, [effectiveActualQty, scrapQty, multiItemAggregate, singleItemKg, effectiveScrapWeightKg]);

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
      return Math.abs(round2(derivedRunning + totalDowntime) - (plannedHours + overtimeHours)) <= 0.05;
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
    setSavedOpen(true);
    setSaveError(null);
    setSavedEntry(null);
    try {
      const payload: Record<string, unknown> = { ...values };
      payload.overtimeHours = overtimeHours;
      payload.runningHours = derivedRunning;
      if (isFullDowntime) {
        payload.actualQuantity = 0;
        payload.scrapQuantity = 0;
        payload.runningHours = 0;
      } else if (isActualAuto) {
        payload.actualQuantity = round2(multiItemAggregate?.totalActual ?? 0);
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
      if (plannedHours > 0) {
        if (computedDowntime > 0) {
          payload.runningHours = round2(Math.max(0, plannedHours - computedDowntime));
        } else if (values.runningHours !== undefined && values.runningHours !== null && values.runningHours !== '') {
          payload.runningHours = round2(Math.min(plannedHours, toNum(values.runningHours)));
          payload.downtimeHours = round2(Math.max(0, plannedHours - (payload.runningHours as number)));
        } else {
          payload.runningHours = round2(plannedHours);
          payload.downtimeHours = 0;
        }
      } else {
        payload.runningHours = toNum(values.runningHours);
      }
      // Validate downtime doesn't exceed planned hours
      if (plannedHours > 0 && computedDowntime > plannedHours) {
        message.error(`Total downtime (${formatNumber(computedDowntime, 2)}h) cannot exceed planned shift hours (${formatNumber(plannedHours, 2)}h)`);
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
      if (ctxIds.machineId) {
        // Pin the exact master machine so codes repeated across departments stay unambiguous.
        payload.machineId = ctxIds.machineId;
      } else {
        delete payload.machineId;
      }
      payload.rawMaterialWarehouseId = (values as { rawMaterialWarehouseId?: string }).rawMaterialWarehouseId ?? undefined;
      const coilSizeVal = (values as { coilSize?: string }).coilSize;
      if (typeof coilSizeVal === 'string' && coilSizeVal.trim().length > 0) {
        payload.coilSize = coilSizeVal.trim();
      } else {
        delete payload.coilSize;
      }

      // PROMPT-35: build the success-confirmation summary from the AUTHORITATIVE
      // saved entity + lookups (labels only — never raw UUIDs). Called only on
      // back-end-confirmed success for both create and update.
      const showSavedSuccess = (saved: { id: string; machineNo?: string; entryNumber?: string | null }) => {
        const shift = lookups.shifts.find((s) => s.id === payload.shiftId);
        const div = lookups.divisions.find((d) => d.id === payload.divisionId);
        const sec = lookups.sections.find((s) => s.id === payload.sectionId);
        const dep = lookups.departments.find((d) => d.id === payload.departmentId);
        const itm = lookups.items.find((i) => i.id === payload.itemId);
        const uomLk = lookups.uoms.find((u) => u.id === payload.uomId);
        const firstLine = itemLines.find((l) => !!l.itemId);
        const qty = firstLine?.actualQuantity ?? payload.actualQuantity;
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
          itemCode: itm?.itemCode,
          itemName: itm?.name,
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
      };

      if (mode === 'create') {
        payload.postToInventory = !!(values as { postToInventory?: boolean }).postToInventory;
        const res = await apiService.post<{ success: boolean; data: ProductionEntrySaved }>('/production/entries', payload);
        showSavedSuccess(res.data);
      } else if (id) {
        // Inventory posting is a CREATE-only decision (stock is posted once at
        // creation; the update API does not accept postToInventory/warehouseId).
        delete payload.warehouseId;
        console.log('SENDING_PUT_PAYLOAD:', JSON.stringify(payload));
        console.log('BEFORE_API_PUT');
        const updated = await apiService.put<{ success: boolean; data: ProductionEntrySaved }>(`/production/entries/${id}`, payload);
        console.log('AFTER_API_PUT_SUCCESS');
        showSavedSuccess(updated.data);
      }
    } catch (err: unknown) {
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
  }, [mode, id, navigate, lockedContext, machineLinked, ctxIds, plannedHours, downtimeMode, lookups.items, saving, displayTarget, targetQty, achievement, submitBlocked, isFullDowntime, departmentItems]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const qs = new URLSearchParams();
      qs.set('from', 'select');
      if (qMachineId) qs.set('machineId', qMachineId);
      if (qDate) qs.set('entryDate', qDate);
      if (qShiftId) qs.set('shiftId', qShiftId);
      if (qDivisionId) qs.set('divisionId', qDivisionId);
      if (qSectionId) qs.set('sectionId', qSectionId);
      if (qDepartmentId) qs.set('departmentId', qDepartmentId);
      navigate(`/production/entries/new?${qs.toString()}`);
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
      navigate(`/production/entries/select?${qs.toString()}`);
    }
  }, [mode, lockedContext, id, ctxIds, navigate, isModal, onCloseModal, saveError]);

  const changeSelection = () => {
    const qs = new URLSearchParams();
    if (ctxIds.entryDate) qs.set('entryDate', ctxIds.entryDate);
    if (ctxIds.shiftId) qs.set('shiftId', ctxIds.shiftId);
    if (ctxIds.divisionId) qs.set('divisionId', ctxIds.divisionId);
    if (ctxIds.sectionId) qs.set('sectionId', ctxIds.sectionId);
    if (ctxIds.departmentId) qs.set('departmentId', ctxIds.departmentId);
    const s = qs.toString();
    navigate(`/production/entries/select${s ? `?${s}` : ''}`);
  };

  const sectionsFiltered = lookups.sectionsForDivision(divisionId);
  const departmentsFiltered = lookups.departmentsForSection(sectionId);
  const machinesForDept = departmentId ? lookups.machines.filter((m) => m.departmentId === departmentId) : [];
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
        background: 'var(--theme-surface-alt, #0f172a)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
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
              options={lookups.divisions.map((d) => ({ value: d.id, label: `${d.name} (${d.divisionCode})` }))}
              onChange={() => { form.setFieldsValue({ sectionId: undefined, departmentId: undefined }); }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="sectionId" label="Section" rules={[{ required: true, message: 'Section is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Section"
              disabled={!divisionId}
              options={sectionsFiltered.map((s) => ({ value: s.id, label: s.name }))}
              onChange={() => { form.setFieldsValue({ departmentId: undefined }); }}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="departmentId" label="Department" rules={[{ required: true, message: 'Department is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Department"
              disabled={!sectionId}
              options={departmentsFiltered.map((d) => ({ value: d.id, label: `${d.name}${d.departmentCode && d.departmentCode !== d.name ? ` (${d.departmentCode})` : ''}` }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="entryDate" label="Date" initialValue={dayjs()} rules={[{ required: true, message: 'Date is required' }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12} lg={8}>
          <Form.Item name="shiftId" label="Shift" rules={[{ required: true, message: 'Shift is required' }]}>
            <Select
              showSearch optionFilterProp="label" placeholder="Select Shift"
              popupMatchSelectWidth={false}
              styles={{ popup: { root: { minWidth: 380 } } }}
              options={lookups.shifts.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''}) · planned ${s.plannedHours}h`,
              }))}
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
            {/* ── LEFT PANE: Data Entry Form (Left page of Entry Book) ── */}
            <div className={`entry-book-form-pane ${!effectiveShowLinked ? 'full-width' : ''}`}>
              {/* ── STEP 1: Operator ── */}
              <Card
                title="Operator"
                size="small"
                extra={<Tag color={isStep1Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isStep1Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 1 OK</> : 'STEP 1'}</Tag>}
              >
                <Form.Item
                  name="operatorName"
                  label="Operator Name"
                  tooltip="Pick an HR-listed operator to auto-fill their name, or choose Manual to type a name not in HR."
                  rules={[{ required: true, message: 'Operator name is required' }]}
                  style={{ marginBottom: 0 }}
                >
                  <Select
                    showSearch
                    allowClear
                    loading={lookups.hrEmployeesLoading}
                    optionFilterProp="label"
                    placeholder="Select HR operator or type manual name"
                    notFoundContent={
                      lookups.hrEmployeesLoading ? (
                        <div style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <GlobalLoading spinnerOnly size="small" /> <span style={{ marginLeft: 8 }}>Loading HR operators...</span>
                        </div>
                      ) : (
                        "No HR operators found — type a name to enter manually"
                      )
                    }
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
                {/* Auto-populated behind the scenes; kept so backend contract is 100% satisfied */}
                <Form.Item name="supervisorName" noStyle>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item name="coilSize" noStyle>
                  <Input type="hidden" />
                </Form.Item>
              </Card>

              {/* ── STEP 2: Post Directly to Inventory (make-to-stock) ── */}
              <Card
                title="Post Directly to Inventory (make-to-stock)"
                size="small"
                style={{ marginTop: 16 }}
                extra={<Tag color={isStep2Done ? '#16a34a' : '#1d4ed8'} style={{ fontWeight: 700, borderRadius: 12, padding: '2px 10px' }}>{isStep2Done ? <><CheckOutlined style={{ marginRight: 4 }} />STEP 2 OK</> : 'STEP 2'}</Tag>}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <div>
                    <Text strong style={{ fontSize: 13, display: 'block' }}>Direct Stock Posting</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Toggle ON to automatically post completed output to inventory warehouses.
                    </Text>
                  </div>
                  <Form.Item
                    name="postToInventory"
                    valuePropName="checked"
                    style={{ margin: 0 }}
                    extra={mode === 'edit' ? 'Decided at creation' : undefined}
                  >
                    <Switch disabled={!!productionOrderId || mode === 'edit'} />
                  </Form.Item>
                </div>

                <Form.Item
                  noStyle
                  shouldUpdate={(p, c) => p.postToInventory !== c.postToInventory}
                >
                  {({ getFieldValue }) =>
                    getFieldValue('postToInventory') ? (
                      <div style={{ background: 'var(--theme-surface-alt, #0f172a)', border: '1px solid var(--theme-border, #334155)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                        {/* 1. Raw Material Source Warehouse (First) */}
                        <Form.Item
                          name="rawMaterialWarehouseId"
                          label="Raw Material Source Warehouse"
                          tooltip="Warehouse that the Item Master production IN items / ACTIVE BOM raw materials are automatically deducted from when this entry posts to inventory. Defaults to the company's first ACTIVE RAW MATERIAL warehouse when left empty."
                          style={{ marginBottom: 12 }}
                        >
                          <Select
                            allowClear showSearch optionFilterProp="label" placeholder="Auto: first ACTIVE RAW MATERIAL store"
                            disabled={mode === 'edit'}
                            data-testid="raw-source-store-select"
                            className={rawMatWarehouseWatch ? 'erp-field-filled' : 'erp-field-unfilled'}
                            dropdownStyle={{ zIndex: 99999 }}
                            popupClassName="production-select-popup"
                            options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseCode})${w.warehouseType ? ` [${w.warehouseType}]` : ''}` }))}
                          />
                        </Form.Item>

                        {/* 2. Receipt Warehouse (Second) */}
                        <Form.Item
                          name="warehouseId"
                          label="Receipt Warehouse"
                          rules={mode === 'edit' || isFullDowntime ? [] : [{ required: true, message: 'Warehouse is required for direct posting' }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            allowClear showSearch optionFilterProp="label" placeholder="Select Warehouse"
                            disabled={mode === 'edit' && Boolean(getFieldValue('warehouseId'))}
                            className={warehouseWatch ? 'erp-field-filled' : 'erp-field-unfilled'}
                            dropdownStyle={{ zIndex: 99999 }}
                            popupClassName="production-select-popup"
                            options={warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.warehouseCode})` }))}
                          />
                        </Form.Item>
                      </div>
                    ) : null
                  }
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
                      <Tooltip title="Maximum 2 production items are allowed.">
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
                          <Col xs={0} sm={1} md={1}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>#</Text></Col>
                          <Col xs={0} sm={11} md={10}><Text type="secondary" style={{ fontSize: 11, fontWeight: 600 }}>Item / Product</Text></Col>
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
                        />
                      ))}
                      {multiItemAggregate && fields.length > 0 && (() => {
                        const uomLabel = primaryItem?.baseUom?.code || mtResolution?.uom?.code || 'KG';
                        const tgtVal = machineLinked ? displayTarget : toNum(targetQty);
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

                            {/* Row 1: Actual (50%) & Target (50%) divided equally */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%' }}>
                              {/* 1. Actual Production */}
                              {/* 1. Actual Production */}
                              <div className="totals-actual-card">
                                <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 12, fontWeight: 600 }}>Actual:</span>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: '#3b82f6' }}>
                                    {formatNumber(multiItemAggregate.totalActual, 2)}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#60a5fa' }}>{uomLabel}</span>
                                </div>
                              </div>

                              {/* 2. Target Production */}
                              <div className="totals-target-card">
                                <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontSize: 12, fontWeight: 600 }}>Target:</span>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                                  <span style={{ fontSize: 14, fontWeight: 800, color: '#a855f7' }}>
                                    {tgtVal !== null && tgtVal !== undefined ? formatNumber(tgtVal, 2) : '—'}
                                  </span>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: '#c084fc' }}>{uomLabel}</span>
                                </div>
                              </div>
                            </div>

                            {/* Row 2: Target Achievement (100% full width card) */}
                            <div className={`totals-achievement-card ${achievement === null ? 'empty' : isTargetMet ? 'met' : ''}`}>
                              <span style={{ fontSize: 12, fontWeight: 600 }}>Achievement:</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 15, fontWeight: 800 }}>
                                  {achievement !== null ? `${formatNumber(achievement, 1)}%` : '—'}
                                </span>
                                {isTargetMet && <CheckCircleFilled style={{ color: '#10b981', fontSize: 15 }} />}
                              </div>
                            </div>
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

                <Row gutter={10}>
                  <Col xs={24} md={15}>
                    <div style={{ marginBottom: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Shift & Production Hours</span>
                        <span style={{ fontSize: 10.5, color: '#3b82f6', fontWeight: 600 }}>Tracked in Live View</span>
                      </div>
                      <Row gutter={6}>
                        {/* Box 1: Shift Hours [AUTO] */}
                        <Col span={8}>
                          <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #64748b)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span>Shift Hours</span>
                            <Tag color="default" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', margin: 0 }}>Auto</Tag>
                          </div>
                          <div style={{
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: 'rgba(100, 116, 139, 0.08)',
                            border: '1px solid rgba(100, 116, 139, 0.25)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 32,
                            fontWeight: 700,
                            fontSize: 13,
                            color: 'var(--theme-text, #334155)',
                          }}>
                            {formatNumber(plannedHours, 2)} h
                          </div>
                        </Col>

                        {/* Box 2: Overtime (OT) [INPUT] */}
                        <Col span={8}>
                          <div style={{ fontSize: 11, color: '#8b5cf6', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                            <span>Overtime (OT)</span>
                            <Tag color="purple" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', margin: 0 }}>Input</Tag>
                          </div>
                          <Form.Item name="overtimeHours" noStyle initialValue={0}>
                            <InputNumber
                              style={{ width: '100%' }}
                              min={0}
                              max={16}
                              step={0.5}
                              placeholder="0"
                              className={overtimeHours > 0 ? 'erp-field-filled' : 'erp-field-unfilled'}
                            />
                          </Form.Item>
                        </Col>

                        {/* Box 3: Total Running Hours [AUTO] */}
                        <Col span={8}>
                          <div style={{ fontSize: 11, color: '#2563eb', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 3, fontWeight: 600 }}>
                            <span>Running Hours</span>
                            <Tag color="blue" style={{ fontSize: 9, padding: '0 3px', lineHeight: '14px', margin: 0 }}>Auto</Tag>
                          </div>
                          <div style={{
                            padding: '4px 6px',
                            borderRadius: 6,
                            background: 'rgba(59, 130, 246, 0.1)',
                            border: '1px solid rgba(59, 130, 246, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: 32,
                            fontWeight: 800,
                            fontSize: 13.5,
                            color: '#2563eb',
                          }}>
                            {formatNumber(derivedRunning, 2)} h
                          </div>
                          <Form.Item name="runningHours" noStyle>
                            <Input type="hidden" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <div style={{ marginTop: 4, fontSize: 10.5, color: 'var(--theme-text-muted, #64748b)' }}>
                        Target based on: {formatNumber(derivedRunning, 2)}h running ({plannedHours}h shift + {overtimeHours}h OT - {totalDowntime}h downtime)
                      </div>
                    </div>
                  </Col>
                  <Col xs={24} md={9}>
                    <Form.Item
                      name="scrapQuantity"
                      label={<span>Rejection / Scrap (KG) <InputBadge type={isFullDowntime ? 'auto' : 'input'} /></span>}
                      rules={isFullDowntime ? [] : [{ required: true, message: 'Required' }, { type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                      style={{ marginBottom: 0 }}
                    >
                      <InputNumber
                        style={{ width: '100%' }}
                        min={0}
                        placeholder={isFullDowntime ? '0' : undefined}
                        className={(scrapQty !== undefined && scrapQty !== null && scrapQty !== '') || isFullDowntime ? 'erp-field-filled' : 'erp-field-unfilled'}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                {isFullDowntime ? (
                  <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid #10b981', color: '#34d399', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircleFilled />
                    <span><strong>100% Downtime Shift ({formatNumber(totalDowntime, 2)}h)</strong>: Running Hours (0.00h) and Scrap (0 KG) auto-calibrated. Ready to save.</span>
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
                    background: 'rgba(0, 0, 0, 0.04)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    marginBottom: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                    fontSize: 12,
                  }}>
                    <span className="downtime-pill planned">
                      Planned: {formatNumber(plannedHours, 2)}h
                    </span>
                    {overtimeHours > 0 && (
                      <>
                        <span style={{ fontWeight: 700, color: '#8b5cf6' }}>+</span>
                        <span className="downtime-pill" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6', borderColor: 'rgba(139, 92, 246, 0.4)' }}>
                          OT: {formatNumber(overtimeHours, 2)}h
                        </span>
                      </>
                    )}
                    <span style={{ fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>−</span>
                    <span className="downtime-pill running">
                      Running: {formatNumber(derivedRunning, 2)}h
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--theme-text-secondary, #64748b)' }}>=</span>
                    <span className={`downtime-pill ${derivedDowntime > 0 ? 'downtime' : 'planned'}`}>
                      Downtime: {formatNumber(derivedDowntime, 2)}h
                    </span>
                  </div>
                )}

                {/* Entry Mode toggle */}
                <Row gutter={8} style={{ marginBottom: 6 }}>
                  <Col span={24}>
                    <Form.Item
                      label="Entry Mode"
                      tooltip="AUTO: enter Running Hours and Downtime is derived from the shift plan. MANUAL: enter Downtime lines and Running is derived."
                      style={{ marginBottom: 4 }}
                    >
                      <Select
                        value={downtimeMode}
                        onChange={handleDowntimeModeChange}
                        dropdownStyle={{ zIndex: 99999 }}
                        popupClassName="production-select-popup"
                        options={[
                          { value: 'auto', label: 'AUTO (Running → Downtime)' },
                          { value: 'manual', label: 'MANUAL (Downtime → Running)' },
                        ]}
                      />
                    </Form.Item>
                  </Col>
                </Row>

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
                                      ? 'rgba(82, 196, 26, 0.08)'
                                      : (isIncomplete ? 'rgba(239, 68, 68, 0.06)' : (isComplete ? 'rgba(82, 196, 26, 0.04)' : 'transparent')),
                                    border: `1px solid ${
                                      confirmed
                                        ? 'rgba(82, 196, 26, 0.40)'
                                        : (isIncomplete ? 'rgba(239, 68, 68, 0.45)' : (isComplete ? 'rgba(82, 196, 26, 0.35)' : 'var(--theme-border)'))
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
                                        <Select
                                          size="small"
                                          showSearch optionFilterProp="label"
                                          placeholder="Downtime reason"
                                          popupMatchSelectWidth={false}
                                          dropdownStyle={{ zIndex: 99999 }}
                                          popupClassName="production-select-popup"
                                          styles={{ popup: { root: { minWidth: 280 } } }}
                                          className={reasonId ? 'erp-field-filled' : 'erp-field-unfilled'}
                                          options={lookups.downtimeReasons.map((r) => ({ value: r.id, label: r.name }))}
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
                                          size="small"
                                          min={0}
                                          max={plannedHours > 0 ? plannedHours : 24}
                                          step={0.25}
                                          placeholder="Hours"
                                          style={{ width: '100%' }}
                                          className={(hours !== undefined && hours !== null && hours !== '') ? 'erp-field-filled' : 'erp-field-unfilled'}
                                        />
                                      </Form.Item>
                                    </Col>
                                    <Col span={5}>
                                      <Form.Item name={[f.name, 'remarks']} noStyle>
                                        <Input size="small" placeholder="Notes" />
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

                <DowntimeSummary totalDowntime={totalDowntime} plannedHours={plannedHours} runningHours={derivedRunning} overtimeHours={overtimeHours} />

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

                {/* ── TOP KPI AREA: 2 clean lines, balanced card grid ── */}
                <div data-testid="kpi-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <div className="kpi-col-percent">
                    <StatisticMini
                      label="Achievement %"
                      hint="actual vs target"
                      content={<KpiPercentage value={achievement} fontSize={18} fontWeight={600} />}
                      accent="#1890ff"
                      icon={<TrophyOutlined />}
                    />
                  </div>
                  <div className="kpi-col-percent">
                    <StatisticMini
                      label="Efficiency %"
                      hint={`running vs planned${plannedHours > 0 ? ` (${formatNumber(plannedHours, 2)}h)` : ''}`}
                      content={<KpiPercentage value={efficiency} fontSize={18} fontWeight={600} />}
                      accent="var(--theme-success)"
                      icon={<ThunderboltOutlined />}
                    />
                  </div>
                  <div className="kpi-col-percent">
                    <StatisticMini
                      label="Rejection %"
                      hint="Rejection ÷ Total"
                      content={
                        <Text strong style={{ fontSize: 18, fontWeight: 600, color: 'var(--theme-text)' }}>
                          {formatNumber(rejectionPct, 2)}%
                        </Text>
                      }
                      accent="var(--theme-warning)"
                      icon={<WarningOutlined />}
                    />
                  </div>
                  <div className="kpi-col-weight">
                    <StatisticMini
                      label="Production Weight (KG)"
                      hint={multiItemAggregate ? "sum of all items × weight/meter" : "actual × weight/meter"}
                      content={
                        <Text strong style={{ fontSize: 15, color: 'var(--theme-text)' }}>
                          {formatNumber(multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0, 3)} KG
                        </Text>
                      }
                      accent="var(--theme-success)"
                      icon={<GoldOutlined />}
                    />
                  </div>
                  <div className="kpi-col-weight">
                    <StatisticMini
                      label="Rejection Weight (KG)"
                      hint="Rejection / Scrap × item weight"
                      content={
                        <Text strong style={{ fontSize: 15, color: 'var(--theme-text)' }}>
                          {formatNumber(effectiveScrapWeightKg, 3)} KG
                        </Text>
                      }
                      accent="var(--theme-warning)"
                      icon={<CloseCircleOutlined />}
                    />
                  </div>
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

                {/* ── Live Machine Target & Output Calibration (View Pane) ── */}
                {machineLinked && (
                  <Card
                    size="small"
                    style={{
                      marginBottom: 16,
                      border: '1px solid var(--theme-accent, #10b981)',
                      background: 'linear-gradient(145deg, rgba(16, 185, 129, 0.08) 0%, rgba(15, 23, 42, 0.6) 100%)',
                      borderRadius: 10,
                    }}
                    title={
                      <span style={{ fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <AimOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
                        Machine Target & Live Production Calibration
                      </span>
                    }
                    extra={
                      mtResolution ? (
                        <Tag color="#10b981" style={{ fontWeight: 700, borderRadius: 12 }}>
                          ACTIVE TARGET
                        </Tag>
                      ) : resolvingMt ? (
                        <Tag color="#3b82f6" style={{ fontWeight: 600, borderRadius: 12 }}>Resolving Target…</Tag>
                      ) : mtError ? (
                        <Tag color="#ef4444" style={{ fontWeight: 700, borderRadius: 12 }}>Target Missing</Tag>
                      ) : null
                    }
                  >
                    <Row gutter={[8, 8]} align="middle">
                      <Col xs={12} sm={6}>
                        <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>Target Production</Text>
                          <Text strong style={{ fontSize: 17, color: 'var(--theme-accent, #10b981)' }}>
                            {displayTarget !== null ? formatNumber(displayTarget, 2) : '—'}
                            <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 400, color: 'var(--theme-text-muted)' }}>
                              {mtResolution?.uom?.code || entry?.uom?.code || ''}
                            </span>
                          </Text>
                        </div>
                      </Col>
                      <Col xs={12} sm={6}>
                        <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>Actual Good Output</Text>
                          <Text strong style={{ fontSize: 17, color: '#38bdf8' }}>
                            {formatNumber(multiItemAggregate?.totalActual ?? 0, 2)}
                            <span style={{ fontSize: 11, marginLeft: 4, fontWeight: 400, color: 'var(--theme-text-muted)' }}>
                              {mtResolution?.uom?.code || entry?.uom?.code || ''}
                            </span>
                          </Text>
                        </div>
                      </Col>
                      <Col xs={12} sm={6}>
                        <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>Achievement</Text>
                          <Text strong style={{ fontSize: 17, color: (achievement ?? 0) >= 100 ? '#10b981' : (achievement ?? 0) >= 80 ? '#f59e0b' : '#f97316' }}>
                            {achievement !== null ? `${achievement}%` : '0%'}
                          </Text>
                        </div>
                      </Col>
                      <Col xs={12} sm={6}>
                        <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <Text type="secondary" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.3, display: 'block' }}>Target Rate</Text>
                          <Text strong style={{ fontSize: 13, display: 'block', lineHeight: '24px' }}>
                            {mtResolution?.targetPerHour
                              ? `${formatNumber(mtResolution.targetPerHour, 1)} / h`
                              : mtResolution
                              ? `${formatNumber(mtResolution.standardTarget, 0)} / ${formatNumber(mtResolution.standardHours, 1)}h`
                              : '—'}
                          </Text>
                        </div>
                      </Col>
                    </Row>

                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                      <span>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        Planned Shift: <strong style={{ color: 'var(--theme-text)' }}>{formatNumber(plannedHours, 2)}h</strong>
                        {plannedHours > 0 && ` (${overtimeHours > 0 ? `+${formatNumber(overtimeHours, 2)}h OT · ` : ''}Running ${formatNumber(derivedRunning, 2)}h + Downtime ${formatNumber(totalDowntime, 2)}h)`}
                      </span>
                      <span>
                        {mtResolution?.item
                          ? `Scoped: Item ${mtResolution.item.code}`
                          : mtResolution
                          ? 'General Shift Target'
                          : ''}
                      </span>
                    </div>

                    {mtError && (
                      <Alert
                        type="error"
                        showIcon
                        style={{ marginTop: 10 }}
                        message={mtError}
                        description={`Missing target for Machine ${ctxMachineCode} on shift ${summaryCtx?.shiftLabel ?? ''}. Create an active target under Machine Targets.`}
                      />
                    )}
                  </Card>
                )}

                {/* ── Item Details (one compact strip per selected production item) ── */}
                {selectedProductionItems.length > 0 && (
                  <Card
                    size="small"
                    style={{ marginBottom: 16, borderLeft: '3px solid var(--theme-success)', background: 'var(--theme-success-soft)' }}
                    title={<span style={{ fontSize: 13 }}><InfoCircleOutlined style={{ marginRight: 6, color: 'var(--theme-success)' }} />Item Details</span>}
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
  route: { routingCode?: string; name?: string; operations?: Array<{ sequenceNo: number; operationName?: string; department?: { name?: string } | null }> };
}> = ({ route }) => {
  const ops = (route.operations ?? []).sort((a, b) => a.sequenceNo - b.sequenceNo);
  if (ops.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>No operations defined in this route.</Text>;
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
  } | null;
  productionInItemId?: string | null;
  productionOutItemId?: string | null;
  chainWarning?: string | null;
  allItems?: ItemLk[];
}> = ({ item, rawMaterial, productionInItemId, productionOutItemId, chainWarning, allItems }) => (
  <div data-testid="item-details-strip">
    <div
      style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', rowGap: 8 }}
    >
      {item.name && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Item Name" value={<strong style={{ color: 'var(--theme-primary, #2563eb)' }}>{item.name}</strong>} />
        </div>
      )}
      {item.itemCode && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Item Code" value={item.itemCode} />
        </div>
      )}
      {item.wireSizeMm != null && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Wire Size" value={<>{formatDimension(item.wireSizeMm)} mm</>} />
        </div>
      )}
      {item.routeType && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Route" value={item.routeType} />
        </div>
      )}
      {item.departmentName && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Department" value={item.departmentName} />
        </div>
      )}
      {item.sectionName && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Section" value={item.sectionName} />
        </div>
      )}
      {item.divisionName && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Division" value={item.divisionName} />
        </div>
      )}
      {item.categoryName && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Category" value={item.categoryName} />
        </div>
      )}
      {item.weightPerPiece != null && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Weight/Piece" value={<>{formatNumber(item.weightPerPiece, 5)} kg</>} />
        </div>
      )}
      {item.piecesPerKg != null && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Pieces/KG" value={formatNumber(item.piecesPerKg, 3)} />
        </div>
      )}
      {item.weightPerMeter != null && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Weight/Meter" value={<>{formatNumber(item.weightPerMeter, 6)} kg</>} />
        </div>
      )}
      {item.lengthPerPiece != null && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Length/Piece" value={<>{formatNumber(item.lengthPerPiece, 4)} m</>} />
        </div>
      )}
      {item.baseUom && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Base UOM" value={<>{item.baseUom.code}{item.baseUom.symbol ? ` (${item.baseUom.symbol})` : ''}</>} />
        </div>
      )}
      {item.itemType && (
        <div style={{ display: 'flex' }}>
          <ItemMetadatum label="Type" value={item.itemType.replace(/_/g, ' ')} />
        </div>
      )}
    </div>
    {/* TASK #32: Raw Material details within Item Details */}
    {rawMaterial && (
      <div style={{
        marginTop: 6, paddingTop: 6,
        borderTop: '1px solid rgba(128,128,128,0.15)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', rowGap: 8,
      }}>
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Raw Material" value={
            <span style={{ color: 'var(--theme-primary)' }}>
              {rawMaterial.itemName || rawMaterial.itemCode}{rawMaterial.itemName && rawMaterial.itemName !== rawMaterial.itemCode ? ` (${rawMaterial.itemCode})` : ''}
            </span>
          } />
        </div>
        {rawMaterial.wireSizeMm != null && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="RM Wire Size" value={<>{formatDimension(rawMaterial.wireSizeMm)} mm</>} />
          </div>
        )}
        {rawMaterial.uomCode && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="RM UOM" value={rawMaterial.productionInUomCode ?? rawMaterial.uomCode} />
          </div>
        )}
        {rawMaterial.available != null && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="RM Available" value={<>{formatNumber(rawMaterial.available, 3)} {rawMaterial.uomCode ?? ''}</>} />
          </div>
        )}
      </div>
    )}
    {/* TASK #33/#34B: Production Flow — Input Material + Output Product display.
        The current item IS the output of its own production stage; the OUT is
        server-owned and auto-synced to the current item (shown as "self"). */}
    {(productionInItemId || productionOutItemId) && (
      <div style={{
        marginTop: 6, paddingTop: 6,
        borderTop: '1px solid rgba(128,128,128,0.15)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', rowGap: 8,
      }}>
        {productionInItemId && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Input Material" value={
              <span style={{ color: 'var(--theme-primary)' }}>
                {(() => {
                  const inItm = allItems?.find((i) => i.id === productionInItemId);
                  return inItm ? `${inItm.name} (${inItm.itemCode})` : productionInItemId;
                })()}
              </span>
            } />
          </div>
        )}
        {productionInItemId && rawMaterial?.productionInUomCode && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Production IN UOM" value={rawMaterial.productionInUomCode} />
          </div>
        )}
        {productionInItemId && rawMaterial?.productionInDepartmentName && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Production IN Source" value={rawMaterial.productionInDepartmentName} />
          </div>
        )}
        {productionOutItemId && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Output Product" value={
              <span style={{ color: 'var(--theme-success, #52c41a)' }}>
                {productionOutItemId === item.id
                  ? `${item.name} (${item.itemCode})`
                  : `${allItems?.find((i) => i.id === productionOutItemId)?.name || productionOutItemId}`}
              </span>
            } />
          </div>
        )}
        {productionOutItemId && rawMaterial?.productionOutItemName && rawMaterial.productionOutItemName !== item.itemCode && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Output Product Name" value={rawMaterial.productionOutItemName} />
          </div>
        )}
      </div>
    )}
    {chainWarning && (
      <div style={{
        marginTop: 6, padding: '4px 8px',
        background: '#fff7e6', borderRadius: 4, border: '1px solid #ffd591',
      }}>
        <Text type="warning" style={{ fontSize: 11 }}>{chainWarning}</Text>
      </div>
    )}
  </div>
);

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
}> = ({ productionItems, lookups, warehouseId, receiptWarehouseId, sourceStoreLabel, receiptStoreLabel, fallbackScrapQty, isDone, onData }) => {
  const [data, setData] = useState<Record<string, RawMatItem>>({});
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
            const ops = Array.isArray(route?.operations) ? [...route.operations].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)) : [];
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
          const bomRes = await apiService.get<{ data?: ActiveBomLk | null }>(`/bom/product/${itemId}`);
          const bom = bomRes.data;
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

          const lines: RawMatLine[] = [{
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
          if (cancelled) return;
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
              // TASK #33 / #34B
              chainWarning,
              productionInItemId: masterInItemId,
              productionOutItemId: masterOutItemId,
              inputChain,
              outAvailable: null,
              outUomCode: item?.baseUom?.code ?? null,
              outLoading: true,
              outError: false,
              // TASK #35
              outItemName: item?.name ?? null,
              inUomCode: rawBaseUomCode ?? component?.baseUom?.code ?? null,
              sourceDepartmentName,
            },
          }));

          // ── 4) Exact-item inventory for the resolved raw material.
          lines.forEach((line) => {
            void (async () => {
              try {
                const params: Record<string, unknown> = { itemId: line.rawItemId };
                if (warehouseId) params.warehouseId = warehouseId;
                const avail = await apiService.get<{ data?: number | { available?: number } }>(
                  '/inventory/balances/available',
                  params,
                );
                if (cancelled) return;
                const available = toNum((avail.data as any)?.available ?? avail.data);
                const balance = available - line.required;
                setData((prev) => ({
                  ...prev,
                  [itemId]: {
                    ...prev[itemId]!,
                    lines: prev[itemId]!.lines.map((l) => l.lineId === line.lineId
                      ? { ...l, available, balance, shortage: Math.max(0, -balance), loadingAvailable: false, availableError: false }
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
          void (async () => {
            try {
              const targetWh = receiptWarehouseId || warehouseId;
              const params: Record<string, unknown> = { itemId };
              if (targetWh) params.warehouseId = targetWh;
              const avail = await apiService.get<{ data?: number | { available?: number } }>(
                '/inventory/balances/available',
                params,
              );
              if (cancelled) return;
              const available = toNum((avail.data as any)?.available ?? avail.data);
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
  }, [selectedIds, warehouseId, receiptWarehouseId, lookups.uomConversions, lookups.items]);

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
    const extracted: Record<string, { itemCode: string; itemName?: string | null; wireSizeMm?: number | null; uomCode?: string | null; available?: number | null; productionInItemId?: string | null; productionOutItemId?: string | null; productionInUomCode?: string | null; productionInDepartmentName?: string | null; productionOutItemName?: string | null; chainWarning?: string | null }> = {};
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 96 }}>
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
            {info.lines.map((line) => {
              const wireSizeMismatch = line.rawWireSizeMm != null && line.prodWireSizeMm != null
                && Math.abs(line.rawWireSizeMm - line.prodWireSizeMm) > 0.001;
              return (
                <div key={line.lineId} data-testid={`raw-material-component-${index + 1}-${line.lineId}`} style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  borderTop: '1px dashed var(--theme-border, #d9d9d9)', paddingTop: 6,
                }}>
                  {/* Input Material: Item Name + Code */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Input Material</Text>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 96 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Source <Text strong data-testid={`material-flow-source-${index + 1}`}>{line.rawDepartmentName}</Text></Text>
                    </div>
                  )}
                  {/* TASK #37: source STORE warehouse the consumption is actually applied to. */}
                  {sourceStoreLabel && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 96 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Source Store <Text strong data-testid={`material-flow-store-${index + 1}`}>{sourceStoreLabel}</Text></Text>
                    </div>
                  )}
                  {/* Wire Size + UOM row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 96 }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 96 }}>
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
                        <Text style={{ color: 'var(--theme-success)' }} data-testid={`material-flow-status-${index + 1}`}>· Balance <Text strong>{formatNumber(line.balance ?? 0, 3)} {line.uomCode}</Text> · Status <Text strong>AVAILABLE</Text></Text>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {/* 2-Line Material Movement & Balance Impact Report (Before vs Movement vs After) */}
            {info.lines.length > 0 && (
              <div style={{
                marginTop: 10,
                padding: '10px 12px',
                background: 'var(--theme-surface-alt, #0f172a)',
                borderRadius: 8,
                border: '1px solid var(--theme-border, rgba(255, 255, 255, 0.08))',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4, borderBottom: '1px solid var(--theme-border, rgba(255, 255, 255, 0.06))' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text, #e2e8f0)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Stock Movement & Balance Impact
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
                    Before → Movement → After
                  </span>
                </div>

                {/* Line 1: INPUT Raw Material */}
                {info.lines.map((rawLine, rIdx) => {
                  const rawBefore = rawLine.available ?? 0;
                  const rawConsumed = rawLine.required ?? 0;
                  const rawAfter = rawLine.balance ?? (rawBefore - rawConsumed);
                  const rawUom = rawLine.uomCode ?? rawLine.rawBaseUomCode ?? '';
                  return (
                    <div key={rawLine.lineId || rIdx} style={{
                      background: 'rgba(239, 68, 68, 0.04)',
                      border: 'none',
                      borderLeft: '3px solid #ef4444',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            background: 'rgba(239, 68, 68, 0.15)', color: '#f87171', border: 'none',
                            fontWeight: 700, fontSize: 9.5, borderRadius: 3, padding: '1px 6px',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}>
                            <ArrowDownOutlined style={{ fontSize: 9 }} /> INPUT (RAW MATERIAL)
                          </span>
                          <Text strong style={{ fontSize: 11.5 }}>{rawLine.itemCode}</Text>
                          {rawLine.itemName && <Text type="secondary" style={{ fontSize: 11 }}>— {rawLine.itemName}</Text>}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--theme-text-muted)', background: 'rgba(255, 255, 255, 0.06)', padding: '1px 6px', borderRadius: 3, border: 'none' }}>
                          Source: <strong style={{ color: 'var(--theme-text)' }}>{sourceStoreLabel || rawLine.rawDepartmentName || 'Source Store'}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 600, display: 'block', letterSpacing: 0.3 }}>Opening</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>{formatNumber(rawBefore, 3)} {rawUom}</span>
                        </div>
                        <div style={{ background: 'rgba(239, 68, 68, 0.08)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#f87171', fontWeight: 600, display: 'block', letterSpacing: 0.3 }}>Consumed</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444' }}>−{formatNumber(rawConsumed, 3)} {rawUom}</span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.08)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#34d399', fontWeight: 600, display: 'block', letterSpacing: 0.3 }}>Remaining</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{formatNumber(rawAfter, 3)} {rawUom}</span>
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
                      background: 'rgba(16, 185, 129, 0.04)',
                      border: 'none',
                      borderLeft: '3px solid #10b981',
                      borderRadius: 6,
                      padding: '8px 10px',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', border: 'none',
                            fontWeight: 700, fontSize: 9.5, borderRadius: 3, padding: '1px 6px',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}>
                            <ArrowUpOutlined style={{ fontSize: 9 }} /> OUTPUT (GOOD PRODUCTION)
                          </span>
                          <Text strong style={{ fontSize: 11.5 }}>{info.itemCode}</Text>
                          {info.itemName && <Text type="secondary" style={{ fontSize: 11 }}>— {info.itemName}</Text>}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--theme-text-muted)', background: 'rgba(255, 255, 255, 0.06)', padding: '1px 6px', borderRadius: 3, border: 'none' }}>
                          Receipt: <strong style={{ color: 'var(--theme-text)' }}>{receiptStoreLabel || 'Receipt Warehouse'}</strong>
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, textAlign: 'center' }}>
                        <div style={{ background: 'rgba(255, 255, 255, 0.04)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 600, display: 'block', letterSpacing: 0.3 }}>Current Stock</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--theme-text, #ffffff)' }}>{formatNumber(outBefore, 3)} {outUom}</span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.08)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#34d399', fontWeight: 600, display: 'block', letterSpacing: 0.3 }}>Produced (+)</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>+{formatNumber(outProduced, 3)} {outUom}</span>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.14)', borderRadius: 5, padding: '5px 4px' }}>
                          <span style={{ fontSize: 9, textTransform: 'uppercase', color: '#34d399', fontWeight: 700, display: 'block', letterSpacing: 0.3 }}>Projected</span>
                          <span style={{ fontSize: 12, fontWeight: 800, color: '#34d399' }}>{formatNumber(outAfter, 3)} {outUom}</span>
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
}> = ({ fieldName, rowNumber, lookups, machineLinked, mtResolution, departmentItems, machineTargetItems = [], isFullDowntime = false, remove }) => {
  const lineItemId = Form.useWatch(['productionItems', fieldName, 'itemId']);
  const lineActualQty = Form.useWatch(['productionItems', fieldName, 'actualQuantity']);
  const lineScrapQty = Form.useWatch(['productionItems', fieldName, 'scrapQuantity']);
  const lineUomId = Form.useWatch(['productionItems', fieldName, 'uomId']);

  const lineItem = useMemo(
    () =>
      (machineTargetItems && machineTargetItems.find((i) => i.id === lineItemId)) ||
      departmentItems.find((i) => i.id === lineItemId) ||
      lookups.items.find((i) => i.id === lineItemId) ||
      null,
    [machineTargetItems, departmentItems, lookups.items, lineItemId],
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

  // Group items in dropdown: machine target items first!
  const selectOptions = useMemo(() => {
    if (machineTargetItems && machineTargetItems.length > 0) {
      const targetIds = new Set(machineTargetItems.map((i) => i.id));
      const otherItems = departmentItems.filter((i) => !targetIds.has(i.id));
      return [
        {
          label: `🎯 Configured Machine Targets (${machineTargetItems.length})`,
          options: machineTargetItems.map((i: ItemLk) => ({
            value: i.id,
            label: `${i.name} (${i.itemCode})`,
            title: `${i.name} (${i.itemCode})`,
          })),
        },
        ...(otherItems.length > 0
          ? [
              {
                label: 'Other Department Items',
                options: otherItems.map((i: ItemLk) => ({
                  value: i.id,
                  label: `${i.name} (${i.itemCode})`,
                  title: `${i.name} (${i.itemCode})`,
                })),
              },
            ]
          : []),
      ];
    }
    return departmentItems.map((i: ItemLk) => ({
      value: i.id,
      label: `${i.name} (${i.itemCode})`,
      title: `${i.name} (${i.itemCode})`,
    }));
  }, [machineTargetItems, departmentItems]);

  return (
    <div data-testid={`production-item-row-${rowNumber}`} style={{ padding: '8px 0', borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
      <Row gutter={[6, 8]} align="middle">
        {/* Col 1: Row Number */}
        <Col xs={2} sm={1} md={1} style={{ display: 'flex', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11, fontWeight: 700 }}>{rowNumber}</Text>
        </Col>

        {/* Col 2: Item / Product Selection */}
        <Col xs={22} sm={11} md={10}>
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
      {/* Hidden persisted fields — kept so buildProductionItemsPayload, per-line
          KG conversion and aggregate totals remain unchanged. */}
      <Form.Item name={[fieldName, 'targetQuantity']} noStyle hidden>
        <InputNumber min={0} />
      </Form.Item>
      <Form.Item name={[fieldName, 'scrapQuantity']} noStyle hidden>
        <InputNumber min={0} />
      </Form.Item>
      <Form.Item name={[fieldName, 'id']} noStyle hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name={[fieldName, 'lineNumber']} noStyle hidden>
        <InputNumber min={1} />
      </Form.Item>
      <Form.Item name={[fieldName, 'runningHours']} noStyle hidden>
        <InputNumber min={0} />
      </Form.Item>
      <Form.Item name={[fieldName, 'routingCode']} noStyle hidden>
        <Input type="hidden" />
      </Form.Item>
      <Form.Item name={[fieldName, 'remarks']} noStyle hidden>
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
