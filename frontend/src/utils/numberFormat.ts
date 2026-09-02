/**
 * Numeric formatting utilities for ERP frontend.
 *
 * PostgreSQL `decimal`/`numeric` columns are returned as STRINGS by the `pg` driver
 * (e.g. "123.456000"). TypeScript interfaces often declare these as `number`, but the
 * runtime type is string.  Every formatter below handles both types safely.
 */

/**
 * Safely convert a value to a JavaScript number.
 * Returns `fallback` (default 0) for null / undefined / non-numeric values.
 */
export function toNum(value: unknown, fallback: number = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Format a numeric value to a fixed number of decimal places.
 * Safe for string, number, null, undefined inputs.
 *
 *   formatDecimal("123.456789")        → "123.46"
 *   formatDecimal(42, 0)               → "42"
 *   formatDecimal(null)                → "0.00"
 *   formatDecimal("not-a-number", 2)   → "0.00"
 */
export function formatDecimal(value: unknown, decimals: number = 2): string {
  return toNum(value).toFixed(decimals);
}

/**
 * Format a numeric value with locale-aware thousand separators and fixed decimals.
 * Falls back gracefully for non-numeric values.
 *
 *   formatNumber(1234567.89)           → "1,234,567.89"
 *   formatNumber("99.5", 0)            → "100"
 */
export function formatNumber(
  value: unknown,
  decimals: number = 2,
  locale: string = 'en-US',
): string {
  return toNum(value).toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a dimension value for display (e.g. Wire Size, Thickness, Width).
 * Always shows exactly 2 decimal places. Renders '—' for null/undefined.
 *
 *   formatDimension(1.2)     → "1.20"
 *   formatDimension(2)       → "2.00"
 *   formatDimension(null)    → "—"
 *   formatDimension(1.45)    → "1.45"
 */
export function formatDimension(value: unknown): string {
  if (value === null || value === undefined || value === '') return '\u2014';
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '\u2014';
}
