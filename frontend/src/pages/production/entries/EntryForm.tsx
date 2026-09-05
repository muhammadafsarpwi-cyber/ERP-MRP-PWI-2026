import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  App, Typography, Switch, Alert, Spin, AutoComplete, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, LockOutlined, AimOutlined, InfoCircleOutlined, PlusOutlined, DeleteOutlined, ClockCircleOutlined, ThunderboltOutlined, WarningOutlined, GoldOutlined, CloseCircleOutlined, TrophyOutlined, CheckOutlined, UndoOutlined, DatabaseOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, formatDimension, toNum } from '../../../utils/numberFormat';
import { useLookups, ItemLk } from './lookups';
import {
  DowntimeMode, deriveFromRunning, rebalancePair,
  effectiveRunning, effectiveDowntime, round2, sumDowntimeLines,
  lineToKg, aggregateProductionTotals, buildDowntimePayload, buildProductionItemsPayload,
} from './downtimeHours';
import KpiPercentage from '../../../components/kpi/KpiPercentage';

const { Title, Text } = Typography;

/** Live downtime summary: planned / running / total downtime / remaining.
 *  plannedHours and runningHours are passed from the parent — the same
 *  authoritative shift-derived planned hours used everywhere else — NOT read
 *  from the form store (there is no `plannedHours` form field, so a
 *  Form.useWatch would always resolve to 0 and show "Planned 0h"). */
const DowntimeSummary: React.FC<{ totalDowntime: number; plannedHours: number; runningHours: number }> = ({ totalDowntime, plannedHours, runningHours }) => {
  const remaining = Math.max(0, plannedHours - runningHours - totalDowntime);
  return (
    <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <Text type="secondary">Planned <Text strong>{formatNumber(plannedHours, 2)}h</Text></Text>
      <Text type="secondary">Running <Text strong>{formatNumber(runningHours, 2)}h</Text></Text>
      <Text type="secondary">Total Downtime <Text strong style={{ color: '#fa541c' }}>{formatNumber(totalDowntime, 2)}h</Text></Text>
      {plannedHours > 0 && (
        <Text type="secondary">Remaining <Text strong style={{ color: remaining <= 0 ? '#52c41a' : '#faad14' }}>{formatNumber(remaining, 2)}h</Text></Text>
      )}
    </div>
  );
};

interface WarehouseLk { id: string; name: string; warehouseCode: string; }
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
  runningHours: number | string; downtimeHours: number | string;
  downtimeReasonId: string | null; scrapQuantity: number | string;
  remarks: string | null;
  productionOrderId: string | null; productionOrderOperationId: string | null;
  postToInventory: boolean; warehouseId: string | null; inventoryReferenceId: string | null;
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

