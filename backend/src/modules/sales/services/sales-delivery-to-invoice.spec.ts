import { BadRequestException } from '@nestjs/common';
import { SalesDeliveryService } from './sales-delivery.service';
import { SalesInvoiceService } from './sales-invoice.service';

describe('Sales Delivery -> Sales Invoice End-to-End Flow', () => {
  const COMP_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const DN_ID = '33333333-3333-3333-3333-333333333333';
  const SO_ID = '44444444-4444-4444-4444-444444444444';
  const DIV_ID = '55555555-5555-5555-5555-555555555555';
  const CUST_ID = '66666666-6666-6666-6666-666666666666';
  const MASTER_CUST_ID = '77777777-7777-7777-7777-777777777777';

  function buildDeliveryRecord(overrides: any = {}) {
    return {
      id: DN_ID,
      companyId: COMP_ID,
      deliveryNumber: 'DN-2026-00002',
      gatePassNumber: 'GP-14705',
      salesOrderId: SO_ID,
      salesOrder: {
        id: SO_ID,
        orderNumber: 'SOC-2026-05813',
        divisionId: DIV_ID,
        division: { id: DIV_ID, name: 'Spoke Division' },
      },
      customerId: CUST_ID,
      customer: {
        id: CUST_ID,
        companyId: COMP_ID,
        customerCode: 'CUS-ASA-005',
        companyName: 'ALI SHAH AUTOS',
        creditDays: 0,
      },
      deliveryDate: '2026-10-01',
      expectedDate: '2026-10-10',
      // Deliberately stale header subtotal/taxAmount matching DN-2026-00002 bug:
      subtotal: 472000,
      taxAmount: 0,
      totalAmount: 472000,
      status: 'CONFIRMED',
      lines: [
        {
          id: 'l-1',
          lineNumber: 1,
          itemId: '88888888-8888-8888-8888-888888888881',
          item: { itemCode: 'SPI-FG-SPK-003', name: '250X18 Inn / Out Spoke Butted' },
          description: '250X18 Inn / Out Spoke Butted__CD-250X17 Nipple',
          quantity: 200,
          uomId: '99999999-9999-9999-9999-999999999991',
          uom: { code: 'GRS' },
          unitPrice: 1000,
          taxAmount: 36000,
          lineTotal: 236000,
        },
        {
          id: 'l-2',
          lineNumber: 2,
          itemId: '88888888-8888-8888-8888-888888888882',
          item: { itemCode: 'SPI-FG-SPK-002', name: '250X17 Inn / Out Spoke Butted' },
          description: '250X17 Inn / Out Spoke Butted__CD-250X17 Nipple',
          quantity: 200,
          uomId: '99999999-9999-9999-9999-999999999991',
          uom: { code: 'GRS' },
          unitPrice: 1000,
          taxAmount: 36000,
          lineTotal: 236000,
        },
      ],
      ...overrides,
    };
  }

  function makeQb(getRawOneVal: any = { maxNum: 3 }) {
    const qb: any = {
      withDeleted: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(getRawOneVal),
      getRawMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    return qb;
  }

  it('converts Delivery Note into Sales Invoice using .withDeleted() sequence, exact line tax/subtotal, Gate Pass, Division, Payment Terms, and Invoice Lines', async () => {
    const delivery = buildDeliveryRecord();
    const deliveryRepo: any = {
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    const qb = makeQb({ maxNum: 3 });
    const invoiceRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn(() => qb),
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (inv) => ({ ...inv, id: 'inv-new-1' })),
    };
    const invoiceLineRepo: any = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (lines) => lines),
    };
    const customerMasterRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: MASTER_CUST_ID,
        customerCode: 'CUS-ASA-005',
        paymentTerms: 'Net 15 Days',
        creditDays: 15,
      }),
    };

    const deliveryService = new SalesDeliveryService(
      deliveryRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      invoiceRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      invoiceLineRepo,
      customerMasterRepo,
    );

    jest.spyOn(deliveryService, 'findOne').mockResolvedValue(delivery as any);

    const created: any = await deliveryService.convertToInvoice(
      DN_ID,
      USER_ID,
      COMP_ID,
      'ALL',
      { invoiceDate: '2026-11-22' },
    );

    const year = new Date().getFullYear();
    expect(qb.withDeleted).toHaveBeenCalled();
    expect(created.invoiceNo).toBe(`SI-${year}-00004`);
    expect(created.salesDeliveryId).toBe(DN_ID);
    expect(created.deliveryNumber).toBe('DN-2026-00002');
    expect(created.gatePassNumber).toBe('GP-14705');
    expect(created.divisionId).toBe(DIV_ID);
    expect(created.salesOrderId).toBe(SO_ID);
    expect(created.paymentTerms).toBe('Net 15 Days');
    expect(created.dueDate).toBe('2026-12-07');
    expect(created.subtotal).toBe(400000);
    expect(created.taxAmount).toBe(72000);
    expect(created.totalAmount).toBe(472000);
    expect(created.balance).toBe(472000);
    expect(created.status).toBe('Pending');

    expect(invoiceLineRepo.save).toHaveBeenCalledTimes(1);
    const savedLines = invoiceLineRepo.save.mock.calls[0][0];
    expect(savedLines).toHaveLength(2);
    expect(savedLines[0].itemCode).toBe('SPI-FG-SPK-003');
    expect(savedLines[0].socNumber).toBe('SOC-2026-05813');
    expect(savedLines[0].uomCode).toBe('GRS');
    expect(savedLines[0].taxRate).toBe(18);
    expect(savedLines[0].taxAmount).toBe(36000);
    expect(savedLines[0].lineTotal).toBe(236000);
  });

  it('prevents duplicate conversion when Delivery Note is already converted to an active invoice', async () => {
    const delivery = buildDeliveryRecord();
    const invoiceRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 'inv-existing',
        invoiceNo: 'SI-2026-00004',
        salesDeliveryId: DN_ID,
        status: 'Pending',
      }),
      save: jest.fn(),
    };
    const deliveryService = new SalesDeliveryService(
      { manager: { query: jest.fn().mockResolvedValue([]) } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      invoiceRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest.spyOn(deliveryService, 'findOne').mockResolvedValue(delivery as any);

    await expect(deliveryService.convertToInvoice(DN_ID, USER_ID, COMP_ID, 'ALL')).rejects.toThrow(
      BadRequestException,
    );
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('enriches SalesInvoiceService.findAll() with DN#, GP#, SOC#, Division, Payment Terms, and live statusCounts', async () => {
    const listQb = makeQb();
    const rawInv = {
      id: 'inv-1',
      companyId: COMP_ID,
      invoiceNo: 'SI-2026-00004',
      salesOrderId: SO_ID,
      salesOrder: { orderNumber: 'SOC-2026-05813', division: { name: 'Spoke Division' } },
      salesDeliveryId: DN_ID,
      deliveryNumber: 'DN-2026-00002',
      gatePassNumber: 'GP-14705',
      customerId: CUST_ID,
      customer: { customerCode: 'CUS-ASA-005', companyName: 'ALI SHAH AUTOS', creditDays: 0 },
      invoiceDate: '2026-11-22',
      dueDate: '2026-11-22',
      subtotal: 400000,
      taxAmount: 72000,
      totalAmount: 472000,
      paidAmount: 0,
      balance: 472000,
      status: 'Pending',
      lines: [
        {
          id: 'il-1',
          lineNumber: 1,
          itemCode: 'SPI-FG-SPK-003',
          description: '250X18 Inn / Out Spoke Butted',
          quantity: 200,
          uomCode: 'GRS',
          unitPrice: 1000,
          taxRate: 18,
          taxAmount: 36000,
          lineTotal: 236000,
        },
      ],
    };
    listQb.getManyAndCount.mockResolvedValue([[rawInv], 1]);

    const countQb = makeQb();
    countQb.getRawMany.mockResolvedValue([
      { statusKey: 'pending', cnt: '2' },
      { statusKey: 'paid', cnt: '1' },
    ]);

    let qbCall = 0;
    const repo: any = {
      createQueryBuilder: jest.fn(() => {
        qbCall += 1;
        return qbCall === 1 ? listQb : countQb;
      }),
    };

    const invoiceService = new SalesInvoiceService(
      repo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
    );

    const res = await invoiceService.findAll({ companyId: COMP_ID, search: 'GP-14705' });
    expect(res.total).toBe(1);
    expect(res.statusCounts).toMatchObject({ all: 3, pending: 2, paid: 1 });
    expect((res.data[0] as any).divisionName).toBe('Spoke Division');
    expect((res.data[0] as any).deliveryNumber).toBe('DN-2026-00002');
    expect((res.data[0] as any).gatePassNumber).toBe('GP-14705');
    expect((res.data[0] as any).socNumber).toBe('SOC-2026-05813');
    expect((res.data[0] as any).items[0].itemCode).toBe('SPI-FG-SPK-003');
  });
});
