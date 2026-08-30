import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App as AntApp, Button, Card, Col, Dropdown, Input, Modal, Pagination, Row, Select,
  Space, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined,
  FilePdfOutlined, PrinterOutlined, FilterOutlined, ClearOutlined, CaretDownOutlined, ImportOutlined,
  EyeOutlined, DeleteOutlined, PlayCircleOutlined, CheckCircleOutlined, TeamOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import { EmptyState, LoadingState, StatusBadge } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import {
  JOB_CARD_BASE, JOB_CARD_STATUSES, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES,
  JobCard, OrgOption,
  UUID_RE, errorText, label, ACTION_MAP, NEXT_ACTION_LABEL,
} from './jobCards.types';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { JOB_CARD_DASH_COUNTER as DASH_COUNTER, syncMaintenanceQueueBadges } from '../../components/layout/maintenanceQueueBadges';
import { STATUS_COLORS, tint, shadowSm, panelCard } from './maintTheme';
import { useMaintenanceHierarchy, divisionLabel, sectionLabel, departmentLabel } from './useMaintenanceHierarchy';
import './maintTheme.css';

const { Text } = Typography;

const ALL = '__all__';
const ALL_OPTION = { value: ALL, label: 'All' };

/** Top summary cards (workflow queues) on the All Job Cards page. */
const QUEUE_KEYS: Array<{ statuses: string[]; colorKey: string; label: string; key: string }> = [
  { statuses: [], colorKey: 'ALL', label: 'ALL', key: 'total' },
  { statuses: ['OPEN', 'ASSIGNED'], colorKey: 'OPEN', label: 'STARTED', key: 'started' },
  { statuses: ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'], colorKey: 'IN_PROGRESS', label: 'CLOSED · IN WORK', key: 'closed' },
  { statuses: ['PENDING_VERIFICATION'], colorKey: 'PENDING_VERIFICATION', label: 'PENDING REVIEW', key: 'review' },
  { statuses: ['REJECTED'], colorKey: 'REJECTED', label: 'RETURNED', key: 'returned' },
  { statuses: ['CLOSED', 'APPROVED'], colorKey: 'CLOSED', label: 'COMPLETE', key: 'complete' },
];

const USER_PERMISSIONS = {
  create: 'maintenance.job_card.create',
  view: 'maintenance.job_card.view',
  update: 'maintenance.job_card.update',
  delete: 'maintenance.job_card.delete',
};

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const userName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.id)) || '—';
/**
 * Human-readable technician names for the Job Card table. Internal employee /
 * user identifiers (employee IDs, UUIDs) are intentionally excluded here —
 * they belong only in the detailed view where an exact identity is required,
 * never in the main table.
 */
const technicianNames = (r: JobCard) => {
  const ts = (Array.isArray(r.technicians) ? r.technicians : []).slice().sort((a: any, b: any) => (a.role === 'PRIMARY' ? -1 : 1) - (b.role === 'PRIMARY' ? -1 : 1));
  return ts.length ? ts.map((t: any) => {
    const m = t.technician;
    if (m) {
      return m.technicianName || '—';
    }
    return userName(t.technicianUser);
  }).join(', ') : '';
};

type FlatFilters = {
  companyId?: string;
  divisionId?: string;
  sectionId?: string;
  assignedDepartmentId?: string;
  machineId?: string;
  statuses?: string[];
  priority?: string;
  maintenanceType?: string;
  dateFrom?: string;
  dateTo?: string;
  search: string;
};

const emptyFilters = (companyId?: string): FlatFilters => ({
  companyId: companyId || undefined,
  divisionId: undefined,
  sectionId: undefined,
  assignedDepartmentId: undefined,
  machineId: undefined,
  statuses: undefined,
  priority: undefined,
  maintenanceType: undefined,
  dateFrom: undefined,
  dateTo: undefined,
  search: '',
});

