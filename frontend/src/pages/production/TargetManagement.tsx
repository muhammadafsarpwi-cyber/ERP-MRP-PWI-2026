import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Button, Space, Tag, Form, Input, Select, DatePicker, App,
  Card, Descriptions, InputNumber, Alert, Statistic,
  Grid, Row, Col, Dropdown, Tooltip, Typography, Upload, Spin, Table,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, EditOutlined, ReloadOutlined, EyeOutlined, AimOutlined,
  DeleteOutlined, ClearOutlined, DownloadOutlined,
  FilePdfOutlined, PrinterOutlined, StopOutlined, CheckCircleOutlined,
  ToolOutlined, ImportOutlined, InboxOutlined,
  TagOutlined, SettingOutlined, ApartmentOutlined, TeamOutlined,
  ShoppingOutlined, ClockCircleOutlined, HourglassOutlined,
  CalendarOutlined, UserOutlined, SafetyOutlined,
  ShopOutlined, SubnodeOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import {
  PageHeader, ERPTable, TableActions, PageToolbar,
  StatusBadge, DraggableResizableModal,
} from '../../components/shared';
import { getMachineColor } from '../../utils/colorMapping';
import TargetView, { TargetRecord } from './TargetView';
import TargetSaveSuccessModal from './TargetSaveSuccessModal';

const { Text } = Typography;

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

interface UserLk {
  id: string;
  displayName: string;
  email?: string;
}

interface ItemLk {
  id: string;
  itemCode: string;
  name: string;
  itemType?: string | null;
  status?: string;
  isActive?: boolean;
  baseUomId?: string | null;
  weightPerPiece?: number | string | null;
  piecesPerKg?: number | string | null;
  weightPerMeter?: number | string | null;
  lengthPerPiece?: number | string | null;
}

/** Production target units (PROMPT-16): KG / PCS / METER — 'M' is the stored Meter code. */
const PRODUCTION_UOM_CODES = ['KG', 'PCS', 'M', 'METER'];
const MAX_STANDARD_HOURS = 24;
const DEFAULT_PAGE_SIZE = 10;
const EXPORT_LIMIT = 10000;

interface MachineTarget {
  id: string;
  companyId: string;
  machineId: string;
  shiftId: string;
  itemId?: string | null;
  uomId: string;
  machine?: MachineLk | null;
  shift?: ShiftLk | null;
  uom?: UomLk | null;
  item?: ItemLk | null;
  standardHours: string | number;
  targetQuantity: string | number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  remarks: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByUser?: UserLk | null;
  updatedByUser?: UserLk | null;
  createdAt?: string;
  updatedAt?: string;
}

const STATUS_COLORS: Record<string, string> = { ACTIVE: 'green', INACTIVE: 'red' };

const SORT_LABELS: Record<string, string> = {
  machineCode: 'Machine',
  machineName: 'Machine Name',
  itemCode: 'Item',
  shiftCode: 'Shift',
  uomCode: 'UOM',
  standardHours: 'Standard Hours',
  targetQuantity: 'Standard Target',
  effectiveFrom: 'Effective From',
  status: 'Status',
};

/** Resolve an audit user for display. Never leaks the raw UUID when the join is unavailable. */
const auditUserName = (u?: UserLk | null, rawId?: string | null): string => {
  if (u?.displayName?.trim()) return u.displayName.trim();
  if (rawId) return 'Unknown User';
  return '—';
};

const fmtDateTime = (iso?: string): string => {
  if (!iso) return '—';
  const d = dayjs(iso);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm') : iso;
};

const fmtQty = (v: string | number | null | undefined): string => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const calcPerHour = (qty: number, hours: number): number | null =>
  hours > 0 ? Number(((qty * 1) / hours).toFixed(4)) : null;

/** Reusable cell component matching the Standard Target visual pattern. */
const HighlightedCell: React.FC<{
  icon?: React.ReactNode;
  label: React.ReactNode;
  labelColor?: string;
  secondary?: React.ReactNode;
  secondaryPrefix?: React.ReactNode;
  secondarySize?: number;
  secondaryWeight?: number;
  tooltip?: string;
}> = ({ icon, label, labelColor = 'var(--theme-accent, #059669)', secondary, secondaryPrefix, secondarySize = 10, secondaryWeight = 500, tooltip }) => {
  const content = (
    <div style={{
      lineHeight: 1.35,
      padding: '3px 8px',
      borderRadius: 6,
      background: 'var(--theme-surface-alt, #f0fdf4)',
      border: '1px solid rgba(16, 185, 129, 0.2)',
      maxWidth: '100%',
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: labelColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {icon && <span style={{ marginRight: 4, fontSize: 11 }}>{icon}</span>}
        {label}
      </div>
      {secondary != null && (
        <div style={{ color: 'var(--theme-text-secondary, rgba(15, 23, 42, 0.72))', fontSize: secondarySize, fontWeight: secondaryWeight, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {secondaryPrefix}
          {secondary}
        </div>
      )}
    </div>
  );
  return tooltip ? <Tooltip title={tooltip}>{content}</Tooltip> : content;
};

/** Compact two-line ERP column header. Keeps compound headings readable without collision. */
const HeaderCell: React.FC<{
  icon?: React.ReactNode;
  first: React.ReactNode;
  second?: React.ReactNode;
}> = ({ icon, first, second }) => (
  <span className="erp-th" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', lineHeight: 1.45, gap: 1 }}>
    <span className="erp-th__line" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontWeight: 600, fontSize: 12.5, letterSpacing: 0.01, whiteSpace: 'nowrap' }}>
      {icon && <span className="erp-th__icon" style={{ fontSize: 11, lineHeight: 1 }}>{icon}</span>}
      {first}
    </span>
    {second != null && (
      <span className="erp-th__line" style={{ fontWeight: 600, fontSize: 12.5, letterSpacing: 0.01, whiteSpace: 'nowrap', lineHeight: 1.3 }}>
        {typeof second === 'string' ? ` ${second}` : second}
      </span>
    )}
  </span>
);

/* ─── Import types and template ──────────────────────────────────────────── */

type ImportRowStatus = 'VALID' | 'DUPLICATE' | 'INVALID';

interface ImportRow {
  rowNumber: number;
  data: Record<string, string>;
  status: ImportRowStatus;
  errors: string[];
}

interface ImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicate: number;
  imported: number;
  failed: number;
  skipped: number;
  errors: string[];
}

const IMPORT_TEMPLATE_CSV =
  'Machine Code,Shift Code,UOM Code,Item Code,Standard Target,Standard Hours,Effective From,Effective To,Status,Remarks\n' +
  'APS-01,SHIFT-1,KG,WIP-SPL-018,5000,8,2026-01-01,,ACTIVE,Sample target\n' +
  'APS-02,SHIFT-1,PCS,WIP-SPL-019,3000,8,2026-01-01,2026-12-31,ACTIVE,Limited period\n';

function parseImportCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      if (cur.some((c) => c.trim() !== '')) rows.push(cur);
      cur = [];
    } else {
      field += ch;
    }
  }
  cur.push(field);
  if (cur.some((c) => c.trim() !== '')) rows.push(cur);
  return rows;
}

