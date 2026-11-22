import {
  getCurrentFiscalYearInfo,
  getFiscalQuarterInfo,
  getFiscalQuarterInfoFromParts,
  getPreviousFiscalQuarterInfo,
  getPreviousFiscalYearInfo,
} from './fiscal-year.util';

describe('Pakistani Fiscal Year & Quarter Utility (Jul 1 - Jun 30)', () => {
  it('maps Nov 2026 to Q2 FY 2026–27 (Oct – Dec 2026) and previous quarter to Q1 FY 2026–27 (Jul – Sep 2026)', () => {
    const nov2026 = new Date(2026, 10, 22);
    const curQ = getFiscalQuarterInfo(nov2026);
    expect(curQ.quarter).toBe(2);
    expect(curQ.fyLabel).toBe('FY 2026–27');
    expect(curQ.startDate).toBe('2026-10-01');
    expect(curQ.endDate).toBe('2026-12-31');
    expect(curQ.fullLabel).toBe('Q2 FY 2026–27 (Oct – Dec 2026)');

    const prevQ = getPreviousFiscalQuarterInfo(nov2026);
    expect(prevQ.quarter).toBe(1);
    expect(prevQ.startDate).toBe('2026-07-01');
    expect(prevQ.endDate).toBe('2026-09-30');
    expect(prevQ.fullLabel).toBe('Q1 FY 2026–27 (Jul – Sep 2026)');
  });

  it('handles Jan-Jun months inside the FY ending Jun 30 (Q3 Jan-Mar, Q4 Apr-Jun)', () => {
    const q3 = getFiscalQuarterInfoFromParts(2027, 2);
    expect(q3.quarter).toBe(3);
    expect(q3.fyLabel).toBe('FY 2026–27');
    expect(q3.startDate).toBe('2027-01-01');
    expect(q3.endDate).toBe('2027-03-31');

    const q4 = getFiscalQuarterInfoFromParts(2027, 5);
    expect(q4.quarter).toBe(4);
    expect(q4.fyLabel).toBe('FY 2026–27');
    expect(q4.startDate).toBe('2027-04-01');
    expect(q4.endDate).toBe('2027-06-30');

    const fy = getCurrentFiscalYearInfo(new Date(2026, 10, 22));
    expect(fy.startDate).toBe('2026-07-01');
    expect(fy.endDate).toBe('2027-06-30');
    expect(fy.fullLabel).toBe('FY 2026–27 · Jul 2026 – Jun 2027');

    const prevFy = getPreviousFiscalYearInfo(new Date(2026, 10, 22));
    expect(prevFy.startDate).toBe('2025-07-01');
    expect(prevFy.endDate).toBe('2026-06-30');
    expect(prevFy.fullLabel).toBe('FY 2025–26 · Jul 2025 – Jun 2026');
  });
});
