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
import { Button, Drawer, Spin, Table, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ClockCircleOutlined,
  FilePdfOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
  PrinterOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { formatNumber, toNum } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { displayRunningHours } from './EntryList';
import { entryOvertimeHours } from './overtimeHours';
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
  hoursFixed,
  machineDowntimeRanking,
  remarksSummary,
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
  const totalPct = (hours: number) => (totalHours > 0 ? (hours / totalHours) * 100 : 0);
  const worst = ranking.length ? ranking[0] : null;
  const top = buckets.length ? buckets[0] : null;

  /* CHART 2 — donut sectors carrying their own share-of-hours label. */
  const pieData = useMemo(
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

  /* Keep the trend's X axis readable: roughly seven ticks whatever the range. */
  const trendInterval = Math.max(0, Math.ceil(trend.length / 7) - 1);

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
              <ChartFrame height={184}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deptBars} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      allowDecimals
                    />
                    <YAxis
                      type="category"
                      dataKey="department"
                      width={118}
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
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
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={false}
                    >
                      {deptBars.map((d, i) => (
                        <Cell key={d.department} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            )}
          </div>
        </section>

        {/* CHART 2 — reason classification matrix, colour-coded donut + share %. */}
        <section className="dt-chart-card" data-testid="downtime-chart-reasons">
          <div className="dt-chart-card-title">
            {`Reason Classification Matrix — ${sampleMonthLabel(rows)}`}
          </div>
          <div className="dt-chart-card-body">
            {pieData.length === 0 ? (
              <div className="dt-chart-empty">Nothing to plot for the selected period.</div>
            ) : (
              <>
                <ChartFrame height={140}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="hours"
                        nameKey="reason"
                        innerRadius="52%"
                        outerRadius="88%"
                        paddingAngle={1}
                        stroke="var(--theme-surface, #ffffff)"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {pieData.map((d) => (
                          <Cell key={d.reason} fill={d.color} />
                        ))}
                      </Pie>
                      {/* Percentage tooltip: slice share of hours + the hours + entries. */}
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload ?? {};
                          return (
                            <ChartTipBox
                              title={String(d.reason ?? '')}
                              rows={[
                                { color: String(d.color ?? ''), label: 'Share of hours', value: `${hoursFixed(toNum(d.pct), 1)}%` },
                                { color: String(d.color ?? ''), label: 'Downtime', value: `${hoursFixed(toNum(d.hours))}h` },
                                { color: String(d.color ?? ''), label: 'Entries', value: formatNumber(toNum(d.entries), 0) },
                              ]}
                            />
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartFrame>
                {/* Colour key + exact share, so the donut never needs a hover to be read. */}
                <div className="dt-legend" data-testid="downtime-pct">
                  {pieData.map((d) => (
                    <span className="dt-legend-chip" key={d.reason} title={`${d.reason} — ${hoursFixed(d.hours)}h`}>
                      <span className="dt-legend-dot" style={{ background: d.color }} />
                      <span className="dt-legend-name">{d.reason}</span>
                      <span className="dt-legend-pct">{hoursFixed(d.pct, 0)}%</span>
                    </span>
                  ))}
                </div>
              </>
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
              <ChartFrame height={184}>
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

      {/* ── 2 · KPI tiles ───────────────────────────────────────────────────── */}
      <div className="dt-tiles">
        <MetricTile
          testId="dt-total"
          label="Total Downtime"
          value={`${hoursFixed(totalHours)}h`}
          tone={totalHours > 0 ? 'var(--theme-danger, #dc2626)' : undefined}
          hint={`${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} stopped`}
        />
        <MetricTile
          testId="dt-reasons"
          label="Distinct Reasons"
          value={formatNumber(buckets.length, 0)}
          hint={top ? `Top: ${top.reason}` : 'No downtime logged'}
        />
        <MetricTile
          testId="dt-worst-machine"
          label="Worst Machine"
          value={worst ? worst.machine : '—'}
          hint={worst ? `${hoursFixed(worst.downtimeHours)}h · ${worst.department}` : 'No downtime logged'}
        />
        <MetricTile
          testId="dt-worst-reason"
          label="Top Reason (Hours)"
          value={top ? `${hoursFixed(top.hours)}h` : '—'}
          hint={top ? `${hoursFixed(totalPct(top.hours), 0)}% of all downtime` : '—'}
        />
      </div>

      {/* ── 3 · Multi-Reason Breakdown Row ───────────────────────────────── */}
      <Panel
        title="Multi-Reason Breakdown"
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                  <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Machine</th>
                  <th style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Down</th>
                  <th style={{ ...labelCellStyle, textAlign: 'left', color: 'var(--theme-text-muted, #94a3b8)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Breakdown Reasons</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(({ row, phrase, hours }) => (
                  <tr key={row.id} data-testid="downtime-breakdown-row" style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                    <td style={{ ...labelCellStyle, whiteSpace: 'nowrap', color: 'var(--theme-text-muted, #94a3b8)' }}>{row.entryDate}</td>
                    <td style={labelCellStyle}>
                      <b>{row.machineNo || row.machine?.machineCode || '—'}</b>
                      <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>
                        {row.machine?.name && row.machine.name !== row.machineNo ? ` · ${row.machine.name}` : ''}
                      </span>
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right', color: 'var(--theme-danger, #dc2626)' }}>
                      {hoursFixed(hours)}h
                    </td>
                    <td style={labelCellStyle}>
                      <Tooltip title={phrase}>
                        <span data-testid="downtime-phrase">{phrase}</span>
                      </Tooltip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

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
