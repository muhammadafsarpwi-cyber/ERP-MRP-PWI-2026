/* ─────────────────────────────────────────────────────────────────────────────
 * analyticsUi.tsx
 *
 * The small set of presentational atoms shared by the two read-only analytical
 * tabs. Everything here is deliberately COMPACT (the 2027 spec: hour and
 * rejection cells stay tight, single-line, numeric — no wide dead margins) and
 * theme-token driven so both sheets follow light/dark without overrides.
 *
 * The tabs never render their own charts directly; they wrap them in
 * `ChartFrame`, which is what gives Recharts a real pixel height (ResponsiveContainer
 * collapses to 0 inside an auto-height box, which is why an unframed chart can
 * silently render as a blank strip).
 * ──────────────────────────────────────────────────────────────────────────── */

import React from 'react';

/** Tight, right-aligned numeric cell — shared by both data matrices.
 *  Padding follows the system-wide compact grid rule (`4px 5px`). */
export const numCellStyle: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: 'nowrap',
  padding: '4px 5px',
};

/** Tight label cell — long text may wrap, but never onto an icon row. */
export const labelCellStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.3,
  padding: '4px 5px',
  wordBreak: 'break-word',
};

/** One compact KPI tile. `tone` paints only the number, never the caption.
 *  Optionally displays a circular SVG ring gauge with percentage in center. */
export const MetricTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: string;
  testId?: string;
  gaugePct?: number;
  gaugeColor?: string;
}> = ({ label, value, hint, tone, testId, gaugePct, gaugeColor }) => {
  const hasGauge = gaugePct !== undefined && gaugePct !== null;
  const radius = 19;
  const circumference = 2 * Math.PI * radius; // ~119.38
  const validPct = Math.max(0, Math.min(100, Number(gaugePct) || 0));
  const strokeDashoffset = circumference - (validPct / 100) * circumference;
  const ringColor = gaugeColor || tone || '#06b6d4';

  return (
    <div
      data-testid={testId}
      style={{
        flex: '1 1 150px',
        minWidth: 140,
        background: 'var(--theme-surface-alt, #f1f5f9)',
        border: '1px solid var(--theme-border, #e2e8f0)',
        borderRadius: 8,
        padding: '6px 10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        position: 'relative',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--theme-text-muted, #94a3b8)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
            color: tone || 'var(--theme-text, rgba(15, 23, 42, 0.88))',
            whiteSpace: 'nowrap',
            marginTop: 2,
          }}
        >
          {value}
        </div>
        {hint ? (
          <div
            style={{
              fontSize: 10,
              color: 'var(--theme-text-muted, #94a3b8)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              marginTop: 2,
            }}
          >
            {hint}
          </div>
        ) : null}
      </div>

      {hasGauge && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: 48,
            height: 48,
            flexShrink: 0,
          }}
        >
          <svg width="48" height="48" viewBox="0 0 48 48">
            {/* Background muted track */}
            <circle
              cx="24"
              cy="24"
              r={radius}
              fill="none"
              stroke="var(--theme-border, rgba(148, 163, 184, 0.2))"
              strokeWidth="3.5"
            />
            {/* Foreground progress circle */}
            <circle
              cx="24"
              cy="24"
              r={radius}
              fill="none"
              stroke={ringColor}
              strokeWidth="3.5"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 24 24)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <span
            style={{
              position: 'absolute',
              fontSize: validPct >= 10 ? 8.5 : 9,
              fontWeight: 700,
              color: ringColor,
              textAlign: 'center',
              lineHeight: 1,
            }}
          >
            {validPct < 0.1 && validPct > 0 ? validPct.toFixed(2) : validPct.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};

/** Compact header strip: sheet title, scope caption, and the refresh control. */
export const SheetHead: React.FC<{
  title: React.ReactNode;
  caption: React.ReactNode;
  extra?: React.ReactNode;
}> = ({ title, caption, extra }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 10,
    }}
  >
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--theme-text, #1e293b)' }}>{title}</div>
      <div style={{ fontSize: 11.5, color: 'var(--theme-text-muted, #94a3b8)', lineHeight: 1.45 }}>{caption}</div>
    </div>
    {extra ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{extra}</div> : null}
  </div>
);

/**
 * Titled sub-panel. `titleExtra` sits on the title line so a live status pill
 * (e.g. "resolving breakdown…") never steals a row from the matrix below it.
 */
export const Panel: React.FC<{
  title: React.ReactNode;
  titleExtra?: React.ReactNode;
  extra?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
  bodyStyle?: React.CSSProperties;
}> = ({ title, titleExtra, extra, children, testId, bodyStyle }) => (
  <section
    data-testid={testId}
    style={{
      background: 'var(--theme-surface, #ffffff)',
      border: '1px solid var(--theme-border, #e2e8f0)',
      borderRadius: 10,
      padding: '8px 10px 10px',
      marginBottom: 10,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 6,
        minHeight: 18,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--theme-text-muted, #94a3b8)',
        }}
      >
        {title}
      </span>
      {extra ?? titleExtra}
    </div>
    <div style={bodyStyle}>{children}</div>
  </section>
);

/** Fixed-height chart well — Recharts measures its parent to lay out axes. */
export const ChartFrame: React.FC<{
  height?: number;
  children: React.ReactNode;
}> = ({ height = 260, children }) => (
  <div style={{ width: '100%', height, minHeight: height }}>{children}</div>
);

/** The palette both charts share (hue-ordered, readable on light and dark). */
export const CHART_COLORS = [
  '#2563eb',
  '#f59e0b',
  '#16a34a',
  '#dc2626',
  '#8b5cf6',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#ea580c',
  '#475569',
];

/** Read-only banner shown while an analytical sample is still resolving. */
export const SheetStatus: React.FC<{ text?: string | null }> = ({ text }) =>
  text ? (
    <div
      style={{
        fontSize: 11.5,
        color: 'var(--theme-warning, #d97706)',
        marginBottom: 6,
        fontWeight: 600,
      }}
    >
      {text}
    </div>
  ) : null;
