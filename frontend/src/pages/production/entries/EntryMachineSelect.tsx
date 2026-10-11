import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, DatePicker, Select, Button, Space, Typography,
  Empty, Popover, Tag, Alert, Steps, App, theme,
} from 'antd';
import {
  ArrowLeftOutlined, ReloadOutlined, SelectOutlined, EditOutlined,
  EyeOutlined, DeleteOutlined, FormOutlined, InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useLookups, ShiftLk } from './lookups';
import { GlobalLoading } from '../../../components/shared';
import { useEntryDockStore, type EntryContextParams } from './entryDockStore';
import ProductionEntryDetailModal from './ProductionEntryDetailModal';

const { Title, Text } = Typography;

interface MachineEntryMini {
  id: string;
  itemId: string;
  itemName: string | null;
  targetQuantity: number;
  actualQuantity: number;
  uom?: string | null;
}

interface MachineStatusRow {
  id: string;
  systemCode: string;
  machineCode: string;
  name: string;
  status: 'ENTERED' | 'ENTRY_REQUIRED';
  entryCount: number;
  divisionId: string | null;
  sectionId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  targetQuantity?: number | null;
  actualQuantity?: number;
  uom?: string | null;
  achievementPercentage?: number | null;
  variance?: number | null;
  entries: MachineEntryMini[];
}

/** Formats numeric quantities cleanly without unnecessary trailing zeros: 70.0000 -> 70, 68.5000 -> 68.5 */
function formatQty(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '0';
  const num = Number(val);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(4)).toString();
}

/** Formats achievement percentage cleanly: 97.14 -> 97.14%, 100 -> 100% */
function formatPercent(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const rounded = Math.round(val * 100) / 100;
  return `${parseFloat(rounded.toFixed(2))}%`;
}

interface MachineStatusResponse {
  success: boolean;
  data: MachineStatusRow[];
  meta: {
    totalMachines: number;
    enteredCount: number;
    entryRequiredCount: number;
    entryDate: string;
    shiftId: string;
  };
}

interface MachineCacheEntry {
  data: MachineStatusRow[];
  meta: MachineStatusResponse['meta'] | null;
  ts: number;
}
const machineStatusCache = new Map<string, MachineCacheEntry>();

const formatDivLabel = (d: { name: string; divisionCode?: string }) => {
  const code = d.divisionCode || '';
  if (code && d.name.toUpperCase().includes(code.toUpperCase())) {
    return d.name;
  }
  return code ? `${d.name} (${code})` : d.name;
};

/**
 * Step 1 of the production-entry flow: pick Date + Shift + organizational area,
 * then see every machine flagged as Already Entered / Entry Required BEFORE any
 * data-entry happens. Only "Entry Required" machines can open a new entry form.
 */