export const JobCardList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = AntApp.useApp();
  const { user, can } = usePermission();

  const [rows, setRows] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<FlatFilters>(() => emptyFilters(user?.defaultCompanyId));
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [machines, setMachines] = useState<OrgOption[]>([]);

  const companyId = filters.companyId || user?.defaultCompanyId;
  const activeFilterCount = useMemo(() => ['machineId', 'divisionId', 'sectionId', 'assignedDepartmentId', 'statuses', 'priority', 'maintenanceType', 'dateFrom', 'dateTo']
    .filter(k => k === 'statuses' ? (filters.statuses || []).length > 0 : (filters as any)[k]).length, [filters]);

  useEffect(() => {
    const s = searchParams.get('status');
    const sts = searchParams.get('statuses');
    const m = searchParams.get('machineId');
    const d = searchParams.get('divisionId');
    const se = searchParams.get('sectionId');
    const dep = searchParams.get('departmentId');
    setFilters(f => {
      const next = { ...f };
      if (sts) {
        const list = sts.split(',').map(v => v.trim()).filter(v => JOB_CARD_STATUSES.includes(v));
        next.statuses = list.length ? list : undefined;
      } else if (s && JOB_CARD_STATUSES.includes(s)) {
        next.statuses = [s];
      } else {
        next.statuses = undefined;
      }
      if (m && UUID_RE.test(m)) next.machineId = m;
      else if (!m) delete next.machineId;
      if (d && UUID_RE.test(d)) next.divisionId = d;
      else if (!d) delete next.divisionId;
      if (se && UUID_RE.test(se)) next.sectionId = se;
      else if (!se) delete next.sectionId;
      if (dep && UUID_RE.test(dep)) next.assignedDepartmentId = dep;
      else if (!dep) delete next.assignedDepartmentId;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const { divisions, sections, departments } = useMaintenanceHierarchy(companyId, filters.divisionId, filters.sectionId);

  const machinesReq = useRef(0);
  useEffect(() => {
    if (!companyId) { setMachines([]); return; }
    const reqId = ++machinesReq.current;
    setMachines([]);
    const params: Record<string, string | number> = { limit: 1000, sortBy: 'machineCode', sortDir: 'ASC' };
    if (filters.divisionId) params.divisionId = filters.divisionId;
    if (filters.sectionId) params.sectionId = filters.sectionId;
    if (filters.assignedDepartmentId) params.departmentId = filters.assignedDepartmentId;
    apiService.get<any>('/machines', params)
      .then(r => { if (machinesReq.current !== reqId) return; setMachines((r?.data || r || []).filter((m: any) => m && m.id)); })
      .catch(() => { if (machinesReq.current === reqId) setMachines([]); });
  }, [companyId, filters.divisionId, filters.sectionId, filters.assignedDepartmentId]);

  const machineOptionLabel = (m: OrgOption): string => {
    const number = m.machineNumber || m.machineCode || m.machineId || '';
    const name = m.name || m.machineName || number;
    return number && name && number !== name ? `${number} — ${name}` : (number || name || 'Unnamed machine');
  };

  const loadQueue = useCallback(async () => {
    if (!companyId) return;
    const params: Record<string, string> = { companyId };
    if (filters.divisionId) params.divisionId = filters.divisionId;
    if (filters.sectionId) params.sectionId = filters.sectionId;
    if (filters.assignedDepartmentId) params.departmentId = filters.assignedDepartmentId;
    if (filters.machineId) params.machineId = filters.machineId;
    if (filters.search) params.search = filters.search;
    try {
      const d = await apiService.get<any>('/master-data/maintenance/job-cards/dashboard', params);
      if (d && typeof d === 'object' && !Array.isArray(d) && typeof d.total === 'number') {
        setQueue(d);
      } else {
        setQueue({});
      }
    } catch {
      setQueue({});
    }
  }, [companyId, filters.divisionId, filters.sectionId, filters.assignedDepartmentId, filters.machineId, filters.search]);
  useEffect(() => { loadQueue(); }, [loadQueue]);

  useEffect(() => {
    document.title = 'Maintenance Job Cards | PWI — Pakistan Wire & Industry';
    return () => { document.title = 'PWI — Pakistan Wire & Industry | ERP / MRP Command Center'; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params: Record<string, any> = { page, limit: pageSize };
      if (filters.statuses && filters.statuses.length) params.statuses = filters.statuses.join(',');
      for (const key of ['companyId', 'divisionId', 'sectionId', 'assignedDepartmentId', 'machineId'] as const) {
        const value = filters[key];
        if (value && UUID_RE.test(String(value))) params[key] = value;
      }
      if (filters.priority) params.priority = filters.priority;
      if (filters.maintenanceType) params.maintenanceType = filters.maintenanceType;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;
      const result = await apiService.get<{ data: JobCard[]; total: number }>(JOB_CARD_BASE, params);
      setRows(result.data || []); setTotal(result.total || 0);
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [filters, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const setFilter = (patch: Record<string, any>) => { setPage(1); setFilters(f => ({ ...f, ...patch })); };

  const writeUrlFilters = (next: FlatFilters) => {
    const u = new URLSearchParams(searchParams);
    const statuses = next.statuses || [];
    if (statuses.length) u.set('statuses', statuses.join(','));
    else u.delete('statuses');
    u.delete('status');
    const pairs: Array<[string, string | undefined]> = [
      ['machineId', next.machineId],
      ['divisionId', next.divisionId],
      ['sectionId', next.sectionId],
      ['departmentId', next.assignedDepartmentId],
    ];
    for (const [key, value] of pairs) {
      if (value && UUID_RE.test(String(value))) u.set(key, String(value));
      else u.delete(key);
    }
    setSearchParams(u);
  };

  const setFilterWithUrl = (patch: Record<string, any>) => {
    setPage(1);
    const next = { ...filters, ...patch } as FlatFilters;
    setFilters(next);
    writeUrlFilters(next);
  };

  const onDivisionChange = (value?: string) => setFilterWithUrl({ divisionId: value, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined });
  const onSectionChange = (value?: string) => setFilterWithUrl({ sectionId: value, assignedDepartmentId: undefined, machineId: undefined });
  const onDepartmentChange = (value?: string) => setFilterWithUrl({ assignedDepartmentId: value, machineId: undefined });
  const onMachineChange = (value?: string) => setFilterWithUrl({ machineId: value });

  useEffect(() => {
    setFilters(f => {
      let next = f;
      if (f.sectionId && f.divisionId && sections.length && !sections.some(s => s.id === f.sectionId)) {
        next = { ...next, sectionId: undefined, assignedDepartmentId: undefined, machineId: undefined };
      }
      if (f.assignedDepartmentId && f.sectionId && departments.length && !departments.some(d => d.id === f.assignedDepartmentId)) {
        next = { ...next, assignedDepartmentId: undefined, machineId: undefined };
      }
      if (f.machineId && machines.length && !machines.some(m => m.id === f.machineId)) {
        next = { ...next, machineId: undefined };
      }
      return next;
    });
  }, [divisions, sections, departments, machines]);

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchInput(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => { setPage(1); setFilters(f => ({ ...f, search: value })); }, 400);
  };

  const resetAll = () => { setPage(1); setSearchInput(''); setFilters(emptyFilters(user?.defaultCompanyId)); setShowFilters(false); setSearchParams({}); };

  const remove = async (id: string) => {
    try { await apiService.delete(`${JOB_CARD_BASE}/${id}`); message.success('Job card deleted'); load(); loadQueue(); if (companyId) void syncMaintenanceQueueBadges(companyId); }
    catch (e) { message.error(errorText(e)); }
  };

  const runQuick = async (r: JobCard, action: { label: string; endpoint: string; permission: string }) => {
    const modalEndpoints = ['assign', 'complete', 'start', 'verify', 'reject', 'approve'];
    if (modalEndpoints.includes(action.endpoint)) {
      const param = action.endpoint === 'verify' ? 'review'
        : action.endpoint === 'reject' ? 'return'
        : action.endpoint;
      navigate(`/maintenance/job-cards/${r.id}?action=${param}`);
      return;
    }
    Modal.confirm({
      title: `${action.label} this job card?`,
      content: `${r.jobCardNo || r.id}`,
      onOk: async () => {
        try {
          await apiService.post(`${JOB_CARD_BASE}/${r.id}/${action.endpoint}`, action.endpoint === 'reject' ? { reason: 'Rejected during review' } : {});
          message.success(`${action.label} completed`);
          load(); loadQueue(); if (companyId) void syncMaintenanceQueueBadges(companyId);
        } catch (e) { message.error(errorText(e)); throw e; }
      },
    });
  };

  const nextActionOf = (r: JobCard) => (ACTION_MAP[r.currentStatus] || []).find(a => can(a.permission));

  /**
   * Responsive action-button helper for a Job Card table row. Returns a single
   * conflict-free action strip: an optional workflow primary action (driven by
   * the current status AND the operator's permissions), a View icon button,
   * and — only on non-All queues for an OPEN card with delete rights — a
   * Delete icon button. No generic dropdown, no duplicated View/Edit.
   */
  const IsAllView = (filters.statuses || []).length === 0;

  const viewActionBtn = (r: JobCard) => (
    <Tooltip title="View Job Card">
      <Button
        className="jc-view-btn"
        icon={<EyeOutlined />}
        aria-label={`View Job Card ${r.jobCardNo || ''}`}
        onClick={() => navigate(`/maintenance/job-cards/${r.id}`)}
      />
    </Tooltip>
  );

  const actionIcon = (endpoint: string) => {
    if (endpoint === 'assign') return <TeamOutlined />;
    if (endpoint === 'start' || endpoint === 'resume' || endpoint === 'submit-for-verification') return <PlayCircleOutlined />;
    if (endpoint === 'complete' || endpoint === 'verify' || endpoint === 'approve') return <CheckCircleOutlined />;
    return undefined;
  };

  const renderRowActions = (_: any, r: JobCard) => {
    // All Job Cards is a historical / read-only view — View only.
    if (IsAllView) return viewActionBtn(r);

    const action = nextActionOf(r);
    return (
      <Space wrap size={4} className="jc-actions">
        {action && (
          <Button
            className="jc-action-primary"
            size="small"
            type="primary"
            icon={actionIcon(action.endpoint)}
            onClick={() => runQuick(r, action)}
          >
            {action.label}
          </Button>
        )}
        {viewActionBtn(r)}
        {can(USER_PERMISSIONS.delete) && r.currentStatus === 'OPEN' && (
          <Tooltip title="Delete">
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              aria-label={`Delete Job Card ${r.jobCardNo || ''}`}
              onClick={() => Modal.confirm({ title: 'Are you sure you want to delete this Job Card?', onOk: () => remove(r.id) })}
            />
          </Tooltip>
        )}
      </Space>
    );
  };

  const machineDisplay = (r: JobCard) => {
    const m = r.machine;
    if (!m) return { name: 'Unnamed machine', code: '—' };
    return { name: m.name || m.machineName || 'Unnamed machine', code: m.machineCode || m.machineNumber || '—' };
  };

  const buildExportRows = async () => {
    const params: Record<string, any> = { limit: 10000 };
    if (filters.statuses && filters.statuses.length) params.statuses = filters.statuses.join(',');
    for (const key of ['companyId', 'divisionId', 'sectionId', 'assignedDepartmentId', 'machineId'] as const) {
      const value = filters[key];
      if (value && UUID_RE.test(String(value))) params[key] = value;
    }
    if (filters.priority) params.priority = filters.priority;
    if (filters.maintenanceType) params.maintenanceType = filters.maintenanceType;
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.search) params.search = filters.search;
    const result = await apiService.get<{ data: JobCard[] }>(JOB_CARD_BASE, params);
    return result.data || [];
  };

  const exportCsv = async () => {
    try {
      const dataList = await buildExportRows();
      if (!dataList.length) { message.info('No job cards to export'); return; }
      const header = ['Job Card No', 'Machine', 'Machine Code', 'Complaint', 'Maintenance Type', 'Priority', 'Technicians', 'Department', 'Status', 'Requested'];
      const esc = (v: any) => { const s = v == null ? '' : String(v); return `"${s.replace(/"/g, '""')}"`; };
      const lines = dataList.map(r => {
        const m = machineDisplay(r);
        return [r.jobCardNo, m.name, m.code, r.complaint, r.maintenanceType, r.priority, technicianNames(r), r.assignedDepartment?.name || '', r.currentStatus, r.requestedAt ? new Date(r.requestedAt).toLocaleString() : ''].map(esc).join(',');
      });
      const blob = new Blob(['\uFEFF' + [header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `maintenance-job-cards-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      message.success(`Exported ${dataList.length} job cards to CSV`);
    } catch (e) { message.error(errorText(e)); }
  };

  const exportPdf = async () => {
    try {
      const dataList = await buildExportRows();
      if (!dataList.length) { message.info('No job cards to export'); return; }
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(14);
      doc.text('Maintenance Job Cards', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString()} \u00B7 ${dataList.length} record(s)`, 40, 55);
      const head = [['Job Card No', 'Machine', 'Code', 'Complaint', 'Type', 'Priority', 'Assigned To', 'Department', 'Status', 'Requested']];
      const body = dataList.map(r => {
        const m = machineDisplay(r);
        return [
          String(r.jobCardNo || ''),
          m.name,
          m.code,
          String(r.complaint || ''),
          label(r.maintenanceType).replace(/_/g, ' '),
          String(r.priority || ''),
          technicianNames(r),
          r.assignedDepartment?.name || '',
          label(r.currentStatus).replace(/_/g, ' '),
          r.requestedAt ? new Date(r.requestedAt).toLocaleString() : '',
        ];
      });
      autoTable(doc, { head, body, startY: 70, styles: { fontSize: 8, cellPadding: 4 }, headStyles: { fillColor: [31, 41, 55], textColor: 255 }, alternateRowStyles: { fillColor: [245, 245, 245] } });
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i += 1) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(120);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
      }
      doc.save(`maintenance-job-cards-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success(`Exported ${dataList.length} job cards to PDF`);
    } catch (e) { message.error(errorText(e)); }
  };

  const printWindow = async () => {
    const dataList = (await buildExportRows()).slice(0, 500);
    if (!dataList.length) { message.info('No job cards to export'); return; }
    const rowHtml = dataList.map(r => {
      const m = machineDisplay(r);
      return `<tr><td>${(r.jobCardNo || '').replace(/[<>&]/g, '')}</td><td>${m.name.replace(/[<>&]/g, '')}</td><td>${m.code.replace(/[<>&]/g, '')}</td><td>${(r.complaint || '').replace(/[<>&]/g, '')}</td><td>${(r.maintenanceType || '').replace(/_/g, ' ')}</td><td>${(r.priority || '').replace(/[<>&]/g, '')}</td><td>${technicianNames(r).replace(/[<>&]/g, '')}</td><td>${((r.assignedDepartment?.name) || '').replace(/[<>&]/g, '')}</td><td>${(r.currentStatus || '').replace(/_/g, ' ')}</td></tr>`;
    }).join('');
    const html = `<!doctype html><html><head><title>Maintenance Job Cards</title><style>body{font-family:Arial,sans-serif;margin:24px}h1{font-size:20px;margin-bottom:4px}p{color:#555;margin-bottom:16px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}th{background:#f0f0f0}th,tbody tr:nth-child(even){background:#fafafa}@media print{@page{size:landscape;margin:12mm}}</style></head><body><h1>Maintenance Job Cards</h1><p>Generated ${new Date().toLocaleString()} · ${dataList.length} record(s)</p><table><thead><tr><th>Job Card No</th><th>Machine</th><th>Code</th><th>Complaint</th><th>Type</th><th>Priority</th><th>Technicians</th><th>Department</th><th>Status</th></tr></thead><tbody>${rowHtml}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) message.warning('Popup blocked — please allow popups for this site to print.');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [showImportHelp, setShowImportHelp] = useState(false);

  const triggerImport = useCallback(() => {
    if (!companyId) { message.warning('No company selected. Please switch to an active company to import job cards.'); return; }
    fileInputRef.current?.click();
  }, [companyId, message]);

  const downloadTemplate = useCallback(() => {
    const header = 'jobCardNo,machineCode,complaint,priority,maintenanceType,description,requestedAt,assignedDepartmentId';
    const sample = ',MC001,Example complaint,HIGH,PREVENTIVE,"Free-text description here",2026-08-28,';
    const blob = new Blob(['\uFEFF' + [header, sample].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'maintenance-job-card-import-template.csv';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }, []);

  const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) { message.error('Please select a CSV file.'); return; }
    if (!companyId) { message.warning('No company selected.'); return; }
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('companyId', companyId);
      const res = await apiService.upload<any>(`${JOB_CARD_BASE}/import`, fd);
      setImportResult(res);
      if (res && res.imported > 0) {
        message.success(`Imported ${res.imported} job card(s).`);
        load(); loadQueue(); if (companyId) void syncMaintenanceQueueBadges(companyId);
      } else {
        message.warning('No job cards were imported. Review the report for details.');
      }
    } catch (err) {
      message.error(errorText(err));
    } finally {
      setImporting(false);
    }
  }, [companyId, message, load, loadQueue]);

  const columns: ColumnsType<JobCard> = [
    {
      title: 'Job Card', key: 'job', width: 160, fixed: 'left',
      render: (_: any, r: JobCard) => (
        <div>
          <a href={`#/maintenance/job-cards/${r.id}`} onClick={(e) => { e.preventDefault(); navigate(`/maintenance/job-cards/${r.id}`); }} style={{ fontWeight: 600 }}>{r.jobCardNo || r.id}</a>
          <div><Text type="secondary" style={{ fontSize: 12 }}>{r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : '—'}</Text></div>
        </div>
      ),
    },
    {
      title: 'Machine', key: 'machine', width: 180,
      render: (_: any, r: JobCard) => { const m = machineDisplay(r); return (<div><div>{m.name}</div><div><Text type="secondary" style={{ fontSize: 12 }}>{m.code}</Text></div></div>); },
    },
    {
      title: 'Complaint', dataIndex: 'complaint', key: 'complaint', width: 260, ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><span>{v}</span></Tooltip> : '—',
    },
    { title: 'Type', dataIndex: 'maintenanceType', key: 'type', width: 110, render: (v: string) => <Tag color={v === 'BREAKDOWN' ? 'red' : v === 'PREVENTIVE' ? 'green' : v === 'EMERGENCY' ? 'volcano' : 'blue'}>{label(v)}</Tag> },
    { title: 'Priority', dataIndex: 'priority', key: 'priority', width: 100, render: (v: string) => <Tag color={v === 'CRITICAL' ? 'red' : v === 'HIGH' ? 'orange' : v === 'MEDIUM' ? 'blue' : 'default'}>{label(v)}</Tag> },
    {
      title: 'Assigned To', key: 'assigned', width: 180,
      render: (_: any, r: JobCard) => { const t = technicianNames(r); return t ? <span>{t}</span> : <Tag>Unassigned</Tag>; },
    },
    { title: 'Department', key: 'dept', width: 150, render: (_: any, r: JobCard) => (r.assignedDepartment && (r.assignedDepartment.name || r.assignedDepartment.departmentCode)) || '—' },
    { title: 'Status', dataIndex: 'currentStatus', key: 'status', width: 150, render: (v: string) => <StatusBadge status={v} /> },
    {
      title: 'Next Action', key: 'next', width: 150,
      render: (_: any, r: JobCard) => {
        const nxt = NEXT_ACTION_LABEL[r.currentStatus] || (nextActionOf(r) || {}).label || '—';
        return <Tag color="geekblue">{nxt}</Tag>;
      },
    },
    {
      title: 'Actions', key: 'actions', width: 240, fixed: 'right',
      render: renderRowActions,
    },
  ];

  const createContext = () => {
    const machine = machines.find(v => v.id === filters.machineId);
    if (!machine || !UUID_RE.test(String(machine.id))) return undefined;
    const machineId = machine.id;
    const machineName = machine.name || machine.machineName || machineOptionLabel(machine);
    const machineCode = machine.machineCode;
    if (machineId && UUID_RE.test(String(machineId))) {
      return { machineId, machineName, machineCode, companyId: companyId || undefined, companyName: '', divisionId: '', divisionName: '', sectionId: '', sectionName: '', departmentId: '', departmentName: '' };
    }
    return undefined;
  };

  const canView = can(USER_PERMISSIONS.view);

  const pipeline = QUEUE_KEYS.map(q => {
    const count = q.statuses.length === 0
      ? Number(queue.total ?? 0)
      : q.statuses.reduce((sum, s) => sum + (Number(queue[DASH_COUNTER[s]]) || 0), 0);
    const current = filters.statuses || [];
    const active = q.statuses.length === 0
      ? current.length === 0
      : current.length === q.statuses.length && JSON.stringify([...q.statuses].sort()) === JSON.stringify([...current].sort());
    return { ...q, count, active };
  });

  const filterSelect = (key: keyof FlatFilters, placeholder: string, options: Array<{ value: string; label: string }>, disabled?: boolean, patch?: Record<string, any>) => (
    <Select allowClear placeholder={placeholder} value={(filters as any)[key]} disabled={disabled} onChange={v => setFilter({ [key]: v, ...(patch || {}) })} options={options} style={{ minWidth: 160 }} />
  );

  const { setHeaderActions, clearHeaderActions } = useHeaderActions.getState();
  const canCreate = can(USER_PERMISSIONS.create);
  const exportMenuItems = [
    { key: 'csv', label: 'Export CSV', icon: <FilePdfOutlined />, onClick: exportCsv },
    { key: 'pdf', label: 'Export PDF', icon: <FilePdfOutlined />, onClick: exportPdf },
    { key: 'print', label: 'Print', icon: <PrinterOutlined />, onClick: printWindow },
  ];
  const importMenuItems = [
    { key: 'import', label: importing ? 'Importing...' : 'Import from CSV', icon: <ImportOutlined />, disabled: importing, onClick: () => { if (!importing) triggerImport(); } },
    { key: 'template', label: 'Download Template', icon: <DownloadOutlined />, onClick: downloadTemplate },
  ];

  useEffect(() => {
    setHeaderActions([
      ...(canCreate
        ? [{
            key: 'create-job-card',
            node: (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/maintenance/job-cards/new', { state: { context: createContext() } })}>
                Create Job Card
              </Button>
            ),
          }]
        : []),
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={() => { load(); loadQueue(); }}>Refresh</Button>) },
      ...(canCreate
        ? [{
            key: 'import',
            node: (
              <Dropdown menu={{ items: importMenuItems }} trigger={['click']}>
                <Button icon={<ImportOutlined />} loading={importing}>Import</Button>
              </Dropdown>
            ),
          }]
        : []),
      ...(canView
        ? [{
            key: 'export',
            node: (
              <Dropdown menu={{ items: exportMenuItems }} trigger={['click']}>
                <Button icon={<DownloadOutlined />}>Export<CaretDownOutlined /></Button>
              </Dropdown>
            ),
          }]
        : []),
    ]);
    return () => clearHeaderActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderActions, clearHeaderActions, canCreate, canView, importing, navigate, companyId, load, loadQueue]);

  return <div>
    <Card styles={{ body: { padding: 12 } }} style={{ ...panelCard, marginBottom: 12 }}>
      <div className="maint-status-grid">
        {pipeline.map(q => {
          const color = STATUS_COLORS[q.colorKey] || STATUS_COLORS.ALL;
          return (
            <button
              key={q.key}
              onClick={() => setFilterWithUrl({ statuses: q.statuses.length ? q.statuses : undefined })}
              style={{
                width: '100%', cursor: 'pointer', border: 'none', borderRadius: 8, minWidth: 0,
                padding: '10px 14px', textAlign: 'left', transition: 'all .15s',
                background: q.active ? color : tint(color),
                boxShadow: q.active ? `0 2px 8px ${color}55` : shadowSm,
                display: 'flex', flexDirection: 'column', gap: 2, minHeight: 52,
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: q.active ? '#fff' : color, textTransform: 'uppercase', letterSpacing: '.02em', lineHeight: 1.3 }}>{q.label}</span>
              <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.1, color: q.active ? '#fff' : 'var(--theme-text)' }}>{q.count}</span>
            </button>
          );
        })}
      </div>
    </Card>

    <Card styles={{ body: { padding: '12px 16px' } }} style={{ marginBottom: 12 }}>
      <Row gutter={[8, 12]} align="middle">
        <Col>
          <Button icon={<FilterOutlined />} onClick={() => setShowFilters(v => !v)} type={showFilters ? 'primary' : 'default'}>
            <Text style={{ color: showFilters ? '#fff' : undefined }}>Filters</Text>
          </Button>
        </Col>
        {activeFilterCount > 0 && <Col><Tag color="blue">{activeFilterCount}</Tag></Col>}
        <Col flex="auto" />
        <Col style={{ minWidth: 220, flex: '1 1 260px' }}>
          <Input
            allowClear prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search job cards, machines, complaints, codes..."
            value={searchInput}
            onChange={e => onSearchChange(e.target.value)}
            style={{ width: '100%' }}
          />
        </Col>
        {(activeFilterCount > 0 || filters.search) && <Col><Button type="text" icon={<ClearOutlined />} onClick={resetAll}>Clear</Button></Col>}
      </Row>

      {showFilters && (
        <Row gutter={[12, 12]} style={{ marginTop: 12, borderTop: '1px solid var(--theme-border)', paddingTop: 16 }}>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              showSearch
              aria-label="Filter Division"
              placeholder="All Divisions ▼"
              value={filters.divisionId || ALL}
              onChange={v => onDivisionChange(v === ALL ? undefined : v)}
              optionFilterProp="label"
              filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
              options={[ALL_OPTION, ...divisions.map(d => ({ value: d.id, label: divisionLabel(d) }))]}
              style={{ width: '100%', minWidth: 160 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              showSearch
              aria-label="Filter Section"
              placeholder="All Sections ▼"
              value={filters.sectionId || ALL}
              onChange={v => onSectionChange(v === ALL ? undefined : v)}
              disabled={!filters.divisionId}
              optionFilterProp="label"
              filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
              options={[ALL_OPTION, ...sections.map(s => ({ value: s.id, label: sectionLabel(s) }))]}
              style={{ width: '100%', minWidth: 160 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              showSearch
              aria-label="Filter Department"
              placeholder="All Departments ▼"
              value={filters.assignedDepartmentId || ALL}
              onChange={v => onDepartmentChange(v === ALL ? undefined : v)}
              disabled={!filters.sectionId}
              optionFilterProp="label"
              filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
              options={[ALL_OPTION, ...departments.map(d => ({ value: d.id, label: departmentLabel(d) }))]}
              style={{ width: '100%', minWidth: 160 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Select
              showSearch
              aria-label="Filter Machine Number"
              placeholder="All Machine Numbers ▼"
              value={filters.machineId || ALL}
              onChange={v => onMachineChange(v === ALL ? undefined : v)}
              optionFilterProp="label"
              filterOption={(input, option) => ((option?.label as string) || '').toLowerCase().includes(input.toLowerCase())}
              options={[ALL_OPTION, ...machines.map(v => ({ value: v.id, label: machineOptionLabel(v), title: machineOptionLabel(v) }))]}
              style={{ width: '100%', minWidth: 160 }}
            />
          </Col>
          <Col xs={24} sm={12} md={8} lg={6}>{filterSelect('priority', 'Priority', JOB_CARD_PRIORITIES.map(v => ({ value: v, label: label(v) })))}</Col>
          <Col xs={24} sm={12} md={8} lg={6}>{filterSelect('maintenanceType', 'Maintenance Type', MAINTENANCE_TYPES.map(v => ({ value: v, label: label(v) })))}</Col>
          <Col xs={24} sm={12} md={8} lg={6}><Select allowClear placeholder="Status" value={filters.statuses && filters.statuses.length === 1 ? filters.statuses[0] : undefined} onChange={v => setFilterWithUrl({ statuses: v ? [v] : undefined })} options={JOB_CARD_STATUSES.map(v => ({ value: v, label: label(v) }))} style={{ width: '100%', minWidth: 160 }} /></Col>
          <Col xs={24} sm={12} md={8} lg={6}>
            <Space.Compact style={{ width: '100%' }}>
              <Input type="date" allowClear value={filters.dateFrom} onChange={e => setFilter({ dateFrom: e.target.value || undefined })} placeholder="Date From" style={{ minWidth: 120 }} />
              <Input type="date" allowClear value={filters.dateTo} onChange={e => setFilter({ dateTo: e.target.value || undefined })} placeholder="Date To" style={{ minWidth: 120 }} />
            </Space.Compact>
          </Col>
        </Row>
      )}
    </Card>

    {error && <Alert type="error" showIcon message="Unable to load job cards" description={error} action={<Button onClick={() => { load(); loadQueue(); }}>Retry</Button>} style={{ marginBottom: 16, borderRadius: 6 }} />}

    {loading ? <LoadingState /> : rows.length === 0 ? (
      <Card><EmptyState title="No Job Cards Found" description="Create a new job card to begin maintenance tracking." actionLabel="Create Job Card" onAction={() => navigate('/maintenance/job-cards/new', { state: { context: createContext() } })} /></Card>
    ) : (
      <Card styles={{ body: { padding: 0 } }}>
        <Table rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 1500 }} size="middle" loading={loading} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid var(--theme-border)' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Showing <Text strong>{rows.length}</Text> of <Text strong>{total}</Text> job cards
            </Text>
          </div>
          <Space size="middle">
            <Space size={6}><Text type="secondary" style={{ fontSize: 13 }}>Rows per page:</Text>
              <Select size="small" value={pageSize} onChange={v => { setPage(1); setPageSize(v); }} options={PAGE_SIZE_OPTIONS.map(v => ({ value: v, label: String(v) }))} style={{ width: 90 }} />
            </Space>
            <Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showSizeChanger={false} showLessItems />
          </Space>
        </div>
      </Card>
    )}
    <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={onFileSelected} />

    {importResult && (
      <Modal
        title="Job Card Import Results"
        open
        onCancel={() => setImportResult(null)}
        footer={<Button type="primary" onClick={() => setImportResult(null)}>Done</Button>}
        width={620}
      >
        <Space wrap size={24} style={{ marginBottom: 16 }}>
          <div><Text type="secondary">Total Rows</Text><div style={{ fontSize: 20, fontWeight: 700 }}>{importResult.totalRows ?? 0}</div></div>
          <div><Text type="secondary">Imported</Text><div style={{ fontSize: 20, fontWeight: 700, color: '#1677ff' }}>{importResult.imported ?? 0}</div></div>
          <div><Text type="secondary">Failed</Text><div style={{ fontSize: 20, fontWeight: 700, color: '#ff4d4f' }}>{importResult.failed ?? 0}</div></div>
        </Space>
        <div style={{ marginBottom: 8 }}>
          <Button size="small" onClick={() => setShowImportHelp(v => !v)}>Import Notes</Button>
        </div>
        {showImportHelp && (
          <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
            Required columns: <Text code>machineCode</Text> (or <Text code>machineNumber</Text>/<Text code>machineId</Text>) and <Text code>complaint</Text>. Optional: <Text code>jobCardNo</Text>, <Text code>priority</Text>, <Text code>maintenanceType</Text>, <Text code>description</Text>, <Text code>requestedAt</Text>, <Text code>assignedDepartmentId</Text>.
          </Typography.Paragraph>
        )}
        {(importResult.results || []).length > 0 && (
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--theme-border)', borderRadius: 6 }}>
            {(importResult.results as Array<{ row: number; status: string; message: string }>).map((r, i) => (
              <div key={i} style={{ padding: '6px 10px', borderBottom: '1px solid var(--theme-border)', fontSize: 13, display: 'flex', gap: 8 }}>
                <Text type="secondary" style={{ flexShrink: 0 }}>Row {r.row}</Text>
                <Text style={{ color: r.status === 'error' ? '#ff4d4f' : '#1677ff' }}>{r.message}</Text>
              </div>
            ))}
          </div>
        )}
      </Modal>
    )}

    <div style={{ height: 16 }} />
  </div>;
};

export default JobCardList;
