/* ─────────────────────────────────────────────────────────────────────────────
 * RejectionScrapDetails.tsx — TAB B · "Rejection & Scrap Details"
 *
 * Rich Analytical Dashboard featuring:
 *   1. Executive KPI Summary Tiles (Produced KG, Scrap KG, Wastage %, Top Defect)
 *   2. 4 Modern Visual Recharts:
 *      - Area Chart: Day-wise Scrap Trend (Timeline)
 *      - Donut Chart: Defect Reason Distribution
 *      - Horizontal Bar Chart: Department-wise Rejection (KG)
 *      - Bar Chart: Top Item-wise Rejection
 *   3. Wastage Data Matrix (Machine/Product | Actual KG | Scrap KG | Defect Reason)
 *   4. Department Breakdown Summary Table
 * ──────────────────────────────────────────────────────────────────────────── */

import React, { useMemo } from 'react';
import { Button, Tooltip, Tag } from 'antd';
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
  BarChartOutlined,
  ApartmentOutlined,
  AppstoreOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { formatNumber } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { useAnalysisRows } from './analyticsData';
import {
  dailyScrapSeries,
  departmentScrapRollup,
  defectReasonDistribution,
  topItemsScrapRollup,
  hoursFixed,
  kgFixed,
  scrapMatrix,
  scrapTotals,
  unweightedEntryCount,
} from './analyticsModel';
import {
  CHART_COLORS,
  ChartFrame,
  MetricTile,
  Panel,
  SheetHead,
  SheetStatus,
  labelCellStyle,
  numCellStyle,
} from './analyticsUi';

export interface RejectionScrapDetailsProps {
  /** Rows the grid currently holds — seeds the sheet before the wide sample lands. */
  seed: ProductionEntryRow[];
  /** The grid's active filters, so the sheet analyses exactly what the user sees. */
  buildFilters: () => Record<string, unknown>;
  /** True while this tab is the visible pane (gates the request). */
  active: boolean;
}

/** Defect Donut Color Palette */
const DEFECT_COLORS = ['#f97316', '#06b6d4', '#a855f7', '#10b981', '#ec4899', '#eab308', '#6366f1'];

/** Compact wrapping header cell. */
const thHead: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  lineHeight: 1.3,
  color: 'var(--theme-text-muted, #94a3b8)',
  padding: '6px 6px',
  whiteSpace: 'normal',
  verticalAlign: 'bottom',
};

