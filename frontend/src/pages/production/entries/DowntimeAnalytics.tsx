/* ─────────────────────────────────────────────────────────────────────────────
 * DowntimeAnalytics.tsx — TAB A · "Downtime Analytics & Details"
 *
 * Read-only analytical sheet. It renders ONLY inside its own tab pane under the
 * existing Daily Production Entry <Tabs> and never writes back, so the live log
 * grid underneath is untouched (Zero-Disturbance Policy).
 *
 * What it answers, top to bottom:
 *   1. A CHART MATRIX — three distinct Recharts types across one horizontal
 *      row: a horizontal BAR of department-wise downtime, a colour-coded DONUT
 *      of reason classification (percentage on hover) and a LINE of the daily
 *      trend. It replaces the old single-colour corner donut entirely.
 *   2. KPI tiles — total downtime, distinct reasons, worst machine, top reason.
 *   3. Multi-Reason Breakdown — the exact split the operator typed on the form,
 *      `1.0h Machine Maintenance | 1.0h Manpower Unavailable`, instead of one
 *      lump "2h" summary. Each entry's child `downtimes` rows are hydrated
 *      lazily (see analyticsData.ts).
 *   4. THE 3-TIER AUDIT TREE — DATE ▸ DEPARTMENT ▸ MACHINE. Tier 1 sums the
 *      plant's whole day, tier 2 nests the manufacturing department inside it,
 *      tier 3 prints the machine with its operational hours and the far-right
 *      OPERATIONAL REMARKS column carrying the floor's own words. Every parent
 *      row is an accordion node with `aria-expanded` + a toggle icon; every
 *      machine opens a drawer with the exact entry logs behind it.
 *
 * Structure lives in the pure model (`analyticsModel.ts`); layout lives in
 * `downtimeAnalytics.css`; paper/PDF output lives in `downtimeAnalyticsPdf.ts`.
 * ──────────────────────────────────────────────────────────────────────────── */

import React, { useMemo, useState } from 'react';
import { Badge, Button, Drawer, Modal, Space, Spin, Table, Tabs, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ApartmentOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FilePdfOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RightOutlined,
  WhatsAppOutlined,
} from '@ant-design/icons';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { displayRunningHours } from './EntryList';
import { entryOvertimeHours } from './overtimeHours';
import { round2 } from './downtimeHours';
import { useLookups } from './lookups';
import { useAnalysisRows, useDowntimeBreakdowns } from './analyticsData';
import {
  breakdownPhrase,
  dailyDowntimeSeries,
  dateWeekday,
  departmentDowntimeBars,
  downtimeBuckets,
  downtimeEntries,
  downtimeTree,
  entryDepartmentLabel,
  entryMachineLabel,
  entryOperationalRemarks,
  hoursFixed,
  machineDowntimeRanking,
  normalizeReason,
  remarksSummary,
  rowDowntimeLines,
  sampleMonthLabel,
} from './analyticsModel';
import type { DateNode, MachineLogNode } from './analyticsModel';
import { CHART_COLORS, ChartFrame, MetricTile, Panel, SheetHead, SheetStatus, labelCellStyle, numCellStyle } from './analyticsUi';
import { buildDowntimePdf } from './downtimeAnalyticsPdf';
import './downtimeAnalytics.css';

export interface DowntimeAnalyticsProps {
  /** Rows the grid currently holds — used to seed the sheet before the wide sample lands. */
  seed: ProductionEntryRow[];
  /** The grid's active filters, so the sheet always analyses exactly what the user is looking at. */
  buildFilters: () => Record<string, unknown>;
  /** True while this tab is the visible pane (gates both requests). */
  active: boolean;
}

/** One opened machine drill-down (tier 3 → its underlying entry logs). */
interface DrillTarget {
  date: string;
  department: string;
  machine: MachineLogNode;
}

/** The six columns the header, every date node, every department node and every machine row share. */
const GRID_COLUMNS = [
  'Date / Department / Machine',
  'Entries',
  'Downtime',
  'Running',
  'Dominant Reason',
  'OPERATIONAL REMARKS',
];

/** Same order as GRID_COLUMNS — one template drives header and every row. */
const GRID_COLUMN_CLASS = [
  'dt-col-name',
  'dt-col-num',
  'dt-col-num',
  'dt-col-num',
  'dt-col-reason',
  'dt-col-remarks',
];

/** Collapse key of a tier-1 (date) node. */
const dayKeyOf = (day: DateNode): string => day.key;
/** Collapse key of a tier-2 (department inside a date) node. */
const deptKeyOf = (day: DateNode, department: string): string => `${day.key}\u0000${department}`;

interface TipRow {
  color?: string;
  label: string;
  value: string;
}

/** The shared hover card used by all three charts. */
const ChartTipBox: React.FC<{ title?: string; rows: TipRow[] }> = ({ title, rows }) => (
  <div
    style={{
      background: 'var(--theme-surface, #ffffff)',
      border: '1px solid #e2e8f0',
      borderRadius: 6,
      padding: '6px 8px',
      fontSize: 11,
      lineHeight: 1.5,
      maxWidth: 250,
      boxShadow: '0 6px 16px rgba(15, 23, 42, 0.14)',
    }}
  >
    {title ? (
      <div style={{ fontWeight: 700, color: 'var(--dt-ink, #0f172a)', marginBottom: 3, wordBreak: 'break-word' }}>
        {title}
      </div>
    ) : null}
    {rows.map((r) => (
      <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {r.color ? (
          <span style={{ width: 8, height: 8, borderRadius: 2, flex: '0 0 8px', background: r.color }} />
        ) : null}
        <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>{r.label}</span>
        <b
          style={{
            marginLeft: 'auto',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--dt-ink, #0f172a)',
            wordBreak: 'break-all',
            textAlign: 'right',
          }}
        >
          {r.value}
        </b>
      </div>
    ))}
  </div>
);