function downloadImportTemplate(): void {
  const blob = new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'machine-target-import-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* CSV text utilities (mirror the ItemManagement export architecture). */
function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '\ufeff' + [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}

function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const EXPORT_HEADERS = [
  'Machine Number', 'Machine Code', 'Machine Name', 'Division', 'Section', 'Department',
  'Item Code', 'Item Name', 'Shift', 'UOM', 'Standard Hours', 'Standard Target',
  'Target / Hour', 'Effective From', 'Effective To', 'Status',
  'Created By', 'Created At', 'Updated By', 'Updated At',
];

const TargetManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const isStacked = !screens.lg;
  const [targets, setTargets] = useState<MachineTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<string>('machineCode');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pdfing, setPdfing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [search, setSearch] = useState('');
  const [fMachineId, setFMachineId] = useState<string | undefined>();
  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fShift, setFShift] = useState<string | undefined>();
  const [fItem, setFItem] = useState<string | undefined>();
  const [fUom, setFUom] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();

  const [machines, setMachines] = useState<MachineLk[]>([]);
  const [shifts, setShifts] = useState<ShiftLk[]>([]);
  const [uoms, setUoms] = useState<UomLk[]>([]);
  const [items, setItems] = useState<ItemLk[]>([]);
  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<MachineTarget | null>(null);
  const [detail, setDetail] = useState<MachineTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<{
    target: MachineTarget;
    mode: 'create' | 'edit';
  } | null>(null);
  const [form] = Form.useForm();
  const formMachineId = Form.useWatch('machineId', form);
  const formItemId = Form.useWatch('itemId', form);
  const formShiftId = Form.useWatch('shiftId', form);
  const formHours = Form.useWatch('standardHours', form);
  const formQty = Form.useWatch('targetQuantity', form);
  const formUomId = Form.useWatch('uomId', form);
  const formStatus = Form.useWatch('status', form);
  const formEffectiveFrom = Form.useWatch('effectiveFrom', form) as dayjs.Dayjs | undefined;
  const formEffectiveTo = Form.useWatch('effectiveTo', form) as dayjs.Dayjs | undefined;
  const formRemarks = Form.useWatch('remarks', form) ?? '';

  const selectedMachine = useMemo(
    () => machines.find((m) => m.id === formMachineId) ?? null,
    [machines, formMachineId],
  );
  const selectedItem = useMemo(
    () => items.find((i) => i.id === formItemId) ?? null,
    [items, formItemId],
  );
  const selectedShift = useMemo(
    () => shifts.find((s) => s.id === formShiftId) ?? null,
    [shifts, formShiftId],
  );
  const selectedUom = useMemo(
    () => uoms.find((u) => u.id === formUomId) ?? null,
    [uoms, formUomId],
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

  /** Live right-side preview — single source of truth shared with the View modal. */
  const previewRecord: TargetRecord = useMemo(() => {
    return {
      machineNumber: selectedMachine?.machineNumber?.trim() || selectedMachine?.machineCode || null,
      machineCode: selectedMachine?.machineCode ?? null,
      machineSystemId: selectedMachine?.machineId ?? null,
      machineName: selectedMachine?.name ?? null,
      division: selectedMachine?.division?.name ?? null,
      section: selectedMachine?.section?.name ?? null,
      department: selectedMachine?.department?.name ?? null,
      itemCode: selectedItem?.itemCode ?? null,
      itemName: selectedItem?.name ?? null,
      shift: selectedShift?.shiftCode ?? null,
      shiftName: selectedShift?.name ?? null,
      uom: selectedUom?.code ?? null,
      status: (formStatus ?? 'ACTIVE') as string,
      targetQuantity: formQty !== undefined && formQty !== null ? Number(formQty) : null,
      standardHours: formHours !== undefined && formHours !== null ? Number(formHours) : null,
      perHour: perHourPreview,
      effectiveFrom: formEffectiveFrom?.isValid() ? formEffectiveFrom.format('YYYY-MM-DD') : null,
      effectiveTo: formEffectiveTo?.isValid() ? formEffectiveTo.format('YYYY-MM-DD') : null,
      remarks: formRemarks,
    };
  }, [
    selectedMachine, selectedItem, selectedShift, selectedUom, formStatus,
    formQty, formHours, perHourPreview, formEffectiveFrom, formEffectiveTo, formRemarks,
  ]);

  const toTargetRecord = useCallback((t: MachineTarget): TargetRecord => {
    const ph = calcPerHour(Number(t.targetQuantity), Number(t.standardHours));
    return {
      machineNumber: t.machine?.machineNumber || t.machine?.machineCode || null,
      machineCode: t.machine?.machineCode ?? null,
      machineSystemId: t.machine?.machineId ?? null,
      machineName: t.machine?.name ?? null,
      division: t.machine?.division?.name ?? null,
      section: t.machine?.section?.name ?? null,
      department: t.machine?.department?.name ?? null,
      itemCode: t.item?.itemCode ?? null,
      itemName: t.item?.name ?? null,
      shift: t.shift?.shiftCode ?? null,
      shiftName: t.shift?.name ?? null,
      uom: t.uom?.code ?? null,
      status: t.status ?? null,
      targetQuantity: t.targetQuantity ?? null,
      standardHours: t.standardHours ?? null,
      perHour: ph,
      effectiveFrom: t.effectiveFrom ?? null,
      effectiveTo: t.effectiveTo ?? null,
      remarks: t.remarks ?? null,
      createdBy: auditUserName(t.createdByUser, t.createdBy ?? null),
      createdAt: fmtDateTime(t.createdAt),
      updatedBy: auditUserName(t.updatedByUser, t.updatedBy ?? null),
      updatedAt: fmtDateTime(t.updatedAt),
    };
  }, []);

  const buildQuery = useCallback((params: Record<string, unknown>) => {
    if (search) params.search = search;
    if (fMachineId) params.machineId = fMachineId;
    if (fDivision) params.divisionId = fDivision;
    if (fSection) params.sectionId = fSection;
    if (fDepartment) params.departmentId = fDepartment;
    if (fShift) params.shiftId = fShift;
    if (fItem) params.itemId = fItem;
    if (fUom) params.uomId = fUom;
    if (fStatus) params.status = fStatus;
    return params;
  }, [search, fMachineId, fDivision, fSection, fDepartment, fShift, fItem, fUom, fStatus]);

  const fetchTargets = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    try {
      const params: any = buildQuery({ page: pageNum, limit: pageSize, sortBy, sortDir });
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
  }, [page, pageSize, sortBy, sortDir, buildQuery, message]);

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
        apiService.get<{ data: ItemLk[] }>('/master-data/items', { limit: 1000, status: 'ACTIVE' }),
      ]);
      const [mch, shf, div, sec, dep, uom, itm] = results;
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
      if (itm.status === 'fulfilled') {
        setItems((itm.value.data || []).filter((i) => i.isActive !== false && i.status !== 'INACTIVE'));
      } else {
        failed.push('item');
      }
      if (failed.length > 0) {
        message.warning(`Could not load ${failed.join(' / ')} lookups`);
      }
    })();
  }, [message]);

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

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (search.trim()) n += 1;
    if (fMachineId) n += 1;
    if (fDivision) n += 1;
    if (fSection) n += 1;
    if (fDepartment) n += 1;
    if (fShift) n += 1;
    if (fItem) n += 1;
    if (fUom) n += 1;
    if (fStatus) n += 1;
    return n;
  }, [search, fMachineId, fDivision, fSection, fDepartment, fShift, fItem, fUom, fStatus]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ standardHours: 8, effectiveFrom: dayjs() });
    setModalVisible(true);
  };

  const openEdit = (t: MachineTarget) => {
    setEditing(t);
    form.setFieldsValue({
      machineId: t.machineId,
      shiftId: t.shiftId,
      itemId: t.itemId ?? undefined,
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

  /** Closing the form modal never discards data silently when the user typed something. */
  const handleModalCancel = () => {
    if (!form.isFieldsTouched()) {
      setModalVisible(false);
      return;
    }
    modal.confirm({
      title: editing ? 'Discard changes?' : 'Discard this draft?',
      content: 'The unsaved target will be lost. Are you sure you want to close?',
      okText: 'Discard',
      okButtonProps: { danger: true },
      cancelText: 'Keep Editing',
      onOk: () => setModalVisible(false),
    });
  };

  /** On create, default standard hours to the selected shift's planned hours from Shift Master. */
  const handleShiftChange = (shiftId: string | undefined) => {
    if (editing || !shiftId) return;
    const s = shifts.find((x) => x.id === shiftId);
    const hours = Number(s?.plannedHours);
    if (isFinite(hours) && hours > 0) form.setFieldsValue({ standardHours: hours });
  };

  const handleSave = async () => {
    if (saving) return;
    try {
      const values = await form.validateFields();
      const payload: any = {
        machineId: values.machineId,
        shiftId: values.shiftId,
        itemId: values.itemId,
        uomId: values.uomId,
        standardHours: values.standardHours,
        targetQuantity: values.targetQuantity,
        effectiveFrom: values.effectiveFrom.format('YYYY-MM-DD'),
        effectiveTo: values.effectiveTo ? values.effectiveTo.format('YYYY-MM-DD') : null,
        status: values.status ?? 'ACTIVE',
        remarks: values.remarks || null,
      };
      setSaving(true);
      let saved: MachineTarget;
      if (editing) {
        saved = await apiService.put<MachineTarget>(`/production/machine-targets/${editing.id}`, payload);
      } else {
        saved = await apiService.post<MachineTarget>('/production/machine-targets', payload);
      }
      // Reached only after the backend confirms the record — failures fall into catch below.
      setModalVisible(false);
      setSaveSuccess({ target: saved, mode: editing ? 'edit' : 'create' });
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
    setFItem(undefined);
    setFUom(undefined);
    setFStatus(undefined);
    setShowFilters(false);
    setPage(1);
    setSortBy('machineCode');
    setSortDir('ASC');
  };

  const uomSymbolOf = (t: MachineTarget) => t.uom?.code ?? '';

  const collectFilteredTargets = async (): Promise<MachineTarget[]> => {
    const params: any = buildQuery({ page: 1, limit: EXPORT_LIMIT, sortBy, sortDir });
    const response = await apiService.get<{ data: MachineTarget[] }>('/production/machine-targets', params);
    return response.data || [];
  };

  const targetToExportRow = (t: MachineTarget): Array<string | number | null> => {
    const ph = calcPerHour(Number(t.targetQuantity), Number(t.standardHours));
    return [
      t.machine?.machineNumber ?? '', t.machine?.machineCode ?? '', t.machine?.name ?? '',
      t.machine?.division?.name ?? '', t.machine?.section?.name ?? '', t.machine?.department?.name ?? '',
      t.item?.itemCode ?? '', t.item?.name ?? '',
      t.shift?.shiftCode ?? '', t.uom?.code ?? '',
      fmtQty(t.standardHours), fmtQty(t.targetQuantity),
      ph !== null ? `${fmtQty(ph)} ${uomSymbolOf(t)}/h` : '',
      t.effectiveFrom ?? '', t.effectiveTo ?? '', t.status ?? '',
      auditUserName(t.createdByUser, t.createdBy ?? null), fmtDateTime(t.createdAt),
      auditUserName(t.updatedByUser, t.updatedBy ?? null), fmtDateTime(t.updatedAt),
    ];
  };

  const filterSummary = () => {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    if (fMachineId) {
      const m = machines.find((x) => x.id === fMachineId);
      parts.push(`Machine: ${m ? `${m.machineCode} · ${m.name}` : fMachineId}`);
    }
    if (fDivision) parts.push(`Division: ${divisions.find((d) => d.id === fDivision)?.name ?? fDivision}`);
    if (fSection) parts.push(`Section: ${sections.find((s) => s.id === fSection)?.name ?? fSection}`);
    if (fDepartment) parts.push(`Department: ${departments.find((d) => d.id === fDepartment)?.name ?? fDepartment}`);
    if (fShift) parts.push(`Shift: ${shifts.find((s) => s.id === fShift)?.shiftCode ?? fShift}`);
    if (fItem) parts.push(`Item: ${items.find((i) => i.id === fItem)?.itemCode ?? fItem}`);
    if (fUom) parts.push(`UOM: ${uoms.find((u) => u.id === fUom)?.code ?? fUom}`);
    if (fStatus) parts.push(`Status: ${fStatus}`);
    return parts.length ? parts.join('   |   ') : 'All targets';
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const rows = await collectFilteredTargets();
      downloadText(
        `machine-targets-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(EXPORT_HEADERS, rows.map(targetToExportRow)),
      );
      message.success(`Exported ${rows.length} targets`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintReport = async () => {
    setPrinting(true);
    try {
      const rows = await collectFilteredTargets();
      const w = window.open('', '_blank', 'width=1100,height=760');
      if (!w) {
        message.error('Popup blocked. Allow popups to print.');
        return;
      }
      const bodyRows = rows
        .map((r) => `<tr>
          <td><b>${r.machine?.machineNumber || r.machine?.machineCode || ''}</b></td>
          <td>${r.machine?.machineCode ?? ''}</td><td>${r.machine?.name ?? ''}</td>
          <td>${r.machine?.division?.name ?? ''}</td><td>${r.machine?.section?.name ?? ''}</td>
          <td>${r.machine?.department?.name ?? ''}</td>
          <td>${r.item?.itemCode ?? ''}</td><td>${r.item?.name ?? ''}</td>
          <td>${r.shift?.shiftCode ?? ''}</td><td>${r.uom?.code ?? ''}</td>
          <td class="num">${fmtQty(r.standardHours)}</td>
          <td class="num">${fmtQty(r.targetQuantity)}</td>
          <td>${r.effectiveFrom ?? ''}</td><td>${r.effectiveTo ?? 'open'}</td>
          <td class="status ${String(r.status).toLowerCase()}">${r.status ?? ''}</td>
        </tr>`)
        .join('');
      w.document.write(`<!DOCTYPE html>
<html><head><title>Machine Targets Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; }
  h1 { font-size: 18px; margin: 0; }
  .meta { font-size: 11px; color: #666; margin-top: 4px; }
  .filters { font-size: 12px; margin: 12px 0 16px; background: #f5f6f8; border-radius: 6px; padding: 8px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f0f1f3; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .num { text-align: right; }
  .status.active { color: #1a7f37; font-weight: 600; }
  .status.inactive { color: #c0392b; font-weight: 600; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head><body>
  <h1>Machine Targets Report</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} &nbsp;&middot;&nbsp; ${rows.length} target(s)</div>
  <div class="filters"><b>Filters:</b> ${filterSummary()}</div>
  <table>
    <thead><tr><th>Machine Number</th><th>Code</th><th>Machine Name</th><th>Division</th><th>Section</th><th>Department</th><th>Item Code</th><th>Item Name</th><th>Shift</th><th>UOM</th><th class="num">Hours</th><th class="num">Target</th><th>From</th><th>To</th><th>Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="15" style="text-align:center;color:#999">No targets found</td></tr>'}</tbody>
  </table>
<script>window.onload = function () { window.print(); };</script>
</body></html>`);
      w.document.close();
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Print failed');
    } finally {
      setPrinting(false);
    }
  };

  const handleExportPdf = async () => {
    setPdfing(true);
    try {
      const rows = await collectFilteredTargets();
      if (!rows.length) {
        message.info('No targets to export to PDF');
        return;
      }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Machine Targets Master Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString()} \u00B7 ${rows.length} target(s)`, 40, 56);
      doc.text(`Filters: ${filterSummary()}`, 40, 70);
      const head = [['Machine No', 'Code', 'Machine Name', 'Division', 'Section', 'Department', 'Item Code', 'Item Name', 'Shift', 'UOM', 'Hours', 'Target', 'From', 'To', 'Status']];
      const body = rows.map((r) => [
        r.machine?.machineNumber ?? '', r.machine?.machineCode ?? '', r.machine?.name ?? '',
        r.machine?.division?.name ?? '', r.machine?.section?.name ?? '', r.machine?.department?.name ?? '',
        r.item?.itemCode ?? '', r.item?.name ?? '', r.shift?.shiftCode ?? '', r.uom?.code ?? '',
        fmtQty(r.standardHours), fmtQty(r.targetQuantity), r.effectiveFrom ?? '', r.effectiveTo ?? 'open', r.status ?? '',
      ]);
      autoTable(doc, {
        head,
        body,
        startY: 84,
        styles: { fontSize: 8, cellPadding: 4 },
        headStyles: { fillColor: [31, 41, 55], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
      doc.save(`machine-targets-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success(`Exported ${rows.length} targets to PDF`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'PDF export failed');
    } finally {
      setPdfing(false);
    }
  };

  const exportMenu: MenuProps['items'] = [
    { key: 'csv', icon: <DownloadOutlined />, label: 'Excel-compatible CSV' },
    { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF Report' },
    { key: 'print', icon: <PrinterOutlined />, label: 'Print Report' },
  ];
  const onExportMenu: MenuProps['onClick'] = ({ key }) => {
    if (key === 'pdf') handleExportPdf();
    else if (key === 'print') handlePrintReport();
    else handleExportCsv();
  };

  /* ─── Import handlers ────────────────────────────────────────────────────── */

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const parsed = parseImportCsv(text);
    if (parsed.length < 2) {
      message.error('The file appears to be empty or has no data rows.');
      return false;
    }
    const header = parsed[0].map((h) => h.trim());
    const normHeader = header.map((h) => h.toLowerCase().replace(/[\s_-]+/g, ''));

    const required = ['machinecode', 'shiftcode', 'uomcode', 'standardtarget', 'standardhours', 'effectivefrom'];
    const missing = required.filter((c) => !normHeader.includes(c));
    if (missing.length > 0) {
      message.error(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected format.`);
      return false;
    }

    const headerMap: Record<string, number> = {};
    header.forEach((h, i) => { headerMap[h.toLowerCase().replace(/[\s_-]+/g, '')] = i; });
    const get = (data: string[], field: string): string => {
      const idx = headerMap[field];
      return idx !== undefined ? (data[idx] ?? '').trim() : '';
    };

    const validated: ImportRow[] = parsed.slice(1).map((cells, idx) => {
      const data: Record<string, string> = {};
      header.forEach((h, i) => {
        const val = cells[i] ?? '';
        data[h] = val;
        data[h.toLowerCase().replace(/[\s_-]+/g, '')] = val;
      });
      const errors: string[] = [];
      if (!get(cells, 'machinecode') && !get(cells, 'machinenumber')) errors.push('Machine Code is required');
      if (!get(cells, 'shiftcode')) errors.push('Shift Code is required');
      if (!get(cells, 'uomcode') && !get(cells, 'uom')) errors.push('UOM Code is required');
      const targetStr = get(cells, 'standardtarget') || get(cells, 'targetquantity') || get(cells, 'target');
      const target = Number(targetStr);
      if (!targetStr || !(target > 0)) errors.push('Standard Target must be > 0');
      const hoursStr = get(cells, 'standardhours') || get(cells, 'hours');
      const hours = Number(hoursStr);
      if (!hoursStr || !(hours > 0) || hours > 24) errors.push('Standard Hours must be 0.01–24');
      const from = get(cells, 'effectivefrom') || get(cells, 'fromdate');
      if (!from) errors.push('Effective From is required');
      else if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) errors.push('Effective From must be YYYY-MM-DD');
      const to = get(cells, 'effectiveto') || get(cells, 'todate');
      if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) errors.push('Effective To must be YYYY-MM-DD');
      if (to && from && to <= from) errors.push('Effective To must be after Effective From');
      const st = (get(cells, 'status') || 'ACTIVE').toUpperCase();
      if (st !== 'ACTIVE' && st !== 'INACTIVE') errors.push(`Invalid status '${st}'`);

      return {
        rowNumber: idx + 2,
        data,
        status: errors.length > 0 ? 'INVALID' : 'VALID',
        errors,
      };
    });

    setImportFileName(file.name);
    setImportRows(validated);
    setImportSummary(null);
    return false;
  };

  const runImport = async () => {
    const validRows = importRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const header = Object.keys(importRows[0].data);
      const csvLines = [header.join(',')];
      for (const row of importRows) {
        csvLines.push(header.map((h) => {
          const v = row.data[h] ?? '';
          return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        }).join(','));
      }
      const csvText = csvLines.join('\r\n');
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
      const fd = new FormData();
      fd.append('file', blob, importFileName || 'import.csv');

      const res = await apiService.upload<{
        totalRows: number;
        imported: number;
        failed: number;
        results: Array<{ row: number; status: string; message: string }>;
      }>('/production/machine-targets/import', fd);

      setImportSummary({
        total: res.totalRows,
        valid: validRows.length,
        invalid: importRows.filter((r) => r.status === 'INVALID').length,
        duplicate: 0,
        imported: res.imported,
        failed: res.failed,
        skipped: 0,
        errors: res.results.filter((r) => r.status === 'error').map((r) => `Row ${r.row}: ${r.message}`),
      });
      fetchTargets(1);
      setPage(1);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setImportOpen(false);
    setImportRows([]);
    setImportSummary(null);
    setImportFileName(null);
  };

  const columns: ColumnsType<MachineTarget> = [
    {
      title: <HeaderCell icon={<TagOutlined />} first="MACHINE" second="ID" />,
      key: 'machineId',
      width: 80,
      fixed: 'left',
      render: (_: any, t: MachineTarget) => (
        <Tooltip title={t.machine?.machineId ?? 'No Machine ID'}>
          <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted)', cursor: 'default' }}>
            {t.machine?.machineId ?? '—'}
          </code>
        </Tooltip>
      ),
    },
    {
      title: <HeaderCell icon={<SettingOutlined />} first="Machine" />,
      key: 'machineCode',
      sorter: true,
      width: 100,
      render: (_: any, t: MachineTarget) => {
        const number = t.machine?.machineNumber?.trim() || t.machine?.machineCode || null;
        const code = t.machine?.machineCode;
        const secondary = code && code !== number ? code : null;
        const mc = getMachineColor(t.machine);
        return (
          <Tooltip
            title={
              <div>
                <div style={{ fontWeight: 600 }}>{t.machine?.name ?? 'Machine'}</div>
                {t.machine?.machineId ? <div style={{ fontSize: 11, opacity: 0.85 }}>System ID: {t.machine.machineId}</div> : null}
                {t.machine?.division ? <div style={{ fontSize: 11, opacity: 0.85 }}>Division: {t.machine.division.name}</div> : null}
              </div>
            }
          >
            <div style={{ lineHeight: 1.35 }}>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '0 5px',
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 11,
                  color: mc.light.text,
                  background: mc.light.bg,
                  border: `1px solid ${mc.light.border}`,
                }}>{number ?? '—'}</span>
              </div>
              {secondary ? <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500, marginTop: 1 }}>{secondary}</div> : null}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: <HeaderCell icon={<ApartmentOutlined />} first="Machine" second="Name" />,
      key: 'machineName',
      sorter: true,
      width: 120,
      render: (_: any, t: MachineTarget) => {
        const mc = getMachineColor(t.machine);
        return t.machine?.name ? (
          <HighlightedCell
            icon={<SettingOutlined />}
            label={t.machine.name}
            labelColor={mc.light.text}
            tooltip={t.machine.name + (t.machine.machineId ? ` (ID: ${t.machine.machineId})` : '')}
          />
        ) : (
          <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
        );
      },
    },
    {
      title: <HeaderCell icon={<ShopOutlined />} first="Division" second="Section" />,
      key: 'divisionSection',
      width: 130,
      render: (_: any, t: MachineTarget) => {
        const d = t.machine?.division;
        const s = t.machine?.section;
        if (!d && !s) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        return (
          <HighlightedCell
            icon={<ShopOutlined />}
            label={d?.name ?? '—'}
            secondary={s?.name ?? '—'}
            secondaryPrefix={s ? <SubnodeOutlined style={{ marginRight: 3, fontSize: 9 }} /> : null}
            tooltip={d?.name ? (s ? `${d.name} — ${s.name}` : d.name) : undefined}
          />
        );
      },
    },
    {
      title: <HeaderCell icon={<TeamOutlined />} first="Department" />,
      key: 'department',
      width: 100,
      render: (_: any, t: MachineTarget) => {
        const dept = t.machine?.department;
        return dept ? (
          <HighlightedCell
            icon={<TeamOutlined />}
            label={dept.name}
            tooltip={dept.name}
          />
        ) : (
          <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
        );
      },
    },
    {
      title: <HeaderCell icon={<ShoppingOutlined />} first="Item" />,
      key: 'itemCode',
      sorter: true,
      width: 130,
      render: (_: any, t: MachineTarget) => {
        const best = t.item
          ? { id: t.item.id, name: t.item.name, itemCode: t.item.itemCode }
          : null;
        return best ? (
          <HighlightedCell
            icon={<ShoppingOutlined />}
            label={best.itemCode}
            secondary={best.name && best.name !== best.itemCode ? best.name : undefined}
            tooltip={best.name ? `${best.itemCode} — ${best.name}` : best.itemCode}
          />
        ) : (
          <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
        );
      },
    },
    {
      title: <HeaderCell icon={<ClockCircleOutlined />} first="Shift" />,
      key: 'shiftCode',
      sorter: true,
      width: 95,
      render: (_: any, t: MachineTarget) => {
        const s = t.shift;
        return s ? (
          <HighlightedCell
            icon={<ClockCircleOutlined />}
            label={s.shiftCode || s.name}
            secondary={s.shiftCode && s.shiftCode !== s.name ? s.name : undefined}
            tooltip={s.name ? `${s.shiftCode} — ${s.name}` : s.shiftCode}
          />
        ) : (
          <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
        );
      },
    },
    {
      title: <HeaderCell icon={<SafetyOutlined />} first="UOM" />,
      key: 'uomCode',
      sorter: true,
      width: 48,
      render: (_: any, t: MachineTarget) => <Tag style={{ fontSize: 10 }}>{uomSymbolOf(t)}</Tag>,
    },
    {
      title: <HeaderCell icon={<HourglassOutlined />} first="Std" second="Hours" />,
      dataIndex: 'standardHours',
      sorter: true,
      width: 65,
      align: 'right',
      render: (h: string | number) => <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 11 }}>{fmtQty(h)}</span>,
    },
    {
      title: <HeaderCell icon={<AimOutlined />} first="Standard" second="Target" />,
      dataIndex: 'targetQuantity',
      sorter: true,
      width: 140,
      render: (q: string | number, t: MachineTarget) => {
        const ph = calcPerHour(Number(t.targetQuantity), Number(t.standardHours));
        const u = uomSymbolOf(t);
        return (
          <HighlightedCell
            icon={<AimOutlined />}
            label={<>{fmtQty(q)} <span style={{ fontSize: 10, fontWeight: 600 }}>{u}</span></>}
            secondary={ph !== null ? <>{fmtQty(ph)} {u}/h</> : '—'}
            secondarySize={11}
            secondaryWeight={600}
            tooltip="Standard target over the standard hours. Target / hour is auto-calculated: target ÷ hours."
          />
        );
      },
    },
    {
      title: <HeaderCell icon={<CalendarOutlined />} first="Effective" second="From" />,
      dataIndex: 'effectiveFrom',
      sorter: true,
      width: 95,
      render: (from: string, t: MachineTarget) => (
        <div style={{ fontSize: 11 }}>
          <div>{from}</div>
          <span style={{ color: 'var(--theme-text-secondary)', fontSize: 10 }}>
            → {t.effectiveTo ?? 'open'}
          </span>
        </div>
      ),
    },
    {
      title: <HeaderCell icon={<CheckCircleOutlined />} first="Status" />,
      dataIndex: 'status',
      sorter: true,
      width: 68,
      render: (s: string) => <StatusBadge status={s} colorMap={STATUS_COLORS} />,
    },
    {
      title: <HeaderCell icon={<UserOutlined />} first="Created" second="By" />,
      key: 'createdAudit',
      width: 115,
      render: (_: any, t: MachineTarget) => (
        <div style={{ fontSize: 10 }}>
          <div style={{ fontWeight: 600 }}>{auditUserName(t.createdByUser, t.createdBy ?? null)}</div>
          <span style={{ color: 'var(--theme-text-secondary)' }}>{fmtDateTime(t.createdAt)}</span>
        </div>
      ),
    },
    {
      title: <HeaderCell icon={<UserOutlined />} first="Updated" second="By" />,
      key: 'updatedAudit',
      width: 115,
      render: (_: any, t: MachineTarget) => (
        <div style={{ fontSize: 10 }}>
          <div style={{ fontWeight: 600 }}>{auditUserName(t.updatedByUser, t.updatedBy ?? null)}</div>
          <span style={{ color: 'var(--theme-text-secondary)' }}>{fmtDateTime(t.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: <HeaderCell first="Actions" />,
      key: 'actions',
      width: 160,
      fixed: 'right',
      align: 'center',
      render: (_: any, t: MachineTarget) => {
        const machineLabel = t.machine?.machineCode || t.machine?.name || t.machine?.machineNumber || 'this record';
        return (
          <TableActions
            className="erp-table-actions--machine-targets"
            actions={[
              {
                key: 'view',
                label: `View target — ${machineLabel}`,
                icon: <EyeOutlined />,
                onClick: () => setDetail(t),
                className: 'mt-act-view',
              },
              {
                key: 'edit',
                label: `Edit target — ${machineLabel}`,
                icon: <EditOutlined />,
                onClick: () => openEdit(t),
                className: 'mt-act-edit',
              },
              {
                key: 'toggle',
                label: t.status === 'ACTIVE' ? 'Deactivate target' : 'Activate target',
                icon: t.status === 'ACTIVE' ? <StopOutlined /> : <CheckCircleOutlined />,
                onClick: () => handleStatusToggle(t),
                className: t.status === 'ACTIVE' ? 'mt-act-deactivate' : 'mt-act-activate',
              },
              {
                key: 'delete',
                label: 'Delete target',
                icon: <DeleteOutlined />,
                danger: true,
                className: 'mt-act-delete',
                confirm: {
                  title: `Delete target for '${machineLabel}'?`,
                  description: 'The record is soft-deleted and hidden from lists.',
                  onConfirm: () => handleDelete(t),
                },
              },
            ]}
          />
        );
      },
    },
  ];

  const sortInfo = `Sorted by ${SORT_LABELS[sortBy] ?? sortBy} (${sortDir.toLowerCase()})`;

  const modalW = isMobile
    ? Math.max(360, Math.min(940, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 24))
    : 1240;
  const viewW = isMobile
    ? Math.max(360, Math.min(860, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 24))
    : 800;

  return (
    <div style={{ padding: '4px 6px', width: '100%' }}>
      <PageHeader
        icon={<ToolOutlined />}
        title="Machine Targets"
        subtitle="Production targets per machine & shift — Master Data"
        showBreadcrumbs
        style={{ marginBottom: 8 }}
        extra={
          <>
            <Tooltip title="Refresh">
              <Button size="middle" icon={<ReloadOutlined />} onClick={() => fetchTargets(page)} />
            </Tooltip>
            <Dropdown menu={{ items: exportMenu, onClick: onExportMenu }}>
              <Button size="middle" icon={<DownloadOutlined />} loading={exporting || pdfing || printing}>
                Export
              </Button>
            </Dropdown>
            <Tooltip title="Import targets from CSV file">
              <Button size="middle" icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
                Import
              </Button>
            </Tooltip>
            <Button size="middle" type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Target
            </Button>
          </>
        }
      />

      <PageToolbar
        searchValue={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search machine / item code or name…"
        filterCount={activeFilterCount}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters((f) => !f)}
        onClearFilters={resetFilters}
        hasActiveFilters={activeFilterCount > 0}
        sortInfo={sortInfo}
      />

      {showFilters && (
        <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '16px 16px 18px' } }}>
          <div style={{ display: 'grid', gridTemplateColumns: screens.md ? 'repeat(auto-fit, minmax(170px, 1fr))' : '1fr', gap: 10, alignItems: 'center' }}>
            <Select
              allowClear showSearch optionFilterProp="label"
              placeholder="Machine" value={fMachineId} style={{ width: '100%' }}
              options={machines.map((m) => ({
                value: m.id,
                label: `${m.machineCode} — ${m.name}${m.machineId ? ` (${m.machineId})` : ''}`,
              }))}
              onChange={(v) => { setFMachineId(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Division" value={fDivision} style={{ width: '100%' }}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear placeholder="Section" value={fSection} style={{ width: '100%' }}
              options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
              disabled={!!fDivision && sectionsForDivision(fDivision).length === 0}
            />
            <Select
              allowClear placeholder="Department" value={fDepartment} style={{ width: '100%' }}
              options={departmentsForScope(fDivision, fSection).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Shift" value={fShift} style={{ width: '100%' }}
              options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} · ${s.name}` }))}
              onChange={(v) => { setFShift(v); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label"
              placeholder="Item" value={fItem} style={{ width: '100%' }}
              options={items.map((i) => ({ value: i.id, label: `${i.itemCode} — ${i.name}` }))}
              onChange={(v) => { setFItem(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="UOM" value={fUom} style={{ width: '100%' }}
              options={uoms.map((u) => ({ value: u.id, label: u.code }))}
              onChange={(v) => { setFUom(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Status" value={fStatus} style={{ width: '100%' }}
              options={['ACTIVE', 'INACTIVE'].map((s) => ({ value: s, label: s }))}
              onChange={(v) => { setFStatus(v); setPage(1); }}
            />
            <Button icon={<ClearOutlined />} onClick={resetFilters}>
              Clear Filters
            </Button>
          </div>
        </Card>
      )}

      <ERPTable
        rowKey="id"
        dense
        columns={columns}
        dataSource={targets}
        loading={loading}
        scroll={{ x: 1600 }}
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
              itemCode: 'itemCode',
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
          } else {
            setSortBy('machineCode');
            setSortDir('ASC');
          }
        }}
        emptyTitle="No machine targets found"
        emptyDescription="Try adjusting the search or filters, or add a new target with the header button."
      />

      <DraggableResizableModal
        open={modalVisible}
        onCancel={handleModalCancel}
        width={modalW}
        height={isStacked ? 780 : 700}
        minWidth={isMobile ? 360 : 720}
        minHeight={520}
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <AimOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            {editing ? 'Edit Machine Target' : 'Add Machine Target'}
          </span>
        }
        subtitle={editing?.machine ? `${editing.machine.machineCode} · ${editing.machine.name}` : 'Machine Targets · Master Data'}
        footer={
          <Space>
            <Button onClick={handleModalCancel}>Cancel</Button>
            <Button
              type="primary"
              icon={editing ? <EditOutlined /> : <PlusOutlined />}
              loading={saving}
              disabled={saving}
              onClick={handleSave}
            >
              {editing ? 'Save Changes' : 'Create Target'}
            </Button>
          </Space>
        }
        styles={{ body: { overflow: 'hidden', padding: 0, position: 'relative' } }}
      >
        <div style={{ position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: isStacked ? '1fr' : '1.08fr 1fr' }}>
          <div className="edit-form-scroll" style={{ overflowY: 'auto', padding: '16px 20px 20px' }}>
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
                  <Descriptions size="small" column={isMobile ? 1 : 2}>
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

              <Form.Item
                name="itemId"
                label="Item"
                tooltip="The produced item this target applies to (from Item Master)"
                rules={[{ required: true, message: 'Select an item from the Item Master' }]}
                style={{ marginTop: 16 }}
              >
                <Select
                  showSearch optionFilterProp="label"
                  placeholder="Select item (from Item Master)"
                  options={items.map((i) => ({
                    value: i.id,
                    label: `${i.itemCode} — ${i.name}`,
                  }))}
                />
              </Form.Item>

              {selectedItem && (
                <Card size="small" style={{ marginBottom: 16, background: 'var(--theme-surface-alt)' }} title={<span><AimOutlined /> Selected Item</span>}>
                  <Descriptions size="small" column={isMobile ? 1 : 2}>
                    <Descriptions.Item label="Code">{selectedItem.itemCode}</Descriptions.Item>
                    <Descriptions.Item label="Name">{selectedItem.name}</Descriptions.Item>
                    <Descriptions.Item label="Base UOM">
                      {uoms.find((u) => u.id === selectedItem.baseUomId)?.code ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Weight / Piece">{fmtQty(selectedItem.weightPerPiece)}</Descriptions.Item>
                    <Descriptions.Item label="Pieces / KG">{fmtQty(selectedItem.piecesPerKg)}</Descriptions.Item>
                    <Descriptions.Item label="Weight / Meter">{fmtQty(selectedItem.weightPerMeter)}</Descriptions.Item>
                    <Descriptions.Item label="Length / Piece">{fmtQty(selectedItem.lengthPerPiece)}</Descriptions.Item>
                  </Descriptions>
                  {(Number(selectedItem.piecesPerKg) > 0 || Number(selectedItem.weightPerPiece) > 0
                    || Number(selectedItem.weightPerMeter) > 0 || Number(selectedItem.lengthPerPiece) > 0) ? (
                    <Alert
                      type="success"
                      showIcon
                      style={{ marginTop: 8 }}
                      message="Conversion master data found — KG / PCS / METER targets are validated against it on save."
                    />
                  ) : (
                    <Alert
                      type="warning"
                      showIcon
                      style={{ marginTop: 8 }}
                      message="No conversion data on this item — only targets in the item's base unit family will be accepted."
                    />
                  )}
                </Card>
              )}

              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="shiftId"
                    label="Shift"
                    rules={[{ required: true, message: 'Select a shift' }]}
                  >
                    <Select
                      showSearch optionFilterProp="label"
                      placeholder="e.g. SHIFT-A / GENERAL"
                      onChange={handleShiftChange}
                      options={shifts.map((s) => ({ value: s.id, label: `${s.shiftCode} · ${s.name}` }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="uomId"
                    label="UOM (production unit)"
                    tooltip="Only KG, PCS and METER are allowed for production targets"
                    rules={[{ required: true, message: 'Select a production UOM' }]}
                  >
                    <Select
                      placeholder="KG / PCS / METER"
                      options={uoms.map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` }))}
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="targetQuantity"
                    label="Standard Target"
                    tooltip="Production quantity over the standard hours"
                    rules={[
                      { required: true, message: 'Standard target is required' },
                      { type: 'number', min: 0.0001, message: 'Must be greater than 0' },
                    ]}
                  >
                    <InputNumber min={0.0001} step={1} style={{ width: '100%' }} placeholder="e.g. 5000" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="standardHours"
                    label="Standard Hours"
                    tooltip={`Working hours the target is based on (max ${MAX_STANDARD_HOURS})`}
                    rules={[
                      { required: true, message: 'Standard hours are required' },
                      { type: 'number', min: 0.01, max: MAX_STANDARD_HOURS, message: `Between 0.01 and ${MAX_STANDARD_HOURS}` },
                    ]}
                  >
                    <InputNumber min={0.01} max={MAX_STANDARD_HOURS} step={0.5} style={{ width: '100%' }} placeholder="e.g. 8" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label="Target Per Hour (auto)">
                <Input
                  disabled
                  value={perHourPreview !== null ? `${fmtQty(perHourPreview)}${previewUomLabel ? ` ${previewUomLabel}` : ''}/h` : ''}
                  placeholder="Auto-calculated"
                />
                <Text type="secondary" style={{ fontSize: 12 }}>Auto-calculated as target ÷ standard hours.</Text>
              </Form.Item>

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

              <Row gutter={[12, 0]}>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="status"
                    label="Status"
                    initialValue="ACTIVE"
                  >
                    <Select options={['ACTIVE', 'INACTIVE'].map((s) => ({ value: s, label: s }))} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item
                    name="effectiveFrom"
                    label="Effective From"
                    rules={[{ required: true, message: 'Effective from date is required' }]}
                  >
                    <DatePicker style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

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
              >
                <DatePicker style={{ width: '100%' }} placeholder="(open-ended)" />
              </Form.Item>

              <Form.Item name="remarks" label="Remarks">
                <Input.TextArea rows={2} maxLength={2000} />
              </Form.Item>
            </Form>
          </div>

          <div style={{ overflow: 'hidden', padding: '16px 14px 20px', minHeight: 0, background: 'var(--theme-surface-alt, #f7f9fb)', borderLeft: isStacked ? 'none' : '1px solid #edf0f4' }}>
            <TargetView record={previewRecord} live />
          </div>
        </div>
      </DraggableResizableModal>

      <DraggableResizableModal
        open={!!detail}
        onCancel={() => setDetail(null)}
        width={viewW}
        height={680}
        minWidth={isMobile ? 360 : 520}
        minHeight={500}
        wrapClassName="view-target-modal"
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <EyeOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Target Details
          </span>
        }
        subtitle={detail ? `${detail.machine?.machineCode ?? ''} · ${detail.item?.itemCode ?? ''} · ${detail.shift?.shiftCode ?? ''}` : undefined}
        extra={
          detail && (
            <Button type="primary" icon={<EditOutlined />} onClick={() => { const d = detail; setDetail(null); openEdit(d); }}>
              Edit
            </Button>
          )
        }
        footer={
          <Space>
            <Button onClick={() => setDetail(null)}>Close</Button>
          </Space>
        }
      >
        {detail ? (
          <div style={{ padding: 4 }}>
            <TargetView record={toTargetRecord(detail)} showAudit />
          </div>
        ) : null}
      </DraggableResizableModal>

      <DraggableResizableModal
        open={importOpen}
        onCancel={closeImport}
        width={960}
        height={620}
        minWidth={640}
        minHeight={480}
        footer={
          importSummary ? (
            <Button type="primary" onClick={closeImport}>Done</Button>
          ) : importRows.length > 0 ? (
            [
              <Button key="back" onClick={() => { setImportRows([]); setImportFileName(null); }}>Choose another file</Button>,
              <Button
                key="import"
                type="primary"
                disabled={importRows.every((r) => r.status !== 'VALID')}
                loading={importing}
                onClick={runImport}
              >
                Import {importRows.filter((r) => r.status === 'VALID').length} valid row(s)
              </Button>,
            ]
          ) : (
            <Button type="primary" onClick={closeImport}>Close</Button>
          )
        }
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ImportOutlined style={{ color: 'var(--theme-accent, #10b981)' }} />
            Import Machine Targets
          </span>
        }
        subtitle="Bulk import from CSV — Machine Code, Shift Code, UOM Code, Standard Target, Effective From"
        styles={{ body: { overflow: 'auto' } }}
      >
        {importRows.length === 0 && !importSummary && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="info"
              showIcon
              message="CSV import with validation and preview"
              description="Upload a CSV file with machine target data. Each row is validated before import. Invalid rows will be rejected."
              style={{ marginBottom: 16 }}
            />
            <Space style={{ marginBottom: 16 }}>
              <Button icon={<DownloadOutlined />} onClick={downloadImportTemplate}>
                Download Template
              </Button>
            </Space>
            <Upload.Dragger
              name="file"
              accept=".csv,.txt"
              maxCount={1}
              showUploadList={false}
              beforeUpload={handleImportFile}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">Click or drag a CSV file here</p>
              <p className="ant-upload-hint">
                Required columns: Machine Code, Shift Code, UOM Code, Standard Target, Standard Hours, Effective From.
                Optional: Item Code, Effective To, Status, Remarks.
              </p>
            </Upload.Dragger>
          </div>
        )}

        {importRows.length > 0 && !importSummary && (
          <div>
            <Alert
              type="info"
              showIcon
              message={`Preview: ${importFileName}`}
              description={
                <span>
                  Total rows: <b>{importRows.length}</b> ·{' '}
                  Valid: <b style={{ color: '#1a7f37' }}>{importRows.filter((r) => r.status === 'VALID').length}</b> ·{' '}
                  Invalid: <b style={{ color: '#c0392b' }}>{importRows.filter((r) => r.status === 'INVALID').length}</b>
                </span>
              }
              style={{ marginBottom: 12 }}
            />
            <Table
              rowKey="rowNumber"
              size="small"
              dataSource={importRows}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              columns={[
                { title: 'Row', dataIndex: 'rowNumber', width: 50 },
                {
                  title: 'Machine Code', width: 120,
                  render: (_: unknown, r: ImportRow) => <b>{r.data['machineCode'] || r.data['Machine Code'] || r.data['machinecode'] || ''}</b>,
                },
                { title: 'Shift', width: 90, render: (_: unknown, r: ImportRow) => r.data['shiftCode'] || r.data['Shift Code'] || r.data['shiftcode'] || '' },
                { title: 'UOM', width: 60, render: (_: unknown, r: ImportRow) => r.data['uomCode'] || r.data['UOM Code'] || r.data['uomcode'] || r.data['uom'] || '' },
                { title: 'Item', width: 100, render: (_: unknown, r: ImportRow) => r.data['itemCode'] || r.data['Item Code'] || r.data['itemcode'] || '—' },
                { title: 'Target', width: 80, render: (_: unknown, r: ImportRow) => r.data['standardTarget'] || r.data['Standard Target'] || r.data['standardtarget'] || r.data['target'] || '' },
                { title: 'Hours', width: 60, render: (_: unknown, r: ImportRow) => r.data['standardHours'] || r.data['Standard Hours'] || r.data['standardhours'] || r.data['hours'] || '' },
                { title: 'From', width: 90, render: (_: unknown, r: ImportRow) => r.data['effectiveFrom'] || r.data['Effective From'] || r.data['effectivefrom'] || '' },
                { title: 'To', width: 90, render: (_: unknown, r: ImportRow) => r.data['effectiveTo'] || r.data['Effective To'] || r.data['effectiveto'] || 'open' },
                {
                  title: 'Result', width: 80,
                  render: (_: unknown, r: ImportRow) => {
                    if (r.status === 'VALID') return <Tag color="success">Valid</Tag>;
                    return <Tag color="error">Invalid</Tag>;
                  },
                },
                {
                  title: 'Details',
                  render: (_: unknown, r: ImportRow) =>
                    r.errors.length > 0 ? (
                      <Typography.Text type="danger" style={{ fontSize: 11 }}>{r.errors.join('; ')}</Typography.Text>
                    ) : (
                      <Typography.Text type="secondary" style={{ fontSize: 11 }}>Ready to import</Typography.Text>
                    ),
                },
              ]}
            />
          </div>
        )}

        {importing && (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12 }}>Importing machine targets… this may take a moment.</div>
          </div>
        )}

        {importSummary && !importing && (
          <div>
            <Alert
              type={importSummary.failed > 0 ? 'warning' : 'success'}
              showIcon
              message={importSummary.failed > 0 ? 'Import completed with errors' : 'Import successful'}
              style={{ marginBottom: 16 }}
            />
            <Descriptions bordered size="small" column={1} styles={{ label: { width: 180 } }}>
              <Descriptions.Item label="Total rows">{importSummary.total}</Descriptions.Item>
              <Descriptions.Item label="Valid rows">{importSummary.valid}</Descriptions.Item>
              <Descriptions.Item label="Invalid rows">{importSummary.invalid}</Descriptions.Item>
              <Descriptions.Item label="Imported rows"><b style={{ color: '#1a7f37' }}>{importSummary.imported}</b></Descriptions.Item>
              <Descriptions.Item label="Failed rows">{importSummary.failed}</Descriptions.Item>
            </Descriptions>
            {importSummary.errors.length > 0 && (
              <Alert
                type="error"
                style={{ marginTop: 12 }}
                message="Row errors"
                description={
                  <ul style={{ margin: 0, paddingLeft: 20, maxHeight: 160, overflowY: 'auto' }}>
                    {importSummary.errors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
                  </ul>
                }
              />
            )}
          </div>
        )}
      </DraggableResizableModal>

      <TargetSaveSuccessModal
        open={!!saveSuccess}
        target={
          saveSuccess
            ? {
                machineNumber: saveSuccess.target.machine?.machineNumber ?? saveSuccess.target.machine?.machineCode ?? null,
                machineCode: saveSuccess.target.machine?.machineCode ?? null,
                machineSystemId: saveSuccess.target.machine?.machineId ?? null,
                machineName: saveSuccess.target.machine?.name ?? null,
                itemCode: saveSuccess.target.item?.itemCode ?? null,
                itemName: saveSuccess.target.item?.name ?? null,
                shift: saveSuccess.target.shift ? `${saveSuccess.target.shift.shiftCode}` : undefined,
                uom: saveSuccess.target.uom?.code ?? undefined,
                targetQuantity: saveSuccess.target.targetQuantity,
                standardHours: saveSuccess.target.standardHours,
                effectiveFrom: saveSuccess.target.effectiveFrom,
                effectiveTo: saveSuccess.target.effectiveTo,
                status: saveSuccess.target.status,
              }
            : null
        }
        mode={saveSuccess?.mode ?? 'create'}
        onClose={() => setSaveSuccess(null)}
      />
    </div>
  );
};

export default TargetManagement;