const EntryForm: React.FC<{ mode: 'create' | 'edit' }> = ({ mode }) => {
  const { message } = App.useApp();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const lookups = useLookups();

  const [warehouses, setWarehouses] = useState<WarehouseLk[]>([]);
  const [orderDetail, setOrderDetail] = useState<OrderDetail | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);

  // Machine pre-selected on the availability screen (Step 1): context is locked
  // so the operator cannot drift into a duplicate date/shift/machine combination.
  const qMachineId = mode === 'create' ? searchParams.get('machineId') : null;
  const qDate = searchParams.get('entryDate');
  const qShiftId = searchParams.get('shiftId');
  const qDivisionId = searchParams.get('divisionId');
  const qSectionId = searchParams.get('sectionId');
  const qDepartmentId = searchParams.get('departmentId');
  const lockedContext = !!(qMachineId && qDate && qShiftId && qDivisionId && qSectionId && qDepartmentId);

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
  const productionOrderId = Form.useWatch('productionOrderId', form);
  const shiftId = Form.useWatch('shiftId', form);
  const targetQty = Form.useWatch('targetQuantity', form);
  const scrapQty = Form.useWatch('scrapQuantity', form);
  const downtimeEntriesWatch = Form.useWatch('downtimeEntries', form);
  const productionItemsWatch = Form.useWatch('productionItems', form);

  // TASK #32: Raw material data resolved by RawMaterialAvailability, keyed by production itemId.
  // Used by ItemDetailsStrip to show raw material info inline.
  const [rawMaterialData, setRawMaterialData] = useState<Record<string, {
    itemCode: string;
    itemName?: string | null;
    wireSizeMm?: number | null;
    uomCode?: string | null;
    available?: number | null;
    productionInItemId?: string | null;
    productionOutItemId?: string | null;
    chainWarning?: string | null;
  }>>({});

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
        divisionId: entry?.divisionId ?? s(form.getFieldValue('divisionId')),
        sectionId: entry?.sectionId ?? s(form.getFieldValue('sectionId')),
        departmentId: entry?.departmentId ?? s(form.getFieldValue('departmentId')),
        shiftId: entry?.shiftId ?? entry?.shift?.id ?? s(form.getFieldValue('shiftId')),
        entryDate: entry?.entryDate ? entry.entryDate.slice(0, 10) : undefined,
        machineId: entry?.machineId ?? undefined,
        machineNo: entry?.machineNo ?? s(form.getFieldValue('machineNo')),
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
    const d = form.getFieldValue('entryDate') as dayjs.Dayjs | undefined;
    return {
      divisionId: s(divisionId),
      sectionId: s(sectionId),
      departmentId: s(departmentId),
      shiftId: s(shiftId),
      entryDate: d ? d.format('YYYY-MM-DD') : undefined,
      machineId: undefined,
      machineNo: s(form.getFieldValue('machineNo')),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lockedContext, entry, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, qMachineId]);
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

  // Prefill the locked context coming from the machine-selection step. This
  // only feeds display helpers; the submit payload uses ctxIds above because
  // unregistered fields are NOT returned by antd's onFinish values.
  useEffect(() => {
    if (mode !== 'create') return;
    const patch: Record<string, unknown> = {};
    if (qDate) patch.entryDate = dayjs(qDate);
    if (qShiftId) patch.shiftId = qShiftId;
    if (qDivisionId) patch.divisionId = qDivisionId;
    if (qSectionId) patch.sectionId = qSectionId;
    if (qDepartmentId) patch.departmentId = qDepartmentId;
    if (Object.keys(patch).length > 0) form.setFieldsValue(patch);
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
  const lastResolvedItemRef = useRef<string | null | undefined>(undefined);
  const resolveTarget = useCallback(async (
    machineId: string,
    mShiftId: string,
    productionDate: string,
    opts?: { itemId?: string },
  ) => {
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
      lastResolvedItemRef.current = opts?.itemId ?? null;
      setMtResolution(res.data);
      // The machine target's UOM is authoritative for the entry (server enforces it).
      if (res.data.uom?.id) form.setFieldValue('uomId', res.data.uom.id);
    } catch (err: unknown) {
      setMtResolution(null);
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
      void resolveTarget(qMachineId, qShiftId, qDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lockedContext]);

  useEffect(() => {
    if (!id || mode !== 'edit') return;
    void (async () => {
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
        form.setFieldsValue({
          id: e.id,
          entryDate: dayjs(e.entryDate),
          divisionId: e.divisionId, sectionId: e.sectionId, departmentId: e.departmentId,
          shiftId: e.shiftId ?? undefined,
          machineNo: e.machineNo,
          operatorName: e.operatorName,
          supervisorName: e.supervisorName ?? undefined,
          itemId: e.itemId,
          uomId: e.uomId,
          targetQuantity: toNum(e.targetQuantity),
          actualQuantity: toNum(e.actualQuantity),
          runningHours: toNum(e.runningHours),
          scrapQuantity: toNum(e.scrapQuantity),
          remarks: e.remarks ?? undefined,
          productionOrderId: e.productionOrderId ?? undefined,
          productionOrderOperationId: e.productionOrderOperationId ?? undefined,
      postToInventory: !!e.inventoryReferenceId,
      warehouseId: e.warehouseId ?? undefined,
      rawMaterialWarehouseId: (e as any).rawMaterialWarehouseId ?? undefined,
      // Child lines: production items + downtime entries
      productionItems: (e as any).items?.map((it: any) => ({
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
        downtimeReasonId: dt.downtimeReasonId ?? undefined,
        downtimeReason: dt.downtimeReasonText ?? dt.downtimeReason ?? undefined,
        downtimeHours: toNum(dt.downtimeHours),
        remarks: dt.remarks ?? undefined,
        confirmed: true,
      })) ?? [],
        });
      } catch {
        message.error('Failed to load production entry');
      } finally {
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
    if (lastResolvedItemRef.current === targetItemId) return;
    lastResolvedItemRef.current = targetItemId;
    void resolveTarget(mId, sId, d, { itemId: targetItemId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstProdItemId, itemId, machineLinked]);

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
      const clamped = round2(Math.max(0, Math.min(plannedHours, total)));
      form.setFieldsValue({ runningHours: round2(Math.max(0, plannedHours - clamped)) });
    }
  }, [form, plannedHours]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // When downtime entries change in MANUAL mode, re-derive running hours.
  useEffect(() => {
    if (downtimeMode === 'manual' && plannedHours > 0) {
      setRunningFromDowntimeLines(totalDowntime);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDowntime, downtimeMode]);

  const derivedRunning = effectiveRunning(toNum(runningHours), totalDowntime, plannedHours);
  const derivedDowntime = effectiveDowntime(toNum(runningHours), totalDowntime, plannedHours);

  // When a shift plan exists, AUTO keeps downtime read-only and MANUAL keeps
  // running read-only. Without a plan both stay free-form (legacy behaviour).
  const runningReadOnly = plannedHours > 0 && downtimeMode === 'manual';

  /** Target shown for a machine-linked entry: standard target pro-rated to the
   *  actual running hours — identical to what the server stores on save. */
  const displayTarget = useMemo(() => {
    if (!machineLinked || !mtResolution || !(mtResolution.standardHours > 0)) return null;
    return prorateTarget(mtResolution.standardTarget, mtResolution.standardHours, derivedRunning);
  }, [machineLinked, mtResolution, derivedRunning]);

  const achievement = useMemo(() => {
    const t = machineLinked ? displayTarget : toNum(targetQty);
    const a = toNum(actualQty);
    return !!t && t > 0 ? Math.round((a / t) * 10000) / 100 : null;
  }, [machineLinked, displayTarget, targetQty, actualQty]);

  const efficiency = useMemo(() => {
    if (plannedHours > 0) return Math.round((derivedRunning / plannedHours) * 10000) / 100;
    const denom = derivedRunning + totalDowntime;
    return denom > 0 ? Math.round((derivedRunning / denom) * 10000) / 100 : null;
  }, [derivedRunning, totalDowntime, plannedHours]);

  // Rejection % from the ERP's own quantities:
  //   Total Produced = Actual Good Production + Rejection/Scrap
  //   Rejection %    = Rejection ÷ Total Produced × 100
  // Zero-safe (0.00 when nothing was produced), never negative, live-updating.
  const rejectionPct = useMemo(() => {
    const good = Math.max(0, toNum(actualQty));
    const rej = Math.max(0, toNum(scrapQty));
    const total = good + rej;
    return total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
  }, [actualQty, scrapQty]);

  const selectedItem = useMemo(
    () => lookups.items.find((i) => i.id === itemId) ?? null,
    [lookups.items, itemId],
  );

  // ── Primary item = first production item (historically used for the legacy
  //    single-item KG strip). The first production item is also the authoritative
  //    item for the target / top-level itemId derivation.
  const primaryItem = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    const first = items.find((it) => !!it.itemId);
    if (first?.itemId) return lookups.items.find((i) => i.id === first.itemId) ?? null;
    return selectedItem;
  }, [productionItemsWatch, lookups.items, selectedItem]);

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
    const uomIdForType = first?.uomId ?? uomId;
    return lookups.uoms.find((u) => u.id === uomIdForType)?.uomType ?? null;
  }, [productionItemsWatch, uomId, lookups.uoms]);

  const scrapWeightKg = useMemo(() => {
    const val = lineToKg(Math.max(0, toNum(scrapQty)), { ...primaryItem, uomType: primaryUomType });
    return val == null ? 0 : val;
  }, [scrapQty, primaryItem, primaryUomType]);

  // ── Multi-item details (TASK #26): render one compact Item Details strip for
  //    EVERY selected production item, never hiding the second item's details.
  const selectedProductionItems = useMemo(() => {
    const items = (productionItemsWatch ?? []) as Array<{ itemId?: string }>;
    return items
      .map((it) => it.itemId ? lookups.items.find((i) => i.id === it.itemId) ?? null : null)
      .filter((x): x is ItemLk => !!x);
  }, [productionItemsWatch, lookups.items]);

  // ── Department-based item filtering ────────────────────────────────────────
  // Items available in the Production Items row dropdowns are scoped to the
  // selected Department — matching Item.departmentId. No department selected →
  // show all items (legacy behaviour preserved).
  const effectiveDeptId = useMemo(() => {
    const d = ctxIds.departmentId;
    return (typeof d === 'string' && d.length > 0) ? d : (typeof departmentId === 'string' && departmentId.length > 0 ? departmentId : undefined);
  }, [ctxIds.departmentId, departmentId]);

  const departmentItems = useMemo(
    () => effectiveDeptId
      ? lookups.items.filter((i) => i.departmentId === effectiveDeptId)
      : lookups.items,
    [lookups.items, effectiveDeptId],
  );

  const maxProductionItems = 2;
  const productionItemsCount = (productionItemsWatch ?? []).length;
  const maxItemsReached = productionItemsCount >= maxProductionItems;

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
        const item = lookups.items.find((i) => i.id === line.itemId);
        if (!item) return { actualQuantity: line.actualQuantity, scrapQuantity: line.scrapQuantity };
        const uomType = lookups.uoms.find((u) => u.id === line.uomId)?.uomType ?? null;
        return { actualQuantity: line.actualQuantity, scrapQuantity: line.scrapQuantity, item: { ...item, uomType } };
      }),
    );
  }, [productionItemsWatch, lookups.items, lookups.uoms]);

  // TASK #24: when Production Items are in use, Actual Good Production is the
  // READ-ONLY sum of all production item quantities (reusing the existing
  // multiItemAggregate.totalActual aggregation — no duplicated calculation).
  const isActualAuto = productionItemsCount > 0;

  // Keep the parent `actualQuantity` field in sync with the aggregate so the
  // watched value, KPIs, and the onFinish payload all carry the summed actual
  // without the operator typing anything.
  useEffect(() => {
    if (!isActualAuto) return;
    const sum = round2(multiItemAggregate?.totalActual ?? 0);
    const current = toNum(form.getFieldValue('actualQuantity'));
    if (Math.abs(current - sum) > 0.0001) form.setFieldValue('actualQuantity', sum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActualAuto, multiItemAggregate]);

  // Single-item KG conversion (legacy single-item fields), family-aware.
  const singleItemKg = useMemo(() => {
    if (!primaryItem) return null;
    const uomType = lookups.uoms.find((u) => u.id === uomId)?.uomType ?? null;
    const act = Math.max(0, toNum(actualQty));
    const rej = Math.max(0, toNum(scrapQty));
    const kg = lineToKg(act, { ...primaryItem, uomType });
    const rejKg = lineToKg(rej, { ...primaryItem, uomType });
    const total = act + rej;
    const rejPct = total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
    if (kg === null && rejKg === null) return null;
    return { kg: kg ?? 0, rejKg: rejKg ?? 0, rejPct };
  }, [primaryItem, actualQty, scrapQty, uomId, lookups.uoms]);

  const onFinish = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...values };
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
      // allowClear on the reason Select yields undefined; send null so clearing persists
      payload.downtimeReasonId = (values.downtimeReasonId as string | undefined) ?? null;
      if (payload.productionOrderId === undefined) delete payload.productionOrderId;
      if (payload.productionOrderOperationId === undefined) delete payload.productionOrderOperationId;

      // ── Derive top-level itemId + UOM from production items ────────────────
      // The user selects items in the Production Items rows; the backend entry
      // still requires a top-level itemId. Derive from the first row.
      const prodItems = (values.productionItems as any[] | undefined) ?? [];
      const firstProdItem = prodItems.find((p) => !!p.itemId);
      if (!firstProdItem?.itemId) {
        message.error('At least one production item with an Item is required.');
        setSaving(false);
        return;
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
      }

      // ── Compute aggregate downtime from lines ──────────────────────────────
      const downtimeLines = (values.downtimeEntries as any[] | undefined) ?? [];
      const computedDowntime = sumDowntimeLines(downtimeLines);
      if (downtimeLines.length) {
        payload.downtimes = buildDowntimePayload(downtimeLines);
      }
      // Authoritative aggregate downtime + running hours for the parent entry
      payload.downtimeHours = computedDowntime;
      if (downtimeMode === 'manual' && plannedHours > 0) {
        payload.runningHours = round2(Math.max(0, plannedHours - computedDowntime));
      }
      // Validate downtime doesn't exceed planned hours
      if (plannedHours > 0 && computedDowntime > plannedHours) {
        message.error(`Total downtime (${formatNumber(computedDowntime, 2)}h) cannot exceed planned shift hours (${formatNumber(plannedHours, 2)}h)`);
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
        return;
      }

      if (machineLinked) {
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

      if (mode === 'create') {
        payload.postToInventory = !!(values as { postToInventory?: boolean }).postToInventory;
        const res = await apiService.post<{ success: boolean; data: { id: string; machineNo?: string } }>('/production/entries', payload);
        message.success(`Production entry ${res.data?.machineNo ? `for ${res.data.machineNo}` : ''} saved`);
        if (lockedContext) {
          // Return to the availability screen so the operator sees this machine
          // flip from "Entry Required" to "Already Entered" immediately.
          const qs = new URLSearchParams();
          qs.set('entryDate', String(payload.entryDate ?? ''));
          qs.set('shiftId', String(payload.shiftId ?? ''));
          qs.set('divisionId', String(payload.divisionId ?? ''));
          qs.set('sectionId', String(payload.sectionId ?? ''));
          qs.set('departmentId', String(payload.departmentId ?? ''));
          navigate(`/production/entries/select?${qs.toString()}`);
        } else {
          navigate(`/production/entries/${res.data.id}`);
        }
      } else if (id) {
        // Inventory posting is a CREATE-only decision (stock is posted once at
        // creation; the update API does not accept postToInventory/warehouseId).
        delete payload.warehouseId;
        await apiService.put(`/production/entries/${id}`, payload);
        message.success('Production entry updated');
        navigate(`/production/entries/${id}`);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string | string[] } } };
      const msg = Array.isArray(axiosErr.response?.data?.message)
        ? axiosErr.response!.data!.message!.join(', ')
        : axiosErr.response?.data?.message ?? 'Failed to save entry';
      message.error(String(msg));
    } finally {
      setSaving(false);
    }
  }, [mode, id, navigate, lockedContext, machineLinked, ctxIds, plannedHours, downtimeMode, lookups.items]); // eslint-disable-line react-hooks/exhaustive-deps

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
    form.getFieldValue('machineNo') ??
    '…';

  const showSummary = lockedContext || mode === 'edit';

  const summaryCtx = useMemo(() => {
    if (!showSummary) return null;
    if (mode === 'create') {
      const div = lookups.divisions.find((d) => d.id === qDivisionId);
      const sec = lookups.sections.find((s) => s.id === qSectionId);
      const dep = lookups.departments.find((d) => d.id === qDepartmentId);
      const shf = lookups.shifts.find((s) => s.id === qShiftId);
      return {
        date: qDate ? dayjs(qDate) : null,
        shiftLabel: shf ? `${shf.name} · ${toNum(shf.plannedHours)}h planned` : undefined,
        machineLabel: ctxMachineCode,
        depLabel: dep?.name,
        secLabel: sec?.name,
        divLabel: div ? `${div.divisionCode} — ${div.name}` : undefined,
      };
    }
    const e = entry;
    return {
      date: e?.entryDate ? dayjs(e.entryDate) : null,
      shiftLabel: e?.shift ? `${e.shift.name} · ${toNum(e.shift.plannedHours)}h planned` : undefined,
      machineLabel: e?.machineNo,
      depLabel: e?.department ? `${e.department.departmentCode} — ${e.department.name}` : e?.departmentId,
      secLabel: e?.section?.name,
      divLabel: e?.division ? `${e.division.divisionCode} — ${e.division.name}` : undefined,
    };
  }, [showSummary, mode, lookups.divisions, lookups.sections, lookups.departments, lookups.shifts, qDivisionId, qSectionId, qDepartmentId, qShiftId, qDate, ctxMachineCode, entry]);

  const submitBlocked = resolvingMt || (machineLinked && (!!mtError || displayTarget === null));

  const renderContextSummary = () => (
    <Card
      size="small" style={{ marginBottom: 16, borderLeft: '3px solid var(--theme-warning)', background: 'var(--theme-warning-soft)' }}
      title={<span><InfoCircleOutlined style={{ marginRight: 6, color: 'var(--theme-warning)' }} />Production Context</span>}
    >
      <Row justify="space-between" align="middle" gutter={[12, 8]}>
        <Col flex="auto">
          <Space size={[28, 10]} wrap>
            <CtxItem label="Date" value={summaryCtx?.date?.format('DD MMM YYYY')} />
            <CtxItem label="Shift" value={summaryCtx?.shiftLabel} />
            <CtxItem label="Machine No." value={summaryCtx?.machineLabel} strong />
            <CtxItem label="Department" value={summaryCtx?.depLabel} />
            <CtxItem label="Section" value={summaryCtx?.secLabel} />
            <CtxItem label="Division" value={summaryCtx?.divLabel} />
          </Space>
        </Col>
        {mode === 'create' && lockedContext && (
          <Col>
            <Button size="small" onClick={changeSelection}>Change Selection</Button>
          </Col>
        )}
      </Row>
      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 6 }}>
        {mode === 'create'
          ? 'Locked by the machine-selection step — a duplicate date/shift/machine entry is impossible here.'
          : 'Identity of an existing entry — edit the production figures below.'}
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
              options={lookups.divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} — ${d.name}` }))}
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
              options={departmentsFiltered.map((d) => ({ value: d.id, label: d.name }))}
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
            label="Machine No."
            rules={[{ required: true, message: 'Machine No. is required' }]}
            extra={
              machinesForDept.length > 0
                ? `${machinesForDept.length} registered machine(s) in this department`
                : 'No registered machines for this department — you may type any machine identifier'
            }
          >
            <AutoComplete
              options={machinesForDept.map((m) => ({ value: m.machineCode, label: `${m.machineCode}${m.machineCode !== m.name ? ` — ${m.name}` : ''}` }))}
              placeholder="Select or type machine no."
              filterOption={(input, option) => (option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  return (
    <div>
      <Space style={{ marginBottom: 12 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>
          {mode === 'create' ? 'New Production Entry' : 'Edit Production Entry'}
        </Title>
      </Space>

      <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
        {loadingEntry && (
          <Card>
            <Spin style={{ width: '100%', marginTop: 80 }} />
          </Card>
        )}
        {!loadingEntry && (
        <>
        {/* ── Production Context (compact; replaces duplicated full-size fields) ── */}
        {showSummary ? renderContextSummary() : renderLegacyContextFields()}

        {/* ── TOP KPI AREA: ALL FIVE cards in ONE horizontal row on desktop ── */}
        <Row data-testid="kpi-row" gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} xl={4} flex="1 1 0">
            <StatisticMini
              label="Efficiency %"
              hint={`running vs planned${plannedHours > 0 ? ` (${formatNumber(plannedHours, 2)}h)` : ''}`}
              content={<KpiPercentage value={efficiency} fontSize={20} fontWeight={600} />}
              accent="var(--theme-success)"
              icon={<ThunderboltOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} xl={4} flex="1 1 0">
            <StatisticMini
              label="Achievement %"
              hint="actual vs target"
              content={<KpiPercentage value={achievement} fontSize={20} fontWeight={600} />}
              icon={<TrophyOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} xl={4} flex="1 1 0">
            <StatisticMini
              label="Rejection %"
              hint="Rejection ÷ (Actual Good + Rejection) — from the Rejection / Scrap field"
              content={
                <Text strong style={{ fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
                  {formatNumber(rejectionPct, 2)}%
                </Text>
              }
              accent="var(--theme-warning)"
              icon={<WarningOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} xl={4} flex="1 1 0">
            <StatisticMini
              label="Production Weight (KG)"
              hint={multiItemAggregate ? "sum of all items × weight/meter" : "actual × weight/meter"}
              content={
                <Text strong style={{ fontSize: 16, color: 'var(--theme-text)' }}>
                  {formatNumber(multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0, 3)} KG
                </Text>
              }
              accent="var(--theme-success)"
              icon={<GoldOutlined />}
            />
          </Col>
          <Col xs={24} sm={12} xl={4} flex="1 1 0">
            <StatisticMini
              label="Rejection Weight (KG)"
              hint="Rejection / Scrap × item weight"
              content={
                <Text strong style={{ fontSize: 16, color: 'var(--theme-text)' }}>
                  {formatNumber(scrapWeightKg, 3)} KG
                </Text>
              }
              accent="var(--theme-warning)"
              icon={<CloseCircleOutlined />}
            />
          </Col>
        </Row>

        <Row gutter={16}>
          {/* ── LEFT / CENTER: Manpower, Item, UOM & Production Figures ── */}
          <Col xs={24} xl={15}>
            <Card title="Operator" size="small">
              <Row gutter={12}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="operatorName"
                    label="Operator Name"
                    tooltip="Pick an HR-listed operator to auto-fill their name, or choose Manual to type a name not in HR."
                    rules={[{ required: true, message: 'Operator name is required' }]}
                  >
                    <Select
                      showSearch
                      optionFilterProp="label"
                      placeholder="Select HR operator or type manual name"
                      notFoundContent="No HR operators — select 'Manual entry' to type a name"
                      options={
                        lookups.employeesForDepartment(departmentId).map((e) => ({
                          value: lookups.employeeFullName(e),
                          label: `${e.employeeCode} — ${lookups.employeeFullName(e)}${e.jobTitle ? ` (${e.jobTitle})` : ''}`,
                        }))
                      }
                      onSelect={(val) => { form.setFieldsValue({ operatorName: val }); }}
                      onSearch={(val) => {
                        if (val && val.length > 0) {
                          const matches = lookups.employeesForDepartment(departmentId)
                            .some((e) => lookups.employeeFullName(e).toLowerCase() === val.toLowerCase());
                          if (!matches) {
                            form.setFieldsValue({ operatorName: val });
                          }
                        }
                      }}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="supervisorName" label="Supervisor Name">
                    <Input maxLength={120} placeholder="Optional" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Card
              title="Production Items"
              size="small"
              style={{ marginTop: 16 }}
              extra={
                maxItemsReached ? (
                  <Tooltip title="Maximum 2 production items are allowed.">
                    <span>
                      <Button type="primary" size="small" icon={<PlusOutlined />} disabled>
                        + Add Item
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    type="primary" size="small" icon={<PlusOutlined />}
                    onClick={() => addProductionItemRef.current()}
                  >
                    + Add Item
                  </Button>
                )
              }
            >
              <Form.List name="productionItems">
                {(fields, { add, remove }) => {
                  addProductionItemRef.current = () => add({});
                  return (
                  <>
                    {/* Header row: # | Item/Product | Wire Size | UOM | Quantity | Action */}
                    {fields.length > 0 && (
                      <Row gutter={6} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
                        <Col xs={24} sm={1} lg={1}><Text type="secondary" style={{ fontSize: 11 }}>#</Text></Col>
                        <Col xs={24} sm={10} lg={12}><Text type="secondary" style={{ fontSize: 11 }}>Item / Product</Text></Col>
                        <Col xs={24} sm={5} lg={3}><Text type="secondary" style={{ fontSize: 11 }}>Wire Size</Text></Col>
                        <Col xs={24} sm={4} lg={3}><Text type="secondary" style={{ fontSize: 11 }}>UOM</Text></Col>
                        <Col xs={24} sm={4} lg={3}><Text type="secondary" style={{ fontSize: 11 }}>Quantity</Text></Col>
                        <Col xs={24} sm={2} lg={2}></Col>
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
                        remove={() => remove(f.name)}
                      />
                    ))}
                    {multiItemAggregate && fields.length > 0 && (
                      <Row gutter={6} style={{ marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--theme-border, #f0f0f0)' }}>
                        <Col span={10}><Text strong style={{ fontSize: 12 }}>Totals ({fields.length} items)</Text></Col>
                        <Col span={14}>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            Actual: <Text strong>{formatNumber(multiItemAggregate.totalActual, 3)}</Text>
                            {' · '}Scrap: <Text strong>{formatNumber(multiItemAggregate.totalScrap, 3)}</Text>
                            {' · '}KG: <Text strong>{formatNumber(multiItemAggregate.totalKg, 3)}</Text>
                          </Text>
                        </Col>
                      </Row>
                    )}
                  </>
                  );
                }
              }
              </Form.List>
            </Card>

            {/* ── Item Details (one compact strip per selected production item) ── */}
            {selectedProductionItems.length > 0 && (
              <Card
                size="small"
                style={{ marginTop: 16, borderLeft: '3px solid var(--theme-success)', background: 'var(--theme-success-soft)' }}
                title={<span style={{ fontSize: 13 }}><InfoCircleOutlined style={{ marginRight: 6, color: 'var(--theme-success)' }} />Item Details</span>}
              >
                {selectedProductionItems.map((item, idx) => {
                  const prodRow = (productionItemsWatch ?? []).find((p: { itemId?: string; uomId?: string } | null | undefined) => p?.itemId === item.id);
                  const rowUomId = prodRow?.uomId as string | undefined;
                  const rmData = rawMaterialData[item.id] ?? null;
                  return (
                    <div key={item.id} data-testid={`item-details-item-${idx + 1}`} style={{ marginBottom: idx < selectedProductionItems.length - 1 ? 8 : 0 }}>
                      <Text type="secondary" strong style={{ fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                        Item {idx + 1} — {item.itemCode}{item.name && item.name !== item.itemCode ? ` · ${item.name}` : ''}
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

            {/* ── Raw Material Availability (real BOM + inventory) ── */}
            <RawMaterialAvailability
              productionItems={(productionItemsWatch ?? []) as Array<{ itemId?: string; actualQuantity?: number | string; uomId?: string }>}
              lookups={lookups}
              warehouseId={form.getFieldValue('rawMaterialWarehouseId') as string | undefined}
              onData={setRawMaterialData}
            />

            <Card title="Production Figures" size="small" style={{ marginTop: 16 }}>
              <Row gutter={8}>
                <Col span={12}>
                  {machineLinked ? (
                    <Form.Item label={<span>Target Production <InputBadge type="auto" /></span>} required>
                      <div style={{ position: 'relative' }}>
                        <div
                          className="target-auto-field"
                          style={{
                            background: 'var(--theme-surface-alt)', borderRadius: 6,
                            padding: '5px 12px', minHeight: 32,
                            border: '1px solid var(--theme-border)',
                          }}
                        >
                          {resolvingMt ? (
                            <Spin size="small" />
                          ) : displayTarget !== null ? (
                            <Text strong style={{ fontSize: 18 }}>
                              {formatNumber(displayTarget, 3)}
                              {mtResolution?.uom?.code ? <Text type="secondary" style={{ fontSize: 12, marginLeft: 6 }}>{mtResolution.uom.code}</Text> : null}
                            </Text>
                          ) : (
                            <Text type="secondary">—</Text>
                          )}
                          <AimOutlined style={{ position: 'absolute', right: 10, top: 9, color: 'var(--theme-text-muted)' }} />
                        </div>
                      </div>
                    </Form.Item>
                  ) : (
                    <Form.Item
                      name="targetQuantity"
                      label={<span>Target Production <InputBadge type="input" /></span>}
                      initialValue={undefined}
                      rules={[{ required: true, message: 'Target is required' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={0.000001} />
                    </Form.Item>
                  )}
                  {machineLinked && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -14, marginBottom: 8 }}>
                      {mtResolution
                        ? `Auto-resolved from the Machine Target master${mtResolution.item ? ` (${mtResolution.item.code})` : ''} — standard ${formatNumber(mtResolution.standardTarget, 0)} ${mtResolution.uom?.code ?? ''} / ${formatNumber(mtResolution.standardHours, 2)}h${mtResolution.targetPerHour ? ` · ${formatNumber(mtResolution.targetPerHour, 2)} ${mtResolution.uom?.code ?? ''}/h` : ''}${plannedHours > 0 ? ` · planned ${formatNumber(plannedHours, 2)}h` : ''}${mtResolution.usedGeneralFallback ? ' · GENERAL-shift fallback' : ''}${mtResolution.route?.operations?.length ? ` · route: ${mtResolution.route.operations.length} op(s)` : ''}`
                        : 'Resolving from the Machine Target master…'}
                    </Text>
                  )}
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="actualQuantity"
                    label={<span>Actual Good Production <InputBadge type={isActualAuto ? 'auto' : 'input'} /></span>}
                    rules={[{ required: !isActualAuto, message: 'Actual is required' }]}
                    extra={isActualAuto ? 'Auto-calculated as the sum of all Production Item quantities.' : undefined}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} disabled={isActualAuto} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="runningHours"
                    label={<span>Running Hours <InputBadge type={plannedHours > 0 && downtimeMode === 'manual' ? 'auto' : 'input'} /></span>}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 0, message: 'Running hours cannot be negative' },
                      () => ({
                        validator: (_r: unknown, v: number | null) => {
                          if (v === null || v === undefined) return Promise.resolve();
                          if (v < 0) return Promise.reject(new Error('Running hours cannot be negative'));
                          if (plannedHours > 0 && v > plannedHours) {
                            return Promise.reject(new Error('Running hours cannot exceed planned shift hours.'));
                          }
                          if (plannedHours > 0 && downtimeMode === 'manual' && Math.abs(round2(v + totalDowntime) - plannedHours) > 0.01) {
                            return Promise.reject(new Error('Running hours + Total Downtime must equal planned hours.'));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0} max={plannedHours > 0 ? plannedHours : 24} step={0.25}
                      disabled={runningReadOnly}
                      onChange={setHoursFromRunning}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="scrapQuantity"
                    label={<span>Rejection / Scrap <InputBadge type="input" /></span>}
                    rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} />
                  </Form.Item>
                </Col>
              </Row>
              {machineLinked && mtError && (
                <Alert
                  type="error" showIcon style={{ marginBottom: 12 }}
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
          </Col>

          {/* ── RIGHT: Downtime (top) + Production Order Linkage + Production Route ── */}
          <Col xs={24} xl={9}>
            <Card
              title={<span><ClockCircleOutlined style={{ marginRight: 6 }} />Downtime</span>}
              size="small"
              extra={
                <Button
                  type="primary" size="small" icon={<PlusOutlined />}
                  onClick={() => addDowntimeRef.current()}
                >
                  + Add Downtime
                </Button>
              }
            >
              {plannedHours > 0 && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  Planned {formatNumber(plannedHours, 2)}h − Running {formatNumber(derivedRunning, 2)}h = Downtime {formatNumber(derivedDowntime, 2)}h
                </Text>
              )}

              {/* Entry Mode toggle */}
              <Row gutter={8} style={{ marginBottom: 8 }}>
                <Col span={24}>
                  <Form.Item
                    label="Entry Mode"
                    tooltip="AUTO: enter Running Hours and Downtime is derived from the shift plan. MANUAL: enter Downtime lines and Running is derived."
                    style={{ marginBottom: 4 }}
                  >
                    <Select
                      value={downtimeMode}
                      onChange={handleDowntimeModeChange}
                      options={[
                        { value: 'auto', label: 'AUTO (Running → Downtime)' },
                        { value: 'manual', label: 'MANUAL (Downtime → Running)' },
                      ]}
                    />
                  </Form.Item>
                </Col>
              </Row>

              {downtimeMode === 'auto' && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  {plannedHours > 0
                    ? `Enter Running Hours in Production Figures. Total downtime = planned ${formatNumber(plannedHours, 2)}h − running ${formatNumber(derivedRunning, 2)}h`
                    : 'No shift plan — enter running hours directly'}
                </Text>
              )}

              {downtimeMode === 'manual' && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  {plannedHours > 0
                    ? `Enter downtime lines below. Running = planned ${formatNumber(plannedHours, 2)}h − total downtime ${formatNumber(totalDowntime, 2)}h`
                    : 'Enter downtime lines below'}
                </Text>
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
                            p?.downtimeEntries?.[f.name]?.confirmed !== c?.downtimeEntries?.[f.name]?.confirmed
                          }
                        >
                          {({ getFieldValue }) => {
                            const confirmed = getFieldValue(['downtimeEntries', f.name, 'confirmed']) === true;
                            const reasonId = getFieldValue(['downtimeEntries', f.name, 'downtimeReasonId']);
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
                                    ? 'rgba(82, 196, 26, 0.07)'
                                    : (reasonId ? 'rgba(255, 77, 79, 0.07)' : 'transparent'),
                                  border: `1px solid ${
                                    confirmed ? 'rgba(82, 196, 26, 0.35)' : (reasonId ? 'rgba(255, 77, 79, 0.30)' : 'var(--theme-border)')
                                  }`,
                                }}
                              >
                                {/* Hidden visual-state flag (never sent to the backend DTO). */}
                                <Form.Item name={[f.name, 'confirmed']} noStyle hidden initialValue={false}>
                                  <Input type="hidden" />
                                </Form.Item>
                                <Row gutter={6} align="middle">
                                  <Col span={9}>
                                    <Form.Item
                                      name={[f.name, 'downtimeReasonId']}
                                      noStyle
                                      rules={[{ required: true, message: 'Required' }]}
                                    >
                                      <Select
                                        size="small"
                                        showSearch optionFilterProp="label"
                                        placeholder="Downtime reason"
                                        options={lookups.downtimeReasons.map((r) => ({ value: r.id, label: r.name }))}
                                      />
                                    </Form.Item>
                                  </Col>
                                  <Col span={6}>
                                    <Form.Item
                                      name={[f.name, 'downtimeHours']}
                                      noStyle
                                      rules={[{ required: true, message: 'Required' }]}
                                    >
                                      <InputNumber
                                        size="small"
                                        min={0}
                                        max={plannedHours > 0 ? plannedHours : 24}
                                        step={0.25}
                                        placeholder="Hours"
                                        style={{ width: '100%' }}
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

              <DowntimeSummary totalDowntime={totalDowntime} plannedHours={plannedHours} runningHours={derivedRunning} />

              <Form.Item name="remarks" label="Remarks" style={{ marginTop: 12 }}>
                <Input.TextArea rows={2} maxLength={500} showCount placeholder="Notes about this shift's production" />
              </Form.Item>
            </Card>

            <Card title="Production Order Linkage (optional)" size="small" style={{ marginTop: 16 }}>
              <Alert
                type="info" showIcon style={{ marginBottom: 12 }}
                message="Link an order to track output against it. Do NOT also enable direct inventory posting — order completion posts stock once."
              />
              <Form.Item name="productionOrderId" label="Production Order No.">
                <Select
                  allowClear showSearch optionFilterProp="label" placeholder="None"
                  options={lookups.productionOrders.map((o) => ({ value: o.id, label: `${o.orderNumber}` }))}
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
                  options={(operationsForOrder as OrderOperation[]).map((op) => ({
                    value: op.id,
                    label: `#${op.sequenceNo} — ${op.operationName || op.name || 'Operation'}`,
                  }))}
                />
              </Form.Item>
              {orderMismatch && (
                <Alert type="error" showIcon message="Selected item differs from this order's product. Save will be rejected." />
              )}
              <Form.Item
                name="postToInventory"
                label="Post Directly to Inventory (make-to-stock)"
                valuePropName="checked"
                extra={mode === 'edit' ? 'Inventory posting is decided at creation and cannot be changed here.' : undefined}
              >
                <Switch disabled={!!productionOrderId || mode === 'edit'} />
              </Form.Item>
              <Form.Item
                noStyle
                shouldUpdate={(p, c) => p.postToInventory !== c.postToInventory}
              >
                {({ getFieldValue }) =>
                  getFieldValue('postToInventory') ? (
                    <Form.Item
                      name="warehouseId"
                      label="Receipt Warehouse"
                      rules={[{ required: true, message: 'Warehouse is required for direct posting' }]}
                      style={{ marginTop: -12 }}
                    >
                      <Select
                        allowClear showSearch optionFilterProp="label" placeholder="Select Warehouse"
                        disabled={mode === 'edit'}
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(p, c) => p.postToInventory !== c.postToInventory}
              >
                {({ getFieldValue }) =>
                  getFieldValue('postToInventory') ? (
                    <Form.Item
                      name="rawMaterialWarehouseId"
                      label="Raw Material Source Warehouse"
                      tooltip="Warehouse that the ACTIVE BOM raw materials are automatically deducted from when this entry posts to inventory."
                      style={{ marginTop: -12 }}
                    >
                      <Select
                        allowClear showSearch optionFilterProp="label" placeholder="Where BOM raw materials are consumed from"
                        disabled={mode === 'edit'}
                        options={warehouses.map((w) => ({ value: w.id, label: `${w.warehouseCode} — ${w.name}` }))}
                      />
                    </Form.Item>
                  ) : null
                }
              </Form.Item>
            </Card>

            <Card title="Production Route" size="small" style={{ marginTop: 16 }}>
              {machineLinked && mtResolution?.route ? (
                <RouteChain route={mtResolution.route} />
              ) : machineLinked && resolvingMt ? (
                <Spin size="small" />
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

            {machineLinked && (
              <Alert
                type="success" showIcon icon={<LockOutlined />} style={{ marginTop: 16 }}
                message="Target & Running/Downtime hours are governed by the shift"
                description="The target comes from the active Machine Target (ERP-00016). Running Hours + Downtime Hours always equal the shift's planned hours — enter Running Hours and Downtime is derived automatically."
              />
            )}
          </Col>
        </Row>

        <Button
          type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}
          disabled={submitBlocked}
          block size="large" style={{ marginTop: 16 }}
        >
          {mode === 'create' ? 'Save Production Entry' : 'Update Production Entry'}
        </Button>
        {submitBlocked && !resolvingMt && (
          <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 6 }}>
            Saving is unavailable until an active Machine Target resolves for this machine and shift.
          </Text>
        )}
        </>
        )}
      </Form>
    </div>
  );
};

