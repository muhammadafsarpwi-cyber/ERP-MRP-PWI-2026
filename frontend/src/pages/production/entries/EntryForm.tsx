import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  message, Typography, Switch, Alert, Spin, AutoComplete, Tooltip,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, LockOutlined, AimOutlined, InfoCircleOutlined, PlusOutlined, DeleteOutlined, ClockCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { useLookups } from './lookups';
import {
  DowntimeMode, deriveFromRunning, rebalancePair,
  effectiveRunning, effectiveDowntime, round2, sumDowntimeLines,
  lineToKg, aggregateProductionTotals,
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
  operatorName: string; supervisorName: string | null; coilSize: string | null;
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
          coilSize: e.coilSize ?? undefined,
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
    if (!machineLinked || !itemId || !mId || !sId || !d) return;
    if (lastResolvedItemRef.current === itemId) return;
    lastResolvedItemRef.current = itemId;
    void resolveTarget(mId, sId, d, { itemId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, machineLinked]);

  useEffect(() => {
    if (mode === 'create' && departmentId) {
      void lookups.loadMachines(departmentId as string);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  // default UOM from item (manual/non-linked flow only)
  useEffect(() => {
    if (!itemId || mode !== 'create' || machineLinked) return;
    const item = lookups.items.find((i) => i.id === itemId);
    if (item?.baseUomId) form.setFieldValue('uomId', item.baseUomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, machineLinked]);

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

  const validUoms = useMemo(
    () => (machineLinked && mtResolution?.uom?.id
      ? lookups.uoms.filter((u) => u.id === mtResolution.uom!.id)
      : lookups.validUomsForItem(itemId as string | undefined)),
    [machineLinked, mtResolution, lookups.uoms, lookups.uomConversions, lookups.items, itemId], // eslint-disable-line
  );

  const selectedItem = useMemo(
    () => lookups.items.find((i) => i.id === itemId) ?? null,
    [lookups.items, itemId],
  );

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

  // Single-item KG conversion (legacy single-item fields), family-aware.
  const singleItemKg = useMemo(() => {
    if (!selectedItem) return null;
    const uomType = lookups.uoms.find((u) => u.id === uomId)?.uomType ?? null;
    const act = Math.max(0, toNum(actualQty));
    const rej = Math.max(0, toNum(scrapQty));
    const kg = lineToKg(act, { ...selectedItem, uomType });
    const rejKg = lineToKg(rej, { ...selectedItem, uomType });
    const total = act + rej;
    const rejPct = total > 0 ? Math.round((rej / total) * 10000) / 100 : 0;
    if (kg === null && rejKg === null) return null;
    return { kg: kg ?? 0, rejKg: rejKg ?? 0, rejPct };
  }, [selectedItem, actualQty, scrapQty, uomId, lookups.uoms]);

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

      // ── Multi-item / multi-downtime child lines ────────────────────────────
      const itemLines = (values.productionItems as any[] | undefined) ?? [];
      if (itemLines.length) {
        payload.items = itemLines
          .filter((l: any) => l.itemId)
          .map((l: any, idx: number) => ({
            lineNumber: l.lineNumber ?? idx + 1,
            itemId: l.itemId,
            uomId: l.uomId ?? payload.uomId,
            targetQuantity: Number(l.targetQuantity ?? 0),
            actualQuantity: Number(l.actualQuantity ?? 0),
            scrapQuantity: Number(l.scrapQuantity ?? 0),
            runningHours: Number(l.runningHours ?? 0),
            routingCode: l.routingCode ?? undefined,
            remarks: l.remarks ?? undefined,
          }));
      }

      // ── Compute aggregate downtime from lines ──────────────────────────────
      const downtimeLines = (values.downtimeEntries as any[] | undefined) ?? [];
      const computedDowntime = sumDowntimeLines(downtimeLines);
      if (downtimeLines.length) {
        payload.downtimes = downtimeLines.map((l: any, idx: number) => ({
          lineNumber: l.lineNumber ?? idx + 1,
          downtimeReasonId: l.downtimeReasonId ?? undefined,
          downtimeReason: l.downtimeReason ?? undefined,
          downtimeHours: Number(l.downtimeHours ?? 0),
          remarks: l.remarks ?? undefined,
        }));
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
  }, [mode, id, navigate, lockedContext, machineLinked, ctxIds, plannedHours, downtimeMode]); // eslint-disable-line react-hooks/exhaustive-deps

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

        <Row gutter={16}>
          {/* ── Column 1: Manpower & Product + optional order linkage ── */}
          <Col xs={24} lg={8}>
            <Card title="Operator & Product" size="small">
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
                    // Allow selecting a manual operator by typing a value not in the HR list
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
              <Form.Item name="supervisorName" label="Supervisor Name">
                <Input maxLength={120} placeholder="Optional" />
              </Form.Item>
              <Form.Item
                name="itemId"
                label="Item / Product"
                rules={[{ required: true, message: 'Item is required' }]}
              >
                <Select
                  showSearch optionFilterProp="label" placeholder="Select Item"
                  options={lookups.items.map((i) => ({
                    value: i.id,
                    label: `${i.itemCode} — ${i.name}`,
                  }))}
                />
              </Form.Item>
              <Form.Item
                name="coilSize"
                label="Coil Size (entry)"
                tooltip="Free-text coil size for this production entry. The Item Master has no coil-size field, so this is the authoritative persisted value for the entry."
              >
                <Input maxLength={50} placeholder="e.g. 2.5mm (optional)" />
              </Form.Item>
              <Form.Item
                name="uomId"
                label="UOM Type"
                rules={[{ required: true, message: 'UOM is required' }]}
                extra={machineLinked ? `Governed by the Machine Target unit (${mtResolution?.uom?.code ?? '…'})` : undefined}
              >
                <Select
                  placeholder="UOM"
                  disabled={machineLinked}
                  options={validUoms.map((u) => ({ value: u.id, label: `${u.code} (${u.symbol})` }))}
                />
              </Form.Item>
            </Card>

            {selectedItem && (
              <Card
                size="small" style={{ marginTop: 16, borderLeft: '3px solid var(--theme-success)', background: 'var(--theme-success-soft)' }}
                title={<span><InfoCircleOutlined style={{ marginRight: 6, color: 'var(--theme-success)' }} />Item Details</span>}
              >
                <Row gutter={[8, 4]}>
                  {selectedItem.wireSizeMm != null && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Wire Size</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{formatNumber(Number(selectedItem.wireSizeMm), 3)} mm</Text></div>
                    </Col>
                  )}
                  {selectedItem.routeType && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Route Type</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{selectedItem.routeType}</Text></div>
                    </Col>
                  )}
                  {selectedItem.weightPerPiece != null && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Weight / Piece</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{formatNumber(selectedItem.weightPerPiece, 5)} kg</Text></div>
                    </Col>
                  )}
                  {selectedItem.piecesPerKg != null && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Pieces / KG</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{formatNumber(selectedItem.piecesPerKg, 3)}</Text></div>
                    </Col>
                  )}
                  {selectedItem.weightPerMeter != null && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Weight / Meter</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{formatNumber(selectedItem.weightPerMeter, 6)} kg</Text></div>
                    </Col>
                  )}
                  {selectedItem.lengthPerPiece != null && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Length / Piece</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{formatNumber(selectedItem.lengthPerPiece, 4)} m</Text></div>
                    </Col>
                  )}
                  {selectedItem.baseUom && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Base UOM</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{selectedItem.baseUom.code}{selectedItem.baseUom.symbol ? ` (${selectedItem.baseUom.symbol})` : ''}</Text></div>
                    </Col>
                  )}
                  {selectedItem.itemType && (
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Type</Text>
                      <div><Text strong style={{ fontSize: 13 }}>{selectedItem.itemType.replace(/_/g, ' ')}</Text></div>
                    </Col>
                  )}
                </Row>
                {uomId && selectedItem.baseUomId && uomId !== selectedItem.baseUomId && (
                  <UomConversionHint fromUomId={uomId} toUomId={selectedItem.baseUomId} uomConversions={lookups.uomConversions} uoms={lookups.uoms} />
                )}
              </Card>
            )}

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
          </Col>

          {/* ── Column 2: Production Figures + KPI Summary ── */}
          <Col xs={24} lg={8}>
            <Card title="Production Figures" size="small">
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
                    label={<span>Actual Good Production <InputBadge type="input" /></span>}
                    rules={[{ required: true, message: 'Actual is required' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} />
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

            <Card title="KPI Summary" size="small" style={{ marginTop: 16 }}>
              <Row gutter={8}>
                <Col span={8}>
                  <StatisticMini
                    label="Efficiency %"
                    hint={`running vs planned hours${plannedHours > 0 ? ` (${formatNumber(plannedHours, 2)}h)` : ''}`}
                    content={<KpiPercentage value={efficiency} fontSize={20} fontWeight={600} />}
                    accent="var(--theme-success)"
                  />
                </Col>
                <Col span={8}>
                  <StatisticMini
                    label="Achievement %"
                    hint="actual vs target"
                    content={<KpiPercentage value={achievement} fontSize={20} fontWeight={600} />}
                  />
                </Col>
                <Col span={8}>
                  <StatisticMini
                    label="Rejection %"
                    hint={multiItemAggregate ? "rejection KG ÷ total KG (comparable unit)" : "scrap ÷ total produced (good + scrap)"}
                    content={
                      <Text strong style={{ fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
                        {formatNumber(multiItemAggregate?.rejectionPct ?? singleItemKg?.rejPct ?? rejectionPct, 2)}%
                      </Text>
                    }
                    accent="var(--theme-warning)"
                  />
                </Col>
              </Row>
              {(singleItemKg || multiItemAggregate) && (
                <Row gutter={8} style={{ marginTop: 8 }}>
                  <Col span={12}>
                    <StatisticMini
                      label="Production Weight (KG)"
                      hint={multiItemAggregate ? "sum of all items × weight/meter" : "actual × weight/meter"}
                      content={
                        <Text strong style={{ fontSize: 16, color: 'var(--theme-text)' }}>
                          {formatNumber(multiItemAggregate?.totalKg ?? singleItemKg?.kg ?? 0, 3)} KG
                        </Text>
                      }
                      accent="var(--theme-success)"
                    />
                  </Col>
                  <Col span={12}>
                    <StatisticMini
                      label="Rejection Weight (KG)"
                      hint={multiItemAggregate ? "sum of all items rejection × weight/meter" : "rejection × weight/meter"}
                      content={
                        <Text strong style={{ fontSize: 16, color: 'var(--theme-text)' }}>
                          {formatNumber(multiItemAggregate?.totalRejectionKg ?? singleItemKg?.rejKg ?? 0, 3)} KG
                        </Text>
                      }
                      accent="var(--theme-warning)"
                    />
                  </Col>
                </Row>
              )}
            </Card>
          </Col>

          {/* ── Column 3: Downtime (CONSOLIDATED multi-line) + Route ── */}
          <Col xs={24} lg={8}>
            <Card
              title={<span><ClockCircleOutlined style={{ marginRight: 6 }} />Downtime</span>}
              size="small"
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
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((f) => (
                      <div key={f.key} style={{ padding: '8px 0', borderBottom: fields.length > 1 ? '1px solid var(--theme-border, #f0f0f0)' : undefined }}>
                        <Row gutter={6} align="middle">
                          <Col span={10}>
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
                          <Col span={8}>
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
                          <Col span={4}>
                            <Form.Item name={[f.name, 'remarks']} noStyle>
                              <Input size="small" placeholder="Notes" />
                            </Form.Item>
                          </Col>
                          <Col span={2}>
                            <Button
                              type="text" danger size="small"
                              icon={<DeleteOutlined />}
                              onClick={() => remove(f.name)}
                              aria-label="Remove downtime entry"
                            />
                          </Col>
                        </Row>
                        {/* "Other" reason text field */}
                        <Form.Item noStyle shouldUpdate={(p, c) =>
                          p?.downtimeEntries?.[f.name]?.downtimeReasonId !== c?.downtimeEntries?.[f.name]?.downtimeReasonId
                        }>
                          {({ getFieldValue }) => {
                            const reasonId = getFieldValue(['downtimeEntries', f.name, 'downtimeReasonId']);
                            const reason = lookups.downtimeReasons.find((r) => r.id === reasonId);
                            const isOther = reason?.name?.toLowerCase() === 'other';
                            if (!isOther) return null;
                            return (
                              <Form.Item name={[f.name, 'downtimeReason']} noStyle>
                                <Input
                                  size="small"
                                  maxLength={200}
                                  placeholder="Specify reason…"
                                  style={{ marginTop: 4 }}
                                />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                      </div>
                    ))}
                    <Button
                      type="dashed" size="small" block
                      icon={<PlusOutlined />}
                      onClick={() => add({})}
                      style={{ marginTop: 8 }}
                    >
                      + Add Downtime
                    </Button>
                  </>
                )}
              </Form.List>

              <DowntimeSummary totalDowntime={totalDowntime} plannedHours={plannedHours} runningHours={derivedRunning} />

              <Form.Item name="remarks" label="Remarks" style={{ marginTop: 12 }}>
                <Input.TextArea rows={2} maxLength={500} showCount placeholder="Notes about this shift's production" />
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

        <Card title="Production Items" size="small" style={{ marginTop: 16 }}>
          <Form.List name="productionItems">
            {(fields, { add, remove }) => (
              <>
                {/* Header row */}
                {fields.length > 0 && (
                  <Row gutter={6} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
                    <Col span={5}><Text type="secondary" style={{ fontSize: 11 }}>Item</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>Wire Size</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>Target</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>Actual</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>Scrap</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>UOM</Text></Col>
                    <Col span={3}><Text type="secondary" style={{ fontSize: 11 }}>KG</Text></Col>
                    <Col span={1}></Col>
                  </Row>
                )}
                {fields.map((f) => (
                  <ProductionItemLine
                    key={f.key}
                    fieldName={f.name}
                    lookups={lookups}
                    machineLinked={machineLinked}
                    mtResolution={mtResolution}
                    remove={() => remove(f.name)}
                  />
                ))}
                <Button type="dashed" icon={<PlusOutlined />} block onClick={() => add({})}>
                  + Add Production Item
                </Button>
                {multiItemAggregate && (
                  <Row gutter={6} style={{ marginTop: 8, padding: '8px 0', borderTop: '1px solid var(--theme-border, #f0f0f0)' }}>
                    <Col span={5}><Text strong style={{ fontSize: 12 }}>Totals ({fields.length} items)</Text></Col>
                    <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Actual: <Text strong>{formatNumber(multiItemAggregate.totalActual, 3)}</Text></Text></Col>
                    <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>Scrap: <Text strong>{formatNumber(multiItemAggregate.totalScrap, 3)}</Text></Text></Col>
                    <Col span={6}><Text type="secondary" style={{ fontSize: 11 }}>KG: <Text strong>{formatNumber(multiItemAggregate.totalKg, 3)}</Text></Text></Col>
                  </Row>
                )}
              </>
            )}
          </Form.List>
        </Card>

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

const StatisticMini: React.FC<{ label: string; hint: string; content: React.ReactNode; accent?: string }> = ({ label, hint, content, accent }) => (
  <div style={{ background: 'var(--theme-surface-alt)', borderRadius: 6, padding: '8px 12px', borderTop: `3px solid ${accent ?? 'var(--theme-primary)'}` }}>
    <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
    <div>{content}</div>
    <Text type="secondary" style={{ fontSize: 11 }}>{hint}</Text>
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

/** Single production item line with wire size auto-fill and KG conversion. */
const ProductionItemLine: React.FC<{
  fieldName: number;
  lookups: ReturnType<typeof useLookups>;
  machineLinked: boolean;
  mtResolution: MachineTargetResolution | null;
  remove: () => void;
}> = ({ fieldName, lookups, machineLinked, mtResolution, remove }) => {
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

  // Wire size display from item master
  const wireSizeDisplay = useMemo(() => {
    if (!lineItem) return null;
    if (lineItem.wireSizeMm != null) return `${formatNumber(Number(lineItem.wireSizeMm), 3)} mm`;
    // Fallback: check thickness/width for flat wire
    const item = lineItem as any;
    if (item.thickness_mm != null && item.width_mm != null) {
      return `${formatNumber(Number(item.thickness_mm), 2)} / ${formatNumber(Number(item.width_mm), 2)} mm`;
    }
    return null;
  }, [lineItem]);

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--theme-border, #f0f0f0)' }}>
      <Row gutter={6} align="middle">
        <Col span={5}>
          <Form.Item name={[fieldName, 'itemId']} noStyle rules={[{ required: true, message: 'Required' }]}>
            <Select
              size="small"
              showSearch optionFilterProp="label"
              placeholder="Select item"
              options={lookups.items.map((i: any) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))}
            />
          </Form.Item>
        </Col>
        <Col span={3}>
          <Text
            type={wireSizeDisplay ? undefined : 'secondary'}
            style={{ fontSize: 11, lineHeight: '32px' }}
          >
            {wireSizeDisplay || '—'}
          </Text>
        </Col>
        <Col span={3}>
          <Form.Item name={[fieldName, 'targetQuantity']} noStyle>
            <InputNumber size="small" min={0} placeholder="Target" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={3}>
          <Form.Item name={[fieldName, 'actualQuantity']} noStyle>
            <InputNumber size="small" min={0} placeholder="Actual" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={3}>
          <Form.Item name={[fieldName, 'scrapQuantity']} noStyle>
            <InputNumber size="small" min={0} placeholder="Scrap" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={3}>
          <Form.Item name={[fieldName, 'uomId']} noStyle>
            <Select
              size="small"
              placeholder="UOM"
              disabled={machineLinked}
              options={validLineUoms.map((u) => ({ value: u.id, label: u.code }))}
            />
          </Form.Item>
        </Col>
        <Col span={3}>
          {kgConversion ? (
            <Tooltip title={`Rejection KG: ${formatNumber(kgConversion.rejKg, 3)}`}>
              <Text style={{ fontSize: 11, lineHeight: '32px' }}>
                <Text type="secondary" style={{ fontSize: 10 }}>KG:</Text> {formatNumber(kgConversion.kg, 3)}
              </Text>
            </Tooltip>
          ) : (
            <Text type="secondary" style={{ fontSize: 11, lineHeight: '32px' }}>—</Text>
          )}
        </Col>
        <Col span={1}>
          <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={remove} aria-label="Remove production item" />
        </Col>
      </Row>
      {/* Wire size detail card for flat wire (thickness × width) */}
      {lineItem && lineItem.wireSizeMm == null && (lineItem as any).thickness_mm != null && (lineItem as any).width_mm != null && (
        <div style={{ padding: '2px 0 2px 8px' }}>
          <Text type="secondary" style={{ fontSize: 10 }}>
            Wire: {formatNumber(Number((lineItem as any).thickness_mm), 2)} × {formatNumber(Number((lineItem as any).width_mm), 2)} mm
          </Text>
        </div>
      )}
    </div>
  );
};

export default EntryForm;
