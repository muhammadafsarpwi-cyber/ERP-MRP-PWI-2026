import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, DatePicker, Select, Button, Space, Typography, Spin,
  Empty, Popover, Tag, Alert, Steps, App,
} from 'antd';
import {
  ArrowLeftOutlined, ReloadOutlined, SelectOutlined, EditOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import apiService from '../../../services/api';
import { useLookups } from './lookups';

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

/**
 * Step 1 of the production-entry flow: pick Date + Shift + organizational area,
 * then see every machine flagged as Already Entered / Entry Required BEFORE any
 * data-entry happens. Only "Entry Required" machines can open a new entry form.
 */
const EntryMachineSelect: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const lookups = useLookups();

  // ── selection state (seeded from URL so back-navigation restores context) ──
  const [entryDate, setEntryDate] = useState<dayjs.Dayjs | null>(
    searchParams.get('entryDate') ? dayjs(searchParams.get('entryDate') as string) : dayjs(),
  );
  const [shiftId, setShiftId] = useState<string | undefined>(searchParams.get('shiftId') || undefined);
  const [divisionId, setDivisionId] = useState<string | undefined>(searchParams.get('divisionId') || undefined);
  const [sectionId, setSectionId] = useState<string | undefined>(searchParams.get('sectionId') || undefined);
  const [departmentId, setDepartmentId] = useState<string | undefined>(searchParams.get('departmentId') || undefined);

  // ── machine status state ──
  const [machines, setMachines] = useState<MachineStatusRow[]>([]);
  const [meta, setMeta] = useState<MachineStatusResponse['meta'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const dateIso = entryDate ? entryDate.format('YYYY-MM-DD') : undefined;

  const sectionsFiltered = lookups.sectionsForDivision(divisionId);
  const departmentsFiltered = lookups.departmentsForSection(sectionId);

  const ready = !!dateIso && !!shiftId && !!(divisionId || sectionId || departmentId);

  const fetchStatus = useCallback(async () => {
    if (!dateIso || !shiftId || !(divisionId || sectionId || departmentId)) {
      setMachines([]);
      setMeta(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.get<MachineStatusResponse>('/production/entries/machine-status', {
        entryDate: dateIso,
        shiftId,
        ...(divisionId && { divisionId }),
        ...(sectionId && { sectionId }),
        ...(departmentId && { departmentId }),
      });
      setMachines(res.data || []);
      setMeta(res.meta || null);
    } catch {
      setError('Failed to load machine entry status. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [dateIso, shiftId, divisionId, sectionId, departmentId]);

  // Recompute whenever Date / Shift / Division / Section / Department change
  useEffect(() => {
    const t = setTimeout(() => void fetchStatus(), 250);
    return () => clearTimeout(t);
  }, [fetchStatus, refreshTick]);

  const openNewEntry = (m: MachineStatusRow) => {
    const ctxDivision = m.divisionId ?? divisionId;
    const ctxSection = m.sectionId ?? sectionId;
    const ctxDepartment = m.departmentId ?? departmentId;
    if (!ctxDivision || !ctxSection || !ctxDepartment) {
      message.warning('This machine has no complete Division/Section/Department assignment.');
      return;
    }
    const qs = new URLSearchParams({
      from: 'select',
      machineId: m.id,
      entryDate: dateIso as string,
      shiftId: shiftId as string,
      divisionId: ctxDivision,
      sectionId: ctxSection,
      departmentId: ctxDepartment,
    });
    navigate(`/production/entries/new?${qs.toString()}`);
  };

  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    const dep = lookups.departments.find((d) => d.id === departmentId);
    const sec = lookups.sections.find((s) => s.id === (departmentId ? dep?.sectionId : sectionId));
    const div = lookups.divisions.find((d) => d.id === divisionId);
    if (dep) parts.push(`${dep.name} Department`);
    else if (sec) parts.push(`${sec.name} Section`);
    else if (div) parts.push(`${div.divisionCode} — ${div.name}`);
    return parts.length ? parts.join(' · ') : undefined;
  }, [lookups.departments, lookups.sections, lookups.divisions, departmentId, sectionId, divisionId]);

  return (
    <div>
      <Space align="center" style={{ marginBottom: 4 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/production/entries')}>Back</Button>
        <Title level={4} style={{ margin: 0 }}>New Production Entry</Title>
      </Space>
      <Steps
        size="small"
        current={0}
        style={{ maxWidth: 480, margin: '8px 0 16px' }}
        items={[{ title: 'Select Machine' }, { title: 'Production Details' }]}
      />

      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={12} wrap>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Division</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Divisions"
              style={{ width: 180 }} value={divisionId}
              options={lookups.divisions.map((d) => ({ value: d.id, label: `${d.divisionCode} — ${d.name}` }))}
              onChange={(v) => { setDivisionId(v); setSectionId(undefined); setDepartmentId(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Section</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Sections"
              style={{ width: 160 }} value={sectionId} disabled={!divisionId}
              options={sectionsFiltered.map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setSectionId(v); setDepartmentId(undefined); }}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Department</Text>
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="All Departments"
              style={{ width: 170 }} value={departmentId} disabled={!sectionId}
              options={departmentsFiltered.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => setDepartmentId(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Shift</Text>
            <Select
              placeholder="Select Shift" style={{ width: 200 }} value={shiftId}
              options={lookups.shifts.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.startTime ?? ''}–${s.endTime ?? ''})`,
              }))}
              onChange={(v) => setShiftId(v)}
            />
          </Col>
          <Col>
            <Text type="secondary" style={{ display: 'block' }}>Production Date</Text>
            <DatePicker
              style={{ width: 150 }}
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
            <Card><Spin style={{ width: '100%', marginTop: 60 }} /></Card>
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
                  onViewEdit={(entryId) => navigate(`/production/entries/${entryId}`)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const MachineTile: React.FC<{
  machine: MachineStatusRow;
  onSelect: () => void;
  onViewEdit: (entryId: string) => void;
}> = ({ machine, onSelect, onViewEdit }) => {
  const entered = machine.status === 'ENTERED';
  const statusColor = entered ? 'var(--theme-success)' : 'var(--theme-danger)';
  const softBg = entered ? 'var(--theme-success-soft)' : 'transparent';

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
        <span style={{ color: 'var(--theme-success, #16a34a)', fontWeight: 600 }}>
          ↑ {formatQty(variance)} {uom}
        </span>
      );
    } else if (variance < 0) {
      varianceNode = (
        <span style={{ color: 'var(--theme-danger, #dc2626)', fontWeight: 600 }}>
          ↓ {formatQty(Math.abs(variance))} {uom}
        </span>
      );
    } else {
      varianceNode = (
        <span style={{ color: 'var(--theme-text-secondary, #64748b)', fontWeight: 600 }}>
          – 0 {uom}
        </span>
      );
    }
  }

  const entriesList = (
    <div style={{ minWidth: 240 }}>
      {machine.entries.map((e, idx) => (
        <div
          key={e.id}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 8, padding: '6px 2px',
            borderBottom: idx < machine.entries.length - 1 ? '1px solid var(--theme-border)' : 'none',
          }}
        >
          <div>
            <Text strong style={{ fontSize: 12 }}>{e.itemName ?? e.itemId}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 11 }}>
              Actual {formatQty(e.actualQuantity)} {e.uom || uom} / Target {formatQty(e.targetQuantity)} {e.uom || uom}
            </Text>
          </div>
          <Button size="small" icon={<EditOutlined />} onClick={() => onViewEdit(e.id)}>
            View / Edit
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <div
      style={{
        border: `1px solid ${entered ? 'var(--theme-success)' : 'var(--theme-border-strong)'}`,
        borderRadius: 8,
        padding: '8px 10px',
        background: softBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: entered ? 0.96 : 1,
      }}
    >
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>{machine.systemCode}</Text>
        <div style={{ fontWeight: 600, lineHeight: 1.25 }}>{machine.machineCode}</div>
        <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={machine.name}>
          {machine.name}
        </div>
        {machine.departmentName && (
          <Text type="secondary" style={{ fontSize: 11 }}>{machine.departmentName}</Text>
        )}
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
          border: '1px solid var(--theme-border-secondary, rgba(0, 0, 0, 0.08))',
          borderRadius: 6,
          padding: '4px 8px',
          background: 'var(--theme-bg-subtle, rgba(0, 0, 0, 0.02))',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          fontSize: 11,
          lineHeight: 1.25,
        }}
      >
        <div>
          <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500 }}>Target</div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {target !== null ? `${formatQty(target)} ${uom}` : '—'}
          </div>
        </div>
        <div>
          <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500 }}>Production</div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {entered || target !== null ? `${formatQty(production)} ${uom}` : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500 }}>Achievement</div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: achievement !== null && achievement >= 100 ? 'var(--theme-success, #16a34a)' : undefined,
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

      <div style={{ marginTop: 'auto', paddingTop: 2 }}>
        {entered ? (
          machine.entries.length === 1 ? (
            <Button block size="small" icon={<EditOutlined />} onClick={() => onViewEdit(machine.entries[0].id)}>
              View / Edit Existing
            </Button>
          ) : (
            <Popover content={entriesList} title={`${machine.entryCount} entries for this shift`} trigger="click">
              <Button block size="small" icon={<EditOutlined />}>
                View / Edit Existing ({machine.entryCount})
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
