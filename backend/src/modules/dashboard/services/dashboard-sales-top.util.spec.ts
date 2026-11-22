import {
  buildDashboardOrderLoadAndTopCustomers,
  DashboardSalesDeliveryRow,
  DashboardSalesOrderRow,
} from './dashboard-sales-top.util';

const DIV_SPI = 'd1000000-0000-0000-0000-000000000001';
const DIV_CCD = 'd1000000-0000-0000-0000-000000000002';

function makeOrderRow(partial: Partial<DashboardSalesOrderRow>): DashboardSalesOrderRow {
  return {
    order_id: 'so-1',
    order_number: 'SOC-2026-05805',
    customer_id: 'cus-1',
    customer_code: 'CUS-ASA-005',
    customer_name: 'ALI SHAH AUTOS',
    division_id: DIV_SPI,
    order_date: '2026-10-15',
    order_status: 'Processing',
    order_item_id: 'soi-1',
    item_id: 'item-1',
    uom_code: 'GRS',
    ordered_qty: 1000,
    soi_shipped_qty: 0,
    ...partial,
  };
}

function makeDeliveryRow(partial: Partial<DashboardSalesDeliveryRow>): DashboardSalesDeliveryRow {
  return {
    delivery_id: 'dn-1',
    delivery_number: 'DN-2026-00001',
    delivery_date: '2026-11-10',
    delivery_status: 'CONFIRMED',
    customer_id: 'cus-1',
    customer_code: 'CUS-ASA-005',
    customer_name: 'ALI SHAH AUTOS',
    hdr_order_id: 'so-1',
    hdr_soc_number: 'SOC-2026-05805',
    hdr_division_id: DIV_SPI,
    item_id: 'item-1',
    item_division_id: DIV_SPI,
    uom_code: 'GRS',
    line_qty: 100,
    line_description: 'Spoke Item [SOC: SOC-2026-05805]',
    ...partial,
  };
}

