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
