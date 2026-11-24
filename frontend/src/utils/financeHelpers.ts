import dayjs, { Dayjs } from 'dayjs';

export type FiscalPresetKey =
  | 'ALL'
  | 'CURRENT_FY'
  | 'Q1'
  | 'Q2'
  | 'Q3'
  | 'Q4'
  | 'THIS_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'CUSTOM';

export const FISCAL_PRESETS: Array<{ value: FiscalPresetKey; label: string }> = [
  { value: 'ALL', label: 'All Dates (FY Cumulative)' },
  { value: 'THIS_WEEK', label: 'This Week (Last 7 Days)' },
  { value: 'THIS_MONTH', label: 'This Month' },
  { value: 'LAST_MONTH', label: 'Last Month' },
  { value: 'CURRENT_FY', label: 'Current FY 2026–27 (Jul–Jun)' },
  { value: 'Q1', label: 'Q1 FY27 (Jul–Sep 2026)' },
  { value: 'Q2', label: 'Q2 FY27 (Oct–Dec 2026)' },
  { value: 'Q3', label: 'Q3 FY27 (Jan–Mar 2027)' },
  { value: 'Q4', label: 'Q4 FY27 (Apr–Jun 2027)' },
  { value: 'CUSTOM', label: 'Custom Range' },
];

/**
 * Resolve Pakistani July–June fiscal year or monthly date range presets.
 * Reference date can be injected for deterministic unit testing.
 */
export function resolveFiscalPresetRange(
  preset: FiscalPresetKey,
  refDate: Dayjs = dayjs(),
): [Dayjs, Dayjs] | null {
  // Determine active Pakistani Jul-Jun fiscal year start year (e.g. Nov 2026 -> 2026, Feb 2027 -> 2026)
  const fyStartYear = refDate.month() >= 6 ? refDate.year() : refDate.year() - 1;

  switch (preset) {
    case 'ALL':
      return null;
    case 'CURRENT_FY':
      return [dayjs(`${fyStartYear}-07-01`), dayjs(`${fyStartYear + 1}-06-30`)];
    case 'Q1':
      return [dayjs(`${fyStartYear}-07-01`), dayjs(`${fyStartYear}-09-30`)];
    case 'Q2':
      return [dayjs(`${fyStartYear}-10-01`), dayjs(`${fyStartYear}-12-31`)];
    case 'Q3':
      return [dayjs(`${fyStartYear + 1}-01-01`), dayjs(`${fyStartYear + 1}-03-31`)];
    case 'Q4':
      return [dayjs(`${fyStartYear + 1}-04-01`), dayjs(`${fyStartYear + 1}-06-30`)];
    case 'THIS_WEEK':
      return [refDate.subtract(6, 'day').startOf('day'), refDate.endOf('day')];
    case 'THIS_MONTH':
      return [refDate.startOf('month'), refDate.endOf('month')];
    case 'LAST_MONTH': {
      const prev = refDate.subtract(1, 'month');
      return [prev.startOf('month'), prev.endOf('month')];
    }
    case 'CUSTOM':
    default:
      return null;
  }
}

export function formatPkr(value: unknown, decimals = 2): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 'Rs 0';
  const abs = Math.abs(num);
  const formatted = abs.toLocaleString('en-PK', {
    minimumFractionDigits: Number.isInteger(abs) ? 0 : decimals,
    maximumFractionDigits: decimals,
  });
  return num < 0 ? `(Rs ${formatted})` : `Rs ${formatted}`;
}

export function formatPkrPlain(value: unknown, decimals = 2): string {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  const formatted = num.toLocaleString('en-PK', {
    minimumFractionDigits: Number.isInteger(num) ? 0 : decimals,
    maximumFractionDigits: decimals,
  });
  return formatted === '-0' ? '0' : formatted;
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
): void {
  const escapeCell = (val: string | number | null | undefined) => {
    const s = val === null || val === undefined ? '' : String(val);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