describe('buildDashboardOrderLoadAndTopCustomers', () => {
  it('includes prior open pending balance + period new orders and computes remaining %', () => {
    const orderRows: DashboardSalesOrderRow[] = [
      // Prior order from Oct: 3,930 ordered; 350 shipped in Oct -> 3,580 carried into Nov
      makeOrderRow({
        order_id: 'so-prior',
        order_number: 'SOC-2026-05805',
        order_date: '2026-10-10',
        order_status: 'Processing',
        order_item_id: 'soi-prior',
        ordered_qty: 3930,
      }),
      // Prior order finished INSIDE Nov (so status is now 'Delivered', yet entering Nov it was still open!)
      makeOrderRow({
        order_id: 'so-finished-nov',
        order_number: 'SOC-2026-05819',
        customer_id: 'cus-cfp',
        customer_code: 'CUS-CFP-001',
        customer_name: 'CROWN FIT PAKISTAN',
        order_date: '2026-10-21',
        order_status: 'Delivered',
        order_item_id: 'soi-fin',
        ordered_qty: 11700,
      }),
      // Historical short-closed order from Aug with zero Nov activity -> ignored
      makeOrderRow({
        order_id: 'so-old-closed',
        order_number: 'SOC-2026-05001',
        order_date: '2026-08-01',
        order_status: 'Closed',
        order_item_id: 'soi-closed',
        ordered_qty: 500,
      }),
      // New order placed IN Nov
      makeOrderRow({
        order_id: 'so-nov',
        order_number: 'SOC-2026-05825',
        customer_id: 'cus-cfp',
        customer_code: 'CUS-CFP-001',
        customer_name: 'CROWN FIT PAKISTAN',
        order_date: '2026-11-12',
        order_status: 'Confirmed',
        order_item_id: 'soi-nov',
        ordered_qty: 2000,
      }),
    ];

    const deliveryRows: DashboardSalesDeliveryRow[] = [
      // Pre-period Oct deliveries
      makeDeliveryRow({
        delivery_id: 'dn-oct-1',
        delivery_date: '2026-10-20',
        hdr_order_id: 'so-prior',
        hdr_soc_number: 'SOC-2026-05805',
        line_description: '[SOC: SOC-2026-05805]',
        line_qty: 350,
      }),
      makeDeliveryRow({
        delivery_id: 'dn-oct-2',
        delivery_date: '2026-10-27',
        customer_id: 'cus-cfp',
        customer_code: 'CUS-CFP-001',
        customer_name: 'CROWN FIT PAKISTAN',
        hdr_order_id: 'so-finished-nov',
        hdr_soc_number: 'SOC-2026-05819',
        line_description: '[SOC: SOC-2026-05819]',
        line_qty: 4000,
      }),
      // In-period Nov deliveries
      makeDeliveryRow({
        delivery_id: 'dn-nov-1',
        delivery_date: '2026-11-18',
        customer_id: 'cus-cfp',
        customer_code: 'CUS-CFP-001',
        customer_name: 'CROWN FIT PAKISTAN',
        hdr_order_id: 'so-finished-nov',
        hdr_soc_number: 'SOC-2026-05819',
        line_description: '[SOC: SOC-2026-05819]',
        line_qty: 7700,
      }),
      makeDeliveryRow({
        delivery_id: 'dn-nov-2',
        delivery_date: '2026-11-19',
        hdr_order_id: 'so-prior',
        hdr_soc_number: 'SOC-2026-05805',
        line_description: '[SOC: SOC-2026-05805]',
        line_qty: 1100,
      }),
    ];

    const res = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      divisionId: DIV_SPI,
    });

    // Prior pending entering Nov: (3930 - 350) + (11700 - 4000) = 3580 + 7700 = 11,280
    // Nov new orders: 2,000 -> Total Order Load: 13,280
    // Nov sold: 7,700 + 1,100 = 8,800
    // Remaining balance: 13,280 - 8,800 = 4,480 -> round(4480 / 13280 * 100) = 34%
    expect(res.summary.priorOpenPendingGross).toBe(11280);
    expect(res.summary.priorOpenOrdersCount).toBe(2);
    expect(res.summary.periodNewOrdersGross).toBe(2000);
    expect(res.summary.periodNewOrdersCount).toBe(1);
    expect(res.summary.totalOrderLoadGross).toBe(13280);
    expect(res.summary.totalSoldGross).toBe(8800);
    expect(res.summary.remainingBalanceGross).toBe(4480);
    expect(res.summary.remainingPct).toBe(34);

    // Top Customers reflect ONLY Nov dispatches (CFP 7700, ALI SHAH 1100)
    expect(res.topCustomers).toHaveLength(2);
    expect(res.topCustomers[0]).toMatchObject({
      name: 'CROWN FIT PAKISTAN',
      salesGross: 7700,
      sharePct: 88,
      rank: 1,
    });
    expect(res.topCustomers[1]).toMatchObject({
      name: 'ALI SHAH AUTOS',
      salesGross: 1100,
      sharePct: 12,
      rank: 2,
    });
  });

  it('maintains rollforward consistency from Last Month ending balance to This Month prior pending', () => {
    const orderRows: DashboardSalesOrderRow[] = [
      makeOrderRow({
        order_id: 'so-sep',
        order_number: 'SOC-2026-05815',
        order_date: '2026-09-28',
        order_item_id: 'soi-sep',
        ordered_qty: 12200,
      }),
      makeOrderRow({
        order_id: 'so-oct',
        order_number: 'SOC-2026-05806',
        order_date: '2026-10-02',
        order_item_id: 'soi-oct',
        ordered_qty: 10000,
      }),
    ];
    const deliveryRows: DashboardSalesDeliveryRow[] = [
      makeDeliveryRow({
        delivery_id: 'dn-oct',
        delivery_date: '2026-10-26',
        hdr_order_id: 'so-sep',
        hdr_soc_number: 'SOC-2026-05815',
        line_description: '[SOC: SOC-2026-05815]',
        line_qty: 4150,
      }),
      makeDeliveryRow({
        delivery_id: 'dn-oct-2',
        delivery_date: '2026-10-29',
        hdr_order_id: 'so-oct',
        hdr_soc_number: 'SOC-2026-05806',
        line_description: '[SOC: SOC-2026-05806]',
        line_qty: 2000,
      }),
    ];

    const octRes = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-10-01',
      dateTo: '2026-10-31',
      divisionId: DIV_SPI,
    });
    const novRes = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      divisionId: DIV_SPI,
    });

    expect(octRes.summary.remainingBalanceGross).toBe(16050);
    expect(novRes.summary.priorOpenPendingGross).toBe(16050);
  });

  it('scopes orders, deliveries, and top customers strictly by active Division and returns zero state when empty', () => {
    const orderRows: DashboardSalesOrderRow[] = [
      makeOrderRow({ order_id: 'so-spi', division_id: DIV_SPI, order_date: '2026-11-05', ordered_qty: 1500 }),
    ];
    const deliveryRows: DashboardSalesDeliveryRow[] = [
      makeDeliveryRow({ delivery_id: 'dn-spi', delivery_date: '2026-11-10', hdr_division_id: DIV_SPI, line_qty: 500 }),
    ];

    const ccdRes = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      divisionId: DIV_CCD,
    });

    expect(ccdRes.summary.totalOrderLoadGross).toBe(0);
    expect(ccdRes.summary.totalSoldGross).toBe(0);
    expect(ccdRes.summary.remainingBalanceGross).toBe(0);
    expect(ccdRes.summary.remainingPct).toBe(0);
    expect(ccdRes.topCustomers).toEqual([]);
  });

  it('attributes multi-SOC delivery lines to each line SOC division and converts PCS/DOZ to GRS', () => {
    const orderRows: DashboardSalesOrderRow[] = [
      makeOrderRow({
        order_id: 'so-spi',
        order_number: 'SOC-2026-05815',
        division_id: DIV_SPI,
        order_date: '2026-11-01',
        order_item_id: 'soi-1',
        ordered_qty: 14400,
        uom_code: 'PCS', // 100 GRS
      }),
      makeOrderRow({
        order_id: 'so-ccd',
        order_number: 'SOC-2026-05899',
        division_id: DIV_CCD,
        order_date: '2026-11-01',
        order_item_id: 'soi-2',
        ordered_qty: 240,
        uom_code: 'DOZ', // 20 GRS
      }),
    ];
    const deliveryRows: DashboardSalesDeliveryRow[] = [
      makeDeliveryRow({
        delivery_id: 'dn-mix',
        hdr_order_id: 'so-spi',
        hdr_soc_number: 'SOC-2026-05815',
        hdr_division_id: DIV_SPI,
        delivery_date: '2026-11-15',
        line_description: 'Item A [SOC: SOC-2026-05815]',
        line_qty: 30,
        uom_code: 'GRS',
      }),
      makeDeliveryRow({
        delivery_id: 'dn-mix',
        hdr_order_id: 'so-spi',
        hdr_soc_number: 'SOC-2026-05815',
        hdr_division_id: DIV_SPI,
        delivery_date: '2026-11-15',
        line_description: 'Cable B [SOC: SOC-2026-05899]',
        line_qty: 120,
        uom_code: 'DOZ', // 10 GRS belonging to CCD!
      }),
    ];

    const ccdRes = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      divisionId: DIV_CCD,
    });
    const spiRes = buildDashboardOrderLoadAndTopCustomers({
      orderRows,
      deliveryRows,
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      divisionId: DIV_SPI,
    });

    expect(ccdRes.summary.totalOrderLoadGross).toBe(20);
    expect(ccdRes.summary.totalSoldGross).toBe(10);
    expect(ccdRes.summary.remainingBalanceGross).toBe(10);
    expect(ccdRes.summary.remainingPct).toBe(50);

    expect(spiRes.summary.totalOrderLoadGross).toBe(100);
    expect(spiRes.summary.totalSoldGross).toBe(30);
    expect(spiRes.summary.remainingBalanceGross).toBe(70);
    expect(spiRes.summary.remainingPct).toBe(70);
  });
});
