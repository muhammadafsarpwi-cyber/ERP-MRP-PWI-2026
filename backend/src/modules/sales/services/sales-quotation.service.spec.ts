import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesQuotationService } from './sales-quotation.service';
import { SalesQuotation, SalesQuotationItem, SalesCustomer, SalesOrder } from '../entities';
import { SalesOrderService } from './sales-order.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesQuotationService', () => {
  let service: SalesQuotationService;
  let repo: jest.Mocked<Repository<SalesQuotation>>;
  let itemRepo: jest.Mocked<Repository<SalesQuotationItem>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let salesOrderService: { create: jest.Mock; findOne: jest.Mock };

  const UUID_QT = 'a0000000-0000-0000-0000-000000000001';
  const UUID_SO = 'a0000000-0000-0000-0000-000000000002';
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
    salesOrderService = {
      create: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesQuotationService,
        { provide: getRepositoryToken(SalesQuotation), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesQuotationItem), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesCustomer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
        { provide: SalesOrderService, useValue: salesOrderService },
      ],
    }).compile();

    service = module.get<SalesQuotationService>(SalesQuotationService);
    repo = module.get(getRepositoryToken(SalesQuotation));
    itemRepo = module.get(getRepositoryToken(SalesQuotationItem));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
    orderRepo = module.get(getRepositoryToken(SalesOrder));
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

  describe('convertToSalesOrder', () => {
    const mockAcceptedQuotationWithItems: SalesQuotation = {
      ...mockQuotation,
      status: 'Accepted',
      items: [
        {
          id: 'item-line-1',
          quotationId: UUID_QT,
          lineNumber: 1,
          itemId: 'item-uuid-1',
          description: 'Galvanized Wire 3mm',
          quantity: 50,
          uomId: 'uom-uuid-1',
          unitPrice: 200,
          discountPercent: 5,
          taxAmount: 500,
          lineTotal: 10000,
          deliveryDate: null,
          createdAt: new Date(),
          quotation: null as never,
          item: null as never,
          uom: null as never,
        },
      ],
    };

    const mockCreatedOrder: SalesOrder = {
      id: UUID_SO,
      companyId: UUID_COMPANY,
      orderNumber: 'SO-2026-00001',
      customerId: UUID_CUST,
      quotationId: UUID_QT,
      orderDate: '2026-08-21',
      deliveryDate: null,
      customerPo: null,
      shipToAddress: null,
      billToAddress: null,
      currency: 'USD',
      subtotal: 10000,
      discountAmount: 500,
      taxAmount: 500,
      freightAmount: 0,
      totalAmount: 10000,
      status: 'Draft',
      paymentTermId: null,
      salesRepId: null,
      notes: 'Converted from Quotation QT-2026-00001',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: UUID_USER,
      updatedBy: UUID_USER,
      customer: null as never,
      divisionId: null,
      division: null as never,
      sectionId: null,
      section: null as never,
      items: [],
    };

    it('should convert an Accepted quotation into a Sales Order and update quotation status to Converted', async () => {
      repo.findOne.mockResolvedValue({ ...mockAcceptedQuotationWithItems });
      orderRepo.findOne.mockResolvedValue(null); // No existing order
      salesOrderService.create.mockResolvedValue(mockCreatedOrder);
      repo.save.mockResolvedValue({ ...mockAcceptedQuotationWithItems, status: 'Converted' });

      const result = await service.convertToSalesOrder(UUID_QT, UUID_USER, UUID_COMPANY);

      expect(result.isExisting).toBe(false);
      expect(result.salesOrder).toEqual(mockCreatedOrder);
      expect(salesOrderService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: UUID_COMPANY,
          customerId: UUID_CUST,
          quotationId: UUID_QT,
          subtotal: 1000,
          totalAmount: 1100,
        }),
        UUID_USER,
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'Converted' }),
      );
    });

    it('should return existing Sales Order if quotation is already converted (idempotency)', async () => {
      repo.findOne.mockResolvedValue({ ...mockAcceptedQuotationWithItems, status: 'Converted' });
      orderRepo.findOne.mockResolvedValue(mockCreatedOrder); // Order already exists!

      const result = await service.convertToSalesOrder(UUID_QT, UUID_USER, UUID_COMPANY);

      expect(result.isExisting).toBe(true);
      expect(result.salesOrder).toEqual(mockCreatedOrder);
      expect(salesOrderService.create).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if quotation is not in Accepted status', async () => {
      repo.findOne.mockResolvedValue({ ...mockAcceptedQuotationWithItems, status: 'Draft' });
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.convertToSalesOrder(UUID_QT, UUID_USER, UUID_COMPANY)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if quotation has no items', async () => {
      repo.findOne.mockResolvedValue({ ...mockAcceptedQuotationWithItems, status: 'Accepted', items: [] });
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.convertToSalesOrder(UUID_QT, UUID_USER, UUID_COMPANY)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCustomerQuotationSummary', () => {
    it('should calculate customer quotation counts and total amounts', async () => {
      const mockQuotations = [
        { ...mockQuotation, id: 'q1', status: 'Draft', totalAmount: 1000 },
        { ...mockQuotation, id: 'q2', status: 'Sent', totalAmount: 2000 },
        { ...mockQuotation, id: 'q3', status: 'Accepted', totalAmount: 3000 },
        { ...mockQuotation, id: 'q4', status: 'Converted', totalAmount: 4000 },
        { ...mockQuotation, id: 'q5', status: 'Rejected', totalAmount: 1500 },
        { ...mockQuotation, id: 'q6', status: 'Cancelled', totalAmount: 500 },
      ];
      repo.find.mockResolvedValue(mockQuotations as any);

      const summary = await service.getCustomerQuotationSummary(UUID_CUST, UUID_COMPANY);

      expect(summary.totalQuotations).toBe(6);
      expect(summary.draftCount).toBe(1);
      expect(summary.sentCount).toBe(1);
      expect(summary.acceptedCount).toBe(1);
      expect(summary.convertedCount).toBe(1);
      expect(summary.rejectedCount).toBe(1);
      expect(summary.cancelledCount).toBe(1);
      expect(summary.totalQuotedValue).toBe(12000);
      expect(summary.totalConvertedValue).toBe(4000);
    });
  });
});
