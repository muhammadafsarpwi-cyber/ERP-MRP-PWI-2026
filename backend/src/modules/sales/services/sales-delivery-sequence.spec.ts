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

  it('computes point-in-time cumulative progress and true Coils/M units for Control Cable Division (DN-00086, 00087, 00088)', async () => {
    const SO_CCD = 'so-05882';
    const ITEM_CCD = 'item-ccd-001';
    const divCcd = { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' };

    const makeDn = (id: string, num: string, date: string, qty: number) => ({
      id,
      companyId: COMP,
      deliveryNumber: num,
      status: 'CONFIRMED',
      deliveryDate: date,
      salesOrderId: SO_CCD,
      salesOrder: { id: SO_CCD, orderNumber: 'SOC-2026-05882', divisionId: 'div-ccd', division: divCcd },
      lines: [
        {
          id: `line-${num}`,
          itemId: ITEM_CCD,
          item: {
            id: ITEM_CCD,
            itemCode: 'CCD-FGR-001',
            name: 'Control Cable 2 Core 2.5mm',
            packagingSize: 250,
            packagingUnit: null, // verify dynamic Coils/M resolution without CTN/GRS fallback
            baseUom: { id: 'u-m', code: 'M' },
          },
          uom: null, // simulate missing line uomId that used to leak GRS/CTN
          quantity: qty,
          description: 'Control Cable 2 Core 2.5mm [SOC: SOC-2026-05882]',
        },
      ],
    });

    const dn86 = makeDn('dn-86', 'DN-2026-00086', '2026-11-10', 10000);
    const dn87 = makeDn('dn-87', 'DN-2026-00087', '2026-11-12', 13000);
    const dn88 = makeDn('dn-88', 'DN-2026-00088', '2026-11-15', 10000);

    const managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('FROM erp_sales.sales_orders so')) {
        return [
          {
            id: SO_CCD,
            order_number: 'SOC-2026-05882',
            customer_po: 'PO-CCD-1',
            division_id: 'div-ccd',
            division_code: 'DIV-002-CCD',
            division_name: 'Control Cable Division',
            item_id: ITEM_CCD,
            order_qty: 33000,
            uom_code: 'M',
            packaging_size: 250,
            packaging_unit: null,
            item_code: 'CCD-FGR-001',
            item_name: 'Control Cable 2 Core 2.5mm',
            base_uom_code: 'M',
            sales_uom_code: 'M',
          },
        ];
      }
      if (sql.includes('FROM erp_sales.sales_deliveries sd')) {
        return [
          { delivery_id: 'dn-86', delivery_number: 'DN-2026-00086', status: 'CONFIRMED', delivery_date: '2026-11-10', item_id: ITEM_CCD, line_qty: 10000, description: '[SOC: SOC-2026-05882]', header_soc: 'SOC-2026-05882', packaging_size: 250 },
          { delivery_id: 'dn-87', delivery_number: 'DN-2026-00087', status: 'CONFIRMED', delivery_date: '2026-11-12', item_id: ITEM_CCD, line_qty: 13000, description: '[SOC: SOC-2026-05882]', header_soc: 'SOC-2026-05882', packaging_size: 250 },
          { delivery_id: 'dn-88', delivery_number: 'DN-2026-00088', status: 'CONFIRMED', delivery_date: '2026-11-15', item_id: ITEM_CCD, line_qty: 10000, description: '[SOC: SOC-2026-05882]', header_soc: 'SOC-2026-05882', packaging_size: 250 },
        ];
      }
      if (sql.includes('FROM erp_sales.sales_invoices')) return [];
      return [{ gate_pass_number: 'GP-15000' }];
    });

    const deliveryRepo: any = {
      createQueryBuilder: jest.fn(() => makeQbMock([dn88, dn87, dn86])),
      manager: { query: managerQuery },
    };

    const service = new SalesDeliveryService(
      deliveryRepo,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const res = await service.findAll({ companyId: COMP, page: 1, limit: 50 });
    const byNum = new Map(res.data.map((d: any) => [d.deliveryNumber, d]));

    const d86 = byNum.get('DN-2026-00086');
    expect(d86.primaryUom).toBe('M');
    expect(d86.primaryPackagingUnit).toBe('Coils');
    expect(d86.totalOrderQuantity).toBe(33000);
    expect(d86.totalOrderCartons).toBe(132);
    expect(d86.totalPreviousQuantity).toBe(0);
    expect(d86.totalDispatchQuantity).toBe(10000);
    expect(d86.totalDispatchCartons).toBe(40);
    expect(d86.totalDeliveredQuantity).toBe(10000);
    expect(d86.totalDeliveredCartons).toBe(40);
    expect(d86.totalBalanceQuantity).toBe(23000);
    expect(d86.totalBalanceCartons).toBe(92);
    expect(d86.completionPercent).toBe(30);
    expect(d86.isCompleted).toBe(false);
    expect(d86.itemsSummary[0]).toMatchObject({
      uom: 'M',
      packagingUnit: 'Coils',
      orderedQuantity: 33000,
      orderedCartons: 132,
      previousDispatchedQuantity: 0,
      previousDispatchedCartons: 0,
      dispatchedQuantity: 10000,
      dispatchedCartons: 40,
      totalShippedQuantity: 10000,
      totalShippedCartons: 40,
      balanceQuantity: 23000,
      balanceCartons: 92,
      isCompleted: false,
      completionPercent: 30,
    });

    const d87 = byNum.get('DN-2026-00087');
    expect(d87.totalDispatchCartons).toBe(52);
    expect(d87.totalPreviousCartons).toBe(40);
    expect(d87.totalDeliveredCartons).toBe(92);
    expect(d87.totalBalanceCartons).toBe(40);
    expect(d87.totalBalanceQuantity).toBe(10000);
    expect(d87.completionPercent).toBe(70);
    expect(d87.isCompleted).toBe(false);

    const d88 = byNum.get('DN-2026-00088');
    expect(d88.totalDispatchCartons).toBe(40);
    expect(d88.totalPreviousCartons).toBe(92);
    expect(d88.totalDeliveredCartons).toBe(132);
    expect(d88.totalBalanceCartons).toBe(0);
    expect(d88.totalBalanceQuantity).toBe(0);
    expect(d88.completionPercent).toBe(100);
    expect(d88.isCompleted).toBe(true);
  });

  it('resolves exact multi-item Ordered, Prev, Cum (30% / 82% / 100%), and Bal from joined salesOrder.items (40 / 68 / 24 Coils)', async () => {
    const SO_CCD = 'so-05882-multi';
    const divCcd = { id: 'div-ccd', divisionCode: 'DIV-002-CCD', name: 'Control Cable Division' };
    const mkItem = (id: string, code: string, name: string) => ({
      id,
      itemCode: code,
      name,
      packagingSize: 250,
      packagingUnit: 'Coils',
      baseUom: { id: 'u-m', code: 'M' },
      salesUom: { id: 'u-m', code: 'M' },
    });

    const item3 = mkItem('id-003', 'CCD-FGR-003', 'Clutch Cable CD-70');
    const item2 = mkItem('id-002', 'CCD-FGR-002', 'Front Brake Cable CD-70');
    const item11 = mkItem('id-011', 'CCD-FGR-011', 'Throttle Cable CG-125');
    const item1 = mkItem('id-001', 'CCD-FGR-001', 'Speedometer Cable CD-70');

    // Total SOC Ordered = 40 + 36 + 32 + 24 = 132 Coils (33,000 M)
    const joinedSalesOrder = {
      id: SO_CCD,
      orderNumber: 'SOC-2026-05882',
      customerPo: 'PO-5882',
      divisionId: 'div-ccd',
      division: divCcd,
      items: [
        { id: 'soi-3', itemId: item3.id, item: item3, quantity: 10000, uom: { id: 'u-m', code: 'M' } }, // 40 Coils
        { id: 'soi-2', itemId: item2.id, item: item2, quantity: 9000, uom: { id: 'u-m', code: 'M' } },  // 36 Coils
        { id: 'soi-11', itemId: item11.id, item: item11, quantity: 8000, uom: { id: 'u-m', code: 'M' } }, // 32 Coils
        { id: 'soi-1', itemId: item1.id, item: item1, quantity: 6000, uom: { id: 'u-m', code: 'M' } },  // 24 Coils
      ],
    };

    // DN-86 = 40 Coils (16 + 12 + 12 + 0), DN-87 = 68 Coils (24 + 16 + 16 + 12), DN-88 = 24 Coils (0 + 8 + 4 + 12)
    const dn86 = {
      id: 'dn-m-86',
      companyId: COMP,
      deliveryNumber: 'DN-2026-00086',
      status: 'CONFIRMED',
      deliveryDate: '2026-11-20',
      salesOrderId: SO_CCD,
      salesOrder: joinedSalesOrder,
      lines: [
        { id: 'l86-3', itemId: item3.id, item: item3, quantity: 4000, description: 'Clutch Cable [SOC: SOC-2026-05882]' },
        { id: 'l86-2', itemId: item2.id, item: item2, quantity: 3000, description: 'Brake Cable [SOC: SOC-2026-05882]' },
        { id: 'l86-11', itemId: item11.id, item: item11, quantity: 3000, description: 'Throttle Cable [SOC: SOC-2026-05882]' },
      ],
    };
    const dn87 = {
      id: 'dn-m-87',
      companyId: COMP,
      deliveryNumber: 'DN-2026-00087',
      status: 'CONFIRMED',
      deliveryDate: '2026-11-21',
      salesOrderId: SO_CCD,
      salesOrder: joinedSalesOrder,
      lines: [
        { id: 'l87-3', itemId: item3.id, item: item3, quantity: 6000, description: 'Clutch Cable [SOC: SOC-2026-05882]' },
        { id: 'l87-2', itemId: item2.id, item: item2, quantity: 4000, description: 'Brake Cable [SOC: SOC-2026-05882]' },
        { id: 'l87-11', itemId: item11.id, item: item11, quantity: 4000, description: 'Throttle Cable [SOC: SOC-2026-05882]' },
        { id: 'l87-1', itemId: item1.id, item: item1, quantity: 3000, description: 'Speedo Cable [SOC: SOC-2026-05882]' },
      ],
    };
    const dn88 = {
      id: 'dn-m-88',
      companyId: COMP,
      deliveryNumber: 'DN-2026-00088',
      status: 'CONFIRMED',
      deliveryDate: '2026-11-22',
      salesOrderId: SO_CCD,
      salesOrder: joinedSalesOrder,
      lines: [
        { id: 'l88-2', itemId: item2.id, item: item2, quantity: 2000, description: 'Brake Cable [SOC: SOC-2026-05882]' },
        { id: 'l88-11', itemId: item11.id, item: item11, quantity: 1000, description: 'Throttle Cable [SOC: SOC-2026-05882]' },
        { id: 'l88-1', itemId: item1.id, item: item1, quantity: 3000, description: 'Speedo Cable [SOC: SOC-2026-05882]' },
      ],
    };

    // Return empty SQL arrays for SO/chrono to prove joined `salesOrder.items` + rawDeliveries supplement alone works 100%
    const managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('FROM erp_sales.sales_orders so')) return [];
      if (sql.includes('FROM erp_sales.sales_deliveries sd')) return [];
      if (sql.includes('FROM erp_sales.sales_invoices')) return [];
      return [{ gate_pass_number: 'GP-15001' }];
    });

    const deliveryRepo: any = {
      createQueryBuilder: jest.fn(() => makeQbMock([dn88, dn87, dn86])),
      manager: { query: managerQuery },
    };

    const service = new SalesDeliveryService(
      deliveryRepo,
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const res = await service.findAll({ companyId: COMP, page: 1, limit: 50 });
    const byNum = new Map(res.data.map((d: any) => [d.deliveryNumber, d]));

    const r86 = byNum.get('DN-2026-00086');
    expect(r86.salesOrder.items).toHaveLength(4);
    expect(r86.totalDispatchCartons).toBe(40);
    expect(r86.totalDeliveredCartons).toBe(40);
    expect(r86.totalBalanceCartons).toBe(92);
    expect(r86.completionPercent).toBe(30);
    expect(r86.isCompleted).toBe(false);

    const r87 = byNum.get('DN-2026-00087');
    expect(r87.totalPreviousCartons).toBe(40);
    expect(r87.totalDispatchCartons).toBe(68);
    expect(r87.totalDeliveredCartons).toBe(108);
    expect(r87.totalBalanceCartons).toBe(24);
    expect(r87.totalBalanceQuantity).toBe(6000);
    expect(r87.completionPercent).toBe(82);
    expect(r87.isCompleted).toBe(false);

    // Itemized breakdown on DN-2026-00087 has exact Ordered, Prev, This Disp, Cum, %, and Bal
    const ccd003 = r87.itemsSummary.find((x: any) => x.itemCode === 'CCD-FGR-003');
    expect(ccd003).toMatchObject({
      orderedQuantity: 10000,
      orderedCartons: 40,
      previousDispatchedCartons: 16,
      dispatchedCartons: 24,
      totalShippedCartons: 40,
      balanceCartons: 0,
      completionPercent: 100,
      isCompleted: true,
    });
    const ccd002 = r87.itemsSummary.find((x: any) => x.itemCode === 'CCD-FGR-002');
    expect(ccd002).toMatchObject({
      orderedQuantity: 9000,
      orderedCartons: 36,
      previousDispatchedCartons: 12,
      dispatchedCartons: 16,
      totalShippedCartons: 28,
      balanceCartons: 8,
      balanceQuantity: 2000,
      completionPercent: 78,
      isCompleted: false,
    });

    const r88 = byNum.get('DN-2026-00088');
    expect(r88.totalPreviousCartons).toBe(108);
    expect(r88.totalDispatchCartons).toBe(24);
    expect(r88.totalDeliveredCartons).toBe(132);
    expect(r88.totalBalanceCartons).toBe(0);
    expect(r88.completionPercent).toBe(100);
    expect(r88.isCompleted).toBe(true);
  });
});
