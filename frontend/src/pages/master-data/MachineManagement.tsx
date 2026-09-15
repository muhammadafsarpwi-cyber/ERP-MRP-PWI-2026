import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Alert, App, Badge, Button, Card, Checkbox, DatePicker, Descriptions, Dropdown, Form, Grid, Input, InputNumber,
  Modal, Popover, Segmented, Select, Space, Spin, Table, Tooltip, Typography, Upload,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  PlusOutlined, EditOutlined, SearchOutlined, ReloadOutlined, QrcodeOutlined,
  EyeOutlined, MoreOutlined, PrinterOutlined, ClearOutlined, FilterOutlined,
  ToolOutlined, DeleteOutlined, TagOutlined, SettingOutlined, DesktopOutlined,
  ApartmentOutlined, ShopOutlined, SubnodeOutlined, TeamOutlined, EnvironmentOutlined,
  TagsOutlined, AlertOutlined, CheckCircleOutlined, ScanOutlined,
  DownloadOutlined, FilePdfOutlined, ImportOutlined, InboxOutlined,
  HistoryOutlined, BarChartOutlined, ScheduleOutlined,
  ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, AppstoreOutlined,
  ThunderboltOutlined, ClockCircleOutlined, FileTextOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { Link } from 'react-router-dom';
import apiService from '../../services/api';
import {
  PageHeader, StatusBadge, EmptyState, LoadingState, HeaderCell, HighlightedCell, TableActions,
  DraggableResizableModal, SaveResultDialog, SaveResultPhase, SaveResultData, BarcodeScanner,
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

/** Light projection of a machine tooling component for the View → Tooling tab. */
interface ToolingComponentLite {
  id: string;
  componentCode: string;
  componentName: string;
  componentType: string;
  expectedLifeQuantity?: number | string | null;
  minThreshold?: number | string | null;
  maxThreshold?: number | string | null;
  isActive: boolean;
  item?: { itemCode: string; name?: string | null } | null;
  uom?: { code: string; name?: string | null } | null;
}

type ViewSection = 'identity' | 'org' | 'tech' | 'production' | 'jobcards' | 'tooling' | 'dates';


const VIEW_SECTIONS: Array<{ key: ViewSection; label: string; icon: React.ReactNode }> = [
  { key: 'identity', label: 'Machine Identity', icon: <DesktopOutlined /> },
  { key: 'org', label: 'Organization + Location', icon: <EnvironmentOutlined /> },
  { key: 'tech', label: 'Technical Information', icon: <ToolOutlined /> },
  { key: 'production', label: 'Production', icon: <BarChartOutlined /> },
  { key: 'jobcards', label: 'Job Cards', icon: <FileTextOutlined /> },
  { key: 'tooling', label: 'Tooling', icon: <ApartmentOutlined /> },
  { key: 'dates', label: 'Dates + Description', icon: <HistoryOutlined /> },
];

const badge = (v?: string | null): React.ReactNode =>
  v == null || v === '' ? <Text type="secondary">—</Text> : <StatusBadge status={v} />;

const num = (v?: number | string | null): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmtNum = (v: number | null | undefined, digits = 4): string =>
  v === null || v === undefined ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits });

/**
 * Semantic Achievement % cell — TASK25:
 *   green  ▲  > 70 %
 *   amber  —  = 70 % (neutral)
 *   red    ▼  < 70 %
 */
const AchievementCell: React.FC<{ value?: number | string | null }> = ({ value }) => {
  const v = num(value);
  if (v === null) return <Text type="secondary">—</Text>;
  const tone = v > 70 ? 'var(--theme-success, #16a34a)' : v < 70 ? 'var(--theme-danger, #dc2626)' : 'var(--theme-warning, #d97706)';
  const Icon = v > 70 ? ArrowUpOutlined : v < 70 ? ArrowDownOutlined : MinusOutlined;
  const bg = v > 70 ? 'rgba(22,163,74,0.10)' : v < 70 ? 'rgba(220,38,38,0.10)' : 'rgba(217,119,6,0.10)';
  return (
    <Tooltip title={`Achievement ${v}%`}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 10,
        fontWeight: 700, fontSize: 12, color: tone, background: bg, border: `1px solid ${tone}40`,
        whiteSpace: 'nowrap',
      }}>
        <Icon style={{ fontSize: 10 }} />
        {fmtNum(v, 2)}%
      </span>
    </Tooltip>
  );
};

/**
 * Item cell — TASK25: item NAME is the primary display, item code the
 * secondary line. Records that only carry a code (e.g. legacy fixtures) render
 * the code as plain text so codes like ITM-X stay fully visible.
 */
const ItemCell: React.FC<{ item?: { itemCode?: string; name?: string } | null }> = ({ item }) => {
  if (!item) return <Text type="secondary">—</Text>;
  if (item.name) {
    return (
      <HighlightedCell
        icon={<ToolOutlined />}
        label={item.name}
        secondary={item.itemCode ?? undefined}
        tooltip={item.name + (item.itemCode ? ` — ${item.itemCode}` : '')}
      />
    );
  }
  return item.itemCode
    ? <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--theme-text)', whiteSpace: 'nowrap' }}>{item.itemCode}</code>
    : <Text type="secondary">—</Text>;
};

/** Compact one-line metric used in the Production summary strip. */
const SummaryStat: React.FC<{ label: string; value: React.ReactNode; color?: string }> = ({ label, value, color }) => (
  <div style={{
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 8,
    background: 'var(--theme-surface-alt, #f8fafc)',
    border: '1px solid var(--theme-border, rgba(15,23,42,0.10))',
    whiteSpace: 'nowrap',
  }}>
    <Text type="secondary" style={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.04 }}>{label}</Text>
    <Text strong style={{ fontSize: 15, lineHeight: 1.2, color: color ?? 'var(--theme-text)' }}>{value}</Text>
  </div>
);

/**
 * One-line Target / Actual / Achievement summary — TASK25. Values are computed
 * from the fetched production entries by summing target and actual quantities;
 * achievement % = actual / target × 100 (— when there is no target data).
 */
const ProductionSummary: React.FC<{ entries: ProductionEntry[] }> = ({ entries }) => {
  const target = entries.reduce<number>((a, r) => a + (num(r.targetQuantity) ?? 0), 0);
  const actual = entries.reduce<number>((a, r) => a + (num(r.actualQuantity) ?? 0), 0);
  const hasData = target > 0 || actual > 0;
  const ach = target > 0 ? (actual / target) * 100 : null;
  return (
    <Space size={10} wrap style={{ display: 'flex' }}>
      <SummaryStat label="Target" value={hasData ? fmtNum(target, 0) : <Text type="secondary">—</Text>} />
      <SummaryStat label="Actual" value={hasData ? fmtNum(actual, 0) : <Text type="secondary">—</Text>} />
      <SummaryStat label="Achievement" value={ach === null ? <Text type="secondary">—</Text> : <AchievementCell value={ach} />} />
    </Space>
  );
};

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

/* ─── Job Cards Section (TASK-CURRENT) ────────────────────────────────────────
 * Shows arrow-shaped status filter chips, a column-toggle popover, the job
 * cards table with compact single-line cells, and a KPI summary row with
 * Total Running Time, Total Downtime, Total Job Cards, MTTR, MTBF.          */

