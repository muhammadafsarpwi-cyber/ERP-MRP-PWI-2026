import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert, App, Badge, Button, Card, DatePicker, Descriptions, Dropdown, Form, Input, InputNumber,
  Modal, Segmented, Select, Space, Spin, Table, Tooltip, Typography, Upload,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, ReloadOutlined, QrcodeOutlined,
  EyeOutlined, MoreOutlined, PrinterOutlined, ClearOutlined, FilterOutlined,
  ToolOutlined, DeleteOutlined, NumberOutlined, TagOutlined, SettingOutlined,
  ApartmentOutlined, ShopOutlined, SubnodeOutlined, TeamOutlined, EnvironmentOutlined,
  TagsOutlined, AlertOutlined, CheckCircleOutlined,
  DownloadOutlined, FilePdfOutlined, ImportOutlined, InboxOutlined,
  HistoryOutlined, BarChartOutlined, ScheduleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';
import {
  PageHeader, StatusBadge, EmptyState, LoadingState, HeaderCell, HighlightedCell, TableActions,
  DraggableResizableModal, SaveResultDialog, SaveResultPhase, SaveResultData,
} from '../../components/shared';
import { label } from '../maintenance/jobCards.types';
import { getMachineColor } from '../../utils/colorMapping';
import BarcodePrint from '../../components/shared/BarcodePrint';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

const { Text } = Typography;

interface OrgItem { id: string; name: string; }
interface DivisionLk extends OrgItem { divisionCode: string; }
interface SectionLk extends OrgItem { sectionCode: string; divisionId: string | null; }
interface DepartmentLk extends OrgItem { departmentCode: string; divisionId: string | null; sectionId: string | null; }

interface Machine {
  id: string;
  machineId?: string | null;
  machineCode: string;
  machineNumber?: string | null;
  name: string;
  description?: string | null;
  divisionId?: string | null;
  sectionId?: string | null;
  departmentId?: string | null;
  division?: { id: string; name: string } | null;
  section?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
  machineType?: string | null;
  location?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  serialNumber?: string | null;
  capacity?: string | null;
  powerRating?: string | null;
  installationDate?: string | null;
  warrantyExpiryDate?: string | null;
  criticality: string;
  status: string;
  qrPayload?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

/**
 * Unified value bag used by both the live View modal sections and the
 * pre-save Machine Details preview. Optional values always render their safe
 * empty-state ("—"), so missing backend/optional data can never crash a badge.
 */
interface MachineDetailModel {
  machineId?: string | null;
  machineCode?: string | null;
  machineNumber?: string | null;
  name?: string | null;
  machineType?: string | null;
  status?: string | null;
  criticality?: string | null;
  divisionName?: string | null;
  sectionName?: string | null;
  departmentName?: string | null;
  location?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  capacity?: string | number | null;
  powerRating?: string | null;
  installationDate?: string | null;
  warrantyExpiryDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  description?: string | null;
}

interface ProductionEntry {
  id: string;
  entryDate?: string | null;
  entryNumber?: string | null;
  machineNo?: string | null;
  shift?: { shiftCode: string; name: string } | null;
  item?: { itemCode: string; name: string } | null;
  uom?: { code: string; symbol: string } | null;
  operatorName?: string | null;
  targetQuantity?: number | string | null;
  actualQuantity?: number | string | null;
  scrapQuantity?: number | string | null;
  achievementPercentage?: number | string | null;
  efficiencyPercentage?: number | string | null;
  runningHours?: number | string | null;
}

interface MachineTargetLite {
  id: string;
  shift?: { shiftCode: string; name: string } | null;
  item?: { itemCode: string; name: string } | null;
  uom?: { code: string; symbol: string } | null;
  machineName?: string | null;
  targetQuantity?: number | string | null;
  standardHours?: number | string | null;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status?: string | null;
}

/** Read-only light projection of a MaintenanceJobCard for the View → Job Cards section. */
interface JobCardLite {
  id: string;
  jobCardNo?: string | null;
  complaint?: string | null;
  priority?: string | null;
  maintenanceType?: string | null;
  currentStatus?: string | null;
  requestedAt?: string | null;
  startedAt?: string | null;
  closedAt?: string | null;
  downtimeMinutes?: number | null;
  requestedByUser?: { fullName?: string | null; name?: string | null; email?: string | null } | null;
}

type ViewSection = 'identity' | 'org' | 'tech' | 'production' | 'jobcards' | 'dates';

const VIEW_SECTIONS: Array<{ key: ViewSection; label: string }> = [
  { key: 'identity', label: 'Machine Identity' },
  { key: 'org', label: 'Organization + Location' },
  { key: 'tech', label: 'Technical Information' },
  { key: 'production', label: 'Production' },
  { key: 'jobcards', label: 'Job Cards' },
  { key: 'dates', label: 'Dates + Description' },
];

const badge = (v?: string | null): React.ReactNode =>
  v == null || v === '' ? <Text type="secondary">—</Text> : <StatusBadge status={v} />;

const detailToModel = (d: Machine): MachineDetailModel => ({
  machineId: d.machineId ?? null,
  machineCode: d.machineCode ?? null,
  machineNumber: d.machineNumber ?? null,
  name: d.name ?? null,
  machineType: d.machineType ?? null,
  status: d.status ?? null,
  criticality: d.criticality ?? null,
  divisionName: d.division?.name ?? null,
  sectionName: d.section?.name ?? null,
  departmentName: d.department?.name ?? null,
  location: d.location ?? null,
  manufacturer: d.manufacturer ?? null,
  model: d.model ?? null,
  serialNumber: d.serialNumber ?? null,
  capacity: d.capacity ?? null,
  powerRating: d.powerRating ?? null,
  installationDate: d.installationDate ?? null,
  warrantyExpiryDate: d.warrantyExpiryDate ?? null,
  createdAt: d.createdAt ?? null,
  updatedAt: d.updatedAt ?? null,
  createdBy: d.createdBy ?? null,
  updatedBy: d.updatedBy ?? null,
  description: d.description ?? null,
});

function extractApiError(err: any, fallback: string): string {
  const raw = err?.response?.data?.message ?? err?.message;
  if (raw == null || raw === '') return fallback;
  if (Array.isArray(raw)) return raw.join('; ');
  return String(raw);
}

const EMPTY = <Text type="secondary">—</Text>;

const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('DD-MMM-YYYY') : '—';
};

const fmtDateTime = (v?: string | null): string => {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '—';
};

const fmtMinutes = (v?: number | null): string => {
  if (v == null) return '—';
  const total = Math.floor(v);
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

/* ─── TASK23 clean label/value detail layout ─────────────────────────────────
 * "Field Label → Value" rows: labels are smaller/muted/semibold with a
 * consistent column; values are larger, higher-contrast ordinary text.
 * Logical groups use a subtle heading + separator, never a card per field. */

const detailLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--theme-text-muted)',
  lineHeight: '20px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

const detailValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--theme-text)',
  lineHeight: '20px',
  minWidth: 0,
  overflowWrap: 'anywhere',
};

const DetailRow: React.FC<{ label: React.ReactNode; children: React.ReactNode }> = ({ label, children }) => (
  <div
    className="erp-detail-row"
    style={{ display: 'grid', gridTemplateColumns: '104px 1fr', gap: 16, alignItems: 'baseline', padding: '3px 0' }}
  >
    <div style={detailLabelStyle}>{label}</div>
    <div style={detailValueStyle}>{children}</div>
  </div>
);

const DetailBlock: React.FC<{ title?: React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
  <section className="erp-detail-block" style={{ marginBottom: 18 }}>
    {title !== undefined ? (
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--theme-text)', margin: '14px 0 8px', paddingBottom: 6, borderBottom: `1px solid var(--theme-border)` }}>
        {title}
      </div>
    ) : null}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '0 24px' }}>
      {children}
    </div>
  </section>
);

/** Clean Add/Edit form section: one subtle heading + responsive two-column grid of fields. */
const FormGroup: React.FC<{ title: string; children: React.ReactNode; marginBottom?: number }> = ({ title, children, marginBottom = 18 }) => (
  <div style={{ marginBottom }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 3, height: 12, borderRadius: 2, background: 'var(--theme-accent)', flexShrink: 0 }} />
      {title}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0 16px' }}>
      {children}
    </div>
  </div>
);

/** Renders one Machine Details section as clean Label → Value rows. Shared by
 *  the View modal (no title — the Segmented tab names the section) and the
 *  pre-save Machine Details preview (title shown once per logical group). */
