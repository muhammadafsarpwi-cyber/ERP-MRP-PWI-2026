import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesInvoiceService } from './sales-invoice.service';
import { SalesInvoice, SalesCustomer, SalesOrder } from '../entities';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesInvoiceService', () => {
  let service: SalesInvoiceService;
  let repo: jest.Mocked<Repository<SalesInvoice>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;

  const UUID_INV = 'e0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'e0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'e0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'e0000000-0000-0000-0000-000000000030';
  const UUID_NOT_FOUND = 'e0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'CUST-0001', companyName: 'Test Customer',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'USD',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockInvoice: SalesInvoice = {
    id: UUID_INV, companyId: UUID_COMPANY, customerId: UUID_CUST, salesOrderId: null,
    invoiceNo: 'SI-2026-00001', invoiceDate: '2026-08-20', dueDate: '2026-09-20',
    subtotal: 5000, discountAmount: 0, taxAmount: 500, totalAmount: 5500,
    paidAmount: 0, balance: 5500, status: 'Pending', createdBy: UUID_USER,
    createdAt: new Date(), updatedAt: new Date(),
    customer: null as never, salesOrder: null as never,
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
        SalesInvoiceService,
        { provide: getRepositoryToken(SalesInvoice), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
      ],
    }).compile();

    service = module.get<SalesInvoiceService>(SalesInvoiceService);
    repo = module.get(getRepositoryToken(SalesInvoice));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
    orderRepo = module.get(getRepositoryToken(SalesOrder));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new invoice', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      repo.create.mockReturnValue(mockInvoice);
      repo.save.mockResolvedValue(mockInvoice);
      repo.findOne.mockResolvedValue(mockInvoice);
      const result = await service.create({ companyId: UUID_COMPANY, customerId: UUID_CUST }, UUID_USER);
      expect(result).toEqual(mockInvoice);
    });

    it('should throw if customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ companyId: UUID_COMPANY, customerId: UUID_NOT_FOUND })).rejects.toThrow(BadRequestException);
    });

    it('should throw if salesOrderId provided but not found', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.create({ companyId: UUID_COMPANY, customerId: UUID_CUST, salesOrderId: UUID_NOT_FOUND })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return an invoice by id', async () => {
      repo.findOne.mockResolvedValue(mockInvoice);
      const result = await service.findOne(UUID_INV);
      expect(result).toEqual(mockInvoice);
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('non-existent')).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('should update a Pending invoice', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      repo.save.mockResolvedValue({ ...mockInvoice, dueDate: '2026-10-01' });
      const result = await service.update(UUID_INV, { dueDate: '2026-10-01' }, UUID_USER);
      expect(result.dueDate).toBe('2026-10-01');
    });

    it('should throw if not Pending', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Paid' });
      await expect(service.update(UUID_INV, { dueDate: 'x' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('recordPayment', () => {
    it('should record a partial payment', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      repo.save.mockResolvedValue({ ...mockInvoice, paidAmount: 2000, balance: 3500, status: 'Partial' });
      const result = await service.recordPayment(UUID_INV, 2000, UUID_USER);
      expect(result.paidAmount).toBe(2000);
    });

    it('should mark as Paid when full amount paid', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      repo.save.mockResolvedValue({ ...mockInvoice, paidAmount: 5500, balance: 0, status: 'Paid' });
      const result = await service.recordPayment(UUID_INV, 5500, UUID_USER);
      expect(result.status).toBe('Paid');
    });

    it('should throw if amount <= 0', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      await expect(service.recordPayment(UUID_INV, 0)).rejects.toThrow(BadRequestException);
    });

    it('should throw if amount exceeds balance', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      await expect(service.recordPayment(UUID_INV, 10000)).rejects.toThrow(BadRequestException);
    });

    it('should throw if invoice is Cancelled', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Cancelled' });
      await expect(service.recordPayment(UUID_INV, 100)).rejects.toThrow(BadRequestException);
    });
  });

  describe('post', () => {
    it('should post a Pending invoice', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      repo.save.mockResolvedValue({ ...mockInvoice, status: 'Posted' });
      const result = await service.post(UUID_INV, UUID_USER);
      expect(result.status).toBe('Posted');
    });

    it('should throw if not Pending', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Paid' });
      await expect(service.post(UUID_INV)).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should cancel a Pending invoice', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Pending' });
      repo.save.mockResolvedValue({ ...mockInvoice, status: 'Cancelled' });
      const result = await service.cancel(UUID_INV, UUID_USER);
      expect(result.status).toBe('Cancelled');
    });

    it('should throw if already Cancelled', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Cancelled' });
      await expect(service.cancel(UUID_INV)).rejects.toThrow(BadRequestException);
    });

    it('should throw if Paid', async () => {
      repo.findOne.mockResolvedValue({ ...mockInvoice, status: 'Paid' });
      await expect(service.cancel(UUID_INV)).rejects.toThrow(BadRequestException);
    });
  });
});
