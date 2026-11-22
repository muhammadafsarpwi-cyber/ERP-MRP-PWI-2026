import { buildOrderCommandOverview } from './sales-order-command.util';

describe('buildOrderCommandOverview', () => {
  const DIV_SPK = 'div-spoke';
  const DIV_CCD = 'div-ccd';

  it('aggregates all-time open orders across months with FIFO Ready Packed waiting days, Completed, Cancelled, and Customer 360', () => {
    const overview = buildOrderCommandOverview({
      todayIso: '2026-11-22',
      divisions: [
        { id: DIV_SPK, divisionCode: 'DIV-SPD', name: 'Spoke Division' },
        { id: DIV_CCD, divisionCode: 'DIV-CCD', name: 'Control Cable Division' },
      ],
      orderRows: [
        // 1. Prior-month Pending Order with partial dispatch + FIFO ready packed waiting stock (packed Nov 10 -> 12d waiting)
        {
          order_id: 'so-1',
          order_number: 'SOC-2026-05801',
          customer_id: 'cust-1',
          customer_po: 'PO-901',
          division_id: DIV_SPK,
          section_id: null,
          order_date: '2026-10-15',
          delivery_date: '2026-11-01',
          currency: 'PKR',
          order_subtotal: 100000,
          order_discount: 0,
          order_tax: 18000,
          order_freight: 0,
          order_total: 118000,
          order_status: 'Confirmed',
          order_notes: null,
          order_created_at: '2026-10-15T08:00:00Z',
          customer_code: 'CUS-ASA-005',
          customer_name: 'ALI SHAH AUTOS',
          contact_person: 'Ali Shah',
          customer_email: 'ali@example.com',
          customer_phone: '0300-1234567',
          customer_mobile: null,
          credit_days: 30,
          payment_terms: 'Net 30 Days',
          division_code: 'DIV-SPD',
          division_name: 'Spoke Division',
          order_item_id: 'soi-1',
          line_number: 1,
          item_id: 'item-1',
          item_code: 'SPI-FG-SPK-001',
          item_name: '250X17 Inn / Out Spoke Butted__225X17 Nipple',
          packaging_size: 10,
          packaging_unit: 'CTN',
          base_uom_code: 'PCS',
          uom_code: 'GRS',
          ordered_qty: 1000,
          soi_shipped_qty: 0,
          unit_price: 100,
          discount_percent: 0,
          line_tax_amount: 18000,
          line_total: 118000,
        },
        // 2. Current-month Completed Order (100% dispatched)
        {
          order_id: 'so-2',
          order_number: 'SOC-2026-05899',
          customer_id: 'cust-1',
          customer_po: null,
          division_id: DIV_SPK,
          section_id: null,
          order_date: '2026-11-12',
          delivery_date: '2026-11-20',
          currency: 'PKR',
          order_subtotal: 50000,
          order_discount: 0,
          order_tax: 9000,
          order_freight: 0,
          order_total: 59000,
          order_status: 'Delivered',
          order_notes: null,
          order_created_at: '2026-11-12T08:00:00Z',
          customer_code: 'CUS-ASA-005',
          customer_name: 'ALI SHAH AUTOS',
          contact_person: 'Ali Shah',
          customer_email: 'ali@example.com',
          customer_phone: '0300-1234567',
          customer_mobile: null,
          credit_days: 30,
          payment_terms: 'Net 30 Days',
          division_code: 'DIV-SPD',
          division_name: 'Spoke Division',
          order_item_id: 'soi-2',
          line_number: 1,
          item_id: 'item-1',
          item_code: 'SPI-FG-SPK-001',
          item_name: '250X17 Inn / Out Spoke Butted__225X17 Nipple',
          packaging_size: 10,
          packaging_unit: 'CTN',
          base_uom_code: 'PCS',
          uom_code: 'GRS',
          ordered_qty: 500,
          soi_shipped_qty: 500,
          unit_price: 100,
          discount_percent: 0,
          line_tax_amount: 9000,
          line_total: 59000,
        },
        // 3. Cancelled Order (excluded from KPI backlog)
        {
          order_id: 'so-3',
          order_number: 'SOC-2026-05750',
          customer_id: 'cust-2',
          customer_po: null,
          division_id: DIV_CCD,
          section_id: null,
          order_date: '2026-09-02',
          delivery_date: null,
          currency: 'PKR',
          order_subtotal: 20000,
          order_discount: 0,
          order_tax: 0,
          order_freight: 0,
          order_total: 20000,
          order_status: 'Cancelled',
          order_notes: null,
          order_created_at: '2026-09-02T08:00:00Z',
          customer_code: 'CUS-002',
          customer_name: 'CROWN FIT',
          contact_person: null,
          customer_email: null,
          customer_phone: null,
          customer_mobile: null,
          credit_days: 0,
          payment_terms: 'Standard',
          division_code: 'DIV-CCD',
          division_name: 'Control Cable Division',
          order_item_id: 'soi-3',
          line_number: 1,
          item_id: 'item-2',
          item_code: 'CCD-001',
          item_name: 'Brake Cable',
          packaging_size: 100,
          packaging_unit: 'Coil',
          base_uom_code: 'M',
          uom_code: 'M',
          ordered_qty: 200,
          soi_shipped_qty: 0,
          unit_price: 100,
          discount_percent: 0,
          line_tax_amount: 0,
          line_total: 20000,
        },
      ],
      deliveryRows: [
        {
          delivery_id: 'dn-1',
          delivery_number: 'DN-2026-00010',
          gate_pass_number: 'GP-14701',
          sales_order_id: 'so-1',
          header_soc_number: 'SOC-2026-05801',
          delivery_date: '2026-11-06',
          carrier: 'PWI Fleet',
          tracking_number: 'TRK-1',
          status: 'CONFIRMED',
          delivery_total_amount: 35400,
          item_id: 'item-1',
          line_description: 'Spoke [SOC: SOC-2026-05801]',
          line_qty: 300, // 300 GRS dispatched
        },
        {
          delivery_id: 'dn-2',
          delivery_number: 'DN-2026-00020',
          gate_pass_number: 'GP-14720',
          sales_order_id: 'so-2',
          header_soc_number: 'SOC-2026-05899',
          delivery_date: '2026-11-18',
          carrier: 'PWI Fleet',
          tracking_number: null,
          status: 'DELIVERED',
          delivery_total_amount: 59000,
          item_id: 'item-1',
          line_description: 'Spoke [SOC: SOC-2026-05899]',
          line_qty: 500,
        },
      ],
      packingRows: [
        // Batch A packed Nov 04: 300 GRS (43,200 PCS) -> fully consumed by DN-2026-00010 (300 GRS)!
        {
          id: 'pe-1',
          entry_number: 'PE-1',
          entry_date: '2026-11-04',
          item_id: 'item-1',
          actual_quantity: 43200,
          remarks: 'Packed for SOC-2026-05801',
          effective_packing_mode: 'FULL_SET',
        },
        // Batch B packed Nov 10: 250 GRS (36,000 PCS) -> still sitting waiting pickup -> 12d old!
        {
          id: 'pe-2',
          entry_number: 'PE-2',
          entry_date: '2026-11-10',
          item_id: 'item-1',
          actual_quantity: 36000,
          remarks: 'Packed for SOC-2026-05801',
          effective_packing_mode: 'FULL_SET',
        },
      ],
      packingLogRows: [],
    });

    // Pending KPI Strip reflects ALL open orders regardless of order month (so-1 from Oct!)
    expect(overview.kpis.activeOrderCount).toBe(1);
    expect(overview.kpis.totalOrdered).toBe(1000);
    expect(overview.kpis.dispatched).toBe(300);
    expect(overview.kpis.pendingOrderBalance).toBe(700);
    expect(overview.kpis.readyPacked).toBe(250);
    expect(overview.kpis.remainingToPack).toBe(450);
    expect(overview.kpis.oldestReadyAgeDays).toBe(12);
    expect(overview.kpis.readyOrderCount).toBe(1);

    // 3 Sections grouped accurately
    expect(overview.sections.pending.count).toBe(1);
    expect(overview.sections.completed.count).toBe(1);
    expect(overview.sections.cancelled.count).toBe(1);

    // SOC-2026-05801 details & linked deliveries
    const so1 = overview.orders.find((o) => o.orderNumber === 'SOC-2026-05801')!;
    expect(so1.category).toBe('PENDING');
    expect(so1.orderAgeDays).toBe(38); // 2026-10-15 -> 2026-11-22
    expect(so1.readySinceDate).toBe('2026-11-10');
    expect(so1.readyAgeDays).toBe(12);
    expect(so1.linkedDeliveries).toHaveLength(1);
    expect(so1.linkedDeliveries[0].gatePassNumber).toBe('GP-14701');
    expect(so1.items[0].taxPercent).toBe(18);

    // Customer 360 roll-up for ALI SHAH AUTOS (1 open + 1 completed)
    const cust1 = overview.customers.find((c) => c.customerId === 'cust-1')!;
    expect(cust1.openOrderCount).toBe(1);
    expect(cust1.completedOrderCount).toBe(1);
    expect(cust1.totalPendingQty).toBe(700);
    expect(cust1.totalReadyPackedQty).toBe(250);
    expect(cust1.oldestReadyAgeDays).toBe(12);
    expect(cust1.totalDispatchedValue).toBe(94400); // 35,400 + 59,000
  });

  it('includes Safety-Stock-shifted PRODUCTION_ITEM_OPEN_STOCK batches accurately (SOC-2026-05820 = 120, SOC-2026-05821 = 50)', () => {
    const overview = buildOrderCommandOverview({
      todayIso: '2026-11-22',
      divisions: [{ id: DIV_SPK, divisionCode: 'DIV-SPD', name: 'Spoke Division' }],
      orderRows: [
        {
          order_id: 'so-5820',
          order_number: 'SOC-2026-05820',
          customer_id: 'cust-jt',
          customer_po: null,
          division_id: DIV_SPK,
          section_id: null,
          order_date: '2026-11-02',
          delivery_date: '2026-11-17',
          currency: 'PKR',
          order_subtotal: 12000,
          order_discount: 0,
          order_tax: 2160,
          order_freight: 0,
          order_total: 14160,
          order_status: 'Confirmed',
          order_notes: null,
          order_created_at: '2026-11-02T08:00:00Z',
          customer_code: 'CUS-JT-001',
          customer_name: 'JT-Gold',
          contact_person: null,
          customer_email: null,
          customer_phone: null,
          customer_mobile: null,
          credit_days: 0,
          payment_terms: 'Standard',
          division_code: 'DIV-SPD',
          division_name: 'Spoke Division',
          order_item_id: 'soi-5820-7',
          line_number: 1,
          item_id: 'item-spk-007',
          item_code: 'SPI-FG-SPK-007',
          item_name: '300X18 S9 Inn / Out Spoke Straight__125-S9 Nipple',
          packaging_size: 10,
          packaging_unit: 'CTN',
          base_uom_code: 'PCS',
          uom_code: 'GRS',
          ordered_qty: 120,
          soi_shipped_qty: 0,
          unit_price: 100,
          discount_percent: 0,
          line_tax_amount: 2160,
          line_total: 14160,
        },
        {
          order_id: 'so-5821',
          order_number: 'SOC-2026-05821',
          customer_id: 'cust-ft',
          customer_po: null,
          division_id: DIV_SPK,
          section_id: null,
          order_date: '2026-11-02',
          delivery_date: '2026-11-17',
          currency: 'PKR',
          order_subtotal: 5000,
          order_discount: 0,
          order_tax: 900,
          order_freight: 0,
          order_total: 5900,
          order_status: 'Processing',
          order_notes: null,
          order_created_at: '2026-11-02T08:00:00Z',
          customer_code: 'CUS-FT-001',
          customer_name: 'FT-Parts Jhang',
          contact_person: null,
          customer_email: null,
          customer_phone: null,
          customer_mobile: null,
          credit_days: 0,
          payment_terms: 'Standard',
          division_code: 'DIV-SPD',
          division_name: 'Spoke Division',
          order_item_id: 'soi-5821-7',
          line_number: 1,
          item_id: 'item-spk-007',
          item_code: 'SPI-FG-SPK-007',
          item_name: '300X18 S9 Inn / Out Spoke Straight__125-S9 Nipple',
          packaging_size: 10,
          packaging_unit: 'CTN',
          base_uom_code: 'PCS',
          uom_code: 'GRS',
          ordered_qty: 50,
          soi_shipped_qty: 0,
          unit_price: 100,
          discount_percent: 0,
          line_tax_amount: 900,
          line_total: 5900,
        },
      ],
      deliveryRows: [],
      packingRows: [
        // Fresh packing for SOC-2026-05821: 10 GRS (1440 PCS)
        {
          id: 'pe-1959',
          entry_number: 'PE-2026-01959',
          entry_date: '2026-11-04',
          item_id: 'item-spk-007',
          actual_quantity: 1440,
          remarks: '[HAND PACKING] SOC: SOC-2026-05821 | Customer: FT-Parts Jhang | Cartons: 1 (10 Gross / 1440 PCS) | SpokePackingMode: FULL_SET',
          effective_packing_mode: 'FULL_SET',
        },
      ],
      packingLogRows: [],
      openingStockRows: [
        // Safety-Stock-shifted batch for SOC-2026-05820: 120 GRS (17280 PCS)
        {
          id: 'sl-5820',
          item_id: 'item-spk-007',
          transaction_date: '2026-09-30',
          quantity: 17280,
          reference_number: 'PKG-2026-0955',
          base_uom_code: 'PCS',
          notes: '[HAND PACKING] SOC: SOC-2026-05820 | Customer: JT-Gold | Cartons: 12 (120 Gross / 17280 PCS) | SpokePackingMode: COMPLETE_SET | [SHIFTED FROM SAFETY STOCK on 2026-11-04] | Allocated from Safety Stock',
        },
        // Safety-Stock-shifted partial batch for SOC-2026-05821: 40 GRS (5760 PCS)
        {
          id: 'sl-5821',
          item_id: 'item-spk-007',
          transaction_date: '2026-09-30',
          quantity: 5760,
          reference_number: 'PKG-2026-0956-AL',
          base_uom_code: 'PCS',
          notes: 'Customer: FT-Parts Jhang | SOC: SOC-2026-05821 | Cartons: 4 | Gross: 40 | [SHIFTED FROM SAFETY STOCK on 2026-11-04] to FT-Parts Jhang (SOC-2026-05821) (4 CTN / 40 GRS)',
        },
      ],
    });

    const so5820 = overview.orders.find((o) => o.orderNumber === 'SOC-2026-05820')!;
    expect(so5820.orderAgeDays).toBe(20);
    expect(so5820.readyPackedQty).toBe(120);
    expect(so5820.remainingToPackQty).toBe(0);
    expect(so5820.readyAgeDays).toBe(18);
    expect(so5820.items[0].readyPacked).toBe(120);

    const so5821 = overview.orders.find((o) => o.orderNumber === 'SOC-2026-05821')!;
    expect(so5821.orderAgeDays).toBe(20);
    expect(so5821.readyPackedQty).toBe(50);
    expect(so5821.remainingToPackQty).toBe(0);
    expect(so5821.readyAgeDays).toBe(18);
    expect(so5821.items[0].readyPacked).toBe(50);
  });
});