const MachineSection: React.FC<{ model: MachineDetailModel; section: ViewSection; showTitle?: boolean }> = ({
  model, section, showTitle = false,
}) => {
  const title = showTitle ? (VIEW_SECTIONS.find((s) => s.key === section)?.label ?? undefined) : undefined;
  if (section === 'identity') {
    return (
      <DetailBlock title={title}>
        <DetailRow label="Machine ID">
          <code style={{ fontWeight: 600, fontSize: 12 }}>{model.machineId ?? '—'}</code>
        </DetailRow>
        <DetailRow label="Machine Code">{model.machineCode ?? EMPTY}</DetailRow>
        <DetailRow label="Machine Number">{model.machineNumber ?? EMPTY}</DetailRow>
        <DetailRow label="Machine Name">{model.name ?? EMPTY}</DetailRow>
        <DetailRow label="Status">{badge(model.status)}</DetailRow>
        <DetailRow label="Criticality">{badge(model.criticality)}</DetailRow>
      </DetailBlock>
    );
  }
  if (section === 'org') {
    return (
      <DetailBlock title={title}>
        <DetailRow label="Division">{model.divisionName ?? EMPTY}</DetailRow>
        <DetailRow label="Section">{model.sectionName ?? EMPTY}</DetailRow>
        <DetailRow label="Department">{model.departmentName ?? EMPTY}</DetailRow>
        <DetailRow label="Location">{model.location ?? EMPTY}</DetailRow>
      </DetailBlock>
    );
  }
  if (section === 'tech') {
    return (
      <DetailBlock title={title}>
        <DetailRow label="Machine Type">{model.machineType ?? EMPTY}</DetailRow>
        <DetailRow label="Manufacturer">{model.manufacturer ?? EMPTY}</DetailRow>
        <DetailRow label="Model">{model.model ?? EMPTY}</DetailRow>
        <DetailRow label="Serial Number">{model.serialNumber ?? EMPTY}</DetailRow>
        <DetailRow label="Capacity">{model.capacity ?? EMPTY}</DetailRow>
        <DetailRow label="Power Rating">{model.powerRating ?? EMPTY}</DetailRow>
      </DetailBlock>
    );
  }
  if (section === 'dates') {
    return (
      <DetailBlock title={title}>
        <DetailRow label="Installation Date">{model.installationDate ?? EMPTY}</DetailRow>
        <DetailRow label="Warranty Expiry">{model.warrantyExpiryDate ?? EMPTY}</DetailRow>
        <DetailRow label="Created By">
          {model.createdBy ? (
            <Tooltip title={model.createdBy}><code style={{ fontSize: 11 }}>{`${model.createdBy.slice(0, 8)}…`}</code></Tooltip>
          ) : EMPTY}
        </DetailRow>
        <DetailRow label="Created Date">{model.createdAt ? dayjs(model.createdAt).format('DD-MMM-YYYY HH:mm') : EMPTY}</DetailRow>
        <DetailRow label="Updated By">
          {model.updatedBy ? (
            <Tooltip title={model.updatedBy}><code style={{ fontSize: 11 }}>{`${model.updatedBy.slice(0, 8)}…`}</code></Tooltip>
          ) : EMPTY}
        </DetailRow>
        <DetailRow label="Updated Date">{model.updatedAt ? dayjs(model.updatedAt).format('DD-MMM-YYYY HH:mm') : EMPTY}</DetailRow>
        <DetailRow label="Description">{model.description ?? EMPTY}</DetailRow>
      </DetailBlock>
    );
  }
  return null;
};

const CRITICALITY_COLORS: Record<string, string> = {
  LOW: 'default',
  MEDIUM: 'blue',
  HIGH: 'orange',
  CRITICAL: 'red',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'green',
  INACTIVE: 'red',
  MAINTENANCE: 'orange',
  RETIRED: 'default',
};

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
  errors: string[];
}

/* ─── CSV / Import utilities (mirror the ItemManagement / TargetManagement export architecture) ─── */

const IMPORT_TEMPLATE_CSV =
  'Machine Code,Machine Name,Machine Number,Machine Type,Manufacturer,Model,Serial Number,Location,Capacity,Power Rating,Criticality,Status,Installation Date,Warranty Expiry,Description\n' +
  'HD-04,Header Machine 04,MM-1001,Cold Forge,Acme Corp,AF-200,SN-12345,Hall A / Bay 3,120,15 kW,MEDIUM,ACTIVE,2024-06-15,2027-06-15,Primary header line machine\n' +
  'WR-02,Wire Drawing 02,,Wire Drawer,Simaco,WD-500,,Building B,80,10 kW,MEDIUM,ACTIVE,,,Wire drawing for 3mm stock\n';

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
  a.download = 'machine-master-import-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

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
  'Machine ID', 'Machine Code', 'Machine Number', 'Machine Name', 'Machine Type',
  'Division', 'Section', 'Department', 'Location',
  'Manufacturer', 'Model', 'Serial Number', 'Capacity', 'Power Rating',
  'Criticality', 'Status', 'Installation Date', 'Warranty Expiry', 'Description',
];