/** Custom SVG shape renderers without Cell children — prevents Recharts circular comparison crashes */
const renderDeptBar = (props: any) => {
  const { x, y, width, height, index } = props;
  const fill = CHART_COLORS[(index ?? 0) % CHART_COLORS.length] || '#2563eb';
  return <rect x={x} y={y} width={Math.max(0, width)} height={height} fill={fill} rx={3} ry={3} />;
};

const renderReasonBar = (props: any) => {
  const { x, y, width, height, index, payload } = props;
  const fill = payload?.color || CHART_COLORS[(index ?? 0) % CHART_COLORS.length] || '#0284c7';
  return <rect x={x} y={y} width={Math.max(0, width)} height={height} fill={fill} rx={3} ry={3} />;
};

const DowntimeAnalytics: React.FC<DowntimeAnalyticsProps> = ({ seed, buildFilters, active }) => {
  const analysis = useAnalysisRows(seed, buildFilters, active);
  const rows = analysis.rows;
  const breakdowns = useDowntimeBreakdowns(rows, active);
  const lookups = useLookups();

  /* ── Aggregations (pure, see analyticsModel.ts) ─────────────────────────── */
  const buckets = useMemo(() => downtimeBuckets(rows, breakdowns.linesById), [rows, breakdowns.linesById]);
  const entries = useMemo(() => downtimeEntries(rows, breakdowns.linesById), [rows, breakdowns.linesById]);
  const tree = useMemo(() => downtimeTree(rows, breakdowns.linesById), [rows, breakdowns.linesById]);
  const deptBars = useMemo(() => departmentDowntimeBars(rows, breakdowns.linesById), [rows, breakdowns.linesById]);
  const trend = useMemo(() => dailyDowntimeSeries(rows), [rows]);
  const ranking = useMemo(() => machineDowntimeRanking(rows, breakdowns.linesById), [rows, breakdowns.linesById]);

  const totalHours = useMemo(() => buckets.reduce((sum, b) => sum + b.hours, 0), [buckets]);
  const totalRunningHours = useMemo(
    () => round2(rows.reduce((sum, r) => sum + toNum(displayRunningHours(r)), 0)),
    [rows],
  );
  const totalPlannedHours = useMemo(
    () => round2(totalHours + totalRunningHours),
    [totalHours, totalRunningHours],
  );
  const totalDowntimePct = totalPlannedHours > 0 ? (totalHours / totalPlannedHours) * 100 : 0;
  const totalPct = (hours: number) => (totalHours > 0 ? (hours / totalHours) * 100 : 0);
  const worst = ranking.length ? ranking[0] : null;
  const top = buckets.length ? buckets[0] : null;

  /* CHART 2 — vertical column bar data for reason classification */
  const reasonBars = useMemo(
    () =>
      buckets.map((b, i) => ({
        reason: b.reason,
        hours: b.hours,
        entries: b.entries,
        pct: totalHours > 0 ? (b.hours / totalHours) * 100 : 0,
        color: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [buckets, totalHours],
  );
  const pieData = reasonBars;

  /* Reason-wise aggregated impact summary with affected departments, running time & rate */
  const reasonSummary = useMemo(() => {
    const map = new Map<
      string,
      { hours: number; runningHours: number; count: number; departments: Set<string>; machines: Set<string> }
    >();
    for (const row of rows) {
      const dept = entryDepartmentLabel(row);
      const mach = entryMachineLabel(row);
      const rowRun = toNum(displayRunningHours(row));
      const lines = rowDowntimeLines(row, breakdowns.linesById);
      for (const line of lines) {
        const reason = normalizeReason(line.reason);
        const cur = map.get(reason) ?? {
          hours: 0,
          runningHours: 0,
          count: 0,
          departments: new Set<string>(),
          machines: new Set<string>(),
        };
        cur.hours = round2(cur.hours + line.hours);
        const fraction = row.downtimeHours && toNum(row.downtimeHours) > 0 ? line.hours / toNum(row.downtimeHours) : 1;
        cur.runningHours = round2(cur.runningHours + rowRun * fraction);
        cur.count += 1;
        if (dept && dept !== 'Unassigned Department') cur.departments.add(dept);
        if (mach && mach !== 'Unassigned Machine') cur.machines.add(mach);
        map.set(reason, cur);
      }
    }
    return [...map.entries()]
      .map(([reason, data], index) => {
        const total = round2(data.hours + data.runningHours);
        const dtRate = total > 0 ? (data.hours / total) * 100 : 0;
        return {
          key: reason,
          reason,
          hours: data.hours,
          runningHours: data.runningHours,
          totalHours: total,
          dtRate,
          count: data.count,
          pct: totalHours > 0 ? (data.hours / totalHours) * 100 : 0,
          departments: [...data.departments].sort().join(', ') || 'All Departments',
          machinesCount: data.machines.size,
          color: CHART_COLORS[index % CHART_COLORS.length],
        };
      })
      .sort((a, b) => b.hours - a.hours || a.reason.localeCompare(b.reason));
  }, [rows, breakdowns.linesById, totalHours]);

  /* Keep the trend's X axis readable: roughly seven ticks whatever the range. */
  const trendInterval = Math.max(0, Math.ceil(trend.length / 7) - 1);

  /* ── Date-wise detail modal & WhatsApp / Print actions ───────────────── */
  const [selectedDateNode, setSelectedDateNode] = useState<DateNode | null>(null);
  const [modalDeptTab, setModalDeptTab] = useState<string>('ALL');

  const handleWhatsAppShare = (node: DateNode | null) => {
    if (!node) return;
    const totalTime = round2(node.runningHours + node.downtimeHours);
    const dtPct = totalTime > 0 ? (node.downtimeHours / totalTime) * 100 : 0;

    const deptLines = node.departments
      .map(
        (d) =>
          `• *${d.department}*: Run ${hoursFixed(d.runningHours)}h | Down ${hoursFixed(d.downtimeHours)}h | Top: ${d.topReason}`,
      )
      .join('\n');

    const msg = [
      `*🏭 PAKISTAN WIRE INDUSTRIES (PVT) LTD*`,
      `*Daily Production & Downtime Report*`,
      `📅 Date: ${node.date} (${node.weekday})`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `⚙️ Total Running Time (RT): ${hoursFixed(node.runningHours)}h`,
      `🛑 Total Downtime (DT): ${hoursFixed(node.downtimeHours)}h`,
      `⏱️ Total Shift Time: ${hoursFixed(totalTime)}h`,
      `📊 Downtime Rate: ${hoursFixed(dtPct, 1)}%`,
      `⚠️ Dominant Stoppage: ${node.topReason}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `*Department-Wise Breakdown:*`,
      deptLines,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `_Generated from PWI ERP 2026_`,
    ].join('\n');

    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePrintDate = (node: DateNode | null) => {
    if (!node) return;
    const totalTime = round2(node.runningHours + node.downtimeHours);
    const dtPct = totalTime > 0 ? (node.downtimeHours / totalTime) * 100 : 0;

    let deptHtml = '';
    for (const dept of node.departments) {
      let machinesHtml = '';
      for (const m of dept.machines) {
        const mTotal = round2(m.runningHours + m.downtimeHours);
        const mPct = mTotal > 0 ? (m.downtimeHours / mTotal) * 100 : 0;
        const reasons = m.reasons.map((r) => `${hoursFixed(r.hours)}h ${r.reason}`).join(' | ') || '—';
        const remarks = m.remarks.join('; ') || '—';
        machinesHtml += `
          <tr>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-weight: 600;">${m.machine}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; color: #15803d; font-weight: 600;">${hoursFixed(m.runningHours)}h</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 700; color: #b91c1c;">${hoursFixed(m.downtimeHours)}h</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right;">${hoursFixed(mTotal)}h</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: 600;">${hoursFixed(mPct, 1)}%</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${reasons}</td>
            <td style="padding: 6px 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #475569;">${remarks}</td>
          </tr>
        `;
      }
      deptHtml += `
        <div style="margin-top: 14px;">
          <div style="background: #f1f5f9; padding: 6px 10px; font-weight: 700; font-size: 13px; border: 1px solid #cbd5e1; border-bottom: none; display: flex; justify-content: space-between;">
            <span>${dept.department}</span>
            <span>Run: ${hoursFixed(dept.runningHours)}h | Down: ${hoursFixed(dept.downtimeHours)}h | Top: ${dept.topReason}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f8fafc;">
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left;">Machine</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">Run (RT)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">Down (DT)</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">Total</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;">DT %</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left;">Breakdown Reasons</th>
                <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: left;">Operational Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${machinesHtml}
            </tbody>
          </table>
        </div>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PWI Downtime Report - ${node.date}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #0f172a; }
          @page { size: A4 landscape; margin: 10mm; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #0f172a; padding-bottom: 8px;">
          <div>
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">PAKISTAN WIRE INDUSTRIES (PVT) LTD</h2>
            <div style="font-size: 13px; font-weight: 600; color: #475569;">Daily Production Shift & Downtime Audit</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 700;">Date: ${node.date} (${node.weekday})</div>
            <div style="font-size: 11px; color: #64748b;">Printed: ${new Date().toLocaleString()}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px; border-radius: 6px;">
          <div><span style="font-size: 10px; color: #64748b; text-transform: uppercase;">Total Running Time (RT)</span><br/><b style="font-size: 15px; color: #15803d;">${hoursFixed(node.runningHours)}h</b></div>
          <div><span style="font-size: 10px; color: #64748b; text-transform: uppercase;">Total Downtime (DT)</span><br/><b style="font-size: 15px; color: #b91c1c;">${hoursFixed(node.downtimeHours)}h</b></div>
          <div><span style="font-size: 10px; color: #64748b; text-transform: uppercase;">Total Shift Time</span><br/><b style="font-size: 15px;">${hoursFixed(totalTime)}h</b></div>
          <div><span style="font-size: 10px; color: #64748b; text-transform: uppercase;">Downtime Rate</span><br/><b style="font-size: 15px; color: #b91c1c;">${hoursFixed(dtPct, 1)}%</b></div>
        </div>

        ${deptHtml}
      </body>
      </html>
    `;

    const printFrame = document.createElement('iframe');
    printFrame.style.position = 'fixed';
    printFrame.style.right = '0';
    printFrame.style.bottom = '0';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = '0';
    document.body.appendChild(printFrame);

    const doc = printFrame.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(printFrame);
        }, 1000);
      }, 350);
    }
  };

  /* ── Accordion + drill-down state ───────────────────────────────────────── */
  // Nodes start EXPANDED: the hierarchy is the answer, and hiding the machine
  // lines behind a first click would only make the sheet look empty. The
  // control below still collapses everything for a day-by-day read.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [drill, setDrill] = useState<DrillTarget | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const toggleNode = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const drillLogs = useMemo(() => {
    if (!drill) return [];
    return [...drill.machine.logs].sort((a, b) => (a.entryDate ?? '').localeCompare(b.entryDate ?? ''));
  }, [drill]);

  const operatorLabel = (row: ProductionEntryRow): string => {
    const raw = (row.operatorName ?? '').trim();
    if (!raw) return '—';
    const emp = lookups.hrEmployees.find((e) => e.id === raw || e.employeeCode === raw);
    return emp ? lookups.employeeFullName(emp) : raw;
  };

  const drillColumns: ColumnsType<ProductionEntryRow> = [
    { title: 'Date', dataIndex: 'entryDate', key: 'date', width: 110, render: (value: string) => value || '—' },
    {
      title: 'Shift Type',
      key: 'shift',
      width: 150,
      render: (_, row) => row.shift?.name || row.shift?.shiftCode || '—',
    },
    { title: 'Operator Name', key: 'operator', width: 170, render: (_, row) => operatorLabel(row) },
    {
      title: 'Duration Split',
      key: 'split',
      render: (_, row) => (
        <div>
          {/* The SAME running figure the live grid prints — never the legacy
              stored column — so the drawer can't contradict the row it came from. */}
          <div className="dt-drill-split">
            Run {hoursFixed(displayRunningHours(row))}h · Down {hoursFixed(toNum(row.downtimeHours))}h · OT{' '}
            {hoursFixed(entryOvertimeHours(row))}h
          </div>
          <div className="dt-drill-reason">{breakdownPhrase(row, breakdowns.linesById)}</div>
        </div>
      ),
    },
  ];

  const status =
    analysis.error ??
    (breakdowns.hydrating
      ? `Resolving line-level breakdown for ${breakdowns.pending} entr${breakdowns.pending === 1 ? 'y' : 'ies'}…`
      : analysis.loading
        ? 'Loading the analytical sample…'
        : null);

  const caption = analysis.loaded
    ? `Read-only · ${formatNumber(rows.length, 0)} of ${formatNumber(analysis.scopeTotal, 0)} matching entries analysed · downtime lines resolved for the entries that carry them.`
    : `Read-only · seeded with the ${formatNumber(rows.length, 0)} entries on the current page while the filtered sample loads.`;

  const exportPdf = () => {
    if (!tree.length) {
      message.warning('No downtime to export to PDF');
      return;
    }
    setPdfBusy(true);
    try {
      const doc = buildDowntimePdf(tree, {
        title: 'Downtime Analytics & Details',
        caption,
      });
      doc.save(`downtime-analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
      message.success('PDF downloaded');
    } catch {
      message.error('PDF export failed');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="dt-sheet" data-testid="downtime-analytics-sheet" style={{ padding: '4px 0 12px' }}>
      <SheetHead
        title={<span><ClockCircleOutlined style={{ color: 'var(--theme-warning, #d97706)', marginRight: 6 }} />Downtime Analytics &amp; Details</span>}
        caption={caption}
        extra={
          <>
            <Button
              className="dt-no-print"
              size="small"
              icon={<PrinterOutlined />}
              onClick={() => window.print()}
              data-testid="downtime-print"
            >
              Print
            </Button>
            <Button
              className="dt-no-print"
              size="small"
              icon={<FilePdfOutlined />}
              loading={pdfBusy}
              onClick={exportPdf}
              data-testid="downtime-pdf"
            >
              PDF
            </Button>
            <Button
              className="dt-no-print"
              size="small"
              icon={<ReloadOutlined />}
              loading={analysis.loading}
              onClick={analysis.refresh}
              data-testid="downtime-refresh"
            >
              Refresh
            </Button>
          </>
        }
      />
      <SheetStatus text={status} />

      {/* ── 1 · CHART MATRIX — bar · donut · line, one horizontal row ──────── */}
      <div className="dt-charts" data-testid="downtime-charts">
        {/* CHART 1 — department-wise downtime, horizontal bars, worst first. */}
        <section className="dt-chart-card" data-testid="downtime-chart-departments">
          <div className="dt-chart-card-title">Department-Wise Downtime Breakdown</div>
          <div className="dt-chart-card-body">
            {deptBars.length === 0 ? (
              <div className="dt-chart-empty">Nothing to plot for the selected period.</div>
            ) : (
              <ChartFrame height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptBars} margin={{ top: 10, right: 10, bottom: 26, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="department"
                      tick={{ fontSize: 9, fill: 'var(--dt-ink, #0f172a)' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={0}
                      angle={-22}
                      textAnchor="end"
                      height={42}
                    />
                    <YAxis
                      type="number"
                      tick={{ fontSize: 9.5, fill: 'var(--dt-muted, #94a3b8)' }}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                      allowDecimals
                      width={38}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload ?? {};
                        return (
                          <ChartTipBox
                            title={String(d.department ?? label ?? '')}
                            rows={[
                              { color: payload[0].color ?? payload[0].fill, label: 'Downtime', value: `${hoursFixed(toNum(d.hours))}h` },
                              { label: 'Entries', value: formatNumber(toNum(d.entries), 0) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar
                      dataKey="hours"
                      name="Downtime (H)"
                      shape={renderDeptBar}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </div>
        </section>

        {/* CHART 2 — Reason-Wise Downtime Breakdown, vertical standing columns (matches Chart 1). */}
        <section className="dt-chart-card" data-testid="downtime-chart-reasons">
          <div className="dt-chart-card-title">
            {`Reason-Wise Downtime Breakdown — ${sampleMonthLabel(rows)}`}
          </div>
          <div className="dt-chart-card-body">
            {reasonBars.length === 0 ? (
              <div className="dt-chart-empty">Nothing to plot for the selected period.</div>
            ) : (
              <ChartFrame height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={reasonBars}
                    margin={{ top: 10, right: 10, bottom: 28, left: -14 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="reason"
                      tick={{ fontSize: 8.5, fill: 'var(--dt-ink, #0f172a)' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={0}
                      angle={-28}
                      textAnchor="end"
                      height={46}
                    />
                    <YAxis
                      type="number"
                      tick={{ fontSize: 9.5, fill: 'var(--dt-muted, #94a3b8)' }}
                      tickLine={false}
                      axisLine={false}
                      unit="h"
                      allowDecimals
                      width={38}
                    />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload ?? {};
                        return (
                          <ChartTipBox
                            title={String(d.reason ?? label ?? '')}
                            rows={[
                              { color: payload[0].color ?? payload[0].fill, label: 'Downtime', value: `${hoursFixed(toNum(d.hours))}h` },
                              { label: 'Share', value: `${hoursFixed(toNum(d.pct), 1)}%` },
                              { label: 'Entries', value: formatNumber(toNum(d.entries), 0) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Bar
                      dataKey="hours"
                      name="Downtime (H)"
                      shape={renderReasonBar}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </div>
        </section>

        {/* CHART 3 — daily downtime trend, the spike-and-drop trajectory. */}
        <section className="dt-chart-card" data-testid="downtime-chart-trend">
          <div className="dt-chart-card-title">Daily Downtime Trend</div>
          <div className="dt-chart-card-body">
            {trend.length === 0 ? (
              <div className="dt-chart-empty">Nothing to plot for the selected period.</div>
            ) : (
              <ChartFrame height={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9.5 }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      interval={trendInterval}
                      tickFormatter={(v) => String(v).slice(5)}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={40} allowDecimals />
                    <ChartTooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload ?? {};
                        const date = String(d.date ?? label ?? '');
                        return (
                          <ChartTipBox
                            title={`${date}${date ? ` · ${dateWeekday(date)}` : ''}`}
                            rows={[
                              { color: '#dc2626', label: 'Downtime', value: `${hoursFixed(toNum(d.hours))}h` },
                              { label: 'Entries', value: formatNumber(toNum(d.entries), 0) },
                            ]}
                          />
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="hours"
                      name="Downtime (H)"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 2.5, fill: '#dc2626' }}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </div>
        </section>
      </div>

      {/* ── 2 · KPI tiles with RT, DT, Total Time, and Downtime Rate ────────── */}
      <div className="dt-tiles">
        <MetricTile
          testId="dt-total"
          label="Total Downtime (DT)"
          value={`${hoursFixed(totalHours)}h`}
          tone={totalHours > 0 ? 'var(--theme-danger, #dc2626)' : undefined}
          hint={`${entries.length} stops recorded`}
        />
        <MetricTile
          testId="dt-running"
          label="Running Time (RT)"
          value={`${hoursFixed(totalRunningHours)}h`}
          tone="var(--theme-success, #10b981)"
          hint="Operational shift run"
        />
        <MetricTile
          testId="dt-planned"
          label="Total Shift Time"
          value={`${hoursFixed(totalPlannedHours)}h`}
          hint="Plant capacity total"
        />
        <MetricTile
          testId="dt-rate"
          label="Plant Downtime Rate"
          value={`${hoursFixed(totalDowntimePct, 1)}%`}
          tone={totalDowntimePct > 20 ? 'var(--theme-danger, #dc2626)' : 'var(--theme-warning, #f59e0b)'}
          hint={top ? `Top: ${top.reason}` : 'No downtime logged'}
        />
        <MetricTile
          testId="dt-worst-machine"
          label="Worst Machine"
          value={worst ? worst.machine : '—'}
          hint={worst ? `${hoursFixed(worst.downtimeHours)}h · ${worst.department}` : 'No downtime logged'}
        />
      </div>

      {/* ── 3 · Multi-Reason Breakdown & Date-Wise Drill-Down ─────────────── */}
      <Panel
        title="Downtime Reasons & Date-Wise Details"
        titleExtra={
          breakdowns.hydrating ? (
            <span style={{ fontSize: 11, color: 'var(--theme-warning, #d97706)', fontWeight: 600 }}>
              <Spin size="small" style={{ marginRight: 6 }} />
              resolving breakdown…
            </span>
          ) : null
        }
        testId="downtime-breakdown"
      >
        {entries.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '6px 2px' }}>
            No downtime was logged in this period — every machine ran its full shift.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* 3.1: Reason Impact Summary Table with DT, RT, Total & DT % */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme-text-muted, #94a3b8)', marginBottom: 6 }}>
                Reason Impact Summary · خلاصہ بلحاظ سبب، رننگ و ڈاؤن ٹائم
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--theme-header-bg, #f8fafc)' }}>
                    <tr>
                      <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reason Category</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Down (DT)</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-success, #10b981)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Running (RT)</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Time</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DT %</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Share of DT</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Machines Hit</th>
                      <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impacted Departments</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reasonSummary.map((item) => (
                      <tr key={item.key} style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                        <td style={{ ...labelCellStyle, fontWeight: 600 }}>
                          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: item.color, marginRight: 8, verticalAlign: 'middle' }} />
                          {item.reason}
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 700, color: 'var(--theme-danger, #dc2626)' }}>
                          {hoursFixed(item.hours)}h
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600, color: 'var(--theme-success, #10b981)' }}>
                          {hoursFixed(item.runningHours)}h
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600 }}>
                          {hoursFixed(item.totalHours)}h
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right' }}>
                          <Tag color={item.dtRate > 25 ? 'red' : item.dtRate > 10 ? 'orange' : 'green'} style={{ margin: 0, fontSize: 11 }}>
                            {hoursFixed(item.dtRate, 1)}%
                          </Tag>
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600 }}>
                          {hoursFixed(item.pct, 1)}%
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #64748b)' }}>
                          {item.machinesCount} machines ({item.count} stops)
                        </td>
                        <td style={{ ...labelCellStyle, color: 'var(--theme-text-secondary, #475569)' }}>
                          {item.departments}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 3.2: Date-Wise Summary Table — compact executive view with Click-to-Drill */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--theme-text-muted, #94a3b8)' }}>
                  Date-Wise Production & Downtime Summary · تاریخ وار خلاصہ ({tree.length} days)
                </div>
                <span style={{ fontSize: 11, color: '#64748b' }}>
                  Click any date row or "View Details" to open department & machine breakdown with Print/WhatsApp
                </span>
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ background: 'var(--theme-header-bg, #f8fafc)' }}>
                    <tr>
                      <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 120 }}>Date & Day</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-success, #10b981)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 95 }}>Running (RT)</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 95 }}>Down (DT)</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 95 }}>Total Time</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 80 }}>DT %</th>
                      <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>Stops</th>
                      <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Departments</th>
                      <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 160 }}>Dominant Reason</th>
                      <th style={{ ...labelCellStyle, textAlign: 'center', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 130 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tree.map((dayNode) => {
                      const dayTotal = round2(dayNode.runningHours + dayNode.downtimeHours);
                      const dayRate = dayTotal > 0 ? (dayNode.downtimeHours / dayTotal) * 100 : 0;
                      const stoppedMachinesCount = dayNode.departments.reduce(
                        (acc, d) => acc + d.machines.filter((m) => m.downtimeHours > 0).length,
                        0,
                      );
                      return (
                        <tr
                          key={dayNode.key}
                          style={{
                            borderTop: '1px solid var(--theme-border, #e2e8f0)',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s ease',
                          }}
                          className="dt-date-summary-row"
                          onClick={() => {
                            setSelectedDateNode(dayNode);
                            setModalDeptTab('ALL');
                          }}
                        >
                          <td style={{ ...labelCellStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>
                            <CalendarOutlined style={{ marginRight: 6, color: '#3b82f6' }} />
                            {dayNode.date} <span style={{ color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>· {dayNode.weekday}</span>
                          </td>
                          <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600, color: 'var(--theme-success, #10b981)' }}>
                            {hoursFixed(dayNode.runningHours)}h
                          </td>
                          <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 700, color: 'var(--theme-danger, #dc2626)' }}>
                            {hoursFixed(dayNode.downtimeHours)}h
                          </td>
                          <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600 }}>
                            {hoursFixed(dayTotal)}h
                          </td>
                          <td style={{ ...numCellStyle, textAlign: 'right' }}>
                            <Tag color={dayRate > 25 ? 'red' : dayRate > 10 ? 'orange' : 'green'} style={{ margin: 0, fontSize: 11 }}>
                              {hoursFixed(dayRate, 1)}%
                            </Tag>
                          </td>
                          <td style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #64748b)' }}>
                            {stoppedMachinesCount} machines
                          </td>
                          <td style={labelCellStyle}>
                            <Space wrap size={4}>
                              {dayNode.departments.map((d) => (
                                <Tag key={d.department} color="geekblue" style={{ margin: 0, fontSize: 10.5 }}>
                                  {d.department}
                                </Tag>
                              ))}
                            </Space>
                          </td>
                          <td style={{ ...labelCellStyle, color: 'var(--theme-text-secondary, #475569)', fontWeight: 500 }}>
                            {dayNode.topReason}
                          </td>
                          <td style={{ ...labelCellStyle, textAlign: 'center' }}>
                            <Button
                              type="primary"
                              size="small"
                              icon={<EyeOutlined />}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDateNode(dayNode);
                                setModalDeptTab('ALL');
                              }}
                              style={{ fontSize: 11.5 }}
                            >
                              View Details
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Panel>

      {/* ── 3.3 · Date Detail Drill-Down Modal with Department Tabs, WhatsApp & Print ── */}
      <Modal
        open={!!selectedDateNode}
        onCancel={() => setSelectedDateNode(null)}
        footer={null}
        width={1120}
        centered
        destroyOnClose
        styles={{ body: { maxHeight: '82vh', overflowY: 'auto', padding: '16px 20px' } }}
        title={
          selectedDateNode ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 28, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #0f172a)' }}>
                  📅 Production & Downtime Details — {selectedDateNode.date} ({selectedDateNode.weekday})
                </span>
                <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #64748b)', marginTop: 2, fontWeight: 500 }}>
                  Detailed Department & Machine Breakdown with live operational remarks
                </div>
              </div>
              <Space>
                <Button
                  icon={<WhatsAppOutlined style={{ color: '#25D366' }} />}
                  onClick={() => handleWhatsAppShare(selectedDateNode)}
                  style={{ borderColor: '#25D366', color: '#166534', fontWeight: 600 }}
                >
                  Share on WhatsApp
                </Button>
                <Button
                  icon={<PrinterOutlined />}
                  onClick={() => handlePrintDate(selectedDateNode)}
                  style={{ fontWeight: 600 }}
                >
                  Print View
                </Button>
              </Space>
            </div>
          ) : null
        }
      >
        {selectedDateNode && (
          <div>
            {/* Header KPI Strip inside modal */}
            {(() => {
              const totalTime = round2(selectedDateNode.runningHours + selectedDateNode.downtimeHours);
              const dtRate = totalTime > 0 ? (selectedDateNode.downtimeHours / totalTime) * 100 : 0;
              return (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 10,
                    background: 'var(--theme-surface-alt, #f8fafc)',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    padding: '10px 14px',
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Running Time (RT)</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-success, #10b981)' }}>{hoursFixed(selectedDateNode.runningHours)}h</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Downtime (DT)</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-danger, #dc2626)' }}>{hoursFixed(selectedDateNode.downtimeHours)}h</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Total Shift Time</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--theme-text, #0f172a)' }}>{hoursFixed(totalTime)}h</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Downtime Rate</span>
                    <div style={{ fontSize: 16, fontWeight: 700, color: dtRate > 20 ? '#dc2626' : '#f59e0b' }}>{hoursFixed(dtRate, 1)}%</div>
                  </div>
                  <div>
                    <span style={{ fontSize: 10.5, textTransform: 'uppercase', color: 'var(--theme-text-muted, #64748b)', fontWeight: 600 }}>Dominant Reason</span>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedDateNode.topReason}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Department Filter Tabs */}
            <div style={{ marginBottom: 12 }}>
              <Tabs
                activeKey={modalDeptTab}
                onChange={setModalDeptTab}
                type="card"
                size="small"
                items={[
                  {
                    key: 'ALL',
                    label: `All Departments (${selectedDateNode.departments.length})`,
                  },
                  ...selectedDateNode.departments.map((dept) => ({
                    key: dept.department,
                    label: `${dept.department} (DT: ${hoursFixed(dept.downtimeHours)}h)`,
                  })),
                ]}
              />
            </div>

            {/* Department Sections & Machines Table */}
            {selectedDateNode.departments
              .filter((dept) => modalDeptTab === 'ALL' || dept.department === modalDeptTab)
              .map((dept) => (
                <div key={dept.department} style={{ marginBottom: 18, border: '1px solid var(--theme-border, #e2e8f0)', borderRadius: 8, overflow: 'hidden' }}>
                  <div
                    style={{
                      background: 'var(--theme-header-bg, #f1f5f9)',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--theme-border, #e2e8f0)',
                      fontWeight: 700,
                      fontSize: 13,
                    }}
                  >
                    <span>
                      <ApartmentOutlined style={{ marginRight: 6, color: '#2563eb' }} />
                      {dept.department} Department
                    </span>
                    <Space size={12} style={{ fontSize: 12, fontWeight: 600 }}>
                      <span style={{ color: 'var(--theme-success, #10b981)' }}>Run: {hoursFixed(dept.runningHours)}h</span>
                      <span style={{ color: 'var(--theme-danger, #dc2626)' }}>Down: {hoursFixed(dept.downtimeHours)}h</span>
                      <span style={{ color: '#64748b' }}>Top Reason: {dept.topReason}</span>
                    </Space>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead style={{ background: 'var(--theme-surface-alt, #f8fafc)' }}>
                        <tr>
                          <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 170 }}>Machine</th>
                          <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-success, #10b981)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>Run (RT)</th>
                          <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 90 }}>Down (DT)</th>
                          <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 85 }}>Total</th>
                          <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em', width: 75 }}>DT %</th>
                          <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breakdown Reasons</th>
                          <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Operational Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dept.machines.map((m) => {
                          const mTotal = round2(m.runningHours + m.downtimeHours);
                          const mRate = mTotal > 0 ? (m.downtimeHours / mTotal) * 100 : 0;
                          return (
                            <tr key={m.key} data-testid="downtime-breakdown-row" style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                              <td style={labelCellStyle}>
                                <b>{m.machine}</b>
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-success, #10b981)', fontWeight: 600 }}>
                                {hoursFixed(m.runningHours)}h
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)', fontWeight: 700 }}>
                                {hoursFixed(m.downtimeHours)}h
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right', fontWeight: 600 }}>
                                {hoursFixed(mTotal)}h
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right' }}>
                                <Tag color={mRate > 25 ? 'red' : mRate > 0 ? 'orange' : 'green'} style={{ margin: 0, fontSize: 11 }}>
                                  {hoursFixed(mRate, 1)}%
                                </Tag>
                              </td>
                              <td style={labelCellStyle}>
                                <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 4 }} data-testid="downtime-phrase">
                                  {m.reasons.length > 0 ? (
                                    m.reasons.map((r, idx) => (
                                      <Tag key={idx} color="orange" style={{ margin: 0, fontSize: 11 }}>
                                        {hoursFixed(r.hours)}h {r.reason}
                                      </Tag>
                                    ))
                                  ) : (
                                    <span style={{ color: '#94a3b8' }}>Clean run</span>
                                  )}
                                </div>
                              </td>
                              <td style={{ ...labelCellStyle, color: 'var(--theme-text-secondary, #475569)' }}>
                                <Tooltip title={m.remarks.join(' · ')}>
                                  <span>{remarksSummary(m.remarks, 2)}</span>
                                </Tooltip>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
          </div>
        )}
      </Modal>

      {/* ── 4 · THE 3-TIER AUDIT TREE — DATE ▸ DEPARTMENT ▸ MACHINE ────────── */}
      <Panel
        title="Downtime Audit Tree — Date ▸ Department ▸ Machine"
        titleExtra={
          tree.length > 0 ? (
            <span className="dt-no-print dt-actions">
              <Button size="small" type="text" icon={<PlusSquareOutlined />} onClick={() => setCollapsed(new Set())} data-testid="downtime-expand-all">
                Expand all
              </Button>
              <Button
                size="small"
                type="text"
                icon={<MinusSquareOutlined />}
                onClick={() => setCollapsed(new Set(tree.map((d) => d.key)))}
                data-testid="downtime-collapse-all"
              >
                Collapse all
              </Button>
            </span>
          ) : null
        }
        testId="downtime-machines"
      >
        <div className="dt-grid dt-tree">
          <div className="dt-row dt-head">
            {GRID_COLUMNS.map((heading, index) => (
              <div key={heading} className={`dt-cell ${GRID_COLUMN_CLASS[index]}`}>
                {heading}
              </div>
            ))}
          </div>

          {tree.length === 0 ? (
            <div className="dt-empty">No production entries matched the current filters.</div>
          ) : (
            tree.map((day) => {
              const dayOpen = !collapsed.has(dayKeyOf(day));
              return (
                <div className="dt-node" key={day.key} data-testid="downtime-date">
                  {/* TIER 1 — the whole plant's day. */}
                  <button
                    type="button"
                    className="dt-row dt-dept-row dt-tier-1"
                    aria-expanded={dayOpen}
                    aria-label={`Date ${day.date}`}
                    onClick={() => toggleNode(dayKeyOf(day))}
                    data-testid="downtime-date-toggle"
                  >
                    <span className="dt-cell dt-col-name">
                      <span className="dt-caret" aria-hidden="true">
                        {dayOpen ? '▾' : '▸'}
                      </span>
                      <b>{day.date}</b>
                      <span className="dt-meta">
                        {day.weekday} · {formatNumber(day.departments.length, 0)} dept ·{' '}
                        {formatNumber(day.entries, 0)} log{day.entries === 1 ? '' : 's'}
                      </span>
                    </span>
                    <span className="dt-cell dt-col-num">{formatNumber(day.entries, 0)}</span>
                    <span className="dt-cell dt-col-num dt-num-danger">{hoursFixed(day.downtimeHours)}h</span>
                    <span className="dt-cell dt-col-num">{hoursFixed(day.runningHours)}h</span>
                    <span className="dt-cell dt-col-reason">{day.topReason}</span>
                    <span className="dt-cell dt-col-remarks" title={day.remarks.join(' · ')}>
                      {remarksSummary(day.remarks)}
                    </span>
                  </button>

                  {/* Children stay MOUNTED and are clipped only by CSS, which is
                      what lets @media print force the whole tree open below. */}
                  <div className={`dt-children${dayOpen ? ' is-open' : ''}`}>
                    <div className="dt-children-inner">
                      {day.departments.map((dept) => {
                        const deptOpen = !collapsed.has(deptKeyOf(day, dept.department));
                        return (
                          <div className="dt-node" key={dept.key}>
                            {/* TIER 2 — one manufacturing department inside the date. */}
                            <button
                              type="button"
                              className="dt-row dt-dept-row dt-tier-2"
                              aria-expanded={deptOpen}
                              aria-label={`${dept.department} department on ${day.date}`}
                              onClick={() => toggleNode(deptKeyOf(day, dept.department))}
                              data-testid="downtime-dept-toggle"
                            >
                              <span className="dt-cell dt-col-name">
                                <span className="dt-caret" aria-hidden="true">
                                  {deptOpen ? '▾' : '▸'}
                                </span>
                                <b>{dept.department}</b>
                                <span className="dt-meta">
                                  Tier {dept.tier + 1} · {formatNumber(dept.machines.length, 0)} machine
                                  {dept.machines.length === 1 ? '' : 's'}
                                </span>
                              </span>
                              <span className="dt-cell dt-col-num">{formatNumber(dept.entries, 0)}</span>
                              <span className="dt-cell dt-col-num dt-num-danger">{hoursFixed(dept.downtimeHours)}h</span>
                              <span className="dt-cell dt-col-num">{hoursFixed(dept.runningHours)}h</span>
                              <span className="dt-cell dt-col-reason">{dept.topReason}</span>
                              <span className="dt-cell dt-col-remarks" title={dept.remarks.join(' · ')}>
                                {remarksSummary(dept.remarks)}
                              </span>
                            </button>

                            <div className={`dt-children${deptOpen ? ' is-open' : ''}`}>
                              <div className="dt-children-inner">
                                {dept.machines.map((machine) => (
                                  /* TIER 3 — the machine leaf: hours + the floor's own words. */
                                  <div
                                    className="dt-row dt-machine-row dt-tier-3"
                                    key={machine.key}
                                    data-testid="downtime-machine-row"
                                  >
                                    <div className="dt-cell dt-col-name">
                                      <button
                                        type="button"
                                        className="dt-machine-btn"
                                        onClick={() => setDrill({ date: day.date, department: dept.department, machine })}
                                        data-testid="downtime-machine-open"
                                        aria-label={`Open entry logs for ${machine.machine} on ${day.date}`}
                                      >
                                        <b className="dt-machine-name">{machine.machine}</b>
                                        <RightOutlined aria-hidden="true" />
                                      </button>
                                    </div>
                                    <div className="dt-cell dt-col-num">{formatNumber(machine.entries, 0)}</div>
                                    <div className="dt-cell dt-col-num dt-num-danger">
                                      {hoursFixed(machine.downtimeHours)}h
                                    </div>
                                    <div className="dt-cell dt-col-num">{hoursFixed(machine.runningHours)}h</div>
                                    <div className="dt-cell dt-col-reason">{machine.topReason}</div>
                                    <div className="dt-cell dt-col-remarks" title={machine.remarks.join(' · ')}>
                                      {remarksSummary(machine.remarks)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 6 }}>
          Tier 1 summarises each DATE across the whole plant; expanding it shows the MANUFACTURING DEPARTMENT (Raw
          Material → Straightening → Swaging → Spoke → Plating → Hand Packing → Dispatch) inside that day; expanding a
          department lists its MACHINES with their operational hours. Click a machine to open its entry logs. Machine
          running hours are the display totals the grid prints; downtime is broken down by reason from each entry&rsquo;s
          own downtime lines.
        </div>
      </Panel>

      {/* ── Nested drill-down: the exact logs behind an Entries count ────── */}
      {drill ? (
        <Drawer
          open
          onClose={() => setDrill(null)}
          width={860}
          title={
            <span>
              <b>{drill.machine.machine}</b>{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--theme-text-muted, #94a3b8)' }}>
                {drill.department} · {drill.date} · {drillLogs.length} entr
                {drillLogs.length === 1 ? 'y' : 'ies'} · {hoursFixed(drill.machine.downtimeHours)}h downtime
              </span>
            </span>
          }
        >
          <div className="dt-drill-meta">
            Duration Split shows the running figure the live grid prints (Shift Planned + Overtime − Downtime) plus the
            operator&rsquo;s own multi-reason breakdown for that log.
          </div>
          <Table<ProductionEntryRow>
            rowKey="id"
            size="small"
            columns={drillColumns}
            dataSource={drillLogs}
            pagination={drillLogs.length > 10 ? { pageSize: 10, size: 'small', showSizeChanger: false } : false}
            scroll={{ x: 720 }}
          />
        </Drawer>
      ) : null}
    </div>
  );
};

export default DowntimeAnalytics;
