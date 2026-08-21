import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import { SalesOrder, SalesOrderItem, SalesCustomer } from '../entities';
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
    shipToAddress: null, billToAddress: null, currency: 'USD',
    subtotal: 5000, discountAmount: 0, taxAmount: 500, freightAmount: 0,
    totalAmount: 5500, notes: null, status: 'Draft', createdBy: UUID_USER,
    updatedBy: UUID_USER, createdAt: new Date(), updatedAt: new Date(),
    paymentTermId: null, salesRepId: null,
    customer: null as never, items: [],
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
    it('should create a new order', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      repo.create.mockReturnValue(mockOrder);
      repo.save.mockResolvedValue(mockOrder);
      repo.findOne.mockResolvedValue(mockOrder);
      const result = await service.create({ companyId: UUID_COMPANY, customerId: UUID_CUST, items: [] }, UUID_USER);
      expect(result).toEqual(mockOrder);
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

    it('Processing -> Shipped', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Processing' });
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Shipped' });
      const result = await service.ship(UUID_SO, UUID_USER);
      expect(result.status).toBe('Shipped');
    });

    it('Shipped -> Delivered', async () => {
      repo.findOne.mockResolvedValue({ ...mockOrder, status: 'Shipped' });
      repo.save.mockResolvedValue({ ...mockOrder, status: 'Delivered' });
      const result = await service.deliver(UUID_SO, UUID_USER);
      expect(result.status).toBe('Delivered');
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
});
