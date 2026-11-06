import { parseNaturalLanguageQuery, normalizeUrduDateText } from './nlQueryParser';

describe('nlQueryParser — Date & Urdu/English Natural Language Resolution', () => {
  it('normalizes Urdu and Roman-Urdu day words before month names and تاریخ', () => {
    expect(normalizeUrduDateText('مجھے پانچ نومبر کی پروڈکشن کی رپورٹ چاہیے مشین وائز')).toContain('5 نومبر');
    expect(normalizeUrduDateText('پانچ تاریخ کی رپورٹ')).toContain('5 تاریخ');
    expect(normalizeUrduDateText('panch november machine wise report')).toContain('5 november');
    // Non-date number words like "ٹاپ پانچ کسٹمر" stay untouched
    expect(normalizeUrduDateText('ٹاپ پانچ کسٹمر')).toBe('ٹاپ پانچ کسٹمر');
  });

  it('resolves "Machine-wise Performance Report — 05 November 2026" to exact date 2026-11-05', () => {
    const intent = parseNaturalLanguageQuery(
      'Machine-wise Performance Report — 05 November 2026',
      'DIV-SPD',
      'Spoke',
    );
    expect(intent.period.type).toBe('specific_date');
    expect(intent.period.startDate).toBe('2026-11-05');
    expect(intent.period.endDate).toBe('2026-11-05');
    expect(intent.period.label).toBe('05-Nov-2026');
    expect(intent.dimension).toBe('daily_granular_ledger');
    expect(intent.divisionCode).toBe('DIV-SPD');
    expect(intent.departmentCode).toBe('Spoke');
  });

  it('resolves Urdu query "مجھے پانچ نومبر کی پروڈکشن کی رپورٹ چاہیے مشین وائز" to 2026-11-05', () => {
    const intent = parseNaturalLanguageQuery(
      'مجھے پانچ نومبر کی پروڈکشن کی رپورٹ چاہیے مشین وائز',
      'DIV-SPD',
      'Spoke',
    );
    expect(intent.period.type).toBe('specific_date');
    expect(intent.period.startDate).toBe('2026-11-05');
    expect(intent.period.endDate).toBe('2026-11-05');
    expect(intent.dimension).toBe('daily_granular_ledger');
  });

  it('resolves Urdu digit + month "5 نومبر کی مشین وائز رپورٹ" to 2026-11-05', () => {
    const intent = parseNaturalLanguageQuery(
      '5 نومبر کی مشین وائز رپورٹ',
      'DIV-SPD',
      'ALL',
    );
    expect(intent.period.type).toBe('specific_date');
    expect(intent.period.startDate).toBe('2026-11-05');
    expect(intent.dimension).toBe('daily_granular_ledger');
  });

  it('resolves DD-MM-YYYY ("05-11-2026") and DD-MMM-YYYY ("05-Nov-2026") to 2026-11-05', () => {
    const dmy = parseNaturalLanguageQuery('05-11-2026 machine report', 'DIV-SPD', 'Spoke');
    expect(dmy.period.type).toBe('specific_date');
    expect(dmy.period.startDate).toBe('2026-11-05');

    const dmmm = parseNaturalLanguageQuery('05-Nov-2026 machine report', 'DIV-SPD', 'Spoke');
    expect(dmmm.period.type).toBe('specific_date');
    expect(dmmm.period.startDate).toBe('2026-11-05');
  });

  it('resolves "5 تاریخ کی رپورٹ" and "5 کی مشین وائز رپورٹ" to dayOfMonth 5', () => {
    const tarikh = parseNaturalLanguageQuery('5 تاریخ کی رپورٹ', 'DIV-SPD', 'Spoke');
    expect(tarikh.period.type).toBe('specific_date');
    expect(tarikh.period.dayOfMonth).toBe(5);

    const kiReport = parseNaturalLanguageQuery('مجھے 5 کی مشین وائز رپورٹ چاہیے', 'DIV-SPD', 'Spoke');
    expect(kiReport.period.type).toBe('specific_date');
    expect(kiReport.period.dayOfMonth).toBe(5);
  });

  it('does not confuse "ٹاپ پانچ کسٹمر" or "مشین 5 کی رپورٹ" with day 5 of the month', () => {
    const topCust = parseNaturalLanguageQuery('ٹاپ پانچ کسٹمر', 'DIV-SPD', 'ALL');
    expect(topCust.dimension).toBe('customer');
    expect(topCust.limit).toBe(5);
    expect(topCust.period.type).not.toBe('specific_date');

    const mach5 = parseNaturalLanguageQuery('مشین 5 کی رپورٹ', 'DIV-SPD', 'ALL');
    expect(mach5.specificMachine).toBe('M-05');
    expect(mach5.period.type).not.toBe('specific_date');
  });
});

