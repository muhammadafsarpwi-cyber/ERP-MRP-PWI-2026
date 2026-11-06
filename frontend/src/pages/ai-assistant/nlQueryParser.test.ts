import { parseNaturalLanguageQuery, normalizeUrduDateText } from './nlQueryParser';
import { detectExportCommand, buildAiReportWhatsAppText } from './aiReportExporter';

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

  it('detects standalone PDF, Excel, and WhatsApp export commands in Urdu and English', () => {
    expect(detectExportCommand('اس کو پی ڈی ایف میں بنا دے')).toEqual({
      format: 'pdf',
      isStandaloneFollowUp: true,
    });
    expect(detectExportCommand('اس کو ایکسل میں بنا دو')).toEqual({
      format: 'excel',
      isStandaloneFollowUp: true,
    });
    expect(detectExportCommand('واٹس ایپ کی طرح بنا دو')).toEqual({
      format: 'whatsapp',
      isStandaloneFollowUp: true,
    });
    expect(detectExportCommand('5 نومبر کی مشین وائز رپورٹ واٹس ایپ میں بنا دو')).toEqual({
      format: 'whatsapp',
      isStandaloneFollowUp: false,
    });
  });

  it('formats granular daily machine report into executive WhatsApp text with item-wise summary', () => {
    const wa = buildAiReportWhatsAppText({
      id: 'm1',
      text: 'Summary',
      reportTitle: 'Machine-Wise & Item-Wise Production Report — 05-Nov-2026',
      divisionScope: 'DIV-SPD',
      departmentScope: 'Spoke',
      periodLabel: '05-Nov-2026',
      tableData: {
        columns: [],
        rows: [
          {
            id: '1',
            categoryGroup: 'Spoke Division — Spoke Heading & Threading',
            machine: 'SPK-01',
            itemCode: 'WIP-SPK-001',
            itemName: '250X17 Inner Butted',
            uom: 'PCS',
            runtimeDynamicTarget: 34560,
            actualProduction: 28001,
          },
          {
            id: '2',
            categoryGroup: 'Spoke Division — Spoke Heading & Threading',
            machine: 'SPK-02',
            itemCode: 'WIP-SPK-001',
            itemName: '250X17 Inner Butted',
            uom: 'PCS',
            runtimeDynamicTarget: 34560,
            actualProduction: 28500,
          },
        ],
      },
    });

    expect(wa).toContain('PAKISTAN WIRE INDUSTRIES (PVT.) LTD');
    expect(wa).toContain('*SPK-01* [✅ Entered]');
    expect(wa).toContain('*Actual:* 28,001 PCS');
    expect(wa).toContain('*ITEM-WISE TOTAL SUMMARY:*');
    expect(wa).toContain('*250X17 Inner Butted:* *56,501 PCS*');
  });

  it('parses specific item production queries in Urdu and English', () => {
    const q1 = parseNaturalLanguageQuery('یہ آئٹم 250X17 پروڈکشن میں کتنا بن چکا ہے؟', 'DIV-SPD', 'ALL');
    expect(q1.dimension).toBe('item');
    expect(q1.specificItem).toBe('250X17');

    const q2 = parseNaturalLanguageQuery('SPI-FG-SPK-007 پانچ تاریخ کو کتنا بنا؟', 'DIV-SPD', 'ALL');
    expect(q2.dimension).toBe('item');
    expect(q2.specificItem).toBe('SPI-FG-SPK-007');
    expect(q2.period.type).toBe('specific_date');
    expect(q2.period.dayOfMonth).toBe(5);

    const q3 = parseNaturalLanguageQuery('یہ آئٹم 250 ضرب 17 کتنا بنا؟', 'DIV-SPD', 'ALL');
    expect(q3.dimension).toBe('item');
    expect(q3.specificItem).toBe('250X17');
  });

  it('parses rejection and scrap queries across departments and months', () => {
    const r1 = parseNaturalLanguageQuery(
      'اس منتھ میں اس کوک ڈویژن میں سپورٹ ڈیپارٹمنٹ میں کتنی ریجیکشن ہوئی ہے؟',
      'DIV-CCD',
      'ALL',
    );
    expect(r1.dimension).toBe('rejection');
    expect(r1.divisionCode).toBe('DIV-SPD');
    expect(r1.departmentCode).toBe('Spoke');
    expect(r1.period.type).toBe('this_month');

    const r2 = parseNaturalLanguageQuery('سویجنگ ڈیپارٹمنٹ میں کتنی ریجیکشن ہوئی ہے؟', 'DIV-SPD', 'ALL');
    expect(r2.dimension).toBe('rejection');
    expect(r2.departmentCode).toBe('Swagging');

    const r3 = parseNaturalLanguageQuery('پریویس منتھ کی ریجیکشن بتائیں', 'DIV-SPD', 'ALL');
    expect(r3.dimension).toBe('rejection');
    expect(r3.period.type).toBe('specific_month');
  });

  it('parses downtime queries for previous month and specific machine numbers', () => {
    const d1 = parseNaturalLanguageQuery('پریویس منتھ کا ڈاؤن ٹائم', 'DIV-SPD', 'ALL');
    expect(d1.dimension).toBe('downtime');
    expect(d1.period.type).toBe('specific_month');

    const d2 = parseNaturalLanguageQuery('پانچ امر مشین کا ڈونٹ', 'DIV-SPD', 'Swagging');
    expect(d2.dimension).toBe('downtime');
    expect(d2.specificMachine).toBe('SW-05');
  });
});


