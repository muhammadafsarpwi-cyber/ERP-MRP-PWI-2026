import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table, Button, Space, Tag, Modal, Form, Input, Select, DatePicker, message,
  Popconfirm, Card, Drawer, Descriptions, InputNumber, Alert, Statistic,
} from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, AimOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';

interface OrgItem { id: string; name: string; }
interface DivisionLk extends OrgItem { divisionCode: string; }
interface SectionLk extends OrgItem { sectionCode: string; divisionId: string | null; }
interface DepartmentLk extends OrgItem { departmentCode: string; divisionId: string | null; sectionId: string | null; }

interface MachineLk {
  id: string;
  machineId?: string | null;
  machineCode: string;
  machineNumber?: string | null;
  name: string;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  status: string;
}

interface ShiftLk {
  id: string;
  shiftCode: string;
  name: string;
  plannedHours?: string | number | null;
}

interface UomLk {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
}

/** Production target units (PROMPT-16): KG / PCS / METER — 'M' is the stored Meter code. */
const PRODUCTION_UOM_CODES = ['KG', 'PCS', 'M', 'METER'];
const MAX_STANDARD_HOURS = 24;

interface MachineTarget {
  id: string;
  companyId: string;
  machineId: string;
  shiftId: string;
  uomId: string;
  machine?: MachineLk | null;
  shift?: ShiftLk | null;
  uom?: UomLk | null;
  standardHours: string | number;
  targetQuantity: string | number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  remarks: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_COLORS: Record<string, string> = { ACTIVE: 'green', INACTIVE: 'red' };

const shortUser = (id?: string | null): string => (id ? id.substring(0, 8) : '—');

const fmtDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso;
};

const fmtQty = (v: string | number | null | undefined): string => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
};

const calcPerHour = (qty: number, hours: number): number | null =>
  hours > 0 ? Number(((qty * 1) / hours).toFixed(4)) : null;

