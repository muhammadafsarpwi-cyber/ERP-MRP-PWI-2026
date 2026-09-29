import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App, Button, Calendar, Card, Col, DatePicker, Descriptions, Empty, Form, Input, Modal, Row,
  Select, Space, Spin, Switch, Table, Tag, Tooltip, Typography,
} from 'antd';
import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilterOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MobileOutlined,
  PlusOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RightCircleOutlined,
  SearchOutlined,
  TableOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import apiService from '../../services/api';
import { formatApiError } from '../../utils/apiError';
import { SLIP_ACTOR_FALLBACK } from '../../utils/visitorSlipHtml';
import { printVisitorRegisterDocument, renderVisitorRegisterHtml } from '../../utils/visitorRegisterPrint';
import { DivisionSelect, PageHeader, PhotoCapture, SignaturePad } from '../../components/shared';
import { usePermission } from '../../hooks/usePermission';
import VisitorSlipPreview from './VisitorSlipPreview';

// ─── Types ─────────────────────────────────────────────────────────────────
interface DivisionRow {
  id: string;
  divisionCode: string;
  name: string;
  status?: string;
}

interface LocationRow {
  id: string;
  locationCode: string;
  name: string;
  divisionId: string;
  status?: string;
}

interface HostRow {
  id: string;
  employeeCode: string;
  name: string;
  department: string | null;
  divisionId: string | null;
}

interface VisitorRow {
  id: string;
  /** Server-generated reception reference, printed on the slip (Prompt #19). */
  visitorReference?: string | null;
  visitorName: string;
  cnic: string | null;
  mobile: string | null;
  visitorCompany: string | null;
  hostEmployeeId: string | null;
  hostNameSnapshot: string | null;
  divisionId: string;
  locationId: string;
  division?: { id: string; divisionCode: string; name: string } | null;
  location?: { id: string; locationCode: string; name: string } | null;
  timeIn: string;
  timeOut: string | null;
  status: string;
  /** Server-derived: still on site (status PENDING and no Time-Out yet). */
  onSite?: boolean;
  /** Who recorded the Time-Out (Prompt #18) — null until the visit is closed. */
  exitedBy?: string | null;
  /**
   * Prompt #19B §6 — the resolved `display_name` for each acting ERP user.
   *
   * The `*By` ids above stay in the payload for traceability, but no screen in
   * Visitor Management renders them. These are the fields a UI shows, and the
   * backend fills them from the same `erp_users` directory the slip uses.
   * `null` means "no actor yet"; the fallback name means "an actor exists but
   * could not be resolved".
   */
  exitedByName?: string | null;
  updatedByName?: string | null;
  /** Host confirmation (Prompt #19) — independent of the visit status (§28). */
  hostConfirmed?: boolean;
  hostConfirmedAt?: string | null;
  hostConfirmedBy?: string | null;
  /** #19B §6 — the human name behind `hostConfirmedBy`. */
  hostConfirmedByName?: string | null;
  hasSignature?: boolean;
  hasPhoto: boolean;
  photoUrl?: string | null;
  signatureUrl?: string | null;
  signatureCapturedAt?: string | null;
  signatureCapturedBy?: string | null;
  /** #19B §6 — the human name behind `signatureCapturedBy`. */
  signatureCapturedByName?: string | null;
  createdAt: string;
  createdBy: string | null;
  /** #19B §6 — the human name behind `createdBy`. */
  createdByName?: string | null;
  updatedAt?: string | null;
}

// ─── Status + design tokens ─────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { bg: string; color: string; dot: string }> = {
  PENDING:   { bg: '#fff7e6', color: '#d46b08', dot: '#faad14' },
  INSIDE:    { bg: '#e6f4ff', color: '#0958d9', dot: '#1677ff' },
  COMPLETED: { bg: '#f6ffed', color: '#389e0d', dot: '#52c41a' },
  CANCELLED: { bg: '#f5f5f5', color: '#595959', dot: '#8c8c8c' },
};

function StatusBadge({ status, testId }: { status: string; testId?: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.CANCELLED;
  return (
    <span
      data-testid={testId}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: cfg.bg, color: cfg.color,
        border: `1px solid ${cfg.dot}44`,
        borderRadius: 20, padding: '2px 10px 2px 7px',
        fontSize: 12, fontWeight: 600, letterSpacing: '0.01em',
      }}
    >
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: cfg.dot, boxShadow: `0 0 0 2px ${cfg.dot}33`, flexShrink: 0 }} />
      {status}
    </span>
  );
}

