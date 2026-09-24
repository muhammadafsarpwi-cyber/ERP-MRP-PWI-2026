import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App as AntApp, Button, Card, Col, Dropdown, Input, Modal, Pagination, Row, Select,
  Space, Tag, Tooltip, Typography, theme, Checkbox,
} from 'antd';
import {
  PlusOutlined, ReloadOutlined, SearchOutlined, DownloadOutlined,
  FilePdfOutlined, PrinterOutlined, FilterOutlined, ClearOutlined, CaretDownOutlined, ImportOutlined,
  EyeOutlined, DeleteOutlined, PlayCircleOutlined, CheckCircleOutlined, TeamOutlined,
  AppstoreOutlined, ToolOutlined, AuditOutlined, RollbackOutlined,
  EditOutlined, StopOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import apiService from '../../services/api';
import dayjs from 'dayjs';
import { StatusBadge, PriorityBadge, MaintenanceTypeBadge, ERPTable, GlobalLoading } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import {
  JOB_CARD_BASE, JOB_CARD_STATUSES, JOB_CARD_PRIORITIES, MAINTENANCE_TYPES,
  JobCard, OrgOption,
  UUID_RE, errorText, label, ACTION_MAP, NEXT_ACTION_LABEL,
} from './jobCards.types';
import { useHeaderActions } from '../../components/layout/headerActionsStore';
import { JOB_CARD_DASH_COUNTER as DASH_COUNTER, syncMaintenanceQueueBadges } from '../../components/layout/maintenanceQueueBadges';
import { STATUS_COLORS, shadowSm, panelCard } from './maintTheme';
import { useMaintenanceHierarchy, divisionLabel, sectionLabel, departmentLabel } from './useMaintenanceHierarchy';
import { JobCardWorkflowModal, WorkflowModalMode } from './JobCardWorkflowModal';
import { EditJobCardModal } from './EditJobCardModal';
import { maintenanceCache } from './maintenanceCache';
import './maintTheme.css';

const { Text } = Typography;

const ALL = '__all__';
const ALL_OPTION = { value: ALL, label: 'All' };

/** Top summary cards (workflow queues) on the All Job Cards page with icons and watermarks */
const QUEUE_KEYS: Array<{ statuses: string[]; colorKey: string; label: string; key: string; icon: React.ReactNode; desc: string; badgeColor: string }> = [
  { statuses: [], colorKey: 'ALL', label: 'ALL TICKETS', key: 'total', icon: <AppstoreOutlined />, desc: 'Total Logged', badgeColor: '#2563eb' },
  { statuses: ['OPEN', 'ASSIGNED'], colorKey: 'OPEN', label: 'STARTED', key: 'started', icon: <PlayCircleOutlined />, desc: 'Open & Assigned', badgeColor: '#0284c7' },
  { statuses: ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'], colorKey: 'IN_PROGRESS', label: 'IN WORK', key: 'closed', icon: <ToolOutlined />, desc: 'Under Active Repair', badgeColor: '#f59e0b' },
  { statuses: ['PENDING_VERIFICATION'], colorKey: 'PENDING_VERIFICATION', label: 'REVIEW', key: 'review', icon: <AuditOutlined />, desc: 'Awaiting Inspection', badgeColor: '#8b5cf6' },
  { statuses: ['REJECTED'], colorKey: 'REJECTED', label: 'RETURNED', key: 'returned', icon: <RollbackOutlined />, desc: 'Needs Rework', badgeColor: '#ef4444' },
  { statuses: ['CLOSED', 'APPROVED'], colorKey: 'CLOSED', label: 'COMPLETE', key: 'complete', icon: <CheckCircleOutlined />, desc: 'Verified & Closed', badgeColor: '#10b981' },
];

const USER_PERMISSIONS = {
  create: 'maintenance.job_card.create',
  view: 'maintenance.job_card.view',
  update: 'maintenance.job_card.update',
  delete: 'maintenance.job_card.delete',
  start: 'maintenance.job_card.start',
  complete: 'maintenance.job_card.complete',
  verify: 'maintenance.job_card.verify',
  approve: 'maintenance.job_card.approve',
  close: 'maintenance.job_card.close',
};

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const userName = (u: any) => (u && (u.displayName || u.fullName || u.firstName || u.email || u.id)) || '—';

const formatDateTime = (dateStr?: string | null): string => {
  if (!dateStr) return '-';
  const d = dayjs(dateStr);
  return d.isValid() ? d.format('DD-MMM-YYYY HH:mm') : '-';
};

const COLUMN_META: Record<string, { label: string }> = {
  job: { label: 'Job Card' },
  machine: { label: 'Machine' },
  downtime: { label: 'Downtime / Elapsed' },
  complaint: { label: 'Complaint' },
  type: { label: 'Type' },
  priority: { label: 'Priority' },
  assigned: { label: 'Assigned To' },
  dept: { label: 'Department' },
  status: { label: 'Status' },
  next: { label: 'Next Action' },
  createdByNameDate: { label: 'Created By / Date' },
  updatedByNameDate: { label: 'Updated By / Date' },
  actions: { label: 'Actions' },
};

/* ── Status column presentation ─────────────────────────────────────────────
   Keys are the exact `JOB_CARD_STATUSES` values from jobCards.types.ts — no
   status is renamed, added or removed. Each value gets its own Ant Design Tag
   preset so every row state reads differently at a glance (previously several
   distinct statuses collapsed onto the same pill colour). Presets are theme
   tokens, so text/background/border contrast adapts to the light and dark
   theme automatically. StatusBadge renders an antd Tag whenever `colorMap` is
   supplied — the established pattern in this repo (MachineManagement,
   TargetManagement, ItemManagement). */
const JOB_CARD_STATUS_TAG: Record<string, string> = {
  OPEN: 'blue',                  // not started yet
  ASSIGNED: 'cyan',              // technician assigned, ready to start
  IN_PROGRESS: 'geekblue',       // actively being worked
  ON_HOLD: 'gold',               // paused on hold
  WAITING_FOR_PARTS: 'purple',   // blocked on spare parts (maintTheme pipeline colour)
  PENDING_VERIFICATION: 'magenta', // awaiting supervisor review
  COMPLETED: 'green',            // work finished
  CLOSED: 'default',             // terminal — nothing left to do
  VERIFIED: 'pink',              // legacy verified state
  APPROVED: 'lime',              // legacy final approval
  REJECTED: 'red',               // returned / rejected
  CANCELLED: 'volcano',          // cancelled
};

/* ── Next Action column presentation ────────────────────────────────────────
   Keys are the exact labels already produced by NEXT_ACTION_LABEL (and the
   ACTION_MAP fallback) in jobCards.types.ts — labels themselves are never
   rewritten. Each action keeps its own semantic colour instead of the single
   hard-coded purple pill every row used before. */
const NEXT_ACTION_TAG: Record<string, string> = {
  'Start Job': 'blue',             // begin work
  'Close Job': 'green',            // finish work
  'Resume Work': 'cyan',           // continue after pause
  'Close (Legacy)': 'geekblue',    // legacy close path
  'Completed': 'default',          // terminal — no action pending
  'Review': 'purple',              // review step
  'Approve': 'lime',               // sign-off
  'Resubmit for Review': 'orange', // rework needed
  'Cancelled': 'volcano',          // stopped
  // Fallback labels from ACTION_MAP, in case an unlabelled status ever arrives
  'Assign': 'magenta',
  'Put On Hold': 'gold',
  'Waiting for Parts': 'purple',
  'Resume': 'cyan',
  'Return to Technician': 'red',
};
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

export const formatDuration = (minutes: number): string => {
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs < 24) return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs > 0 ? `${days}d ${remHrs}h` : `${days}d`;
};

const JobCardDowntimeCell: React.FC<{ card: JobCard }> = ({ card }) => {
  const reqTime = card.requestedAt ? new Date(card.requestedAt).getTime() : null;
  const startTime = card.startedAt ? new Date(card.startedAt).getTime() : null;
  const endTime = (card.completedAt || card.closedAt) ? new Date(card.completedAt || card.closedAt).getTime() : null;
  const now = Date.now();

  const isClosed = ['CLOSED', 'APPROVED', 'VERIFIED', 'COMPLETED', 'PENDING_VERIFICATION'].includes(card.currentStatus);
  const isStarted = ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'ON_HOLD'].includes(card.currentStatus);

  if (isClosed && startTime && endTime) {
    const repairMins = Math.max(0, Math.round((endTime - startTime) / 60000));
    const totalDownMins = reqTime ? Math.max(0, Math.round((endTime - reqTime) / 60000)) : repairMins;
    return (
      <div style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <CheckCircleOutlined style={{ color: 'var(--maint-success-fg)', fontSize: 12 }} />
          <span style={{ fontWeight: 700, color: 'var(--maint-success-fg)', fontSize: 12 }}>
            {formatDuration(repairMins)}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 1 }}>
          Total Down: {formatDuration(totalDownMins)}
        </div>
      </div>
    );
  }

  if (isStarted) {
    const activeMins = startTime ? Math.max(0, Math.round((now - startTime) / 60000)) : 0;
    const totalDownMins = reqTime ? Math.max(0, Math.round((now - reqTime) / 60000)) : activeMins;
    const isHold = card.currentStatus === 'WAITING_FOR_PARTS' || card.currentStatus === 'ON_HOLD';
    return (
      <div style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isHold ? (
            <StopOutlined style={{ color: 'var(--maint-warning-fg)', fontSize: 12 }} />
          ) : (
            <ToolOutlined style={{ color: 'var(--maint-info-fg)', fontSize: 12 }} />
          )}
          <span style={{ fontWeight: 700, color: isHold ? 'var(--maint-warning-fg)' : 'var(--maint-info-fg)', fontSize: 12 }}>
            {formatDuration(activeMins)}
          </span>
          {isHold && (
            <Tag color="warning" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
              Hold
            </Tag>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 1 }}>
          Total Down: {formatDuration(totalDownMins)}
        </div>
      </div>
    );
  }

  if (card.currentStatus === 'REJECTED') {
    const totalDownMins = reqTime ? Math.max(0, Math.round((now - reqTime) / 60000)) : 0;
    return (
      <div style={{ whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <RollbackOutlined style={{ color: 'var(--maint-danger-fg)', fontSize: 12 }} />
          <span style={{ fontWeight: 700, color: 'var(--maint-danger-fg)', fontSize: 12 }}>
            {formatDuration(totalDownMins)}
          </span>
          <Tag color="error" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
            Needs Rework
          </Tag>
        </div>
        <div style={{ fontSize: 11, color: 'var(--maint-danger-fg)', marginTop: 1, fontWeight: 500 }}>
          Returned / Needs Rework
        </div>
      </div>
    );
  }

  // Pending start (OPEN or ASSIGNED)
  const waitMins = reqTime ? Math.max(0, Math.round((now - reqTime) / 60000)) : 0;
  const isHighDelay = waitMins >= 120; // > 2 hours waiting to start
  return (
    <div style={{ whiteSpace: 'nowrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <ClockCircleOutlined style={{ color: isHighDelay ? 'var(--maint-danger-fg)' : 'var(--maint-info-fg)', fontSize: 12 }} />
        <span style={{ fontWeight: 700, color: isHighDelay ? '#ef4444' : 'inherit', fontSize: 12 }}>
          {formatDuration(waitMins)}
        </span>
        {isHighDelay && (
          <Tag color="error" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
            &gt;2h Wait
          </Tag>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 1 }}>
        Wait to Start
      </div>
    </div>
  );
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

interface JobCardCacheEntry {
  data: JobCard[];
  total: number;
  timestamp: number;
}

const JOB_CARD_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes (120,000 ms)

/** In-memory cache surviving tab switches, queue navigation and route returns */
const jobCardMemoryCache = new Map<string, JobCardCacheEntry>();

export const clearJobCardCache = () => {
  jobCardMemoryCache.clear();
};

maintenanceCache.onClearJobCards(clearJobCardCache);

export const JobCardList: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { message } = AntApp.useApp();
  const { user, can } = usePermission();
  const { token } = theme.useToken();

  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>({
    job: true,
    machine: true,
    downtime: true,
    complaint: true,
    type: true,
    priority: true,
    assigned: true,
    dept: true,
    status: true,
    next: true,
    createdByNameDate: true,
    updatedByNameDate: true,
    actions: true,
  });

  const [rows, setRows] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<FlatFilters>(() => {
    const base = emptyFilters(user?.defaultCompanyId);
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      const sts = sp.get('statuses');
      const s = sp.get('status');
      if (sts) {
        const list = sts.split(',').map(v => v.trim()).filter(v => JOB_CARD_STATUSES.includes(v));
        if (list.length) base.statuses = list;
      } else if (s && JOB_CARD_STATUSES.includes(s)) {
        base.statuses = [s];
      }
    }
    return base;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [machines, setMachines] = useState<OrgOption[]>([]);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Unified Draggable Workflow Modal State
  const [workflowModal, setWorkflowModal] = useState<{
    open: boolean;
    mode: WorkflowModalMode;
    card: JobCard | null;
  }>({
    open: false,
    mode: 'start',
    card: null,
  });
  const actionInProgressId = null;
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [rootCategories, setRootCategories] = useState<any[]>([]);
  const [failureCategories, setFailureCategories] = useState<any[]>([]);

  // Edit Job Card Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalCard, setEditModalCard] = useState<JobCard | null>(null);

  useEffect(() => {
    maintenanceCache.getTechnicians().then(setTechnicians).catch(() => setTechnicians([]));
    maintenanceCache.getRootCauseCategories().then(setRootCategories).catch(() => setRootCategories([]));
    maintenanceCache.getFailureCategories().then(setFailureCategories).catch(() => setFailureCategories([]));
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const load = useCallback(async (force = false) => {
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

    const cacheKey = Object.keys(params)
      .sort()
      .map(k => `${k}:${params[k] ?? ''}`)
      .join('|');

    // 1. In-memory Cache Check: Serve instantly with 0ms delay if less than 2 minutes old
    if (!force) {
      const cached = jobCardMemoryCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < JOB_CARD_CACHE_TTL_MS)) {
        setRows(cached.data);
        setTotal(cached.total);
        setLoading(false);
        setError('');
        return; // 0ms instantaneous read without repetitive loading screens!
      }

      // 2. Queue Navigation & Closed Job Cards Fast Cross-Cache:
      // When navigating to 'Closed Job Cards' or any queue card, check if an 'all cards' query is fresh in memory (< 2 min)
      if (filters.statuses && filters.statuses.length > 0 && !filters.search && !filters.priority && !filters.maintenanceType) {
        const allKey = Object.keys({ ...params, statuses: undefined, page: 1, limit: 1000 })
          .filter(k => k !== 'statuses')
          .sort()
          .map(k => `${k}:${params[k] ?? ''}`)
          .join('|');
        const cachedAll = jobCardMemoryCache.get(allKey);
        if (cachedAll && (Date.now() - cachedAll.timestamp < JOB_CARD_CACHE_TTL_MS)) {
          const matching = cachedAll.data.filter(r => filters.statuses!.includes(r.currentStatus));
          setRows(matching);
          setTotal(matching.length);
          setLoading(false);
          setError('');
          // Background revalidate to ensure page consistency
          void apiService.get<{ data: JobCard[]; total: number }>(JOB_CARD_BASE, params)
            .then(res => {
              const d = res?.data || [];
              const t = res?.total || 0;
              setRows(d);
              setTotal(t);
              jobCardMemoryCache.set(cacheKey, { data: d, total: t, timestamp: Date.now() });
            })
            .catch(() => {});
          return;
        }
      }
    }

    setLoading(true);
    setError('');
    try {
      const result = await apiService.get<{ data: JobCard[]; total: number }>(JOB_CARD_BASE, params);
      const data = result.data || [];
      const total = result.total || 0;
      setRows(data);
      setTotal(total);
      jobCardMemoryCache.set(cacheKey, {
        data,
        total,
        timestamp: Date.now(),
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
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
    try {
      await apiService.delete(`${JOB_CARD_BASE}/${id}`);
      message.success('Job card deleted');
      clearJobCardCache();
      load(true);
      loadQueue();
      if (companyId) void syncMaintenanceQueueBadges(companyId);
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const machineDisplay = (r: JobCard) => {
    const m = r.machine;
    if (!m) return { name: 'Unnamed machine', code: '—' };
    return { name: m.name || m.machineName || 'Unnamed machine', code: m.machineCode || m.machineNumber || '—' };
  };

  const openStartModalForCard = useCallback((card: JobCard) => {
    setWorkflowModal({ open: true, mode: 'start', card });
  }, []);

  const openCloseModalForCard = useCallback((card: JobCard) => {
    setWorkflowModal({ open: true, mode: 'close', card });
  }, []);

  const startSelectedJobs = useCallback(async () => {
    if (!selectedRowKeys.length) return;
    const count = selectedRowKeys.length;
    Modal.confirm({
      title: `Start ${count} Selected Job Card(s)?`,
      content: (
        <div>
          <p style={{ fontSize: 14, margin: '0 0 8px 0' }}>
            Are you sure you want to start all <strong>{count}</strong> selected job cards simultaneously?
          </p>
          <p style={{ color: 'var(--theme-text-muted)', fontSize: 12, margin: 0 }}>
            Their statuses will be transitioned to <strong>IN PROGRESS</strong>.
          </p>
        </div>
      ),
      okText: `Start ${count} Job Cards`,
      okButtonProps: {
        type: 'primary',
        icon: <PlayCircleOutlined />,
        style: { backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 600 },
      },
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await Promise.all(
            selectedRowKeys.map(id => apiService.post(`${JOB_CARD_BASE}/${id}/start`, {}))
          );
          message.success(`${count} job card(s) started successfully.`);
          setRows(prev => prev.filter(r => !selectedRowKeys.includes(r.id)));
          setSelectedRowKeys([]);
          load();
          loadQueue();
          if (companyId) void syncMaintenanceQueueBadges(companyId);
        } catch (e) {
          message.error(errorText(e));
          load();
          loadQueue();
          throw e;
        }
      },
    });
  }, [companyId, load, loadQueue, message, selectedRowKeys]);

  const openViewModal = (r: JobCard) => {
    setWorkflowModal({ open: true, mode: 'view', card: r });
  };

  const runQuick = async (r: JobCard, action: { label: string; endpoint: string; permission: string }) => {
    if (action.endpoint === 'start') {
      openStartModalForCard(r);
      return;
    }
    if (action.endpoint === 'complete') {
      openCloseModalForCard(r);
      return;
    }
    if (action.endpoint === 'waiting-for-parts') {
      setWorkflowModal({ open: true, mode: 'parts', card: r });
      return;
    }
    if (action.endpoint === 'resume') {
      try {
        await apiService.post(`${JOB_CARD_BASE}/${r.id}/resume`, {});
        message.success('Job card resumed. Status is now IN PROGRESS.');
        clearJobCardCache();
        load(true);
        loadQueue();
        if (companyId) void syncMaintenanceQueueBadges(companyId);
      } catch (e) {
        message.error(errorText(e));
      }
      return;
    }
    if (action.endpoint === 'verify' || action.endpoint === 'approve' || action.endpoint === 'reject') {
      setWorkflowModal({ open: true, mode: 'review', card: r });
      return;
    }
    if (action.endpoint === 'submit-for-verification') {
      setWorkflowModal({ open: true, mode: 'rework', card: r });
      return;
    }
    const modalEndpoints = ['assign'];
    if (modalEndpoints.includes(action.endpoint)) {
      navigate(`/maintenance/job-cards/${r.id}?action=${action.endpoint}`);
      return;
    }
    Modal.confirm({
      title: `${action.label} this job card?`,
      content: `${r.jobCardNo || r.id}`,
      onOk: async () => {
        try {
          await apiService.post(`${JOB_CARD_BASE}/${r.id}/${action.endpoint}`, {});
          message.success(`${action.label} completed`);
          clearJobCardCache();
          load(true);
          loadQueue();
          if (companyId) void syncMaintenanceQueueBadges(companyId);
        } catch (e) { message.error(errorText(e)); throw e; }
      },
    });
  };

  const nextActionOf = (r: JobCard) => (ACTION_MAP[r.currentStatus] || []).find(a => can(a.permission));

  /**
   * Responsive action-button helper for a Job Card table row.
   */
  const IsAllView = (filters.statuses || []).length === 0;

  const viewActionBtn = (r: JobCard) => (
    <Tooltip title="View Job Card" placement="top">
      <Button
        className="jc-view-btn"
        icon={<EyeOutlined style={{ fontSize: 13, color: 'var(--maint-info-fg)' }} />}
        aria-label={`View Job Card ${r.jobCardNo || ''}`}
        style={{
          color: 'var(--maint-info-fg)',
          borderColor: 'var(--maint-info-border)',
          backgroundColor: 'var(--maint-info-bg)',
          width: 28,
          minWidth: 28,
          height: 28,
          padding: 0,
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onClick={(e) => {
          e.stopPropagation();
          openViewModal(r);
        }}
      />
    </Tooltip>
  );

  const actionBtnStyle = (endpoint: string) => {
    switch (endpoint) {
      case 'start':
        return { backgroundColor: '#2563eb', borderColor: '#1d4ed8', color: '#ffffff' };
      case 'complete':
        return { backgroundColor: '#059669', borderColor: '#047857', color: '#ffffff' };
      case 'verify':
      case 'approve':
        return { backgroundColor: '#7c3aed', borderColor: '#6d28d9', color: '#ffffff' };
      case 'reject':
      case 'resume':
      case 'submit-for-verification':
        return { backgroundColor: '#d97706', borderColor: '#b45309', color: '#ffffff' };
      case 'assign':
        return { backgroundColor: '#0284c7', borderColor: '#0369a1', color: '#ffffff' };
      default:
        return { backgroundColor: '#2563eb', borderColor: '#1d4ed8', color: '#ffffff' };
    }
  };

  const actionIcon = (endpoint: string) => {
    switch (endpoint) {
      case 'assign':
        return <TeamOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      case 'start':
      case 'resume':
        return <PlayCircleOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      case 'complete':
        return <CheckCircleOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      case 'verify':
      case 'approve':
        return <AuditOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      case 'reject':
        return <RollbackOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      case 'submit-for-verification':
        return <PlayCircleOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
      default:
        return <PlayCircleOutlined style={{ fontSize: 13, color: '#ffffff' }} />;
    }
  };

  const renderRowActions = (_: any, r: JobCard) => {
    const editBtn = can(USER_PERMISSIONS.update) && (
      <Tooltip title="Edit Job Card" placement="top">
        <Button
          size="small"
          icon={<EditOutlined style={{ fontSize: 13, color: 'var(--maint-info-fg)' }} />}
          aria-label={`Edit Job Card ${r.jobCardNo || ''}`}
          style={{
            borderColor: 'var(--maint-info-border)',
            backgroundColor: 'var(--maint-info-bg)',
            color: 'var(--maint-info-fg)',
            width: 28,
            minWidth: 28,
            height: 28,
            padding: 0,
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            e.stopPropagation();
            setEditModalCard(r);
            setEditModalOpen(true);
          }}
        />
      </Tooltip>
    );

    const deleteBtn = can(USER_PERMISSIONS.delete) && (
      <Tooltip title="Delete Job Card" placement="top">
        <Button
          danger
          size="small"
          icon={<DeleteOutlined style={{ fontSize: 13 }} />}
          aria-label={`Delete Job Card ${r.jobCardNo || ''}`}
          style={{
            borderColor: 'var(--maint-danger-border)',
            backgroundColor: 'var(--maint-danger-bg)',
            color: 'var(--maint-danger-fg)',
            width: 28,
            minWidth: 28,
            height: 28,
            padding: 0,
            borderRadius: 6,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            e.stopPropagation();
            Modal.confirm({
              title: 'Are you sure you want to delete this Job Card?',
              content: `Job Card: ${r.jobCardNo || r.id}`,
              okText: 'Yes, Delete',
              okType: 'danger',
              onOk: () => remove(r.id),
            });
          }}
        />
      </Tooltip>
    );

    // All Job Cards is a historical / read-only view — View only + Edit/Delete for admin.
    if (IsAllView) {
      return (
        <div className="jc-actions-row">
          {viewActionBtn(r)}
          {editBtn}
          {deleteBtn}
        </div>
      );
    }

    const action = nextActionOf(r);
    return (
      <div className="jc-actions-row">
        {action && (
          <Tooltip title={`${action.label} Job Card`} placement="top">
            <Button
              className={`jc-action-primary jc-btn-${action.endpoint}`}
              size="small"
              type="primary"
              loading={actionInProgressId === r.id}
              icon={actionIcon(action.endpoint)}
              aria-label={`${action.label} Job Card ${r.jobCardNo || ''}`}
              style={{
                ...actionBtnStyle(action.endpoint),
                width: 28,
                minWidth: 28,
                height: 28,
                padding: 0,
                borderRadius: 6,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
              }}
              onClick={(e) => {
                e.stopPropagation();
                runQuick(r, action);
              }}
            />
          </Tooltip>
        )}

        {/* Quick action: Put on hold / wait for parts if card is in progress */}
        {r.currentStatus === 'IN_PROGRESS' && (
          <Tooltip title="Hold for Spare Parts" placement="top">
            <Button
              size="small"
              icon={<StopOutlined style={{ fontSize: 13, color: 'var(--maint-warning-fg)' }} />}
              aria-label={`Put Job Card ${r.jobCardNo || ''} on hold`}
              style={{
                width: 28,
                minWidth: 28,
                height: 28,
                padding: 0,
                borderRadius: 6,
                borderColor: 'var(--maint-warning-border)',
                backgroundColor: 'var(--maint-warning-bg)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => {
                e.stopPropagation();
                setWorkflowModal({ open: true, mode: 'parts', card: r });
              }}
            />
          </Tooltip>
        )}

        {viewActionBtn(r)}
        {editBtn}
        {deleteBtn}
      </div>
    );
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
        clearJobCardCache();
        load(true);
        loadQueue();
        if (companyId) void syncMaintenanceQueueBadges(companyId);
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
      title: 'Job Card', key: 'job', width: isMobile ? 130 : 155, fixed: isMobile ? undefined : 'left',
      render: (_: any, r: JobCard) => (
        <div className="jc-id-cell">
          <a
            href={`#/maintenance/job-cards/${r.id}`}
            onClick={(e) => {
              e.preventDefault();
              openViewModal(r);
            }}
            className="jc-code-link"
          >
            {r.jobCardNo || r.id}
          </a>
          <div className="jc-sub-date">{r.requestedAt ? new Date(r.requestedAt).toLocaleDateString() : '—'}</div>
        </div>
      ),
    },
    {
      title: 'Machine', key: 'machine', width: isMobile ? 140 : 170,
      render: (_: any, r: JobCard) => {
        const m = machineDisplay(r);
        return (
          <div className="jc-machine-cell">
            <div className="jc-machine-name">{m.name}</div>
            <div className="jc-machine-code">{m.code}</div>
          </div>
        );
      },
    },
    {
      title: 'Downtime / Elapsed', key: 'downtime', width: isMobile ? 135 : 160,
      sorter: (a, b) => {
        const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
        const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
        return aTime - bTime;
      },
      render: (_: any, r: JobCard) => <JobCardDowntimeCell card={r} />,
    },
    {
      title: 'Complaint', dataIndex: 'complaint', key: 'complaint', width: isMobile ? 180 : 240, ellipsis: true,
      render: (v: string) => v ? <Tooltip title={v}><span className="jc-complaint-text">{v}</span></Tooltip> : '—',
    },
    {
      title: 'Type',
      dataIndex: 'maintenanceType',
      key: 'type',
      width: 115,
      render: (v: string) => <MaintenanceTypeBadge type={v} />,
    },
    {
      title: 'Priority',
      dataIndex: 'priority',
      key: 'priority',
      width: 105,
      render: (v: string) => <PriorityBadge priority={v} />,
    },
    {
      title: 'Assigned To', key: 'assigned', width: isMobile ? 130 : 160,
      render: (_: any, r: JobCard) => {
        const t = technicianNames(r);
        return t ? (
          <span className="erp-tech-chip">
            <TeamOutlined className="erp-tech-chip-icon" />
            <span className="erp-tech-chip-name">{t}</span>
          </span>
        ) : (
          <span className="erp-pill-badge erp-pill-badge--unassigned">
            Unassigned
          </span>
        );
      },
    },
    {
      title: 'Department', key: 'dept', width: 130,
      render: (_: any, r: JobCard) => (
        <span className="jc-dept-text">
          {(r.assignedDepartment && (r.assignedDepartment.name || r.assignedDepartment.departmentCode)) || '—'}
        </span>
      ),
    },
    { title: 'Status', dataIndex: 'currentStatus', key: 'status', width: 130, render: (v: string) => <StatusBadge status={v} colorMap={JOB_CARD_STATUS_TAG} /> },
    {
      title: 'Next Action', key: 'next', width: 130,
      render: (_: any, r: JobCard) => {
        const nxt = NEXT_ACTION_LABEL[r.currentStatus] || (nextActionOf(r) || {}).label || '—';
        if (nxt === '—') return <span className="erp-pill-badge erp-pill-badge--neutral">{nxt}</span>;
        return (
          <Tag color={NEXT_ACTION_TAG[nxt] || 'default'} style={{ marginInlineEnd: 0 }}>
            {nxt}
          </Tag>
        );
      },
    },
    {
      title: 'Created By / Date',
      key: 'createdByNameDate',
      width: 160,
      sorter: (a, b) => (a.createdByName || '').localeCompare(b.createdByName || ''),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{record.createdByName || (record.createdBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{formatDateTime(record.createdAt)}</span>
        </div>
      ),
    },
    {
      title: 'Updated By / Date',
      key: 'updatedByNameDate',
      width: 160,
      sorter: (a, b) => (a.updatedByName || '').localeCompare(b.updatedByName || ''),
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: token.colorText }}>{record.updatedByName || (record.updatedBy ? 'Admin' : '-')}</span>
          <span style={{ fontSize: 11, color: token.colorTextSecondary }}>{formatDateTime(record.updatedAt)}</span>
        </div>
      ),
    },
    {
      title: 'Actions', key: 'actions', width: IsAllView ? 115 : (isMobile ? 140 : 175), fixed: isMobile ? undefined : 'right',
      render: renderRowActions,
    },
  ];

  const visibleColumns = columns.filter((c) => visibleCols[c.key as keyof typeof visibleCols] !== false);

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

  const currentStatuses = filters.statuses || [];
  const isStartedQueue = currentStatuses.length > 0 && currentStatuses.every(s => ['OPEN', 'ASSIGNED'].includes(s));
  const isClosedQueue = currentStatuses.length > 0 && currentStatuses.every(s => ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'].includes(s));
  const isReviewQueue = currentStatuses.length > 0 && currentStatuses.every(s => ['PENDING_VERIFICATION'].includes(s));
  const isReturnedQueue = currentStatuses.length > 0 && currentStatuses.every(s => ['REJECTED'].includes(s));
  const isCompleteQueue = currentStatuses.length > 0 && currentStatuses.every(s => ['CLOSED', 'APPROVED'].includes(s));

  const displayRows = useMemo(() => {
    if (filters.statuses && filters.statuses.length > 0) {
      return rows.filter(r => filters.statuses!.includes(r.currentStatus));
    }
    return rows;
  }, [rows, filters.statuses]);

  const canStart = can(USER_PERMISSIONS.start);
  const canComplete = can(USER_PERMISSIONS.complete);
  const canVerify = can(USER_PERMISSIONS.verify) || can(USER_PERMISSIONS.approve);

  const onHeaderStartJob = useCallback(() => {
    if (selectedRowKeys.length === 1) {
      const card = rows.find(r => r.id === selectedRowKeys[0]);
      if (card) {
        openStartModalForCard(card);
        return;
      }
    }
    if (selectedRowKeys.length > 1) {
      startSelectedJobs();
      return;
    }
    setWorkflowModal({ open: true, mode: 'start', card: null });
  }, [rows, selectedRowKeys, openStartModalForCard, startSelectedJobs]);

  const onHeaderCloseJob = useCallback(() => {
    if (selectedRowKeys.length === 1) {
      const card = rows.find(r => r.id === selectedRowKeys[0]);
      if (card) {
        openCloseModalForCard(card);
        return;
      }
    }
    setWorkflowModal({ open: true, mode: 'close', card: null });
  }, [rows, selectedRowKeys, openCloseModalForCard]);

  const onHeaderReviewJob = useCallback(() => {
    if (selectedRowKeys.length === 1) {
      const card = rows.find(r => r.id === selectedRowKeys[0]);
      if (card) {
        setWorkflowModal({ open: true, mode: 'review', card });
        return;
      }
    }
    const targetCard = rows.find(r => r.currentStatus === 'PENDING_VERIFICATION') || rows[0];
    if (targetCard) {
      setWorkflowModal({ open: true, mode: 'review', card: targetCard });
    } else {
      message.info('No pending job cards to review.');
    }
  }, [rows, selectedRowKeys, message]);

  const onHeaderReworkJob = useCallback(() => {
    if (selectedRowKeys.length === 1) {
      const card = rows.find(r => r.id === selectedRowKeys[0]);
      if (card) {
        setWorkflowModal({ open: true, mode: 'rework', card });
        return;
      }
    }
    const targetCard = rows.find(r => r.currentStatus === 'REJECTED') || rows[0];
    if (targetCard) {
      setWorkflowModal({ open: true, mode: 'rework', card: targetCard });
    } else {
      message.info('No returned job cards needing rework.');
    }
  }, [rows, selectedRowKeys, message]);

  useEffect(() => {
    setHeaderActions([
      ...(isStartedQueue
        ? (canStart
            ? [{
                key: 'start-job-card',
                node: (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    style={{ backgroundColor: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: 600 }}
                    onClick={onHeaderStartJob}
                  >
                    {selectedRowKeys.length > 0 ? `Start Selected (${selectedRowKeys.length})` : 'Start Job Card'}
                  </Button>
                ),
              }]
            : [])
        : isClosedQueue
        ? (canComplete
            ? [{
                key: 'close-job-card',
                node: (
                  <Button
                    type="primary"
                    icon={<CheckCircleOutlined />}
                    style={{ backgroundColor: '#059669', borderColor: '#059669', color: '#ffffff', fontWeight: 600 }}
                    onClick={onHeaderCloseJob}
                  >
                    {selectedRowKeys.length > 0 ? `Close Selected (${selectedRowKeys.length})` : 'Close Job Card'}
                  </Button>
                ),
              }]
            : [])
        : isReviewQueue
        ? (canVerify
            ? [{
                key: 'review-job-card',
                node: (
                  <Button
                    type="primary"
                    icon={<AuditOutlined />}
                    style={{ backgroundColor: '#8b5cf6', borderColor: '#7c3aed', fontWeight: 600 }}
                    onClick={onHeaderReviewJob}
                  >
                    {selectedRowKeys.length === 1 ? 'Review Selected Job' : 'Review / Verify Job Card'}
                  </Button>
                ),
              }]
            : [])
        : isReturnedQueue
        ? [{
            key: 'rework-job-card',
            node: (
              <Button
                type="primary"
                icon={<RollbackOutlined />}
                style={{ backgroundColor: '#ef4444', borderColor: '#dc2626', color: '#ffffff', fontWeight: 600 }}
                onClick={onHeaderReworkJob}
              >
                {selectedRowKeys.length === 1 ? 'Rework Selected Job' : 'Rework & Resubmit Job Card'}
              </Button>
            ),
          }]
        : isCompleteQueue
        ? []
        : (canCreate
            ? [{
                key: 'create-job-card',
                node: (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/maintenance/job-cards/new', { state: { context: createContext() } })}>
                    Create Job Card
                  </Button>
                ),
              }]
            : [])),
      { key: 'refresh', node: (<Button icon={<ReloadOutlined />} onClick={() => { clearJobCardCache(); load(true); loadQueue(); }}>Refresh</Button>) },
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
  }, [setHeaderActions, clearHeaderActions, isStartedQueue, isClosedQueue, isReviewQueue, isReturnedQueue, isCompleteQueue, canStart, canComplete, canVerify, canCreate, canView, selectedRowKeys.length, onHeaderStartJob, onHeaderCloseJob, onHeaderReviewJob, onHeaderReworkJob, importing, navigate, companyId, load, loadQueue]);

  return <div>
    <Card styles={{ body: { padding: 12 } }} style={{ ...panelCard, marginBottom: 12 }}>
      <div className="maint-status-grid">
        {pipeline.map((q) => {
          const color = (q as any).badgeColor || STATUS_COLORS[q.colorKey] || STATUS_COLORS.ALL;
          return (
            <button
              key={q.key}
              onClick={() => setFilterWithUrl({ statuses: q.statuses.length ? q.statuses : undefined })}
              className={`maint-queue-card ${q.active ? 'is-active' : ''}`}
              style={{
                borderLeft: `4px solid ${color}`,
                border: q.active ? `2px solid ${color}` : undefined,
                background: q.active
                  ? `linear-gradient(135deg, ${color} 0%, ${color}e0 100%)`
                  : undefined,
                boxShadow: q.active ? `0 4px 14px ${color}40` : shadowSm,
              }}
            >
              {/* Watermark Background Icon */}
              <div
                style={{
                  position: 'absolute',
                  right: -4,
                  bottom: -8,
                  fontSize: 44,
                  opacity: q.active ? 0.18 : 0.08,
                  color: q.active ? '#ffffff' : color,
                  pointerEvents: 'none',
                  lineHeight: 1,
                  userSelect: 'none',
                }}
              >
                {(q as any).icon}
              </div>

              {/* Top Row: Icon + Label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, zIndex: 1 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 5,
                    background: q.active ? 'rgba(255, 255, 255, 0.25)' : `${color}18`,
                    color: q.active ? '#ffffff' : color,
                    fontSize: 11,
                  }}
                >
                  {(q as any).icon}
                </span>
                <span className="maint-qc-label">
                  {q.label}
                </span>
              </div>

              {/* Bottom Row: Counter + Subtitle */}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4, zIndex: 1 }}>
                <span className="maint-qc-count">
                  {q.count}
                </span>
                <span className="maint-qc-desc">
                  {(q as any).desc}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>

    <Card styles={{ body: { padding: '12px 16px' } }} style={{ marginBottom: 12 }}>
      <Row gutter={[8, 12]} align="middle">
        <Col>
          <Button icon={<FilterOutlined />} onClick={() => setShowFilters(v => !v)} type={showFilters ? 'primary' : 'default'}>
            <span style={{ color: showFilters ? 'var(--theme-on-accent)' : undefined }}>Filters</span>
          </Button>
        </Col>
        {activeFilterCount > 0 && <Col><Tag color="blue">{activeFilterCount}</Tag></Col>}
        <Col style={{ minWidth: 220, flex: '1 1 260px' }}>
          <Input
            allowClear prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted)' }} />}
            placeholder="Search job cards, machines, complaints, codes..."
            value={searchInput}
            onChange={e => onSearchChange(e.target.value)}
            style={{ width: '100%' }}
          />
        </Col>
        <Col flex="auto" />
        <Col>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            popupRender={() => (
              <div
                style={{
                  background: token.colorBgElevated,
                  padding: '12px 16px',
                  borderRadius: 8,
                  boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                  minWidth: 200,
                  border: `1px solid ${token.colorBorderSecondary}`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: token.colorText }}>
                    Table Columns
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(COLUMN_META).map(([key, meta]) => (
                    <Checkbox
                      key={key}
                      checked={visibleCols[key] !== false}
                      disabled={key === 'job' || key === 'actions'}
                      onChange={(e) => {
                        const next = { ...visibleCols, [key]: e.target.checked };
                        setVisibleCols(next);
                        try {
                          localStorage.setItem('erp_job_card_table_columns', JSON.stringify(next));
                        } catch {}
                      }}
                      style={{ fontSize: 13, color: token.colorText }}
                    >
                      {meta.label}
                    </Checkbox>
                  ))}
                </div>
              </div>
            )}
          >
            <Button icon={<AppstoreOutlined />} style={{ fontWeight: 600 }}>
              Columns
            </Button>
          </Dropdown>
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

    {error && <Alert type="error" showIcon message="Unable to load job cards" description={error} action={<Button onClick={() => { clearJobCardCache(); load(true); loadQueue(); }}>Retry</Button>} style={{ marginBottom: 16, borderRadius: 6 }} />}

    <div>
      {loading ? (
        <GlobalLoading
          title="Loading Maintenance Job Cards..."
          subtitle="Fetching active hardware fault tickets..."
          badgeText="LIVE DATABASE QUERY"
          minHeight={450}
        />
      ) : (
        <>
      <ERPTable
        rowKey="id"
        columns={visibleColumns}
        dataSource={displayRows}
        pagination={false}
        scroll={{ x: isMobile ? 1050 : 1300 }}
        loading={false}
        onRow={(record: JobCard) => ({
          onClick: (e: React.MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (target && (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('.ant-checkbox-wrapper'))) {
              return;
            }
            if (isStartedQueue && ['OPEN', 'ASSIGNED'].includes(record.currentStatus)) {
              openStartModalForCard(record);
            } else if (isClosedQueue && ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'].includes(record.currentStatus)) {
              openCloseModalForCard(record);
            }
          },
          style: {
            cursor: (isStartedQueue && ['OPEN', 'ASSIGNED'].includes(record.currentStatus)) ||
                    (isClosedQueue && ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'].includes(record.currentStatus))
                      ? 'pointer' : 'default',
          },
        })}
        rowSelection={(isStartedQueue || isClosedQueue) ? {
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
          getCheckboxProps: (record: JobCard) => ({
            disabled: isStartedQueue
              ? !['OPEN', 'ASSIGNED'].includes(record.currentStatus)
              : !['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'].includes(record.currentStatus),
          }),
        } : undefined}
        emptyTitle="No Job Cards Found"
        emptyDescription="Create a new job card to begin maintenance tracking."
        emptyActionLabel={canCreate ? 'Create Job Card' : undefined}
        onEmptyAction={() => navigate('/maintenance/job-cards/new', { state: { context: createContext() } })}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, justifyContent: 'space-between', flexWrap: 'wrap', padding: '12px 16px', borderTop: '1px solid var(--theme-border)' }}>
        <div>
          <span style={{ fontSize: 13, color: 'var(--theme-text-secondary, #64748b)' }}>
            Showing <strong style={{ color: 'var(--theme-text, #1e293b)' }}>{displayRows.length}</strong> of <strong style={{ color: 'var(--theme-text, #1e293b)' }}>{total}</strong> job cards
          </span>
        </div>
        <Space size="middle">
          <Space size={6}><span style={{ fontSize: 13, color: 'var(--theme-text-secondary, #64748b)' }}>Rows per page:</span>
            <Select size="small" value={pageSize} onChange={v => { setPage(1); setPageSize(v); }} options={PAGE_SIZE_OPTIONS.map(v => ({ value: v, label: String(v) }))} style={{ width: 90 }} />
          </Space>
          <Pagination current={page} pageSize={pageSize} total={total} onChange={setPage} showSizeChanger={false} showLessItems />
        </Space>
      </div>
        </>
      )}
    </div>
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

    {/* Unified Draggable Master Workflow Modal */}
    <JobCardWorkflowModal
      open={workflowModal.open}
      mode={workflowModal.mode}
      card={workflowModal.card}
      technicians={technicians}
      rootCategories={rootCategories}
      failureCategories={failureCategories}
      allOpenCards={
        workflowModal.mode === 'close'
          ? rows.filter(r => ['IN_PROGRESS', 'ON_HOLD', 'WAITING_FOR_PARTS'].includes(r.currentStatus))
          : rows.filter(r => ['OPEN', 'ASSIGNED'].includes(r.currentStatus))
      }
      onClose={() => {
        setWorkflowModal(prev => ({ ...prev, open: false }));
      }}
      onSuccess={(action, cardId) => {
        if (action === 'start' || action === 'close' || action === 'verify' || action === 'reject') {
          setRows(prev => prev.filter(r => r.id !== cardId));
          setSelectedRowKeys(keys => keys.filter(k => k !== cardId));
        } else if (action === 'parts') {
          setRows(prev => prev.map(r => r.id === cardId ? { ...r, currentStatus: 'WAITING_FOR_PARTS' } : r));
        }
        clearJobCardCache();
        load(true);
        loadQueue();
        if (companyId) void syncMaintenanceQueueBadges(companyId);
      }}
    />

    {/* Dedicated Edit Job Card Modal */}
    <EditJobCardModal
      open={editModalOpen}
      card={editModalCard}
      onClose={() => {
        setEditModalOpen(false);
        setEditModalCard(null);
      }}
      onSuccess={() => {
        message.success('Job card updated successfully.');
        clearJobCardCache();
        load(true);
        loadQueue();
      }}
    />

    <div style={{ height: 16 }} />
  </div>;
};

export default JobCardList;
