/**
 * Shared helpers for the pre-filled CSV template round trip
 * (Export Current Data as Template → Excel edit → Import upsert).
 *
 * Used by the Item Master and Machine Master importers so the two modules
 * produce byte-identical cell semantics.
 *
 * Two rules make the round trip lossless:
 *
 *  1. Numbers are written RAW. A locale-aware formatter emits `1,234.50`, which
 *     quotes correctly in CSV but reads back as `NaN` in `Number(...)` and fails
 *     numeric validation on re-upload. `rawNum` guarantees `0.0097` stays
 *     `0.0097`.
 *
 *  2. A missing value is written as an EMPTY cell. On import an empty cell (or
 *     an entirely omitted column) is interpreted as RETAIN STORED VALUE, never
 *     as a request to write `''`, `0` or `null` over an existing value.
 */

/**
 * Raw, unformatted numeric cell for a round-trip CSV.
 *
 * `''` / `null` / `undefined` → `''` (no stored value → retain on import).
 * A finite number → its shortest exact decimal form (`0.0097`, `5000`).
 * A non-numeric string → `''` rather than the literal `NaN`, so a corrupted
 * source value can never poison the sheet.
 */
export function rawNum(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  return isFinite(n) ? String(n) : '';
}

/**
 * Normalise a stored date to the `YYYY-MM-DD` cell the import parser expects.
 * Already-plain dates pass through untouched; an ISO timestamp is truncated to
 * its date part so `2024-06-15T00:00:00.000Z` never reaches the regex guard as
 * a non-matching string. Blank stays blank (retain stored value).
 */
export function isoDate(v: string | null | undefined): string {
  if (!v) return '';
  const s = String(v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}
