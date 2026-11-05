/* ─────────────────────────────────────────────────────────────────────────────
 * RejectionScrapDetails.tsx — TAB B · "Rejection & Scrap Details"
 *
 * Rich Analytical Dashboard featuring:
 *   1. Executive KPI Summary Tiles (Produced KG & PCS, Part Reject KG & PCS,
 *      Process Scrap KG, Total Loss KG & %, Top Defect Reason)
 *   2. Interactive Charts Suite:
 *      - Area Chart: Day-wise Scrap Trend
 *      - Donut Chart: Clean Defect Reason Distribution
 *      - Horizontal Bar Chart: Department-wise Rejection (KG)
 *      - Machine-Wise Rejection Chart with Interactive Department Filter Buttons
 *      - Bar Chart: Top Items by Rejection
 *   3. Hierarchical Grouped Department-Wise Rejection Table:
 *      - Grouped cleanly by Department (no mixed/jumbled rows)
 *      - Date-wise and Machine-wise breakdown inside each department
 *      - In-Browser "View" Popup Modal for instant on-screen review
 *      - Individual Department PDF / Print Report Export
 * ──────────────────────────────────────────────────────────────────────────── */

import React, { useMemo, useState } from 'react';
import { Button, Tag, Tooltip, Collapse, Space, Modal } from 'antd';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ReloadOutlined,
  WarningOutlined,
  LineChartOutlined,
  PieChartOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  ToolOutlined,
  PrinterOutlined,
  EyeOutlined,
  CalendarOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { formatNumber, formatCompact } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { useAnalysisRows } from './analyticsData';
import {
  dailyScrapSeries,
  monthlyScrapSeries,
  departmentScrapRollup,
  defectReasonDistribution,
  topItemsScrapRollup,
  machineScrapRollup,
  departmentScrapTree,
  kgFixed,
  scrapTotals,
  unweightedEntryCount,
  sampleMonthLabel,
} from './analyticsModel';
import type { DepartmentScrapGroup } from './analyticsModel';
import {
  ChartFrame,
  MetricTile,
  Panel,
  SheetHead,
  SheetStatus,
  labelCellStyle,
  numCellStyle,
} from './analyticsUi';
import { exportDepartmentRejectionPdf } from './rejectionAnalyticsPdf';

export interface RejectionScrapDetailsProps {
  /** Rows the grid currently holds — seeds the sheet before the wide sample lands. */
  seed: ProductionEntryRow[];
  /** The grid's active filters, so the sheet analyses exactly what the user sees. */
  buildFilters: () => Record<string, unknown>;
  /** True while this tab is the visible pane (gates the request). */
  active: boolean;
}

/** Defect Donut Color Palette */
const DEFECT_COLORS = ['#f97316', '#06b6d4', '#a855f7', '#10b981', '#ec4899', '#eab308', '#6366f1', '#38bdf8', '#f43f5e'];

/** Compact wrapping header cell. */
const thHead: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  lineHeight: 1.3,
  color: 'var(--theme-text-muted, #94a3b8)',
  padding: '7px 6px',
  whiteSpace: 'normal',
  verticalAlign: 'bottom',
};