const RejectionScrapDetails: React.FC<RejectionScrapDetailsProps> = ({ seed, buildFilters, active }) => {
  const analysis = useAnalysisRows(seed, buildFilters, active);
  const rows = analysis.rows;

  /* ── Aggregations (pure, see analyticsModel.ts) ─────────────────────────── */
  const matrix = useMemo(() => scrapMatrix(rows), [rows]);
  const series = useMemo(() => dailyScrapSeries(rows), [rows]);
  const byDepartment = useMemo(() => departmentScrapRollup(rows), [rows]);
  const totals = useMemo(() => scrapTotals(rows), [rows]);
  const unweighted = useMemo(() => unweightedEntryCount(rows), [rows]);
  const defectDist = useMemo(() => {
    const list = defectReasonDistribution(rows);
    return list.map((item, index) => ({
      ...item,
      fill: DEFECT_COLORS[index % DEFECT_COLORS.length],
    }));
  }, [rows]);
  const topItems = useMemo(() => topItemsScrapRollup(rows, 6), [rows]);

  const status =
    analysis.error ?? (analysis.loading ? 'Loading the analytical sample…' : null);

  const caption = analysis.loaded
    ? `Read-only · ${formatNumber(rows.length, 0)} of ${formatNumber(analysis.scopeTotal, 0)} matching entries analysed across ${formatNumber(series.length, 0)} production day${series.length === 1 ? '' : 's'}.`
    : `Read-only · seeded with the ${formatNumber(rows.length, 0)} entries on the current page while the filtered sample loads.`;

  const topDefect = defectDist[0];

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

      {/* ── 4 Top Executive KPI Metrics ────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <MetricTile
          testId="scrap-produced"
          label="Actual Produced"
          value={`${kgFixed(totals.actualKg)} KG`}
          hint={`${formatNumber(totals.entries, 0)} entries`}
        />
        <MetricTile
          testId="scrap-rejected"
          label="Scrap Weight (KG)"
          value={`${kgFixed(totals.scrapKg)} KG`}
          tone={totals.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : undefined}
          hint={`${formatNumber(matrix.length, 0)} machine / product pairs`}
        />
        <MetricTile
          testId="scrap-wastage"
          label="Rejection Rate"
          value={`${formatNumber(totals.wastagePct, 2)}%`}
          tone={totals.wastagePct > 0 ? 'var(--theme-warning, #f59e0b)' : undefined}
          hint="Rejected KG ÷ Actual KG"
        />
        <MetricTile
          testId="scrap-top-defect"
          label="Top Defect Type"
          value={topDefect ? topDefect.reason : 'None'}
          tone="#a855f7"
          hint={topDefect ? `${topDefect.pct}% of scrap (${kgFixed(topDefect.scrapKg)} KG)` : (unweighted > 0 ? `${unweighted} rows excluded` : 'Zero defect recorded')}
        />
      </div>

      {/* ── 2x2 Grid: 4 Visual Analytics Charts ────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))',
          gap: 12,
          marginBottom: 14,
        }}
      >
        {/* CHART 1: Day-wise Scrap Trend (Area Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <LineChartOutlined style={{ color: '#06b6d4' }} /> Day-wise Scrap Trend
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
                      <linearGradient id="scrapGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="producedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0.0} />
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
                      dataKey="scrapKg"
                      name="Rejected Scrap (KG)"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      fill="url(#scrapGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartFrame>
              <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 6, flexWrap: 'wrap' }}>
                <span>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#06b6d4', marginRight: 5 }} />
                  Actual Produced (KG)
                </span>
                <span>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: '#f97316', marginRight: 5 }} />
                  Rejected Scrap (KG)
                </span>
              </div>
            </>
          )}
        </Panel>

        {/* CHART 2: Defect Reason Distribution (Donut Pie Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <PieChartOutlined style={{ color: '#f97316' }} /> Defect Reason Distribution
            </span>
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
                {defectDist.slice(0, 5).map((d, i) => (
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

        {/* CHART 3: Department-wise Rejection (KG) (Horizontal Bar Chart) */}
        <Panel
          title={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
              <ApartmentOutlined style={{ color: '#38bdf8' }} /> Department-wise Rejection (KG)
            </span>
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
                    formatter={(val: unknown) => [`${kgFixed(Number(val))} KG`, 'Scrap Weight']}
                    contentStyle={{
                      background: 'var(--theme-surface, #1e293b)',
                      borderColor: 'var(--theme-border, #334155)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="scrapKg" name="Scrap (KG)" fill="#38bdf8" radius={[0, 6, 6, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>

        {/* CHART 4: Top Items by Rejection (Item-wise Bar Chart) */}
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
                    formatter={(val: unknown) => [`${kgFixed(Number(val))} KG`, 'Scrap Weight']}
                    contentStyle={{
                      background: 'var(--theme-surface, #1e293b)',
                      borderColor: 'var(--theme-border, #334155)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="scrapKg" name="Scrap (KG)" fill="#ec4899" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          )}
        </Panel>
      </div>

      {/* ── 3 · Wastage Data Matrix ──────────────────────────────────────── */}
      <Panel
        title={
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Wastage Data Matrix
          </span>
        }
        testId="scrap-matrix"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...thHead, textAlign: 'left', width: '28%' }}>Machine / Product</th>
                <th style={{ ...thHead, textAlign: 'right', width: '24%' }}>Total Actual Quantity Produced (KG)</th>
                <th style={{ ...thHead, textAlign: 'right', width: '22%' }}>Total Rejected Scrap (KG)</th>
                <th style={{ ...thHead, textAlign: 'left', width: '26%' }}>Wastage Defect Reason Code</th>
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...labelCellStyle, color: 'var(--theme-text-muted, #94a3b8)', padding: '16px 8px', textAlign: 'center' }}>
                    No production records found for the selected filter.
                  </td>
                </tr>
              ) : (
                matrix.map((m) => (
                  <tr key={m.key} data-testid="scrap-matrix-row" style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                    <td style={labelCellStyle}>
                      <b style={{ color: 'var(--theme-text, #f1f5f9)' }}>{m.machine}</b>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{m.product}</div>
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{kgFixed(m.actualKg)}</td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: m.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : 'var(--theme-text-muted, #94a3b8)',
                      }}
                    >
                      {kgFixed(m.scrapKg)}
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: m.wastagePct > 0 ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {formatNumber(m.wastagePct, 2)}%
                      </div>
                    </td>
                    <td style={labelCellStyle}>
                      <Tooltip title={m.defectReason !== '—' ? m.defectReason : undefined}>
                        <span style={{ color: m.defectReason !== '—' ? 'var(--theme-text, #f1f5f9)' : 'var(--theme-text-muted, #64748b)' }}>
                          {m.defectReason}
                        </span>
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── 4 · Department Breakdown Table ───────────────────────────────── */}
      <Panel
        title={
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            Department Breakdown — Which Stage Wastes Most
          </span>
        }
        testId="scrap-departments"
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Department', 'Entries', 'Produced KG', 'Scrap KG', 'Wastage Rate', 'Downtime'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      ...(i >= 1 ? numCellStyle : labelCellStyle),
                      textAlign: i >= 1 ? 'right' : 'left',
                      color: 'var(--theme-text-muted, #94a3b8)',
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      padding: '6px 6px',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byDepartment.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...labelCellStyle, color: 'var(--theme-text-muted, #94a3b8)', padding: '16px 8px', textAlign: 'center' }}>
                    No department produced anything in this period.
                  </td>
                </tr>
              ) : (
                byDepartment.map((d, i) => (
                  <tr key={d.department} data-testid="scrap-department-row" style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                    <td style={labelCellStyle}>
                      <span
                        style={{
                          display: 'inline-block',
                          minWidth: 16,
                          fontWeight: 700,
                          color: i === 0 ? 'var(--theme-danger, #ef4444)' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {i + 1}.
                      </span>{' '}
                      <b style={{ color: 'var(--theme-text, #f1f5f9)' }}>{d.department}</b>
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{formatNumber(d.entries, 0)}</td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{kgFixed(d.actualKg)}</td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: d.scrapKg > 0 ? 'var(--theme-danger, #ef4444)' : 'var(--theme-text-muted, #94a3b8)',
                      }}
                    >
                      {kgFixed(d.scrapKg)}
                    </td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: d.wastagePct > 0 ? 'var(--theme-warning, #f59e0b)' : 'var(--theme-text-muted, #94a3b8)',
                      }}
                    >
                      {formatNumber(d.wastagePct, 2)}%
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{hoursFixed(d.downtimeHours)}h</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
};

export default RejectionScrapDetails;
