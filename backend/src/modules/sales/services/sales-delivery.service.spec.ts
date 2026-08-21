import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesDeliveryService } from './sales-delivery.service';
import { SalesDelivery, SalesDeliveryLine, SalesCustomer, SalesOrder } from '../entities';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesDeliveryService', () => {
  let service: SalesDeliveryService;
  let repo: jest.Mocked<Repository<SalesDelivery>>;
  let lineRepo: jest.Mocked<Repository<SalesDeliveryLine>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;

  const UUID_DN = 'c0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'c0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'c0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'c0000000-0000-0000-0000-000000000030';
  const UUID_ITEM = 'c0000000-0000-0000-0000-000000000040';
  const UUID_UOM = 'c0000000-0000-0000-0000-000000000050';
  const UUID_WH = 'c0000000-0000-0000-0000-000000000060';
  const UUID_LINE = 'c0000000-0000-0000-0000-000000000070';
  const UUID_NOT_FOUND = 'c0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'CUST-0001', companyName: 'Test Customer',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'USD',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockDelivery: SalesDelivery = {
    id: UUID_DN, companyId: UUID_COMPANY, customerId: UUID_CUST, salesOrderId: null,
    deliveryNumber: 'DN-2026-00001', deliveryDate: '2026-08-20', expectedDate: null,
    warehouseId: UUID_WH, shipToAddress: null, carrier: null, trackingNumber: null,
    notes: null, subtotal: 1000, taxAmount: 0, totalAmount: 1000, status: 'DRAFT',
    createdBy: UUID_USER, updatedBy: UUID_USER, receivedBy: null, receivedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    customer: null as never, salesOrder: null as never, lines: [], warehouse: null as never,
  };

  const mockLine: SalesDeliveryLine = {
    id: UUID_LINE, deliveryId: UUID_DN, lineNumber: 1, itemId: UUID_ITEM,
    description: null, quantity: 10, uomId: UUID_UOM, warehouseId: UUID_WH,
    unitPrice: 100, taxAmount: 0, lineTotal: 1000,
    createdAt: new Date(),
    delivery: null as never, item: null as never, uom: null as never, warehouse: null as never,
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

  let balanceService: jest.Mocked<InventoryBalanceService>;
  let ledgerService: jest.Mocked<StockLedgerService>;

  beforeEach(async () => {
    balanceService = { updateBalance: jest.fn(), getAvailableStock: jest.fn() } as any;
    ledgerService = { create: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesDeliveryService,
        { provide: getRepositoryToken(SalesDelivery), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesDeliveryLine), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
        { provide: InventoryBalanceService, useValue: balanceService },
        { provide: StockLedgerService, useValue: ledgerService },
      ],
    }).compile();

    service = module.get<SalesDeliveryService>(SalesDeliveryService);
    repo = module.get(getRepositoryToken(SalesDelivery));
    lineRepo = module.get(getRepositoryToken(SalesDeliveryLine));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new delivery', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      repo.create.mockReturnValue(mockDelivery);
      repo.save.mockResolvedValue(mockDelivery);
      repo.findOne.mockResolvedValue(mockDelivery);
      const result = await service.create({ companyId: UUID_COMPANY, customerId: UUID_CUST, lines: [] }, UUID_USER);
      expect(result).toEqual(mockDelivery);
    });

    it('should throw if customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ companyId: UUID_COMPANY, customerId: UUID_NOT_FOUND, lines: [] })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a delivery by id', async () => {
      repo.findOne.mockResolvedValue(mockDelivery);
      const result = await service.findOne(UUID_DN);
      expect(result).toEqual(mockDelivery);
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a DRAFT delivery', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DRAFT' });
      repo.save.mockResolvedValue({ ...mockDelivery, carrier: 'FedEx' });
      const result = await service.update(UUID_DN, { carrier: 'FedEx' }, UUID_USER);
      expect(result.carrier).toBe('FedEx');
    });

    it('should throw if not DRAFT', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'SHIPPED' });
      await expect(service.update(UUID_DN, { carrier: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('workflow transitions', () => {
    it('DRAFT -> SHIPPED', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DRAFT' });
      repo.save.mockResolvedValue({ ...mockDelivery, status: 'SHIPPED' });
      const result = await service.ship(UUID_DN, UUID_USER);
      expect(result.status).toBe('SHIPPED');
    });

    it('SHIPPED -> DELIVERED', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'SHIPPED' });
      repo.save.mockResolvedValue({ ...mockDelivery, status: 'DELIVERED' });
      const result = await service.deliver(UUID_DN, UUID_USER);
      expect(result.status).toBe('DELIVERED');
    });

    it('should throw if ship on non-DRAFT', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'SHIPPED' });
      await expect(service.ship(UUID_DN)).rejects.toThrow(BadRequestException);
    });

    it('should throw if deliver on non-SHIPPED', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DRAFT' });
      await expect(service.deliver(UUID_DN)).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirm with inventory', () => {
    it('should create ledger entry and deduct balance for each line', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DELIVERED' });
      lineRepo.find.mockResolvedValue([mockLine]);
      repo.save.mockResolvedValue({ ...mockDelivery, status: 'CONFIRMED' });

      const result = await service.confirm(UUID_DN, UUID_USER);

      expect(ledgerService.create).toHaveBeenCalledWith(expect.objectContaining({
        companyId: UUID_COMPANY,
        transactionType: 'SALES_DELIVERY',
        direction: 'OUT',
        itemId: UUID_ITEM,
        warehouseId: UUID_WH,
        quantity: 10,
        uomId: UUID_UOM,
      }));
      expect(balanceService.updateBalance).toHaveBeenCalledWith(
        UUID_COMPANY, UUID_ITEM, UUID_WH, null, null, UUID_UOM, 10, 'OUT',
      );
      expect(result.status).toBe('CONFIRMED');
    });

    it('should throw if delivery has no lines', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DELIVERED' });
      lineRepo.find.mockResolvedValue([]);
      await expect(service.confirm(UUID_DN, UUID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should throw if no warehouse assigned', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DELIVERED', warehouseId: null });
      lineRepo.find.mockResolvedValue([mockLine]);
      await expect(service.confirm(UUID_DN, UUID_USER)).rejects.toThrow(BadRequestException);
    });

    it('should throw if not DELIVERED status', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'DRAFT' });
      await expect(service.confirm(UUID_DN)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a SHIPPED delivery', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'SHIPPED' });
      repo.save.mockResolvedValue({ ...mockDelivery, status: 'CANCELLED' });
      const result = await service.cancel(UUID_DN, UUID_USER);
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw if already CONFIRMED', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'CONFIRMED' });
      await expect(service.cancel(UUID_DN)).rejects.toThrow(BadRequestException);
    });

    it('should throw if already CANCELLED', async () => {
      repo.findOne.mockResolvedValue({ ...mockDelivery, status: 'CANCELLED' });
      await expect(service.cancel(UUID_DN)).rejects.toThrow(BadRequestException);
    });
  });
});
