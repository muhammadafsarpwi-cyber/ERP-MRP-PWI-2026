import type { CSSProperties } from 'react';

// ============================================================================
// MAINTENANCE UI DESIGN SYSTEM — ONE SOURCE OF TRUTH
// ----------------------------------------------------------------------------
// All Maintenance pages consume these centralized tokens. Neutral "surface /
// text / border" values reference the global ERP theme CSS variables
// (--theme-*) defined in src/theme, so the entire module automatically adapts
// to light and dark mode without per-component hard-coded colors.
//
// Semantic status / type / priority colors are defined here once and reused by
// every Maintenance screen (Dashboard pipeline, Job Card pipeline, KPI cards,
// badges, analytics) so they can never drift apart.
// ============================================================================

// Page header uses the global theme brand gradient (primary -> accent). All
// Maintenance pages share this one definition instead of a hard-coded brand.
export const maintGradient =
  'linear-gradient(135deg, var(--theme-primary) 0%, var(--theme-accent) 100%)';

// Neutral semantic tokens — adapt automatically to light/dark.
export const t = {
  cardBg: 'var(--theme-surface)',
  cardBgAlt: 'var(--theme-surface-alt)',
  text: 'var(--theme-text)',
  textMuted: 'var(--theme-text-muted)',
  border: 'var(--theme-border)',
  borderStrong: 'var(--theme-border-strong)',
  hoverBg: 'var(--theme-hover)',
  activeBg: 'var(--theme-active)',
  iconMuted: 'var(--theme-text-muted)',
};

// Compact ERP panel surface used across all Maintenance cards/panels.
export const panelCard: CSSProperties = {
  borderRadius: 6,
  border: `1px solid var(--theme-border)`,
};

// Restrained shadows — resolved per theme via maintTheme.css.
export const shadowSm = 'var(--maint-shadow-sm)';
export const shadowHover = 'var(--maint-shadow-hover)';

// KPI icon-tint background helper: translucent tint works on light & dark.
export const tint = (color: string) => `${color}1f`;

// --- Status pipeline semantic colors (single source of truth) --------------
export const STATUS_COLORS: Record<string, string> = {
  ALL: '#1677ff',
  OPEN: '#1677ff',
  ASSIGNED: '#13c2c2',
  IN_PROGRESS: '#fa8c16',
  ON_HOLD: '#faad14',
  WAITING_FOR_PARTS: '#722ed1',
  COMPLETED: '#52c41a',
  PENDING_VERIFICATION: '#fa8c16',
  VERIFIED: '#13c2c2',
  APPROVED: '#389e0d',
  CLOSED: '#8c8c8c',
  REJECTED: '#f5222d',
  CANCELLED: '#8c8c8c',
};

// --- Maintenance type semantic colors ---------------------------------------
export const TYPE_COLORS: Record<string, string> = {
  BREAKDOWN: '#ff4d4f',
  PREVENTIVE: '#52c41a',
  CORRECTIVE: '#faad14',
  INSPECTION: '#1677ff',
  EMERGENCY: '#fa541c',
};

// --- Priority semantic colors -----------------------------------------------
export const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: '#ff4d4f',
  HIGH: '#fa8c16',
  MEDIUM: '#1677ff',
  LOW: '#52c41a',
};

// --- Pending-action accent colors -------------------------------------------
export const ACTION_COLORS: Record<string, string> = {
  OPEN: '#1677ff',
  WAITING_FOR_PARTS: '#722ed1',
  PENDING_VERIFICATION: '#fa8c16',
  VERIFIED: '#389e0d',
};

// Default antd Tag preset name derived from a semantic strong color (for
// status/type/priority tags that read well in both themes).
export const tagPresetFor = (color: string): string => {
  switch (color) {
    case '#ff4d4f': case '#f5222d': case '#fa541c': return 'red';
    case '#fa8c16': case '#faad14': return 'orange';
    case '#52c41a': case '#389e0d': return 'green';
    case '#13c2c2': return 'cyan';
    case '#1677ff': return 'blue';
    case '#722ed1': return 'purple';
    default: return 'default';
  }
};
