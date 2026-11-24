import dayjs from 'dayjs';
import { formatPkr, resolveFiscalPresetRange } from './financeHelpers';

describe('financeHelpers', () => {
  it('formats PKR currency amounts cleanly without negative zero or USD symbol', () => {
    expect(formatPkr(4248000)).toBe('Rs 4,248,000');
    expect(formatPkr(-1250.5)).toBe('(Rs 1,250.50)');
    expect(formatPkr(0)).toBe('Rs 0');
    expect(formatPkr(null)).toBe('Rs 0');
  });

  it('resolves Pakistani July–June Fiscal Year & Quarter presets accurately', () => {
    const refNov = dayjs('2026-11-24');
    const fy = resolveFiscalPresetRange('CURRENT_FY', refNov);
    expect(fy?.[0].format('YYYY-MM-DD')).toBe('2026-07-01');
    expect(fy?.[1].format('YYYY-MM-DD')).toBe('2027-06-30');

    const q1 = resolveFiscalPresetRange('Q1', refNov);
    expect(q1?.[0].format('YYYY-MM-DD')).toBe('2026-07-01');
    expect(q1?.[1].format('YYYY-MM-DD')).toBe('2026-09-30');

    const q2 = resolveFiscalPresetRange('Q2', refNov);
    expect(q2?.[0].format('YYYY-MM-DD')).toBe('2026-10-01');
    expect(q2?.[1].format('YYYY-MM-DD')).toBe('2026-12-31');

    const q3Feb = resolveFiscalPresetRange('CURRENT_FY', dayjs('2027-02-15'));
    expect(q3Feb?.[0].format('YYYY-MM-DD')).toBe('2026-07-01');
    expect(q3Feb?.[1].format('YYYY-MM-DD')).toBe('2027-06-30');

    expect(resolveFiscalPresetRange('ALL', refNov)).toBeNull();
  });
});
