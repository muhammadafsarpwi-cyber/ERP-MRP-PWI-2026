import dayjs from 'dayjs';
import {
  parseNaturalLanguageQuery,
  normalizeUrduDateText,
  canonicalizeDivisionCode,
  extractSpecificCustomer,
} from './nlQueryParser';
import { detectExportCommand, buildAiReportWhatsAppText } from './aiReportExporter';
import {
  aggregateLastEntryByDepartment,
  matchesEntryDivision,
  isStoreOrWarehouseDepartment,
  buildCustomerSpecificDispatchReport,
  aggregateRawMaterialReceiving,
  aggregateRawMaterialStock,
} from './reportGenerator';
import { renderRichText } from './AiAnswerCard';

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

  it('routes "When was the last entry made" under DIV-002-CCD to last_entry without falling back to machine performance', () => {
    const intent = parseNaturalLanguageQuery('When was the last entry made', 'DIV-002-CCD', 'ALL');
    expect(intent.dimension).toBe('last_entry');
    expect(intent.divisionCode).toBe('DIV-002-CCD');
    expect(canonicalizeDivisionCode(intent.divisionCode)).toBe('DIV-CCD');
    expect(intent.period.type).toBe('all');
  });

  it('strictly excludes Spoke Division (SPK-01..04) entries from Control Cable Division (DIV-002-CCD) and builds Last Entry columns cleanly', () => {
    const ccdDivision = {
      id: 'd1000000-0000-0000-0000-000000000002',
      code: 'DIV-002-CCD',
      name: 'Control Cable Division',
      uom: 'MTR / KG',
      color: '#10b981',
    };

    const mixedEntries = [
      // Spoke division leakage candidates — MUST be rejected by matchesEntryDivision
      {
        id: 'spk-1',
        divisionId: 'd1000000-0000-0000-0000-000000000001',
        divisionCode: 'DIV-001-SPD',
        machineNo: 'SPK-01',
        entryDate: '2026-11-21',
        entryNumber: 'PE-2026-09999',
        itemName: 'Spoke 250X17',
        actualQuantity: 28000,
        uomCode: 'PCS',
      },
      {
        id: 'spk-2',
        divisionId: '',
        machineNo: 'SPK-04',
        entryDate: '2026-11-21',
        entryNumber: 'PE-2026-09998',
        itemName: 'Spoke 300X18',
        actualQuantity: 19500,
        uomCode: 'PCS',
      },
      // Control Cable entries — MUST be retained and ranked by latest entryDate
      {
        id: 'ccd-1',
        divisionId: 'd1000000-0000-0000-0000-000000000002',
        divisionCode: 'DIV-002-CCD',
        machineNo: 'FT-01',
        department: { id: 'dept-ft', name: 'Flattening' },
        entryDate: '2026-11-17',
        entryNumber: 'PE-2026-03010',
        itemName: 'Flat Strip 2.5mm',
        actualQuantity: 900,
        uomCode: 'MTR',
      },
      {
        id: 'ccd-2',
        divisionId: 'd1000000-0000-0000-0000-000000000002',
        divisionCode: 'DIV-002-CCD',
        machineNo: 'FT-02',
        department: { id: 'dept-ft', name: 'Flattening' },
        entryDate: '2026-11-19',
        entryNumber: 'PE-2026-03051',
        itemName: 'Flat Strip 3.0mm',
        actualQuantity: 1250,
        uomCode: 'MTR',
      },
    ];

    expect(matchesEntryDivision(mixedEntries[0], ccdDivision)).toBe(false);
    expect(matchesEntryDivision(mixedEntries[1], ccdDivision)).toBe(false);
    expect(matchesEntryDivision(mixedEntries[3], ccdDivision)).toBe(true);

    const intent = parseNaturalLanguageQuery('When was the last entry made', 'DIV-002-CCD', 'ALL');
    const ccdDepartments = [
      { id: 'dept-ft', code: 'Flattening', name: 'Flattening' },
      { id: 'dept-sp', code: 'Spiral', name: 'Spiral' },
      { id: 'dept-pv', code: 'PVC', name: 'PVC' },
    ];

    const report = aggregateLastEntryByDepartment(
      mixedEntries,
      ccdDivision,
      'ALL',
      intent,
      false,
      ccdDepartments,
      dayjs('2026-11-21'),
    );

    expect(report.title).toContain('Last Production Entry');
    expect(report.tableData?.columns.map((c) => c.title)).toEqual([
      'DEPARTMENT / SECTION',
      'LAST ENTRY DATE',
      'LAST ENTRY #',
      'LAST ITEM & QTY',
      'STATUS / RECENCY',
    ]);

    const rows = report.tableData?.rows || [];
    // Never leaks Spoke / SPK rows
    expect(rows.some((r) => /spoke|spk/i.test(String(r.department) + String(r.lastItemQty)))).toBe(false);

    const flatteningRow = rows.find((r) => r.department === 'Flattening');
    expect(flatteningRow).toMatchObject({
      lastEntryDate: '2026-11-19',
      lastEntryNo: 'PE-2026-03051',
      statusRecency: '2 days ago',
    });
    expect(flatteningRow?.lastItemQty).toContain('Flat Strip 3.0mm');
    expect(flatteningRow?.lastItemQty).toContain('1,250');

    const spiralRow = rows.find((r) => r.department === 'Spiral');
    expect(spiralRow).toMatchObject({
      lastEntryDate: 'No entries recorded',
      lastEntryNo: '—',
      statusRecency: 'Inactive',
    });

    // Live DB code aliases & recent entry wording
    expect(canonicalizeDivisionCode('DIV-001-SPI')).toBe('DIV-SPD');
    expect(canonicalizeDivisionCode('DIV-004-MDE51')).toBe('DIV-PWI');
    expect(parseNaturalLanguageQuery('Show recent entry', 'DIV-002-CCD', 'ALL').dimension).toBe('last_entry');

    // Exact department ID matching avoids 'Packing' colliding into 'Cutting & Packing'
    const ccdWithBothPacking = [
      { id: '5676c09a-f334-43a8-8309-f43d99e01320', code: 'Cutting & Packing', name: 'Cutting & Packing' },
      { id: 'd3000000-0000-0000-0000-000000000013', code: 'Packing', name: 'Packing' },
    ];
    const packingEntry = [
      {
        id: 'ccd-pk-1',
        divisionId: 'd1000000-0000-0000-0000-000000000002',
        divisionCode: 'DIV-002-CCD',
        departmentId: 'd3000000-0000-0000-0000-000000000013',
        department: { id: 'd3000000-0000-0000-0000-000000000013', name: 'Packing' },
        machineNo: 'CPK-01',
        entryDate: '2026-11-02',
        entryNumber: 'PE-2026-02100',
        itemName: 'Control Cable Coil',
        actualQuantity: 500,
        uomCode: 'MTR',
      },
    ];
    const sepReport = aggregateLastEntryByDepartment(
      packingEntry,
      ccdDivision,
      'ALL',
      intent,
      false,
      ccdWithBothPacking,
      dayjs('2026-11-21'),
    );
    const sepRows = sepReport.tableData?.rows || [];
    expect(sepRows.find((r) => r.department === 'Packing')?.lastEntryDate).toBe('2026-11-02');
    expect(sepRows.find((r) => r.department === 'Cutting & Packing')?.lastEntryDate).toBe('No entries recorded');

    // Store / warehouse departments are excluded from production activity reports
    expect(isStoreOrWarehouseDepartment('Raw Material (RM)', 'SPI-DEPT112')).toBe(true);
    expect(isStoreOrWarehouseDepartment('SPI General Store', 'SPI-GS-001')).toBe(true);
    expect(isStoreOrWarehouseDepartment('CCD Stores', 'CCD-DEPT111')).toBe(true);
    expect(isStoreOrWarehouseDepartment('Warehouse', 'DEPT-007')).toBe(true);
    expect(isStoreOrWarehouseDepartment('Finished Goods Store', 'WRD-FG')).toBe(true);
    expect(isStoreOrWarehouseDepartment('Anything', 'X', 'STORE')).toBe(true);
    ['Flattening', 'Spiral', 'PVC', 'Packing', 'Cutting & Packing', 'Spoke Packing', 'Nipple Packing'].forEach((n) =>
      expect(isStoreOrWarehouseDepartment(n, 'CCD-DEPT001')).toBe(false),
    );

    const spdDivision = {
      id: 'd1000000-0000-0000-0000-000000000001',
      code: 'DIV-001-SPI',
      name: 'Spoke Division',
      uom: 'PCS',
      color: '#06b6d4',
    };
    const storeReport = aggregateLastEntryByDepartment(
      [],
      spdDivision,
      'ALL',
      intent,
      false,
      [
        { id: 'a', code: 'Spoke', name: 'Spoke' },
        { id: 'b', code: 'Raw Material (RM)', name: 'Raw Material (RM)' },
        { id: 'c', code: 'SPI General Store', name: 'SPI General Store' },
      ],
      dayjs('2026-11-21'),
    );
    expect((storeReport.tableData?.rows || []).map((r) => r.department)).toEqual(['Spoke']);
  });

  it('extracts customer names for dispatch queries and builds a Crown-only item-wise dispatch & pending order report', () => {
    const crownIntent = parseNaturalLanguageQuery(
      'How much material was dispatched to Crown this month?',
      'DIV-001-SPI',
      'ALL',
    );
    expect(crownIntent.dimension).toBe('customer');
    expect(crownIntent.specificCustomer).toBe('Crown');

    expect(extractSpecificCustomer('Show pending orders for Ali Shah Autos')).toBe('Ali Shah Autos');
    expect(extractSpecificCustomer('CUS-CFP-001 dispatch report')).toBe('CUS-CFP-001');
    // Generic customer-wise ask must not lock to a single customer
    expect(extractSpecificCustomer('Show customer-wise dispatch this month')).toBeUndefined();

    const rawOrders = [
      {
        id: 'so-crown-1',
        orderNumber: 'SOC-2026-05819',
        orderDate: '2026-10-21',
        status: 'Processing',
        customerId: 'edf23ab3-521a-4781-9687-cbf45a7fe040',
        customer: { id: 'edf23ab3-521a-4781-9687-cbf45a7fe040', name: 'CROWN FIT PAKISTAN', customerCode: 'CUS-CFP-001' },
        items: [
          {
            itemId: 'item-8',
            quantity: 1000,
            shippedQuantity: 1000,
            item: { id: 'item-8', itemCode: 'SPI-FG-SPK-008', name: '125-300X17 Inn / Out Spoke Butted', packagingSize: 10 },
          },
          {
            itemId: 'item-6',
            quantity: 5000,
            shippedQuantity: 1500,
            item: { id: 'item-6', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight', packagingSize: 10 },
          },
          {
            itemId: 'item-3',
            quantity: 200,
            shippedQuantity: 0,
            item: { id: 'item-3', itemCode: 'SPI-FG-SPK-003', name: '250X18 Inn / Out Spoke Butted', packagingSize: 10 },
          },
        ],
      },
      {
        id: 'so-other-1',
        orderNumber: 'SOC-2026-09999',
        orderDate: '2026-11-10',
        status: 'Processing',
        customerId: 'other-cust-1',
        customer: { id: 'other-cust-1', name: 'ALI SHAH AUTOS', customerCode: 'CUS-ASA-001' },
        items: [
          {
            itemId: 'item-9',
            quantity: 9000,
            shippedQuantity: 4000,
            item: { id: 'item-9', itemCode: 'SPI-FG-SPK-099', name: 'Unrelated Item', packagingSize: 10 },
          },
        ],
      },
    ];

    const rawDeliveries = [
      {
        id: 'del-crown-1',
        deliveryNumber: 'DN-2026-00033',
        deliveryDate: '2026-11-13',
        status: 'CONFIRMED',
        salesOrderId: 'so-crown-1',
        salesOrder: { id: 'so-crown-1', orderNumber: 'SOC-2026-05819' },
        customerId: 'edf23ab3-521a-4781-9687-cbf45a7fe040',
        customer: { id: 'edf23ab3-521a-4781-9687-cbf45a7fe040', name: 'CROWN FIT PAKISTAN', customerCode: 'CUS-CFP-001' },
        lines: [
          {
            itemId: 'item-8',
            quantity: 1000,
            item: { id: 'item-8', itemCode: 'SPI-FG-SPK-008', name: '125-300X17 Inn / Out Spoke Butted', packagingSize: 10 },
            description: '125-300X17 Inn / Out Spoke Butted (100 Carton × 10 GRS) [SOC: SOC-2026-05819]',
          },
          {
            itemId: 'item-6',
            quantity: 500,
            item: { id: 'item-6', itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Inn / Out Spoke Straight', packagingSize: 10 },
            description: '300X17 S9 Inn / Out Spoke Straight (50 Carton × 10 GRS) [SOC: SOC-2026-05819]',
          },
        ],
      },
      {
        id: 'del-other-1',
        deliveryNumber: 'DN-2026-09999',
        deliveryDate: '2026-11-14',
        status: 'CONFIRMED',
        customerId: 'other-cust-1',
        customer: { id: 'other-cust-1', name: 'ALI SHAH AUTOS', customerCode: 'CUS-ASA-001' },
        lines: [{ itemId: 'item-9', quantity: 4000, item: { itemCode: 'SPI-FG-SPK-099', name: 'Unrelated Item' } }],
      },
    ];

    const report = buildCustomerSpecificDispatchReport({
      intent: {
        ...crownIntent,
        period: { type: 'this_month', label: 'November 2026', startDate: '2026-11-01', endDate: '2026-11-30' },
      },
      division: { id: 'd1000000-0000-0000-0000-000000000001', code: 'DIV-001-SPI', name: 'Spoke Division', uom: 'PCS', color: '#06b6d4' },
      isDark: false,
      matchedCustomers: [{ id: 'edf23ab3-521a-4781-9687-cbf45a7fe040', name: 'CROWN FIT PAKISTAN', code: 'CUS-CFP-001' }],
      rawOrders,
      rawDeliveries,
    });

    expect(report.title).toContain('CROWN FIT PAKISTAN');
    expect(report.title).toContain('CUS-CFP-001');
    expect(report.summaryText).not.toContain('ALI SHAH AUTOS');
    expect(report.tableData?.columns.map((c) => c.title)).toEqual([
      'DATE / DOC #',
      'ITEM CODE & NAME',
      'ORDERED (GROSS / CTN)',
      'DISPATCHED (GROSS / CTN)',
      'PENDING BALANCE (GROSS / CTN)',
    ]);

    const rows = report.tableData?.rows || [];
    expect(rows.some((r) => String(r.itemCode).includes('099'))).toBe(false);
    expect(rows.find((r) => r.itemCode === 'SPI-FG-SPK-008')).toMatchObject({
      docNumber: 'DN-2026-00033',
      orderedGross: 1000,
      dispatchedGross: 1000,
      pendingGross: 0,
    });
    expect(rows.find((r) => r.itemCode === 'SPI-FG-SPK-006')).toMatchObject({
      docNumber: 'DN-2026-00033',
      orderedGross: 5000,
      dispatchedGross: 500,
      pendingGross: 3500,
    });
    expect(rows.find((r) => r.itemCode === 'SPI-FG-SPK-003')).toMatchObject({
      docNumber: 'SOC-2026-05819',
      orderedGross: 200,
      dispatchedGross: 0,
      pendingGross: 200,
    });
    expect(rows.find((r) => r.isGrandTotal)).toMatchObject({
      orderedGross: 6200,
      dispatchedGross: 1500,
      pendingGross: 3700,
    });

    // Verify markdown bold & code renderer produces clean React nodes without raw ** or `
    const rendered = JSON.stringify(renderRichText('• **#1 CROWN FIT PAKISTAN** (`CUS-CFP-001`)'));
    expect(rendered).toContain('"type":"strong"');
    expect(rendered).toContain('"type":"code"');
    expect(rendered).not.toContain('**');
  });

  it('routes raw material receiving & RM stock queries ahead of generic item-wise production and scopes strictly by division', () => {
    const rmRecvIntent = parseNaturalLanguageQuery(
      'Show item-wise raw material received this month in this division',
      'DIV-001-SPI',
      'ALL',
    );
    expect(rmRecvIntent.dimension).toBe('raw_material_receiving');

    const rmStockIntent = parseNaturalLanguageQuery(
      'Show current raw material stock balance item-wise',
      'DIV-001-SPI',
      'ALL',
    );
    expect(rmStockIntent.dimension).toBe('raw_material_stock');
    expect(rmStockIntent.period.type).toBe('all');

    const spokeDiv = {
      id: 'd1000000-0000-0000-0000-000000000001',
      code: 'DIV-001-SPI',
      name: 'Spoke Division',
      uom: 'PCS',
      color: '#06b6d4',
    };

    const mockReceipts = [
      {
        id: 'rmr-1',
        receiptCode: 'RMR-00244',
        gatePassNo: '3562',
        receiptDate: '2026-11-19',
        status: 'CONFIRMED',
        divisionId: 'd1000000-0000-0000-0000-000000000001',
        lines: [
          {
            receivedQuantity: 5913.02,
            item: { itemCode: 'RM-WIRE-009', name: 'Steel Wire Coil 3.14 mm R' },
            uom: { code: 'KG' },
          },
        ],
      },
      {
        id: 'rmr-2',
        receiptCode: 'RMR-00243',
        gatePassNo: '3559',
        receiptDate: '2026-11-18',
        status: 'CONFIRMED',
        // Control Cable Division — MUST be excluded when Spoke Division is active
        divisionId: 'd1000000-0000-0000-0000-000000000002',
        lines: [
          {
            receivedQuantity: 5204,
            item: { itemCode: 'RM-WIRE-002', name: '1.45 mm-B4 Wire' },
            uom: { code: 'KG' },
          },
        ],
      },
    ];

    const recvReport = aggregateRawMaterialReceiving({
      receipts: mockReceipts,
      division: spokeDiv,
      intent: {
        ...rmRecvIntent,
        period: { type: 'this_month', label: 'November 2026', startDate: '2026-11-01', endDate: '2026-11-30' },
      },
      isDark: false,
    });

    expect(recvReport.title).toContain('Item-Wise Raw Material Receiving Report');
    expect(recvReport.tableData?.columns.map((c) => c.title)).toEqual([
      'ITEM CODE',
      'RAW MATERIAL ITEM NAME',
      'RECEIPTS / GATE PASSES',
      'TOTAL RECEIVED QTY / WEIGHT (KG)',
      'LAST RECEIVED DATE',
    ]);
    const recvRows = recvReport.tableData?.rows || [];
    expect(recvRows.some((r) => r.itemCode === 'RM-WIRE-002')).toBe(false);
    expect(recvRows.find((r) => r.itemCode === 'RM-WIRE-009')).toMatchObject({
      receiptsCount: 1,
      totalReceivedQty: 5913.02,
      lastReceivedDate: '2026-11-19',
    });

    const stockReport = aggregateRawMaterialStock({
      balances: [
        {
          item: { itemCode: 'RM-WIRE-012', name: 'Steel Wire Coil 3.45mm SR', itemType: 'RAW_MATERIAL' },
          warehouse: { name: 'SPI Raw Material Store', divisionId: 'd1000000-0000-0000-0000-000000000001' },
          uom: { code: 'KG' },
          onHand: 12400,
          reserved: 400,
          available: 12000,
        },
        {
          item: { itemCode: 'SPI-FG-SPK-006', name: 'Finished Spoke', itemType: 'FINISHED_GOOD' },
          warehouse: { name: 'SPI FG Store', divisionId: 'd1000000-0000-0000-0000-000000000001' },
          uom: { code: 'PCS' },
          onHand: 50000,
          reserved: 0,
          available: 50000,
        },
      ],
      division: spokeDiv,
      intent: rmStockIntent,
      isDark: false,
    });

    const stockRows = (stockReport.tableData?.rows || []).filter((r) => !r.isGrandTotal);
    expect(stockRows).toHaveLength(1);
    expect(stockRows[0]).toMatchObject({ itemCode: 'RM-WIRE-012', onHand: 12400, available: 12000 });

    // Open-ended / cross-module queries are flagged confidence='fallback' so active Gemini LLM handles them
    expect(parseNaturalLanguageQuery('Which supplier delivered the most wire?', 'DIV-001-SPI', 'ALL').confidence).toBe('fallback');
    expect(parseNaturalLanguageQuery('Compare tool cost per gross across machines', 'DIV-001-SPI', 'ALL').confidence).toBe('fallback');
    expect(rmRecvIntent.confidence).toBe('high');
  });
});


