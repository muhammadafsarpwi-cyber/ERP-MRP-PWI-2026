/* ─────────────────────────────────────────────────────────────────────────────
 * RejectionScrapDetails.tsx — TAB B · "Rejection & Scrap Details"
 *
 * Read-only analytical sheet rendered only inside its own tab pane under the
 * existing Daily Production Entry <Tabs>. Nothing here writes back, so the live
 * log grid stays 100% untouched (Zero-Disturbance Policy).
 *
 * What it answers:
 *   · Data Matrix — Machine/Product | Actual produced (KG) | Rejected scrap
 *     (KG) | Wastage defect reason code, one tight row per machine+product pair.
 *   · Wastage Trend — daily scrap generation across the selected date range.
 *   · Department Breakdown — the same totals grouped by department tier
 *     (Straightening · Swaging · Plating) so the wasteful stage is obvious.
 *
 * WEIGHTS · Both KG columns go through `calcActualKg`, the SAME conversion the
 * grid's "Actual KG" and "Rejection %" columns print, and the wastage % uses
 * actual KG as its denominator — so this sheet can never disagree with the live
 * row it summarises. A zero / unknown Actual KG reads 0%, never Infinity.
 * ──────────────────────────────────────────────────────────────────────────── */

import React, { useMemo } from 'react';
import { Button, Tooltip } from 'antd';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { formatNumber } from '../../../utils/numberFormat';
import type { ProductionEntryRow } from './EntryList';
import { useAnalysisRows } from './analyticsData';
import {
  dailyScrapSeries,
  departmentScrapRollup,
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

/**
 * Compact wrapping header cell. The spec's column titles are long, so they wrap
 * inside a tight cell instead of stretching the table and leaving dead margin.
 */
const thHead: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  lineHeight: 1.3,
  color: 'var(--theme-text-muted, #94a3b8)',
  padding: '4px 4px',
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

  const status =
    analysis.error ?? (analysis.loading ? 'Loading the analytical sample…' : null);

  const caption = analysis.loaded
    ? `Read-only · ${formatNumber(rows.length, 0)} of ${formatNumber(analysis.scopeTotal, 0)} matching entries analysed across ${formatNumber(series.length, 0)} production day${series.length === 1 ? '' : 's'}.`
    : `Read-only · seeded with the ${formatNumber(rows.length, 0)} entries on the current page while the filtered sample loads.`;

  const SCRAP_BAR = CHART_COLORS[1];
  const PRODUCED_BAR = CHART_COLORS[0];

  return (
    <div data-testid="rejection-scrap-sheet" style={{ padding: '4px 0 12px' }}>
      <SheetHead
        title={
          <span>
            <WarningOutlined style={{ color: 'var(--theme-danger, #dc2626)', marginRight: 6 }} />
            Rejection &amp; Scrap Details
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

      {/* ── Header metrics ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <MetricTile
          testId="scrap-produced"
          label="Actual Produced"
          value={`${kgFixed(totals.actualKg)} KG`}
          hint={`${formatNumber(totals.entries, 0)} entries`}
        />
        <MetricTile
          testId="scrap-rejected"
          label="Rejected Scrap"
          value={`${kgFixed(totals.scrapKg)} KG`}
          tone={totals.scrapKg > 0 ? 'var(--theme-danger, #dc2626)' : undefined}
          hint={`${formatNumber(matrix.length, 0)} machine / product pairs`}
        />
        <MetricTile
          testId="scrap-wastage"
          label="Wastage"
          value={`${formatNumber(totals.wastagePct, 2)}%`}
          tone={totals.wastagePct > 0 ? 'var(--theme-warning, #d97706)' : undefined}
          hint="Rejected KG ÷ Actual KG"
        />
        <MetricTile
          testId="scrap-unweighted"
          label="No Weight UOM"
          value={formatNumber(unweighted, 0)}
          hint={unweighted > 0 ? 'Excluded from KG totals' : 'All rows convert to KG'}
        />
      </div>

      {/* ── 1 · Data Matrix ──────────────────────────────────────────────── */}
      <Panel title="Wastage Data Matrix" testId="scrap-matrix">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed' }}>
            <thead>
              {/* Strictly the four columns the spec lists, in order. The
                  wastage % rides under the scrap figure as a sub-line (the
                  same report style the live grid uses) rather than taking a
                  fifth column. */}
              <tr>
                <th style={{ ...thHead, textAlign: 'left', width: '26%' }}>Machine/Product</th>
                <th style={{ ...thHead, textAlign: 'right' }}>Total Actual Quantity Produced (KG)</th>
                <th style={{ ...thHead, textAlign: 'right' }}>Total Rejected Scrap (KG)</th>
                <th style={{ ...thHead, textAlign: 'left', width: '24%' }}>Wastage Defect Reason Code</th>
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...labelCellStyle, color: 'var(--theme-text-muted, #94a3b8)' }}>
                    No production was recorded in this period.
                  </td>
                </tr>
              ) : (
                matrix.map((m) => (
                  <tr key={m.key} data-testid="scrap-matrix-row" style={{ borderTop: '1px solid var(--theme-border, #e2e8f0)' }}>
                    <td style={labelCellStyle}>
                      <b>{m.machine}</b>
                      <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)' }}>{m.product}</div>
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{kgFixed(m.actualKg)}</td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: m.scrapKg > 0 ? 'var(--theme-danger, #dc2626)' : 'var(--theme-text-muted, #94a3b8)',
                      }}
                    >
                      {kgFixed(m.scrapKg)}
                      {/* Wastage % as a light sub-line — same report style the
                          live grid's Rejection % uses, so the matrix keeps the
                          strict four-column layout. */}
                      <div
                        style={{
                          fontSize: 10.5,
                          fontWeight: 500,
                          color: m.wastagePct > 0 ? 'var(--theme-warning, #d97706)' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {formatNumber(m.wastagePct, 2)}%
                      </div>
                    </td>
                    <td style={labelCellStyle}>
                      <Tooltip title={m.defectReason !== '—' ? m.defectReason : undefined}>
                        <span>{m.defectReason}</span>
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── 2 · Wastage Trend ────────────────────────────────────────────── */}
      <Panel title="Wastage Trend — Daily Scrap Generation" testId="scrap-trend">
        {series.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--theme-text-muted, #94a3b8)', padding: '6px 2px' }}>
            No production days in the selected date range.
          </div>
        ) : (
          <ChartFrame height={262}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 8, right: 8, left: -6, bottom: 24 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border, #e2e8f0)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                  tickFormatter={(v: string) => String(v).slice(5)}
                  interval="preserveStartEnd"
                  minTickGap={16}
                  stroke="var(--theme-border, #cbd5e1)"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--theme-text-muted, #94a3b8)' }}
                  width={46}
                  stroke="var(--theme-border, #cbd5e1)"
                />
                {/* `name` is what the default tooltip prints — kept as props
                    instead of a formatter so the labels cannot drift from the
                    legend below. */}
                <ChartTooltip cursor={{ fill: 'rgba(148, 163, 184, 0.14)' }} />
                <Bar dataKey="actualKg" name="Actual Produced (KG)" fill={PRODUCED_BAR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="scrapKg" name="Rejected Scrap (KG)" fill={SCRAP_BAR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 4, flexWrap: 'wrap' }}>
          <span>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: PRODUCED_BAR, marginRight: 5 }} />
            Actual Produced (KG)
          </span>
          <span>
            <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: SCRAP_BAR, marginRight: 5 }} />
            Rejected Scrap (KG)
          </span>
          <span>Busiest day: {series.length ? series.reduce((a, b) => (b.scrapKg > a.scrapKg ? b : a)).date : '—'}</span>
        </div>
      </Panel>

      {/* ── 3 · Department Breakdown ─────────────────────────────────────── */}
      <Panel title="Department Breakdown — Which Stage Wastes Most" testId="scrap-departments">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Department', 'Entries', 'Produced KG', 'Scrap KG', 'Wastage', 'Downtime'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      ...(i >= 1 ? numCellStyle : labelCellStyle),
                      textAlign: i >= 1 ? 'right' : 'left',
                      color: 'var(--theme-text-muted, #94a3b8)',
                      fontSize: 10.5,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
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
                  <td colSpan={6} style={{ ...labelCellStyle, color: 'var(--theme-text-muted, #94a3b8)' }}>
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
                          color: i === 0 ? 'var(--theme-danger, #dc2626)' : 'var(--theme-text-muted, #94a3b8)',
                        }}
                      >
                        {i + 1}.
                      </span>{' '}
                      <b>{d.department}</b>
                    </td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{formatNumber(d.entries, 0)}</td>
                    <td style={{ ...numCellStyle, textAlign: 'right' }}>{kgFixed(d.actualKg)}</td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: d.scrapKg > 0 ? 'var(--theme-danger, #dc2626)' : 'var(--theme-text-muted, #94a3b8)',
                      }}
                    >
                      {kgFixed(d.scrapKg)}
                    </td>
                    <td
                      style={{
                        ...numCellStyle,
                        textAlign: 'right',
                        color: d.wastagePct > 0 ? 'var(--theme-warning, #d97706)' : 'var(--theme-text-muted, #94a3b8)',
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
        <div style={{ fontSize: 11, color: 'var(--theme-text-muted, #94a3b8)', marginTop: 6 }}>
          Rows whose UOM cannot be converted to KG contribute 0 to both weight columns and are counted in the
          &ldquo;No Weight UOM&rdquo; tile above, so a 0 KG row is never mistaken for a wasted shift.
        </div>
      </Panel>
    </div>
  );
};

export default RejectionScrapDetails;