/** Arrow-shaped status chip — mimics a "chevron badge" style */
const ArrowChip: React.FC<{
  label: string; count: number; color: string; bg: string; active: boolean;
  onClick: () => void; isFirst?: boolean; isLast?: boolean;
}> = ({ label, count, color, bg, active, onClick, isFirst, isLast }) => (
  <button
    onClick={onClick}
    style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      paddingLeft: isFirst ? 14 : 20,
      paddingRight: isLast ? 14 : 20,
      height: 32,
      cursor: 'pointer',
      border: 'none',
      background: active ? color : bg,
      color: active ? '#fff' : color,
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
      clipPath: isFirst
        ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
        : isLast
        ? 'polygon(10px 0, 100% 0, 100% 100%, 10px 100%, 0 50%)'
        : 'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
      transition: 'all 0.18s ease',
      outline: 'none',
      boxShadow: active ? `0 2px 8px ${color}55` : 'none',
      marginLeft: isFirst ? 0 : -2,
      zIndex: active ? 2 : 1,
    }}
  >
    {label}
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      background: active ? 'rgba(255,255,255,0.25)' : color,
      color: active ? '#fff' : '#fff',
      fontSize: 10,
      fontWeight: 800,
      lineHeight: 1,
    }}>
      {count}
    </span>
  </button>
);

/** KPI metric tile for the job cards summary row */
const JcKpiTile: React.FC<{
  icon: React.ReactNode; label: string; value: React.ReactNode;
  color?: string; bg?: string;
}> = ({ icon, label, value, color = 'var(--theme-primary,#f59e0b)', bg = 'rgba(245,158,11,0.08)' }) => (
  <div style={{
    flex: 1, minWidth: 120, padding: '10px 14px', borderRadius: 10,
    background: bg,
    border: `1px solid ${color}30`,
    display: 'flex', flexDirection: 'column' as const, gap: 2,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ color, fontSize: 13 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 0.5, color: 'var(--theme-text-muted)' }}>
        {label}
      </span>
    </div>
    <span style={{ fontSize: 18, fontWeight: 800, color, lineHeight: 1.2, whiteSpace: 'nowrap' as const }}>
      {value}
    </span>
  </div>
);

const JC_ALL_COLS = [
  { key: 'no',  title: 'Job Card No' },
  { key: 'rd',  title: 'Requested Date' },
  { key: 'cm',  title: 'Complaint' },
  { key: 'st',  title: 'Status' },
  { key: 'pr',  title: 'Priority' },
  { key: 'ty',  title: 'Type' },
  { key: 'rb',  title: 'Requested By' },
  { key: 'sa',  title: 'Started' },
  { key: 'cl',  title: 'Closed' },
  { key: 'dt',  title: 'Downtime' },
] as const;

type JcColKey = typeof JC_ALL_COLS[number]['key'];

const JC_STATUS_FILTERS: Array<{ key: string; label: string; color: string; bg: string; match: (s?: string|null) => boolean }> = [
  { key: 'all',        label: 'ALL',        color: '#374151', bg: '#f3f4f6', match: () => true },
  { key: 'inprogress', label: 'IN PROGRESS',color: '#2563eb', bg: '#eff6ff', match: (s) => (s ?? '').toLowerCase().includes('progress') },
  { key: 'approved',   label: 'APPROVED',   color: '#16a34a', bg: '#f0fdf4', match: (s) => (s ?? '').toLowerCase().includes('approv') },
  { key: 'pending',    label: 'PENDING',    color: '#d97706', bg: '#fffbeb', match: (s) => (s ?? '').toLowerCase().includes('pending') || (s ?? '').toLowerCase().includes('open') },
  { key: 'closed',     label: 'CLOSED',     color: '#6b7280', bg: '#f9fafb', match: (s) => (s ?? '').toLowerCase().includes('clos') || (s ?? '').toLowerCase().includes('complet') },
];

const JobCardsSection: React.FC<{ jobCards: JobCardLite[]; jobCardsLoading: boolean }> = ({
  jobCards, jobCardsLoading,
}) => {
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [visibleCols, setVisibleCols] = React.useState<Set<JcColKey>>(
    new Set(['no', 'rd', 'cm', 'st', 'pr', 'ty', 'sa', 'cl', 'dt'])
  );
  const [colPopOpen, setColPopOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const sf = JC_STATUS_FILTERS.find((f) => f.key === statusFilter);
    if (!sf || sf.key === 'all') return jobCards;
    return jobCards.filter((r) => sf.match(r.currentStatus));
  }, [jobCards, statusFilter]);

  /* KPI calculations */
  const kpis = React.useMemo(() => {
    const totalJobs = jobCards.length;
    const totalDownMin = jobCards.reduce((s, r) => s + (r.downtimeMinutes ?? 0), 0);
    const closedCards = jobCards.filter((r) => r.closedAt && r.startedAt);
    let repairTimes: number[] = [];
    closedCards.forEach((r) => {
      const diff = dayjs(r.closedAt!).diff(dayjs(r.startedAt!), 'minute');
      if (diff > 0) repairTimes.push(diff);
    });
    const mttr = repairTimes.length ? repairTimes.reduce((a, b) => a + b, 0) / repairTimes.length : null;
    // MTBF: assume total observation window from first to last job card
    let mtbf: number | null = null;
    if (jobCards.length >= 2) {
      const sorted = [...jobCards].sort((a, b) => dayjs(a.requestedAt ?? '').valueOf() - dayjs(b.requestedAt ?? '').valueOf());
      const windowMin = dayjs(sorted[sorted.length - 1].requestedAt ?? '').diff(dayjs(sorted[0].requestedAt ?? ''), 'minute');
      if (windowMin > 0 && jobCards.length > 1) mtbf = windowMin / (jobCards.length - 1);
    }
    const runningMin = closedCards.reduce((s, r) => {
      const diff = dayjs(r.closedAt!).diff(dayjs(r.startedAt!), 'minute');
      return s + (diff > 0 ? diff : 0);
    }, 0);
    return { totalJobs, totalDownMin, runningMin, mttr, mtbf };
  }, [jobCards]);

  const buildColumns = (): ColumnsType<JobCardLite> => {
    const all: ColumnsType<JobCardLite> = [
      {
        title: 'Job Card No', key: 'no', width: 120,
        render: (_, r) => r.jobCardNo
          ? <code style={{ fontSize: 11, fontWeight: 600, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>{r.jobCardNo}</code>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Req. Date', key: 'rd', width: 95,
        render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.requestedAt ? fmtDate(r.requestedAt) : '—'}</span>,
      },
      { title: 'Complaint', key: 'cm', ellipsis: true, render: (_, r) => r.complaint ?? <Typography.Text type="secondary">—</Typography.Text> },
      { title: 'Status', key: 'st', width: 110, render: (_, r) => r.currentStatus ? badge(r.currentStatus) : <Typography.Text type="secondary">—</Typography.Text> },
      { title: 'Priority', key: 'pr', width: 80, render: (_, r) => r.priority ? label(r.priority) : <Typography.Text type="secondary">—</Typography.Text> },
      {
        title: 'Type', key: 'ty', width: 110,
        render: (_, r) => r.maintenanceType
          ? <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{label(r.maintenanceType)}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      { title: 'Req. By', key: 'rb', ellipsis: true, render: (_, r) => r.requestedByUser?.fullName ?? r.requestedByUser?.name ?? r.requestedByUser?.email ?? <Typography.Text type="secondary">—</Typography.Text> },
      {
        title: 'Started', key: 'sa', width: 130,
        render: (_, r) => r.startedAt
          ? <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDateTime(r.startedAt)}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Closed', key: 'cl', width: 130,
        render: (_, r) => r.closedAt
          ? <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{fmtDateTime(r.closedAt)}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Downtime', key: 'dt', align: 'right' as const, width: 80,
        render: (_, r) => r.downtimeMinutes != null
          ? <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--theme-danger,#dc2626)' }}>{fmtMinutes(r.downtimeMinutes)}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
    ];
    return all.filter((c) => visibleCols.has(c.key as JcColKey));
  };

  const colToggleContent = (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Visible Columns
      </div>
      {JC_ALL_COLS.map((col) => (
        <div key={col.key} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={visibleCols.has(col.key)}
            onChange={(e) => {
              const next = new Set(visibleCols);
              if (e.target.checked) next.add(col.key); else next.delete(col.key);
              setVisibleCols(next);
            }}
          >
            <span style={{ fontSize: 12 }}>{col.title}</span>
          </Checkbox>
        </div>
      ))}
    </div>
  );

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <HistoryOutlined style={{ color: 'var(--theme-text-secondary)' }} />
        <Typography.Text strong style={{ fontSize: 13 }}>Job Card History</Typography.Text>
        <div style={{ flex: 1 }} />
        <Popover
          content={colToggleContent}
          trigger="click"
          open={colPopOpen}
          onOpenChange={setColPopOpen}
          placement="bottomRight"
        >
          <Button size="small" icon={<AppstoreOutlined />} style={{ fontSize: 11 }}>
            Columns
          </Button>
        </Popover>
        <Link to="/maintenance/job-cards" style={{ fontSize: 12 }}>Open Job Cards</Link>
      </div>

      {/* Arrow-shaped status filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
        {JC_STATUS_FILTERS.map((sf, i) => {
          const cnt = sf.key === 'all' ? jobCards.length : jobCards.filter((r) => sf.match(r.currentStatus)).length;
          return (
            <ArrowChip
              key={sf.key}
              label={sf.label}
              count={cnt}
              color={sf.color}
              bg={sf.bg}
              active={statusFilter === sf.key}
              onClick={() => setStatusFilter(sf.key)}
              isFirst={i === 0}
              isLast={i === JC_STATUS_FILTERS.length - 1}
            />
          );
        })}
      </div>

      {/* Table */}
      <Table
        rowKey="id"
        size="small"
        loading={jobCardsLoading}
        dataSource={filtered}
        pagination={false}
        locale={{ emptyText: jobCardsLoading ? ' ' : <EmptyState title="No job card history available." description="Job cards raised against this machine will appear here." /> }}
        scroll={{ x: 700 }}
        columns={buildColumns()}
      />

      {/* KPI Summary Row */}
      {jobCards.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
          <JcKpiTile
            icon={<FileTextOutlined />}
            label="Total Job Cards"
            value={kpis.totalJobs}
            color="#2563eb" bg="rgba(37,99,235,0.07)"
          />
          <JcKpiTile
            icon={<ClockCircleOutlined />}
            label="Running Time"
            value={fmtMinutes(kpis.runningMin)}
            color="#16a34a" bg="rgba(22,163,74,0.07)"
          />
          <JcKpiTile
            icon={<ThunderboltOutlined />}
            label="Total Downtime"
            value={fmtMinutes(kpis.totalDownMin)}
            color="#dc2626" bg="rgba(220,38,38,0.07)"
          />
          <JcKpiTile
            icon={<ToolOutlined />}
            label="MTTR"
            value={kpis.mttr !== null ? fmtMinutes(Math.round(kpis.mttr)) : '—'}
            color="#d97706" bg="rgba(217,119,6,0.07)"
          />
          <JcKpiTile
            icon={<BarChartOutlined />}
            label="MTBF"
            value={kpis.mtbf !== null ? fmtMinutes(Math.round(kpis.mtbf)) : '—'}
            color="#7c3aed" bg="rgba(124,58,237,0.07)"
          />
        </div>
      )}
    </Space>
  );
};

