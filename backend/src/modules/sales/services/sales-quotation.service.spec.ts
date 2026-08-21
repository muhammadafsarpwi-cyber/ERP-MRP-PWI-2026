import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesQuotationService } from './sales-quotation.service';
import { SalesQuotation, SalesQuotationItem, SalesCustomer } from '../entities';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesQuotationService', () => {
  let service: SalesQuotationService;
  let repo: jest.Mocked<Repository<SalesQuotation>>;
  let itemRepo: jest.Mocked<Repository<SalesQuotationItem>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;

  const UUID_QT = 'a0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'a0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'a0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'a0000000-0000-0000-0000-000000000030';
  const UUID_NOT_FOUND = 'a0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'CUST-0001', companyName: 'Test Customer',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'USD',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockQuotation: SalesQuotation = {
    id: UUID_QT, companyId: UUID_COMPANY, customerId: UUID_CUST, quotationNumber: 'QT-2026-00001',
    quotationDate: '2026-08-20', validUntil: '2026-09-20', currency: 'USD',
    subtotal: 1000, discountAmount: 0, taxAmount: 100, totalAmount: 1100,
    notes: null, salesRepId: null, status: 'Draft', createdBy: UUID_USER,
    createdAt: new Date(), updatedAt: new Date(),
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
        SalesQuotationService,
        { provide: getRepositoryToken(SalesQuotation), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesQuotationItem), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
      ],
    }).compile();

    service = module.get<SalesQuotationService>(SalesQuotationService);
    repo = module.get(getRepositoryToken(SalesQuotation));
    itemRepo = module.get(getRepositoryToken(SalesQuotationItem));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new quotation', async () => {
      const dto = { companyId: UUID_COMPANY, customerId: UUID_CUST, items: [] };
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      repo.create.mockReturnValue(mockQuotation);
      repo.save.mockResolvedValue(mockQuotation);
      repo.findOne.mockResolvedValue(mockQuotation);

      const result = await service.create(dto, UUID_USER);
      expect(result).toEqual(mockQuotation);
    });

    it('should throw BadRequestException if customer not found', async () => {
      const dto = { companyId: UUID_COMPANY, customerId: UUID_NOT_FOUND, items: [] };
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create(dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a quotation by id', async () => {
      repo.findOne.mockResolvedValue(mockQuotation);
      const result = await service.findOne(UUID_QT);
      expect(result).toEqual(mockQuotation);
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a draft quotation', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      repo.save.mockResolvedValue({ ...mockQuotation, notes: 'updated' });
      const result = await service.update(UUID_QT, { notes: 'updated' }, UUID_USER);
      expect(result.notes).toBe('updated');
    });

    it('should throw BadRequestException if not Draft status', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Sent' });
      await expect(service.update(UUID_QT, { notes: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('submit', () => {
    it('should submit a Draft quotation to Sent', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      repo.save.mockResolvedValue({ ...mockQuotation, status: 'Sent' });
      const result = await service.submit(UUID_QT);
      expect(result.status).toBe('Sent');
    });

    it('should throw if not Draft', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Accepted' });
      await expect(service.submit(UUID_QT)).rejects.toThrow(BadRequestException);
    });
  });

  describe('accept', () => {
    it('should accept a Sent quotation', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Sent' });
      repo.save.mockResolvedValue({ ...mockQuotation, status: 'Accepted' });
      const result = await service.accept(UUID_QT);
      expect(result.status).toBe('Accepted');
    });

    it('should throw if not Sent', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      await expect(service.accept(UUID_QT)).rejects.toThrow(BadRequestException);
    });
  });

  describe('reject', () => {
    it('should reject a Sent quotation', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Sent' });
      repo.save.mockResolvedValue({ ...mockQuotation, status: 'Rejected' });
      const result = await service.reject(UUID_QT);
      expect(result.status).toBe('Rejected');
    });

    it('should throw if not Sent', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      await expect(service.reject(UUID_QT)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a Draft quotation', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      repo.save.mockResolvedValue({ ...mockQuotation, status: 'Cancelled' });
      const result = await service.cancel(UUID_QT);
      expect(result.status).toBe('Cancelled');
    });

    it('should throw if already Cancelled or Accepted', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Cancelled' });
      await expect(service.cancel(UUID_QT)).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should remove a Draft quotation', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Draft' });
      repo.remove.mockResolvedValue(mockQuotation);
      await service.remove(UUID_QT);
      expect(repo.remove).toHaveBeenCalled();
    });

    it('should throw if not Draft', async () => {
      repo.findOne.mockResolvedValue({ ...mockQuotation, status: 'Sent' });
      await expect(service.remove(UUID_QT)).rejects.toThrow(BadRequestException);
    });
  });
});
