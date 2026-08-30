import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Card, Row, Col, DatePicker, Select, Button, Space, Typography, Spin,
  Empty, Popover, Tag, Alert, Steps, message,
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
  entries: MachineEntryMini[];
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
            <Text type="secondary" style={{ display: 'block' }}>Production Date</Text>
            <DatePicker
              style={{ width: 150 }}
              value={entryDate}
              onChange={(v) => setEntryDate(v)}
              allowClear={false}
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
              Actual {e.actualQuantity} / Target {e.targetQuantity}
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
        padding: '10px 12px',
        background: softBg,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        opacity: entered ? 0.92 : 1,
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
          style={{ flex: 'none', width: 9, height: 9, borderRadius: '50%', background: statusColor }}
        />
        <Text strong style={{ fontSize: 12, color: statusColor }}>
          {entered ? 'Already Entered' : 'Entry Required'}
        </Text>
      </div>

      <div style={{ marginTop: 'auto' }}>
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
