/**
 * Pakistani Fiscal Year Utility (July 1 – June 30)
 *
 * - Q1 (1st Quarter): July – September
 * - Q2 (2nd Quarter): October – December
 * - Q3 (3rd Quarter): January – March
 * - Q4 (4th Quarter): April – June
 * - Fiscal Year Label: FY YYYY–YY (e.g. Nov 2026 -> FY 2026–27)
 */

export interface FiscalQuarterInfo {
  quarter: 1 | 2 | 3 | 4;
  fyStartYear: number;
  fyEndYear: number;
  fyLabel: string;
  quarterLabel: string;
  shortRange: string;
  fullLabel: string;
  startDate: string;
  endDate: string;
}

export interface FiscalYearInfo {
  fyStartYear: number;
  fyEndYear: number;
  fyLabel: string;
  shortRange: string;
  fullLabel: string;
  startDate: string;
  endDate: string;
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pad2 = (n: number): string => String(n).padStart(2, '0');

export const toIsoYmd = (d: Date): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function getFiscalYearStartYear(year: number, month1Based: number): number {
  return month1Based >= 7 ? year : year - 1;
}

export function formatFiscalYearLabel(fyStartYear: number): string {
  return `FY ${fyStartYear}–${pad2((fyStartYear + 1) % 100)}`;
}

export function getFiscalQuarterNumber(month1Based: number): 1 | 2 | 3 | 4 {
  if (month1Based >= 7 && month1Based <= 9) return 1;
  if (month1Based >= 10 && month1Based <= 12) return 2;
  if (month1Based >= 1 && month1Based <= 3) return 3;
  return 4;
}

export function getFiscalQuarterInfoFromParts(
  year: number,
  month1Based: number,
): FiscalQuarterInfo {
  const fyStartYear = getFiscalYearStartYear(year, month1Based);
  const fyEndYear = fyStartYear + 1;
  const fyLabel = formatFiscalYearLabel(fyStartYear);
  const quarter = getFiscalQuarterNumber(month1Based);

  const calYear = month1Based >= 7 ? fyStartYear : fyEndYear;
  const startMonth1 =
    quarter === 1 ? 7 : quarter === 2 ? 10 : quarter === 3 ? 1 : 4;
  const endMonth1 = startMonth1 + 2;
  const startDt = new Date(calYear, startMonth1 - 1, 1);
  const endDt = new Date(calYear, endMonth1, 0);

  const shortRange = `${SHORT_MONTHS[startMonth1 - 1]} – ${SHORT_MONTHS[endMonth1 - 1]} ${calYear}`;
  const quarterLabel = `Q${quarter} ${fyLabel}`;
  const fullLabel = `${quarterLabel} (${shortRange})`;

  return {
    quarter,
    fyStartYear,
    fyEndYear,
    fyLabel,
    quarterLabel,
    shortRange,
    fullLabel,
    startDate: toIsoYmd(startDt),
    endDate: toIsoYmd(endDt),
  };
}

export function getFiscalQuarterInfo(date: Date = new Date()): FiscalQuarterInfo {
  return getFiscalQuarterInfoFromParts(date.getFullYear(), date.getMonth() + 1);
}

export function getPreviousFiscalQuarterInfo(date: Date = new Date()): FiscalQuarterInfo {
  const cur = getFiscalQuarterInfo(date);
  if (cur.quarter === 1) {
    return getFiscalQuarterInfoFromParts(cur.fyStartYear, 4);
  }
  const prevCalYear = cur.quarter === 2 ? cur.fyStartYear : cur.fyEndYear;
  const prevMonth1 = cur.quarter === 2 ? 7 : cur.quarter === 3 ? 10 : 1;
  return getFiscalQuarterInfoFromParts(prevCalYear, prevMonth1);
}

export function getFiscalQuarterFromIso(iso?: string | null): FiscalQuarterInfo | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return getFiscalQuarterInfoFromParts(parseInt(m[1], 10), parseInt(m[2], 10));
}

export function getFiscalYearInfo(fyStartYear: number): FiscalYearInfo {
  const fyEndYear = fyStartYear + 1;
  const fyLabel = formatFiscalYearLabel(fyStartYear);
  const shortRange = `Jul ${fyStartYear} – Jun ${fyEndYear}`;
  return {
    fyStartYear,
    fyEndYear,
    fyLabel,
    shortRange,
    fullLabel: `${fyLabel} · ${shortRange}`,
    startDate: `${fyStartYear}-07-01`,
    endDate: `${fyEndYear}-06-30`,
  };
}

export function getCurrentFiscalYearInfo(date: Date = new Date()): FiscalYearInfo {
  return getFiscalYearInfo(getFiscalYearStartYear(date.getFullYear(), date.getMonth() + 1));
}

export function getPreviousFiscalYearInfo(date: Date = new Date()): FiscalYearInfo {
  return getFiscalYearInfo(getFiscalYearStartYear(date.getFullYear(), date.getMonth() + 1) - 1);
}

export function getFiscalYearFromIso(iso?: string | null): FiscalYearInfo | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return getFiscalYearInfo(getFiscalYearStartYear(parseInt(m[1], 10), parseInt(m[2], 10)));
}