/* ─── Tooling Section ─────────────────────────────────────────────────────────

 * Shows tooling components registered for this machine with arrow-chip type
 * filter, column-toggle, KPI tiles (active/inactive/total counts, life info). */

const COMPONENT_TYPE_COLORS_MM: Record<string, string> = {
  DIE: '#f97316', MOULD: '#a855f7', CHAIN: '#06b6d4', TOOL: '#3b82f6',
  FIXTURE: '#f59e0b', COMPONENT: '#eab308', OTHER: '#6b7280',
};

const TOOLING_TYPE_FILTERS: Array<{
  key: string; label: string; color: string; bg: string;
  match: (c: ToolingComponentLite) => boolean;
}> = [
  { key: 'all',       label: 'ALL',       color: '#374151', bg: '#f3f4f6', match: () => true },
  { key: 'active',    label: 'ACTIVE',    color: '#16a34a', bg: '#f0fdf4', match: (c) => c.isActive },
  { key: 'inactive',  label: 'INACTIVE',  color: '#6b7280', bg: '#f9fafb', match: (c) => !c.isActive },
  { key: 'die',       label: 'DIE',       color: '#f97316', bg: '#fff7ed', match: (c) => c.componentType === 'DIE' },
  { key: 'mould',     label: 'MOULD',     color: '#a855f7', bg: '#faf5ff', match: (c) => c.componentType === 'MOULD' },
  { key: 'tool',      label: 'TOOL',      color: '#3b82f6', bg: '#eff6ff', match: (c) => c.componentType === 'TOOL' },
  { key: 'fixture',   label: 'FIXTURE',   color: '#f59e0b', bg: '#fffbeb', match: (c) => c.componentType === 'FIXTURE' },
];

const TOOLING_COLS_DEF = [
  { key: 'code',  title: 'Code' },
  { key: 'name',  title: 'Name' },
  { key: 'type',  title: 'Type' },
  { key: 'item',  title: 'Item (Store)' },
  { key: 'life',  title: 'Expected Life' },
  { key: 'min',   title: 'Min Threshold' },
  { key: 'max',   title: 'Max Threshold' },
  { key: 'uom',   title: 'UOM' },
  { key: 'status',title: 'Status' },
] as const;

type ToolingColKey = typeof TOOLING_COLS_DEF[number]['key'];

