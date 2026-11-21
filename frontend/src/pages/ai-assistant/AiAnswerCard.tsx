import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ReTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  AiAnswer,
  AiChartMetadata,
  AiEmptyStateSuggestion,
} from '../../services/aiAssistantService';
import { formatQty, PCS_PER_GROSS } from './reportGenerator';
import './aiAnswerCard.css';

/**
 * AiAnswerCard — renders one backend AiAnswer payload.
 *
 * Dynamic rendering contract (validated server-side against real columns):
 *   • chart.chartType === 'bar' | 'line' → Recharts with <XAxis dataKey={chart.x.column}>
 *     and one <Bar />/<Line /> per chart.series entry (labels included).
 *   • chart.chartType === 'pie'          → first series as value, x column as name.
 *   • chart.chartType === 'table'        → clean, unbordered, striped data table.
 *   • status === 'empty'                 → bilingual "No records found" + clickable
 *                                           suggestions from the backend advisor.
 *
 * Theming: all colors come from the standard application design tokens
 * (--theme-* CSS variables written by ThemeProvider), so light/dark adapts
 * automatically with no per-component logic.
 */

/**
 * Safely renders inline markdown bold (`**...**`) and inline code (`` `...` ``)
 * as clean React elements without showing raw markdown asterisks.
 */
export function renderRichText(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, lineIdx) => {
    const tokens = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return (
      <React.Fragment key={lineIdx}>
        {tokens.map((part, idx) => {
          if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return (
              <strong key={idx} style={{ fontWeight: 700 }}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return (
              <code
                key={idx}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.88em',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'var(--theme-surface-alt, rgba(148, 163, 184, 0.16))',
                }}
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <React.Fragment key={idx}>{part}</React.Fragment>;
        })}
        {lineIdx < lines.length - 1 && <br />}
      </React.Fragment>
    );
  });
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const SUGGESTION_ICONS: Record<string, string> = {
  division: '🏢',
  period: '📅',
  department: '🏭',
  filter: '🎯',
  tip: '💡',
};

/** Postgres numeric/decimal columns arrive as strings — coerce for Recharts. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isNumericColumn(rows: Record<string, unknown>[], column: string): boolean {
  for (const row of rows.slice(0, 25)) {
    const v = row[column];
    if (v === null || v === undefined || v === '') continue;
    return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
  }
  return false;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return formatQty(value);
  if (typeof value === 'string') {
    const n = toNumber(value);
    // Numeric-looking strings from pg numeric(19,4) — keep raw precision if long.
    if (n !== null && value.includes('.') && value.length <= 18) return formatQty(n);
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

const GROSS_CONVERTIBLE_COL_REGEX =
  /\b(total_production|actual_production|actual_quantity|produced_qty|avg_production|target_quantity|total_target|runtime_dynamic_target|calculated_target|target_per_hour|product_scrap_pcs|process_scrap_pcs|scrap_quantity|total_quantity)\b/i;

interface AiAnswerCardProps {
  answer: AiAnswer;
  isDark: boolean;
  uomOverride?: string;
  /** Clicked an empty-state suggestion — parent decides how to re-ask. */
  onSuggest?: (suggestion: AiEmptyStateSuggestion) => void;
}

