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

export function toIsoYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Pakistani Fiscal Year starts July 1 (`monthIndex0 >= 6`) and ends June 30.
 */
export function getFiscalYearStartYear(year: number, month1Based: number): number {
  return month1Based >= 7 ? year : year - 1;
}

export function formatFiscalYearLabel(fyStartYear: number): string {
  const shortNext = pad2((fyStartYear + 1) % 100);
  return `FY ${fyStartYear}–${shortNext}`;
}

/**
 * Q1: Jul–Sep, Q2: Oct–Dec, Q3: Jan–Mar, Q4: Apr–Jun
 */
export function getFiscalQuarterNumber(month1Based: number): 1 | 2 | 3 | 4 {
  if (month1Based >= 7 && month1Based <= 9) return 1;
  if (month1Based >= 10 && month1Based <= 12) return 2;
  if (month1Based >= 1 && month1Based <= 3) return 3;
  return 4;
}

export function getFiscalQuarterInfoFromParts(year: number, month1Based: number): FiscalQuarterInfo {
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
    return getFiscalQuarterInfoFromParts(cur.fyStartYear, 4); // Apr-Jun of same calendar year = Q4 of prior FY
  }
  const prevCalYear = cur.quarter === 2 ? cur.fyStartYear : cur.fyEndYear;
  const prevMonth1 = cur.quarter === 2 ? 7 : cur.quarter === 3 ? 10 : 1;
  return getFiscalQuarterInfoFromParts(prevCalYear, prevMonth1);
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
  const fyStartYear = getFiscalYearStartYear(date.getFullYear(), date.getMonth() + 1);
  return getFiscalYearInfo(fyStartYear);
}

export function getPreviousFiscalYearInfo(date: Date = new Date()): FiscalYearInfo {
  const fyStartYear = getFiscalYearStartYear(date.getFullYear(), date.getMonth() + 1);
  return getFiscalYearInfo(fyStartYear - 1);
}