const ToolingSection: React.FC<{
  components: ToolingComponentLite[];
  loading: boolean;
  machineId?: string;
}> = ({ components, loading }) => {
  const [typeFilter, setTypeFilter] = React.useState<string>('all');
  const [visibleCols, setVisibleCols] = React.useState<Set<ToolingColKey>>(
    new Set(['code', 'name', 'type', 'item', 'life', 'uom', 'status'])
  );
  const [colPopOpen, setColPopOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const f = TOOLING_TYPE_FILTERS.find((x) => x.key === typeFilter);
    return f ? components.filter(f.match) : components;
  }, [components, typeFilter]);

  const kpis = React.useMemo(() => ({
    total: components.length,
    active: components.filter((c) => c.isActive).length,
    inactive: components.filter((c) => !c.isActive).length,
    types: [...new Set(components.map((c) => c.componentType))].length,
  }), [components]);

  const buildCols = (): ColumnsType<ToolingComponentLite> => {
    const all: ColumnsType<ToolingComponentLite> = [
      {
        title: 'Code', key: 'code', width: 110,
        render: (_, r) => (
          <code style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', whiteSpace: 'nowrap' }}>
            {r.componentCode}
          </code>
        ),
      },
      { title: 'Name', key: 'name', ellipsis: true, render: (_, r) => <span style={{ fontWeight: 600, fontSize: 12 }}>{r.componentName}</span> },
      {
        title: 'Type', key: 'type', width: 90,
        render: (_, r) => {
          const col = COMPONENT_TYPE_COLORS_MM[r.componentType] ?? '#6b7280';
          return (
            <span style={{
              whiteSpace: 'nowrap', display: 'inline-block',
              padding: '1px 7px', borderRadius: 6, fontSize: 10,
              fontWeight: 700, color: '#fff', background: col, letterSpacing: 0.3,
            }}>
              {r.componentType}
            </span>
          );
        },
      },
      {
        title: 'Item (Store)', key: 'item', ellipsis: true,
        render: (_, r) => r.item
          ? <span style={{ fontSize: 11 }}><b>{r.item.name ?? r.item.itemCode}</b>{r.item.name ? <> <Typography.Text type="secondary">({r.item.itemCode})</Typography.Text></> : null}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Expected Life', key: 'life', align: 'right' as const, width: 105,
        render: (_, r) => r.expectedLifeQuantity != null
          ? <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{Number(r.expectedLifeQuantity).toLocaleString()} {r.uom?.code ?? ''}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Min', key: 'min', align: 'right' as const, width: 70,
        render: (_, r) => r.minThreshold != null
          ? <span style={{ whiteSpace: 'nowrap', color: '#d97706', fontWeight: 600 }}>{Number(r.minThreshold).toLocaleString()}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Max', key: 'max', align: 'right' as const, width: 70,
        render: (_, r) => r.maxThreshold != null
          ? <span style={{ whiteSpace: 'nowrap', color: '#16a34a', fontWeight: 600 }}>{Number(r.maxThreshold).toLocaleString()}</span>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'UOM', key: 'uom', width: 60,
        render: (_, r) => r.uom?.code
          ? <code style={{ fontSize: 11, color: 'var(--theme-text-muted)' }}>{r.uom.code}</code>
          : <Typography.Text type="secondary">—</Typography.Text>,
      },
      {
        title: 'Status', key: 'status', width: 80,
        render: (_, r) => r.isActive
          ? <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 11 }}>● Active</span>
          : <span style={{ color: '#6b7280', fontWeight: 600, fontSize: 11 }}>○ Inactive</span>,
      },
    ];
    return all.filter((c) => visibleCols.has(c.key as ToolingColKey));
  };

  const colToggleContent = (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Visible Columns
      </div>
      {TOOLING_COLS_DEF.map((col) => (
        <div key={col.key} style={{ padding: '3px 0' }}>
          <Checkbox
            checked={visibleCols.has(col.key)}
            onChange={(e) => {
              const next = new Set(visibleCols);
              if (e.target.checked) next.add(col.key); else next.delete(col.key);
              setVisibleCols(next);
            }}
          >
            <span style={{ fontSize: 12 }}>{col.title}</span>
          </Checkbox>
        </div>
      ))}
    </div>
  );

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ToolOutlined style={{ color: 'var(--theme-text-secondary)' }} />
        <Typography.Text strong style={{ fontSize: 13 }}>Tooling Components</Typography.Text>
        <div style={{ flex: 1 }} />
        <Popover content={colToggleContent} trigger="click" open={colPopOpen} onOpenChange={setColPopOpen} placement="bottomRight">
          <Button size="small" icon={<AppstoreOutlined />} style={{ fontSize: 11 }}>Columns</Button>
        </Popover>
        <Link to="/master-data/machine-tooling" style={{ fontSize: 12 }}>Open Tooling</Link>
      </div>

      {/* Arrow-chip type filters */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
        {TOOLING_TYPE_FILTERS.map((sf, i) => {
          const cnt = sf.key === 'all' ? components.length : components.filter(sf.match).length;
          return (
            <ArrowChip
              key={sf.key}
              label={sf.label}
              count={cnt}
              color={sf.color}
              bg={sf.bg}
              active={typeFilter === sf.key}
              onClick={() => setTypeFilter(sf.key)}
              isFirst={i === 0}
              isLast={i === TOOLING_TYPE_FILTERS.length - 1}
            />
          );
        })}
      </div>

      {/* Table */}
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={filtered}
        pagination={false}
        locale={{ emptyText: loading ? ' ' : <EmptyState title="No tooling components found." description="Register tooling components for this machine in Machine Tooling." /> }}
        scroll={{ x: 700 }}
        columns={buildCols()}
      />

      {/* KPI tiles */}
      {components.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
          <JcKpiTile icon={<ToolOutlined />} label="Total Components" value={kpis.total} color="#3b82f6" bg="rgba(59,130,246,0.07)" />
          <JcKpiTile icon={<CheckCircleOutlined />} label="Active" value={kpis.active} color="#16a34a" bg="rgba(22,163,74,0.07)" />
          <JcKpiTile icon={<MinusOutlined />} label="Inactive" value={kpis.inactive} color="#6b7280" bg="rgba(107,114,128,0.07)" />
          <JcKpiTile icon={<TagsOutlined />} label="Types" value={kpis.types} color="#a855f7" bg="rgba(168,85,247,0.07)" />
        </div>
      )}
    </Space>
  );
};

/* ─── Production Section ─────────────────────────────────────────────────────
 * Enhanced production view with arrow-chip shift filters, KPI tiles, and
 * column-toggle — matching the Job Cards design style.                        */

const PROD_SHIFT_FILTERS: Array<{
  key: string; label: string; color: string; bg: string;
  match: (e: ProductionEntry) => boolean;
}> = [
  { key: 'all',       label: 'ALL',        color: '#374151', bg: '#f3f4f6', match: () => true },
  { key: 'morning',   label: 'MORNING',    color: '#f59e0b', bg: '#fffbeb', match: (e) => (e.shift?.name ?? '').toLowerCase().includes('morning') || (e.shift?.name ?? '').toLowerCase().includes('a') },
  { key: 'afternoon', label: 'AFTERNOON',  color: '#3b82f6', bg: '#eff6ff', match: (e) => (e.shift?.name ?? '').toLowerCase().includes('afternoon') || (e.shift?.name ?? '').toLowerCase().includes('b') },
  { key: 'night',     label: 'NIGHT',      color: '#7c3aed', bg: '#f5f3ff', match: (e) => (e.shift?.name ?? '').toLowerCase().includes('night') || (e.shift?.name ?? '').toLowerCase().includes('c') },
];

const PROD_ENTRY_COLS = [
  { key: 'date', title: 'Date' },
  { key: 'shift', title: 'Shift' },
  { key: 'item', title: 'Item' },
  { key: 'target', title: 'Target' },
  { key: 'actual', title: 'Actual' },
  { key: 'ach', title: 'Achievement %' },
  { key: 'scrap', title: 'Scrap' },
] as const;
type ProdColKey = typeof PROD_ENTRY_COLS[number]['key'];