function HostConfirmBadge({ confirmed, testId }: { confirmed?: boolean; testId?: string }) {
  if (confirmed) {
    return (
      <span data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#f6ffed', color: '#389e0d', border: '1px solid #b7eb8f', borderRadius: 20, padding: '2px 10px 2px 7px', fontSize: 12, fontWeight: 600 }}>
        <CheckCircleOutlined style={{ fontSize: 11 }} /> Confirmed
      </span>
    );
  }
  return (
    <span data-testid={testId} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fffbe6', color: '#ad6800', border: '1px solid #ffe58f', borderRadius: 20, padding: '2px 10px 2px 7px', fontSize: 12, fontWeight: 600 }}>
      <ClockCircleOutlined style={{ fontSize: 11 }} /> Pending
    </span>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps { label: string; value: number | string; icon: React.ReactNode; gradient: string; sub?: string; accentColor?: string; }
function KpiCard({ label, value, icon, gradient, sub, accentColor = 'rgba(255,255,255,0.3)' }: KpiCardProps) {
  return (
    <div style={{ background: gradient, borderRadius: 10, color: '#fff', position: 'relative', overflow: 'hidden', boxShadow: '0 4px 18px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column' }}>
      {/* decorative circles */}
      <div style={{ position: 'absolute', top: -24, right: -24, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.1)' }} />
      <div style={{ position: 'absolute', bottom: -32, right: 8, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
      {/* main content */}
      <div style={{ padding: '18px 20px 14px', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 36, fontWeight: 900, lineHeight: 1, letterSpacing: '-1px' }}>{value}</div>
          <div style={{ fontSize: 28, opacity: 0.85 }}>{icon}</div>
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.9, marginTop: 6 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{sub}</div>}
      </div>
      {/* bottom line + More info */}
      <div style={{ borderTop: `1px solid ${accentColor}`, padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: 0.92 }}>
        More info <RightCircleOutlined style={{ fontSize: 13 }} />
      </div>
    </div>
  );
}

// ─── Arrow Tabs ───────────────────────────────────────────────────────────────
type TabKey = 'ALL' | 'PENDING' | 'COMPLETED' | 'INSIDE' | 'CANCELLED';
const TABS: { key: TabKey; label: string; activeBg: string }[] = [
  { key: 'ALL',       label: 'ALL',       activeBg: '#e74c3c' },
  { key: 'PENDING',   label: 'PENDING',   activeBg: '#f39c12' },
  { key: 'INSIDE',    label: 'INSIDE',    activeBg: '#3498db' },
  { key: 'COMPLETED', label: 'COMPLETED', activeBg: '#27ae60' },
  { key: 'CANCELLED', label: 'CANCELLED', activeBg: '#7f8c8d' },
];

interface ArrowTabsProps { active: TabKey; onChange: (key: TabKey) => void; counts: Record<string, number>; }

/**
 * The status filter strip.
 *
 * Prompt #20 — the five status tabs need about 683px at their natural width,
 * which a 390px phone cannot show. The strip was `flexWrap: 'nowrap'` inside an
 * `overflow: hidden` box, so the last tab was not merely trimmed: measured at
 * 390x844 the strip was 352px wide against 682px of content, and `CANCELLED`
 * began at x=540 — entirely past the visible edge. Five status filters with one
 * of them unreachable, and nothing on screen to suggest anything was missing.
 *
 * Two deliberate properties, both measured in Chromium against the real page:
 *
 *   • `flex-wrap: wrap` is the PRIMARY mechanism. At 390x844 the tabs settle
 *     onto 3 rows, at 430x932 onto 2, and every tab lands inside the viewport.
 *     Once a viewport has ~718px available against ~683px of content the strip
 *     no longer wraps, so the desktop and tablet geometry is untouched —
 *     measured identical to before at 768 and 1366 (single row, same right
 *     edge, same tab widths).
 *
 *   • `overflow-x: auto` is a FALLBACK, not the primary path. After wrapping,
 *     `scrollWidth` equals `clientWidth` at every width tested, so no
 *     scrollbar ever appears. It only engages in a pathological case — a
 *     viewport narrower than the widest single tab, or a large font scale —
 *     where scrolling is still better than clipping. The native scrollbar is
 *     hidden by `.vm-status-tabs` so that fallback cannot read as a layout
 *     defect.
 *
 * The active tab is also scrolled back into view whenever it changes, so
 * selecting a tab that was out of view never leaves the user looking at the
 * wrong one. That path is inert at every width where the strip does not scroll.
 */
function ArrowTabs({ active, onChange, counts }: ArrowTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const tab = strip.querySelector<HTMLElement>(`[data-testid="visitor-tab-${active}"]`);
    if (!tab) return;
    // Measured in the strip's own scroll space. `offsetLeft` is relative to the
    // nearest POSITIONED ancestor, which is not this strip, so the rects are
    // converted instead — that stays correct whatever the offset parent is.
    const stripRect = strip.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const left = tabRect.left - stripRect.left + strip.scrollLeft;
    const right = left + tabRect.width;
    // `nearest` semantics: move only when the tab is genuinely outside the
    // window, so nothing shifts at a width where the strip does not scroll.
    if (left < strip.scrollLeft) strip.scrollLeft = left;
    else if (right > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = right - strip.clientWidth;
  }, [active]);

  return (
    <div ref={stripRef} className="vm-status-tabs" data-testid="visitor-status-tabs"
      style={{ display: 'flex', flexWrap: 'wrap', gap: 0, marginBottom: 16, borderRadius: 6, overflowX: 'auto', overflowY: 'hidden' }}>
      {TABS.map((tab, i) => {
        const isActive = active === tab.key;
        const bg = isActive ? tab.activeBg : '#d0d0d0';
        const color = isActive ? '#fff' : '#444';
        const clipPath = i === 0
          ? 'polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%)'
          : i === TABS.length - 1
          ? 'polygon(14px 0,100% 0,100% 100%,0 100%,14px 50%)'
          : 'polygon(14px 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%,14px 50%)';
        return (
          <button key={tab.key} onClick={() => onChange(tab.key)} data-testid={`visitor-tab-${tab.key}`}
            style={{ flex: '1 1 90px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: bg, color, border: 'none', padding: '13px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', transition: 'all 0.2s', clipPath, textTransform: 'uppercase' }}>
            {tab.label}
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: isActive ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.1)', borderRadius: 12, minWidth: 24, height: 20, fontSize: 12, fontWeight: 800, padding: '0 6px' }}>
              {counts[tab.key] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Print Range Modal ────────────────────────────────────────────────────────
interface PrintRangeModalProps {
  open: boolean;
  onClose: () => void;
  onPrint: (mode: 'today' | 'month', date: dayjs.Dayjs) => void;
  /** How many loaded rows the chosen range actually covers, for the hint. */
  rowsInRange?: number;
  /** Controlled: the parent owns the range so the hint and the print agree. */
  mode: 'today' | 'month';
  date: dayjs.Dayjs;
  onModeChange: (mode: 'today' | 'month') => void;
  onDateChange: (date: dayjs.Dayjs) => void;
}
function PrintRangeModal({
  open, onClose, onPrint, rowsInRange, mode, date, onModeChange, onDateChange,
}: PrintRangeModalProps) {
  return (
    <Modal title={<span><PrinterOutlined style={{ color: '#e74c3c', marginRight: 8 }} />Print Visitor Register</span>} open={open} onCancel={onClose} width={480}
      styles={{ body: MODAL_BODY_STYLE }}
      footer={<Space><Button onClick={onClose}>Cancel</Button><Button type="primary" icon={<PrinterOutlined />} style={{ background: '#e74c3c', borderColor: '#e74c3c' }} onClick={() => onPrint(mode, date)}>Print</Button></Space>}>
      <div style={{ padding: '12px 0' }}>
        <Typography.Text strong style={{ marginBottom: 8, display: 'block' }}>Print Range</Typography.Text>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['today', 'month'] as const).map((m) => (
            <button key={m} onClick={() => onModeChange(m)} data-testid={`print-range-${m}`} style={{ flex: 1, padding: '10px 0', background: mode === m ? '#1677ff' : '#f5f5f5', color: mode === m ? '#fff' : '#444', border: `2px solid ${mode === m ? '#1677ff' : '#d9d9d9'}`, borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'all 0.2s' }}>
              {m === 'today' ? 'Today Only' : 'Full Month'}
            </button>
          ))}
        </div>
        <Typography.Text strong style={{ marginBottom: 8, display: 'block' }}>{mode === 'today' ? 'Select Date' : 'Select Month'}</Typography.Text>
        {mode === 'today'
          ? <DatePicker value={date} onChange={(d) => d && onDateChange(d)} style={{ width: '100%' }} format="DD-MMM-YYYY" />
          : <DatePicker.MonthPicker value={date} onChange={(d) => d && onDateChange(d)} style={{ width: '100%' }} format="MMM YYYY" />}
        <Alert style={{ marginTop: 16 }} type="info" showIcon message={`Prints the ${rowsInRange === undefined ? 'currently visible' : rowsInRange} row${rowsInRange === 1 ? '' : 's'} in the current filter, on A4 landscape.`} />
      </div>
    </Modal>
  );
}

/** 13 raw digits or the formatted `00000-0000000-0` (same rule as the API). */
const CNIC_SHAPE = /^(?:\d{13}|\d{5}-\d{7}-\d)$/;

/** Same acceptance rule as the API: PK mobile or a plain 10–15 digit number. */
const MOBILE_SHAPE = /^(?:\+?92|0)?3\d{9}$|^\+?\d{10,15}$/;

/** Store the canonical CNIC form without dropping any digit. */
function normaliseCnic(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 13 ? `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}` : raw;
}

/** Strip display separators only; the digits stay exactly as typed. */
function normaliseMobile(raw: string): string {
  return raw.replace(/[\s\-().]/g, '');
}

/**
 * The ERP screen's timestamp format: `28-Sep-2026 16:05`, 24-hour.
 *
 * This is deliberately NOT the printed slip's format. A visitor pass is a paper
 * document read at a gate, so the slip prints the 12-hour clock with an AM/PM
 * designator (#19A §1, `visitorSlipHtml.formatStamp`); the ERP screen keeps the
 * 24-hour form it shares with every other module in the system, so a timestamp
 * read off a monitor matches one read off any other screen. Both formats are
 * correct for their own surface and the difference is intentional — which is
 * why a redesign that made this helper emit 12-hour AM/PM was a regression, not
 * an improvement: it silently changed the clock on every timestamp in the
 * module, including audit records.
 *
 * `DD-MMM-YYYY` also keeps the century. A two-digit year on a Time-Out is a
 * record a reader cannot place on a timeline.
 */
const formatDateTime = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('DD-MMM-YYYY HH:mm') : '—';
};

/**
 * The Time-In / Time-Out table cell, built from ONE `formatDateTime` call.
 *
 * Prompt #19C — Time-In and Time-Out used to be two lines assembled from two
 * independent formatters: a `DD-MMM-YY` date above a 12-hour clock. Two
 * consequences, both real:
 *
 *   1. The date lost its century. `21-Sep-26` on a Time-Out is an audit record
 *      a reader cannot place on a timeline without assuming a century.
 *   2. The two halves were joined with no separator, so the cell's text read
 *      `21-Sep-266:40 PM` to anything consuming it as a string — a test
 *      assertion, and a screen reader. The quiet space below is a real text
 *      node for exactly that reason.
 *
 * Splitting a single formatted stamp makes it structurally impossible for the
 * date and the clock to disagree, and keeps the cell identical to every other
 * timestamp on the page.
 */
function TimestampCell({ value, testId }: { value: string; testId?: string }) {
  const [datePart, timePart] = formatDateTime(value).split(' ');
  return (
    <div style={{ fontSize: 12, lineHeight: 1.25 }} data-testid={testId}>
      {datePart}{' '}
      <span style={{ fontSize: 11, opacity: 0.6 }}>{timePart}</span>
    </div>
  );
}

// ─── Actor names (Prompt #19B §6) ──────────────────────────────────────────
/**
 * A raw ERP user id is a 36-character UUID. The backend already resolves every
 * acting user to a `display_name`; this guard is the second half of the same
 * promise — if a `*Name` field is itself a UUID, or is missing while an id is
 * present, the screen still shows a person and never an identifier.
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Render the human behind an actor field.
 *
 *   name + id present  → the resolved display name
 *   no name, id present → `SLIP_ACTOR_FALLBACK` ("System User"): somebody acted
 *                        but the directory could not name them
 *   neither            → "—": the action has not happened yet, which is a
 *                        different statement and is not dressed up as a person
 */
function actorName(name?: string | null, id?: string | null): string {
  const candidate = (name ?? '').trim();
  if (candidate && !UUID_SHAPE.test(candidate)) return candidate;
  return (id ?? '').trim() ? SLIP_ACTOR_FALLBACK : '—';
}

/**
 * Prompt #19B §1 — every dialog on this page has to fit the VIEWPORT, header and
 * footer included.
 *
 * antd caps a Modal at 100vh but still positions it `top: 100px`, so a dialog
 * with a long body reaches that cap and pushes its own footer off the bottom of
 * the screen. Measured before this change: on a 1366x768 laptop — a completely
 * ordinary laptop — the Visitor Detail dialog's Print Slip, Confirm Host and
 * Time Out buttons sat 56px BELOW the viewport edge, and on 1366x664 the New
 * Visitor dialog's Register button did the same. The dialog's own actions were
 * only reachable by scrolling the page behind it.
 *
 * Capping the BODY is the antd-idiomatic fix and the least invasive one: the
 * body already scrolls, so the dialog becomes viewport-sized and the footer
 * stays exactly where it is. Nothing about the dialog's content, ordering or
 * styling changes — only where the scroll happens.
 *
 * The 220px reserve covers antd's own chrome (100px top offset, ~44px of modal
 * padding, a ~24px title and a ~32px footer) plus a little slack. It is
 * verified, not assumed: `verify-visitor-p19b-responsive.js` asserts the footer
 * is inside the viewport at 1366x768, 1366x664, 768x1024, 390x844 and 390x667.
 */
const MODAL_BODY_STYLE: React.CSSProperties = {
  maxHeight: 'calc(100vh - 220px)',
  overflowY: 'auto',
};

/**
 * A visitor is on site while the status is PENDING *and* no Time-Out exists —
 * the same rule the API applies when it filters (§10/§20). `onSite` from the
 * server wins; the fallback keeps the table honest for a row shaped without it.
 */
const isOnSite = (row: VisitorRow): boolean =>
  typeof row.onSite === 'boolean' ? row.onSite : row.status === 'PENDING' && !row.timeOut;

export function VisitorManagement() {
  const { message } = App.useApp();
  const { can, allowedDivisionIds, divisionsUnrestricted } = usePermission();
  const canCreate = can('visitor.entry.create');
  // Prompt #18 §21 — same permission family as the rest of the Visitor module.
  // UX only: the backend rejects the request regardless.
  const canExit = can('visitor.entry.update');
  // Prompt #19 §19 — printing the physical document is its own capability, so it
  // has its own permission (`visitor.slip.print`) and a role may hold one
  // without the other. A hidden button is UX only; the slip endpoint is guarded.
  const canPrintSlip = can('visitor.slip.print');

  // ── List state ─────────────────────────────────────────────────────────
  const [rows, setRows] = useState<VisitorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('ALL');
  const [todayOnly, setTodayOnly] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  // The print range lives here, not inside the dialog, so the row-count hint and
  // the printed document are computed from one value and cannot disagree.
  const [printMode, setPrintMode] = useState<'today' | 'month'>('today');
  const [printDate, setPrintDate] = useState<dayjs.Dayjs>(dayjs());
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');

  // ── Division master (client-side intersection with the caller scope) ───
  const [divisionRows, setDivisionRows] = useState<DivisionRow[] | null>(null);

  // ── New visitor modal ──────────────────────────────────────────────────
  const [form] = Form.useForm();
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<VisitorRow | null>(null);
  const [createdPhotoError, setCreatedPhotoError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [locationOptions, setLocationOptions] = useState<LocationRow[]>([]);
  const [hostOptions, setHostOptions] = useState<HostRow[]>([]);
  const [hostLoading, setHostLoading] = useState(false);

  // ── Detail ─────────────────────────────────────────────────────────────
  const [detail, setDetail] = useState<VisitorRow | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ── Exit confirmation (Prompt #18 §14) ─────────────────────────────────
  const [exitTarget, setExitTarget] = useState<VisitorRow | null>(null);
  const [exiting, setExiting] = useState(false);

  // ── Slip + host confirmation (Prompt #19) ───────────────────────────────
  /** The visitor whose slip preview is open; opening it never mutates data. */
  const [slipTarget, setSlipTarget] = useState<VisitorRow | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<VisitorRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [confirmNote, setConfirmNote] = useState<string>('');

  const divisionId = Form.useWatch('divisionId', form);
  const hostSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Divisions the caller may use ───────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    apiService
      .get<{ data?: DivisionRow[] }>('/divisions', { limit: 500, status: 'ACTIVE' })
      .then((res) => {
        if (!cancelled) setDivisionRows(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setDivisionRows(null); // let the picker fall back to its own load
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const divisionOptions = useMemo<DivisionRow[] | null>(() => {
    if (divisionRows === null) return null;
    if (divisionsUnrestricted) return divisionRows;
    const allowed = new Set(allowedDivisionIds);
    return divisionRows.filter((row) => allowed.has(row.id));
  }, [divisionRows, divisionsUnrestricted, allowedDivisionIds]);

  // ── List loader ────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, limit: pageSize };
      if (search.trim()) params.search = search.trim();
      if (activeTab !== 'ALL') params.status = activeTab;
      if (todayOnly) params.today = true;
      const res = await apiService.get<{ data?: VisitorRow[]; total?: number }>(
        '/visitor/entries',
        params,
      );
      setRows(Array.isArray(res?.data) ? res.data : []);
      setTotal(Number(res?.total ?? 0));
    } catch (err: any) {
      setRows([]);
      setTotal(0);
      if (err?.response?.status === 403) {
        message.error('You do not have permission to view visitor entries.');
      } else {
        message.error(formatApiError(err, 'Could not load visitor entries'));
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, activeTab, todayOnly, message]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Division → Location / Host dependency (§17) ────────────────────────
  useEffect(() => {
    // A location (or host) picked for the previous division must never survive
    // a division change — clear it, then reload both lists for the new one.
    form.setFieldValue('locationId', undefined);
    form.setFieldValue('hostEmployeeId', undefined);
    setLocationOptions([]);
    setHostOptions([]);

    if (!divisionId) return undefined;
    let cancelled = false;

    apiService
      .get<{ data?: LocationRow[] }>('/locations', {
        divisionId,
        status: 'ACTIVE',
        limit: 500,
      })
      .then((res) => {
        if (!cancelled) {
          setLocationOptions(Array.isArray(res?.data) ? res.data : []);
        }
      })
      .catch(() => {
        if (!cancelled) setLocationOptions([]);
      });

    apiService
      .get<{ data?: HostRow[] }>('/visitor/hosts', { divisionId, limit: 100 })
      .then((res) => {
        if (!cancelled) setHostOptions(Array.isArray(res?.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setHostOptions([]);
      });

    return () => {
      cancelled = true;
    };
  }, [divisionId, form]);

  useEffect(
    () => () => {
      if (hostSearchRef.current) clearTimeout(hostSearchRef.current);
    },
    [],
  );

  const onHostSearch = useCallback(
    (value: string) => {
      if (hostSearchRef.current) clearTimeout(hostSearchRef.current);
      if (!divisionId) return;
      if (!value.trim()) {
        setHostOptions([]);
        setHostLoading(false);
        void apiService
          .get<{ data?: HostRow[] }>('/visitor/hosts', { divisionId, limit: 100 })
          .then((res) => setHostOptions(Array.isArray(res?.data) ? res.data : []))
          .catch(() => undefined);
        return;
      }
      setHostLoading(true);
      hostSearchRef.current = setTimeout(() => {
        apiService
          .get<{ data?: HostRow[] }>('/visitor/hosts', {
            divisionId,
            search: value.trim(),
            limit: 100,
          })
          .then((res) => setHostOptions(Array.isArray(res?.data) ? res.data : []))
          .catch(() => undefined)
          .finally(() => setHostLoading(false));
      }, 300);
    },
    [divisionId],
  );

  // ── Create ─────────────────────────────────────────────────────────────
  const openCreate = () => {
    form.resetFields();
    setCreated(null);
    setCreatedPhotoError(null);
    setPhotoFile(null);
    setLocationOptions([]);
    setHostOptions([]);
    setCreateOpen(true);
  };

  const submit = async () => {
    let values: any;
    try {
      values = await form.validateFields();
    } catch {
      return; // antd already highlighted the offending fields
    }

    setSubmitting(true);
    let createdRow: VisitorRow | null = null;
    try {
      const payload: Record<string, unknown> = {
        divisionId: values.divisionId,
        locationId: values.locationId,
        visitorName: String(values.visitorName).trim(),
        cnic: normaliseCnic(String(values.cnic).trim()),
        mobile: normaliseMobile(String(values.mobile)),
        hostEmployeeId: values.hostEmployeeId,
      };
      if (values.visitorCompany && String(values.visitorCompany).trim()) {
        payload.visitorCompany = String(values.visitorCompany).trim();
      }

      // NOTE: no time_in / status / host name — the API generates them.
      const res = await apiService.post<{ data: VisitorRow }>('/visitor/entries', payload);
      createdRow = res?.data ?? null;
    } catch (err) {
      message.error(formatApiError(err, 'Could not register the visitor'));
      setSubmitting(false);
      return;
    }

    // Photo is uploaded AFTER the entry exists (the endpoint is entry-scoped).
    // A photo failure never rolls the visitor back — it is reported instead.
    let photoError: string | null = null;
    if (photoFile && createdRow?.id) {
      try {
        const formData = new FormData();
        formData.append('file', photoFile, photoFile.name || 'visitor-photo.jpg');
        await apiService.upload(`/visitor/entries/${createdRow.id}/photo`, formData);
      } catch (err) {
        photoError = formatApiError(err, 'The photo could not be uploaded');
      }
    }

    setCreated(createdRow);
    setCreatedPhotoError(photoError);
    setPhotoFile(null);
    setSubmitting(false);
    message.success('Visitor registered successfully');
    void load();
  };

  const closeCreate = () => {
    setCreateOpen(false);
    setCreated(null);
    setCreatedPhotoError(null);
    setPhotoFile(null);
    form.resetFields();
  };

  // ── Detail ─────────────────────────────────────────────────────────────
  const openDetail = useCallback(async (row: VisitorRow) => {
    setDetail(row);
    setDetailPhoto(null);
    setDetailLoading(true);
    try {
      const res = await apiService.get<{ data?: VisitorRow }>(`/visitor/entries/${row.id}`);
      const full = res?.data ?? row;
      setDetail(full);
      if (full.photoUrl && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const blob = await apiService.getFile(full.photoUrl);
          setDetailPhoto(URL.createObjectURL(blob as Blob));
        } catch {
          setDetailPhoto(null);
        }
      }
    } catch (err) {
      message.error(formatApiError(err, 'Could not open this visitor entry'));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [message]);

  useEffect(
    () => () => {
      if (detailPhoto && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(detailPhoto);
      }
    },
    [detailPhoto],
  );

  // ── Exit / Time-Out (Prompt #18 §14) ───────────────────────────────────
  /**
   * The confirmation dialog never mutates anything by itself: a queued row only
   * becomes the target once the user confirms (§14).
   */
  const askExit = useCallback((row: VisitorRow) => {
    if (!canExit) {
      message.error('You do not have permission to record a visitor exit.');
      return;
    }
    if (!isOnSite(row)) return; // already checked out — the action is hidden
    setExitTarget(row);
  }, [canExit, message]);

  const closeExit = useCallback(() => {
    if (exiting) return; // never leave the dialog while the request is in flight
    setExitTarget(null);
  }, [exiting]);

  /**
   * Confirm → PATCH .../exit. No Time-Out is ever sent: the server generates it
   * (§4). The list row is replaced with the server's own response, so the table
   * can never show a Time-Out the backend did not record.
   */
  const confirmExit = useCallback(async () => {
    if (!exitTarget) return;
    setExiting(true);
    try {
      const res = await apiService.patch<{ data?: VisitorRow }>(
        `/visitor/entries/${exitTarget.id}/exit`,
      );
      const updated = res?.data ?? null;
      setExitTarget(null);
      message.success(
        updated?.timeOut
          ? `Visitor exit recorded at ${formatDateTime(updated.timeOut)}`
          : 'Visitor exit recorded',
      );
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        setDetail((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
      if (activeTab !== 'ALL' || todayOnly) void load();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Lost the race or the visit was closed by someone else — re-read the
        // truth rather than guessing what happened (§15).
        message.error(formatApiError(err, 'Visitor has already checked out'));
        setExitTarget(null);
        void load();
        if (detail?.id === exitTarget.id) void openDetail(exitTarget);
      } else if (status === 403) {
        message.error(formatApiError(err, 'You do not have permission to record this visitor exit'));
        setExitTarget(null);
      } else {
        message.error(formatApiError(err, 'Could not record the visitor exit'));
      }
    } finally {
      setExiting(false);
    }
  }, [exitTarget, detail, activeTab, todayOnly, load, openDetail, message]);

  // ── Slip print / re-print (Prompt #19 §9/§10/§11) ──────────────────────
  /**
   * Opening the preview performs NO write: `VisitorSlipPreview` only issues GET
   * requests for the slip and its images (§9). Printing is also allowed for a
   * COMPLETED visitor — a closed visit stays printable and then shows the real
   * Time-In + Time-Out (§29).
   */
  const openSlip = useCallback(
    (row: VisitorRow | null) => {
      if (!row) return;
      if (!canPrintSlip) {
        message.error('You do not have permission to print a visitor slip.');
        return;
      }
      setSlipTarget(row);
    },
    [canPrintSlip, message],
  );

  // ── Host confirmation (Prompt #19 §12/§15/§16) ────────────────────────
  /**
   * Open the confirmation dialog. Nothing is sent until the user confirms — the
   * dialog itself never mutates state.
   */
  const askHostConfirmation = useCallback(
    (row: VisitorRow) => {
      if (!canExit) {
        message.error('You do not have permission to record a host confirmation.');
        return;
      }
      // §16 — the action disappears once the host has confirmed; a second
      // confirmation would overwrite the first `confirmed_at`.
      if (row.hostConfirmed) return;
      setSignature(null);
      setConfirmNote('');
      setConfirmTarget(row);
    },
    [canExit, message],
  );

  const closeHostConfirmation = useCallback(() => {
    if (confirming) return; // never leave the dialog while the request is in flight
    setConfirmTarget(null);
    setSignature(null);
    setConfirmNote('');
  }, [confirming]);

  /**
   * Confirm → POST .../host-confirmation. The client sends ONLY the optional
   * signature and note: `host_confirmed*` and every Time-Out field are the
   * server's (§17, §28) and a payload that tries to state them is a 400.
   *
   * The response is the server's own updated record, so the row and the detail
   * can only ever show a confirmation the backend actually recorded.
   */
  const confirmHost = useCallback(async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      const payload: Record<string, unknown> = {};
      if (signature) payload.signature = signature;
      if (confirmNote.trim()) payload.note = confirmNote.trim();

      const res = await apiService.post<{ data?: VisitorRow }>(
        `/visitor/entries/${confirmTarget.id}/host-confirmation`,
        payload,
      );
      const updated = res?.data ?? null;
      setConfirmTarget(null);
      setSignature(null);
      setConfirmNote('');
      message.success('Host visit confirmed');
      if (updated) {
        setRows((prev) => prev.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)));
        setDetail((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 409) {
        // Someone else confirmed first, or a double-click. Re-read the truth.
        message.error(formatApiError(err, 'Host visit has already been confirmed'));
        setConfirmTarget(null);
        void load();
        if (detail?.id === confirmTarget.id) void openDetail(confirmTarget);
      } else if (status === 403) {
        message.error(formatApiError(err, 'You do not have permission to record this host confirmation'));
        setConfirmTarget(null);
      } else {
        message.error(formatApiError(err, 'Could not confirm the host visit'));
      }
    } finally {
      setConfirming(false);
    }
  }, [confirmTarget, signature, confirmNote, detail, load, openDetail, message]);

  // ── KPI derivation ─────────────────────────────────────────────────────
  const kpiCounts = useMemo(() => {
    const onSiteCount = rows.filter(isOnSite).length;
    const completedCount = rows.filter((r) => r.status === 'COMPLETED').length;
    const hostPendingCount = rows.filter((r) => !r.hostConfirmed && isOnSite(r)).length;
    return { onSite: onSiteCount, completed: completedCount, hostPending: hostPendingCount };
  }, [rows]);

  const tabCounts = useMemo<Record<string, number>>(() => {
    const counts: Record<string, number> = { ALL: total };
    for (const tab of ['PENDING', 'INSIDE', 'COMPLETED', 'CANCELLED'] as TabKey[]) {
      counts[tab] = rows.filter((r) => r.status === tab).length;
    }
    return counts;
  }, [rows, total]);

  // ── Print handler ──────────────────────────────────────────────────────
  /**
   * The loaded rows that fall inside the chosen print range.
   *
   * Prompt #19C — the range is now actually APPLIED. The dialog has always
   * offered "Today Only" and "Full Month", and the old handler used the
   * selection for nothing but the caption — so a register printed for
   * 29-Sep-2026 could carry visitors from any date the current filter happened
   * to hold, under a header that said otherwise. The rows are already loaded,
   * so this narrows what the screen is already showing: it issues no new
   * request and widens no access. When the range genuinely holds nothing, the
   * document says so rather than printing a blank sheet.
   */
  const printRowsInRange = useCallback(
    (mode: 'today' | 'month', date: dayjs.Dayjs): VisitorRow[] =>
      rows.filter((r) =>
        mode === 'today' ? dayjs(r.timeIn).isSame(date, 'day') : dayjs(r.timeIn).isSame(date, 'month'),
      ),
    [rows],
  );
  /**
   * Print the Visitor REGISTER (the multi-column gate list).
   *
   * This is a different document from the individual Visitor Slip, on purpose.
   * The slip is a single A4 portrait sheet; the register is thirteen columns of
   * tabular data, so it renders and prints A4 **landscape** in its own document
   * built by `visitorRegisterPrint`. Nothing here touches the slip, and nothing
   * in the slip's pipeline reaches here.
   *
   * The chosen range is now actually APPLIED. The dialog has always offered
   * "Today Only" and "Full Month", and the old handler used the selection for
   * nothing but the caption — so a register printed for 29-Sep-2026 could carry
   * visitors from any date the current filter happened to hold, under a header
   * that said otherwise. The rows are already loaded, so this filters what the
   * screen is already showing: it issues no new request and widens no access.
   * When the range genuinely holds nothing, the document says so rather than
   * printing a blank sheet.
   */
  const handlePrint = (mode: 'today' | 'month', date: dayjs.Dayjs) => {
    setPrintModalOpen(false);
    const rangeLabel =
      mode === 'today' ? `Date: ${date.format('DD-MMM-YYYY')}` : `Month: ${date.format('MMMM YYYY')}`;
    printVisitorRegisterDocument(
      renderVisitorRegisterHtml({ rows: printRowsInRange(mode, date), rangeLabel }),
    );
  };

  // ── Columns ────────────────────────────────────────────────────────────
  const columns: ColumnsType<VisitorRow> = useMemo(
    () => [
      {
        title: 'VISITOR ID',
        dataIndex: 'visitorReference',
        key: 'visitorReference',
        width: 150,
        render: (v: string | null, row) =>
          v ? (
            <span
              data-testid={`visitor-ref-${row.id}`}
              style={{
                display: 'inline-block',
                fontFamily: 'monospace',
                background: '#1a1a2e',
                border: '1px solid #3a3a5e',
                borderRadius: 5,
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: 700,
                color: '#a5b4fc',
                whiteSpace: 'nowrap',
                letterSpacing: '0.03em',
              }}
            >
              {v}
            </span>
          ) : <span style={{ color: '#bbb' }}>—</span>,
      },
      {
        title: 'VISITOR NAME',
        dataIndex: 'visitorName',
        key: 'visitorName',
        width: 180,
        render: (value: string, row) => (
          <div>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{value}</div>
            {row.cnic && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                <IdcardOutlined style={{ fontSize: 10 }} />
                <span>{row.cnic}</span>
              </div>
            )}
            {row.mobile && (
              <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                <MobileOutlined style={{ fontSize: 10 }} />
                <span>{row.mobile}</span>
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'COMPANY',
        dataIndex: 'visitorCompany',
        key: 'visitorCompany',
        width: 140,
        render: (v: string | null) => v ? <span style={{ fontSize: 12 }}>{v}</span> : <span style={{ color: '#bbb' }}>—</span>,
      },
      {
        title: 'HOST / DIVISION / LOCATION',
        key: 'hostDivLoc',
        width: 210,
        render: (_, row) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Host */}
            {row.hostNameSnapshot ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <UserOutlined style={{ color: '#1677ff', fontSize: 10, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#1677ff' }}>{row.hostNameSnapshot}</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: '#bbb' }}>—</span>
            )}
            {/* Division */}
            {row.division && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  fontFamily: 'monospace', background: '#1a1a2e', border: '1px solid #3a3a5e',
                  borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                  color: '#a5b4fc', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{row.division.divisionCode}</span>
                <span style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.division.name}</span>
              </div>
            )}
            {/* Location */}
            {row.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{
                  background: '#f0f5ff', border: '1px solid #adc6ff',
                  borderRadius: 3, padding: '1px 5px', fontSize: 10, fontWeight: 700,
                  color: '#2f54eb', whiteSpace: 'nowrap', flexShrink: 0,
                }}>{row.location.locationCode}</span>
                <span style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.location.name}</span>
              </div>
            )}
          </div>
        ),
      },
      {
        title: 'TIME-IN',
        dataIndex: 'timeIn',
        key: 'timeIn',
        width: 120,
        render: (v: string) => <TimestampCell value={v} testId={undefined} />,
      },
      {
        title: 'TIME-OUT',
        dataIndex: 'timeOut',
        key: 'timeOut',
        width: 120,
        render: (v: string | null, row) => {
          if (!v) {
            return isOnSite(row) ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff7e6', color: '#d46b08', border: '1px solid #ffe58f', borderRadius: 20, padding: '2px 9px', fontSize: 11, fontWeight: 600 }} data-testid={`visitor-timeout-pending-${row.id}`}>
                <ClockCircleOutlined style={{ fontSize: 10 }} /> Pending
              </span>
            ) : (
              <span style={{ color: '#bbb' }} data-testid={`visitor-timeout-${row.id}`}>—</span>
            );
          }
          return <TimestampCell value={v} testId={`visitor-timeout-${row.id}`} />;
        },
      },
      {
        title: 'STATUS',
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (status: string) => <StatusBadge status={status} testId={`visitor-status-${status}`} />,
      },
      {
        title: 'HOST CONFIRM',
        key: 'hostConfirmed',
        width: 140,
        render: (_, row) => (
          <HostConfirmBadge
            confirmed={row.hostConfirmed}
            testId={row.hostConfirmed ? `visitor-host-confirmed-${row.id}` : `visitor-host-pending-${row.id}`}
          />
        ),
      },
      {
        title: 'ACTIONS',
        key: 'actions',
        width: 120,
        fixed: 'right' as const,
        render: (_, row) => (
          <Space size={4}>
            {canPrintSlip && (
              <Tooltip title="Print Visitor Slip">
                <Button
                  size="small"
                  icon={<PrinterOutlined />}
                  onClick={() => openSlip(row)}
                  data-testid={`visitor-slip-${row.id}`}
                  className="visitor-action-btn visitor-action-blue"
                  style={{ borderRadius: 6, width: 30, height: 28, padding: 0 }}
                />
              </Tooltip>
            )}
            {canExit && !row.hostConfirmed && isOnSite(row) && (
              <Tooltip title="Confirm Host Visit">
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => askHostConfirmation(row)}
                  data-testid={`visitor-confirm-${row.id}`}
                  className="visitor-action-btn visitor-action-teal"
                  style={{ borderRadius: 6, width: 30, height: 28, padding: 0 }}
                />
              </Tooltip>
            )}
            {canExit && isOnSite(row) && (
              <Tooltip title="Record Time-Out">
                <Button
                  size="small"
                  icon={<LogoutOutlined />}
                  onClick={() => askExit(row)}
                  data-testid={`visitor-exit-${row.id}`}
                  className="visitor-action-btn visitor-action-orange"
                  style={{ borderRadius: 6, width: 30, height: 28, padding: 0 }}
                />
              </Tooltip>
            )}
            <Tooltip title="View Details">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => void openDetail(row)}
                data-testid={`visitor-view-${row.id}`}
                aria-label="View Details"
                className="visitor-action-btn visitor-action-default"
                style={{ borderRadius: 6, width: 30, height: 28, padding: 0 }}
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [canExit, canPrintSlip, askExit, openSlip, openDetail, askHostConfirmation],
  );

  // ── Calendar cell renderer ─────────────────────────────────────────────
  const calendarDateCellRender = useCallback((value: dayjs.Dayjs) => {
    const dayStr = value.format('YYYY-MM-DD');
    const dayRows = rows.filter((r) => dayjs(r.timeIn).format('YYYY-MM-DD') === dayStr);
    if (!dayRows.length) return null;
    return (
      <ul style={{ margin: 0, padding: '0 4px', listStyle: 'none' }}>
        {dayRows.slice(0, 3).map((r) => (
          <li key={r.id} style={{ marginBottom: 2 }}>
            <div
              onClick={() => void openDetail(r)}
              style={{
                cursor: 'pointer', fontSize: 11, lineHeight: '16px',
                background: STATUS_CONFIG[r.status]?.bg ?? '#f5f5f5',
                color: STATUS_CONFIG[r.status]?.color ?? '#595959',
                border: `1px solid ${STATUS_CONFIG[r.status]?.dot ?? '#8c8c8c'}44`,
                borderRadius: 4, padding: '1px 5px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {r.visitorName}
            </div>
          </li>
        ))}
        {dayRows.length > 3 && (
          <li style={{ fontSize: 10, color: '#888', paddingLeft: 4 }}>+{dayRows.length - 3} more</li>
        )}
      </ul>
    );
  }, [rows, openDetail]);

  return (
    <div data-testid="visitor-page">
      {/* ── Page Header — buttons go into the main application header via extra prop ── */}
      <PageHeader
        icon={<UserOutlined />}
        title="Visitors"
        subtitle="Visitor Management — gate register with server-side Time-In"
        extra={
          <Space wrap>
            <Button icon={<PrinterOutlined />} onClick={() => setPrintModalOpen(true)} style={{ borderColor: '#e74c3c', color: '#e74c3c', fontWeight: 600, borderRadius: 6 }}>Print Register</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()} data-testid="visitor-refresh" style={{ borderRadius: 6 }}>Refresh</Button>
            {canCreate && (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} data-testid="new-visitor-button" style={{ background: '#4a0808', borderColor: '#4a0808', borderRadius: 6, fontWeight: 700 }}>New Visitor</Button>
            )}
          </Space>
        }
      />

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <Row gutter={[14, 14]} style={{ marginBottom: 18 }}>
        <Col xs={24} sm={12} md={6}>
          <KpiCard label="Total This View" value={total} icon={<TeamOutlined />} gradient="linear-gradient(135deg,#2ecc71 0%,#27ae60 100%)" sub="Matching current filter" />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard label="Currently On-Site" value={kpiCounts.onSite} icon={<UserOutlined />} gradient="linear-gradient(135deg,#f39c12 0%,#d68910 100%)" sub="PENDING · no Time-Out" />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard label="Completed Visits" value={kpiCounts.completed} icon={<CheckCircleOutlined />} gradient="linear-gradient(135deg,#3498db 0%,#1a6bab 100%)" sub="Time-Out recorded" />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <KpiCard label="Awaiting Host Confirm" value={kpiCounts.hostPending} icon={<ClockCircleOutlined />} gradient="linear-gradient(135deg,#e74c3c 0%,#c0392b 100%)" sub="On-site · not yet confirmed" />
        </Col>
      </Row>

      <Card styles={{ body: { padding: '16px 16px 8px' } }}>
        {/* ── Filters + Today toggle + View toggle ──────────────────────── */}
        <Row gutter={[10, 10]} style={{ marginBottom: 14 }} align="middle">
          <Col xs={24} sm={1}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch checked={todayOnly} onChange={(checked) => { setTodayOnly(checked); setPage(1); }} data-testid="visitor-today-only" style={{ background: todayOnly ? '#27ae60' : undefined }} />
              <Typography.Text strong style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{todayOnly ? 'Today' : 'All'}</Typography.Text>
            </div>
          </Col>
          <Col xs={24} sm={11} md={8}>
            <Input allowClear prefix={<SearchOutlined style={{ color: '#aaa' }} />} placeholder="Search name, company, host, mobile…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} data-testid="visitor-search" style={{ borderRadius: 8 }} />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select allowClear style={{ width: '100%' }}
              placeholder={<span><FilterOutlined style={{ marginRight: 4 }} />All visitors</span>}
              options={[{ value: 'PENDING', label: 'Pending (still on site)' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'INSIDE', label: 'Inside' }, { value: 'CANCELLED', label: 'Cancelled' }]}
              value={activeTab === 'ALL' ? undefined : activeTab}
              onChange={(value) => { setActiveTab(value ?? 'ALL'); setPage(1); }}
              data-testid="visitor-status-filter" />
          </Col>
          <Col xs={24} sm={4} md={3}>
            {/* Table / Calendar toggle */}
            <div style={{ display: 'inline-flex', border: '1px solid #d9d9d9', borderRadius: 7, overflow: 'hidden', height: 32 }}>
              <button
                onClick={() => setViewMode('table')}
                style={{
                  padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                  background: viewMode === 'table' ? '#1677ff' : 'transparent',
                  color: viewMode === 'table' ? '#fff' : '#555',
                  border: 'none', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                <TableOutlined /> Table
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                style={{
                  padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                  background: viewMode === 'calendar' ? '#1677ff' : 'transparent',
                  color: viewMode === 'calendar' ? '#fff' : '#555',
                  border: 'none', borderLeft: '1px solid #d9d9d9', cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                <CalendarOutlined /> Cal
              </button>
            </div>
          </Col>
        </Row>

        {/* ── Arrow Tabs ────────────────────────────────────────────────── */}
        <ArrowTabs active={activeTab} onChange={(key) => { setActiveTab(key); setPage(1); }} counts={tabCounts} />

        {/* ── Table / Calendar ─────────────────────────────────────────── */}
        {viewMode === 'calendar' ? (
          <Calendar
            cellRender={(date, info) => info.type === 'date' ? calendarDateCellRender(date) : null}
            style={{ borderRadius: 8 }}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <Table<VisitorRow>
              rowKey="id"
              size="small"
              loading={loading}
              columns={columns}
              dataSource={rows}
              scroll={{ x: 1400 }}
              locale={{ emptyText: loading ? <Spin size="small" /> : <Empty description="No visitor entries found" /> }}
              components={{
                header: {
                  cell: (props: any) => (
                    <th {...props} style={{ ...props.style, background: '#4a0808', color: '#fff', fontWeight: 700, fontSize: 11, letterSpacing: '0.06em', padding: '11px 12px', borderBottom: '2px solid #6b1010', borderRight: '1px solid rgba(255,255,255,0.08)', whiteSpace: 'nowrap', textTransform: 'uppercase' }} />
                  ),
                },
              }}
              rowClassName={(_, i) => (i % 2 === 1 ? 'visitor-row-alt' : '')}
              pagination={{
                current: page, pageSize, total, showSizeChanger: true,
                showTotal: (count) => <span style={{ fontWeight: 600 }}>{count} visitor{count === 1 ? '' : 's'}</span>,
                onChange: (nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); },
                style: { marginTop: 16 },
              }}
            />
          </div>
        )}
      </Card>

      {/* Alternating row tint + hover + action button styles */}
      <style>{`
        .visitor-row-alt td{background:#f8f9fc!important;}
        .ant-table-tbody>tr:hover>td{background:#eef1ff!important;}
        .visitor-action-btn{background:transparent!important;box-shadow:none!important;}
        .visitor-action-blue{border-color:#1677ff!important;color:#1677ff!important;}
        .visitor-action-blue:hover{background:#1677ff!important;color:#fff!important;}
        .visitor-action-teal{border-color:#13c2c2!important;color:#13c2c2!important;}
        .visitor-action-teal:hover{background:#13c2c2!important;color:#fff!important;}
        .visitor-action-orange{border-color:#fa8c16!important;color:#fa8c16!important;}
        .visitor-action-orange:hover{background:#fa8c16!important;color:#fff!important;}
        .visitor-action-default{border-color:#d9d9d9!important;color:#595959!important;}
        .visitor-action-default:hover{border-color:#1677ff!important;color:#1677ff!important;}
        /* Prompt #20 - the status strip wraps, so it only scrolls in a
           pathological case (a viewport narrower than the widest single tab, or
           a large font scale). Keep that fallback available but never let a
           scrollbar sit under the tabs and read as a layout defect. */
        .vm-status-tabs{scrollbar-width:none;}
        .vm-status-tabs::-webkit-scrollbar{width:0;height:0;display:none;}
      `}</style>

      {/* ── Print Range Modal ──────────────────────────────────────────── */}
      <PrintRangeModal
        open={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        onPrint={handlePrint}
        rowsInRange={printRowsInRange(printMode, printDate).length}
        mode={printMode}
        date={printDate}
        onModeChange={setPrintMode}
        onDateChange={setPrintDate}
      />

      {/* ── New visitor modal ──────────────────────────────────────────── */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserOutlined style={{ color: '#1677ff' }} />{created ? 'Visitor Registered' : 'New Visitor'}</span>}
        open={createOpen}
        onCancel={closeCreate}
        footer={null}
        width={760}
        styles={{ body: MODAL_BODY_STYLE }}
        data-testid="new-visitor-modal"
      >
        {created ? (
          <div data-testid="visitor-created">
            <Alert type="success" showIcon message="Visitor registered successfully." style={{ marginBottom: 12 }} />
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor ID">
                <span data-testid="created-visitor-reference">{created.visitorReference || '—'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Visitor">{created.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host">{created.hostNameSnapshot || '—'}</Descriptions.Item>
              <Descriptions.Item label="Division">
                {created.division ? `${created.division.divisionCode} · ${created.division.name}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Location">
                {created.location ? `${created.location.locationCode} · ${created.location.name}` : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                {/* Display-only: the server generated it, the client cannot edit it. */}
                <span data-testid="created-time-in">{formatDateTime(created.timeIn)}</span>
              </Descriptions.Item>
              <Descriptions.Item label="Time-Out">
                <span data-testid="created-time-out">—</span>
              </Descriptions.Item>
              <Descriptions.Item label="Status"><StatusBadge status={created.status} testId="created-status" /></Descriptions.Item>
            </Descriptions>
            {createdPhotoError && (
              <Alert type="warning" showIcon style={{ marginTop: 12 }} message={`Photo not uploaded: ${createdPhotoError}`} data-testid="created-photo-warning" />
            )}
            {/* §25 — the record is already saved at this point, so the slip is
                generated from the STORED row. Cancelling the print leaves the
                registration completely valid and re-printable from the list or
                from Visitor Detail. */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {canPrintSlip && (
                <Button icon={<PrinterOutlined />} onClick={() => openSlip(created)} data-testid="created-print-slip" style={{ background: '#1677ff', borderColor: '#1677ff', color: '#fff', fontWeight: 600, borderRadius: 6 }}>Print Visitor Slip</Button>
              )}
              <Button type="primary" onClick={closeCreate} data-testid="created-close">Close</Button>
            </div>
          </div>
        ) : (
          <Form form={form} layout="vertical" data-testid="visitor-form">
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Division"
                  name="divisionId"
                  rules={[{ required: true, message: 'Please select a division' }]}
                >
                  <DivisionSelect divisions={divisionOptions} placeholder="Select division" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Location"
                  name="locationId"
                  rules={[{ required: true, message: 'Please select a location for this division' }]}
                >
                  <Select
                    placeholder="Select location"
                    options={locationOptions.map((loc) => ({
                      value: loc.id,
                      label: `${loc.locationCode} · ${loc.name}`,
                    }))}
                    notFoundContent={divisionId ? 'No locations in this division' : 'Select a division first'}
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Visitor Name"
                  name="visitorName"
                  rules={[
                    { required: true, message: 'Please enter the visitor name' },
                    { max: 255, message: 'Visitor name is too long' },
                  ]}
                >
                  <Input placeholder="Full name" data-testid="visitor-form-name" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item
                  label="CNIC"
                  name="cnic"
                  rules={[
                    { required: true, message: 'Please enter the CNIC' },
                    {
                      pattern: CNIC_SHAPE,
                      message: 'CNIC must be 13 digits or formatted as 00000-0000000-0',
                    },
                  ]}
                >
                  <Input placeholder="12345-1234567-1" maxLength={15} data-testid="visitor-form-cnic" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Mobile Number"
                  name="mobile"
                  rules={[
                    { required: true, message: 'Please enter the mobile number' },
                    {
                      validator: (_, value) =>
                        !value || MOBILE_SHAPE.test(normaliseMobile(String(value)))
                          ? Promise.resolve()
                          : Promise.reject(new Error('Mobile number must be a valid number, e.g. 0300-1234567')),
                    },
                  ]}
                >
                  <Input placeholder="0300-1234567" maxLength={20} data-testid="visitor-form-mobile" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item label="Visitor Company / Source" name="visitorCompany">
                  <Input placeholder="Company or source (optional)" maxLength={255} data-testid="visitor-form-company" />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              label="Person Being Visited"
              name="hostEmployeeId"
              rules={[{ required: true, message: 'Please select the person being visited' }]}
            >
              <Select
                showSearch
                allowClear
                filterOption={false}
                loading={hostLoading}
                placeholder="Search employee…"
                onSearch={onHostSearch}
                options={hostOptions.map((host) => ({
                  value: host.id,
                  label: `${host.name} · ${host.employeeCode}`,
                }))}
                notFoundContent={divisionId ? 'No matching employee' : 'Select a division first'}
              />
            </Form.Item>
            <Form.Item label="Visitor Photo" required={false}>
              <PhotoCapture
                value={photoFile}
                onChange={setPhotoFile}
                disabled={submitting}
                testId="visitor-photo"
                hint="Take Photo (camera) or Upload Photo as a fallback · preview shown before saving"
              />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={closeCreate} data-testid="new-visitor-cancel">
                Cancel
              </Button>
              <Button
                type="primary"
                loading={submitting}
                onClick={() => void submit()}
                data-testid="new-visitor-submit"
              >
                Register Visitor
              </Button>
            </div>
          </Form>
        )}
      </Modal>

      {/* ── Detail ────────────────────────────────────────────────────── */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EyeOutlined style={{ color: '#1677ff' }} />Visitor Detail</span>}
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={
          detail ? (
            <Space wrap>
              <Button onClick={() => setDetail(null)} data-testid="visitor-detail-close">
                Close
              </Button>
              {canPrintSlip && (
                <Button icon={<PrinterOutlined />} onClick={() => openSlip(detail)} data-testid="visitor-detail-print" style={{ background: '#1677ff', borderColor: '#1677ff', color: '#fff', fontWeight: 600 }}>Print Visitor Slip</Button>
              )}
              {canExit && !detail.hostConfirmed && (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={() => askHostConfirmation(detail)}
                  data-testid="visitor-detail-confirm-host"
                >
                  Confirm Host Visit
                </Button>
              )}
              {canExit && isOnSite(detail) && (
                <Button
                  danger
                  type="primary"
                  icon={<ClockCircleOutlined />}
                  onClick={() => askExit(detail)}
                  data-testid="visitor-detail-exit"
                >
                  Time Out
                </Button>
              )}
            </Space>
          ) : null
        }
        width={720}
        styles={{ body: MODAL_BODY_STYLE }}
        data-testid="visitor-detail-modal"
      >
        {detailLoading ? (
          <Spin style={{ display: 'block', margin: '24px auto' }} />
        ) : detail ? (
          <div data-testid="visitor-detail">
            {/* #19B §1 — the photo sits beside the record on a laptop and above
                it on a phone. A fixed 10/24 split leaves the descriptions about
                200px on a 390px screen, which no label fits inside. */}
            <Row gutter={[16, 16]}>
              <Col xs={24} md={10}>
                {detailPhoto ? (
                  <img
                    src={detailPhoto}
                    alt={`Visitor ${detail.visitorName}`}
                    data-testid="visitor-detail-photo"
                    style={{ width: '100%', borderRadius: 8, border: '1px solid #d9d9d9' }}
                  />
                ) : (
                  <div
                    data-testid="visitor-detail-photo-placeholder"
                    style={{
                      height: 160,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px dashed #d9d9d9',
                      borderRadius: 8,
                      color: '#999',
                    }}
                  >
                    {detail.hasPhoto ? 'Photo loading…' : 'No photo'}
                  </div>
                )}
              </Col>
              <Col xs={24} md={14}>
                <Descriptions bordered size="small" column={1}>
                  <Descriptions.Item label="Visitor ID">
                    <span data-testid="detail-visitor-reference">
                      {detail.visitorReference || '—'}
                    </span>
                  </Descriptions.Item>
                  <Descriptions.Item label="Visitor">{detail.visitorName}</Descriptions.Item>
                  <Descriptions.Item label="CNIC">{detail.cnic || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Mobile">{detail.mobile || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Visitor Company">
                    {detail.visitorCompany || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Host">{detail.hostNameSnapshot || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Division">
                    {detail.division
                      ? `${detail.division.divisionCode} · ${detail.division.name}`
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Location">
                    {detail.location
                      ? `${detail.location.locationCode} · ${detail.location.name}`
                      : '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Time-In">{formatDateTime(detail.timeIn)}</Descriptions.Item>
                  <Descriptions.Item label="Time-Out">
                    {detail.timeOut ? (
                      <span data-testid="detail-time-out">{formatDateTime(detail.timeOut)}</span>
                    ) : isOnSite(detail) ? (
                      <Tag color="orange" data-testid="detail-time-out-pending">
                        Pending
                      </Tag>
                    ) : (
                      '—'
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="Status">
                    <StatusBadge status={detail.status} testId="detail-status" />
                  </Descriptions.Item>
                  <Descriptions.Item label="Host Confirmation">
                    <HostConfirmBadge
                      confirmed={detail.hostConfirmed}
                      testId={detail.hostConfirmed ? 'detail-host-confirmed' : 'detail-host-pending'}
                    />
                  </Descriptions.Item>
                  {detail.hostConfirmed && (
                    <>
                      <Descriptions.Item label="Confirmed By">
                        {/* #19B §6 — the resolved ERP user name, never the id. */}
                        <span data-testid="detail-host-confirmed-by">
                          {actorName(detail.hostConfirmedByName, detail.hostConfirmedBy)}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Confirmed At">
                        <span data-testid="detail-host-confirmed-at">
                          {formatDateTime(detail.hostConfirmedAt)}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Signature">
                        <span data-testid="detail-signature-status">
                          {detail.hasSignature ? 'Captured' : 'Not captured (physical slip only)'}
                        </span>
                      </Descriptions.Item>
                    </>
                  )}
                  <Descriptions.Item label="Created At">{formatDateTime(detail.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="Created By">
                    <span data-testid="detail-created-by">
                      {actorName(detail.createdByName, detail.createdBy)}
                    </span>
                  </Descriptions.Item>
                  {/* §17 — who recorded the Time-Out, once the visit is closed. */}
                  {detail.timeOut && (
                    <Descriptions.Item label="Exit Recorded By">
                      {/* #19B §6 — the resolved ERP user name, never the id. */}
                      <span data-testid="detail-exited-by">
                        {actorName(detail.exitedByName, detail.exitedBy)}
                      </span>
                    </Descriptions.Item>
                  )}
                </Descriptions>

                {/* §17 — stated once, plainly, so nobody reads "Confirmed By" as
                    proof that the person who clicked is the person being visited. */}
                <Typography.Paragraph
                  type="secondary"
                  style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
                  data-testid="detail-host-identity-note"
                >
                  Host confirmation records the signed-in ERP user as the confirming party. The
                  system does not verify that this user is the selected host.
                </Typography.Paragraph>
              </Col>
            </Row>
          </div>
        ) : null}
      </Modal>

      {/* ── Confirm exit ─────────────────────────────────────────────── */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ClockCircleOutlined style={{ color: '#fa8c16' }} />Confirm Visitor Exit</span>}
        open={!!exitTarget}
        onCancel={closeExit}
        maskClosable={!exiting}
        closable={!exiting}
        width={520}
        styles={{ body: MODAL_BODY_STYLE }}
        data-testid="visitor-exit-modal"
        footer={
          <Space>
            <Button onClick={closeExit} disabled={exiting} data-testid="visitor-exit-cancel">
              Cancel
            </Button>
            <Button
              danger
              type="primary"
              loading={exiting}
              onClick={() => void confirmExit()}
              data-testid="visitor-exit-confirm"
            >
              Confirm Time-Out
            </Button>
          </Space>
        }
      >
        {exitTarget && (
          <div data-testid="visitor-exit-body">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor">{exitTarget.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host">{exitTarget.hostNameSnapshot || '—'}</Descriptions.Item>
              <Descriptions.Item label="Division">
                {exitTarget.division
                  ? `${exitTarget.division.divisionCode} · ${exitTarget.division.name}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Location">
                {exitTarget.location
                  ? `${exitTarget.location.locationCode} · ${exitTarget.location.name}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                <span data-testid="visitor-exit-time-in">{formatDateTime(exitTarget.timeIn)}</span>
              </Descriptions.Item>
            </Descriptions>
            <Alert type="warning" showIcon style={{ marginTop: 12 }} message="Are you sure this visitor has exited the premises?" description="The Time-Out is recorded by the system at the moment you confirm." />
          </div>
        )}
      </Modal>

      {/* ── Confirm host visit ─────────────────────────────────────────── */}
      <Modal
        title={<span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircleOutlined style={{ color: '#27ae60' }} />Confirm Host Visit</span>}
        open={!!confirmTarget}
        onCancel={closeHostConfirmation}
        maskClosable={!confirming}
        closable={!confirming}
        width={620}
        styles={{ body: MODAL_BODY_STYLE }}
        data-testid="visitor-host-modal"
        footer={
          <Space>
            <Button onClick={closeHostConfirmation} disabled={confirming} data-testid="visitor-host-cancel">
              Cancel
            </Button>
            <Button type="primary" loading={confirming} onClick={() => void confirmHost()} data-testid="visitor-host-confirm" style={{ background: '#27ae60', borderColor: '#27ae60', fontWeight: 700 }}>Confirm Host Visit</Button>
          </Space>
        }
      >
        {confirmTarget && (
          <div data-testid="visitor-host-body">
            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Visitor">{confirmTarget.visitorName}</Descriptions.Item>
              <Descriptions.Item label="Host (Person Being Visited)">
                {confirmTarget.hostNameSnapshot || '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Division">
                {confirmTarget.division
                  ? `${confirmTarget.division.divisionCode} · ${confirmTarget.division.name}`
                  : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Time-In">
                <span data-testid="visitor-host-time-in">{formatDateTime(confirmTarget.timeIn)}</span>
              </Descriptions.Item>
            </Descriptions>

            <Alert
              type="info"
              showIcon
              style={{ margin: '12px 0' }}
              data-testid="visitor-host-exit-note"
              message="Confirming the host visit does NOT record the visitor's departure."
              description="The visitor stays PENDING (still on site) until the exit records a Time-Out."
            />

            <Typography.Paragraph style={{ marginBottom: 4 }}>
              Digital signature (optional)
            </Typography.Paragraph>
            <SignaturePad
              value={signature}
              onChange={setSignature}
              disabled={confirming}
              testId="visitor-host-signature"
            />

            <Form.Item
              label="Note (optional, recorded in the audit log only)"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              <Input.TextArea
                rows={2}
                maxLength={200}
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                disabled={confirming}
                data-testid="visitor-host-note"
                placeholder="e.g. Host received the visitor at the department"
              />
            </Form.Item>
          </div>
        )}
      </Modal>

      {/* ── Print / re-print the slip ──────────────────────────────────── */}
      <VisitorSlipPreview
        open={!!slipTarget}
        visitorId={slipTarget?.id ?? null}
        visitorLabel={slipTarget?.visitorReference ?? null}
        onClose={() => setSlipTarget(null)}
      />
    </div>
  );
}

export default VisitorManagement;
