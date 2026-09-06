import { BadRequestException } from '@nestjs/common';

export interface BusinessDayWindow {
  start: Date | null;
  end: Date | null;
}

export const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseBusinessDate(dateStr: string): { year: number; month: number; day: number } {
  const m = DATE_PATTERN.exec(dateStr ?? '');
  if (!m) {
    throw new BadRequestException(`dateFrom/dateTo must use the YYYY-MM-DD business-date format (got '${dateStr}')`);
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new BadRequestException(`Invalid business date '${dateStr}' (must be YYYY-MM-DD)`);
  }
  return { year, month, day };
}

/** The calendar day AFTER `dateStr` (same format, handles month/year rollover). */
export function nextBusinessDate(dateStr: string): string {
  const { year, month, day } = parseBusinessDate(dateStr);
  const noon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  noon.setUTCDate(noon.getUTCDate() + 1);
  return noon.toISOString().slice(0, 10);
}

/**
 * Offset (ms) of `timeZone` at the instant `utcMs`: how far local wall time
 * is ahead of UTC. Europe-format-agnostic; uses the ICU timezone database.
 */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  const wallClockAsUtc = Date.UTC(
    Number(o.year),
    Number(o.month) - 1,
    Number(o.day),
    Number(o.hour),
    Number(o.minute),
    Number(o.second),
  );
  return wallClockAsUtc - utcMs;
}

/**
 * The UTC instant of LOCAL midnight (00:00:00.000) of `dateStr` in `timeZone`.
 * In other words: the exact instant the business day `dateStr` begins for the
 * company's configured timezone. DST-safe via fixed-point iteration.
 */
export function businessDayStartUtc(dateStr: string, timeZone: string): Date {
  const { year, month, day } = parseBusinessDate(dateStr);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  let utc = localMidnightAsUtc;
  for (let i = 0; i < 3; i += 1) {
    const candidate = localMidnightAsUtc - tzOffsetMs(utc, timeZone);
    if (candidate === utc) break;
    utc = candidate;
  }
  return new Date(utc);
}

/**
 * Maps `YYYY-MM-DD` business-date filters onto the UTC instants used to query
 * the TIMESTAMPTZ `stock_ledger.transaction_date`:
 *
 *   start = local midnight of `dateFrom`  (inclusive lower bound)
 *   end   = local midnight of the day AFTER `dateTo` (EXCLUSIVE upper bound)
 *
 * The report day [from → to] therefore contains every posting that happened
 * between the start of business day `dateFrom` and the start of the day after
 * `dateTo` in the company's own calendar — a posting at 00:30 PKT is part of
 * that Pakistan business day, not the previous UTC calendar day. `end` is
 * exclusive so microsecond-precision timestamps (timestamptz(6)) can never be
 * lost at the 23:59:59.999 truncation boundary.
 */
export function businessDayWindow(
  dateFrom?: string,
  dateTo?: string,
  timeZone: string = 'UTC',
): BusinessDayWindow {
  if (!dateFrom && !dateTo) return { start: null, end: null };
  const start = dateFrom ? businessDayStartUtc(dateFrom, timeZone) : null;
  const end = dateTo ? businessDayStartUtc(nextBusinessDate(dateTo), timeZone) : null;
  return { start, end };
}