const ProductionSection: React.FC<{
  entries: ProductionEntry[];
  targets: MachineTargetLite[];
  entriesLoading: boolean;
  targetsLoading: boolean;
}> = ({ entries, targets, entriesLoading, targetsLoading }) => {
  const [shiftFilter, setShiftFilter] = React.useState<string>('all');
  const [visibleCols, setVisibleCols] = React.useState<Set<ProdColKey>>(
    new Set(['date', 'shift', 'item', 'target', 'actual', 'ach'])
  );
  const [colPopOpen, setColPopOpen] = React.useState(false);

  const filtered = React.useMemo(() => {
    const f = PROD_SHIFT_FILTERS.find((x) => x.key === shiftFilter);
    return f && f.key !== 'all' ? entries.filter(f.match) : entries;
  }, [entries, shiftFilter]);

  const kpis = React.useMemo(() => {
    const totalTarget = entries.reduce((s, e) => s + (Number(e.targetQuantity) || 0), 0);
    const totalActual = entries.reduce((s, e) => s + (Number(e.actualQuantity) || 0), 0);
    const totalScrap = entries.reduce((s, e) => s + (Number(e.scrapQuantity) || 0), 0);
    const avgAch = entries.length ? (entries.reduce((s, e) => s + (Number(e.achievementPercentage) || (totalTarget ? (totalActual / totalTarget) * 100 : 0)), 0) / entries.length) : null;
    return { totalTarget, totalActual, totalScrap, avgAch };
  }, [entries]);

  const buildCols = (): ColumnsType<ProductionEntry> => {
    const all: ColumnsType<ProductionEntry> = [
      { title: 'Date', key: 'date', width: 100, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.entryDate ? dayjs(r.entryDate).format('DD-MMM-YYYY') : '—'}</span> },
      { title: 'Shift', key: 'shift', width: 90, render: (_, r) => r.shift?.name ? <span style={{ whiteSpace: 'nowrap', fontSize: 11, fontWeight: 600 }}>{r.shift.name}</span> : <Typography.Text type="secondary">—</Typography.Text> },
      { title: 'Item', key: 'item', ellipsis: true, render: (_, r) => <ItemCell item={r.item} /> },
      { title: 'Target', key: 'target', align: 'right' as const, width: 75, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.targetQuantity ?? '—'}</span> },
      { title: 'Actual', key: 'actual', align: 'right' as const, width: 75, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600, color: '#2563eb' }}>{r.actualQuantity ?? '—'}</span> },
      { title: 'Achievement %', key: 'ach', align: 'right' as const, width: 110, render: (_, r) => <AchievementCell value={r.achievementPercentage ?? (num(r.targetQuantity) ? ((num(r.actualQuantity) ?? 0) / num(r.targetQuantity)!) * 100 : null)} /> },
      { title: 'Scrap', key: 'scrap', align: 'right' as const, width: 70, render: (_, r) => r.scrapQuantity != null ? <span style={{ whiteSpace: 'nowrap', color: '#dc2626', fontWeight: 600 }}>{r.scrapQuantity}</span> : <Typography.Text type="secondary">—</Typography.Text> },
    ];
    return all.filter((c) => visibleCols.has(c.key as ProdColKey));
  };

  const colToggleContent = (
    <div style={{ minWidth: 160 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--theme-text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Visible Columns</div>
      {PROD_ENTRY_COLS.map((col) => (
        <div key={col.key} style={{ padding: '3px 0' }}>
          <Checkbox checked={visibleCols.has(col.key)} onChange={(e) => {
            const next = new Set(visibleCols);
            if (e.target.checked) next.add(col.key); else next.delete(col.key);
            setVisibleCols(next);
          }}>
            <span style={{ fontSize: 12 }}>{col.title}</span>
          </Checkbox>
        </div>
      ))}
    </div>
  );

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      {/* Summary stats strip (existing ProductionSummary) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <BarChartOutlined style={{ color: 'var(--theme-text-secondary)' }} />
        <Typography.Text strong style={{ fontSize: 13 }}>Production Summary</Typography.Text>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>Target / Actual / Achievement (from recent entries)</Typography.Text>
      </div>
      <ProductionSummary entries={entries} />

      {/* Machine Targets (compact table) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ScheduleOutlined style={{ color: 'var(--theme-text-secondary)' }} />
        <Typography.Text strong style={{ fontSize: 13 }}>Machine Targets</Typography.Text>
        <div style={{ flex: 1 }} />
        <Link to="/production/targets" style={{ fontSize: 12 }}>Open Machine Targets</Link>
      </div>
      <Table
        rowKey="id" size="small" loading={targetsLoading} dataSource={targets} pagination={false}
        locale={{ emptyText: targetsLoading ? ' ' : <Typography.Text type="secondary">No machine targets for this machine</Typography.Text> }}
        scroll={{ x: 640 }}
        columns={[
          { title: 'Shift', key: 'shift', render: (_, r) => <span style={{ whiteSpace: 'nowrap' }}>{r.shift?.name ?? r.shift?.shiftCode ?? '—'}</span> },
          { title: 'Item', key: 'item', width: 210, render: (_, r) => <ItemCell item={r.item} /> },
          { title: 'Target Qty', key: 'tq', align: 'right' as const, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{r.targetQuantity ?? '—'}</span> },
          { title: 'Std Hrs', key: 'sh', align: 'right' as const, render: (_, r) => <span style={{ whiteSpace: 'nowrap' }}>{r.standardHours ?? '—'}</span> },
          { title: 'From', key: 'ef', width: 100, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.effectiveFrom ?? '—'}</span> },
          { title: 'To', key: 'et', width: 100, render: (_, r) => <span style={{ whiteSpace: 'nowrap', fontSize: 11 }}>{r.effectiveTo ?? '—'}</span> },
        ]}
      />

      {/* Production History with arrow-chips + column toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <BarChartOutlined style={{ color: 'var(--theme-text-secondary)' }} />
        <Typography.Text strong style={{ fontSize: 13 }}>Production History</Typography.Text>
        <div style={{ flex: 1 }} />
        <Popover content={colToggleContent} trigger="click" open={colPopOpen} onOpenChange={setColPopOpen} placement="bottomRight">
          <Button size="small" icon={<AppstoreOutlined />} style={{ fontSize: 11 }}>Columns</Button>
        </Popover>
        <Link to="/production/entries" style={{ fontSize: 12 }}>Open Daily Production Entry</Link>
      </div>

      {/* Arrow shift filter chips */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0 }}>
        {PROD_SHIFT_FILTERS.map((sf, i) => {
          const cnt = sf.key === 'all' ? entries.length : entries.filter(sf.match).length;
          return (
            <ArrowChip
              key={sf.key} label={sf.label} count={cnt} color={sf.color} bg={sf.bg}
              active={shiftFilter === sf.key} onClick={() => setShiftFilter(sf.key)}
              isFirst={i === 0} isLast={i === PROD_SHIFT_FILTERS.length - 1}
            />
          );
        })}
      </div>

      <Table
        rowKey="id" size="small" loading={entriesLoading} dataSource={filtered} pagination={false}
        locale={{ emptyText: entriesLoading ? ' ' : <Typography.Text type="secondary">No production entries for this machine</Typography.Text> }}
        scroll={{ x: 640 }}
        columns={buildCols()}
      />

      {/* Production KPI tiles */}
      {entries.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 4 }}>
          <JcKpiTile icon={<BarChartOutlined />} label="Total Target" value={kpis.totalTarget.toLocaleString()} color="#374151" bg="rgba(55,65,81,0.07)" />
          <JcKpiTile icon={<ArrowUpOutlined />} label="Total Actual" value={kpis.totalActual.toLocaleString()} color="#2563eb" bg="rgba(37,99,235,0.07)" />
          <JcKpiTile icon={<ThunderboltOutlined />} label="Total Scrap" value={kpis.totalScrap.toLocaleString()} color="#dc2626" bg="rgba(220,38,38,0.07)" />
          {kpis.avgAch !== null && (
            <JcKpiTile
              icon={<CheckCircleOutlined />}
              label="Avg Achievement"
              value={`${kpis.avgAch.toFixed(1)}%`}
              color={kpis.avgAch >= 70 ? '#16a34a' : kpis.avgAch >= 50 ? '#d97706' : '#dc2626'}
              bg={kpis.avgAch >= 70 ? 'rgba(22,163,74,0.07)' : kpis.avgAch >= 50 ? 'rgba(217,119,6,0.07)' : 'rgba(220,38,38,0.07)'}
            />
          )}
        </div>
      )}
    </Space>
  );
};

// ─── Table Column Visibility Constants ─────────────────────────────────────
const DEFAULT_VISIBLE_COLUMNS: Record<string, boolean> = {
  machineId: true,
  codeNo: true,
  name: true,
  division: true,
  department: true,
  location: true,
  makeModel: true,
  criticality: true,
  status: true,
  actions: true,
};