const EntryMachineSelect: React.FC = () => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookups = useLookups();

  // ── selection state: date defaults to yesterday (1 day minus) ──
  const [entryDate, setEntryDate] = useState<dayjs.Dayjs | null>(
    searchParams.get('entryDate') ? dayjs(searchParams.get('entryDate') as string) : dayjs().subtract(1, 'day'),
  );
  const [shiftId, setShiftId] = useState<string | undefined>(searchParams.get('shiftId') || undefined);
  const [divisionId, setDivisionId] = useState<string | undefined>(searchParams.get('divisionId') || undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(searchParams.get('sectionId') || undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(searchParams.get('departmentId') || undefined);

  // In-Modal Production Entry Detail Dialog State
  const [detailModalEntryId, setDetailModalEntryId] = useState<string | null>(null);

  // ── department-specific target shifts ──
  const [deptShifts, setDeptShifts] = useState<ShiftLk[] | null>(null);
  const [deptShiftsLoading, setDeptShiftsLoading] = useState(false);

  // When departmentId changes, fetch shifts matching targets for that department
  useEffect(() => {
    let cancelled = false;
    if (!departmentId) {
      setDeptShifts(null);
      return;
    }
    setDeptShiftsLoading(true);
    apiService
      .get<{ success?: boolean; data?: ShiftLk[] }>('/production/shifts', { departmentId })
      .then((res) => {
        if (cancelled) return;
        const shiftsData = Array.isArray(res) ? res : (res as any)?.data;
        if (Array.isArray(shiftsData) && shiftsData.length > 0) {
          setDeptShifts(shiftsData);
          setShiftId((prevShiftId) => {
            const exists = shiftsData.some((s: ShiftLk) => s.id === prevShiftId);
            return exists ? prevShiftId : shiftsData[0].id;
          });
        } else {
          setDeptShifts(null);
        }
      })
      .catch(() => {
        if (!cancelled) setDeptShifts(null);
      })
      .finally(() => {
        if (!cancelled) setDeptShiftsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  const availableShifts = deptShifts && deptShifts.length > 0 ? deptShifts : lookups.shifts;

  // ── machine status global cache for 0ms tab switching & instantaneous hydration ──
  const dateIso = entryDate ? entryDate.format('YYYY-MM-DD') : undefined;

  // Key generator for in-memory status cache
  const currentCacheKey = `${dateIso || ''}_${shiftId || ''}_${divisionId || 'all'}_${sectionId || 'all'}_${departmentId || 'all'}`;
  const initialCacheHit = machineStatusCache.get(currentCacheKey);

  // ── machine status state (seeded from in-memory cache if available) ──
  const [machines, setMachines] = useState<MachineStatusRow[]>(() => initialCacheHit?.data || []);
  const [meta, setMeta] = useState<MachineStatusResponse['meta'] | null>(() => initialCacheHit?.meta || null);
  const [loading, setLoading] = useState<boolean>(() => !initialCacheHit && !!(dateIso && shiftId));
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const sectionsFiltered = lookups.sectionsForDivision(divisionId);
  const departmentsFiltered = lookups.departmentsForSection(sectionId);

  // Auto-select first shift when loaded if not yet chosen
  useEffect(() => {
    if (!shiftId && availableShifts && availableShifts.length > 0) {
      setShiftId(availableShifts[0].id);
    }
  }, [shiftId, availableShifts]);

  // Auto-select first division when loaded if not yet chosen
  useEffect(() => {
    if (!divisionId && lookups.divisions && lookups.divisions.length > 0) {
      setDivisionId(lookups.divisions[0].id);
    }
  }, [divisionId, lookups.divisions]);

  const ready = !!dateIso && !!shiftId;

  const fetchStatus = useCallback(async () => {
    if (!dateIso || !shiftId) {
      setMachines([]);
      setMeta(null);
      return;
    }

    const cacheKey = `${dateIso}_${shiftId}_${divisionId || 'all'}_${sectionId || 'all'}_${departmentId || 'all'}`;
    const cached = machineStatusCache.get(cacheKey);

    // If cache hit, immediately display cached machines (0ms screen wipe)
    if (cached && cached.data.length > 0) {
      setMachines(cached.data);
      setMeta(cached.meta);
      // If cached less than 15 seconds ago, skip background request unless explicitly refreshed
      if (Date.now() - cached.ts < 15000 && refreshTick === 0) {
        setLoading(false);
        return;
      }
    } else {
      setLoading(true);
    }

    setError(null);
    try {
      const res = await apiService.get<MachineStatusResponse>('/production/entries/machine-status', {
        entryDate: dateIso,
        shiftId,
        ...(divisionId && { divisionId }),
        ...(sectionId && { sectionId }),
        ...(departmentId && { departmentId }),
      });
      const data = res.data || [];
      const resMeta = res.meta || null;
      machineStatusCache.set(cacheKey, { data, meta: resMeta, ts: Date.now() });
      setMachines(data);
      setMeta(resMeta);
    } catch (err: any) {
      if (!cached) {
        const msg = err?.response?.data?.message || err?.message || 'Failed to load machine entry status. Please retry.';
        setError(Array.isArray(msg) ? msg.join('; ') : String(msg));
      }
    } finally {
      setLoading(false);
    }
  }, [dateIso, shiftId, divisionId, sectionId, departmentId, refreshTick]);

  // Recompute whenever Date / Shift / Division / Section / Department change
  useEffect(() => {
    const t = setTimeout(() => void fetchStatus(), 150);
    return () => clearTimeout(t);
  }, [fetchStatus, refreshTick]);

  // When entry modal closes/saves in dock store, refresh availability grid automatically
  useEffect(() => {
    let wasOpen = false;
    const unsub = useEntryDockStore.subscribe((state) => {
      if (wasOpen && !state.isOpen) {
        setRefreshTick((t) => t + 1);
      }
      wasOpen = state.isOpen;
    });
    return () => unsub();
  }, []);

  const openNewEntry = (m: MachineStatusRow) => {
    const ctxDepartment = m.departmentId ?? departmentId;
    const depObj = lookups.departments.find((d) => d.id === ctxDepartment);
    const ctxDivision = m.divisionId ?? divisionId ?? depObj?.divisionId;
    const ctxSection = m.sectionId ?? sectionId ?? depObj?.sectionId;
    const effectiveShift = lookups.shifts.find((s) => s.id === shiftId);
    const divObj = lookups.divisions.find((d) => d.id === ctxDivision);
    const secObj = lookups.sections.find((s) => s.id === ctxSection);
    const depName = m.departmentName || depObj?.name;
    const divName = divObj?.name;
    const secName = secObj?.name;
    const shiftName = effectiveShift?.name;

    const params: EntryContextParams = {
      from: 'select',
      machineId: m.id,
      machineCode: m.machineCode,
      machineName: m.name,
      ...(dateIso && { entryDate: dateIso }),
      ...(shiftId && { shiftId }),
      ...(shiftName && { shiftName }),
      ...(ctxDivision && { divisionId: ctxDivision }),
      ...(divName && { divisionName: divName }),
      ...(ctxSection && { sectionId: ctxSection }),
      ...(secName && { sectionName: secName }),
      ...(ctxDepartment && { departmentId: ctxDepartment }),
      ...(depName && { departmentName: depName }),
      mode: 'create',
    };

    useEntryDockStore.getState().openEntry(params);
  };

  const handleEditEntry = (entryId: string) => {
    useEntryDockStore.getState().openEntry({
      from: 'select',
      entryId,
      mode: 'edit',
      ...(dateIso && { entryDate: dateIso }),
      ...(shiftId && { shiftId }),
      ...(divisionId && { divisionId }),
      ...(sectionId && { sectionId }),
      ...(departmentId && { departmentId }),
    });
  };

  const deleteEntry = useCallback(
    (entryId: string) => {
      modal.confirm({
        centered: true,
        title: 'Delete Production Entry?',
        content:
          'Are you sure you want to permanently delete this production entry? This will remove dummy or test data and allow you to re-enter production for this machine.',
        okText: 'Yes, Delete Entry',
        cancelText: 'Cancel',
        okButtonProps: { danger: true },
        onOk: async () => {
          try {
            await apiService.delete(`/production/entries/${entryId}`);
            message.success('Production entry deleted successfully');
            setRefreshTick((t) => t + 1);
          } catch (err: any) {
            message.error(err?.response?.data?.message || 'Failed to delete entry');
          }
        },
      });
    },
    [modal, message],
  );

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    const dep = lookups.departments.find((d) => d.id === departmentId);
    const sec = lookups.sections.find((s) => s.id === (departmentId ? dep?.sectionId : sectionId));
    const div = lookups.divisions.find((d) => d.id === divisionId);
    if (dep) parts.push(`${dep.name} Department`);
    else if (sec) parts.push(`${sec.name} Section`);
    else if (div) parts.push(`${div.name} (${div.divisionCode})`);
    return parts.length ? parts.join(' · ') : undefined;
  }, [lookups.departments, lookups.sections, lookups.divisions, departmentId, sectionId, divisionId]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
        <Space align="center">
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
          <Title level={4} style={{ margin: 0 }}>New Production Entry</Title>
        </Space>
        <Space>
          <Button
            icon={<InboxOutlined />}
            onClick={() => navigate('/production/packing')}
            style={{ fontWeight: 600, borderColor: 'var(--theme-success, #10b981)', color: 'var(--theme-success, #10b981)' }}
          >
            Hand Packing (No Machine)
          </Button>
          <Button
            icon={<FormOutlined />}
            onClick={() => navigate('/production/entries/new')}
            style={{ fontWeight: 600 }}
          >
            Direct Entry Form (Skip Machine Pre-Select)
          </Button>
        </Space>
      </div>
      <Steps
        size="small"
        current={0}
        style={{ maxWidth: 480, margin: '8px 0 16px' }}
        items={[{ title: 'Select Machine' }, { title: 'Production Details' }]}
      />

      <Card
        size="small"
        style={{
          marginBottom: 12,
          borderRadius: 10,
          border: '1px solid var(--theme-border, rgba(148, 163, 184, 0.2))',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
        }}
      >
        <Row gutter={[12, 8]} wrap align="middle">
          <Col>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Division</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Divisions"
              className={divisionId ? 'erp-field-filled' : 'erp-field-unfilled'}
              style={{ width: 180, borderRadius: 8 }} value={divisionId}
              options={lookups.divisions.map((d) => ({ value: d.id, label: formatDivLabel(d) }))}
              onChange={(v) => { setDivisionId(v); setSectionId(undefined); setDepartmentId(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Section</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Sections"
              className={sectionId ? 'erp-field-filled' : 'erp-field-unfilled'}
              style={{ width: 160, borderRadius: 8 }} value={sectionId} disabled={!divisionId}
              options={sectionsFiltered.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setSectionId(v); setDepartmentId(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Department</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Departments"
              className={departmentId ? 'erp-field-filled' : 'erp-field-unfilled'}
              style={{ width: 170, borderRadius: 8 }} value={departmentId} disabled={!sectionId}
              options={departmentsFiltered.map((d) => ({ value: d.id, label: `${d.name}${d.departmentCode && d.departmentCode !== d.name ? ` (${d.departmentCode})` : ''}` }))}
              onChange={(v) => setDepartmentId(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Shift</Text>
            <Select
              placeholder="Select Shift"
              className={shiftId ? 'erp-field-filled' : 'erp-field-unfilled'}
              style={{ width: 220, borderRadius: 8 }}
              value={shiftId}
              loading={deptShiftsLoading}
              options={availableShifts.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''})`,
              }))}
              onChange={(v) => setShiftId(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 3 }}>Production Date</Text>
            <DatePicker
              className={entryDate ? 'erp-field-filled' : ''}
              style={{ width: 150, borderRadius: 8 }}
              value={entryDate}
              onChange={(v) => setEntryDate(v)}
              allowClear={false}
            />
          </Col>
          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Button icon={<ReloadOutlined />} onClick={() => setRefreshTick((t) => t + 1)} loading={loading}>
              Refresh
            </Button>
          </Col>
        </Row>
      </Card>

      {!ready && (
        <Alert
          type="info" showIcon
          message="Select a Production Date, Shift and an organizational area (Division / Section / Department) to see which machines still need an entry."
        />
      )}

      {ready && error && (
        <Alert type="error" showIcon style={{ marginBottom: 12 }} message={error} />
      )}

      {ready && !error && (
        <>
          <Card size="small" style={{ marginBottom: 12 }}>
            <Space size={24} wrap>
              <Text>
                Total Machines:{' '}
                <Text strong>{meta?.totalMachines ?? '—'}</Text>
              </Text>
              <Text>
                <span
                  aria-hidden
                  style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--theme-success)', marginRight: 6 }}
                />
                Entered:{' '}
                <Text strong>{meta?.enteredCount ?? '—'}</Text>
              </Text>
              <Text>
                <span
                  aria-hidden
                  style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--theme-danger)', marginRight: 6 }}
                />
                Entry Required:{' '}
                <Text strong>{meta?.entryRequiredCount ?? '—'}</Text>
              </Text>
              {scopeLabel && <Tag color="blue">{scopeLabel}</Tag>}
              {dateIso && <Tag>{dayjs(dateIso).format('DD-MMM-YYYY')}</Tag>}
            </Space>
          </Card>

          {loading && machines.length === 0 ? (
            <Card><GlobalLoading title="Loading Machines..." subtitle="Retrieving active machines for this selection..." badgeText="LIVE DATABASE QUERY" minHeight={240} /></Card>
          ) : machines.length === 0 ? (
            <Empty description="No active machines found for this selection." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                gap: 10,
              }}
            >
              {machines.map((m) => (
                <MachineTile
                  key={m.id}
                  machine={m}
                  onSelect={() => openNewEntry(m)}
                  onEdit={(entryId) => handleEditEntry(entryId)}
                  onView={(entryId) => setDetailModalEntryId(entryId)}
                  onDelete={(entryId) => deleteEntry(entryId)}
                />
              ))}
            </div>
          )}
        </>
      )}


      {/* ── Enterprise In-Modal Production Entry Detail Dialog ── */}
      <ProductionEntryDetailModal
        open={Boolean(detailModalEntryId)}
        entryId={detailModalEntryId}
        onClose={() => setDetailModalEntryId(null)}
        onEdit={(entryId) => {
          setDetailModalEntryId(null);
          handleEditEntry(entryId);
        }}
        onDeleted={() => {
          setDetailModalEntryId(null);
          setRefreshTick((t) => t + 1);
        }}
      />
    </div>
  );
};

const MachineTile: React.FC<{
  machine: MachineStatusRow;
  onSelect: () => void;
  onEdit: (entryId: string) => void;
  onView: (entryId: string) => void;
  onDelete: (entryId: string) => void;
}> = ({ machine, onSelect, onEdit, onView, onDelete }) => {
  const { token } = theme.useToken();
  const entered = machine.status === 'ENTERED';
  const statusColor = entered ? token.colorSuccess : token.colorError;

  // ── Metrics resolution (uses real machine targets & entry data) ───────────
  const hasEntries = machine.entries && machine.entries.length > 0;
  const target = machine.targetQuantity !== undefined && machine.targetQuantity !== null
    ? machine.targetQuantity
    : hasEntries
      ? machine.entries.reduce((sum, e) => sum + (Number(e.targetQuantity) || 0), 0)
      : null;

  const production = machine.actualQuantity !== undefined && machine.actualQuantity !== null
    ? machine.actualQuantity
    : hasEntries
      ? machine.entries.reduce((sum, e) => sum + (Number(e.actualQuantity) || 0), 0)
      : 0;

  const uom = machine.uom || (hasEntries ? machine.entries[0]?.uom : null) || 'KG';

  const achievement = machine.achievementPercentage !== undefined && machine.achievementPercentage !== null
    ? machine.achievementPercentage
    : target && target > 0
      ? Number(((production / target) * 100).toFixed(2))
      : null;

  const variance = machine.variance !== undefined && machine.variance !== null
    ? machine.variance
    : target !== null && target !== undefined
      ? Number((production - target).toFixed(4))
      : null;

  // Variance indicator: ↑ positive (green), ↓ negative (red), – zero (neutral)
  let varianceNode: React.ReactNode = null;
  if (variance !== null) {
    if (variance > 0) {
      varianceNode = (
        <span style={{ color: token.colorSuccess, fontWeight: 600 }}>
          ↑ {formatQty(variance)} {uom}
        </span>
      );
    } else if (variance < 0) {
      varianceNode = (
        <span style={{ color: token.colorError, fontWeight: 600 }}>
          ↓ {formatQty(Math.abs(variance))} {uom}
        </span>
      );
    } else {
      varianceNode = (
        <span style={{ color: token.colorTextSecondary, fontWeight: 600 }}>
          – 0 {uom}
        </span>
      );
    }
  }

  const entriesList = (
    <div style={{ minWidth: 280 }}>
      {machine.entries.map((e, idx) => (
        <div
          key={e.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, padding: '8px 2px',
            borderBottom: idx < machine.entries.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none',
          }}
        >
          <div>
            <Text strong style={{ fontSize: 13, color: token.colorText }}>{e.itemName ?? e.itemId}</Text>
            <br />
            <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>
              Actual {formatQty(e.actualQuantity)} {e.uom || uom} / Target {formatQty(e.targetQuantity)} {e.uom || uom}
            </Text>
          </div>
          <Space size={4}>
            <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={() => onEdit(e.id)}>
              Edit
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => onView(e.id)}>
              View
            </Button>
            <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(e.id)} />
          </Space>
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        border: `1.5px solid ${entered ? token.colorSuccess : token.colorBorderSecondary}`,
        borderRadius: 10,
        padding: '12px 14px',
        background: entered ? (token.colorSuccessBg || 'rgba(16, 185, 129, 0.08)') : token.colorBgContainer,
        boxShadow: entered
          ? '0 2px 8px rgba(16, 185, 129, 0.12)'
          : (token.boxShadowTertiary || '0 2px 8px rgba(0, 0, 0, 0.04)'),
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        transition: 'all 0.2s ease',
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: token.colorText, lineHeight: 1.3 }} title={machine.name}>
            {machine.name}
          </div>
          <Tag style={{
            fontSize: 11,
            margin: 0,
            fontWeight: 600,
            padding: '0 6px',
            background: token.colorFillAlter,
            color: token.colorTextSecondary,
            border: `1px solid ${token.colorBorderSecondary}`,
          }}>
            {machine.machineCode}
          </Tag>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {machine.departmentName && (
            <Text style={{ fontSize: 11, color: token.colorTextSecondary }}>{machine.departmentName}</Text>
          )}
          {machine.systemCode && machine.systemCode !== machine.machineCode && (
            <Text style={{ fontSize: 10, color: token.colorTextTertiary }}>· {machine.systemCode}</Text>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          aria-hidden
          style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: statusColor }}
        />
        <Text strong style={{ fontSize: 11, color: statusColor }}>
          {entered ? 'Already Entered' : 'Entry Required'}
        </Text>
      </div>

      {/* ── Compact Machine KPI Section ─────────────────────────────────── */}
      <div
        style={{
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: 6,
          padding: '4px 8px',
          background: token.colorFillAlter,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          fontSize: 11,
          lineHeight: 1.25,
        }}
      >
        <div>
          <div style={{ color: token.colorTextSecondary, fontSize: 10, fontWeight: 500 }}>Target</div>
          <div style={{ fontWeight: 600, fontSize: 12, color: token.colorText }}>
            {target !== null ? `${formatQty(target)} ${uom}` : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: token.colorTextSecondary, fontSize: 10, fontWeight: 500 }}>Production</div>
          <div style={{ fontWeight: 600, fontSize: 12, color: token.colorText }}>
            {entered || target !== null ? `${formatQty(production)} ${uom}` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: token.colorTextSecondary, fontSize: 10, fontWeight: 500 }}>Achievement</div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: achievement !== null && achievement >= 100 ? token.colorSuccess : token.colorText,
            }}
          >
            {achievement !== null ? formatPercent(achievement) : '—'}
          </div>
          {varianceNode && (
            <div style={{ fontSize: 10, lineHeight: 1.2, marginTop: 1 }}>
              {varianceNode}
            </div>
          )}
        </div>
      </div>

      {/* ── Item Breakdown (1 Item, 2 Items, etc.) ─────────────────────── */}
      {machine.entries && machine.entries.length > 0 && (
        <div
          style={{
            borderRadius: 6,
            padding: '5px 8px',
            background: token.colorFillAlter,
            border: `1px solid ${token.colorBorderSecondary}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {machine.entries.map((itemEntry, idx) => (
            <div
              key={itemEntry.id || idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 11,
                gap: 6,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background: token.colorPrimary,
                    color: '#fff',
                    fontSize: 9.5,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {idx + 1}
                </span>
                <span
                  style={{
                    fontWeight: 600,
                    color: token.colorText,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={itemEntry.itemName ?? itemEntry.itemId}
                >
                  {itemEntry.itemName || `Item #${idx + 1}`}
                </span>
              </div>
              <div
                style={{
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: token.colorPrimary,
                  whiteSpace: 'nowrap',
                }}
              >
                {formatQty(itemEntry.actualQuantity)} {itemEntry.uom || uom}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 'auto', paddingTop: 4 }}>
        {entered ? (
          machine.entries.length === 1 ? (
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<EditOutlined />}
                style={{ flex: 1, fontWeight: 600 }}
                onClick={() => onEdit(machine.entries[0].id)}
              >
                Edit
              </Button>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onView(machine.entries[0].id)}
              >
                View
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                title="Delete dummy / test entry"
                onClick={() => onDelete(machine.entries[0].id)}
              />
            </div>
          ) : (
            <Popover content={entriesList} title={`${machine.entryCount} entries for this shift`} trigger="click">
              <Button block size="small" icon={<EditOutlined />}>
                Existing Entries ({machine.entryCount})
              </Button>
            </Popover>
          )
        ) : (
          <Button block size="small" type="primary" icon={<SelectOutlined />} onClick={onSelect}>
            Select
          </Button>
        )}
      </div>
    </div>
  );
};

export default EntryMachineSelect;
