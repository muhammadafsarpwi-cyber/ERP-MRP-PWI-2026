import {
  buildCustomerItemDispatchMatrix,
  buildMatrixExportRows,
  buildMatrixWhatsAppText,
  resolveMatrixDateRange,
} from './customerItemDispatchMatrix.util';

const DIV_SPD = 'd1000000-0000-0000-0000-000000000001';
const DIV_CCD = 'd2000000-0000-0000-0000-000000000002';
const DIV_WRD = 'd5000000-0000-0000-0000-000000000005';

const DIVISIONS = [
  { id: DIV_SPD, divisionCode: 'DIV-001-SPI', name: 'Spoke Division' },
  { id: DIV_CCD, divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' },
  { id: DIV_WRD, divisionCode: 'DIV-005-WRD', name: 'WRD Division' },
];

describe('customerItemDispatchMatrix.util', () => {
  it('resolves all Pakistani Fiscal Year (Jul–Jun) and calendar period presets accurately', () => {
    const ref = new Date(2026, 10, 28); // 2026-11-28 (Q2 of FY26-27)
    expect(resolveMatrixDateRange('thisMonth', null, ref)).toMatchObject({
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
    });
    expect(resolveMatrixDateRange('lastMonth', null, ref)).toMatchObject({
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
    });
    expect(resolveMatrixDateRange('thisQuarter', null, ref)).toMatchObject({
      dateFrom: '2026-10-01',
      dateTo: '2026-12-31',
    });
    expect(resolveMatrixDateRange('lastQuarter', null, ref)).toMatchObject({
      dateFrom: '2026-07-01',
      dateTo: '2026-09-30',
    });
    expect(resolveMatrixDateRange('thisYear', null, ref)).toMatchObject({
      dateFrom: '2026-07-01',
      dateTo: '2027-06-30',
    });
    expect(resolveMatrixDateRange('lastYear', null, ref)).toMatchObject({
      dateFrom: '2025-07-01',
      dateTo: '2026-06-30',
    });
    expect(resolveMatrixDateRange('allTime', null, ref)).toEqual({ label: 'All Time' });
    expect(resolveMatrixDateRange('custom', ['2026-11-05', '2026-11-20'], ref)).toMatchObject({
      dateFrom: '2026-11-05',
      dateTo: '2026-11-20',
    });
  });

  it('builds Customer-Wise -> Items and Item-Wise -> Customers (with Share %) matrices with dynamic M/Coils, GRS/CTN, and KG units', () => {
    const orders = [
      {
        id: 'so-ccd-1',
        orderNumber: 'SOC-2026-09100',
        divisionId: DIV_CCD,
        orderDate: '2026-11-02',
        status: 'PROCESSING',
        customerId: 'cust-xinda',
        customer: { id: 'cust-xinda', customerCode: 'CUS-XIN-001', companyName: 'Xinda Control Cable Pakistan (Pvt) Ltd' },
        items: [
          {
            itemId: 'item-cc-1',
            item: { itemCode: 'CCD-FG-001', name: 'Outer Casing 5.0mm Black', packagingSize: 250, packagingUnit: 'COILS', uom: { code: 'M' } },
            quantity: 500000,
            shippedQuantity: 271000,
            unitPrice: 10,
          },
        ],
      },
      {
        id: 'so-ccd-2',
        divisionId: DIV_CCD,
        orderDate: '2026-11-04',
        status: 'PROCESSING',
        customerId: 'cust-fabro',
        customer: { id: 'cust-fabro', customerCode: 'CUS-FAB-002', companyName: 'FABRO ENGINEERING' },
        items: [
          {
            itemId: 'item-cc-1',
            item: { itemCode: 'CCD-FG-001', name: 'Outer Casing 5.0mm Black', packagingSize: 250, packagingUnit: 'COILS', uom: { code: 'M' } },
            quantity: 200000,
            shippedQuantity: 129000,
            unitPrice: 10,
          },
        ],
      },
      {
        id: 'so-spd-1',
        divisionId: DIV_SPD,
        orderDate: '2026-11-03',
        status: 'PROCESSING',
        customerId: 'cust-crown',
        customer: { id: 'cust-crown', customerCode: 'CUS-CFP-001', companyName: 'CROWN FIT PAKISTAN' },
        items: [
          {
            itemId: 'item-sp-1',
            item: { itemCode: 'SPI-FG-SPK-006', name: '300X17 Inn/Out Spoke', packagingSize: 10, packagingUnit: 'CTN', uom: { code: 'GRS' } },
            quantity: 2000,
            shippedQuantity: 800,
            unitPrice: 500,
          },
        ],
      },
    ];

    const deliveries = [
      {
        id: 'dn-ccd-1',
        divisionId: DIV_CCD,
        salesOrderId: 'so-ccd-1',
        deliveryDate: '2026-11-15',
        status: 'DELIVERED',
        customerId: 'cust-xinda',
        customer: { id: 'cust-xinda', customerCode: 'CUS-XIN-001', companyName: 'Xinda Control Cable Pakistan (Pvt) Ltd' },
        lines: [
          {
            itemId: 'item-cc-1',
            item: { itemCode: 'CCD-FG-001', name: 'Outer Casing 5.0mm Black', packagingSize: 250, packagingUnit: 'COILS', uom: { code: 'M' } },
            quantity: 271000,
            unitPrice: 10,
          },
        ],
      },
      {
        id: 'dn-ccd-2',
        divisionId: DIV_CCD,
        salesOrderId: 'so-ccd-2',
        deliveryDate: '2026-11-18',
        status: 'DELIVERED',
        customerId: 'cust-fabro',
        customer: { id: 'cust-fabro', customerCode: 'CUS-FAB-002', companyName: 'FABRO ENGINEERING' },
        lines: [
          {
            itemId: 'item-cc-1',
            item: { itemCode: 'CCD-FG-001', name: 'Outer Casing 5.0mm Black', packagingSize: 250, packagingUnit: 'COILS', uom: { code: 'M' } },
            quantity: 129000,
            unitPrice: 10,
          },
        ],
      },
      {
        id: 'dn-spd-1',
        divisionId: DIV_SPD,
        salesOrderId: 'so-spd-1',
        deliveryDate: '2026-11-12',
        status: 'DELIVERED',
        customerId: 'cust-crown',
        customer: { id: 'cust-crown', customerCode: 'CUS-CFP-001', companyName: 'CROWN FIT PAKISTAN' },
        lines: [
          {
            itemId: 'item-sp-1',
            item: { itemCode: 'SPI-FG-SPK-006', name: '300X17 Inn/Out Spoke', packagingSize: 10, packagingUnit: 'CTN', uom: { code: 'GRS' } },
            quantity: 800,
            unitPrice: 500,
          },
        ],
      },
    ];

    const ref = new Date(2026, 10, 28);

    // 1. Control Cable Division (M / Coils)
    const ccdMatrix = buildCustomerItemDispatchMatrix({
      orders,
      deliveries,
      divisions: DIVISIONS,
      divisionId: DIV_CCD,
      preset: 'thisMonth',
      referenceDate: ref,
    });

    expect(ccdMatrix.kpis).toMatchObject({
      activeCustomers: 2,
      itemsDispatched: 1,
      periodDispatchedQty: 400000,
      periodPackCount: 1600, // 400,000 M / 250 M per Coil
      periodDispatchedValuePkr: 4000000,
      remainingPendingQty: 300000,
      primaryUom: 'M',
      primaryPackUnit: 'Coils',
    });

    // Customer-Wise -> Items
    expect(ccdMatrix.customerGroups).toHaveLength(2);
    expect(ccdMatrix.customerGroups[0]).toMatchObject({
      customerName: 'Xinda Control Cable Pakistan (Pvt) Ltd',
      dispatchedInPeriodQty: 271000,
      packCountInPeriod: 1084,
      uomCode: 'M',
      packUnitLabel: 'Coils',
      pendingBalanceQty: 229000,
    });

    // Item-Wise -> Customers (with Share %)
    expect(ccdMatrix.itemGroups).toHaveLength(1);
    expect(ccdMatrix.itemGroups[0].customers[0]).toMatchObject({
      customerCode: 'CUS-XIN-001',
      dispatchedInPeriodQty: 271000,
      sharePct: 67.8,
    });
    expect(ccdMatrix.itemGroups[0].customers[1]).toMatchObject({
      customerCode: 'CUS-FAB-002',
      dispatchedInPeriodQty: 129000,
      sharePct: 32.3,
    });

    // Export rows & WhatsApp formatting
    expect(ccdMatrix.customerGroups[0].items[0].socNumbers).toEqual(['SOC-2026-09100']);
    const exportRows = buildMatrixExportRows(ccdMatrix, 'customer_wise');
    expect(exportRows).toHaveLength(2);
    expect(exportRows[0]['Pack Count']).toBe('1084 Coils');
    expect(exportRows[0]['SOC #']).toBe('SOC-2026-09100');

    const waText = buildMatrixWhatsAppText(ccdMatrix, 'item_wise', 'Control Cable Division (DIV-002-CCD)');
    expect(waText).toContain('400,000 M');
    expect(waText).toContain('1,600 Coils');
    expect(waText).toContain('67.8%');

    // 2. Spoke Division (GRS / CTN) — strictly excludes Control Cable customers
    const spdMatrix = buildCustomerItemDispatchMatrix({
      orders,
      deliveries,
      divisions: DIVISIONS,
      divisionId: DIV_SPD,
      preset: 'thisMonth',
      referenceDate: ref,
    });

    expect(spdMatrix.kpis).toMatchObject({
      activeCustomers: 1,
      itemsDispatched: 1,
      periodDispatchedQty: 800,
      periodPackCount: 80, // 800 GRS / 10 GRS per CTN
      primaryUom: 'GRS',
      primaryPackUnit: 'CTN',
    });
    expect(spdMatrix.customerGroups.map((g) => g.customerCode)).toEqual(['CUS-CFP-001']);
  });
});
