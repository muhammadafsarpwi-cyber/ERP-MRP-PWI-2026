import { SalesDeliveryService } from './sales-delivery.service';

describe('SalesDeliveryService — Per-SOC Dispatch Sequence Calculation', () => {
  const COMP = 'comp-001';
  const SO_A = 'so-05815';
  const SO_B = 'so-05805';
  const ITEM_6 = 'item-spk-006';
  const ITEM_4 = 'item-spk-004';

  const makeQbMock = (deliveries: any[]) => {
    const qb: any = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getManyAndCount: jest.fn().mockResolvedValue([deliveries, deliveries.length]),
    };
    return qb;
  };

  it('computes accurate chronological per-SOC dispatchOrdinal, totalSocDispatches, Remaining Balance, and isFinalDispatch across multi-SOC deliveries', async () => {
    // DN-2026-00044 (DRAFT) contains Line 1 for SOC-2026-05815 (3rd dispatch overall -> Remaining 730)
    // and Line 2 for SOC-2026-05805 (2nd dispatch overall -> Remaining 0 -> Final Dispatch)
    const dn44 = {
      id: 'dn-00044',
      companyId: COMP,
      deliveryNumber: 'DN-2026-00044',
      status: 'DRAFT',
      deliveryDate: '2026-11-20',
      salesOrderId: SO_A,
      salesOrder: {
        id: SO_A,
        orderNumber: 'SOC-2026-05815',
        division: { name: 'Spoke Division' },
      },
      lines: [
        {
          id: 'l-1',
          itemId: ITEM_6,
          item: { itemCode: 'SPI-FG-SPK-006', name: '300X17 S9 Spoke', packagingSize: 10, packagingUnit: 'CTN' },
          uom: { code: 'GRS' },
          quantity: 700,
          description: '300X17 S9 Spoke [SOC: SOC-2026-05815]',
        },
        {
          id: 'l-2',
          itemId: ITEM_4,
          item: { itemCode: 'SPI-FG-SPK-004', name: '250*17 Spoke', packagingSize: 10, packagingUnit: 'CTN' },
          uom: { code: 'GRS' },
          quantity: 200,
          description: '250*17 Spoke [SOC: SOC-2026-05805]',
        },
      ],
    };

    const managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('FROM erp_sales.sales_orders so')) {
        return [
          { id: SO_A, order_number: 'SOC-2026-05815', customer_po: 'PO-1', item_id: ITEM_6, order_qty: 6130, packaging_size: 10 },
          { id: SO_B, order_number: 'SOC-2026-05805', customer_po: 'PO-2', item_id: ITEM_4, order_qty: 500, packaging_size: 10 },
        ];
      }
      if (sql.includes('FROM erp_sales.sales_deliveries sd')) {
        // Chronological deliveries in DB (cancelled already excluded by SQL)
        return [
          // #1 for SOC-2026-05815
          { delivery_id: 'dn-00004', delivery_number: 'DN-2026-00004', status: 'CONFIRMED', delivery_date: '2026-10-02', item_id: ITEM_6, line_qty: 4000, description: '[SOC: SOC-2026-05815]', header_soc: 'SOC-2026-05815', packaging_size: 10 },
          // #1 for SOC-2026-05805
          { delivery_id: 'dn-00017', delivery_number: 'DN-2026-00017', status: 'CONFIRMED', delivery_date: '2026-10-19', item_id: ITEM_4, line_qty: 300, description: '[SOC: SOC-2026-05805]', header_soc: 'SOC-2026-05805', packaging_size: 10 },
          // #2 for SOC-2026-05815
          { delivery_id: 'dn-00024', delivery_number: 'DN-2026-00024', status: 'SHIPPED', delivery_date: '2026-10-27', item_id: ITEM_6, line_qty: 700, description: '[SOC: SOC-2026-05815]', header_soc: 'SOC-2026-05815', packaging_size: 10 },
          // #3 for SOC-2026-05815 AND #2 for SOC-2026-05805 (DN-2026-00044)
          { delivery_id: 'dn-00044', delivery_number: 'DN-2026-00044', status: 'DRAFT', delivery_date: '2026-11-20', item_id: ITEM_6, line_qty: 700, description: '[SOC: SOC-2026-05815]', header_soc: 'SOC-2026-05815', packaging_size: 10 },
          { delivery_id: 'dn-00044', delivery_number: 'DN-2026-00044', status: 'DRAFT', delivery_date: '2026-11-20', item_id: ITEM_4, line_qty: 200, description: '[SOC: SOC-2026-05805]', header_soc: 'SOC-2026-05815', packaging_size: 10 },
        ];
      }
      return [{ gate_pass_number: 'GP-14746' }];
    });

    const deliveryRepo: any = {
      createQueryBuilder: jest.fn(() => makeQbMock([dn44])),
      manager: { query: managerQuery },
    };

    const service = new SalesDeliveryService(
      deliveryRepo,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const res = await service.findAll({ companyId: COMP, page: 1, limit: 50 });
    expect(res.data).toHaveLength(1);
    const enriched = res.data[0];

    const socA = enriched.salesOrdersSummary.find((s: any) => s.socNumber === 'SOC-2026-05815');
    const socB = enriched.salesOrdersSummary.find((s: any) => s.socNumber === 'SOC-2026-05805');

    expect(socA.dispatchOrdinal).toBe(3);
    expect(socA.dispatchLabel).toBe('3rd Dispatch');
    expect(socA.totalSocDispatches).toBe(3);
    expect(socA.isFinalDispatch).toBe(false);

    expect(socB.dispatchOrdinal).toBe(2);
    expect(socB.dispatchLabel).toBe('2nd Dispatch');
    expect(socB.totalSocDispatches).toBe(2);
    expect(socB.isFinalDispatch).toBe(true);

    // Line-level checks (Remaining Balance after this Gate Pass)
    expect(enriched.lines[0].dispatchOrdinal).toBe(3);
    expect(enriched.lines[0].orderQuantity).toBe(6130);
    expect(enriched.lines[0].balanceQuantity).toBe(730);
    expect(enriched.lines[0].isFinalDispatch).toBe(false);

    expect(enriched.lines[1].dispatchOrdinal).toBe(2);
    expect(enriched.lines[1].orderQuantity).toBe(500);
    expect(enriched.lines[1].balanceQuantity).toBe(0);
    expect(enriched.lines[1].isFinalDispatch).toBe(true);
  });
});
