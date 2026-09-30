import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SalesAnalyticsService } from './sales-analytics.service';
import {
  SalesOrder, SalesOrderItem,
  SalesDelivery, SalesDeliveryLine,
  SalesInvoice,
  SalesQuotation,
  SalesReturn, SalesReturnLine,
  SalesCustomer,
} from '../entities';
import { ProductionOrder } from '../../production/entities/production-order.entity';
import { InventoryBalance } from '../../inventory/entities/inventory-balance.entity';
import { CustomerLedgerEntry } from '../../customer/entities/customer-ledger.entity';
import { Item, ItemType } from '../../item/entities/item.entity';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { CustomerRankingMetric } from '../dto/sales-analytics.dto';

describe('SalesAnalyticsService', () => {
  let service: SalesAnalyticsService;
  let returnRepoMock: any;
  let returnLineRepoMock: any;
  let itemRepoMock: any;

  const COMPANY_ID = '7725aa04-a270-4314-9e82-90949cbe7791';
  const CUST_ID = '4ca4b449-07af-4f00-a007-6842d9f9c39f';
  const ITEM_ID = '079c0ac6-1f62-49f4-8f58-1bdec1c828fe';

  const mockMakeRepo = (records: any[] = []) => ({
    find: jest.fn().mockResolvedValue(records),
    findOne: jest.fn().mockResolvedValue(records[0] || null),
    createQueryBuilder: jest.fn(() => ({
      // PROMPT #27 — the dashboard's invoice query now joins the billing order
      // so a division-restricted caller only sees their own invoices; the
      // builder mock has to tolerate that join. `mockReturnThis()` keeps the
      // chain intact and, like the sibling methods, records the call so a
      // future assertion can check the scope was applied to the joined alias.
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      // The "recent invoices" block of the dashboard orders and limits after
      // the scope clause, so the shared builder mock has to chain those too.
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(records),
    })),
  });

  const mockCustomerLedgerService = {
    getStatement: jest.fn().mockResolvedValue({
      entries: [],
      openingBalance: 0,
      closingBalance: 0,
    }),
  };

  beforeEach(async () => {
    const mockOrder: Partial<SalesOrder> = {
      id: 'so-1',
      companyId: COMPANY_ID,
      customerId: CUST_ID,
      orderNumber: 'SO-2026-00001',
      orderDate: '2026-08-20',
      status: 'Confirmed',
      totalAmount: 10000,
      items: [
        {
          id: 'soi-1',
          salesOrderId: 'so-1',
          itemId: ITEM_ID,
          quantity: 100,
          shippedQuantity: 40,
          lineTotal: 10000,
          unitPrice: 100,
          item: { itemCode: 'FG-001', name: 'Finished Widget' } as any,
        } as any,
      ],
    };

    const mockItem: Partial<Item> = {
      id: ITEM_ID,
      companyId: COMPANY_ID,
      itemCode: 'FG-001',
      name: 'Finished Widget',
      itemType: ItemType.FINISHED_GOOD,
      isSellable: true,
      safetyStockLevel: 20,
      baseUom: { code: 'PCS', name: 'Pieces' } as any,
    };

    const mockSalesCustomer: Partial<SalesCustomer> = {
      id: CUST_ID,
      companyId: COMPANY_ID,
      customerCode: 'SC-0001',
      companyName: 'Acme Industries',
    };

    const mockCustomerMaster: Partial<Customer> = {
      id: 'cm-1',
      companyId: COMPANY_ID,
      customerCode: 'CUST-0001',
      name: 'Acme Industries',
      status: 'ACTIVE',
      paymentTerms: 'Net 30 Days',
    };

    const mockBalance: Partial<InventoryBalance> = {
      id: 'ib-1',
      companyId: COMPANY_ID,
      itemId: ITEM_ID,
      onHand: 150,
      reserved: 10,
      available: 140,
    };

    const mockDelivery: Partial<SalesDelivery> = {
      id: 'sd-1',
      companyId: COMPANY_ID,
      customerId: CUST_ID,
      deliveryNumber: 'DN-2026-00001',
      deliveryDate: '2026-08-25',
      status: 'Delivered',
      totalAmount: 4000,
    };

    const mockDeliveryLine: Partial<SalesDeliveryLine> = {
      id: 'sdl-1',
      deliveryId: 'sd-1',
      itemId: ITEM_ID,
      quantity: 40,
      lineTotal: 4000,
    };

    const mockInvoice: Partial<SalesInvoice> = {
      id: 'si-1',
      companyId: COMPANY_ID,
      customerId: CUST_ID,
      invoiceNo: 'SI-2026-00001',
      invoiceDate: '2026-08-26',
      totalAmount: 4000,
      paidAmount: 1500,
      status: 'Partial',
    };

    const mockProdOrder: Partial<ProductionOrder> = {
      id: 'po-1',
      companyId: COMPANY_ID,
      productId: ITEM_ID,
      salesOrderItemId: 'soi-1',
      plannedQuantity: 100,
      completedQuantity: 60,
      status: 'IN_PROGRESS' as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: mockMakeRepo([mockOrder]) },
        { provide: getRepositoryToken(SalesOrderItem), useValue: mockMakeRepo(mockOrder.items) },
        { provide: getRepositoryToken(SalesDelivery), useValue: mockMakeRepo([mockDelivery]) },
        { provide: getRepositoryToken(SalesDeliveryLine), useValue: mockMakeRepo([mockDeliveryLine]) },
        { provide: getRepositoryToken(SalesInvoice), useValue: mockMakeRepo([mockInvoice]) },
        { provide: getRepositoryToken(SalesQuotation), useValue: mockMakeRepo([]) },
        { provide: getRepositoryToken(SalesReturn), useValue: mockMakeRepo([]) },
        { provide: getRepositoryToken(SalesReturnLine), useValue: mockMakeRepo([]) },
        { provide: getRepositoryToken(SalesCustomer), useValue: mockMakeRepo([mockSalesCustomer]) },
        { provide: getRepositoryToken(ProductionOrder), useValue: mockMakeRepo([mockProdOrder]) },
        { provide: getRepositoryToken(InventoryBalance), useValue: mockMakeRepo([mockBalance]) },
        { provide: getRepositoryToken(CustomerLedgerEntry), useValue: mockMakeRepo([]) },
        { provide: getRepositoryToken(Item), useValue: mockMakeRepo([mockItem]) },
        { provide: getRepositoryToken(Customer), useValue: mockMakeRepo([mockCustomerMaster]) },
        { provide: CustomerLedgerService, useValue: mockCustomerLedgerService },
      ],
    }).compile();

    service = module.get<SalesAnalyticsService>(SalesAnalyticsService);
    returnRepoMock = module.get(getRepositoryToken(SalesReturn));
    returnLineRepoMock = module.get(getRepositoryToken(SalesReturnLine));
    itemRepoMock = module.get(getRepositoryToken(Item));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSalesDashboard', () => {
    it('should aggregate executive KPIs and return sales pipeline stages', async () => {
      const dashboard = await service.getSalesDashboard(COMPANY_ID);
      expect(dashboard).toBeDefined();
      expect(dashboard.kpis).toBeDefined();
      expect(dashboard.kpis.totalSalesOrders).toBe(1);
      expect(dashboard.kpis.invoicedAmount).toBe(4000);
      expect(dashboard.kpis.paidAmount).toBe(1500);
      expect(dashboard.kpis.outstandingAmount).toBe(2500);

      // Verify sales pipeline stages
      expect(dashboard.salesPipeline).toHaveLength(9);
      const stageNames = dashboard.salesPipeline.map(p => p.stage);
      expect(stageNames).toEqual([
        'QUOTATION', 'SALES_ORDER', 'PRODUCTION', 'FINISHED_GOODS',
        'DELIVERY', 'INVOICE', 'SALES_RETURN', 'CREDIT_NOTE', 'PAYMENT',
      ]);
    });
  });

  describe('getCustomerSalesAnalytics', () => {
    it('should calculate customer-wise ordered, produced, delivered, invoiced, paid, and outstanding', async () => {
      const analytics = await service.getCustomerSalesAnalytics(COMPANY_ID);
      expect(analytics).toHaveLength(1);
      const cust = analytics[0];
      expect(cust.customerCode).toBe('SC-0001');
      expect(cust.customerName).toBe('Acme Industries');
      expect(cust.orderedQuantity).toBe(100);
      expect(cust.producedQuantity).toBe(60);
      expect(cust.deliveredQuantity).toBe(40);
      expect(cust.invoicedAmount).toBe(4000);
      expect(cust.paidAmount).toBe(1500);
      expect(cust.outstandingAmount).toBe(2500);
    });
  });

  describe('getItemSalesAnalysis', () => {
    it('should calculate item-wise sales, net sold quantity, and average selling price', async () => {
      const items = await service.getItemSalesAnalysis(COMPANY_ID);
      expect(items).toHaveLength(1);
      const item = items[0];
      expect(item.itemCode).toBe('FG-001');
      expect(item.orderedQuantity).toBe(100);
      expect(item.deliveredQuantity).toBe(40);
      expect(item.netSoldQuantity).toBe(40);
      expect(item.salesAmount).toBe(4000);
      expect(item.averageSellingPrice).toBe(100);
      expect(item.finishedGoodsAvailable).toBe(140);
    });
  });

  describe('getCustomerRankings', () => {
    it('should rank customers dynamically based on selected metric', async () => {
      const rankings = await service.getCustomerRankings(COMPANY_ID, CustomerRankingMetric.SALES_AMOUNT);
      expect(rankings).toHaveLength(1);
      expect(rankings[0].rank).toBe(1);
      expect(rankings[0].customerName).toBe('Acme Industries');
      expect(rankings[0].metricValue).toBe(4000);
    });
  });

  describe('getOrderFulfillmentAnalysis', () => {
    it('should calculate fulfillment percentage and remaining delivery quantity', async () => {
      const fulfillment = await service.getOrderFulfillmentAnalysis(COMPANY_ID);
      expect(fulfillment).toHaveLength(1);
      const order = fulfillment[0];
      expect(order.orderNumber).toBe('SO-2026-00001');
      expect(order.orderedQuantity).toBe(100);
      expect(order.deliveredQuantity).toBe(40);
      expect(order.remainingDeliveryQuantity).toBe(60);
      expect(order.fulfillmentPercentage).toBe(40);
    });
  });

  describe('getFinishedGoodsAvailability', () => {
    it('should calculate open orders, safety stock, required stock, and status', async () => {
      const planning = await service.getFinishedGoodsAvailability(COMPANY_ID);
      expect(planning).toHaveLength(1);
      const fg = planning[0];
      expect(fg.itemCode).toBe('FG-001');
      expect(fg.onHand).toBe(150);
      expect(fg.safetyStock).toBe(20);
      expect(fg.openSalesOrderQuantity).toBe(60); // 100 - 40
      expect(fg.requiredStock).toBe(80); // 60 + 20
      expect(fg.projectedBalance).toBe(60); // 140 available - 80 required
      expect(fg.status).toBe('ABOVE_REQUIREMENT');
    });
  });

  describe('getCustomerOutstandingReport', () => {
    it('should generate customer outstanding report matching invoices', async () => {
      const report = await service.getCustomerOutstandingReport(COMPANY_ID);
      expect(report).toHaveLength(1);
      expect(report[0].customerCode).toBe('SC-0001');
      expect(report[0].invoiceAmount).toBe(4000);
      expect(report[0].paidAmount).toBe(1500);
      expect(report[0].outstanding).toBe(2500);
    });

    it('should subtract posted credit notes and source payment terms/status from the master customer', async () => {
      const creditNotes = [
        { id: 'ret-1', customerId: CUST_ID, status: 'CREDITED', creditPosted: true, totalAmount: 500 },
        { id: 'ret-2', customerId: CUST_ID, status: 'DRAFT', creditPosted: false, totalAmount: 999 },
      ];
      returnRepoMock.find.mockResolvedValue(creditNotes);
      // PROMPT #27 — the report now reads returns through a query builder so it
      // can join the source order and apply the caller's division scope; the
      // fixture has to travel on that path too. The expected numbers are
      // unchanged — only how the rows are fetched.
      returnRepoMock.createQueryBuilder.mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(creditNotes),
      });

      const report = await service.getCustomerOutstandingReport(COMPANY_ID);
      // 4000 invoiced - 1500 paid - 500 credited = 2000 (the DRAFT return must not reduce it)
      expect(report[0].creditAmount).toBe(500);
      expect(report[0].outstanding).toBe(2000);
      expect(report[0].paymentTerms).toBe('Net 30 Days');
      expect(report[0].customerStatus).toBe('ACTIVE');
    });
  });

  describe('return status filtering (committed returns only)', () => {
    it('should not count DRAFT returns in customer analytics', async () => {
      returnRepoMock.find.mockResolvedValue([
        { id: 'ret-1', customerId: CUST_ID, status: 'DRAFT', totalAmount: 500, creditPosted: false },
      ]);
      returnLineRepoMock.find.mockResolvedValue([
        { id: 'rl-1', returnId: 'ret-1', itemId: ITEM_ID, quantity: 5, lineTotal: 500 },
      ]);

      const analytics = await service.getCustomerSalesAnalytics(COMPANY_ID);
      expect(analytics[0].returnedQuantity).toBe(0);
      expect(analytics[0].returnAmount).toBe(0);
      expect(analytics[0].netSoldQuantity).toBe(40);
    });

    it('should count legacy mixed-case Approved returns in customer analytics', async () => {
      returnRepoMock.find.mockResolvedValue([
        { id: 'ret-1', customerId: CUST_ID, status: 'Approved', totalAmount: 500, creditPosted: false },
      ]);
      returnLineRepoMock.find.mockResolvedValue([
        { id: 'rl-1', returnId: 'ret-1', itemId: ITEM_ID, quantity: 5, lineTotal: 500 },
      ]);

      const analytics = await service.getCustomerSalesAnalytics(COMPANY_ID);
      expect(analytics[0].returnedQuantity).toBe(5);
      expect(analytics[0].returnAmount).toBe(500);
      expect(analytics[0].netSoldQuantity).toBe(35);
    });

    it('should exclude DRAFT returns from dashboard return KPIs', async () => {
      returnRepoMock.createQueryBuilder.mockReturnValue({
        // PROMPT #27 — the returns query joins the source order so a
        // division-restricted caller only sees their own returns.
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'ret-1', status: 'DRAFT', totalAmount: 500, creditPosted: false, creditNoteNumber: null },
        ]),
      });

      const dashboard = await service.getSalesDashboard(COMPANY_ID);
      expect(dashboard.kpis.returnCount).toBe(0);
      expect(dashboard.kpis.returnAmount).toBe(0);
      expect(dashboard.kpis.creditNotesCount).toBe(0);
    });

    it('should exclude DRAFT return lines from item analytics', async () => {
      returnRepoMock.find.mockResolvedValue([{ id: 'ret-1', status: 'DRAFT' }]);
      returnLineRepoMock.createQueryBuilder.mockReturnValue({
        // PROMPT #27 — joins added for the division scope; see the note above.
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: 'rl-1', returnId: 'ret-1', itemId: ITEM_ID, quantity: 5, lineTotal: 500 },
        ]),
      });

      const items = await service.getItemSalesAnalysis(COMPANY_ID);
      expect(items[0].returnedQuantity).toBe(0);
      expect(items[0].netSoldQuantity).toBe(40);
    });
  });

  describe('getCustomerItemMatrix', () => {
    it('should allocate invoiced/paid/outstanding from invoices and produced from production orders', async () => {
      const matrix = await service.getCustomerItemMatrix(COMPANY_ID);
      expect(matrix).toHaveLength(1);
      expect(matrix[0].ordered).toBe(100);
      expect(matrix[0].produced).toBe(60); // production completion, not shippedQuantity (40)
      expect(matrix[0].delivered).toBe(40);
      expect(matrix[0].netSold).toBe(40);
      expect(matrix[0].invoiced).toBe(4000);
      expect(matrix[0].paid).toBe(1500);
      expect(matrix[0].outstanding).toBe(2500);
    });
  });
});