const COLUMN_LABELS: Record<string, string> = {
  machineId: 'Machine ID',
  codeNo: 'Code / No.',
  name: 'Machine Name & Type',
  division: 'Division & Section',
  department: 'Department',
  location: 'Location',
  makeModel: 'Make / Model',
  criticality: 'Criticality',
  status: 'Status',
  actions: 'Actions',
};

/* ─── 2027 Modal Process Chevron Navigation (Image 1 Upgrade) ─────────────── */
const ModalProcessChevronNav: React.FC<{
  sections: Array<{ key: ViewSection; label: string; icon: React.ReactNode }>;
  active: ViewSection;
  onChange: (key: ViewSection) => void;
}> = ({ sections, active, onChange }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '6px 2px 10px 2px',
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.06))',
      }}
    >
      {sections.map((s, idx) => {
        const isActive = s.key === active;
        const isFirst = idx === 0;
        const isLast = idx === sections.length - 1;

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onChange(s.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isActive ? 10 : sections.length - idx,
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 600,
              letterSpacing: '0.2px',
              color: isActive ? '#ffffff' : '#334155',
              background: isActive
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)'
                : '#f8fafc',
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isActive
                ? '0 4px 14px rgba(37, 99, 235, 0.4)'
                : 'inset 0 1px 0 rgba(255,255,255,0.8)',
              transform: isActive ? 'scale(1.02)' : 'none',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#e2e8f0';
                e.currentTarget.style.color = '#0f172a';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#f8fafc';
                e.currentTarget.style.color = '#334155';
              }
            }}
          >
            <span
              style={{
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                color: isActive ? '#ffffff' : '#3b82f6',
              }}
            >
              {s.icon}
            </span>
            <span>{s.label}</span>
          </button>
        );
      })}
    </div>
  );
};

/* ─── 2027 Main Status Chevron Ribbon (Image 2 Attendance Style) ──────────── */
const STATUS_CHEVRONS = [
  { key: 'ALL', label: 'ALL', color: '#334155', activeBg: '#1e293b', icon: <AppstoreOutlined /> },
  { key: 'ACTIVE', label: 'ACTIVE', color: '#16a34a', activeBg: '#15803d', icon: <CheckCircleOutlined /> },
  { key: 'MAINTENANCE', label: 'MAINTENANCE', color: '#d97706', activeBg: '#b45309', icon: <ToolOutlined /> },
  { key: 'CRITICAL', label: 'BREAKDOWN', color: '#dc2626', activeBg: '#b91c1c', icon: <AlertOutlined /> },
  { key: 'INACTIVE', label: 'INACTIVE', color: '#0891b2', activeBg: '#0e7490', icon: <MinusOutlined /> },
  { key: 'RETIRED', label: 'RETIRED', color: '#64748b', activeBg: '#475569', icon: <DeleteOutlined /> },
];

