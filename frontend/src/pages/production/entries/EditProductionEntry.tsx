import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Button,
  Card,
  Row,
  Col,
  Typography,
  Space,
  Tag,
  Divider,
  Alert,
  Tooltip,
  Popconfirm,
  Spin,
  App,
  Breadcrumb,
} from 'antd';
import {
  SaveOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  CheckCircleFilled,
  WarningFilled,
  ClockCircleOutlined,
  AppstoreOutlined,
  AimOutlined,
  ToolOutlined,
  ExclamationCircleFilled,
  PlusOutlined,
  MinusCircleOutlined,
  ThunderboltFilled,
  SyncOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useLookups, ItemLk } from './lookups';
import { lineToKg } from './downtimeHours';
import { entryOvertimeHours } from './overtimeHours';
import { splitEntryItemLines, consumedQuantityFromAuditLines } from './entryLines';
import { formatNumber, toNum } from '../../../utils/numberFormat';

const { Title, Text } = Typography;
const { Option } = Select;

interface DowntimeLineState {
  id?: string;
  lineNumber: number;
  downtimeReasonId?: string;
  downtimeHours: number;
  remarks?: string;
}

interface ItemLineState {
  id?: string;
  lineNumber: number;
  itemId: string;
  uomId?: string;
  actualQuantity: number;
  targetQuantity?: number;
  scrapQuantity: number; // ALWAYS in KG
  runningHours?: number;
  remarks?: string;
}