const TargetManagement: React.FC = () => {
  const [targets, setTargets] = useState<MachineTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('machineCode');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  const [search, setSearch] = useState('');
  const [fMachineId, setFMachineId] = useState<string | undefined>();
  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fShift, setFShift] = useState<string | undefined>();
  const [fUom, setFUom] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();

  const [machines, setMachines] = useState<MachineLk[]>([]);
  const [shifts, setShifts] = useState<ShiftLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);
  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MachineTarget | null>(null);
  const [detail, setDetail] = useState<MachineTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const formMachineId = Form.useWatch('machineId', form);
  const formHours = Form.useWatch('standardHours', form);
  const formQty = Form.useWatch('targetQuantity', form);
  const formUomId = Form.useWatch('uomId', form);

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === formMachineId) ?? null,
    [machines, formMachineId],
  );
  const perHourPreview = useMemo(() => {
    const q = Number(formQty);
    const h = Number(formHours);
    if (!(q > 0) || !(h > 0)) return null;
    return calcPerHour(q, h);
  }, [formQty, formHours]);
  const previewUomLabel = useMemo(() => {
    const u = uoms.find((x) => x.id === formUomId);
    return u ? u.code : '';
  }, [uoms, formUomId]);

  const fetchTargets = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const params: any = { page: pageNum, limit: pageSize, sortBy, sortDir };
      if (search) params.search = search;
      if (fMachineId) params.machineId = fMachineId;
      if (fDivision) params.divisionId = fDivision;
      if (fSection) params.sectionId = fSection;
      if (fDepartment) params.departmentId = fDepartment;
      if (fShift) params.shiftId = fShift;
      if (fUom) params.uomId = fUom;
      if (fStatus) params.status = fStatus;
      const response = await apiService.get<{ data: MachineTarget[]; total: number }>(
        '/production/machine-targets', params,
      );
      setTargets(response.data || []);
      setTotal(response.total ?? response.data?.length ?? 0);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to fetch machine targets');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search, fMachineId, fDivision, fSection, fDepartment, fShift, fUom, fStatus]);

  useEffect(() => { fetchTargets(page); }, [page, pageSize, fetchTargets]);

  useEffect(() => {
    (async () => {
      // Each lookup is fetched independently so one failure never blanks the others.
      const results = await Promise.allSettled([
        apiService.get<{ data: MachineLk[] }>('/machines', { limit: 500, sortBy: 'machineCode' }),
        apiService.get<{ success?: boolean; data: ShiftLk[] }>('/production/shifts'),
        apiService.get<{ data: DivisionLk[] }>('/divisions', { limit: 200 }),
        apiService.get<{ data: SectionLk[] }>('/sections', { limit: 500 }),
        apiService.get<{ data: DepartmentLk[] }>('/departments', { limit: 500 }),
        apiService.get<{ data: UomLk[] }>('/master-data/uom', { limit: 200, status: 'ACTIVE' }),
      ]);
      const [mch, shf, div, sec, dep, uom] = results;
      const failed: string[] = [];
      if (mch.status === 'fulfilled') setMachines(mch.value.data || []); else failed.push('machine');
      if (shf.status === 'fulfilled') setShifts(shf.value.data || []); else failed.push('shift');
      if (div.status === 'fulfilled') setDivisions(div.value.data || []); else failed.push('division');
      if (sec.status === 'fulfilled') setSections(sec.value.data || []); else failed.push('section');
      if (dep.status === 'fulfilled') setDepartments(dep.value.data || []); else failed.push('department');
      if (uom.status === 'fulfilled') {
        setUoms((uom.value.data || []).filter((u) => PRODUCTION_UOM_CODES.includes(String(u.code).toUpperCase())));
      } else {
        failed.push('UOM');
      }
      if (failed.length > 0) {
        message.warning(`Could not load ${failed.join(' / ')} lookups`);
      }
    })();
  }, []);

  const sectionsForDivision = useCallback(
    (divisionId?: string) => (divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections),
    [sections],
  );
  const departmentsForScope = useCallback(
    (divisionId?: string, sectionId?: string) =>
      sectionId ? departments.filter((d) => d.sectionId === sectionId)
        : divisionId ? departments.filter((d) => d.divisionId === divisionId)
          : departments,
    [departments],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ standardHours: 8 });
    setModalVisible(true);
  };

  const openEdit = (t: MachineTarget) => {
    setEditing(t);
    form.setFieldsValue({
      machineId: t.machineId,
      shiftId: t.shiftId,
      uomId: t.uomId,
      standardHours: Number(t.standardHours),
      targetQuantity: Number(t.targetQuantity),
      effectiveFrom: t.effectiveFrom ? dayjs(t.effectiveFrom) : undefined,
      effectiveTo: t.effectiveTo ? dayjs(t.effectiveTo) : undefined,
      status: t.status,
      remarks: t.remarks ?? undefined,
    });
    setModalVisible(true);
  };

  /** On create, default standard hours to the selected shift's planned hours from Shift Master. */
  const handleShiftChange = (shiftId: string | undefined) => {
    if (editing || !shiftId) return;
    const s = shifts.find((x) => x.id === shiftId);
    const hours = Number(s?.plannedHours);
    if (isFinite(hours) && hours > 0) form.setFieldsValue({ standardHours: hours });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const payload: any = {
        machineId: values.machineId,
        shiftId: values.shiftId,
        uomId: values.uomId,
        standardHours: values.standardHours,
        targetQuantity: values.targetQuantity,
        effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
        status: values.status ?? 'ACTIVE',
        remarks: values.remarks || null,
      };
      setSaving(true);
      if (editing) {
        await apiService.put(`/production/machine-targets/${editing.id}`, payload);
        message.success('Machine target updated');
      } else {
        await apiService.post('/production/machine-targets', payload);
        message.success('Machine target created');
      }
      setModalVisible(false);
      fetchTargets(editing ? page : 1);
      if (!editing) setPage(1);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.response?.data?.message || 'Failed to save machine target');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusToggle = async (t: MachineTarget) => {
    const next = t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await apiService.patch(`/production/machine-targets/${t.id}/status`, { status: next });
      message.success(`Target ${next === 'ACTIVE' ? 'activated' : 'deactivated'}`);
      fetchTargets();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleDelete = async (t: MachineTarget) => {
    try {
      await apiService.delete(`/production/machine-targets/${t.id}`);
      message.success('Machine target deleted');
      fetchTargets();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete machine target');
    }
  };

  const resetFilters = () => {
    setSearch('');
    setFMachineId(undefined);
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFShift(undefined);
    setFUom(undefined);
    setFStatus(undefined);
    setPage(1);
    setSortBy('machineCode');
    setSortDir('ASC');
  };

  const uomSymbolOf = (t: MachineTarget) => t.uom?.code ?? '';

  const columns: ColumnsType<MachineTarget> = [
    {
      title: 'Machine ID',
      key: 'machineSystemId',
      width: 110,
      render: (_: any, t: MachineTarget) => <code style={{ fontWeight: 600 }}>{t.machine?.machineId ?? '—'}</code>,
    },
    {
      title: 'Machine Code',
      key: 'machineCode',
      sorter: true,
      width: 120,
      render: (_: any, t: MachineTarget) => <b>{t.machine?.machineCode ?? '—'}</b>,
    },
    {
      title: 'Machine Name',
      key: 'machineName',
      sorter: true,
      width: 180,
      ellipsis: true,
      render: (_: any, t: MachineTarget) => t.machine?.name ?? '—',
    },
    {
      title: 'Machine Number',
      key: 'machineNumber',
      width: 120,
      render: (_: any, t: MachineTarget) => t.machine?.machineNumber ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Division',
      key: 'division',
      width: 130,
      ellipsis: true,
      render: (_: any, t: MachineTarget) => t.machine?.division?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Section',
      key: 'section',
      width: 130,
      ellipsis: true,
      render: (_: any, t: MachineTarget) => t.machine?.section?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Department',
      key: 'department',
      width: 140,
      ellipsis: true,
      render: (_: any, t: MachineTarget) => t.machine?.department?.name ?? <span style={{ color: 'var(--theme-text-muted)' }}>—</span>,
    },
    {
      title: 'Shift',
      key: 'shiftCode',
      sorter: true,
      width: 110,
      render: (_: any, t: MachineTarget) => (
        <Tag color="blue">{t.shift?.shiftCode ?? '—'}</Tag>
      ),
    },
    {
      title: 'UOM',
      key: 'uomCode',
      sorter: true,
      width: 90,
      render: (_: any, t: MachineTarget) => <Tag>{uomSymbolOf(t)}</Tag>,
    },
    {
      title: 'Standard Hours',
      dataIndex: 'standardHours',
      sorter: true,
      width: 120,
      align: 'right',
      render: (h: string | number) => fmtQty(h),
    },
    {
      title: 'Standard Target',
      dataIndex: 'targetQuantity',
      sorter: true,
      width: 140,
      align: 'right',
      render: (q: string | number, t: MachineTarget) => (
        <b>{fmtQty(q)} {uomSymbolOf(t)}</b>
      ),
    },
    {
      title: 'Target / Hour',
      key: 'perHour',
      width: 140,
      align: 'right',
      render: (_: any, t: MachineTarget) => {
        const ph = calcPerHour(Number(t.targetQuantity), Number(t.standardHours));
        return <span>{ph !== null ? `${fmtQty(ph)} ${uomSymbolOf(t)}/h` : '—'}</span>;
      },
    },
    {
      title: 'Effective From',
      dataIndex: 'effectiveFrom',
      sorter: true,
      width: 170,
      render: (from: string, t: MachineTarget) => (
        <div>
          <div>{from}</div>
          <span style={{ color: 'var(--theme-text-muted)', fontSize: 12 }}>
            → {t.effectiveTo ?? 'open'}
          </span>
        </div>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      sorter: true,
      width: 100,
      render: (s: string) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
    },
    {
      title: 'Created By / Date',
      key: 'createdAudit',
      width: 170,
      render: (_: any, t: MachineTarget) => (
        <div style={{ fontSize: 12 }}>
          <div><code>{shortUser(t.createdBy)}</code></div>
          <span style={{ color: 'var(--theme-text-muted)' }}>{fmtDateTime(t.createdAt)}</span>
        </div>
      ),
    },
    {
      title: 'Updated By / Date',
      key: 'updatedAudit',
      width: 170,
      render: (_: any, t: MachineTarget) => (
        <div style={{ fontSize: 12 }}>
          <div><code>{shortUser(t.updatedBy)}</code></div>
          <span style={{ color: 'var(--theme-text-muted)' }}>{fmtDateTime(t.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 210,
      fixed: 'right',
      render: (_: any, t: MachineTarget) => (
        <Space size={0}>
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => setDetail(t)} />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => openEdit(t)} />
          <Button type="link" size="small" onClick={() => handleStatusToggle(t)}>
            {t.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
          <Popconfirm
            title={`Delete this target for '${t.machine?.machineCode ?? ''}'?`}
            description="The record is soft-deleted and hidden from lists."
            onConfirm={() => handleDelete(t)}
          >
            <Button type="link" size="small" danger>Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card style={{ marginBottom: 16 }}>
        <Space wrap size={8}>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="Search machine ID / code / name / number…"
            style={{ width: 260 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select
            allowClear showSearch optionFilterProp="label"
            placeholder="Machine" style={{ width: 220 }} value={fMachineId}
            options={machines.map((m) => ({
              value: m.id,
              label: `${m.machineCode} — ${m.name}${m.machineId ? ` (${m.machineId})` : ''}`,
            }))}
            onChange={(v) => { setFMachineId(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="Division" style={{ width: 160 }} value={fDivision}
            options={divisions.map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
          />
          <Select
            allowClear placeholder="Section" style={{ width: 160 }} value={fSection}
            options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
            onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
            disabled={!!fDivision && sectionsForDivision(fDivision).length === 0}
          />
          <Select
            allowClear placeholder="Department" style={{ width: 170 }} value={fDepartment}
            options={departmentsForScope(fDivision, fSection).map((d) => ({ value: d.id, label: d.name }))}
            onChange={(v) => { setFDepartment(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="Shift" style={{ width: 150 }} value={fShift}
            options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} · ${s.name}` }))}
            onChange={(v) => { setFShift(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="UOM" style={{ width: 130 }} value={fUom}
            options={uoms.map((u) => ({ value: u.id, label: u.code }))}
            onChange={(v) => { setFUom(v); setPage(1); }}
          />
          <Select
            allowClear placeholder="Status" style={{ width: 130 }} value={fStatus}
            options={['ACTIVE', 'INACTIVE'].map((s) => ({ value: s, label: s }))}
            onChange={(v) => { setFStatus(v); setPage(1); }}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>Reset</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            Add Target
          </Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={targets}
        loading={loading}
        scroll={{ x: 2100 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `${t} targets`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        onChange={(_pg, _flt, sorter: any) => {
          if (sorter && sorter.field) {
            const map: Record<string, string> = {
              machineCode: 'machineCode',
              machineName: 'machineName',
              shiftCode: 'shiftCode',
              uomCode: 'uomCode',
              standardHours: 'standardHours',
              targetQuantity: 'targetQuantity',
              effectiveFrom: 'effectiveFrom',
              status: 'status',
            };
            const col = map[sorter.field] || 'machineCode';
            setSortBy(col);
            setSortDir(sorter.order === 'descend' ? 'DESC' : 'ASC');
          }
        }}
      />

      <Modal
        title={editing ? `Edit Target — ${editing.machine?.machineCode ?? ''}` : 'Add Machine Target'}
        open={modalVisible}
        onOk={handleSave}
        confirmLoading={saving}
        onCancel={() => setModalVisible(false)}
        width={760}
        okText={editing ? 'Save Changes' : 'Create Target'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="machineId"
            label="Machine"
            rules={[{ required: true, message: 'Select a machine from the Machine Master' }]}
          >
            <Select
              showSearch optionFilterProp="label"
              placeholder="Select machine (from Machine Master)"
              options={machines.map((m) => ({
                value: m.id,
                label: `${m.machineCode} — ${m.name}${m.machineId ? ` (${m.machineId})` : ''}`,
              }))}
            />
          </Form.Item>

          {selectedMachine && (
            <Card size="small" style={{ marginBottom: 16, background: 'var(--theme-surface-alt)' }} title={<span><AimOutlined /> Selected Machine</span>}>
              <Descriptions size="small" column={3}>
                <Descriptions.Item label="Machine ID">
                  <code>{selectedMachine.machineId ?? '—'}</code>
                </Descriptions.Item>
                <Descriptions.Item label="Code">{selectedMachine.machineCode}</Descriptions.Item>
                <Descriptions.Item label="Name">{selectedMachine.name}</Descriptions.Item>
                <Descriptions.Item label="Number">{selectedMachine.machineNumber ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Division">{selectedMachine.division?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Section">{selectedMachine.section?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Department">{selectedMachine.department?.name ?? '—'}</Descriptions.Item>
              </Descriptions>
            </Card>
          )}

          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="shiftId"
              label="Shift"
              rules={[{ required: true, message: 'Select a shift' }]}
              style={{ flex: 1, minWidth: 220 }}
            >
              <Select
                showSearch optionFilterProp="label"
                placeholder="e.g. SHIFT-A / GENERAL"
                onChange={handleShiftChange}
                options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} · ${s.name}` }))}
              />
            </Form.Item>
            <Form.Item
              name="uomId"
              label="UOM (production unit)"
              tooltip="Only KG, PCS and METER are allowed for production targets"
              rules={[{ required: true, message: 'Select a production UOM' }]}
              style={{ flex: 1, minWidth: 180 }}
            >
              <Select
                placeholder="KG / PCS / METER"
                options={uoms.map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` }))}
              />
            </Form.Item>
            <Form.Item
              name="status"
              label="Status"
              initialValue="ACTIVE"
              style={{ flex: 1, minWidth: 130 }}
            >
              <Select options={['ACTIVE', 'INACTIVE'].map((s) => ({ value: s, label: s }))} />
            </Form.Item>
          </Space>

          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="targetQuantity"
              label="Standard Target"
              tooltip={`Production quantity over the standard hours`}
              rules={[
                { required: true, message: 'Standard target is required' },
                { type: 'number', min: 0.0001, message: 'Must be greater than 0' },
              ]}
              style={{ flex: 1, minWidth: 180 }}
            >
              <InputNumber min={0.0001} step={1} style={{ width: '100%' }} placeholder="e.g. 5000" />
            </Form.Item>
            <Form.Item
              name="standardHours"
              label="Standard Hours"
              tooltip={`Working hours the target is based on (max ${MAX_STANDARD_HOURS})`}
              rules={[
                { required: true, message: 'Standard hours are required' },
                { type: 'number', min: 0.01, max: MAX_STANDARD_HOURS, message: `Between 0.01 and ${MAX_STANDARD_HOURS}` },
              ]}
              style={{ flex: 1, minWidth: 160 }}
            >
              <InputNumber min={0.01} max={MAX_STANDARD_HOURS} step={0.5} style={{ width: '100%' }} placeholder="e.g. 8" />
            </Form.Item>
            <Form.Item label="Target Per Hour (auto)" style={{ flex: 1, minWidth: 180 }}>
              <Input
                disabled
                value={perHourPreview !== null ? `${fmtQty(perHourPreview)}${previewUomLabel ? ` ${previewUomLabel}` : ''}/h` : ''}
                placeholder="Auto-calculated"
              />
            </Form.Item>
          </Space>

          {perHourPreview !== null && previewUomLabel && (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <Space size={24} wrap>
                  <Statistic title="Standard Target" value={`${fmtQty(formQty)} ${previewUomLabel}`} valueStyle={{ fontSize: 16 }} />
                  <Statistic title="Standard Hours" value={Number(formHours)} valueStyle={{ fontSize: 16 }} />
                  <Statistic title="Target / Hour" value={`${fmtQty(perHourPreview)} ${previewUomLabel}/hour`} valueStyle={{ fontSize: 16 }} />
                </Space>
              }
            />
          )}

          <Space size={16} style={{ display: 'flex' }}>
            <Form.Item
              name="effectiveFrom"
              label="Effective From"
              rules={[{ required: true, message: 'Effective from date is required' }]}
              style={{ flex: 1, minWidth: 180 }}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="effectiveTo"
              label="Effective To"
              dependencies={['effectiveFrom']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const from = getFieldValue('effectiveFrom');
                    if (!value || !from || value.isAfter(from)) return Promise.resolve();
                    return Promise.reject(new Error('Effective To must be after Effective From'));
                  },
                }),
              ]}
              style={{ flex: 1, minWidth: 180 }}
            >
              <DatePicker style={{ width: '100%' }} placeholder="(open-ended)" />
            </Form.Item>
          </Space>

          <Form.Item name="remarks" label="Remarks">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail ? `Target — ${detail.machine?.machineCode ?? ''} · ${detail.shift?.shiftCode ?? ''}` : ''}
        placement="right"
        width={480}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          detail && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => { const d = detail; setDetail(null); openEdit(d); }}>
              Edit
            </Button>
          )
        }
      >
        {detail && (() => {
          const ph = calcPerHour(Number(detail.targetQuantity), Number(detail.standardHours));
          return (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`${fmtQty(detail.targetQuantity)} ${uomSymbolOf(detail)} / ${fmtQty(detail.standardHours)} h  →  ${ph !== null ? fmtQty(ph) : '—'} ${uomSymbolOf(detail)}/hour`}
              />
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="Machine ID"><code>{detail.machine?.machineId ?? '—'}</code></Descriptions.Item>
                <Descriptions.Item label="Machine Code">{detail.machine?.machineCode ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Machine Name">{detail.machine?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Machine Number">{detail.machine?.machineNumber ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Division">{detail.machine?.division?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Section">{detail.machine?.section?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Department">{detail.machine?.department?.name ?? '—'}</Descriptions.Item>
                <Descriptions.Item label="Shift">{detail.shift ? `${detail.shift.shiftCode} · ${detail.shift.name}` : '—'}</Descriptions.Item>
                <Descriptions.Item label="UOM">{detail.uom ? `${detail.uom.code} · ${detail.uom.name}` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Standard Target">{`${fmtQty(detail.targetQuantity)} ${uomSymbolOf(detail)}`}</Descriptions.Item>
                <Descriptions.Item label="Standard Hours">{fmtQty(detail.standardHours)}</Descriptions.Item>
                <Descriptions.Item label="Target / Hour">{ph !== null ? `${fmtQty(ph)} ${uomSymbolOf(detail)}/h` : '—'}</Descriptions.Item>
                <Descriptions.Item label="Effective From">{detail.effectiveFrom}</Descriptions.Item>
                <Descriptions.Item label="Effective To">{detail.effectiveTo ?? 'open-ended'}</Descriptions.Item>
                <Descriptions.Item label="Status">
                  <Tag color={STATUS_COLORS[detail.status]}>{detail.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="Remarks">{detail.remarks ?? '—'}</Descriptions.Item>
              </Descriptions>
            </>
          );
        })()}
      </Drawer>
    </div>
  );
};

export default TargetManagement;