const StatusChevronRibbon: React.FC<{
  counts: { all: number; active: number; maintenance: number; breakdown: number; inactive: number; retired: number };
  activeKey: string;
  onSelect: (key: string) => void;
}> = ({ counts, activeKey, onSelect }) => {
  const getCount = (k: string) => {
    switch (k) {
      case 'ALL': return counts.all;
      case 'ACTIVE': return counts.active;
      case 'MAINTENANCE': return counts.maintenance;
      case 'CRITICAL': return counts.breakdown;
      case 'INACTIVE': return counts.inactive;
      case 'RETIRED': return counts.retired;
      default: return 0;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'stretch',
        width: '100%',
        overflowX: 'auto',
        padding: '2px 2px 8px 2px',
        marginBottom: 12,
        scrollbarWidth: 'thin',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.08))',
      }}
    >
      {STATUS_CHEVRONS.map((ch, idx) => {
        const isSelected = activeKey === ch.key;
        const isFirst = idx === 0;
        const isLast = idx === STATUS_CHEVRONS.length - 1;
        const count = getCount(ch.key);

        const clipPath = isFirst
          ? 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%)'
          : isLast
          ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%)'
          : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%)';

        return (
          <button
            key={ch.key}
            type="button"
            onClick={() => onSelect(ch.key)}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: isFirst
                ? '10px 22px 10px 16px'
                : isLast
                ? '10px 18px 10px 24px'
                : '10px 20px 10px 24px',
              marginLeft: isFirst ? 0 : -6,
              zIndex: isSelected ? 12 : STATUS_CHEVRONS.length - idx,
              fontSize: 12.5,
              fontWeight: 700,
              letterSpacing: '0.4px',
              color: '#ffffff',
              background: isSelected ? ch.activeBg : ch.color,
              border: 'none',
              clipPath,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flex: '1 0 auto',
              transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
              boxShadow: isSelected ? '0 0 0 2px #ffffff, 0 4px 14px rgba(0,0,0,0.35)' : undefined,
              transform: isSelected ? 'scale(1.025) translateY(-1px)' : 'none',
              opacity: isSelected ? 1 : 0.93,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.opacity = '0.93';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            <span style={{ fontSize: 13, display: 'flex', alignItems: 'center' }}>{ch.icon}</span>
            <span>{ch.label}</span>
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(255, 255, 255, 0.25)',
                borderRadius: 10,
                padding: '1px 7px',
                fontSize: 11.5,
                fontWeight: 800,
                letterSpacing: 0,
                marginLeft: 2,
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
};

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
  const screens = Grid.useBreakpoint();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<string>('machineCode');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  const [search, setSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [fMachineId, setFMachineId] = useState<string>('');
  const [fDivision, setFDivision] = useState<string | undefined>();
  const [fSection, setFSection] = useState<string | undefined>();
  const [fDepartment, setFDepartment] = useState<string | undefined>();
  const [fStatus, setFStatus] = useState<string | undefined>();
  const [fCriticality, setFCriticality] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);

  const handleBarcodeScan = (scannedCode: string) => {
    setScannerOpen(false);
    setSearch(scannedCode);
    setPage(1);
  };

  // ─── Status Counts for 2027 Chevron Status Ribbon ──────────────────────────
  const [statusCounts, setStatusCounts] = useState<{
    all: number;
    active: number;
    maintenance: number;
    breakdown: number;
    inactive: number;
    retired: number;
  }>({ all: 0, active: 0, maintenance: 0, breakdown: 0, inactive: 0, retired: 0 });

  // ─── Column visibility toggle state (Image 2 style) ───────────────────────
  const [visibleCols, setVisibleCols] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('pwi_machine_table_columns_v1');
      if (saved) return { ...DEFAULT_VISIBLE_COLUMNS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_VISIBLE_COLUMNS;
  });

  const activeStatusKey = useMemo(() => {
    if (fCriticality === 'CRITICAL') return 'CRITICAL';
    if (fStatus) return fStatus;
    return 'ALL';
  }, [fStatus, fCriticality]);

  const handleStatusRibbonSelect = (key: string) => {
    if (key === 'ALL') {
      setFStatus(undefined);
      setFCriticality(undefined);
    } else if (key === 'CRITICAL') {
      setFCriticality('CRITICAL');
      setFStatus(undefined);
    } else {
      setFStatus(key);
      setFCriticality(undefined);
    }
    setPage(1);
  };

  const [divisions, setDivisions] = useState<DivisionLk[]>([]);
  const [sections, setSections] = useState<SectionLk[]>([]);
  const [departments, setDepartments] = useState<DepartmentLk[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Machine | null>(null);
  const [detail, setDetail] = useState<Machine | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Minimized Window Tabs State
  const [isFormMinimized, setIsFormMinimized] = useState(false);
  const [isDetailMinimized, setIsDetailMinimized] = useState(false);
  const [isImportMinimized, setIsImportMinimized] = useState(false);

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
  const [toolingComponents, setToolingComponents] = useState<ToolingComponentLite[]>([]);
  const [toolingLoading, setToolingLoading] = useState(false);
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

  const fetchStatusCounts = useCallback(async () => {
    try {
      const res = await apiService.get<{ data: Machine[]; total: number }>('/machines', { limit: 1000 });
      const list = res.data || [];
      let act = 0, maint = 0, bk = 0, inact = 0, ret = 0;
      list.forEach((m) => {
        const s = String(m.status || '').toUpperCase();
        const crit = String(m.criticality || '').toUpperCase();
        if (s === 'ACTIVE') act++;
        else if (s === 'MAINTENANCE' || s === 'UNDER_MAINTENANCE') maint++;
        else if (s === 'INACTIVE' || s === 'IDLE') inact++;
        else if (s === 'RETIRED') ret++;

        if (crit === 'CRITICAL' || s === 'BREAKDOWN') bk++;
      });
      setStatusCounts({
        all: res.total || list.length,
        active: act,
        maintenance: maint,
        breakdown: bk,
        inactive: inact,
        retired: ret,
      });
    } catch {
      // ignore silently on status counts failure
    }
  }, []);

  useEffect(() => { fetchStatusCounts(); }, [fetchStatusCounts]);
  useEffect(() => { fetchMachines(page); }, [page, pageSize, fetchMachines]);

  useEffect(() => {
    (async () => {
      try {
        const [div, sec, dep] = await Promise.all([
          apiService.get<{ data: DivisionLk[] }>('/divisions', { limit: 200, status: 'ACTIVE' }),
          apiService.get<{ data: SectionLk[] }>('/sections', { limit: 500, status: 'ACTIVE' }),
          apiService.get<{ data: DepartmentLk[] }>('/departments', { limit: 500, status: 'ACTIVE' }),
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
    setIsFormMinimized(false);
    setEditing(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openEdit = (m: Machine) => {
    setIsFormMinimized(false);
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

      const BATCH_SIZE = 10;
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (row) => {
            const code = (row.data['machineCode'] || row.data['Machine Code'] || row.data['machinecode'] || '').trim();
            if (existingCodes.has(code.toUpperCase())) {
              row.status = 'DUPLICATE';
              row.errors = ['Machine Code already exists'];
              failed++;
              errors.push(`Row ${row.rowNumber}: Duplicate machine code '${code}'`);
              return;
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
          }),
        );
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
    setIsDetailMinimized(false);
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

  const fetchTooling = useCallback(async () => {
    if (!detail || !detail.id) return;
    setToolingLoading(true);
    try {
      const res = await apiService.get<{ data: ToolingComponentLite[]; total: number }>(
        '/machine-tooling/components', { machineId: detail.id, limit: 100, sortBy: 'componentCode' }
      );
      setToolingComponents(Array.isArray(res?.data) ? res.data : []);
    } catch {
      setToolingComponents([]);
    } finally {
      setToolingLoading(false);
    }
  }, [detail]);

  useEffect(() => {
    if (viewSection === 'tooling' && detail) {
      fetchTooling();
    }
  }, [viewSection, detail, fetchTooling]);

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
      title: <HeaderCell icon={<TagOutlined />} first="System" second="ID" />,
      dataIndex: 'machineId',
      key: 'machineId',
      width: 80,
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
      title: <HeaderCell icon={<SettingOutlined />} first="Machine" second="ID" />,
      dataIndex: 'machineCode',
      key: 'codeNo',
      width: 110,
      align: 'center',
      sorter: true,
      render: (code: string, m: Machine) => {
        const mc = getMachineColor(m);
        const machineNo = m.machineNumber;
        return (
          <Tooltip title={m.name ? `${m.machineCode} — ${m.name}` : m.machineCode}>
            <div style={{ lineHeight: 1.35, textAlign: 'center' }}>
              <div>
                <span style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13.5,
                  letterSpacing: '0.02em',
                  color: mc.light.text,
                  background: mc.light.bg,
                  border: `1px solid ${mc.light.border}`,
                }}>{code ?? '—'}</span>
              </div>
              {machineNo ? <div style={{ color: 'var(--theme-text-secondary)', fontSize: 10.5, fontWeight: 500, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{machineNo}</div> : null}
            </div>
          </Tooltip>
        );
      },
    },
    {
      title: <HeaderCell icon={<ApartmentOutlined />} first="Machine" second="Name" />,
      dataIndex: 'name',
      key: 'name',
      width: 145,
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
      width: 120,
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
      title: <HeaderCell icon={<TeamOutlined />} first="Department" />,
      key: 'department',
      width: 100,
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
      width: 90,
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
      width: 115,
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
      width: 85,
      sorter: true,
      render: (c: string) => <StatusBadge status={c} colorMap={CRITICALITY_COLORS} />,
    },
    {
      title: <HeaderCell icon={<CheckCircleOutlined />} first="Status" />,
      dataIndex: 'status',
      key: 'status',
      width: 85,
      sorter: true,
      render: (s: string) => <StatusBadge status={s} colorMap={STATUS_COLORS} />,
    },
    {
      title: <HeaderCell first="Row" second="Actions" />,
      key: 'actions',
      width: 180,
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
                <span style={{ display: 'inline-flex' }}>
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
                </span>
              </Tooltip>,
            ]}
          />
        );
      },
    },
  ];

  const filteredColumns = useMemo(() => {
    return columns.filter((col) => {
      const key = String(col.key || '');
      if (key === 'actions' || key === 'codeNo') return true;
      return visibleCols[key] !== false;
    });
  }, [columns, visibleCols]);

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
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} className="erp-toolbar-action-btn" style={{ fontWeight: 600 }}>
              Add Machine
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => fetchMachines(page)} className="erp-toolbar-action-btn">
              Refresh
            </Button>
            <Button icon={<ScanOutlined />} onClick={() => setScannerOpen(true)} className="erp-toolbar-action-btn">
              Scan QR / Barcode
            </Button>
            <Dropdown menu={{ items: exportMenu, onClick: onExportMenu }}>
              <Button icon={<DownloadOutlined />} loading={exporting || pdfing || printing} className="erp-toolbar-action-btn">
                Export
              </Button>
            </Dropdown>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)} className="erp-toolbar-action-btn">
              Import
            </Button>
            <Button icon={<FilePdfOutlined />} loading={pdfing} onClick={handleExportPdf} className="erp-toolbar-action-btn">
              PDF
            </Button>
            <Button icon={<PrinterOutlined />} loading={printing} onClick={handlePrintReport} className="erp-toolbar-action-btn">
              Print
            </Button>
            <Button icon={<ClearOutlined />} onClick={resetFilters} className="erp-toolbar-action-btn">
              Clear
            </Button>
          </>
        }
      />

      <Card styles={{ body: { padding: '12px 14px 14px' } }} style={{ marginBottom: 16 }}>
        {/* 2027 Status Chevron Ribbon (Attendance style as requested in Image 2) */}
        <StatusChevronRibbon
          counts={statusCounts}
          activeKey={activeStatusKey}
          onSelect={handleStatusRibbonSelect}
        />

        {/* 2-Row Compact Filter Toolbar matching User Specifications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: '1px solid var(--theme-border, #f0f0f0)' }}>
          {/* Row 1: Search Bar + More Filters + Columns + Reset */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: 'var(--theme-text-muted, #94a3b8)' }} />}
              placeholder="Search Machine Register..."
              style={{ flex: '1 1 200px', minWidth: 160 }}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
            <Badge count={activeFilterCount} size="small">
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowFilters((v) => !v)}
                style={{
                  background: showFilters ? 'var(--theme-accent-soft, #eff6ff)' : undefined,
                  borderColor: showFilters ? 'var(--theme-accent, #3b82f6)' : undefined,
                  color: showFilters ? 'var(--theme-accent, #1d4ed8)' : undefined,
                  fontWeight: 600,
                }}
              >
                More Filters
              </Button>
            </Badge>

            {/* Columns Toggle Dropdown */}
            <Dropdown
              trigger={['click']}
              placement="bottomRight"
              popupRender={() => (
                <div
                  style={{
                    background: '#ffffff',
                    padding: '12px 16px',
                    borderRadius: 8,
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.15)',
                    minWidth: 200,
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 10,
                      paddingBottom: 8,
                      borderBottom: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b' }}>
                      Table Columns
                    </span>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, height: 'auto', fontSize: 11 }}
                      onClick={() => {
                        setVisibleCols(DEFAULT_VISIBLE_COLUMNS);
                        try { localStorage.removeItem('pwi_machine_table_columns_v1'); } catch {}
                      }}
                    >
                      Reset All
                    </Button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                      <Checkbox
                        key={key}
                        checked={visibleCols[key] !== false}
                        disabled={key === 'codeNo' || key === 'actions'}
                        onChange={(e) => {
                          const next = { ...visibleCols, [key]: e.target.checked };
                          setVisibleCols(next);
                          try { localStorage.setItem('pwi_machine_table_columns_v1', JSON.stringify(next)); } catch {}
                        }}
                        style={{ fontSize: 13, color: '#334155' }}
                      >
                        {label}
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

            <Button icon={<ClearOutlined />} onClick={resetFilters}>
              Reset
            </Button>
            {sortInfo && <Text type="secondary" style={{ fontSize: 12 }}>{sortInfo}</Text>}
          </div>

          {/* Row 2: Division & Department side-by-side (امنے سامنے) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="All Divisions"
              style={{ flex: '1 1 140px', minWidth: 130 }}
              value={fDivision}
              options={divisions.map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDivision(v); setFSection(undefined); setFDepartment(undefined); setPage(1); }}
            />
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="All Departments"
              style={{ flex: '1 1 140px', minWidth: 130 }}
              value={fDepartment}
              options={(fSection ? departmentsForSection(fSection) : fDivision
                ? departments.filter((d) => d.divisionId === fDivision)
                : departments).map((d) => ({ value: d.id, label: d.name }))}
              onChange={(v) => { setFDepartment(v); setPage(1); }}
            />
          </div>
        </div>

        {showFilters && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12, padding: '14px 0 6px', marginTop: 12, borderTop: '1px solid #f0f0f0',
          }}>
            <Input
              allowClear prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Machine ID (e.g. MCH001)"
              value={fMachineId}
              onChange={(e) => { setFMachineId(e.target.value); setPage(1); }}
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
            columns={filteredColumns}
            dataSource={machines}
            loading={loading}
            scroll={{ x: 1040 }}
            sticky={{ offsetHeader: 0 }}
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
        open={(!!detail || detailLoading) && !isDetailMinimized}
        onCancel={() => { setDetail(null); setDetailLoading(false); setViewSection('identity'); setIsDetailMinimized(false); }}
        onMinimize={() => setIsDetailMinimized(true)}
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
            <div className="erp-modal-nav" style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <ModalProcessChevronNav
                sections={VIEW_SECTIONS}
                active={viewSection}
                onChange={setViewSection}
              />
            </div>

            {viewSection !== 'production' && viewSection !== 'jobcards' && viewSection !== 'tooling' && (
              <MachineSection model={detailModel} section={viewSection} />
            )}

            {viewSection === 'production' && (
                <ProductionSection
                  entries={prodEntries}
                  targets={prodTargets}
                  entriesLoading={prodEntriesLoading}
                  targetsLoading={prodTargetsLoading}
                />
              )}

              {viewSection === 'jobcards' && (
                <JobCardsSection
                  jobCards={jobCards}
                  jobCardsLoading={jobCardsLoading}
                />
              )}

              {viewSection === 'tooling' && (
                <ToolingSection
                  components={toolingComponents}
                  loading={toolingLoading}
                  machineId={detail?.id}
                />
              )}
            </Space>
          ) : null}
      </DraggableResizableModal>

      <FormModal
        open={modalVisible && !isFormMinimized}
        onMinimize={() => setIsFormMinimized(true)}
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

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
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
        open={importOpen && !isImportMinimized}
        onCancel={closeImport}
        onMinimize={() => setIsImportMinimized(true)}
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

      {/* Universal Floating Minimized Dock for Machine Management */}
      {(isFormMinimized || isDetailMinimized || isImportMinimized) && (
        <div className="erp-minimized-dock" data-testid="machine-minimized-dock">
          {isFormMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsFormMinimized(false);
                setModalVisible(true);
              }}
            >
              <span className="erp-minimized-pulse" />
              <SettingOutlined style={{ color: '#4f46e5' }} />
              <span>{editing ? `Edit: ${editing.machineCode}` : 'Add Machine'}</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFormMinimized(false);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isDetailMinimized && detail && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsDetailMinimized(false);
              }}
            >
              <span className="erp-minimized-pulse" />
              <DesktopOutlined style={{ color: '#0ea5e9' }} />
              <span>{`Machine: ${detail.machineCode}`}</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDetailMinimized(false);
                  setDetail(null);
                }}
              >
                ×
              </span>
            </div>
          )}
          {isImportMinimized && (
            <div
              className="erp-minimized-tab"
              onClick={() => {
                setIsImportMinimized(false);
              }}
            >
              <span className="erp-minimized-pulse" />
              <ImportOutlined style={{ color: '#10b981' }} />
              <span>Import Machines</span>
              <span
                className="erp-minimized-close"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsImportMinimized(false);
                  closeImport();
                }}
              >
                ×
              </span>
            </div>
          )}
        </div>
      )}
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
  onMinimize?: () => void;
}