const RejectionScrapDetails: React.FC<RejectionScrapDetailsProps> = ({ seed, buildFilters, active }) => {
  const analysis = useAnalysisRows(seed, buildFilters, active);
  const rows = analysis.rows;

  /* ── Department selector for Machine Chart ────────────────────────── */
  const [selectedMachineDept, setSelectedMachineDept] = useState<string>('all');
  /* ── Expanded department groups in hierarchical view ──────────────── */
  const [activeDeptPanels, setActiveDeptPanels] = useState<string[]>([]);
  /* ── Department View Modal State ─────────────────────────────────── */
  const [viewModalDept, setViewModalDept] = useState<DepartmentScrapGroup | null>(null);
  /* ── Monthly Scrap Unit Toggle ('kg' | 'pcs') ─────────────────────── */
  const [monthlyUnit, setMonthlyUnit] = useState<'kg' | 'pcs'>('kg');

  /* ── Aggregations (pure, see analyticsModel.ts) ─────────────────────── */
  const series = useMemo(() => dailyScrapSeries(rows), [rows]);
  const monthSeries = useMemo(() => monthlyScrapSeries(rows), [rows]);
  const byDepartment = useMemo(() => departmentScrapRollup(rows), [rows]);
  const totals = useMemo(() => scrapTotals(rows), [rows]);
  const unweighted = useMemo(() => unweightedEntryCount(rows), [rows]);
  const defectDist = useMemo(() => {
    const list = defectReasonDistribution(rows, selectedMachineDept, 6);
    return list.map((item, index) => ({
      ...item,
      fill: DEFECT_COLORS[index % DEFECT_COLORS.length],
    }));
  }, [rows, selectedMachineDept]);
  const topItems = useMemo(() => topItemsScrapRollup(rows, 6), [rows]);

  // Department-filtered machine scrap list for Chart
  const machineScrapList = useMemo(() => {
    return machineScrapRollup(rows, selectedMachineDept, 12);
  }, [rows, selectedMachineDept]);

  // Hierarchical department scrap tree
  const deptTree = useMemo(() => {
    return departmentScrapTree(rows);
  }, [rows]);

  const monthScope = useMemo(() => sampleMonthLabel(rows), [rows]);

  const status =
    analysis.error ?? (analysis.loading ? 'Loading the complete analytical dataset…' : null);

  const caption = analysis.loaded
    ? `Read-only · ${formatNumber(rows.length, 0)} of ${formatNumber(analysis.scopeTotal, 0)} matching entries analysed across ${formatNumber(series.length, 0)} production day${series.length === 1 ? '' : 's'}.`
    : `Read-only · seeded with the ${formatNumber(rows.length, 0)} entries on the current page while the complete sample loads.`;

  const topDefect = defectDist[0];

  // Rejection % formulas:
  // Part Reject PCS % = Part Reject PCS ÷ Actual Produced PCS
  // Part Reject KG % = Part Reject KG ÷ Actual Produced KG
  // Process Scrap KG % = Process Scrap KG ÷ Actual Produced KG
  const partRejPcsPct = totals.actualUnits > 0 ? (totals.partRejectUnits / totals.actualUnits) * 100 : 0;
  const partRejKgPct = totals.actualKg > 0 ? (totals.partRejectKg / totals.actualKg) * 100 : 0;
  const processScrapKgPct = totals.actualKg > 0 ? (totals.processScrapKg / totals.actualKg) * 100 : 0;

  return (
    <div data-testid="rejection-scrap-sheet" style={{ padding: '4px 0 16px' }}>
      <SheetHead
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700 }}>
            <WarningOutlined style={{ color: 'var(--theme-danger, #ef4444)' }} />
            Rejection &amp; Scrap Analytics
          </span>
        }
        caption={caption}
        extra={
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={analysis.loading}
            onClick={analysis.refresh}
            data-testid="scrap-refresh"
          >
            Refresh
          </Button>
        }
      />
      <SheetStatus text={status} />

      {/* ── 7 Top Executive KPI Metrics ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <MetricTile
          testId="scrap-produced-kg"
          label="Actual Produced (KG)"
          value={`${kgFixed(totals.actualKg)} KG`}
          tone="#06b6d4"
          hint={`Net Produced Weight (${formatNumber(totals.entries, 0)} Entries)`}
        />
        <MetricTile
          testId="scrap-produced-pcs"
          label="Actual Produced (PCS)"
          value={`${formatNumber(totals.actualUnits, 0)} PCS`}
          tone="#10b981"
          hint={`${formatCompact(totals.actualUnits, 1)} ${totals.dominantUom || 'PCS'} Net Units Output`}
        />
        <MetricTile
          testId="part-reject-kg"
          label="Part Rejection (KG)"
          value={`${kgFixed(totals.partRejectKg)} KG`}
          tone={totals.partRejectKg > 0 ? '#f43f5e' : undefined}
          hint="Defective Parts Weight"
          gaugePct={partRejKgPct}
          gaugeColor="#f43f5e"
        />
        <MetricTile
          testId="part-reject-pcs"
          label="Part Rejection (PCS)"
          value={`${formatNumber(totals.partRejectUnits, 0)} PCS`}
          tone={totals.partRejectUnits > 0 ? '#fbbf24' : undefined}
          hint="Defective Units Count"
          gaugePct={partRejPcsPct}
          gaugeColor="#fbbf24"
        />
        <MetricTile
          testId="process-scrap"
          label="Process Scrap (Waste)"
          value={`${kgFixed(totals.processScrapKg)} KG`}
          tone={totals.processScrapKg > 0 ? '#0ea5e9' : undefined}
          hint="Cutting & Wire Waste"
          gaugePct={processScrapKgPct}
          gaugeColor="#0ea5e9"
        />
        <MetricTile
          testId="scrap-rejected"
          label="Total Loss (Rejection + Scrap)"
          value={`${kgFixed(totals.scrapKg)} KG`}
          tone={totals.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : undefined}
          hint={`${formatNumber(totals.wastagePct, 2)}% Material Wastage`}
          gaugePct={totals.wastagePct}
          gaugeColor="#ef4444"
        />
        <MetricTile
          testId="scrap-top-defect"
          label="Top Defect Reason"
          value={topDefect ? topDefect.reason : 'None'}
          tone="#a855f7"
          hint={
            topDefect
              ? `${topDefect.pct}% of total scrap (${kgFixed(topDefect.scrapKg)} KG · ${formatNumber(topDefect.units, 0)} ${totals.dominantUom || 'PCS'})`
              : unweighted > 0
                ? `${unweighted} rows excluded`
                : 'Zero defect recorded'
          }
        />
      </div>

      {/* ── Visual Analytics Charts ───────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* CHART: Month-wise Rejection & Scrap Trend (Per Month Comparison: Part Rejection vs Process Scrap) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <CalendarOutlined style={{ color: '#ec4899' }} /> Month-Wise Rejection Trend (Part vs Process Scrap)
            </span>
          }
          titleExtra={
            <div style={{ display: 'inline-flex', gap: 4, background: 'var(--theme-surface-alt, rgba(255,255,255,0.06))', padding: '2px 4px', borderRadius: 6, border: '1px solid var(--theme-border, rgba(255,255,255,0.12))' }}>
              <button
                type="button"
                onClick={() => setMonthlyUnit('kg')}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: monthlyUnit === 'kg' ? 'var(--theme-primary, #06b6d4)' : 'transparent',
                  color: monthlyUnit === 'kg' ? '#fff' : 'var(--theme-text-muted, #94a3b8)',
                }}
              >
                Weight (KG)
              </button>
              <button
                type="button"
                onClick={() => setMonthlyUnit('pcs')}
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: monthlyUnit === 'pcs' ? 'var(--theme-primary, #06b6d4)' : 'transparent',
                  color: monthlyUnit === 'pcs' ? '#fff' : 'var(--theme-text-muted, #94a3b8)',
                }}
              >
                Units (PCS)
              </button>
            </div>
          }
          testId="monthly-scrap-trend-panel"
        >
          {monthSeries.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No monthly entries recorded yet.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, fontSize: 11 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#f43f5e' }} />
                  <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>Part Rejection ({monthlyUnit === 'kg' ? 'KG' : 'PCS'})</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#0ea5e9' }} />
                  <span style={{ color: 'var(--theme-text-muted, #94a3b8)' }}>Process Scrap (KG)</span>
                </span>
              </div>
              <ChartFrame height={230}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthSeries} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: 'var(--theme-text, #cbd5e1)', fontWeight: 600 }}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <ChartTooltip
                      formatter={(val: unknown, name: unknown, item: any) => {
                        const payload = item?.payload || {};
                        const n = String(name);
                        if (n.includes('Part Rejection')) {
                          return [
                            monthlyUnit === 'kg'
                              ? `${kgFixed(Number(val))} KG (${formatNumber(payload.partRejectUnits, 0)} PCS · ${payload.partRejectPct.toFixed(2)}%)`
                              : `${formatNumber(Number(val), 0)} PCS (${kgFixed(payload.partRejectKg)} KG · ${payload.partRejectPct.toFixed(2)}%)`,
                            n,
                          ];
                        }
                        if (n.includes('Process Scrap')) {
                          return [`${kgFixed(Number(val))} KG (${payload.processScrapPct.toFixed(2)}%)`, n];
                        }
                        return [`${val}`, n];
                      }}
                      contentStyle={{
                        background: 'var(--theme-surface, #1e293b)',
                        borderColor: 'var(--theme-border, #334155)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar
                      dataKey={monthlyUnit === 'kg' ? 'partRejectKg' : 'partRejectUnits'}
                      name={monthlyUnit === 'kg' ? 'Part Rejection (KG)' : 'Part Rejection (PCS)'}
                      fill="#f43f5e"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="processScrapKg"
                      name="Process Scrap (KG)"
                      fill="#0ea5e9"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </>
          )}
        </Panel>

        {/* CHART 1: Day-wise Scrap Trend (Area Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <LineChartOutlined style={{ color: '#06b6d4' }} /> Day-wise Scrap Trend ({monthScope})
            </span>
          }
          testId="scrap-trend-panel"
        >
          {series.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No dated entries in the selected range.
            </div>
          ) : (
            <>
              <ChartFrame height={230}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 10, right: 12, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="producedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="partGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="processGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                      tickFormatter={(v: string) => String(v).slice(5)}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                      stroke="var(--theme-border, #cbd5e1)"
                    />
                    <ChartTooltip
                      formatter={(val: unknown, name: unknown, item: any) => {
                        const payload = item?.payload || {};
                        const n = String(name);
                        if (n.includes('Actual Produced')) {
                          return [`${kgFixed(Number(val))} KG (${formatNumber(payload.actualUnits || 0, 0)} Units)`, n];
                        }
                        if (n.includes('Part Reject')) {
                          return [`${kgFixed(Number(val))} KG (${formatNumber(payload.partRejectUnits || 0, 0)} Units)`, n];
                        }
                        return [`${kgFixed(Number(val))} KG`, n];
                      }}
                      contentStyle={{
                        background: 'var(--theme-surface, #1e293b)',
                        borderColor: 'var(--theme-border, #334155)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="actualKg"
                      name="Actual Produced (KG)"
                      stroke="#06b6d4"
                      strokeWidth={2}
                      fill="url(#producedGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="partRejectKg"
                      name="Part Reject (KG)"
                      stroke="#f43f5e"
                      strokeWidth={2}
                      fill="url(#partGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="processScrapKg"
                      name="Process Scrap (KG)"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fill="url(#processGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 6, flexWrap: 'wrap' }}>
                <span>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#06b6d4', marginRight: 5 }} />
                  Actual Produced
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#f43f5e', marginRight: 5 }} />
                  Part Reject
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#0ea5e9', marginRight: 5 }} />
                  Process Scrap
                </span>
              </div>
            </>
          )}
        </Panel>

        {/* CHART 2: Defect Reason Distribution (Donut Pie Chart - Reactive to Department Buttons) */}
        <Panel
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <PieChartOutlined style={{ color: '#f97316' }} /> Defect Reason Distribution
                {selectedMachineDept !== 'all' && (
                  <Tag color="cyan" style={{ marginLeft: 6, fontSize: 10, borderRadius: 4 }}>
                    {selectedMachineDept}
                  </Tag>
                )}
              </span>
              <span style={{ fontSize: 10.5, color: 'var(--theme-text-muted, #94a3b8)', fontWeight: 500 }}>
                Top Major Faults + Other
              </span>
            </div>
          }
          testId="defect-dist-panel"
        >
          {defectDist.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No scrap recorded in this period.
            </div>
          ) : (
            <>
              <ChartFrame height={230}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={defectDist}
                      dataKey="scrapKg"
                      nameKey="reason"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                    />
                    <ChartTooltip
                      formatter={(val: unknown) => [`${kgFixed(Number(val))} KG`, 'Scrap Weight']}
                      contentStyle={{
                        background: 'var(--theme-surface, #1e293b)',
                        borderColor: 'var(--theme-border, #334155)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartFrame>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {defectDist.map((d, i) => (
                  <Tag
                    key={d.reason}
                    style={{
                      margin: 0,
                      fontSize: 10.5,
                      borderRadius: 4,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      border: 'none',
                      background: 'var(--theme-surface-subtle, rgba(255,255,255,0.06))',
                      color: 'var(--theme-text, #f1f5f9)',
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: DEFECT_COLORS[i % DEFECT_COLORS.length] }} />
                    <span>{d.reason}: <strong>{d.pct}%</strong></span>
                  </Tag>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* CHART 3: Machine-Wise Rejection Chart with Interactive Department Filter Buttons */}
        <Panel
          title={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                  <ToolOutlined style={{ color: '#10b981' }} /> Machine-Wise Rejection &amp; Scrap
                </span>
                <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                  {machineScrapList.length} Machine{machineScrapList.length === 1 ? '' : 's'} Shown
                </span>
              </div>
              {/* Interactive Department Filter Buttons */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  type={selectedMachineDept === 'all' ? 'primary' : 'default'}
                  onClick={() => setSelectedMachineDept('all')}
                  style={{ fontSize: 11, height: 24, padding: '0 8px' }}
                >
                  All Departments
                </Button>
                {byDepartment.map((d) => (
                  <Button
                    key={d.department}
                    size="small"
                    type={selectedMachineDept.toLowerCase() === d.department.toLowerCase() ? 'primary' : 'default'}
                    onClick={() => setSelectedMachineDept(d.department)}
                    style={{ fontSize: 11, height: 24, padding: '0 8px' }}
                  >
                    {d.department}
                  </Button>
                ))}
              </div>
            </div>
          }
          testId="scrap-machine-chart"
        >
          {machineScrapList.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No machine scrap records found for the selected department.
            </div>
          ) : (
            <>
              <ChartFrame height={230}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={machineScrapList}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
                    barCategoryGap="20%"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }} />
                    <YAxis
                      dataKey="machine"
                      type="category"
                      width={90}
                      tick={{ fontSize: 10, fill: 'var(--theme-text, #f1f5f9)', fontWeight: 500 }}
                    />
                    <ChartTooltip
                      formatter={(val: unknown, name: unknown, item: any) => {
                        const payload = item?.payload || {};
                        const label = name === 'partRejectKg' ? 'Part Reject' : (name === 'processScrapKg' ? 'Process Scrap' : String(name));
                        const units = name === 'partRejectKg' ? ` (${formatNumber(payload.partRejectUnits || 0, 0)} ${payload.primaryUom || 'PCS'})` : '';
                        return [`${kgFixed(Number(val))} KG${units} (Total: ${kgFixed(payload.scrapKg || 0)} KG | ${payload.wastagePct}% Loss)`, label];
                      }}
                      contentStyle={{
                        background: 'var(--theme-surface, #1e293b)',
                        borderColor: 'var(--theme-border, #334155)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="partRejectKg" name="Part Reject (KG)" stackId="machScrap" fill="#f43f5e" isAnimationActive={false} />
                    <Bar dataKey="processScrapKg" name="Process Scrap (KG)" stackId="machScrap" fill="#0ea5e9" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e' }} />
                  Part Reject
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0ea5e9' }} />
                  Process Scrap
                </span>
              </div>
            </>
          )}
        </Panel>

        {/* CHART 4: Department-wise Rejection (KG) (Stacked Horizontal Bar Chart) */}
        <Panel
          title={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                <ApartmentOutlined style={{ color: '#38bdf8' }} /> Department-wise Rejection (KG)
              </span>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 500 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e' }} />
                  Part Reject
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: '#0ea5e9' }} />
                  Process Scrap
                </span>
              </div>
            </div>
          }
          testId="scrap-dept-chart"
        >
          {byDepartment.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No department records found.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={byDepartment}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 16, bottom: 0 }}
                  barCategoryGap="20%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }} />
                  <YAxis
                    dataKey="department"
                    type="category"
                    width={110}
                    tick={{ fontSize: 11, fill: 'var(--theme-text, #f1f5f9)', fontWeight: 500 }}
                  />
                  <ChartTooltip
                    formatter={(val: unknown, name: unknown, item: any) => {
                      const payload = item?.payload || {};
                      const label = name === 'partRejectKg' ? 'Part Reject' : (name === 'processScrapKg' ? 'Process Scrap' : String(name));
                      const units = name === 'partRejectKg' ? ` (${formatNumber(payload.partRejectUnits || 0, 0)} ${payload.primaryUom || 'Units'})` : '';
                      return [`${kgFixed(Number(val))} KG${units} (Total: ${kgFixed(payload.scrapKg || 0)} KG | ${formatNumber(payload.wastagePct || 0, 2)}%)`, label];
                    }}
                    contentStyle={{
                      background: 'var(--theme-surface, #1e293b)',
                      borderColor: 'var(--theme-border, #334155)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="partRejectKg" name="Part Reject (KG)" stackId="scrap" fill="#f43f5e" isAnimationActive={false} />
                  <Bar dataKey="processScrapKg" name="Process Scrap (KG)" stackId="scrap" fill="#0ea5e9" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>

        {/* CHART 5: Top Items by Rejection (Item-wise Bar Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <AppstoreOutlined style={{ color: '#ec4899' }} /> Top Items by Rejection
            </span>
          }
          testId="scrap-items-chart"
        >
          {topItems.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
              No item scrap recorded.
            </div>
          ) : (
            <ChartFrame height={230}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topItems}
                  margin={{ top: 8, right: 12, left: -10, bottom: 18 }}
                  barCategoryGap="22%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, rgba(255,255,255,0.08))" vertical={false} />
                  <XAxis
                    dataKey="item"
                    tick={{ fontSize: 9.5, fill: 'var(--theme-text-muted, #94a3b8)' }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }} />
                  <ChartTooltip
                    formatter={(val: unknown, name: unknown, item: any) => {
                      const payload = item?.payload || {};
                      const label = name === 'partRejectKg' ? 'Part Reject' : (name === 'processScrapKg' ? 'Process Scrap' : 'Total Scrap');
                      const units = name === 'partRejectKg' ? ` (${formatNumber(payload.partRejectUnits || 0, 0)} ${payload.primaryUom || 'PCS'})` : '';
                      return [`${kgFixed(Number(val))} KG${units} (Total: ${kgFixed(payload.scrapKg || 0)} KG)`, label];
                    }}
                    contentStyle={{
                      background: 'var(--theme-surface, #1e293b)',
                      borderColor: 'var(--theme-border, #334155)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="partRejectKg" name="Part Reject (KG)" stackId="itemScrap" fill="#f43f5e" isAnimationActive={false} />
                  <Bar dataKey="processScrapKg" name="Process Scrap (KG)" stackId="itemScrap" fill="#0ea5e9" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>
      </div>

      {/* ── 3 · Hierarchical Grouped Department Rejection Breakdown ───────── */}
      <Panel
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              Department-Wise Rejection Hierarchy &amp; Date Logs
            </span>
            <Space>
              <Button
                size="small"
                onClick={() => {
                  if (activeDeptPanels.length === deptTree.length) {
                    setActiveDeptPanels([]);
                  } else {
                    setActiveDeptPanels(deptTree.map((g) => g.department));
                  }
                }}
              >
                {activeDeptPanels.length === deptTree.length ? 'Collapse All' : 'Expand All'}
              </Button>
            </Space>
          </div>
        }
        testId="scrap-hierarchy-panel"
      >
        {deptTree.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '24px 8px', textAlign: 'center' }}>
            No rejection records found for the selected filter.
          </div>
        ) : (
          <Collapse
            activeKey={activeDeptPanels}
            onChange={(keys) => setActiveDeptPanels(Array.isArray(keys) ? keys.map(String) : [String(keys)])}
            style={{ background: 'transparent', border: 'none' }}
          >
            {deptTree.map((group) => {
              const isWorst = group === deptTree[0] && group.scrapKg > 0;
              return (
                <Collapse.Panel
                  key={group.department}
                  header={
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        flexWrap: 'wrap',
                        gap: 8,
                        padding: '4px 0',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Tag color={isWorst ? 'error' : 'blue'} style={{ fontSize: 11, fontWeight: 700, margin: 0 }}>
                          {group.department}
                        </Tag>
                        <span style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>
                          {group.entriesCount} Entries across {group.datesCount} Days
                        </span>
                      </div>

                      {/* Summary Metrics Pills */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <Tag style={{ margin: 0, fontSize: 11, border: 'none', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                          Output: <strong>{formatCompact(group.actualKg, 1)} KG</strong> ({formatCompact(group.actualUnits, 1)} {group.primaryUom})
                        </Tag>
                        <Tag style={{ margin: 0, fontSize: 11, border: 'none', background: 'rgba(244, 63, 94, 0.12)', color: '#f43f5e' }}>
                          Reject: <strong>{formatNumber(group.partRejectKg, 1)} KG</strong> ({formatCompact(group.partRejectUnits, 1)} {group.primaryUom} • {group.partRejectPct.toFixed(2)}%)
                        </Tag>
                        <Tag style={{ margin: 0, fontSize: 11, border: 'none', background: 'rgba(14, 165, 233, 0.12)', color: '#0ea5e9' }}>
                          Process Scrap: <strong>{formatNumber(group.processScrapKg, 1)} KG</strong> ({group.processScrapPct.toFixed(2)}%)
                        </Tag>
                        <Tag style={{ margin: 0, fontSize: 11, border: 'none', background: 'rgba(225, 29, 72, 0.15)', color: '#e11d48', fontWeight: 700 }}>
                          Total Loss: {formatNumber(group.scrapKg, 1)} KG ({group.wastagePct.toFixed(2)}%)
                        </Tag>

                        {/* View Report Button */}
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewModalDept(group);
                          }}
                          style={{ fontSize: 10.5, height: 24, padding: '0 8px' }}
                        >
                          View
                        </Button>

                        {/* Export PDF Button */}
                        <Button
                          size="small"
                          icon={<PrinterOutlined />}
                          onClick={(e) => {
                            e.stopPropagation();
                            exportDepartmentRejectionPdf(group, monthScope);
                          }}
                          style={{ fontSize: 10.5, height: 24, padding: '0 8px' }}
                        >
                          Print / PDF
                        </Button>
                      </div>
                    </div>
                  }
                  style={{
                    marginBottom: 8,
                    background: 'var(--theme-surface, rgba(255, 255, 255, 0.03))',
                    border: '1px solid var(--theme-border, #e2e8f0)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Detailed Table inside Department: Grouped by Date */}
                  <div style={{ overflowX: 'auto', marginTop: 4 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: 'var(--theme-surface-subtle, rgba(0,0,0,0.02))' }}>
                          <th style={{ ...thHead, textAlign: 'left', width: '8%' }}>Date</th>
                          <th style={{ ...thHead, textAlign: 'left', width: '10%' }}>Machine</th>
                          <th style={{ ...thHead, textAlign: 'left', width: '18%' }}>Item / Product</th>
                          <th style={{ ...thHead, textAlign: 'center', width: '6%' }}>Shift</th>
                          <th style={{ ...thHead, textAlign: 'right', width: '12%' }}>Produced Output</th>
                          <th style={{ ...thHead, textAlign: 'right', width: '15%', color: '#f43f5e' }}>Part Reject</th>
                          <th style={{ ...thHead, textAlign: 'right', width: '10%', color: '#0ea5e9' }}>Process Scrap</th>
                          <th style={{ ...thHead, textAlign: 'right', width: '10%' }}>Total Loss</th>
                          <th style={{ ...thHead, textAlign: 'left', width: '11%' }}>Defect Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((row) => {
                          const kgPct = row.actualKg > 0 ? (row.partRejectKg / row.actualKg) * 100 : 0;
                          return (
                            <tr
                              key={row.id}
                              style={{
                                borderTop: '1px solid var(--theme-border, #e2e8f0)',
                                background: row.scrapKg > 0 ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                              }}
                            >
                              <td style={{ ...labelCellStyle, whiteSpace: 'nowrap' }}>
                                <CalendarOutlined style={{ marginRight: 4, color: 'var(--theme-text-muted, #94a3b8)' }} />
                                {row.date || '—'}
                              </td>
                              <td style={labelCellStyle}>
                                <b style={{ color: 'var(--theme-text, #f1f5f9)' }}>{row.machine}</b>
                              </td>
                              <td style={labelCellStyle}>
                                <div style={{ fontWeight: 600, color: 'var(--theme-text, #f1f5f9)', fontSize: 11 }}>{row.product}</div>
                                {row.itemCode && <div style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.itemCode}</div>}
                              </td>
                              <td style={{ ...labelCellStyle, textAlign: 'center' }}>
                                <Tag style={{ margin: 0, fontSize: 9.5 }}>{row.shift}</Tag>
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right' }}>
                                <div>{formatNumber(row.actualUnits, 0)} {row.uomCode}</div>
                                <div style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
                                  {formatNumber(row.actualKg, 2)} KG
                                </div>
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right', color: row.partRejectKg > 0 ? '#f43f5e' : 'var(--theme-text-muted, #94a3b8)', fontWeight: row.partRejectKg > 0 ? 600 : 400 }}>
                                <div>{formatNumber(row.partRejectUnits, 0)} {row.uomCode} ({row.partRejectPct.toFixed(2)}%)</div>
                                <div style={{ fontSize: 9.5 }}>
                                  {formatNumber(row.partRejectKg, 2)} KG · {kgPct.toFixed(2)}%
                                </div>
                              </td>
                              <td style={{ ...numCellStyle, textAlign: 'right', color: row.processScrapKg > 0 ? '#0ea5e9' : 'var(--theme-text-muted, #94a3b8)', fontWeight: row.processScrapKg > 0 ? 600 : 400 }}>
                                <div>{formatNumber(row.processScrapKg, 2)} KG</div>
                                <div style={{ fontSize: 9.5 }}>{row.processScrapPct.toFixed(1)}%</div>
                              </td>
                              <td
                                style={{
                                  ...numCellStyle,
                                  textAlign: 'right',
                                  color: row.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : 'var(--theme-text-muted, #94a3b8)',
                                  fontWeight: 700,
                                }}
                              >
                                <div>{formatNumber(row.scrapKg, 2)} KG</div>
                                <div style={{ fontSize: 9.5, color: row.wastagePct > 0 ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-text-muted, #94a3b8)' }}>
                                  {row.wastagePct.toFixed(1)}%
                                </div>
                              </td>
                              <td style={{ ...labelCellStyle, fontSize: 10 }}>
                                <Tooltip title={row.defectReason !== '—' ? row.defectReason : undefined}>
                                  <span style={{ color: row.defectReason !== '—' ? 'var(--theme-text, #f1f5f9)' : 'var(--theme-text-muted, #64748b)' }}>
                                    {row.defectReason}
                                  </span>
                                </Tooltip>
                                {row.remarks && (
                                  <div style={{ fontSize: 9, color: 'var(--theme-text-muted, #94a3b8)', fontStyle: 'italic' }}>
                                    {row.remarks}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Collapse.Panel>
              );
            })}
          </Collapse>
        )}
      </Panel>

      {/* ── 4 · In-Browser View Report Modal ─────────────────────────────── */}
      <Modal
        open={!!viewModalDept}
        onCancel={() => setViewModalDept(null)}
        width={1050}
        footer={[
          <Button key="close" onClick={() => setViewModalDept(null)}>
            Close
          </Button>,
          <Button
            key="pdf"
            type="primary"
            icon={<PrinterOutlined />}
            onClick={() => {
              if (viewModalDept) exportDepartmentRejectionPdf(viewModalDept, monthScope);
            }}
          >
            Download PDF / Print
          </Button>,
        ]}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApartmentOutlined style={{ color: '#0ea5e9' }} />
            <span>Department Rejection Report — <strong>{viewModalDept?.department}</strong></span>
          </div>
        }
      >
        {viewModalDept && (
          <div>
            {/* Modal KPI Banner */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 8,
                padding: '10px 12px',
                background: 'var(--theme-surface-subtle, rgba(0,0,0,0.03))',
                borderRadius: 8,
                marginBottom: 12,
                border: '1px solid var(--theme-border, #e2e8f0)',
              }}
            >
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>TOTAL OUTPUT</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981' }}>
                  {formatNumber(viewModalDept.actualKg, 2)} KG
                </div>
                <div style={{ fontSize: 10, color: 'var(--theme-text-muted, #94a3b8)' }}>
                  {formatCompact(viewModalDept.actualUnits, 1)} {viewModalDept.primaryUom}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>PART REJECTION</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#f43f5e' }}>
                  {formatNumber(viewModalDept.partRejectKg, 2)} KG
                </div>
                <div style={{ fontSize: 10, color: '#f43f5e' }}>
                  {formatNumber(viewModalDept.partRejectUnits, 0)} {viewModalDept.primaryUom} ({viewModalDept.partRejectPct.toFixed(2)}%)
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>PROCESS SCRAP</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0ea5e9' }}>
                  {formatNumber(viewModalDept.processScrapKg, 2)} KG
                </div>
                <div style={{ fontSize: 10, color: '#0ea5e9' }}>
                  {viewModalDept.processScrapPct.toFixed(2)}% of Produced KG
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-text-muted, #64748b)' }}>TOTAL LOSS / WASTAGE</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e11d48' }}>
                  {formatNumber(viewModalDept.scrapKg, 2)} KG
                </div>
                <div style={{ fontSize: 10, color: '#e11d48', fontWeight: 600 }}>
                  {viewModalDept.wastagePct.toFixed(2)}% Overall Loss
                </div>
              </div>
            </div>

            {/* Modal Scrollable Table */}
            <div style={{ maxHeight: '60vh', overflowY: 'auto', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--theme-surface, #1e293b)' }}>
                  <tr>
                    <th style={{ ...thHead, textAlign: 'left', width: '9%' }}>Date</th>
                    <th style={{ ...thHead, textAlign: 'left', width: '10%' }}>Machine</th>
                    <th style={{ ...thHead, textAlign: 'left', width: '20%' }}>Item / Product</th>
                    <th style={{ ...thHead, textAlign: 'center', width: '6%' }}>Shift</th>
                    <th style={{ ...thHead, textAlign: 'right', width: '12%' }}>Produced Output</th>
                    <th style={{ ...thHead, textAlign: 'right', width: '15%', color: '#f43f5e' }}>Part Reject</th>
                    <th style={{ ...thHead, textAlign: 'right', width: '10%', color: '#0ea5e9' }}>Process Scrap</th>
                    <th style={{ ...thHead, textAlign: 'right', width: '10%' }}>Total Loss</th>
                    <th style={{ ...thHead, textAlign: 'left', width: '8%' }}>Operator</th>
                  </tr>
                </thead>
                <tbody>
                  {viewModalDept.items.map((row) => {
                    const kgPct = row.actualKg > 0 ? (row.partRejectKg / row.actualKg) * 100 : 0;
                    return (
                      <tr
                        key={row.id}
                        style={{
                          borderTop: '1px solid var(--theme-border, #e2e8f0)',
                          background: row.scrapKg > 0 ? 'rgba(239, 68, 68, 0.02)' : 'transparent',
                        }}
                      >
                        <td style={{ ...labelCellStyle, whiteSpace: 'nowrap' }}>{row.date || '—'}</td>
                        <td style={labelCellStyle}><b>{row.machine}</b></td>
                        <td style={labelCellStyle}>
                          <div style={{ fontWeight: 600 }}>{row.product}</div>
                          {row.itemCode && <div style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>{row.itemCode}</div>}
                        </td>
                        <td style={{ ...labelCellStyle, textAlign: 'center' }}>
                          <Tag style={{ margin: 0, fontSize: 9.5 }}>{row.shift}</Tag>
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right' }}>
                          <div>{formatNumber(row.actualUnits, 0)} {row.uomCode}</div>
                          <div style={{ fontSize: 9.5, color: 'var(--theme-text-muted, #94a3b8)' }}>
                            {formatNumber(row.actualKg, 2)} KG
                          </div>
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', color: row.partRejectKg > 0 ? '#f43f5e' : 'var(--theme-text-muted, #94a3b8)', fontWeight: row.partRejectKg > 0 ? 600 : 400 }}>
                          <div>{formatNumber(row.partRejectUnits, 0)} {row.uomCode} ({row.partRejectPct.toFixed(2)}%)</div>
                          <div style={{ fontSize: 9.5 }}>
                            {formatNumber(row.partRejectKg, 2)} KG · {kgPct.toFixed(2)}%
                          </div>
                        </td>
                        <td style={{ ...numCellStyle, textAlign: 'right', color: row.processScrapKg > 0 ? '#0ea5e9' : 'var(--theme-text-muted, #94a3b8)', fontWeight: row.processScrapKg > 0 ? 600 : 400 }}>
                          <div>{formatNumber(row.processScrapKg, 2)} KG</div>
                          <div style={{ fontSize: 9.5 }}>{row.processScrapPct.toFixed(1)}%</div>
                        </td>
                        <td
                          style={{
                            ...numCellStyle,
                            textAlign: 'right',
                            color: row.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : 'var(--theme-text-muted, #94a3b8)',
                            fontWeight: 700,
                          }}
                        >
                          <div>{formatNumber(row.scrapKg, 2)} KG</div>
                          <div style={{ fontSize: 9.5, color: row.wastagePct > 0 ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-text-muted, #94a3b8)' }}>
                            {row.wastagePct.toFixed(1)}%
                          </div>
                        </td>
                        <td style={{ ...labelCellStyle, fontSize: 10 }}>{row.operator || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default RejectionScrapDetails;
