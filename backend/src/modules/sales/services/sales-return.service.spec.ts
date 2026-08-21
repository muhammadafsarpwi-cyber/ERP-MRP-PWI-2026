import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesReturnService } from './sales-return.service';
import { SalesReturn, SalesReturnLine, SalesCustomer, SalesOrder, SalesInvoice } from '../entities';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesReturnService', () => {
  let service: SalesReturnService;
  let repo: jest.Mocked<Repository<SalesReturn>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;

  const UUID_SR = 'd0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'd0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'd0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'd0000000-0000-0000-0000-000000000030';
  const UUID_NOT_FOUND = 'd0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'CUST-0001', companyName: 'Test Customer',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'USD',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockReturn: SalesReturn = {
    id: UUID_SR, companyId: UUID_COMPANY, customerId: UUID_CUST, salesOrderId: null,
    salesInvoiceId: null, returnNumber: 'SR-2026-00001', returnDate: '2026-08-20',
    reason: 'Defective product', subtotal: 500, taxAmount: 50, totalAmount: 550,
    notes: null, status: 'DRAFT', createdBy: UUID_USER, updatedBy: UUID_USER,
    approvedBy: null, approvedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    customer: null as never, salesOrder: null as never, salesInvoice: null as never,
    lines: [],
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
        SalesReturnService,
        { provide: getRepositoryToken(SalesReturn), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesReturnLine), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesInvoice), useValue: makeMockRepo() },
      ],
    }).compile();

    service = module.get<SalesReturnService>(SalesReturnService);
    repo = module.get(getRepositoryToken(SalesReturn));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new return', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      repo.create.mockReturnValue(mockReturn);
      repo.save.mockResolvedValue(mockReturn);
      repo.findOne.mockResolvedValue(mockReturn);
      const result = await service.create({ companyId: UUID_COMPANY, customerId: UUID_CUST, lines: [] }, UUID_USER);
      expect(result).toEqual(mockReturn);
    });

    it('should throw if customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ companyId: UUID_COMPANY, customerId: UUID_NOT_FOUND, lines: [] })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a return by id', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      const result = await service.findOne(UUID_SR);
      expect(result).toEqual(mockReturn);
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('workflow transitions', () => {
    it('DRAFT -> APPROVED', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      repo.save.mockResolvedValue({ ...mockReturn, status: 'APPROVED' });
      const result = await service.approve(UUID_SR, UUID_USER);
      expect(result.status).toBe('APPROVED');
    });

    it('APPROVED -> RECEIVED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'APPROVED' });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'RECEIVED' });
      const result = await service.receive(UUID_SR, UUID_USER);
      expect(result.status).toBe('RECEIVED');
    });

    it('RECEIVED -> REFUNDED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'RECEIVED' });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'REFUNDED' });
      const result = await service.refund(UUID_SR, UUID_USER);
      expect(result.status).toBe('REFUNDED');
    });

    it('cancel from DRAFT', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      repo.save.mockResolvedValue({ ...mockReturn, status: 'CANCELLED' });
      const result = await service.cancel(UUID_SR, UUID_USER);
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw if approve on non-DRAFT', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'APPROVED' });
      await expect(service.approve(UUID_SR)).rejects.toThrow(BadRequestException);
    });

    it('should throw if receive on non-APPROVED', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      await expect(service.receive(UUID_SR)).rejects.toThrow(BadRequestException);
    });

    it('should throw if refund on non-RECEIVED', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      await expect(service.refund(UUID_SR)).rejects.toThrow(BadRequestException);
    });

    it('should throw if cancel on CANCELLED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'CANCELLED' });
      await expect(service.cancel(UUID_SR)).rejects.toThrow(BadRequestException);
    });

    it('should throw if cancel on REFUNDED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'REFUNDED' });
      await expect(service.cancel(UUID_SR)).rejects.toThrow(BadRequestException);
    });
  });
});