const FormModal: React.FC<FormModalProps> = ({
  open, editing, saving, form, formDivisionId, formSectionId,
  divisions, sections, departments, sectionsForDivision, departmentsForSection,
  width, height, minWidth, minHeight, stacked, previewModel, onCancel, onOk, onFormTick,
  onMinimize,
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
    onMinimize={onMinimize}
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
                options={[
                  ...(editing?.division?.id && !divisions.some((d) => d.id === editing.division?.id)
                    ? [{ value: editing.division.id, label: `${editing.division.name} (Inactive)`, disabled: true }]
                    : []),
                  ...divisions.map((d) => ({ value: d.id, label: d.name })),
                ]}
                onChange={() => {
                  form.setFieldValue('sectionId', undefined);
                  form.setFieldValue('departmentId', undefined);
                }}
              />
            </Form.Item>
            <Form.Item name="sectionId" label="Section">
              <Select
                allowClear showSearch optionFilterProp="label" placeholder="Select section"
                options={[
                  ...(editing?.section?.id && editing.divisionId === formDivisionId && !sectionsForDivision(formDivisionId).some((s) => s.id === editing.section?.id)
                    ? [{ value: editing.section.id, label: `${editing.section.name} (Inactive)`, disabled: true }]
                    : []),
                  ...sectionsForDivision(formDivisionId).map((s) => ({ value: s.id, label: s.name })),
                ]}
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
