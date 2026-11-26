import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import { SalesOrder, SalesOrderItem, SalesCustomer, SalesQuotation, SalesDelivery, SalesDeliveryLine, SalesInvoice } from '../entities';
import { ProductionOrder } from '../../production/entities/production-order.entity';
import { ProductionOrderService } from '../../production/services/production-order.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { NotificationsService } from '../../notification/notifications.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesOrderService', () => {
  let service: SalesOrderService;
  let repo: jest.Mocked<Repository<SalesOrder>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;

  const UUID_SO = 'b0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'b0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'b0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'b0000000-0000-0000-0000-000000000030';
  const UUID_NOT_FOUND = 'b0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'CUST-0001', companyName: 'Test Customer',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'USD',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockOrder: SalesOrder = {
    id: UUID_SO, companyId: UUID_COMPANY, customerId: UUID_CUST, orderNumber: 'SO-2026-00001',
    quotationId: null, orderDate: '2026-08-20', deliveryDate: null,
    customerPo: null, customerPoDate: null,
    shipToAddress: null, billToAddress: null, currency: 'USD',
    subtotal: 5000, discountAmount: 0, taxAmount: 500, freightAmount: 0,
    totalAmount: 5500, notes: null, status: 'Draft', createdBy: UUID_USER,
    updatedBy: UUID_USER, createdAt: new Date(), updatedAt: new Date(),
    paymentTermId: null, salesRepId: null,
    divisionId: null, division: null as never, sectionId: null, section: null as never,
    customer: null as never, items: [],
    deletedAt: null, deletedBy: null,
  };

  const makeMockRepo = () => ({
    find: jest.fn(), findOne: jest.fn(), create: jest.fn(), save: jest.fn(),
    remove: jest.fn(), createQueryBuilder: jest.fn(() => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawOne: jest.fn().mockResolvedValue({ maxNum: null }),
      select: jest.fn().mockReturnThis(),
    })),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesQuotation), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesDelivery), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesDeliveryLine), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesInvoice), useValue: makeMockRepo() },
        { provide: getRepositoryToken(ProductionOrder), useValue: makeMockRepo() },
        { provide: ProductionOrderService, useValue: { create: jest.fn() } },
        { provide: InventoryBalanceService, useValue: { getAvailableStock: jest.fn().mockResolvedValue(100) } },
        { provide: NotificationsService, useValue: { notifyActiveUsers: jest.fn() } },
      ],
    }).compile();

    service = module.get<SalesOrderService>(SalesOrderService);
    repo = module.get(getRepositoryToken(SalesOrder));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new order and persist customerPo and customerPoDate', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      const orderWithPo: SalesOrder = { ...mockOrder, customerPo: 'PO-2026-0412', customerPoDate: '2026-11-20' };
      repo.create.mockReturnValue(orderWithPo);
      repo.save.mockResolvedValue(orderWithPo);
      repo.findOne.mockResolvedValueOnce(null).mockResolvedValue(orderWithPo);
      const result = await service.create(
        {
          companyId: UUID_COMPANY,
          customerId: UUID_CUST,
          customerPo: '  PO-2026-0412  ',
          customerPoDate: '2026-11-20',
          items: [],
        },
        UUID_USER,
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerPo: 'PO-2026-0412',
          customerPoDate: '2026-11-20',
        }),
      );
      expect(result).toEqual(orderWithPo);
    });

    it('should throw if customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ companyId: UUID_COMPANY, customerId: UUID_NOT_FOUND, items: [] })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return an order by id', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      const result = await service.findOne(UUID_SO);
      expect(result).toEqual(mockOrder);
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a Draft order', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      repo.save.mockResolvedValue({ ...mockOrder, notes: 'updated' });
      const result = await service.update(UUID_SO, { notes: 'updated' }, UUID_USER);
      expect(result.notes).toBe('updated');
    });

    it('should throw if not Draft', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Confirmed' });
      await expect(service.update(UUID_SO, { notes: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('workflow transitions', () => {
    it('Draft -> Confirmed', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Confirmed' });
      const result = await service.confirm(UUID_SO, UUID_USER);
      expect(result.status).toBe('Confirmed');
    });

    it('Confirmed -> Processing', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Confirmed' });
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Processing' });
      const result = await service.process(UUID_SO, UUID_USER);
      expect(result.status).toBe('Processing');
    });

    it('blocks Processing -> Shipped when no confirmed Sales Deliveries exist', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Processing', items: [] });
      await expect(service.ship(UUID_SO, UUID_USER)).rejects.toThrow(BadRequestException);
    });

    it('allows Processing -> Shipped when a confirmed Sales Delivery exists', async () => {
      const deliveryRepo = (service as any).deliveryRepo as jest.Mocked<Repository<SalesDelivery>>;
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Processing', items: [] });
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'd0000000-0000-0000-0000-000000000001',
          salesOrderId: UUID_SO,
          status: 'CONFIRMED',
          lines: [],
        } as any,
      ]);
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Shipped' });
      const result = await service.ship(UUID_SO, UUID_USER);
      expect(result.status).toBe('Shipped');
    });

    it('blocks Shipped -> Delivered when ordered items are not 100% covered by confirmed deliveries', async () => {
      const deliveryRepo = (service as any).deliveryRepo as jest.Mocked<Repository<SalesDelivery>>;
      const itemRepo = (service as any).itemRepo as jest.Mocked<Repository<SalesOrderItem>>;
      const item1: any = { id: 'i-1', itemId: 'prod-1', quantity: 144500, shippedQuantity: 25500, status: 'Partial' };
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Shipped', items: [item1] });
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'd0000000-0000-0000-0000-000000000002',
          salesOrderId: UUID_SO,
          status: 'CONFIRMED',
          lines: [{ id: 'dl-1', itemId: 'prod-1', quantity: 25500, description: '[SOC: SO-2026-00001]' }],
        } as any,
      ]);

      await expect(service.deliver(UUID_SO, UUID_USER)).rejects.toThrow(BadRequestException);
      expect(itemRepo.save).not.toHaveBeenCalled();
    });

    it('allows Shipped -> Delivered when confirmed Sales Deliveries fulfill 100% of ordered items', async () => {
      const deliveryRepo = (service as any).deliveryRepo as jest.Mocked<Repository<SalesDelivery>>;
      const itemRepo = (service as any).itemRepo as jest.Mocked<Repository<SalesOrderItem>>;
      const item1: any = { id: 'i-1', itemId: 'prod-1', quantity: 24500, shippedQuantity: 24500, status: 'Partial' };
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Shipped', items: [item1] });
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'd0000000-0000-0000-0000-000000000003',
          salesOrderId: UUID_SO,
          status: 'CONFIRMED',
          lines: [{ id: 'dl-1', itemId: 'prod-1', quantity: 24500, description: '[SOC: SO-2026-00001]' }],
        } as any,
      ]);
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Delivered' });
      const result = await service.deliver(UUID_SO, UUID_USER);
      expect(result.status).toBe('Delivered');
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'i-1', shippedQuantity: 24500, status: 'Delivered' }),
      );
    });

    it('revertDeliveredOrder restores prematurely Delivered order to Processing and recalculates multi-SOC item shipped balances', async () => {
      const deliveryRepo = (service as any).deliveryRepo as jest.Mocked<Repository<SalesDelivery>>;
      const itemRepo = (service as any).itemRepo as jest.Mocked<Repository<SalesOrderItem>>;
      const itemFull: any = { id: 'soi-1', itemId: 'ccd-fgr-001', quantity: 24500, shippedQuantity: 24500, status: 'Delivered' };
      const itemCorrupted: any = { id: 'soi-2', itemId: 'ccd-fgr-011', quantity: 144500, shippedQuantity: 144500, status: 'Delivered' };

      const deliveredSoc: SalesOrder = {
        ...mockOrder,
        orderNumber: 'SOC-2026-05298',
        status: 'Delivered',
        items: [itemFull, itemCorrupted],
      };

      repo.findOne
        .mockResolvedValueOnce(deliveredSoc)
        .mockResolvedValueOnce({
          ...deliveredSoc,
          status: 'Processing',
          items: [
            { ...itemFull, shippedQuantity: 24500, status: 'Delivered' },
            { ...itemCorrupted, shippedQuantity: 25500, status: 'Partial' },
          ],
        });

      deliveryRepo.find.mockResolvedValue([
        {
          id: 'dn-52',
          salesOrderId: UUID_SO,
          status: 'CONFIRMED',
          lines: [
            { id: 'l-1', itemId: 'ccd-fgr-001', quantity: 24500, description: '5 MM PVC [SOC: SOC-2026-05298]' },
            { id: 'l-2', itemId: 'ccd-fgr-001', quantity: 5500, description: '5 MM PVC [SOC: SOC-2026-05555]' },
          ],
        } as any,
        {
          id: 'dn-69',
          salesOrderId: UUID_SO,
          status: 'CONFIRMED',
          lines: [
            { id: 'l-3', itemId: 'ccd-fgr-011', quantity: 25500, description: '7 MM PVC [SOC: SOC-2026-5298]' },
          ],
        } as any,
      ]);
      repo.save.mockImplementation(async (o: any) => o);
      itemRepo.save.mockImplementation(async (it: any) => it);

      const reverted = await service.revertDeliveredOrder(UUID_SO, UUID_USER, UUID_COMPANY);

      expect(reverted.status).toBe('Processing');
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'soi-1', shippedQuantity: 24500, status: 'Delivered' }),
      );
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'soi-2', shippedQuantity: 25500, status: 'Partial' }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: UUID_SO, status: 'Processing', updatedBy: UUID_USER }),
      );
    });

    it('revertDeliveredOrder restores zero-delivery Delivered order to Confirmed with 0 shipped quantities', async () => {
      const deliveryRepo = (service as any).deliveryRepo as jest.Mocked<Repository<SalesDelivery>>;
      const itemRepo = (service as any).itemRepo as jest.Mocked<Repository<SalesOrderItem>>;
      const item1: any = { id: 'soi-zero', itemId: 'prod-1', quantity: 1000, shippedQuantity: 1000, status: 'Delivered' };

      repo.findOne
        .mockResolvedValueOnce({ ...mockOrder, status: 'Delivered', items: [item1] })
        .mockResolvedValueOnce({
          ...mockOrder,
          status: 'Confirmed',
          items: [{ ...item1, shippedQuantity: 0, status: 'Pending' }],
        });
      deliveryRepo.find.mockResolvedValue([]);
      repo.save.mockImplementation(async (o: any) => o);
      itemRepo.save.mockImplementation(async (it: any) => it);

      const reverted = await service.revertDeliveredOrder(UUID_SO, UUID_USER, UUID_COMPANY);
      expect(reverted.status).toBe('Confirmed');
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'soi-zero', shippedQuantity: 0, status: 'Pending' }),
      );
    });

    it('Delivered -> Closed', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Delivered' });
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Closed' });
      const result = await service.close(UUID_SO, UUID_USER);
      expect(result.status).toBe('Closed');
    });

    it('cancel from Draft', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Cancelled' });
      const result = await service.cancel(UUID_SO, UUID_USER);
      expect(result.status).toBe('Cancelled');
    });

    it('should throw when canceling Closed order', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Closed' });
      await expect(service.cancel(UUID_SO)).rejects.toThrow(BadRequestException);
    });

    it('should throw when confirming non-Draft order', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Confirmed' });
      await expect(service.confirm(UUID_SO)).rejects.toThrow(BadRequestException);
    });

    it('should throw when processing non-Confirmed order', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      await expect(service.process(UUID_SO)).rejects.toThrow(BadRequestException);
    });

    it('should throw when shipping non-Processing order', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      await expect(service.ship(UUID_SO)).rejects.toThrow(BadRequestException);
    });

    it('should throw when delivering non-Shipped order', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      await expect(service.deliver(UUID_SO)).rejects.toThrow(BadRequestException);
    });

    it('should throw when closing non-Delivered order', async () => {
      repo.findOne.mockResolvedValue(mockOrder);
      await expect(service.close(UUID_SO)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove (Recycle Bin)', () => {
    it('recycles a Draft order and stamps who did it', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Draft' });
      repo.save.mockImplementation(async (row: any) => row);

      const result = await service.remove(UUID_SO, UUID_USER, UUID_COMPANY);

      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(result.deletedBy).toBe(UUID_USER);
    });

    it('REFUSES a confirmed order — it may already have downstream deliveries', async () => {
      for (const status of ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Closed', 'Cancelled']) {
        repo.findOne.mockResolvedValue({ ...mockOrder, status });
        await expect(service.remove(UUID_SO, UUID_USER)).rejects.toThrow(BadRequestException);
      }
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll — global multi-page server-side sorting', () => {
    it('applies ORDER BY across all filtered rows BEFORE LIMIT/OFFSET and preserves hydrated ID order', async () => {
      const sqlCalls: Array<{ sql: string; params: any[] }> = [];
      const orderHigh: SalesOrder = { ...mockOrder, id: 'b0000000-0000-0000-0000-000000000002', orderNumber: 'SOC-2026-05900', totalAmount: 16254500 };
      const orderLow: SalesOrder = { ...mockOrder, id: 'b0000000-0000-0000-0000-000000000003', orderNumber: 'SOC-2026-05801', totalAmount: 120000 };

      (repo as any).manager = {
        query: jest.fn(async (sql: string, params: any[]) => {
          sqlCalls.push({ sql, params });
          if (sql.includes('COUNT(so.id)')) return [{ total: 42 }];
          return [{ id: orderHigh.id }, { id: orderLow.id }];
        }),
      };
      // Return hydrated rows in reverse order to verify ID-order preservation
      repo.find.mockResolvedValue([orderLow, orderHigh]);

      const res = await service.findAll({
        companyId: UUID_COMPANY,
        page: 1,
        limit: 20,
        sortBy: 'totalAmount',
        sortOrder: 'DESC',
      });

      expect(res.total).toBe(42);
      expect(res.data.map((r) => r.id)).toEqual([orderHigh.id, orderLow.id]);
      const pageQuery = sqlCalls.find((c) => c.sql.includes('ORDER BY'));
      expect(pageQuery).toBeDefined();
      expect(pageQuery!.sql).toContain('COALESCE(so.total_amount, 0) DESC');
      expect(pageQuery!.sql).toMatch(/ORDER BY[\s\S]+LIMIT \$2 OFFSET \$3/);
      expect(pageQuery!.params).toEqual([UUID_COMPANY, 20, 0]);
    });

    it('supports sorting by orderDate, orderNumber (natural), division, customer, and totalQty', async () => {
      const executedSql: string[] = [];
      (repo as any).manager = {
        query: jest.fn(async (sql: string) => {
          executedSql.push(sql);
          if (sql.includes('COUNT(so.id)')) return [{ total: 1 }];
          return [{ id: mockOrder.id }];
        }),
      };
      repo.find.mockResolvedValue([mockOrder]);

      for (const [sortBy, expectedFragment] of [
        ['orderDate', 'so.order_date ASC NULLS LAST'],
        ['orderNumber', "SUBSTRING(so.order_number FROM '([0-9]+)$')"],
        ['division', "LOWER(COALESCE(division.name, '')) ASC"],
        ['customer', "LOWER(COALESCE(customer.company_name, '')) ASC"],
        ['totalQty', 'SELECT SUM(soi.quantity) FROM erp_sales.sales_order_items soi'],
      ] as const) {
        executedSql.length = 0;
        await service.findAll({ companyId: UUID_COMPANY, page: 2, limit: 20, sortBy, sortOrder: 'ASC' });
        const pageSql = executedSql.find((s) => s.includes('ORDER BY')) || '';
        expect(pageSql).toContain(expectedFragment);
      }
    });
  });
});