const MachineManagement: React.FC<{ initialMachineId?: string }> = ({ initialMachineId }) => {
  const { message } = App.useApp();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('machineCode');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  const [search, setSearch] = useState('');
  const [fMachineId, setFMachineId] = useState<string>('');
  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [fCriticality, setFCriticality] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [detail, setDetail] = useState<Machine | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [qrModal, setQrModal] = useState<{ visible: boolean; machine: Machine | null; dataUrl: string; payload: string; url: string }>({
    visible: false, machine: null, dataUrl: '', payload: '', url: '',
  });
  const [printModal, setPrintModal] = useState<{ visible: boolean; machine: Machine | null }>({
    visible: false, machine: null,
  });
  const [exporting, setExporting] = useState(false);
  const [pdfing, setPdfing] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);

  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const formDivisionId = Form.useWatch('divisionId', form);
  const formSectionId = Form.useWatch('sectionId', form);

  // ─── TASK22 states ─────────────────────────────────────────────────────────
  const [viewSection, setViewSection] = useState<ViewSection>('identity');
  const [prodEntries, setProdEntries] = useState<ProductionEntry[]>([]);
  const [prodTargets, setProdTargets] = useState<MachineTargetLite[]>([]);
  const [prodEntriesLoading, setProdEntriesLoading] = useState(false);
  const [prodTargetsLoading, setProdTargetsLoading] = useState(false);
  const [jobCards, setJobCards] = useState<JobCardLite[]>([]);
  const [jobCardsLoading, setJobCardsLoading] = useState(false);
  const [formTick, setFormTick] = useState(0);
  const [vw, setVw] = useState(() => window.innerWidth || 1280);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultPhase, setResultPhase] = useState<SaveResultPhase>('loading');
  const [resultData, setResultData] = useState<SaveResultData | null>(null);
  const [resultError, setResultError] = useState<string>('');
  const lastPayload = React.useRef<any>(null);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (initialMachineId) {
      (async () => {
        try {
          const m = await apiService.get<Machine>(`/machines/qr/${initialMachineId}`);
          setDetail(m);
        } catch {
          message.warning('Machine not found for the scanned QR link');
        }
      })();
    }
  }, [initialMachineId, message]);

  const fetchMachines = useCallback(async (pageNum: number = page) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { page: pageNum, limit: pageSize, sortBy, sortDir };
      if (search) params.search = search;
      if (fMachineId) params.machineId = fMachineId;
      if (fDivision) params.divisionId = fDivision;
      if (fSection) params.sectionId = fSection;
      if (fDepartment) params.departmentId = fDepartment;
      if (fStatus) params.status = fStatus;
      if (fCriticality) params.criticality = fCriticality;
      const response = await apiService.get<{ data: Machine[]; total: number }>('/machines', params);
      setMachines(response.data);
      setTotal(response.total);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load machines. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortBy, sortDir, search, fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality]);

  useEffect(() => { fetchMachines(page); }, [page, pageSize, fetchMachines]);

  useEffect(() => {
    (async () => {
      try {
        const [div, sec, dep] = await Promise.all([
          apiService.get<{ data: DivisionLk[] }>('/divisions', { limit: 200 }),
          apiService.get<{ data: SectionLk[] }>('/sections', { limit: 500 }),
          apiService.get<{ data: DepartmentLk[] }>('/departments', { limit: 500 }),
        ]);
        setDivisions(div.data || []);
        setSections(sec.data || []);
        setDepartments(dep.data || []);
      } catch {
        message.warning('Could not load division / section / department lookups');
      }
    })();
  }, [message]);

  const sectionsForDivision = useMemo(
    () => (divisionId?: string) => (divisionId ? sections.filter((s) => s.divisionId === divisionId) : sections),
    [sections],
  );
  const departmentsForSection = useMemo(
    () => (sectionId?: string) => (sectionId ? departments.filter((d) => d.sectionId === sectionId) : departments),
    [departments],
  );

  const activeFilterCount = useMemo(
    () => [fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality].filter(Boolean).length,
    [fMachineId, fDivision, fSection, fDepartment, fStatus, fCriticality],
  );

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (m: Machine) => {
    setEditing(m);
    form.setFieldsValue({
      ...m,
      installationDate: m.installationDate ? dayjs(m.installationDate) : undefined,
      warrantyExpiryDate: m.warrantyExpiryDate ? dayjs(m.warrantyExpiryDate) : undefined,
    });
    setModalVisible(true);
  };

  const buildPayload = (values: any): any => {
    const payload: any = {
      ...values,
      installationDate: values.installationDate ? values.installationDate.format('YYYY-MM-DD') : null,
      warrantyExpiryDate: values.warrantyExpiryDate ? values.warrantyExpiryDate.format('YYYY-MM-DD') : null,
    };
    delete payload.machineId;
    return payload;
  };

  const submitMachine = async (payload: any) => {
    lastPayload.current = payload;
    setSaving(true);
    setResultOpen(true);
    setResultPhase('loading');
    setResultData(null);
    setResultError('');
    try {
      if (editing) {
        await apiService.patch(`/machines/${editing.id}`, payload);
      } else {
        await apiService.post('/machines', payload);
      }
      const code = payload.machineCode;
      const name = payload.name;
      setResultData({
        title: (code ? code : '') + (code && name ? ' — ' : '') + (name ? name : ''),
        recordType: 'Machine Code',
        recordCode: code || undefined,
        recordName: name || undefined,
      });
      setResultPhase('success');
    } catch (err: any) {
      setResultError(extractApiError(err, 'Failed to save machine'));
      setResultPhase('error');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    try {
      const values = await form.validateFields();
      await submitMachine(buildPayload(values));
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(extractApiError(err, 'Failed to save machine'));
    }
  };

  const handleResultClose = () => {
    setResultOpen(false);
    if (resultPhase === 'success') {
      setModalVisible(false);
      form.resetFields();
      const nextPage = editing ? page : 1;
      fetchMachines(nextPage);
      if (!editing) setPage(1);
    }
  };

  const handleResultRetry = () => {
    if (lastPayload.current) {
      submitMachine(lastPayload.current);
    }
  };

  const handleStatus = async (m: Machine, status: string) => {
    try {
      await apiService.patch(`/machines/${m.id}/status`, { status });
      message.success(`Machine ${m.machineCode} set to ${status}`);
      fetchMachines();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to change status');
    }
  };

  const handleDelete = async (m: Machine) => {
    try {
      await apiService.delete(`/machines/${m.id}`);
      message.success(`Machine ${m.machineCode} deleted`);
      fetchMachines();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to delete machine');
    }
  };

  const EXPORT_LIMIT = 10000;

  const collectFilteredMachines = async (): Promise<Machine[]> => {
    const params: any = { page: 1, limit: EXPORT_LIMIT, sortBy, sortDir };
    if (search) params.search = search;
    if (fMachineId) params.machineId = fMachineId;
    if (fDivision) params.divisionId = fDivision;
    if (fSection) params.sectionId = fSection;
    if (fDepartment) params.departmentId = fDepartment;
    if (fStatus) params.status = fStatus;
    if (fCriticality) params.criticality = fCriticality;
    const response = await apiService.get<{ data: Machine[]; total: number }>('/machines', params);
    return response.data || [];
  };

  const machineToExportRow = (m: Machine): Array<string | number | null | undefined> => [
    m.machineId ?? '',
    m.machineCode,
    m.machineNumber ?? '',
    m.name,
    m.machineType ?? '',
    m.division?.name ?? '',
    m.section?.name ?? '',
    m.department?.name ?? '',
    m.location ?? '',
    m.manufacturer ?? '',
    m.model ?? '',
    m.serialNumber ?? '',
    m.capacity ?? '',
    m.powerRating ?? '',
    m.criticality,
    m.status,
    m.installationDate ?? '',
    m.warrantyExpiryDate ?? '',
    m.description ?? '',
  ];

  const filterSummary = () => {
    const parts: string[] = [];
    if (search) parts.push(`Search: "${search}"`);
    if (fMachineId) parts.push(`Machine ID: ${fMachineId}`);
    if (fDivision) parts.push(`Division: ${divisions.find((d) => d.id === fDivision)?.name ?? fDivision}`);
    if (fSection) parts.push(`Section: ${sections.find((s) => s.id === fSection)?.name ?? fSection}`);
    if (fDepartment) parts.push(`Department: ${departments.find((d) => d.id === fDepartment)?.name ?? fDepartment}`);
    if (fStatus) parts.push(`Status: ${fStatus}`);
    if (fCriticality) parts.push(`Criticality: ${fCriticality}`);
    return parts.length ? parts.join('   |   ') : 'All machines';
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const rows = await collectFilteredMachines();
      downloadText(
        `machine-master-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(EXPORT_HEADERS, rows.map(machineToExportRow)),
      );
      message.success(`Exported ${rows.length} machines`);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handlePrintReport = async () => {
    setPrinting(true);
    try {
      const rows = await collectFilteredMachines();
      const w = window.open('', '_blank', 'width=1100,height=760');
      if (!w) {
        message.error('Popup blocked. Allow popups to print.');
        return;
      }
      const bodyRows = rows
        .map((m) => `<tr>
          <td><b>${m.machineCode}</b></td>
          <td>${m.machineNumber ?? ''}</td>
          <td>${m.name}</td>
          <td>${m.machineType ?? ''}</td>
          <td>${m.division?.name ?? ''}</td>
          <td>${m.section?.name ?? ''}</td>
          <td>${m.department?.name ?? ''}</td>
          <td>${m.location ?? ''}</td>
          <td>${m.manufacturer ?? ''}</td>
          <td>${m.model ?? ''}</td>
          <td class="status ${String(m.status).toLowerCase()}">${m.status}</td>
        </tr>`)
        .join('');
      w.document.write(`<!DOCTYPE html>
<html><head><title>Machine Master Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 24px; color: #222; }
  h1 { font-size: 18px; margin: 0; }
  .meta { font-size: 11px; color: #666; margin-top: 4px; }
  .filters { font-size: 12px; margin: 12px 0 16px; background: #f5f6f8; border-radius: 6px; padding: 8px 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f0f1f3; text-align: left; padding: 6px 8px; border-bottom: 2px solid #ddd; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; }
  .status.active { color: #1a7f37; font-weight: 600; }
  .status.inactive { color: #c0392b; font-weight: 600; }
  .status.maintenance { color: #b9770e; font-weight: 600; }
  @page { size: A4 landscape; margin: 12mm; }
</style></head><body>
  <h1>Machine Master Report</h1>
  <div class="meta">Generated ${new Date().toLocaleString()} &nbsp;&middot;&nbsp; ${rows.length} machine(s)</div>
  <div class="filters"><b>Filters:</b> ${filterSummary()}</div>
  <table>
    <thead><tr><th>Code</th><th>Number</th><th>Name</th><th>Type</th><th>Division</th><th>Section</th><th>Department</th><th>Location</th><th>Manufacturer</th><th>Model</th><th>Status</th></tr></thead>
    <tbody>${bodyRows || '<tr><td colspan="11" style="text-align:center;color:#999">No machines found</td></tr>'}</tbody>
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
      const rows = await collectFilteredMachines();
      if (!rows.length) {
        message.info('No machines to export to PDF');
        return;
      }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.setTextColor(33);
      doc.text('Machine Master Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString()} \u00B7 ${rows.length} machine(s)`, 40, 56);
      doc.text(`Filters: ${filterSummary()}`, 40, 70);
      const head = [['Code', 'Number', 'Name', 'Type', 'Division', 'Section', 'Department', 'Location', 'Manufacturer', 'Model', 'Status']];
      const body = rows.map((m) => [
        m.machineCode,
        m.machineNumber ?? '',
        m.name,
        m.machineType ?? '',
        m.division?.name ?? '',
        m.section?.name ?? '',
        m.department?.name ?? '',
        m.location ?? '',
        m.manufacturer ?? '',
        m.model ?? '',
        m.status,
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
      doc.save(`machine-master-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success(`Exported ${rows.length} machines to PDF`);
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

    const required = ['machinecode', 'machinename'];
    const missing = required.filter((c) => !normHeader.includes(c));
    if (missing.length > 0) {
      message.error(`Missing required column(s): ${missing.join(', ')}. Download the template for the expected format.`);
      return false;
    }

    const headerMap: Record<string, number> = {};
    header.forEach((h, i) => { headerMap[h.toLowerCase().replace(/[\s_-]+/g, '')] = i; });
    const get = (cells: string[], field: string): string => {
      const idx = headerMap[field];
      return idx !== undefined ? (cells[idx] ?? '').trim() : '';
    };

    const validated: ImportRow[] = parsed.slice(1).map((cells, idx) => {
      const data: Record<string, string> = {};
      header.forEach((h, i) => {
        const val = cells[i] ?? '';
        data[h] = val;
        data[h.toLowerCase().replace(/[\s_-]+/g, '')] = val;
      });
      const errors: string[] = [];
      const code = get(cells, 'machinecode');
      const name = get(cells, 'machinename');
      if (!code) errors.push('Machine Code is required');
      if (!name) errors.push('Machine Name is required');
      if (code.length > 50) errors.push('Machine Code must be ≤ 50 characters');
      const crit = (get(cells, 'criticality') || 'MEDIUM').toUpperCase();
      if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(crit)) errors.push(`Invalid Criticality '${crit}'`);
      const status = (get(cells, 'status') || 'ACTIVE').toUpperCase();
      if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'].includes(status)) errors.push(`Invalid Status '${status}'`);
      const capacity = get(cells, 'capacity');
      if (capacity && isNaN(Number(capacity))) errors.push('Capacity must be a number');
      const instDate = get(cells, 'installationdate');
      if (instDate && !/^\d{4}-\d{2}-\d{2}$/.test(instDate)) errors.push('Installation Date must be YYYY-MM-DD');
      const warrDate = get(cells, 'warrantyexpiry');
      if (warrDate && !/^\d{4}-\d{2}-\d{2}$/.test(warrDate)) errors.push('Warranty Expiry must be YYYY-MM-DD');

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

  const closeImport = () => {
    setImportOpen(false);
    setImportRows([]);
    setImportSummary(null);
    setImportFileName(null);
  };

  const runImport = async () => {
    const validRows = importRows.filter((r) => r.status === 'VALID');
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const existingRes = await apiService.get<{ data: Machine[]; total: number }>('/machines', { limit: EXPORT_LIMIT, page: 1 });
      const existingCodes = new Set((existingRes.data || []).map((m) => m.machineCode.toUpperCase()));

      let imported = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const row of validRows) {
        const code = (row.data['machineCode'] || row.data['Machine Code'] || row.data['machinecode'] || '').trim();
        if (existingCodes.has(code.toUpperCase())) {
          row.status = 'DUPLICATE';
          row.errors = ['Machine Code already exists'];
          failed++;
          errors.push(`Row ${row.rowNumber}: Duplicate machine code '${code}'`);
          continue;
        }
        const status = (row.data['status'] || row.data['Status'] || 'ACTIVE').toUpperCase();
        const payload: any = {
          machineCode: code,
          name: (row.data['machineName'] || row.data['Machine Name'] || row.data['machinename'] || '').trim(),
          machineNumber: (row.data['machineNumber'] || row.data['Machine Number'] || row.data['machinenumber'] || '').trim() || null,
          machineType: (row.data['machineType'] || row.data['Machine Type'] || row.data['machinetype'] || '').trim() || null,
          manufacturer: (row.data['manufacturer'] || row.data['Manufacturer'] || '').trim() || null,
          model: (row.data['model'] || row.data['Model'] || '').trim() || null,
          serialNumber: (row.data['serialNumber'] || row.data['Serial Number'] || row.data['serialnumber'] || '').trim() || null,
          location: (row.data['location'] || row.data['Location'] || '').trim() || null,
          capacity: (row.data['capacity'] || row.data['Capacity']) ? Number(row.data['capacity'] || row.data['Capacity']) : null,
          powerRating: (row.data['powerRating'] || row.data['Power Rating'] || row.data['powerrating'] || '').trim() || null,
          criticality: (row.data['criticality'] || row.data['Criticality'] || 'MEDIUM').toUpperCase(),
          installationDate: (row.data['installationDate'] || row.data['Installation Date'] || row.data['installationdate'] || '').trim() || null,
          warrantyExpiryDate: (row.data['warrantyExpiry'] || row.data['Warranty Expiry'] || row.data['warrantyexpiry'] || '').trim() || null,
          description: (row.data['description'] || row.data['Description'] || '').trim() || null,
        };
        try {
          const created = await apiService.post<{ id: string }>('/machines', payload);
          if (status !== 'ACTIVE') {
            try {
              await apiService.patch(`/machines/${created.id}/status`, { status });
            } catch {
              // machine was created; status patch is best-effort
            }
          }
          imported++;
          existingCodes.add(code.toUpperCase());
        } catch (err: any) {
          failed++;
          errors.push(`Row ${row.rowNumber}: ${err?.response?.data?.message || err?.message || 'Unknown error'}`);
        }
      }

      setImportSummary({
        total: importRows.length,
        valid: validRows.length,
        invalid: importRows.filter((r) => r.status === 'INVALID').length,
        duplicate: importRows.filter((r) => r.status === 'DUPLICATE').length,
        imported,
        failed,
        errors,
      });
      fetchMachines(1);
      setPage(1);
    } catch (err: any) {
      message.error(err?.response?.data?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const openDetail = async (m: Machine) => {
    setDetail(null);
    setDetailLoading(true);
    setViewSection('identity');
    try {
      const res = await apiService.get<{ data: Machine }>(`/machines/${m.id}`);
      setDetail(res.data);
    } catch {
      message.error('Failed to load machine details');
    } finally {
      setDetailLoading(false);
    }
  };

  const detailModel = useMemo(() => (detail ? detailToModel(detail) : null), [detail]);

  const fetchProductionData = useCallback(async () => {
    if (!detail || !detail.id) return;
    setProdEntriesLoading(true);
    setProdTargetsLoading(true);
    try {
      const [eRes, tRes] = await Promise.all([
        apiService.get<{ data: ProductionEntry[]; total: number }>('/production/entries', {
          machineId: detail.id, page: 1, limit: 5, sortBy: 'entryDate', sortDir: 'DESC',
        }),
        apiService.get<{ data: MachineTargetLite[]; total: number }>('/production/machine-targets', {
          machineId: detail.id, page: 1, limit: 5,
        }),
      ]);
      setProdEntries(eRes.data || []);
      setProdTargets(tRes.data || []);
    } catch {
      setProdEntries([]);
      setProdTargets([]);
    } finally {
      setProdEntriesLoading(false);
      setProdTargetsLoading(false);
    }
  }, [detail]);

  useEffect(() => {
    if (viewSection === 'production' && detail) {
      fetchProductionData();
    }
  }, [viewSection, detail, fetchProductionData]);

  const fetchJobCards = useCallback(async () => {
    if (!detail || !detail.id) return;
    setJobCardsLoading(true);
    try {
      const res = await apiService.get<JobCardLite[]>(`/master-data/maintenance/job-cards/machine/${detail.id}`);
      setJobCards(Array.isArray(res) ? res : []);
    } catch {
      setJobCards([]);
    } finally {
      setJobCardsLoading(false);
    }
  }, [detail]);

  useEffect(() => {
    if (viewSection === 'jobcards' && detail) {
      fetchJobCards();
    }
  }, [viewSection, detail, fetchJobCards]);

  /** Live pre-save preview bag, rebuilt after every Add/Edit-form keystroke.
   *  In Add mode the Machine ID (and status) are generated on save, so they
   *  stay "—"; in Edit mode they come from the record being edited. */
  const previewModel = useMemo<MachineDetailModel | null>(() => {
    void formTick; // re-read form values after every onValuesChange
    if (!modalVisible) return null;
    const v = (form.getFieldsValue() as any) ?? {};
    return {
      machineId: editing?.machineId ?? null,
      machineCode: v?.machineCode ?? editing?.machineCode ?? null,
      machineNumber: v?.machineNumber ?? editing?.machineNumber ?? null,
      name: v?.name ?? editing?.name ?? null,
      machineType: v?.machineType ?? editing?.machineType ?? null,
      status: editing?.status ?? null,
      criticality: v?.criticality ?? editing?.criticality ?? null,
      divisionName: v?.divisionId ? (divisions.find((d) => d.id === v.divisionId)?.name ?? null) : (editing?.division?.name ?? null),
      sectionName: v?.sectionId ? (sections.find((s) => s.id === v.sectionId)?.name ?? null) : (editing?.section?.name ?? null),
      departmentName: v?.departmentId ? (departments.find((d) => d.id === v.departmentId)?.name ?? null) : (editing?.department?.name ?? null),
      location: v?.location ?? editing?.location ?? null,
      manufacturer: v?.manufacturer ?? editing?.manufacturer ?? null,
      model: v?.model ?? editing?.model ?? null,
      serialNumber: v?.serialNumber ?? editing?.serialNumber ?? null,
      capacity: v?.capacity ?? editing?.capacity ?? null,
      powerRating: v?.powerRating ?? editing?.powerRating ?? null,
      installationDate: v?.installationDate ? v.installationDate.format('YYYY-MM-DD') : (editing?.installationDate ?? null),
      warrantyExpiryDate: v?.warrantyExpiryDate ? v.warrantyExpiryDate.format('YYYY-MM-DD') : (editing?.warrantyExpiryDate ?? null),
      createdAt: editing?.createdAt ?? null,
      updatedAt: editing?.updatedAt ?? null,
      description: v?.description ?? editing?.description ?? null,
    };
  }, [formTick, modalVisible, editing, form, divisions, sections, departments]);

  const showQr = async (m: Machine) => {
    try {
      const res = await apiService.get<{ payload: string; url: string; dataUrl: string }>(`/machines/${m.id}/qr`);
      setQrModal({ visible: true, machine: m, dataUrl: res.dataUrl, payload: res.payload, url: res.url });
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Failed to generate QR');
    }
  };

  const printQr = () => {
    const { machine, dataUrl } = qrModal;
    if (!machine) return;
    const w = window.open('', '_blank', 'width=420,height=560');
    if (!w) { message.error('Popup blocked. Allow popups to print QR labels.'); return; }
    w.document.write(`
      <html><head><title>QR - ${machine.machineCode}</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:16px}
      img{width:280px;height:280px} h2{margin:8px 0 2px} p{margin:2px 0;color:#444}</style></head>
      <body>
        <h2>${machine.name}</h2>
        <p><b>${machine.machineId ?? ''}</b> · <b>${machine.machineCode}</b>${machine.machineNumber ? ' · #' + machine.machineNumber : ''}</p>
        ${machine.location ? `<p>${machine.location}</p>` : ''}
        <img src="${dataUrl}" alt="QR" />
        <p style="font-size:11px;color:#888">${qrModal.url || qrModal.payload}</p>
        <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  const resetFilters = () => {
    setSearch('');
    setFMachineId('');
    setFDivision(undefined);
    setFSection(undefined);
    setFDepartment(undefined);
    setFStatus(undefined);
    setFCriticality(undefined);
    setPage(1);
    setSortBy('machineCode');
    setSortDir('ASC');
  };

  const columns: ColumnsType<Machine> = [
    {
      title: <HeaderCell icon={<TagOutlined />} first="Machine" second="ID" />,
      dataIndex: 'machineId',
      key: 'machineId',
      width: 80,
      fixed: 'left',
      sorter: true,
      render: (mid: string | null | undefined) => (
        <Tooltip title={mid ?? 'No Machine ID'}>
          <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted)', cursor: 'default' }}>
            {mid ?? '—'}
          </code>
        </Tooltip>
      ),
    },
    {
      title: <HeaderCell icon={<SettingOutlined />} first="Code" />,
      dataIndex: 'machineCode',
      key: 'machineCode',
      width: 130,
      sorter: true,
      render: (code: string, m: Machine) => {
        const mc = getMachineColor(m);
        return (
          <Tooltip title={m.name ? `${m.machineCode} — ${m.name}` : m.machineCode}>
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
                }}>{code ?? '—'}</span>
              </div>
              {m.serialNumber ? <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.serialNumber}</div> : null}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: <HeaderCell icon={<NumberOutlined />} first="Machine" second="No." />,
      dataIndex: 'machineNumber',
      key: 'machineNumber',
      width: 95,
      render: (n: string | null | undefined, m: Machine) => {
        const v = n ?? m.machineNumber;
        return v ? (
          <Tooltip title={v}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--theme-text-secondary)' }}>
              {v}
            </span>
          </Tooltip>
        ) : (
          <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
        );
      },
    },
    {
      title: <HeaderCell icon={<ApartmentOutlined />} first="Machine" second="Name" />,
      dataIndex: 'name',
      key: 'name',
      width: 175,
      sorter: true,
      render: (_: any, m: Machine) => {
        if (!m.name) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        const mc = getMachineColor(m);
        return (
          <HighlightedCell
            icon={<SettingOutlined />}
            label={m.name}
            labelColor={mc.light.text}
            secondary={m.machineType ?? undefined}
            tooltip={m.name + (m.machineType ? ` (${m.machineType})` : '')}
          />
        );
      },
    },
    {
      title: <HeaderCell icon={<ShopOutlined />} first="Division" second="Section" />,
      key: 'division',
      width: 150,
      render: (_: any, m: Machine) => {
        const d = m.division;
        const s = m.section;
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
      title: <HeaderCell icon={<SubnodeOutlined />} first="Section" />,
      key: 'section',
      width: 105,
      render: (_: any, m: Machine) => (m.section?.name ? (
        <Tooltip title={m.section.name}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', fontSize: 12, color: 'var(--theme-text-secondary)' }}>
            {m.section.name}
          </span>
        </Tooltip>
      ) : (
        <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
      )),
    },
    {
      title: <HeaderCell icon={<TeamOutlined />} first="Department" />,
      key: 'department',
      width: 130,
      render: (_: any, m: Machine) => (m.department?.name ? (
        <HighlightedCell
          icon={<TeamOutlined />}
          label={m.department.name}
          tooltip={m.department.name}
        />
      ) : (
        <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
      )),
    },
    {
      title: <HeaderCell icon={<EnvironmentOutlined />} first="Location" />,
      dataIndex: 'location',
      key: 'location',
      width: 110,
      render: (l: string | null | undefined) => (l ? (
        <Tooltip title={l}>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', fontSize: 12, color: 'var(--theme-text-secondary)' }}>
            {l}
          </span>
        </Tooltip>
      ) : (
        <span style={{ color: 'var(--theme-text-muted)' }}>—</span>
      )),
    },
    {
      title: <HeaderCell icon={<TagsOutlined />} first="Make /" second="Model" />,
      key: 'makeModel',
      width: 150,
      render: (_: any, m: Machine) => {
        const make = m.manufacturer;
        const model = m.model;
        if (!make && !model) return <span style={{ color: 'var(--theme-text-muted)' }}>—</span>;
        return (
          <div style={{ lineHeight: 1.35 }}>
            <Tooltip title={make ?? undefined}>
              <div style={{ fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {make ?? '—'}
              </div>
            </Tooltip>
            {model ? (
              <Tooltip title={model}>
                <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {model}
                </div>
              </Tooltip>
            ) : null}
          </div>
        );
      },
    },
    {
      title: <HeaderCell icon={<AlertOutlined />} first="Criticality" />,
      dataIndex: 'criticality',
      key: 'criticality',
      width: 100,
      sorter: true,
      render: (c: string) => <StatusBadge status={c} colorMap={CRITICALITY_COLORS} />,
    },
    {
      title: <HeaderCell icon={<CheckCircleOutlined />} first="Status" />,
      dataIndex: 'status',
      key: 'status',
      width: 110,
      sorter: true,
      render: (s: string) => <StatusBadge status={s} colorMap={STATUS_COLORS} />,
    },
    {
      title: <HeaderCell first="Actions" />,
      key: 'actions',
      width: 230,
      fixed: 'right',
      align: 'center',
      render: (_: any, m: Machine) => {
        const machineLabel = m.machineCode || m.name || m.machineNumber || 'this record';
        return (
          <TableActions
            className="erp-table-actions--bordered"
            actions={[
              {
                key: 'view',
                label: `View machine — ${machineLabel}`,
                icon: <EyeOutlined />,
                onClick: () => openDetail(m),
                className: 'act-view',
              },
              {
                key: 'edit',
                label: `Edit machine — ${machineLabel}`,
                icon: <EditOutlined />,
                onClick: () => openEdit(m),
                className: 'act-edit',
              },
              {
                key: 'qr',
                label: `QR code — ${machineLabel}`,
                icon: <QrcodeOutlined />,
                onClick: () => showQr(m),
                className: 'act-neutral',
              },
              {
                key: 'print',
                label: `Print barcode — ${machineLabel}`,
                icon: <PrinterOutlined />,
                onClick: () => setPrintModal({ visible: true, machine: m }),
                className: 'act-neutral',
              },
              {
                key: 'delete',
                label: `Delete machine — ${machineLabel}`,
                icon: <DeleteOutlined />,
                danger: true,
                className: 'act-delete',
                confirm: {
                  title: `Delete '${m.machineCode}'?`,
                  description: 'Blocked if referenced by production data.',
                  onConfirm: () => handleDelete(m),
                },
              },
            ]}
            extraActions={[
              <Tooltip key="status" title="Change status">
                <Dropdown
                  menu={{
                    items: [
                      ...(m.status !== 'ACTIVE' ? [{ key: 'ACTIVE', label: 'Set Active' }] : []),
                      ...(m.status !== 'MAINTENANCE' ? [{ key: 'MAINTENANCE', label: 'Set Maintenance' }] : []),
                      ...(m.status !== 'INACTIVE' ? [{ key: 'INACTIVE', label: 'Deactivate' }] : []),
                      ...(m.status !== 'RETIRED' ? [{ key: 'RETIRED', label: 'Retire' }] : []),
                    ],
                    onClick: ({ key }) => handleStatus(m, key),
                  }}
                  trigger={['click']}
                >
                  <Button type="text" size="small" className="act-neutral" icon={<MoreOutlined />} aria-label={`Change status — ${machineLabel}`} />
                </Dropdown>
              </Tooltip>,
            ]}
          />
        );
      },
    },
  ];

  const sortInfo = `Sorted by ${sortBy} (${sortDir.toLowerCase()})`;

  // Unified Add/Edit workspace responsive geometry (ONE movable/resizable popup).
  const isMobile = vw < 768;
  const workspaceStacked = vw < 720;
  const workspace = {
    width: isMobile ? Math.max(360, vw - 16) : vw < 1200 ? 980 : 1040,
    height: isMobile ? 620 : 640,
  };

  return (
    <div style={{ padding: '4px 6px', width: '100%' }}>
      <PageHeader
        icon={<ToolOutlined />}
        title="Machine Master"
        subtitle={`Production machines, tools and equipment · ${total} records`}
        showBreadcrumbs
        extra={
          <>
            <Tooltip title="Reload the machine list">
              <Button icon={<ReloadOutlined />} onClick={() => fetchMachines(page)}>
                Refresh
              </Button>
            </Tooltip>
            <Dropdown menu={{ items: exportMenu, onClick: onExportMenu }}>
              <Button icon={<DownloadOutlined />} loading={exporting || pdfing || printing}>
                Export
              </Button>
            </Dropdown>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              Import
            </Button>
            <Button icon={<FilePdfOutlined />} loading={pdfing} onClick={handleExportPdf}>
              PDF
            </Button>
            <Button icon={<PrinterOutlined />} loading={printing} onClick={handlePrintReport}>
              Print
            </Button>
            <Button icon={<ClearOutlined />} onClick={resetFilters}>
              Clear
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              Add Machine
            </Button>
          </>
        }
      />

      <Card styles={{ body: { paddingBottom: 0 } }} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 4 }}>
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Search by code, name, serial…"
            style={{ width: 280, maxWidth: '100%' }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Badge count={activeFilterCount}>
            <Button icon={<FilterOutlined />} onClick={() => setShowFilters((v) => !v)}>
              Filters
            </Button>
          </Badge>
          <div style={{ flex: 1 }} />
          <Text type="secondary" style={{ fontSize: 12 }}>{sortInfo}</Text>
        </div>
        {showFilters && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, padding: '14px 0 16px', marginTop: 12, borderTop: '1px solid #f0f0f0',
          }}>
            <Input
              allowClear prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Machine ID (e.g. MCH001)"
              value={fMachineId}
              onChange={(e) => { setFMachineId(e.target.value); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Division"
              style={{ width: '100%' }}
              value={fDivision}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Section"
              style={{ width: '100%' }}
              value={fSection}
              options={sectionsForDivision(fDivision).map((s) => ({ value: s.id, label: s.name }))}
              onChange={(v) => { setFSection(v); setFDepartment(undefined); setPage(1); }}
              disabled={!!fDivision && sectionsForDivision(fDivision).length === 0}
            />
            <Select
              allowClear showSearch optionFilterProp="label" placeholder="Department"
              style={{ width: '100%' }}
              value={fDepartment}
              options={(fSection ? departmentsForSection(fSection) : fDivision
                ? departments.filter((d) => d.divisionId === fDivision)
                : departments).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Status"
              style={{ width: '100%' }}
              value={fStatus}
              options={['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'RETIRED'].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
              onChange={(v) => { setFStatus(v); setPage(1); }}
            />
            <Select
              allowClear placeholder="Criticality"
              style={{ width: '100%' }}
              value={fCriticality}
              options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))}
              onChange={(v) => { setFCriticality(v); setPage(1); }}
            />
          </div>
        )}
      </Card>

      {error && (
        <Alert
          type="error"
          showIcon
          message="Could not load machines"
          description={error}
          action={<Button size="small" danger onClick={() => fetchMachines()}>Retry</Button>}
          style={{ marginBottom: 16 }}
          closable
        />
      )}

      <Card title={<span style={{ fontSize: 14, fontWeight: 600 }}>Machines</span>} styles={{ body: { padding: '8px 0 0' } }}>
        <div className="erp-table-container erp-table-container--dense">
          <Table
            rowKey="id"
            columns={columns}
            dataSource={machines}
            loading={loading}
            scroll={{ x: 1600 }}
            sticky
            size="middle"
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              showTotal: (t, range) => `${range[0]}-${range[1]} of ${t} machines`,
              onChange: (p, ps) => { setPage(ps !== pageSize ? 1 : p); setPageSize(ps); },
            }}
            onChange={(_pg, _flt, sorter: any) => {
              if (sorter && sorter.field && !Array.isArray(sorter.field)) {
                const map: Record<string, string> = {
                  machineId: 'machineId', machineCode: 'machineCode', name: 'name', criticality: 'criticality', status: 'status',
                };
                const col = map[sorter.field] || 'machineCode';
                setSortBy(col);
                setSortDir(sorter.order === 'descend' ? 'DESC' : 'ASC');
              }
            }}
            locale={{
              emptyText: (
                <EmptyState
                  title={search || activeFilterCount > 0 ? 'No machines match your filters' : 'No machines found'}
                  description={search || activeFilterCount > 0 ? 'Try adjusting your search or filter criteria.' : 'Get started by adding your first machine.'}
                  actionLabel="Add Machine"
                  onAction={openCreate}
                />
              ),
            }}
          />
        </div>
      </Card>

      <DraggableResizableModal
        title="Machine Details"
        subtitle={detail ? `${detail.name ?? ''}${detail.machineCode ? ` · ${detail.machineCode}` : ''}`.trim() : ' '}
        open={!!detail || detailLoading}
        onCancel={() => { setDetail(null); setDetailLoading(false); setViewSection('identity'); }}
        width={900}
        height={640}
        minWidth={560}
        minHeight={420}
        destroyOnHidden
        styles={{ body: { overflow: 'auto' } }}
        footer={
          detail
            ? [
                <Button key="qr" icon={<QrcodeOutlined />} onClick={() => showQr(detail)}>
                  QR
                </Button>,
                <Button key="edit" type="primary" icon={<EditOutlined />} onClick={() => { const d = detail; setDetail(null); openEdit(d); }}>
                  Edit
                </Button>,
                <Button key="close" onClick={() => { setDetail(null); setDetailLoading(false); setViewSection('identity'); }}>
                  Close
                </Button>,
              ]
            : null
        }
      >
        {detailLoading ? (
          <LoadingState tip="Loading machine details…" />
        ) : detail && detailModel ? (
          <Space direction="vertical" size={14} style={{ width: '100%' }}>
            <div className="erp-modal-nav" style={{ overflowX: 'auto', paddingBottom: 2 }}>
              <Segmented
                block
                size="small"
                value={viewSection}
                onChange={(v) => setViewSection(v as ViewSection)}
                options={VIEW_SECTIONS.map((s) => ({ value: s.key, label: s.label }))}
              />
            </div>

            {viewSection !== 'production' && viewSection !== 'jobcards' && (
              <MachineSection model={detailModel} section={viewSection} />
            )}

            {viewSection === 'production' && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <ScheduleOutlined style={{ color: 'var(--theme-text-secondary)' }} />
                    <Text strong style={{ fontSize: 13 }}>Machine Targets</Text>
                    <div style={{ flex: 1 }} />
                    <Link to="/production/targets" style={{ fontSize: 12 }}>Open Machine Targets</Link>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={prodTargetsLoading}
                    dataSource={prodTargets}
                    pagination={false}
                    locale={{ emptyText: prodTargetsLoading ? ' ' : <Text type="secondary">No machine targets for this machine</Text> }}
                    scroll={{ x: 640 }}
                    columns={[
                      { title: 'Shift', key: 'shift', render: (_, r) => r.shift?.name ?? r.shift?.shiftCode ?? <Text type="secondary">—</Text> },
                      { title: 'Item', key: 'item', render: (_, r) => r.item?.itemCode ?? r.item?.name ?? <Text type="secondary">—</Text> },
                      { title: 'Target Qty', key: 'tq', align: 'right', render: (_, r) => r.targetQuantity ?? <Text type="secondary">—</Text> },
                      { title: 'Std Hrs', key: 'sh', align: 'right', render: (_, r) => r.standardHours ?? <Text type="secondary">—</Text> },
                      { title: 'Effective From', key: 'ef', render: (_, r) => r.effectiveFrom ?? <Text type="secondary">—</Text> },
                      { title: 'Effective To', key: 'et', render: (_, r) => r.effectiveTo ?? <Text type="secondary">—</Text> },
                    ]}
                  />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <BarChartOutlined style={{ color: 'var(--theme-text-secondary)' }} />
                    <Text strong style={{ fontSize: 13 }}>Production History</Text>
                    <div style={{ flex: 1 }} />
                    <Link to="/production/entries" style={{ fontSize: 12 }}>Open Daily Production Entry</Link>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={prodEntriesLoading}
                    dataSource={prodEntries}
                    pagination={false}
                    locale={{ emptyText: prodEntriesLoading ? ' ' : <Text type="secondary">No production entries for this machine</Text> }}
                    scroll={{ x: 640 }}
                    columns={[
                      {
                        title: 'Date', key: 'date', width: 110,
                        render: (_, r) => (r.entryDate ? dayjs(r.entryDate).format('DD-MMM-YYYY') : <Text type="secondary">—</Text>),
                      },
                      { title: 'Shift', key: 'shift', render: (_, r) => r.shift?.name ?? <Text type="secondary">—</Text> },
                      { title: 'Item', key: 'item', render: (_, r) => r.item?.itemCode ?? r.item?.name ?? <Text type="secondary">—</Text> },
                      { title: 'Target', key: 'tq', align: 'right', render: (_, r) => r.targetQuantity ?? <Text type="secondary">—</Text> },
                      { title: 'Actual', key: 'aq', align: 'right', render: (_, r) => r.actualQuantity ?? <Text type="secondary">—</Text> },
                      {
                        title: 'Achievement %', key: 'ach', align: 'right',
                        render: (_, r) => (r.achievementPercentage != null ? `${r.achievementPercentage}%` : <Text type="secondary">—</Text>),
                      },
                    ]}
                  />
                </Space>
              )}

              {viewSection === 'jobcards' && (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <HistoryOutlined style={{ color: 'var(--theme-text-secondary)' }} />
                    <Text strong style={{ fontSize: 13 }}>Job Card History</Text>
                    <div style={{ flex: 1 }} />
                    <Link to="/maintenance/job-cards" style={{ fontSize: 12 }}>Open Job Cards</Link>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    loading={jobCardsLoading}
                    dataSource={jobCards}
                    pagination={false}
                    locale={{ emptyText: jobCardsLoading ? ' ' : <EmptyState title="No job card history available for this machine." description="Job cards raised against this machine will appear here." /> }}
                    scroll={{ x: 880 }}
                    columns={[
                      {
                        title: 'Job Card No', key: 'no', width: 130,
                        render: (_, r) => (r.jobCardNo ? <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted)' }}>{r.jobCardNo}</code> : <Text type="secondary">—</Text>),
                      },
                      { title: 'Requested Date', key: 'rd', width: 110, render: (_, r) => (r.requestedAt ? fmtDate(r.requestedAt) : <Text type="secondary">—</Text>) },
                      { title: 'Complaint', key: 'cm', ellipsis: true, render: (_, r) => r.complaint ?? <Text type="secondary">—</Text> },
                      { title: 'Status', key: 'st', render: (_, r) => (r.currentStatus ? badge(r.currentStatus) : <Text type="secondary">—</Text>) },
                      { title: 'Priority', key: 'pr', render: (_, r) => (r.priority ? label(r.priority) : <Text type="secondary">—</Text>) },
                      { title: 'Type', key: 'ty', render: (_, r) => (r.maintenanceType ? label(r.maintenanceType) : <Text type="secondary">—</Text>) },
                      { title: 'Requested By', key: 'rb', ellipsis: true, render: (_, r) => r.requestedByUser?.fullName ?? r.requestedByUser?.name ?? r.requestedByUser?.email ?? <Text type="secondary">—</Text> },
                      { title: 'Started', key: 'sa', width: 120, render: (_, r) => (r.startedAt ? fmtDateTime(r.startedAt) : <Text type="secondary">—</Text>) },
                      { title: 'Closed', key: 'cl', width: 120, render: (_, r) => (r.closedAt ? fmtDateTime(r.closedAt) : <Text type="secondary">—</Text>) },
                      { title: 'Downtime', key: 'dt', align: 'right', render: (_, r) => (r.downtimeMinutes != null ? fmtMinutes(r.downtimeMinutes) : <Text type="secondary">—</Text>) },
                    ]}
                  />
                </Space>
              )}
            </Space>
          ) : null}
      </DraggableResizableModal>

      <FormModal
        open={modalVisible}
        editing={editing}
        saving={saving}
        form={form}
        formDivisionId={formDivisionId}
        formSectionId={formSectionId}
        divisions={divisions}
        sections={sections}
        departments={departments}
        sectionsForDivision={sectionsForDivision}
        departmentsForSection={departmentsForSection}
        width={workspace.width}
        height={workspace.height}
        minWidth={isMobile ? Math.min(340, vw - 16) : 720}
        minHeight={420}
        stacked={workspaceStacked}
        previewModel={previewModel}
        onCancel={() => setModalVisible(false)}
        onOk={handleSave}
        onFormTick={() => setFormTick((t) => t + 1)}
      />

      <Modal
        title={`QR Code — ${qrModal.machine?.machineCode ?? ''}`}
        open={qrModal.visible}
        onCancel={() => setQrModal({ visible: false, machine: null, dataUrl: '', payload: '', url: '' })}
        footer={[
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={printQr}>
            Print Label
          </Button>,
        ]}
        centered
      >
        <div style={{ textAlign: 'center' }}>
          {qrModal.machine && (
            <>
              <h3 style={{ marginBottom: 4 }}>{qrModal.machine.name}</h3>
              <p style={{ color: 'var(--theme-text-muted)', marginTop: 0 }}>
                <b>{qrModal.machine.machineId}</b> · {qrModal.machine.machineCode}
                {qrModal.machine.location ? ` · ${qrModal.machine.location}` : ''}
              </p>
            </>
          )}
          {qrModal.dataUrl && <img src={qrModal.dataUrl} alt="Machine QR" style={{ width: 260, height: 260 }} />}
          <p style={{ marginTop: 8 }}>
            <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{qrModal.url || qrModal.payload}</code>
          </p>
        </div>
      </Modal>
      <BarcodePrint
        open={printModal.visible}
        onClose={() => setPrintModal({ visible: false, machine: null })}
        itemCode={printModal.machine?.machineCode || ''}
        itemName={printModal.machine?.name || ''}
        barcode={printModal.machine?.qrPayload || null}
        companyName="PWI ERP"
      />

      <SaveResultDialog
        open={resultOpen}
        phase={resultPhase}
        result={resultData}
        errorMessage={resultError}
        onRetry={handleResultRetry}
        onClose={handleResultClose}
        successTitle="Successful Save"
        okLabel="OK"
      />

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
            Import Machines
          </span>
        }
        subtitle="Bulk import from CSV — Machine Code and Machine Name required, remaining fields optional"
        styles={{ body: { overflow: 'auto' } }}
      >
        {importRows.length === 0 && !importSummary && (
          <div style={{ padding: '8px 0' }}>
            <Alert
              type="info"
              showIcon
              message="CSV import with validation and preview"
              description="Upload a CSV file with machine data. Each row is validated before import. Rows with missing required fields or duplicate machine codes will be rejected."
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
                Required columns: Machine Code, Machine Name. Optional: Machine Number, Machine Type, Manufacturer, Model, Serial Number, Location, Capacity, Power Rating, Criticality, Status, Installation Date, Warranty Expiry, Description.
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
                {
                  title: 'Machine Name', width: 180,
                  render: (_: unknown, r: ImportRow) => r.data['machineName'] || r.data['Machine Name'] || r.data['machinename'] || '',
                },
                {
                  title: 'Type', width: 110,
                  render: (_: unknown, r: ImportRow) => r.data['machineType'] || r.data['Machine Type'] || r.data['machinetype'] || '—',
                },
                {
                  title: 'Status', width: 90,
                  render: (_: unknown, r: ImportRow) => r.data['status'] || r.data['Status'] || 'ACTIVE',
                },
                {
                  title: 'Result', width: 90,
                  render: (_: unknown, r: ImportRow) => {
                    if (r.status === 'VALID') return <span style={{ color: '#1a7f37', fontWeight: 600 }}>Valid</span>;
                    return <span style={{ color: '#c0392b', fontWeight: 600 }}>Invalid</span>;
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
            <div style={{ marginTop: 12 }}>Importing machines… this may take a moment.</div>
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
              <Descriptions.Item label="Duplicate rows">{importSummary.duplicate}</Descriptions.Item>
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
    </div>
  );
};

interface FormModalProps {
  open: boolean;
  editing: Machine | null;
  saving: boolean;
  form: ReturnType<typeof Form.useForm>[0];
  formDivisionId: string | undefined;
  formSectionId: string | undefined;
  divisions: DivisionLk[];
  sections: SectionLk[];
  departments: DepartmentLk[];
  sectionsForDivision: (divisionId?: string) => SectionLk[];
  departmentsForSection: (sectionId?: string) => DepartmentLk[];
  onCancel: () => void;
  onOk: () => void;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  /** Stack the Form pane above the Details pane instead of side-by-side (mobile). */
  stacked?: boolean;
  /** Live pre-save preview bag rendered in the right-hand Details pane. */
  previewModel?: MachineDetailModel | null;
  onFormTick?: () => void;
}

const FormModal: React.FC<FormModalProps> = ({
  open, editing, saving, form, formDivisionId, formSectionId,
  divisions, sections, departments, sectionsForDivision, departmentsForSection,
  width, height, minWidth, minHeight, stacked, previewModel, onCancel, onOk, onFormTick,
}) => (
  <DraggableResizableModal
    title={editing ? `Edit Machine — ${editing.machineCode}` : 'Add Machine'}
    subtitle={editing ? 'Form · updates the existing record' : 'Form · live Machine Details preview'}
    open={open}
    width={width}
    height={height}
    minWidth={minWidth}
    minHeight={minHeight}
    onOk={onOk}
    confirmLoading={saving}
    onCancel={onCancel}
    okText={editing ? 'Save Changes' : 'Save'}
  >
    <div className={`erp-workspace-panes${stacked ? ' erp-workspace-panes--column' : ''}`}>
      <div className="erp-workspace-pane erp-pane-form edit-form-scroll">
        <div className="erp-workspace-pane-title">
          {editing ? 'Edit Machine Form' : 'Add Machine Form'}
        </div>
        <Form form={form} layout="vertical" requiredMark="optional" onValuesChange={onFormTick}>
          <FormGroup title="Machine Identity">
            <Form.Item label="Machine ID" style={{ marginBottom: 8 }}>
              <Input
                value={editing?.machineId ?? ''}
                placeholder="Auto-generated on save (MCH###)"
                disabled
                style={{ maxWidth: 200, fontWeight: 600 }}
              />
            </Form.Item>
            <Form.Item
              name="machineCode" label="Machine Code"
              rules={[{ required: true, max: 50, message: 'Unique code, max 50 chars' }]}
            >
              <Input placeholder="e.g. HD-04" />
            </Form.Item>
            <Form.Item name="machineNumber" label="Machine Number">
              <Input placeholder="e.g. MM-1001" maxLength={60} />
            </Form.Item>
            <Form.Item
              name="name" label="Machine Name"
              rules={[{ required: true, max: 255, message: 'Name is required' }]}
            >
              <Input placeholder="e.g. Header Machine 04" maxLength={255} />
            </Form.Item>
            <Form.Item name="machineType" label="Machine Type">
              <Input placeholder="e.g. Cold Forge" maxLength={100} />
            </Form.Item>
          </FormGroup>

          <FormGroup title="Organization">
            <Form.Item name="divisionId" label="Division">
              <Select
                allowClear showSearch optionFilterProp="label" placeholder="Select division"
                options={divisions.map((d) => ({ value: d.id, label: d.name }))}
                onChange={() => {
                  form.setFieldValue('sectionId', undefined);
                  form.setFieldValue('departmentId', undefined);
                }}
              />
            </Form.Item>
            <Form.Item name="sectionId" label="Section">
              <Select
                allowClear showSearch optionFilterProp="label" placeholder="Select section"
                options={sectionsForDivision(formDivisionId).map((s) => ({ value: s.id, label: s.name }))}
                onChange={() => form.setFieldValue('departmentId', undefined)}
              />
            </Form.Item>
            <Form.Item name="departmentId" label="Department">
              <Select
                allowClear showSearch optionFilterProp="label" placeholder="Select department"
                options={(formSectionId ? departmentsForSection(formSectionId) : formDivisionId
                  ? departments.filter((d) => d.divisionId === formDivisionId)
                  : departments).map((d) => ({ value: d.id, label: d.name }))}
              />
            </Form.Item>
          </FormGroup>

          <FormGroup title="Location & Classification">
            <Form.Item name="location" label="Location">
              <Input placeholder="e.g. Hall A / Bay 3" maxLength={255} />
            </Form.Item>
            <Form.Item name="criticality" label="Criticality" initialValue="MEDIUM">
              <Select options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }))} />
            </Form.Item>
          </FormGroup>

          <FormGroup title="Technical Information">
            <Form.Item name="manufacturer" label="Manufacturer">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="model" label="Model">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item name="serialNumber" label="Serial Number">
              <Input maxLength={120} />
            </Form.Item>
            <Form.Item
              name="capacity" label="Capacity"
              tooltip="Numeric capacity (up to 4 decimals); unit goes in Power Rating / Description"
            >
              <InputNumber placeholder="e.g. 120" min={0} step={0.0001} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="powerRating" label="Power Rating">
              <Input placeholder="e.g. 15 kW" maxLength={60} />
            </Form.Item>
          </FormGroup>

          <FormGroup title="Dates">
            <Form.Item name="installationDate" label="Installation Date">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="warrantyExpiryDate" label="Warranty Expiry"
              dependencies={['installationDate']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    const inst = getFieldValue('installationDate');
                    if (!value || !inst || !value.isBefore(inst)) return Promise.resolve();
                    return Promise.reject(new Error('Warranty expiry must be after installation date'));
                  },
                }),
              ]}
            >
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </FormGroup>

          <FormGroup title="Additional" marginBottom={0}>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={2} maxLength={2000} />
            </Form.Item>
          </FormGroup>
        </Form>
      </div>

      <div className="erp-workspace-pane erp-pane-details">
        <div className="erp-workspace-pane-title">Machine Details</div>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          {editing
            ? 'Live preview of the Edit Machine form — changes update the details immediately.'
            : 'Live preview of the Add Machine form — Machine ID and Status are generated on save.'}
        </Text>
        {previewModel ? (
          <>
            <MachineSection model={previewModel} section="identity" showTitle />
            <MachineSection model={previewModel} section="org" showTitle />
            <MachineSection model={previewModel} section="tech" showTitle />
            <MachineSection model={previewModel} section="dates" showTitle />
          </>
        ) : (
          <LoadingState tip="Preparing preview…" />
        )}
      </div>
    </div>
  </DraggableResizableModal>
);

export default MachineManagement;