export const EditProductionEntry: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { message, notification } = App.useApp();
  const lookups = useLookups();

  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [entry, setEntry] = useState<any>(null);

  // Raw Material and Output inventory balances (store's CURRENT stock — the
  // pre-entry baseline is reconstructed from them in the panel, FIX 4)
  const [rawAvail, setRawAvail] = useState<number | null>(null);
  const [outAvail, setOutAvail] = useState<number | null>(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);

  // ── EDIT-MODE RECONCILIATION BASELINE ──────────────────────────────────────
  // rawConsumed   : raw material THIS document already deducted, read from its
  //                 INPUT audit lines (the "original stored value"). Added back
  //                 to the current stock to reproduce the true pre-entry state:
  //                   Opening Available = Current Stock + Consumed By This Entry
  // recordedBasis : good output + scrap as persisted, used to scale the recorded
  //                 consumption when the operator changes the quantities on screen.
  const [rawConsumed, setRawConsumed] = useState<number | null>(null);
  const [recordedBasis, setRecordedBasis] = useState<number | null>(null);

  // ── FIX 3 — RUNNING HOURS IS A PERSISTED FACT, NEVER A DERIVED ONE ────────
  // The saved document row (running + downtime + overtime) is the single
  // source of truth for Edit Mode. Nothing here may run a
  // "Total Available − Downtime" deduction against it: an entry saved with
  // 8.0h running / 2.0h downtime must still read 8.0h on every reopen, and an
  // untouched save must leave the row byte-identical. This ref carries the
  // snapshot fetched from the API until the <Form> is actually mounted, so the
  // persisted values are (re)bound exactly once and can never be replaced by a
  // computed value afterwards.
  const pendingHydrationRef = useRef<Record<string, any> | null>(null);

  // Load entry details
  const fetchEntry = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiService.get<{ data: any }>(`/production/entries/${id}`);
      const data = res.data;
      setEntry(data);

      // Pre-fill form fields.
      //
      // CRITICAL — split the child lines first. The posting path writes INPUT
      // audit lines (entryKind 'INPUT', lineNumber >= 1000) recording the raw
      // material this document ALREADY consumed. Those are not production
      // output: putting them in the editable list shows 100 KG produced as
      // 202 KG (100 produced + 102 already consumed) and, on save, rebuilds the
      // entry quantity from the inflated total — which makes the backend
      // consume the raw material all over again (double depletion).
      const { outputs: outputLines, inputs: inputLines } = splitEntryItemLines(data.items);
      const inItemId = data.item?.productionInItem?.id || data.item?.productionInItemId || null;

      // ── FIX 2 — preserve the audited rejection ─────────────────────────────
      // Entries written by the wizard carry the rejection on the ENTRY row
      // (their per-line scrap input does not exist), so the child OUTPUT line
      // holds 0 while `production_entries.scrap_quantity` holds the audited
      // 2 KG. Hydrating the line as 0 hides that value AND, because Save
      // rebuilds the entry's scrap from the lines, writes 0 back — wiping the
      // audited scrap record. Seed the silent line from the entry-level value.
      const entryLevelScrap = toNum(data.scrapQuantity);
      const lineScrapTotal = outputLines.reduce((s, it: any) => s + toNum(it.scrapQuantity), 0);
      const scrapSeed = (entryLevelScrap > 0 && lineScrapTotal <= 0) ? entryLevelScrap : 0;

      const itemsList: ItemLineState[] = outputLines.length > 0
        ? outputLines.map((it: any, idx: number) => ({
            id: it.id,
            lineNumber: it.lineNumber ?? idx + 1,
            itemId: it.itemId || data.itemId,
            uomId: it.uomId || data.uomId,
            actualQuantity: toNum(it.actualQuantity),
            targetQuantity: toNum(it.targetQuantity || data.targetQuantity),
            scrapQuantity: toNum(it.scrapQuantity) + (idx === 0 ? scrapSeed : 0),
            runningHours: toNum(it.runningHours),
            remarks: it.remarks || '',
          }))
        : [{
            lineNumber: 1,
            itemId: data.itemId,
            uomId: data.uomId,
            actualQuantity: toNum(data.actualQuantity),
            targetQuantity: toNum(data.targetQuantity),
            scrapQuantity: toNum(data.scrapQuantity),
            runningHours: toNum(data.runningHours),
            remarks: '',
          }];

      // Historical snapshot of what this document consumed (display only).
      const weightRawUom = String(data.item?.productionInItem?.baseUom?.code || '').toUpperCase().startsWith('K');
      const persistedGood = toNum(data.actualQuantity);
      const persistedBasis = persistedGood + (weightRawUom ? toNum(data.scrapQuantity) : 0);
      setRawConsumed(consumedQuantityFromAuditLines(inputLines, inItemId));
      setRecordedBasis(persistedBasis > 0 ? persistedBasis : null);

      const dtList: DowntimeLineState[] = (data.downtimes && data.downtimes.length > 0)
        ? data.downtimes.map((dt: any, idx: number) => ({
            id: dt.id,
            lineNumber: dt.lineNumber ?? idx + 1,
            downtimeReasonId: dt.downtimeReasonId || undefined,
            downtimeHours: toNum(dt.downtimeHours),
            remarks: dt.remarks || '',
          }))
        : toNum(data.downtimeHours) > 0
        ? [{
            lineNumber: 1,
            downtimeReasonId: data.downtimeReasonId || undefined,
            downtimeHours: toNum(data.downtimeHours),
            remarks: data.downtimeReasonText || '',
          }]
        : [];

      const hydration = {
        operatorName: data.operatorName || '',
        supervisorName: data.supervisorName || '',
        runningHours: toNum(data.runningHours),
        overtimeHours: entryOvertimeHours(data),
        remarks: data.remarks || '',
        items: itemsList,
        downtimes: dtList,
      };
      // Bind immediately (the <Form> may already be mounted) AND queue a
      // post-mount re-bind: a write issued while the form is still unmounted
      // races antd's initialValues pass, so a saved value could be replaced by
      // a derived one on the next mount.
      form.setFieldsValue(hydration);
      pendingHydrationRef.current = hydration;

      // Load the current store balances (the pre-entry baseline is rebuilt from
      // them in the panel — see FIX 4)
      await fetchBalances(data);
    } catch (err: any) {
      message.error(err?.message || 'Failed to load production entry');
    } finally {
      setLoading(false);
    }
  }, [id, form, message]);

  // Fetch the store's CURRENT inventory balances.
  //
  // ── FIX 4 — the pre-entry baseline is reconstructed HERE, never derived ────
  // Asking the API to un-post this document (`excludeEntryId`) left the panel
  // showing the LIVE balance as "Opening Available (Before Entry)" and then
  // deducting the entry's consumption a second time — a fresh subtraction on
  // form load (3,994 shown as "before", 82 removed again → 3,912). The formula
  // is now applied explicitly and only once, in the panel:
  //
  //   Opening Available (Before Entry) = Current Store Stock + Consumed By This Entry
  //   Opening Balance   (Before Entry) = Current Store Stock − Produced By This Entry
  //
  // so an untouched edit reconciles exactly (Opening − Consumed = Current) and
  // saving without edits has a Net Balance Impact of ZERO.
  const fetchBalances = async (entryData: any) => {
    if (!entryData) return;
    setInventoryLoading(true);
    try {
      const sourceWh = entryData.rawMaterialWarehouseId || null;
      const targetWh = entryData.warehouseId || null;

      // Input Raw Material balance (live/current)
      const inItemId = entryData.item?.productionInItem?.id || entryData.item?.productionInItemId;
      if (inItemId && sourceWh) {
        try {
          const rawRes = await apiService.get<{ data?: number | { available?: number } }>(
            '/inventory/balances/available',
            { itemId: inItemId, warehouseId: sourceWh },
          );
          const avail = toNum((rawRes.data as any)?.available ?? rawRes.data);
          setRawAvail(avail);
        } catch {
          setRawAvail(null);
        }
      }

      // Output Finished Good balance (live/current)
      if (entryData.itemId && targetWh) {
        try {
          const outRes = await apiService.get<{ data?: number | { available?: number } }>(
            '/inventory/balances/available',
            { itemId: entryData.itemId, warehouseId: targetWh },
          );
          const avail = toNum((outRes.data as any)?.available ?? outRes.data);
          setOutAvail(avail);
        } catch {
          setOutAvail(null);
        }
      }
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    fetchEntry();
  }, [fetchEntry]);

  // ── FIX 3 (binding) — re-apply the persisted snapshot once the form exists.
  // One-shot: the ref is consumed, so this can never fight a later edit the
  // operator makes on the same screen.
  useEffect(() => {
    if (loading || !entry || !pendingHydrationRef.current) return;
    form.setFieldsValue(pendingHydrationRef.current);
    pendingHydrationRef.current = null;
  }, [loading, entry, form]);

  // Watch form fields for live calculation
  const watchedItems = Form.useWatch('items', form) as ItemLineState[] | undefined;
  const watchedDowntimes = Form.useWatch('downtimes', form) as DowntimeLineState[] | undefined;
  const watchedRunning = Form.useWatch('runningHours', form) as number | undefined;
  const watchedOvertime = Form.useWatch('overtimeHours', form) as number | undefined;

  // Real-time KPI calculations
  const kpis = useMemo(() => {
    const items = watchedItems || [];
    let totalActual = 0;
    let totalTarget = toNum(entry?.targetQuantity);
    let totalProductionKg = 0;
    let totalScrapKg = 0;

    for (const line of items) {
      const act = toNum(line?.actualQuantity);
      const scrap = toNum(line?.scrapQuantity); // Scrap is ALWAYS entered in KG
      totalActual += act;
      totalScrapKg += scrap;

      // Find item details from lookups or entry
      const lineItem = lookups.items.find((i) => i.id === line?.itemId) || entry?.item;
      if (lineItem) {
        const uom = (lineItem.baseUom?.code || entry?.uom?.code || '').toUpperCase();
        if (uom === 'KG' || uom === 'KILOGRAM') {
          totalProductionKg += act;
        } else {
          // Convert discrete pieces to KG
          const actKg = lineToKg(act, lineItem);
          if (actKg !== null) {
            totalProductionKg += actKg;
          }
        }
      }
    }

    const totalWeightKg = totalProductionKg + totalScrapKg;
    const rejectionPct = totalWeightKg > 0 ? (totalScrapKg / totalWeightKg) * 100 : 0;
    const achievementPct = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

    // Shift Hours Calculation
    // ── STEP 2 — CALCULATION MATRIX ────────────────────────────────────────
    // Total Available Hours = stored planned shift + stored overtime.
    // Actual Running Hours  = Total Available Hours − Total Downtime Hours,
    // applied whenever the shift's duty hours were fully consumed — the exact
    // signature of an overtime that never reached the stored running hours
    // (8h shift + 2h OT − 2h downtime must read 8h, never 6h). An EARLY FINISH
    // (duty still below the plan) keeps its own recorded running hours.
    const plannedHours = toNum(entry?.shift?.plannedHours || 8);
    const ot = toNum(watchedOvertime || 0);
    const totalPlanned = plannedHours + ot;
    const recordedRunning = toNum(watchedRunning ?? entry?.runningHours ?? 0);
    const dtSum = (watchedDowntimes || []).reduce((s, d) => s + toNum(d?.downtimeHours), 0);
    const running = (plannedHours > 0 && dtSum > 0 && recordedRunning + dtSum >= plannedHours)
      ? Math.max(0, totalPlanned - dtSum)
      : recordedRunning;
    const remainingHours = totalPlanned - (running + dtSum);
    const isShiftBalanced = Math.abs(remainingHours) < 0.05;

    // Efficiency — measured against Total Available (planned + overtime), the
    // same denominator the detail screen and the entry form already use, so an
    // 8h + 2h OT shift can never report >100% for 8h of running.
    const efficiencyPct = totalPlanned > 0 ? (running / totalPlanned) * 100 : 0;

    return {
      totalActual,
      totalTarget,
      totalProductionKg: Math.round(totalProductionKg * 100) / 100,
      totalScrapKg: Math.round(totalScrapKg * 100) / 100,
      totalWeightKg: Math.round(totalWeightKg * 100) / 100,
      rejectionPct: Math.round(rejectionPct * 100) / 100,
      achievementPct: Math.round(achievementPct * 100) / 100,
      efficiencyPct: Math.round(efficiencyPct * 100) / 100,
      plannedHours,
      ot,
      totalPlanned,
      running,
      dtSum: Math.round(dtSum * 100) / 100,
      remainingHours: Math.round(remainingHours * 100) / 100,
      isShiftBalanced,
    };
  }, [watchedItems, watchedDowntimes, watchedRunning, watchedOvertime, entry, lookups.items]);

  // ── FIX 1 — PRODUCT MASTER POOL FOR THE "PRODUCT / PART" DROPDOWN ──────────
  // antd Select prints the raw stored value whenever no option matches it, so
  // an item_id that is missing from the department lookup list rendered as the
  // industrial UUID (`c1000000-0000-…`). The pool therefore unions the loaded
  // lookups with the relations the entry itself carries (entry.item and each
  // child line's item), and every id that is currently selected is force-fed a
  // labelled option — a UUID can no longer reach the screen.
  const productPool = useMemo(() => {
    const byId = new Map<string, any>();
    const put = (o: any) => { if (o?.id && !byId.has(o.id)) byId.set(o.id, o); };
    (lookups.items || []).forEach(put);
    put(entry?.item);
    ((entry?.items || []) as any[]).forEach((line) => put(line?.item));
    return byId;
  }, [lookups.items, entry]);

  const selectedRowItemIds = useMemo(
    () => new Set((watchedItems ?? []).map((r) => r?.itemId).filter(Boolean) as string[]),
    [watchedItems],
  );

  const productOptions = useMemo(() => {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const i of productPool.values()) {
      if (i.departmentId === entry?.departmentId || selectedRowItemIds.has(i.id)) {
        out.push(i);
        seen.add(i.id);
      }
    }
    // Selected but no reachable master row → label it instead of the UUID.
    for (const itemId of selectedRowItemIds) {
      if (!seen.has(itemId)) out.push({ id: itemId, name: 'Unknown product', itemCode: '' });
    }
    return out;
  }, [productPool, selectedRowItemIds, entry?.departmentId]);

  // Handle Form Submit
  const handleSave = async (values: any) => {
    if (!id || saving) return;
    setSaving(true);
    try {
      // Never echo consumption-audit lines back to the API — they would be
      // re-persisted as production output and double the entry quantity.
      const editableItems = splitEntryItemLines(values.items as ItemLineState[]).outputs;
      const itemsPayload = editableItems.map((it: ItemLineState, idx: number) => ({
        id: it.id,
        lineNumber: idx + 1,
        itemId: it.itemId,
        uomId: it.uomId || entry?.uomId,
        actualQuantity: toNum(it.actualQuantity),
        targetQuantity: toNum(it.targetQuantity || entry?.targetQuantity),
        scrapQuantity: toNum(it.scrapQuantity),
        runningHours: toNum(values.runningHours),
        remarks: it.remarks || null,
      }));

      const downtimesPayload = (values.downtimes || [])
        .filter((dt: DowntimeLineState) => toNum(dt.downtimeHours) > 0 || dt.downtimeReasonId)
        .map((dt: DowntimeLineState, idx: number) => {
          const reasonObj = lookups.downtimeReasons.find((r) => r.id === dt.downtimeReasonId);
          return {
            id: dt.id,
            lineNumber: idx + 1,
            downtimeReasonId: dt.downtimeReasonId || null,
            downtimeReason: reasonObj?.name || null,
            downtimeHours: toNum(dt.downtimeHours),
            remarks: dt.remarks || null,
          };
        });

      const totalActual = itemsPayload.reduce((s: number, i: any) => s + i.actualQuantity, 0);
      const totalScrap = itemsPayload.reduce((s: number, i: any) => s + i.scrapQuantity, 0);
      const totalDtHours = downtimesPayload.reduce((s: number, d: any) => s + d.downtimeHours, 0);

      const payload: Record<string, any> = {
        operatorName: values.operatorName?.trim() || entry?.operatorName,
        supervisorName: values.supervisorName?.trim() || null,
        runningHours: toNum(values.runningHours),
        overtimeHours: toNum(values.overtimeHours || 0),
        downtimeHours: totalDtHours,
        actualQuantity: totalActual,
        scrapQuantity: totalScrap,
        targetQuantity: toNum(entry?.targetQuantity),
        remarks: values.remarks?.trim() || null,
        items: itemsPayload,
        downtimes: downtimesPayload,
      };

      if (itemsPayload.length > 0) {
        payload.itemId = itemsPayload[0].itemId;
        payload.uomId = itemsPayload[0].uomId;
      }

      await apiService.put(`/production/entries/${id}`, payload);

      notification.success({
        message: 'Production Entry Updated',
        description: `Entry ${entry?.entryNumber || id} updated successfully. Inventory balances and KPIs have been recalculated.`,
        placement: 'topRight',
      });

      navigate(`/production/entries/${id}`);
    } catch (err: any) {
      notification.error({
        message: 'Update Failed',
        description: err?.response?.data?.message || err?.message || 'Failed to update entry',
        placement: 'topRight',
      });
    } finally {
      setSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!id || deleting) return;
    setDeleting(true);
    try {
      await apiService.delete(`/production/entries/${id}`);
      message.success('Production entry deleted. Inventory postings reversed successfully.');
      navigate('/production/entries');
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || 'Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', flexDirection: 'column', gap: 16 }}>
        <Spin size="large" />
        <Text type="secondary">Loading production entry details...</Text>
      </div>
    );
  }

  if (!entry) {
    return (
      <Card style={{ margin: 24, textAlign: 'center' }}>
        <Alert message="Entry Not Found" description="The requested daily production entry could not be located." type="error" showIcon />
        <Button style={{ marginTop: 16 }} onClick={() => navigate('/production/entries')}>
          Back to Entries
        </Button>
      </Card>
    );
  }

  const rawItem = entry?.item?.productionInItem;
  const rawItemName = rawItem?.name || entry?.item?.productionInItemName || 'Input Raw Material';
  const rawItemCode = rawItem?.itemCode || '';
  const rawUom = entry?.item?.productionInItem?.baseUom?.code || entry?.uom?.code || 'PCS';
  // ── Reconciliation: what this entry consumes (live) ────────────────────────
  // The panel subtracts consumption from the PRE-ENTRY opening balance
  // (rawAvail is the current stock; this entry's own postings are added back
  // below), so the figure must be raw material in the source store's UOM — good
  // output plus scrap, because material is consumed for the rejected output too.
  const weightRawUom = String(rawUom || '').toUpperCase().startsWith('K');
  const liveBasis = kpis.totalActual + (weightRawUom ? kpis.totalScrapKg : 0);
  // Prefer the consumption actually recorded when this document was posted,
  // scaled by how far the operator has moved the quantities. An untouched entry
  // therefore reconciles exactly (Opening − Consumed = Current Stock) while a
  // re-quantified one still shows the projected impact.
  const rawDemand = (rawConsumed !== null && recordedBasis !== null && recordedBasis > 0 && liveBasis > 0)
    ? Math.round(rawConsumed * (liveBasis / recordedBasis) * 10000) / 10000
    : liveBasis;

  // ── FIX 4 — HISTORICAL SNAPSHOT, NOT A LIVE BALANCE ───────────────────────
  // Only a POSTED document has actually moved stock, and only then is there an
  // impact to reverse. `rawAvail` is the store's CURRENT stock, so:
  //     Opening Available (Before Entry) = Current Store Stock + Consumed By This Entry
  // The form therefore performs NO fresh subtraction on load. With untouched
  // inputs rawDemand === baselineConsumed, which collapses the pair back to the
  // current stock — a Net Balance Impact of exactly ZERO.
  const posted = Boolean(entry?.inventoryReferenceId);
  const round4 = (v: number) => Math.round(v * 10000) / 10000;
  const baselineConsumed = !posted
    ? 0
    : (rawConsumed !== null && rawConsumed > 0 ? rawConsumed : (recordedBasis ?? liveBasis));
  const rawOpening = rawAvail !== null ? round4(rawAvail + baselineConsumed) : null;
  const rawRemaining = rawOpening !== null ? rawOpening - rawDemand : null;
  const rawShortage = rawRemaining !== null && rawRemaining < 0 ? Math.abs(rawRemaining) : 0;

  // Output side, same rule in reverse: this entry's receipt is taken back out
  // of the CURRENT balance to rebuild the pre-entry opening figure.
  const baselineProduced = posted ? toNum(entry?.actualQuantity) : 0;
  const outOpening = outAvail !== null ? round4(outAvail - baselineProduced) : null;
  const outNewBalance = outOpening !== null ? round4(outOpening + kpis.totalActual) : null;

  return (
    <div style={{ padding: '16px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* ── Breadcrumb & Top Navigation ── */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Breadcrumb
          items={[
            { title: <a onClick={() => navigate('/production')}>Production</a> },
            { title: <a onClick={() => navigate('/production/entries')}>Daily Entries</a> },
            { title: <a onClick={() => navigate(`/production/entries/${id}`)}>{entry?.entryNumber || 'Entry'}</a> },
            { title: 'Edit' },
          ]}
        />
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/production/entries/${id}`)}>
            Back to Details
          </Button>
        </Space>
      </div>

      {/* ── Header Section ── */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(30, 58, 138, 0.08) 0%, rgba(59, 130, 246, 0.04) 100%)',
          border: '1px solid var(--theme-border, #e2e8f0)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <Space align="center" size={8}>
            <Title level={4} style={{ margin: 0, color: 'var(--theme-text, #0f172a)' }}>
              Edit Daily Production Entry
            </Title>
            <Tag color="blue" style={{ fontSize: 13, fontWeight: 700, padding: '2px 8px' }}>
              {entry.entryNumber || entry.id.slice(0, 8)}
            </Tag>
            {entry.inventoryReferenceId && (
              <Tag color="green" icon={<CheckCircleFilled />}>
                POSTED TO INVENTORY
              </Tag>
            )}
          </Space>
          <Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: 12.5 }}>
            Update quantities, scrap in KG, running hours and downtime. Inventory and KPI impacts reflect instantly.
          </Text>
        </div>

        {/* Quick Context Chips */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
            <Text type="secondary">Date: </Text>
            <Text strong>{dayjs(entry.entryDate).format('DD-MMM-YYYY')}</Text>
          </div>
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
            <Text type="secondary">Shift: </Text>
            <Text strong>{entry.shift?.name || 'General'}</Text>
          </div>
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
            <Text type="secondary">Machine: </Text>
            <Text strong>{entry.machine?.name ? `${entry.machine.name} (${entry.machineNo})` : entry.machineNo}</Text>
          </div>
          <div style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
            <Text type="secondary">Department: </Text>
            <Text strong>{entry.department?.name || 'SPD'}</Text>
          </div>
        </div>
      </div>

      {/* ── LIVE KPI STRIP (Interactive WOW summary) ── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        {/* Actual Production */}
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #cbd5e1', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Actual Good ({entry.uom?.code || 'PCS'})
            </span>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0284c7', marginTop: 4 }}>
              {formatNumber(kpis.totalActual, 0)}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Target: {formatNumber(kpis.totalTarget, 0)}
            </div>
          </Card>
        </Col>

        {/* Achievement % */}
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #cbd5e1', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Achievement %
            </span>
            <div style={{ fontSize: 20, fontWeight: 800, color: kpis.achievementPct >= 80 ? '#16a34a' : '#d97706', marginTop: 4 }}>
              {kpis.achievementPct.toFixed(1)}%
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Efficiency: {kpis.efficiencyPct.toFixed(1)}%
            </div>
          </Card>
        </Col>

        {/* Production Weight KG */}
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #cbd5e1', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Prod. Weight (KG)
            </span>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {kpis.totalProductionKg.toFixed(2)} <span style={{ fontSize: 12 }}>KG</span>
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Total: {kpis.totalWeightKg.toFixed(2)} KG
            </div>
          </Card>
        </Col>

        {/* Scrap / Rejection (KG) - Always KG */}
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #fca5a5', background: '#fff5f5', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, textTransform: 'uppercase' }}>
              Rejection / Scrap (KG)
            </span>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
              {kpis.totalScrapKg.toFixed(2)} <span style={{ fontSize: 12 }}>KG</span>
            </div>
            <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2 }}>
              Rejection: {kpis.rejectionPct.toFixed(2)}%
            </div>
          </Card>
        </Col>

        {/* Running Hours */}
        <Col xs={12} sm={8} lg={4}>
          <Card size="small" style={{ borderRadius: 10, border: '1px solid #cbd5e1', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
              Running Hours
            </span>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
              {kpis.running.toFixed(2)}h
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Downtime: {kpis.dtSum.toFixed(2)}h
            </div>
          </Card>
        </Col>

        {/* Shift Balance Status */}
        <Col xs={12} sm={8} lg={4}>
          <Card
            size="small"
            style={{
              borderRadius: 10,
              border: `1px solid ${kpis.isShiftBalanced ? '#86efac' : '#fdba74'}`,
              background: kpis.isShiftBalanced ? '#f0fdf4' : '#fffbeb',
              textAlign: 'center',
            }}
          >
            <span style={{ fontSize: 11, color: kpis.isShiftBalanced ? '#166534' : '#9a3412', fontWeight: 700, textTransform: 'uppercase' }}>
              Shift Balance
            </span>
            <div style={{ fontSize: 15, fontWeight: 800, color: kpis.isShiftBalanced ? '#16a34a' : '#d97706', marginTop: 4 }}>
              {kpis.isShiftBalanced ? (
                <span><CheckCircleFilled /> Balanced</span>
              ) : (
                <span><WarningFilled /> {kpis.remainingHours > 0 ? `+${kpis.remainingHours}h left` : `${kpis.remainingHours}h over`}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              Planned: {kpis.totalPlanned.toFixed(2)}h
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── EDIT FORM ── */}
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          runningHours: toNum(entry.runningHours),
          overtimeHours: entryOvertimeHours(entry),
          operatorName: entry.operatorName || '',
          supervisorName: entry.supervisorName || '',
          remarks: entry.remarks || '',
        }}
      >
        <Row gutter={[20, 20]}>
          {/* ══ LEFT COLUMN: Operational Inputs ══ */}
          <Col xs={24} lg={15}>
            {/* Card 1: Production Items (Quantities & Scrap) */}
            <Card
              title={
                <Space>
                  <AppstoreOutlined style={{ color: '#0284c7' }} />
                  <span style={{ fontWeight: 700 }}>Production Items & Quantities</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 12, marginBottom: 20 }}
            >
              <Form.List name="items">
                {(fields, { add, remove }) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {fields.map((field, idx) => {
                      const curItemId = form.getFieldValue(['items', field.name, 'itemId']) || entry.itemId;
                      const matchedItem = productPool.get(curItemId) || entry.item;
                      const wireSize = matchedItem?.wireSizeMm ? `${matchedItem.wireSizeMm} mm` : '—';
                      const uomCode = matchedItem?.baseUom?.code || entry.uom?.code || 'PCS';
                      const wpp = matchedItem?.weightPerPiece ?? 0;
                      const curQty = toNum(form.getFieldValue(['items', field.name, 'actualQuantity']));
                      const curScrap = toNum(form.getFieldValue(['items', field.name, 'scrapQuantity']));
                      const itemWeight = wpp > 0 ? curQty * wpp : (uomCode === 'KG' ? curQty : 0);

                      return (
                        <div
                          key={field.key}
                          style={{
                            background: 'var(--theme-surface-alt, #f8fafc)',
                            border: '1px solid var(--theme-border, #cbd5e1)',
                            borderRadius: 10,
                            padding: 16,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Space align="center">
                              <Tag color="cyan" style={{ fontWeight: 700 }}>ITEM #{idx + 1}</Tag>
                              <Text strong style={{ fontSize: 14 }}>{matchedItem?.name || 'Production Item'}</Text>
                              {matchedItem?.itemCode && <Text type="secondary">({matchedItem.itemCode})</Text>}
                            </Space>
                            {fields.length > 1 && (
                              <Button
                                danger
                                type="text"
                                size="small"
                                icon={<MinusCircleOutlined />}
                                onClick={() => remove(field.name)}
                              >
                                Remove
                              </Button>
                            )}
                          </div>

                          <Row gutter={12}>
                            {/* Part Selection (Operator can change part) */}
                            <Col xs={24} md={10}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'itemId']}
                                label="Product / Part"
                                rules={[{ required: true, message: 'Please select an item' }]}
                              >
                                <Select
                                  showSearch
                                  placeholder="Select Item"
                                  optionFilterProp="children"
                                  filterOption={(input, option) =>
                                    String(option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                                  }
                                >
                                  {productOptions.map((i) => (
                                    <Option key={i.id} value={i.id}>
                                      {i.name}{i.itemCode ? ` (${i.itemCode})` : ''} {i.wireSizeMm ? `[${i.wireSizeMm}mm]` : ''}
                                    </Option>
                                  ))}
                                </Select>
                              </Form.Item>
                            </Col>

                            {/* Wire Size Display */}
                            <Col xs={12} md={4}>
                              <Form.Item label="Wire Size">
                                <Input disabled value={wireSize} style={{ fontWeight: 600, textAlign: 'center' }} />
                              </Form.Item>
                            </Col>

                            {/* Actual Produced Quantity */}
                            <Col xs={12} md={5}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'actualQuantity']}
                                label={`Produced Qty (${uomCode})`}
                                rules={[{ required: true, message: 'Quantity required' }]}
                              >
                                <InputNumber
                                  style={{ width: '100%', fontWeight: 700 }}
                                  min={0}
                                  precision={uomCode === 'KG' ? 2 : 0}
                                />
                              </Form.Item>
                            </Col>

                            {/* Scrap / Rejection Quantity (ALWAYS IN KG) */}
                            <Col xs={24} md={5}>
                              <Form.Item
                                {...field}
                                name={[field.name, 'scrapQuantity']}
                                label={
                                  <Space size={4}>
                                    <span style={{ color: '#b91c1c', fontWeight: 700 }}>Scrap (KG)</span>
                                    <Tooltip title="Scrap is always entered in KG across all departments. The system converts it to rejection percentage automatically.">
                                      <ExclamationCircleFilled style={{ color: '#ef4444', fontSize: 12 }} />
                                    </Tooltip>
                                  </Space>
                                }
                                rules={[{ required: true, message: 'Scrap required' }]}
                              >
                                <InputNumber
                                  style={{ width: '100%', fontWeight: 700, borderColor: '#fca5a5' }}
                                  min={0}
                                  precision={2}
                                  addonAfter="KG"
                                />
                              </Form.Item>
                            </Col>
                          </Row>

                          {/* Line Calculation Info */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginTop: 4 }}>
                            <span>
                              Piece Weight: <strong>{wpp > 0 ? `${wpp} kg/pc` : '—'}</strong>
                            </span>
                            <span>
                              Line Output Weight: <strong style={{ color: '#0284c7' }}>{itemWeight.toFixed(2)} KG</strong> + Scrap <strong style={{ color: '#dc2626' }}>{curScrap.toFixed(2)} KG</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {fields.length < 2 && (
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        onClick={() => add({ lineNumber: fields.length + 1, actualQuantity: 0, scrapQuantity: 0 })}
                        style={{ width: '100%' }}
                      >
                        Add Secondary Production Item
                      </Button>
                    )}
                  </div>
                )}
              </Form.List>
            </Card>

            {/* Card 2: Shift Hours & Downtime Tracking */}
            <Card
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: '#f59e0b' }} />
                  <span style={{ fontWeight: 700 }}>Shift Hours & Downtime Tracking</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 12, marginBottom: 20 }}
            >
              <Row gutter={16}>
                <Col xs={12} md={6}>
                  <Form.Item label="Shift Planned Hours">
                    <Input disabled value={`${kpis.plannedHours.toFixed(2)}h`} style={{ textAlign: 'center', fontWeight: 600 }} />
                  </Form.Item>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Item name="overtimeHours" label="Overtime (Hours)">
                    <InputNumber min={0} max={12} step={0.5} style={{ width: '100%', textAlign: 'center', fontWeight: 700 }} />
                  </Form.Item>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Item name="runningHours" label="Running Hours" rules={[{ required: true }]}>
                    <InputNumber min={0} max={24} step={0.1} style={{ width: '100%', textAlign: 'center', fontWeight: 700 }} />
                  </Form.Item>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Item label="Total Downtime">
                    <Input disabled value={`${kpis.dtSum.toFixed(2)}h`} style={{ textAlign: 'center', fontWeight: 700, color: kpis.dtSum > 0 ? '#d97706' : '#64748b' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: '12px 0' }}>Downtime Reasons Breakdown</Divider>

              <Form.List name="downtimes">
                {(dtFields, { add, remove }) => (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {dtFields.map((field, idx) => (
                      <Row key={field.key} gutter={10} align="middle">
                        <Col xs={14} md={10}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'downtimeReasonId']}
                            rules={[{ required: true, message: 'Select reason' }]}
                            style={{ margin: 0 }}
                          >
                            <Select placeholder="Select Reason">
                              {lookups.downtimeReasons.map((r) => (
                                <Option key={r.id} value={r.id}>
                                  {r.name}
                                </Option>
                              ))}
                            </Select>
                          </Form.Item>
                        </Col>

                        <Col xs={7} md={6}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'downtimeHours']}
                            rules={[{ required: true, message: 'Hours' }]}
                            style={{ margin: 0 }}
                          >
                            <InputNumber min={0.1} max={24} step={0.1} style={{ width: '100%' }} addonAfter="h" />
                          </Form.Item>
                        </Col>

                        <Col xs={24} md={6}>
                          <Form.Item {...field} name={[field.name, 'remarks']} style={{ margin: 0 }}>
                            <Input placeholder="Notes (optional)" />
                          </Form.Item>
                        </Col>

                        <Col xs={3} md={2}>
                          <Button danger type="text" icon={<MinusCircleOutlined />} onClick={() => remove(field.name)} />
                        </Col>
                      </Row>
                    ))}

                    <Button
                      type="dashed"
                      size="small"
                      icon={<PlusOutlined />}
                      onClick={() => add({ lineNumber: dtFields.length + 1, downtimeHours: 0.5 })}
                      style={{ width: '100%', marginTop: 4 }}
                    >
                      Add Downtime Reason
                    </Button>
                  </div>
                )}
              </Form.List>
            </Card>

            {/* Card 3: Operator & Remarks */}
            <Card
              title={
                <Space>
                  <ToolOutlined style={{ color: '#6366f1' }} />
                  <span style={{ fontWeight: 700 }}>Personnel & General Remarks</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 12 }}
            >
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="operatorName" label="Operator Name">
                    <Input placeholder="Operator Name" />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12}>
                  <Form.Item name="supervisorName" label="Supervisor Name">
                    <Input placeholder="Supervisor Name" />
                  </Form.Item>
                </Col>

                <Col xs={24}>
                  <Form.Item name="remarks" label="Shift Remarks / Reason for Edit">
                    <Input.TextArea rows={2} placeholder="Add any operational remarks or explanation for this modification..." />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>

          {/* ══ RIGHT COLUMN: Live Impact & Stock Reconciliation ══ */}
          <Col xs={24} lg={9}>
            {/* Raw Material Inventory Impact (explicit pre-entry baseline) */}
            <Card
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <InboxOutlined style={{ color: '#059669' }} />
                    <span style={{ fontWeight: 700 }}>Raw Material Impact</span>
                  </Space>
                  {inventoryLoading && <Spin size="small" />}
                </div>
              }
              bordered
              style={{ borderRadius: 12, marginBottom: 20 }}
            >
              {rawItem ? (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <Text strong style={{ fontSize: 13 }}>{rawItemName}</Text>
                    {rawItemCode && <Text type="secondary"> ({rawItemCode})</Text>}
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      Source Store: <strong>{entry.rawMaterialWarehouse?.name || 'ST Production Department'}</strong>
                    </div>
                  </div>

                  {/* Flow Impact Cards */}
                  <div
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: 8,
                      padding: '10px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Opening Available (Before Entry):</Text>
                      <Text strong style={{ fontSize: 14 }}>
                        {rawOpening !== null ? `${formatNumber(rawOpening, 2)} ${rawUom}` : '—'}
                      </Text>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#b91c1c' }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Consumed (This Entry):</span>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        -{formatNumber(rawDemand, 2)} {rawUom}
                      </span>
                    </div>

                    <Divider style={{ margin: '4px 0' }} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Remaining Balance:</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: rawShortage > 0 ? '#dc2626' : '#16a34a' }}>
                        {rawRemaining !== null ? `${formatNumber(rawRemaining, 2)} ${rawUom}` : '—'}
                      </span>
                    </div>
                  </div>

                  {rawShortage > 0 ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginTop: 10 }}
                      message={`Stock Shortage: ${formatNumber(rawShortage, 2)} ${rawUom}`}
                      description="Available stock at source store is less than required consumption for this entry."
                    />
                  ) : (
                    <div style={{ marginTop: 8, fontSize: 12, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircleFilled /> Stock availability sufficient for this entry.
                    </div>
                  )}
                </div>
              ) : (
                <Text type="secondary">No routing raw material configured for this stage.</Text>
              )}
            </Card>

            {/* Output Warehouse Inventory Impact */}
            <Card
              title={
                <Space>
                  <CheckCircleFilled style={{ color: '#0284c7' }} />
                  <span style={{ fontWeight: 700 }}>Output Store Impact</span>
                </Space>
              }
              bordered
              style={{ borderRadius: 12, marginBottom: 20 }}
            >
              <div style={{ marginBottom: 10 }}>
                <Text strong style={{ fontSize: 13 }}>{entry.item?.name}</Text>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  Store: <strong>{entry.warehouse?.name || 'SW Production Department'}</strong>
                </div>
              </div>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Opening Balance (Before Entry):</Text>
                  <Text strong style={{ fontSize: 14 }}>
                    {outOpening !== null ? `${formatNumber(outOpening, 2)} ${entry.uom?.code || 'PCS'}` : '—'}
                  </Text>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#16a34a' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Produced (This Entry):</span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>
                    +{formatNumber(kpis.totalActual, 2)} {entry.uom?.code || 'PCS'}
                  </span>
                </div>

                <Divider style={{ margin: '4px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700 }}>New Balance in Store:</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#0284c7' }}>
                    {outNewBalance !== null ? `${formatNumber(outNewBalance, 2)} ${entry.uom?.code || 'PCS'}` : '—'}
                  </span>
                </div>
              </div>
            </Card>

            {/* Actions Card */}
            <Card
              bordered
              style={{
                borderRadius: 12,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Button
                  type="primary"
                  size="large"
                  icon={<SaveOutlined />}
                  loading={saving}
                  onClick={() => form.submit()}
                  style={{
                    height: 46,
                    fontWeight: 700,
                    fontSize: 15,
                    borderRadius: 8,
                    background: '#0284c7',
                  }}
                >
                  Save & Update Entry
                </Button>

                <Button
                  size="middle"
                  onClick={() => navigate(`/production/entries/${id}`)}
                  style={{ borderRadius: 8 }}
                >
                  Cancel / Return
                </Button>

                <Divider style={{ margin: '8px 0' }} />

                <Popconfirm
                  title="Delete Production Entry?"
                  description={
                    <div style={{ maxWidth: 280 }}>
                      Are you sure you want to delete this entry? This will reverse any posted stock ledger movements and restore raw material stock.
                    </div>
                  }
                  onConfirm={handleDelete}
                  okText="Yes, Delete"
                  cancelText="No, Keep"
                  okButtonProps={{ danger: true, loading: deleting }}
                >
                  <Button
                    danger
                    type="text"
                    icon={<DeleteOutlined />}
                    loading={deleting}
                    style={{ width: '100%', fontWeight: 600 }}
                  >
                    Delete Entry (Mistake Entry)
                  </Button>
                </Popconfirm>
              </div>
            </Card>
          </Col>
        </Row>
      </Form>
    </div>
  );
};

export default EditProductionEntry;