const AiAnswerCard: React.FC<AiAnswerCardProps> = ({ answer, isDark, uomOverride, onSuggest }) => {
  const { chart, rows, columns, emptyState, status, sql } = answer;
  const hasRows = rows.length > 0;
  const isGrossActive = uomOverride?.toLowerCase() === 'gross';
  const sqlAlreadyDividedBy144 = Boolean(sql && /\/\s*144(\.0+)?\b/.test(sql));

  /** Dynamically convert piece quantities to Gross (1 Gross = 144 PCS) if not already divided in SQL */
  const displayRows = useMemo(() => {
    if (!hasRows) return [];
    if (!isGrossActive || sqlAlreadyDividedBy144) return rows;
    return rows.map((row) => {
      const converted: Record<string, unknown> = { ...row };
      columns.forEach((col) => {
        if (GROSS_CONVERTIBLE_COL_REGEX.test(col) && !col.toLowerCase().endsWith('_kg')) {
          const n = toNumber(row[col]);
          if (n !== null) {
            converted[col] = Math.round((n / PCS_PER_GROSS) * 100) / 100;
          }
        }
      });
      return converted;
    });
  }, [rows, columns, hasRows, isGrossActive, sqlAlreadyDividedBy144]);

  // Design tokens for SVG surfaces (Recharts paints via attributes, so the
  // computed variable values are read once per theme flip, with fallbacks).
  const tokens = useMemo(() => {
    const cssVar = (name: string, fallback: string): string => {
      try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
      } catch {
        return fallback;
      }
    };
    return {
      grid: cssVar('--theme-chart-grid', isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'),
      axis: cssVar('--theme-chart-axis', isDark ? '#94a3b8' : '#64748b'),
      tooltipBg: cssVar('--theme-surface-elevated', isDark ? '#0f172a' : '#ffffff'),
      tooltipBorder: cssVar('--theme-border-strong', isDark ? '#334155' : '#cbd5e1'),
    };
  }, [isDark]);

  /** Rows with numeric series columns coerced (pg numeric → JS number). */
  const chartRows = useMemo(() => {
    if (!chart || !hasRows) return [];
    const seriesCols = new Set(chart.series.map((s) => s.column));
    return displayRows.map((row) => {
      const copy: Record<string, unknown> = { ...row };
      seriesCols.forEach((col) => {
        const n = toNumber(row[col]);
        if (n !== null) copy[col] = n;
      });
      return copy;
    });
  }, [chart, displayRows, hasRows]);

  const numericColumns = useMemo(() => {
    const set = new Set<string>();
    columns.forEach((col) => {
      if (isNumericColumn(displayRows, col)) set.add(col);
    });
    return set;
  }, [columns, displayRows]);

  // ── Chart (bar/line/pie) — fully driven by the server-validated payload ────

  const renderChart = (): React.ReactNode => {
    if (!hasRows || !chart || chart.chartType === 'table') return null;
    const { x, series } = chart;
    if (!x.column || series.length === 0) return null;

    const showLegend = series.length > 1;
    const xInterval = chartRows.length <= 30 ? 0 : 'preserveStartEnd';

    const tooltipStyle = {
      background: tokens.tooltipBg,
      borderColor: tokens.tooltipBorder,
      borderRadius: 8,
      color: isDark ? '#fff' : '#000',
    };

    if (chart.chartType === 'pie') {
      const valueKey = series[0].column;
      const pieData = chartRows
        .map((row) => ({ name: formatCell(row[x.column]), value: toNumber(row[valueKey]) ?? 0 }))
        .filter((d) => d.value !== 0);
      if (pieData.length === 0) return null;
      return (
        <div className="ai-ans-chart">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={92}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {pieData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <ReTooltip contentStyle={tooltipStyle} formatter={(val: any) => formatQty(val)} />
              {showLegend && <Legend wrapperStyle={{ color: tokens.axis }} />}
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    const axisTick = { fontSize: 11, fill: tokens.axis };

    if (chart.chartType === 'line') {
      return (
        <div className="ai-ans-chart">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartRows} margin={{ top: 8, right: 16, left: -4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} vertical={false} />
              <XAxis
                dataKey={x.column}
                stroke={tokens.axis}
                tick={axisTick}
                interval={xInterval as any}
                tickFormatter={(v: unknown) => formatCell(v)}
              />
              <YAxis stroke={tokens.axis} tick={axisTick} tickFormatter={(v) => formatQty(v)} />
              <ReTooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: tokens.tooltipBorder, strokeDasharray: '3 3' }}
                formatter={(val: any) => formatQty(val)}
              />
              {showLegend && <Legend wrapperStyle={{ color: tokens.axis }} />}
              {series.map((s, index) => (
                <Line
                  key={s.column}
                  type="monotone"
                  dataKey={s.column}
                  name={s.label}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    // bar (default)
    return (
      <div className="ai-ans-chart">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartRows} margin={{ top: 8, right: 16, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.grid} vertical={false} />
            <XAxis
              dataKey={x.column}
              stroke={tokens.axis}
              tick={axisTick}
              interval={xInterval as any}
              tickFormatter={(v: unknown) => formatCell(v)}
            />
            <YAxis stroke={tokens.axis} tick={axisTick} tickFormatter={(v) => formatQty(v)} />
            <ReTooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
              formatter={(val: any) => formatQty(val)}
            />
            {showLegend && <Legend wrapperStyle={{ color: tokens.axis }} />}
            {series.map((s, index) => (
              <Bar
                key={s.column}
                dataKey={s.column}
                name={isGrossActive && !s.label.includes('Gross') ? `${s.label} (Gross)` : s.label}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
                radius={[4, 4, 0, 0]}
                maxBarSize={56}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  // ── Table fallback — clean, unbordered, striped ────────────────────────────

  const renderStyledCell = (col: string, rawVal: unknown): React.ReactNode => {
    const formatted = formatCell(rawVal);
    const colLow = col.toLowerCase().trim();
    if (formatted !== '—' && (colLow === 'item code' || colLow === 'item_code' || colLow === 'sku')) {
      return (
        <span
          style={{
            display: 'inline-block',
            padding: '1px 7px',
            borderRadius: 5,
            fontFamily: 'monospace',
            fontWeight: 700,
            fontSize: 11.5,
            background: isDark ? 'rgba(249, 115, 22, 0.2)' : '#fff7ed',
            color: isDark ? '#fdba74' : '#c2410c',
            border: isDark ? '1px solid rgba(251, 146, 60, 0.45)' : '1px solid #fdba74',
          }}
        >
          {formatted}
        </span>
      );
    }
    if (
      formatted !== '—' &&
      (colLow.includes('last received date') ||
        colLow === 'last_received_date' ||
        colLow.includes('last entry date') ||
        colLow === 'last_entry_date')
    ) {
      return (
        <strong
          style={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: isDark ? '#60a5fa' : '#1e3a8a',
          }}
        >
          {formatted}
        </strong>
      );
    }
    return formatted;
  };

  const renderTable = (): React.ReactNode => {
    if (!hasRows) return null;
    const visibleColumns =
      columns.length > 1
        ? columns.filter((col) => col.toLowerCase().trim() !== 'division_id')
        : columns;
    return (
      <div className="ai-ans-table-wrap">
        <table className="ai-ans-table" aria-label="AI query result rows">
          <thead>
            <tr>
              {visibleColumns.map((col) => {
                const isConvertedCol =
                  isGrossActive &&
                  GROSS_CONVERTIBLE_COL_REGEX.test(col) &&
                  !col.toLowerCase().endsWith('_kg');
                return (
                  <th key={col} className={numericColumns.has(col) ? 'ai-ans-num' : undefined} scope="col">
                    {col.replace(/_/g, ' ')}{isConvertedCol ? ' (Gross)' : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {visibleColumns.map((col) => (
                  <td key={col} className={numericColumns.has(col) ? 'ai-ans-num' : undefined}>
                    {renderStyledCell(col, row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── Clarifying follow-up options (when Gemini asks for clarification) ────

  const renderClarification = (): React.ReactNode => {
    if (status !== 'clarification') return null;
    const opts = answer.clarificationOptions || [];
    if (opts.length === 0) return null;
    return (
      <div className="ai-ans-empty" style={{ marginTop: 8 }}>
        <div className="ai-ans-suggestions">
          {opts.map((opt, idx) => (
            <button
              key={`clarify-${idx}`}
              type="button"
              className="ai-ans-suggestion"
              onClick={() => onSuggest?.({ type: 'filter', label: opt, labelUr: opt, value: opt })}
              title={opt}
            >
              🎯 {opt}
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ── Empty state — clean English + clickable suggestions ──────────────────

  const renderEmptyState = (): React.ReactNode => {
    if (status !== 'empty' || !emptyState) return null;
    return (
      <div className="ai-ans-empty">
        <div className="ai-ans-empty-en">🔍 {renderRichText(emptyState.message.en)}</div>
        {emptyState.suggestions.length > 0 && (
          <div className="ai-ans-suggestions">
            {emptyState.suggestions.map((s, idx) => (
              <button
                key={`${s.type}-${idx}`}
                type="button"
                className="ai-ans-suggestion"
                onClick={() => onSuggest?.(s)}
                title={s.label}
              >
                {SUGGESTION_ICONS[s.type] ?? '🔎'} {s.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Footer: assumptions, provenance, generated SQL ─────────────────────────

  const renderFooter = (): React.ReactNode => {
    const { meta, confidence, assumption, sql, truncated } = answer;
    return (
      <>
        {renderClarification()}
        {renderEmptyState()}
        {hasRows && (
          <div className="ai-ans-rowcount">
            {answer.rowCount.toLocaleString()} row{answer.rowCount === 1 ? '' : 's'}
            {truncated && <span className="ai-ans-trunc"> · result limited — refine with a filter or date range</span>}
          </div>
        )}
        <div className="ai-ans-meta">
          <span>{meta.model}</span>
          <span>· {meta.totalMs} ms</span>
          <span>· SQL attempts: {meta.attempts}</span>
          <span>· Division scope: {meta.divisionsScopedTo === 'ALL' ? 'all divisions' : `${meta.divisionsScopedTo} division(s)`}</span>
          {typeof confidence === 'number' && <span>· confidence {(confidence * 100).toFixed(0)}%</span>}
        </div>
        {sql && (
          <details className="ai-ans-sql">
            <summary>Generated SQL (read-only)</summary>
            <pre>{sql}</pre>
          </details>
        )}
        {assumption && <div className="ai-ans-assumption">💡 {renderRichText(assumption)}</div>}
      </>
    );
  };

  const chartMeta = chart as AiChartMetadata | undefined;

  return (
    <div className="ai-ans-root">
      {chartMeta && chartMeta.dimension && chartMeta.dimension !== 'none' && hasRows && (
        <div className="ai-ans-section-title">
          {chartMeta.dimension.charAt(0).toUpperCase() + chartMeta.dimension.slice(1)} — {chartMeta.x.label || chartMeta.x.column}
        </div>
      )}
      {renderTable()}
      {renderChart()}
      {renderFooter()}
    </div>
  );
};

export default AiAnswerCard;