const CtxItem: React.FC<{ label: string; value?: React.ReactNode; strong?: boolean }> = ({ label, value, strong }) => (
  <div style={{ minWidth: 90 }}>
    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>{label}</Text>
    <Text strong={strong} style={{ fontSize: 13 }}>{value ?? '—'}</Text>
  </div>
);

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
  <div style={{ background: 'var(--theme-surface-alt)', borderRadius: 6, padding: '8px 12px', borderTop: `3px solid ${accent ?? 'var(--theme-primary)'}`, height: '100%' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent ?? 'var(--theme-primary)' }}>
      {icon}
      <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
    </div>
    <div>{content}</div>
    <Text type="secondary" style={{ fontSize: 11 }}>{hint}</Text>
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
 *  below the production item info (Code, Name, Wire Size, UOM, Available). */
const ItemDetailsStrip: React.FC<{
  item: ItemLk;
  rawMaterial?: {
    itemCode: string;
    itemName?: string | null;
    wireSizeMm?: number | null;
    uomCode?: string | null;
    available?: number | null;
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
      {item.itemCode && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Item Code" value={item.itemCode} />
        </div>
      )}
      {item.name && item.name !== item.itemCode && (
        <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
          <ItemMetadatum label="Item Name" value={item.name} />
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
              {rawMaterial.itemCode}{rawMaterial.itemName ? ` — ${rawMaterial.itemName}` : ''}
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
            <ItemMetadatum label="RM UOM" value={rawMaterial.uomCode} />
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
                {allItems?.find((i) => i.id === productionInItemId)?.itemCode ?? productionInItemId}
              </span>
            } />
          </div>
        )}
        {productionOutItemId && (
          <div style={{ display: 'flex', paddingRight: 16, borderRight: '1px solid rgba(128,128,128,0.28)', marginRight: 16 }}>
            <ItemMetadatum label="Output Product" value={
              <span style={{ color: 'var(--theme-success, #52c41a)' }}>
                {productionOutItemId === item.id
                  ? `${item.itemCode} (self)`
                  : `${allItems?.find((i) => i.id === productionOutItemId)?.itemCode ?? productionOutItemId} (unexpected)`}
              </span>
            } />
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
   *  'routing' when it is the producing operation's `inputQuantity`. */
  rawSource?: 'bom' | 'routing';
  /** Wire size of the raw material Item Master record (for mismatch detection). */
  rawWireSizeMm?: number | null;
  /** Wire size of the production item (for mismatch detection). */
  prodWireSizeMm?: number | null;
  /** UOM code of the raw material's base UOM. */
  rawBaseUomCode?: string | null;
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
 *  Nothing is hardcoded (no WIRE/FLATTENING/SPIRAL). All values come from
 *  `GET /production/routings/item/:id/route` and `GET /bom/product/:prevOutputId`.
 *  Required is quantity-reactive (mirrors the backend computeBomRequirement
 *  formula) and UOM-aware; Available comes from `/inventory/balances/available`. */
const RawMaterialAvailability: React.FC<{
  productionItems: Array<{ itemId?: string; actualQuantity?: number | string; uomId?: string }>;
  lookups: ReturnType<typeof useLookups>;
  warehouseId?: string;
  onData?: (data: Record<string, { itemCode: string; itemName?: string | null; wireSizeMm?: number | null; uomCode?: string | null; available?: number | null; productionInItemId?: string | null; productionOutItemId?: string | null; chainWarning?: string | null }>) => void;
}> = ({ productionItems, lookups, warehouseId, onData }) => {
  const [data, setData] = useState<Record<string, RawMatItem>>({});
  const selected = productionItems.filter((p) => !!p.itemId);
  const selectedIds = selected.map((p) => p.itemId).join('|');

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
          // ── 1) Resolve the immediate previous stage from the item's routing.
          const routeRes = await apiService.get<{ data?: RoutingLk | null }>(`/production/routings/item/${itemId}/route`);
          const route = routeRes.data;
          if (cancelled) return;
          const ops = Array.isArray(route?.operations) ? [...route.operations].sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0)) : [];
          const idx = ops.findIndex((o) => o.outputItemId === itemId);
          if (!route || !ops.length || idx < 0) {
            setData((prev) => ({
              ...prev,
              [itemId]: { ...emptyTrace, itemId, loading: false, traceStatus: 'no-previous-stage' },
            }));
            return;
          }
          const producingOp = ops[idx];
          const prevOp = idx > 0 ? ops[idx - 1] : undefined;

          // ── 2) EXACT raw material (TASK #30 / #33):
          //    Primary: Item Master `productionInItemId` — the ERP administrator's
          //    explicit mapping. This is the single source of truth for IN/OUT.
          //    Fallback: routing chain producing-op input → prev-op output.
          const item = lookups.items.find((i) => i.id === itemId);
          const masterInItemId = item?.productionInItemId ?? item?.productionInItem?.id ?? null;
          const masterOutItemId = item?.productionOutItemId ?? item?.productionOutItem?.id ?? null;
          // TASK #33: Prefer the relation object; fall back to the full lookup
          // record so the item code/name still render when only the scalar FK is
          // present on the Item Master record.
          const masterInItem = item?.productionInItem ?? (masterInItemId ? lookups.items.find((i) => i.id === masterInItemId) ?? null : null);

          let rawItemRef: { itemId: string; item: { id?: string; itemCode?: string; name?: string; baseUomId?: string; baseUom?: { code?: string } | null } | null | undefined } | null = null;
          let prevStageItemId: string | null = null;
          if (masterInItemId) {
            // TASK #33: Use Item Master's explicit productionInItemId
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
          const prodQty = Math.max(0, toNum(p.actualQuantity));
          const qtyInBase = convertBetweenUoms(p.uomId, productBaseUomId, prodQty, lookups.uomConversions);

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
              const cursor = lookups.items.find((i) => i.id === cursorId);
              if (!cursor) break;
              inputChain.push(cursor.itemCode);
              cursorId = cursor.productionInItemId ?? cursor.productionInItem?.id ?? null;
              hops += 1;
            }
          }

          // ── 3) Required quantity. Primary source: the current item's ACTIVE BOM
          //    (authoritative MRP quantity, mirrors backend computeBomRequirement),
          //    search for the resolved raw material by item id. Fallback: the
          //    producing operation's `inputQuantity` (per unit) when no BOM line
          //    matches — so the exact raw material is still quantified even when a
          //    BOM is absent (real data often has routing inputs but no BOM seeds).
          const bomRes = await apiService.get<{ data?: ActiveBomLk | null }>(`/bom/product/${itemId}`);
          const bom = bomRes.data;
          if (cancelled) return;
          const baseQuantity = Math.max(1, toNum(bom?.baseQuantity, 1));
          const units = qtyInBase / baseQuantity;
          const bomLine = (bom?.lines ?? []).find((l) => l.itemId === prevStageItemId);
          const component = rawItemRef.item;
          const componentBaseUomId = component?.baseUomId ?? bomLine?.uomId ?? null;
          let rawQuantity = bomLine ? toNum(bomLine.quantity) : toNum(producingOp?.inputQuantity);
          const rawScrapFactor = bomLine ? toNum(bomLine.scrapFactor) : 0;
          const rawYield = Math.max(0.0001, bomLine ? toNum(bomLine.yieldPercentage, 100) : 100);
          const lineUomId = bomLine?.uomId ?? componentBaseUomId;
          let req = units * rawQuantity * (1 + rawScrapFactor) / (rawYield / 100);
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

          // TASK #32: Fetch the raw material item's wire size + UOM from Item Master
          // for wire-size mismatch detection and display. The raw material is the
          // exact Item Master record resolved via the routing chain — never guessed.
          let rawWireSizeMm: number | null = null;
          let rawBaseUomCode: string | null = null;
          if (prevStageItemId) {
            try {
              const rawItemRes = await apiService.get<{ data?: { wireSizeMm?: number | null; baseUom?: { code?: string } | null } }>(
                `/master-data/items/${prevStageItemId}`,
              );
              if (cancelled) return;
              const rawItemData = rawItemRes.data;
              rawWireSizeMm = rawItemData?.wireSizeMm ?? null;
              rawBaseUomCode = rawItemData?.baseUom?.code ?? null;
            } catch { /* non-critical: display without wire size if fetch fails */ }
          }

          const prodWireSizeMm = item?.wireSizeMm ?? null;

          // A BOM exists but does not list the resolved raw material → report the
          // BOM's own components instead, keeping TASK #29's component view for full
          // MRP disclosure while still leading with the routing-derived raw material.
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
            rawSource: bomLine ? 'bom' : 'routing',
            rawWireSizeMm,
            prodWireSizeMm,
            rawBaseUomCode,
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
          //    (the current Item IS the output of its stage; read from the SAME
          //    existing inventory API keyed by the exact Item ID).
          void (async () => {
            try {
              const params: Record<string, unknown> = { itemId };
              if (warehouseId) params.warehouseId = warehouseId;
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
        } catch {
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
  }, [selectedIds, warehouseId, lookups.uomConversions, lookups.items]);

  // Recompute each line's "Required" (and derived balance/shortage) whenever the
  // production quantity or UOM changes, without refetching routing/BOM/inventory.
  // Mirrors the backend computeBomRequirement formula: units = qtyInBase / baseQuantity,
  // req = units * line.quantity * (1 + scrapFactor) / (yield% / 100).
  const qtySig = selected.map((p) => `${p.itemId}:${toNum(p.actualQuantity)}:${p.uomId ?? ''}`).join('|');
  useEffect(() => {
    setData((prev) => {
      const next: Record<string, RawMatItem> = {};
      for (const key of Object.keys(prev)) {
        const it = prev[key];
        if (it.loading || !it.lines.length) { next[key] = it; continue; }
        const prod = selected.find((p) => p.itemId === key);
        if (!prod) { next[key] = it; continue; }
        const item = lookups.items.find((i) => i.id === key);
        const productBaseUomId = item?.baseUomId ?? prod.uomId;
        const qtyInBase = convertBetweenUoms(prod.uomId, productBaseUomId, Math.max(0, toNum(prod.actualQuantity)), lookups.uomConversions);
        const units = qtyInBase / it.baseQuantity;
        next[key] = {
          ...it,
          lines: it.lines.map((l) => {
            let req = units * l.rawQuantity * (1 + l.rawScrapFactor) / (l.rawYield / 100);
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
  useEffect(() => {
    if (!onData) return;
    const extracted: Record<string, { itemCode: string; itemName?: string | null; wireSizeMm?: number | null; uomCode?: string | null; available?: number | null; productionInItemId?: string | null; productionOutItemId?: string | null; chainWarning?: string | null }> = {};
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
            {/* TASK #34B: OUTPUT INVENTORY — real current balance of the produced item. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 96 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>Output Inventory</Text>
              {info.outLoading ? (
                <Spin size="small" />
              ) : info.outError || info.outAvailable == null ? (
                <Text type="secondary" data-testid={`material-flow-outputinv-${index + 1}`} style={{ color: 'var(--theme-text-muted, #8c8c8c)' }}>—</Text>
              ) : (
                <Text strong data-testid={`material-flow-outputinv-${index + 1}`} style={{ fontSize: 12, color: 'var(--theme-primary)' }}>
                  {formatNumber(info.outAvailable, 3)} {info.outUomCode ?? ''}
                </Text>
              )}
            </div>
            {/* PREVIOUS STAGE */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Previous Stage</Text>
              <Text style={{ fontSize: 12 }} data-testid={`material-flow-prevstage-${index + 1}`}>{info.prevStageName || 'Previous stage'} → {info.prevStageItemCode ?? '—'}</Text>
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
                  {/* Input Material: Item Code + Name */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Text type="secondary" style={{ fontSize: 11, minWidth: 90 }}>Input Material</Text>
                    <Text strong style={{ fontSize: 12, color: 'var(--theme-primary)' }} data-testid={`material-flow-rawitem-${index + 1}`}>
                      {line.itemCode}
                    </Text>
                    {line.itemName && (
                      <Text style={{ fontSize: 12 }} data-testid={`material-flow-rawname-${index + 1}`}>{line.itemName}</Text>
                    )}
                    {line.rawSource === 'routing' && (
                      <Text type="secondary" style={{ fontSize: 10 }}>[routing input]</Text>
                    )}
                  </div>
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
                  {/* Required / Available / Shortage */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingLeft: 96 }}>
                    <Text type="secondary" style={{ fontSize: 11 }}>Required <Text strong data-testid={`material-flow-required-${index + 1}`}>{formatNumber(line.required, 3)} {line.uomCode}</Text></Text>
                    <Text type="secondary">·</Text>
                    {line.loadingAvailable ? (
                      <Text type="secondary"><Spin size="small" /></Text>
                    ) : line.availableError || line.available == null ? (
                      <Text type="secondary" data-testid={`material-flow-status-${index + 1}`} style={{ color: 'var(--theme-text-muted, #8c8c8c)' }}>Available — Unable to determine</Text>
                    ) : line.shortage != null && line.shortage > 0 ? (
                      <span style={{ color: 'var(--theme-danger, #ff4d4f)' }}>
                        <Text type="secondary">Available <Text strong data-testid={`material-flow-available-${index + 1}`}>{formatNumber(line.available, 3)} {line.uomCode}</Text></Text>
                        <Text type="danger" data-testid={`material-flow-status-${index + 1}`}>· Shortage <Text strong>{formatNumber(line.shortage, 3)} {line.uomCode}</Text></Text>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--theme-success, #52c41a)' }}>
                        <Text type="secondary">Available <Text strong data-testid={`material-flow-available-${index + 1}`}>{formatNumber(line.available, 3)} {line.uomCode}</Text></Text>
                        <Text style={{ color: 'var(--theme-success)' }} data-testid={`material-flow-status-${index + 1}`}>· Balance <Text strong>{formatNumber(line.balance ?? 0, 3)} {line.uomCode}</Text></Text>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ marginTop: 4, border: '1px solid var(--theme-border, #d9d9d9)', borderRadius: 6, padding: '8px 10px' }}>
            <Text strong style={{ fontSize: 12 }}>
              Item {index + 1}{info?.itemCode ? ` — ${info.itemCode}${info.itemName ? ` (${info.itemName})` : ''}` : ''}
            </Text>
            <div style={{ marginTop: 4 }}>
              {info?.loading ? (
                <div style={{ padding: '4px 0' }}><Spin size="small" /></div>
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
                  <Text type="secondary" style={{ fontSize: 12 }}>Inventory availability could not be determined.</Text>
                  <div style={{ marginTop: 4 }}>
                    <Text data-testid={`material-flow-inventory-error-${index + 1}`} style={{ fontSize: 12, color: 'var(--theme-text-muted, #8c8c8c)' }}>Unable to determine</Text>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>Raw material resolved but inventory balance could not be determined.</Text>
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
  remove: () => void;
}> = ({ fieldName, rowNumber, lookups, machineLinked, mtResolution, departmentItems, remove }) => {
  const lineItemId = Form.useWatch(['productionItems', fieldName, 'itemId'], Form.useFormInstance() as any);
  const lineActualQty = Form.useWatch(['productionItems', fieldName, 'actualQuantity'], Form.useFormInstance() as any);
  const lineScrapQty = Form.useWatch(['productionItems', fieldName, 'scrapQuantity'], Form.useFormInstance() as any);
  const lineUomId = Form.useWatch(['productionItems', fieldName, 'uomId'], Form.useFormInstance() as any);

  const lineItem = useMemo(
    () => lookups.items.find((i) => i.id === lineItemId) ?? null,
    [lookups.items, lineItemId],
  );

  const validLineUoms = useMemo(() => {
    if (machineLinked && mtResolution?.uom?.id) {
      return lookups.uoms.filter((u) => u.id === mtResolution.uom!.id);
    }
    return lookups.validUomsForItem(lineItemId);
  }, [machineLinked, mtResolution, lookups.uoms, lookups.uomConversions, lookups.items, lineItemId]); // eslint-disable-line

  // Auto-fill UOM when item changes (non-machine-linked flow)
  const form = Form.useFormInstance();
  const prevLineItemRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!lineItemId || machineLinked) return;
    if (prevLineItemRef.current === lineItemId) return;
    prevLineItemRef.current = lineItemId;
    const item = lookups.items.find((i) => i.id === lineItemId);
    if (item?.baseUomId) {
      form.setFieldValue(['productionItems', fieldName, 'uomId'], item.baseUomId);
    }
  }, [lineItemId, machineLinked]); // eslint-disable-line

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
    if (!lineItem || lineItem.wireSizeMm == null) return null;
    return `${formatDimension(lineItem.wireSizeMm)} mm`;
  }, [lineItem]);

  // KG is kept for the aggregate tooltip only (no separate visible column).
  const kgNote = kgConversion
    ? `KG: ${formatNumber(kgConversion.kg, 3)} · Rejection KG: ${formatNumber(kgConversion.rejKg, 3)}`
    : null;

  // UOM placeholder reflects the item's own base UOM from the Item Master
  // (KG / METER / PCS) — never the generic literal "UOM".
  const lineUomPlaceholder = lineItem?.baseUom?.code ?? '—';

  return (
    <div data-testid={`production-item-row-${rowNumber}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
      <Row gutter={6} align="middle">
        <Col xs={24} sm={1} lg={1} style={{ display: 'flex', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: '32px' }}>{rowNumber}</Text>
        </Col>
        <Col xs={24} sm={10} lg={12}>
          <Form.Item name={[fieldName, 'itemId']} noStyle rules={[{ required: true, message: 'Required' }]}>
            <Select
              showSearch optionFilterProp="label"
              placeholder="Select item"
              aria-label={`Production item ${rowNumber}`}
              options={departmentItems.map((i: ItemLk) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={5} lg={3}>
          <Tooltip title={wireSizeDisplay || undefined}>
            <Text
              data-testid={`wire-size-row-${rowNumber}`}
              type={wireSizeDisplay ? undefined : 'secondary'}
              style={{ fontSize: 11, lineHeight: '32px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {wireSizeDisplay || '—'}
            </Text>
          </Tooltip>
        </Col>
        <Col xs={24} sm={4} lg={3}>
          <Form.Item name={[fieldName, 'uomId']} noStyle>
            <Select
              size="small"
              data-testid={`line-uom-${rowNumber}`}
              placeholder={lineUomPlaceholder}
              aria-label={`Production item UOM ${rowNumber}`}
              disabled={machineLinked}
              options={validLineUoms.map((u) => ({ value: u.id, label: u.code }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={4} lg={3}>
          <Form.Item name={[fieldName, 'actualQuantity']} noStyle>
            <InputNumber
              size="small"
              min={0}
              placeholder="Qty"
              style={{ width: '100%' }}
              aria-label="Item quantity"
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={2} lg={2}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={remove} aria-label={`Remove production item ${rowNumber}`} />
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
      {kgNote && (
        <Text type="secondary" style={{ fontSize: 10, display: 'block', paddingLeft: 8 }}>
          {kgNote}
        </Text>
      )}
    </div>
  );
};

export default EntryForm;
