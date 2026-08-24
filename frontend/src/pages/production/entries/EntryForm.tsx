import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, Form, Select, DatePicker, Input, InputNumber, Button, Space,
  message, Typography, Switch, Alert, Spin, AutoComplete,
} from 'antd';
import { ArrowLeftOutlined, SaveOutlined, LockOutlined, AimOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import { useLookups } from './lookups';
import KpiPercentage from '../../../components/kpi/KpiPercentage';

const { Title, Text } = Typography;

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

/** Payload of GET /production/entries/machine-target (ERP-00016 resolution). */
interface MachineTargetResolution {
  effectiveTargetRecordId: string;
  usedGeneralFallback: boolean;
  machine: { id: string; code: string; name: string };
  shift: { id: string; code: string; name: string } | null;
  uom: { id: string; code: string; name: string; symbol: string } | null;
  standardHours: number;
  standardTarget: number;
  calculatedTarget: number | null;
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
  const actualQty = Form.useWatch('actualQuantity', form);
  const runningHours = Form.useWatch('runningHours', form);
  const downtimeHours = Form.useWatch('downtimeHours', form);
  const productionOrderId = Form.useWatch('productionOrderId', form);
  const shiftId = Form.useWatch('shiftId', form);
  const targetQty = Form.useWatch('targetQuantity', form);
  const scrapQty = Form.useWatch('scrapQuantity', form);

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
  const ctxDepartmentId = ctxIds.departmentId;

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

  /** Ask the backend which ACTIVE Machine Target applies to machine+shift+date. */
  const resolveTarget = useCallback(async (machineId: string, mShiftId: string, productionDate: string) => {
    setResolvingMt(true);
    setMtError(null);
    try {
      const res = await apiService.get<{ success: boolean; data: MachineTargetResolution }>(
        '/production/entries/machine-target',
        { machineId, shiftId: mShiftId, productionDate },
      );
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
          downtimeHours: toNum(e.downtimeHours),
          scrapQuantity: toNum(e.scrapQuantity),
          downtimeReasonId: e.downtimeReasonId ?? undefined,
          remarks: e.remarks ?? undefined,
          productionOrderId: e.productionOrderId ?? undefined,
          productionOrderOperationId: e.productionOrderOperationId ?? undefined,
          postToInventory: !!e.inventoryReferenceId,
          warehouseId: e.warehouseId ?? undefined,
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
      void resolveTarget(entry.machineId, entry.shiftId, entry.entryDate.slice(0, 10));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, entry?.machineId, entry?.shiftId, entry?.entryDate]);

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

  const downtimeVal = toNum(downtimeHours);

  // ONE authoritative calculation (mirrors the documented formula):
  //   Downtime Hours = Planned Shift Hours − Running Hours
  // Running Hours is the operator's primary input; Downtime is derived and
  // read-only whenever the shift declares planned hours. setFieldsValue never
  // re-triggers onChange, so the update cannot loop. The server keeps final
  // authority and re-validates both values on save.
  const hoursInitRef = useRef(false);
  const round2 = (v: number) => Math.round(v * 100) / 100;

  const setHoursFromRunning = useCallback((v: number | null | undefined) => {
    if (v === null || v === undefined || Number.isNaN(v)) return;
    // Only derive while the value is inside 0..planned; out-of-range input is
    // left untouched so the field rules surface the exact validation error.
    const valid = v >= 0 && !(plannedHours > 0 && v > plannedHours);
    const r = round2(Math.min(Math.max(v, 0), plannedHours > 0 ? plannedHours : 24));
    form.setFieldsValue({
      runningHours: valid ? r : v,
      downtimeHours: plannedHours > 0 && valid ? round2(plannedHours - r) : toNum(form.getFieldValue('downtimeHours')),
    });
  }, [form, plannedHours]); // eslint-disable-line react-hooks/exhaustive-deps

  // First derivation + shift changes. When planned hours first become known, a
  // fresh create starts at full running / zero downtime while an edit keeps its
  // loaded split. On a later planned-hours change (shift switch) the operator's
  // RUNNING hours are preserved — clamped to the new plan — and downtime
  // absorbs the difference, so no stale split survives.
  useEffect(() => {
    if (!(plannedHours > 0)) return;
    if (!hoursInitRef.current) {
      hoursInitRef.current = true;
      if (mode === 'create') form.setFieldsValue({ runningHours: round2(plannedHours), downtimeHours: 0 });
      return;
    }
    const r = round2(Math.min(Math.max(toNum(form.getFieldValue('runningHours')), 0), plannedHours));
    form.setFieldsValue({ runningHours: r, downtimeHours: round2(plannedHours - r) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannedHours]);

  const derivedRunning = useMemo(() => {
    if (plannedHours > 0) return round2(Math.max(0, Math.min(plannedHours, plannedHours - downtimeVal)));
    return toNum(runningHours);
  }, [plannedHours, downtimeVal, runningHours]);

  // Downtine mirror for display/KPIs: identical to the stored field whenever
  // the pair is consistent, and always within 0..planned when derived.
  const derivedDowntime = useMemo(
    () => (plannedHours > 0 ? round2(Math.max(0, plannedHours - derivedRunning)) : downtimeVal),
    [plannedHours, derivedRunning, downtimeVal],
  );

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
    const denom = derivedRunning + downtimeVal;
    return denom > 0 ? Math.round((derivedRunning / denom) * 10000) / 100 : null;
  }, [derivedRunning, downtimeVal, plannedHours]);

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

  const onFinish = useCallback(async (values: Record<string, unknown>) => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...values };
      delete payload.__computed;
      delete payload.postToInventory; // presentation flag; create decides posting via explicit field below
      // allowClear on the reason Select yields undefined; send null so clearing persists
      payload.downtimeReasonId = (values.downtimeReasonId as string | undefined) ?? null;
      if (payload.productionOrderId === undefined) delete payload.productionOrderId;
      if (payload.productionOrderOperationId === undefined) delete payload.productionOrderOperationId;

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
  }, [mode, id, navigate, lockedContext, machineLinked, ctxIds]);

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
    <Card size="small" style={{ marginBottom: 16 }} title="Production Context">
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
              <Form.Item name="operatorName" label="Operator Name" rules={[{ required: true, message: 'Operator name is required' }]}>
                <Input maxLength={120} placeholder="Operator on duty" />
              </Form.Item>
              <Form.Item name="supervisorName" label="Supervisor Name">
                <Input maxLength={120} placeholder="Optional" />
              </Form.Item>
              <Form.Item name="coilSize" label="Coil Size">
                <Input maxLength={50} placeholder='e.g. 2.5mm' />
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
            </Card>
          </Col>

          {/* ── Column 2: Production Figures + KPI Summary ── */}
          <Col xs={24} lg={8}>
            <Card title="Production Figures" size="small">
              <Row gutter={8}>
                <Col span={12}>
                  {machineLinked ? (
                    <Form.Item label="Target Production" required>
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
                      label="Target Production"
                      initialValue={undefined}
                      rules={[{ required: true, message: 'Target is required' }]}
                    >
                      <InputNumber style={{ width: '100%' }} min={0.000001} precision={3} />
                    </Form.Item>
                  )}
                  {machineLinked && (
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: -14, marginBottom: 8 }}>
                      {mtResolution
                        ? `Auto-resolved from the Machine Target master — standard ${formatNumber(mtResolution.standardTarget, 0)} ${mtResolution.uom?.code ?? ''} / ${formatNumber(mtResolution.standardHours, 2)}h${mtResolution.usedGeneralFallback ? ' · GENERAL-shift fallback' : ''}`
                        : 'Resolving from the Machine Target master…'}
                    </Text>
                  )}
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="actualQuantity"
                    label="Actual Good Production"
                    initialValue={0}
                    rules={[{ required: true, message: 'Actual is required' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
                  </Form.Item>
                </Col>
              </Row>
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="runningHours"
                    label="Running Hours"
                    initialValue={0}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 0, message: 'Running hours cannot be negative' },
                      ({ getFieldValue }) => ({
                        validator: (_r: unknown, v: number | null) => {
                          if (v === null || v === undefined) return Promise.resolve();
                          if (v < 0) return Promise.reject(new Error('Running hours cannot be negative'));
                          if (plannedHours > 0 && v > plannedHours) {
                            return Promise.reject(new Error('Running hours cannot exceed planned shift hours.'));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0} max={plannedHours > 0 ? plannedHours : 24} step={0.25} precision={2}
                      onChange={setHoursFromRunning}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="scrapQuantity"
                    label="Rejection / Scrap"
                    initialValue={0}
                    rules={[{ required: true, message: 'Required' }, { type: 'number', min: 0, message: 'Must be ≥ 0' }]}
                  >
                    <InputNumber style={{ width: '100%' }} min={0} precision={3} />
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
                    hint="scrap ÷ total produced (good + scrap)"
                    content={
                      <Text strong style={{ fontSize: 20, fontWeight: 600, color: 'var(--theme-text)' }}>
                        {formatNumber(rejectionPct, 2)}%
                      </Text>
                    }
                  />
                </Col>
              </Row>
            </Card>
          </Col>

          {/* ── Column 3: Downtime ── */}
          <Col xs={24} lg={8}>
            <Card title="Downtime" size="small">
              {plannedHours > 0 && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                  Planned {formatNumber(plannedHours, 2)}h − Running {formatNumber(derivedRunning, 2)}h = Downtime {formatNumber(derivedDowntime, 2)}h
                </Text>
              )}
              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item
                    name="downtimeHours"
                    label="Downtime Hours"
                    initialValue={0}
                    extra={plannedHours > 0 ? `Derived: planned ${formatNumber(plannedHours, 2)}h − running ${formatNumber(derivedRunning, 2)}h` : undefined}
                    rules={[
                      { required: true, message: 'Required' },
                      { type: 'number', min: 0, message: 'Downtime cannot be negative' },
                      ({ getFieldValue }) => ({
                        validator: (_r: unknown, v: number | null) => {
                          if (v === null || v === undefined) return Promise.resolve();
                          if (v < 0) return Promise.reject(new Error('Downtime cannot be negative'));
                          if (plannedHours > 0 && v > plannedHours) {
                            return Promise.reject(new Error(`Downtime cannot exceed planned shift hours (${formatNumber(plannedHours, 2)}h)`));
                          }
                          return Promise.resolve();
                        },
                      }),
                    ]}
                  >
                    <InputNumber
                      style={{ width: '100%' }}
                      min={0}
                      max={plannedHours > 0 ? plannedHours : 24}
                      step={0.25} precision={2}
                      disabled={plannedHours > 0}
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="downtimeReasonId" label="Downtime Reason">
                    <Select
                      allowClear showSearch optionFilterProp="label"
                      loading={lookups.downtimeReasonsLoading}
                      placeholder={lookups.downtimeReasonsLoading ? 'Loading reasons…' : 'Reason'}
                      notFoundContent={
                        lookups.downtimeReasonsFailed ? (
                          <Space direction="vertical" size={0}>
                            <Text type="secondary">Failed to load downtime reasons.</Text>
                            <Button type="link" size="small" onClick={() => void lookups.loadDowntimeReasons()}>Retry</Button>
                          </Space>
                        ) : (
                          'No active downtime reasons configured'
                        )
                      }
                      options={lookups.downtimeReasons.map((r) => ({ value: r.id, label: r.name }))}
                    />
                  </Form.Item>
                </Col>
              </Row>
              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={3} maxLength={500} showCount placeholder="Notes about this shift's production" />
              </Form.Item>
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

const StatisticMini: React.FC<{ label: string; hint: string; content: React.ReactNode }> = ({ label, hint, content }) => (
  <div style={{ background: 'var(--theme-surface-alt)', borderRadius: 6, padding: '8px 12px' }}>
    <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
    <div>{content}</div>
    <Text type="secondary" style={{ fontSize: 11 }}>{hint}</Text>
  </div>
);

export default EntryForm;
