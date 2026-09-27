import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesReturnService } from './sales-return.service';
import {
  SalesReturn, SalesReturnLine, SalesCustomer, SalesOrder,
  SalesOrderItem, SalesInvoice, SalesDelivery, SalesDeliveryLine,
} from '../entities';
import { Item } from '../../item/entities/item.entity';
import { Warehouse } from '../../organization/entities/warehouse.entity';
import { Customer } from '../../customer/entities/customer.entity';
import { CustomerLedgerEntry } from '../../customer/entities/customer-ledger.entity';
import { StockLedger } from '../../inventory/entities';
import { StockLedgerService } from '../../inventory/services/stock-ledger.service';
import { InventoryBalanceService } from '../../inventory/services/inventory-balance.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('SalesReturnService', () => {
  let service: SalesReturnService;
  let repo: jest.Mocked<Repository<SalesReturn>>;
  let lineRepo: jest.Mocked<Repository<SalesReturnLine>>;
  let customerRepo: jest.Mocked<Repository<SalesCustomer>>;
  let customerMasterRepo: jest.Mocked<Repository<Customer>>;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let invoiceRepo: jest.Mocked<Repository<SalesInvoice>>;
  let deliveryRepo: jest.Mocked<Repository<SalesDelivery>>;
  let itemRepo: jest.Mocked<Repository<Item>>;
  let warehouseRepo: jest.Mocked<Repository<Warehouse>>;
  let stockLedgerRepo: jest.Mocked<Repository<StockLedger>>;
  let customerLedgerRepo: jest.Mocked<Repository<CustomerLedgerEntry>>;
  let stockLedgerService: jest.Mocked<StockLedgerService>;
  let balanceService: jest.Mocked<InventoryBalanceService>;
  let customerLedgerService: jest.Mocked<CustomerLedgerService>;

  // Transaction machinery: entity -> mocked repository map handed to the
  // EntityManager mock passed into service transactions.
  const entityRegistry = new Map<any, any>();
  const mockManager = {
    getRepository: jest.fn((entity: any) => {
      const registered = entityRegistry.get(entity);
      if (!registered) throw new Error(`No mock repository registered for ${entity?.name || entity}`);
      return registered;
    }),
    query: jest.fn().mockResolvedValue(undefined),
  };
  const mockTransaction = jest.fn(async (cb: (m: any) => Promise<any>) => cb(mockManager));

  const UUID_SR = 'd0000000-0000-0000-0000-000000000001';
  const UUID_COMPANY = 'd0000000-0000-0000-0000-000000000010';
  const UUID_CUST = 'd0000000-0000-0000-0000-000000000020';
  const UUID_USER = 'd0000000-0000-0000-0000-000000000030';
  const UUID_ITEM = 'd0000000-0000-0000-0000-000000000040';
  const UUID_WH = 'd0000000-0000-0000-0000-000000000050';
  const UUID_UOM = 'd0000000-0000-0000-0000-000000000060';
  const UUID_INV = 'd0000000-0000-0000-0000-000000000070';
  const UUID_NOT_FOUND = 'd0000000-0000-0000-0000-000000000099';

  const mockCustomer: SalesCustomer = {
    id: UUID_CUST, companyId: UUID_COMPANY, customerCode: 'SC-0001', companyName: 'Test Customer Ltd',
    contactPerson: null, email: 'test@test.com', phone: null, mobile: null,
    billingAddress: null, shippingAddress: null, city: null, state: null, country: null,
    postalCode: null, taxId: null, creditLimit: 0, creditDays: 0, currency: 'PKR',
    customerType: 'B2B', status: 'Active', isActive: true,
    createdAt: new Date(), updatedAt: new Date(), createdBy: null, updatedBy: null,
  };

  const mockMasterCustomer: any = {
    id: UUID_CUST,
    companyId: UUID_COMPANY,
    customerCode: 'CUST-0001',
    name: 'Test Customer Ltd',
    currencyCode: 'PKR',
  };

  const mockWarehouse: any = {
    id: UUID_WH,
    companyId: UUID_COMPANY,
    name: 'Finished Goods Warehouse',
  };

  const mockReturn: any = {
    id: UUID_SR, companyId: UUID_COMPANY, customerId: UUID_CUST, salesOrderId: null,
    salesInvoiceId: UUID_INV, salesDeliveryId: null, returnNumber: 'SR-2026-00001', returnDate: '2026-08-20',
    reason: 'Defective product', subtotal: 500, taxAmount: 50, totalAmount: 550,
    notes: null, status: 'DRAFT', stockPosted: false, creditPosted: false, currency: 'PKR',
    warehouseId: UUID_WH, creditNoteNumber: null, creditNoteDate: null,
    createdBy: UUID_USER, updatedBy: UUID_USER,
    approvedBy: null, approvedAt: null,
    createdAt: new Date(), updatedAt: new Date(),
    customer: mockCustomer, salesOrder: null, salesInvoice: null, salesDelivery: null, warehouse: mockWarehouse,
    lines: [
      {
        id: 'line-1',
        returnId: UUID_SR,
        itemId: UUID_ITEM,
        quantity: 5,
        unitPrice: 100,
        taxAmount: 10,
        lineTotal: 510,
        uomId: UUID_UOM,
        condition: 'GOOD',
      },
    ],
  };

  const makeMockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    create: jest.fn((dto) => ({ ...dto, id: UUID_SR })),
    save: jest.fn((entity) => Promise.resolve(entity)),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    manager: { transaction: mockTransaction },
    createQueryBuilder: jest.fn(() => ({
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
        { provide: getRepositoryToken(Customer), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesInvoice), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesDelivery), useValue: makeMockRepo() },
        { provide: getRepositoryToken(SalesDeliveryLine), useValue: makeMockRepo() },
        { provide: getRepositoryToken(Item), useValue: makeMockRepo() },
        { provide: getRepositoryToken(Warehouse), useValue: makeMockRepo() },
        { provide: getRepositoryToken(StockLedger), useValue: makeMockRepo() },
        { provide: getRepositoryToken(CustomerLedgerEntry), useValue: makeMockRepo() },
        {
          provide: StockLedgerService,
          useValue: {
            create: jest.fn().mockResolvedValue({ id: 'sl-1' }),
          },
        },
        {
          provide: InventoryBalanceService,
          useValue: {
            updateBalance: jest.fn().mockResolvedValue({ id: 'bal-1' }),
          },
        },
        {
          provide: CustomerLedgerService,
          useValue: {
            recordEntry: jest.fn().mockResolvedValue({ id: 'cle-1' }),
            getSummary: jest.fn().mockResolvedValue({ outstandingBalance: 45000 }),
          },
        },
      ],
    }).compile();

    service = module.get<SalesReturnService>(SalesReturnService);
    repo = module.get(getRepositoryToken(SalesReturn));
    lineRepo = module.get(getRepositoryToken(SalesReturnLine));
    customerRepo = module.get(getRepositoryToken(SalesCustomer));
    customerMasterRepo = module.get(getRepositoryToken(Customer));
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    invoiceRepo = module.get(getRepositoryToken(SalesInvoice));
    deliveryRepo = module.get(getRepositoryToken(SalesDelivery));
    itemRepo = module.get(getRepositoryToken(Item));
    warehouseRepo = module.get(getRepositoryToken(Warehouse));
    stockLedgerRepo = module.get(getRepositoryToken(StockLedger));
    customerLedgerRepo = module.get(getRepositoryToken(CustomerLedgerEntry));
    stockLedgerService = module.get(StockLedgerService);
    balanceService = module.get(InventoryBalanceService);
    customerLedgerService = module.get(CustomerLedgerService);

    entityRegistry.set(SalesReturn, repo);
    entityRegistry.set(SalesReturnLine, lineRepo);
    entityRegistry.set(SalesInvoice, invoiceRepo);
    entityRegistry.set(Customer, customerMasterRepo);
    entityRegistry.set(CustomerLedgerEntry, customerLedgerRepo);
    mockManager.query.mockClear();
    mockManager.getRepository.mockClear();
    mockTransaction.mockClear();

    orderRepo.findOne.mockResolvedValue({ id: 'so-1', companyId: UUID_COMPANY } as any);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new return in DRAFT status against valid invoice and delivered quantity', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      invoiceRepo.findOne.mockResolvedValue({
        id: UUID_INV,
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesOrderId: 'so-1',
        invoiceNo: 'SI-2026-00001',
      } as any);
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'del-1',
          salesOrderId: 'so-1',
          lines: [
            {
              id: 'dl-1',
              itemId: UUID_ITEM,
              quantity: 10,
              unitPrice: 100,
              item: { itemCode: 'ITEM-1', name: 'Item 1' },
            },
          ],
        } as any,
      ]);
      repo.find.mockResolvedValue([]); // no prior returns
      repo.create.mockReturnValue({ ...mockReturn, status: 'DRAFT' });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'DRAFT' });
      repo.findOne.mockResolvedValue(mockReturn);

      const result = await service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesInvoiceId: UUID_INV,
        lines: [
          {
            itemId: UUID_ITEM,
            quantity: 5,
            uomId: UUID_UOM,
            unitPrice: 100,
          },
        ],
      }, UUID_USER);

      expect(result).toBeDefined();
      expect(result.returnNumber).toBe('SR-2026-00001');
    });

    it('should throw if customer not found', async () => {
      customerRepo.findOne.mockResolvedValue(null);
      await expect(service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_NOT_FOUND,
        salesInvoiceId: UUID_INV,
        lines: [{ itemId: UUID_ITEM, quantity: 1, uomId: UUID_UOM, unitPrice: 10 }],
      })).rejects.toThrow(BadRequestException);
    });

    it('should throw if sales invoice is missing', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      await expect(service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        lines: [{ itemId: UUID_ITEM, quantity: 1, uomId: UUID_UOM, unitPrice: 10 }],
      })).rejects.toThrow(/Sales invoice is required/);
    });

    it('should throw if return quantity is zero or negative', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      invoiceRepo.findOne.mockResolvedValue({
        id: UUID_INV,
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesOrderId: 'so-1',
        invoiceNo: 'SI-2026-00001',
      } as any);
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'del-1',
          salesOrderId: 'so-1',
          lines: [{ id: 'dl-1', itemId: UUID_ITEM, quantity: 10, unitPrice: 100, item: { itemCode: 'ITEM-1', name: 'Item 1' } }],
        } as any,
      ]);

      await expect(service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesInvoiceId: UUID_INV,
        lines: [{ itemId: UUID_ITEM, quantity: 0, uomId: UUID_UOM, unitPrice: 10 }],
      })).rejects.toThrow(/greater than zero/);
    });

    it('should throw if return quantity exceeds delivered quantity', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      invoiceRepo.findOne.mockResolvedValue({
        id: UUID_INV,
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesOrderId: 'so-1',
        invoiceNo: 'SI-2026-00001',
      } as any);
      deliveryRepo.find.mockResolvedValue([
        {
          id: 'del-1',
          salesOrderId: 'so-1',
          lines: [{ id: 'dl-1', itemId: UUID_ITEM, quantity: 10, unitPrice: 100, item: { itemCode: 'ITEM-1', name: 'Item 1' } }],
        } as any,
      ]);
      repo.find.mockResolvedValue([]); // no prior returns

      await expect(service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesInvoiceId: UUID_INV,
        lines: [{ itemId: UUID_ITEM, quantity: 15, uomId: UUID_UOM, unitPrice: 10 }],
      })).rejects.toThrow(/exceeds maximum returnable quantity/);
    });

    it('should throw if lines are empty', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      invoiceRepo.findOne.mockResolvedValue({
        id: UUID_INV,
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        invoiceNo: 'SI-2026-00001',
      } as any);
      await expect(service.create({
        companyId: UUID_COMPANY,
        customerId: UUID_CUST,
        salesInvoiceId: UUID_INV,
        lines: [],
      })).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a return by id with relations', async () => {
      repo.findOne.mockResolvedValue(mockReturn);
      const result = await service.findOne(UUID_SR);
      expect(result).toBeDefined();
      expect(result.id).toBe(UUID_SR);
      expect(result.stockLedgerEntries).toBeDefined();
    });

    it('should throw BadRequestException for invalid UUID format', async () => {
      await expect(service.findOne('invalid-uuid')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if return does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('00000000-0000-0000-0000-000000000099')).rejects.toThrow(NotFoundException);
    });
  });

  describe('workflow transitions', () => {
    it('DRAFT -> SUBMITTED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'DRAFT' });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'SUBMITTED' });
      const result = await service.submit(UUID_SR, UUID_USER);
      expect(result.status).toBe('SUBMITTED');
    });

    it('SUBMITTED -> APPROVED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'SUBMITTED' });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'APPROVED' });
      const result = await service.approve(UUID_SR, UUID_USER);
      expect(result.status).toBe('APPROVED');
    });

    it('APPROVED -> RECEIVED (Stock In for GOOD condition)', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'APPROVED',
        stockPosted: false,
        lines: mockReturn.lines,
      });
      lineRepo.find.mockResolvedValue(mockReturn.lines);
      repo.save.mockResolvedValue({ ...mockReturn, status: 'RECEIVED', stockPosted: true });

      const result = await service.receiveStock(UUID_SR, UUID_WH, UUID_USER);
      expect(result.status).toBe('RECEIVED');
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(stockLedgerService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'SALES_RETURN',
          direction: 'IN',
          itemId: UUID_ITEM,
          quantity: 5,
        }),
        expect.anything(),
      );
      expect(balanceService.updateBalance).toHaveBeenCalledWith(
        UUID_COMPANY, UUID_ITEM, UUID_WH, null, null, UUID_UOM, 5, 'IN', expect.anything(),
      );
    });

    it('APPROVED -> RECEIVED (Non-GOOD condition: DAMAGED/REJECTED/SCRAP does NOT update sellable FG balance)', async () => {
      const damagedLine = {
        ...mockReturn.lines[0],
        condition: 'DAMAGED',
      };
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'APPROVED',
        stockPosted: false,
        lines: [damagedLine],
      });
      lineRepo.find.mockResolvedValue([damagedLine]);
      repo.save.mockResolvedValue({ ...mockReturn, status: 'RECEIVED', stockPosted: true });

      balanceService.updateBalance.mockClear();
      stockLedgerService.create.mockClear();

      const result = await service.receiveStock(UUID_SR, UUID_WH, UUID_USER);
      expect(result.status).toBe('RECEIVED');
      expect(stockLedgerService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionType: 'SALES_RETURN',
          direction: 'IN',
          itemId: UUID_ITEM,
          quantity: 5,
          notes: expect.stringContaining('DAMAGED'),
        }),
        expect.anything(),
      );
      // Crucial: balanceService.updateBalance must NOT be called for DAMAGED condition!
      expect(balanceService.updateBalance).not.toHaveBeenCalled();
    });

    it('Prevent duplicate stock posting (Idempotency)', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'RECEIVED',
        stockPosted: true,
      });

      await expect(service.receiveStock(UUID_SR, UUID_WH, UUID_USER)).rejects.toThrow(
        /Finished goods stock has already been posted/,
      );
    });

    it('APPROVED/RECEIVED -> CREDITED (Credit Note & Customer Ledger)', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'RECEIVED',
        creditPosted: false,
        stockPosted: true,
        salesInvoice: { id: UUID_INV, invoiceNo: 'SI-2026-00001', balance: 5000 },
      });
      customerMasterRepo.findOne.mockResolvedValue(mockMasterCustomer);
      invoiceRepo.findOne.mockResolvedValue({ id: UUID_INV, invoiceNo: 'SI-2026-00001', balance: 5000, totalAmount: 5000 } as any);
      repo.save.mockResolvedValue({ ...mockReturn, status: 'COMPLETED', creditPosted: true, creditNoteNumber: 'CN-2026-00001' });

      const result = await service.generateCreditNote(UUID_SR, UUID_USER);
      expect(result.creditPosted).toBe(true);
      expect(customerLedgerService.recordEntry).toHaveBeenCalledWith(
        UUID_COMPANY,
        UUID_CUST,
        expect.objectContaining({
          documentType: 'CREDIT_NOTE',
          credit: 550,
        }),
        UUID_USER,
        expect.anything(),
      );
      // Credit Note number generation is serialized per company/year
      expect(mockManager.query).toHaveBeenCalledWith(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [expect.stringContaining(`${UUID_COMPANY}|SALES_CREDIT_NOTE|`)],
      );
    });

    it('Prevent duplicate Credit Note generation (Idempotency)', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'COMPLETED',
        creditPosted: true,
      });

      await expect(service.generateCreditNote(UUID_SR, UUID_USER)).rejects.toThrow(
        /Credit Note has already been generated and posted/,
      );
    });

    it('reject from DRAFT', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'DRAFT', stockPosted: false, creditPosted: false });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'REJECTED' });
      const result = await service.reject(UUID_SR, 'Quality check failed', UUID_USER);
      expect(result.status).toBe('REJECTED');
    });

    it('cancel from DRAFT', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'DRAFT', stockPosted: false, creditPosted: false });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'CANCELLED' });
      const result = await service.cancel(UUID_SR, UUID_USER);
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw if cancel after stock or credit posted', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'RECEIVED', stockPosted: true, creditPosted: false });
      await expect(service.cancel(UUID_SR, UUID_USER)).rejects.toThrow(BadRequestException);
    });

    // ── Illegal-transition matrix (Prompt #7) ──────────────────────────────

    it('DRAFT -> APPROVE is illegal (return must be submitted first)', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'DRAFT', stockPosted: false, creditPosted: false });
      await expect(service.approve(UUID_SR, UUID_USER)).rejects.toThrow(/SUBMITTED status/);
    });

    it.each(['RECEIVED', 'CREDITED', 'COMPLETED', 'REJECTED', 'CANCELLED'])(
      'APPROVE from %s is illegal',
      async (status) => {
        repo.findOne.mockResolvedValue({ ...mockReturn, status, stockPosted: false, creditPosted: false });
        await expect(service.approve(UUID_SR, UUID_USER)).rejects.toThrow(BadRequestException);
      },
    );

    it('APPROVE is idempotent when already APPROVED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'APPROVED' });
      const result = await service.approve(UUID_SR, UUID_USER);
      expect(result.status).toBe('APPROVED');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'CANCELLED'])(
      'RECEIVE from %s is illegal',
      async (status) => {
        repo.findOne.mockResolvedValue({ ...mockReturn, status, stockPosted: false, creditPosted: false });
        lineRepo.find.mockResolvedValue(mockReturn.lines);
        await expect(service.receiveStock(UUID_SR, UUID_WH, UUID_USER)).rejects.toThrow(/Can only receive stock/);
        expect(mockTransaction).not.toHaveBeenCalled();
        expect(stockLedgerService.create).not.toHaveBeenCalled();
      },
    );

    it('CREDITED -> COMPLETED (receiving stock after the credit note is legal)', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'CREDITED',
        stockPosted: false,
        creditPosted: true,
        lines: mockReturn.lines,
      });
      lineRepo.find.mockResolvedValue(mockReturn.lines);

      const result = await service.receiveStock(UUID_SR, UUID_WH, UUID_USER);
      expect(result.status).toBe('COMPLETED');
      expect(result.stockPosted).toBe(true);
      expect(stockLedgerService.create).toHaveBeenCalledTimes(1);
    });

    it.each(['DRAFT', 'SUBMITTED', 'REJECTED', 'CANCELLED', 'COMPLETED'])(
      'CREDIT NOTE from %s is illegal',
      async (status) => {
        repo.findOne.mockResolvedValue({
          ...mockReturn,
          status,
          stockPosted: status === 'COMPLETED',
          creditPosted: status === 'COMPLETED',
        });
        await expect(service.generateCreditNote(UUID_SR, UUID_USER)).rejects.toThrow(BadRequestException);
        expect(customerLedgerService.recordEntry).not.toHaveBeenCalled();
      },
    );

    it.each(['APPROVED', 'RECEIVED', 'CANCELLED'])(
      'REJECT from %s is illegal',
      async (status) => {
        repo.findOne.mockResolvedValue({ ...mockReturn, status, stockPosted: false, creditPosted: false });
        await expect(service.reject(UUID_SR, 'no', UUID_USER)).rejects.toThrow(BadRequestException);
      },
    );

    it('SUBMITTED -> REJECTED is legal', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'SUBMITTED', stockPosted: false, creditPosted: false });
      repo.save.mockResolvedValue({ ...mockReturn, status: 'REJECTED' });
      const result = await service.reject(UUID_SR, 'Damaged on arrival', UUID_USER);
      expect(result.status).toBe('REJECTED');
    });

    it('cancel from REJECTED is illegal (REJECTED is terminal)', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'REJECTED', stockPosted: false, creditPosted: false });
      await expect(service.cancel(UUID_SR, UUID_USER)).rejects.toThrow(/already been rejected/);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('CANCELLING an already CANCELLED return is idempotent', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'CANCELLED', stockPosted: false, creditPosted: false });
      const result = await service.cancel(UUID_SR, UUID_USER);
      expect(result.status).toBe('CANCELLED');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('SUBMIT is idempotent when already SUBMITTED', async () => {
      repo.findOne.mockResolvedValue({ ...mockReturn, status: 'SUBMITTED' });
      const result = await service.submit(UUID_SR, UUID_USER);
      expect(result.status).toBe('SUBMITTED');
      expect(repo.save).not.toHaveBeenCalled();
    });

    // ── Concurrency: idempotency is re-checked under the pessimistic row lock ──

    it('re-checks stock idempotency under the row lock (concurrent receive race)', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockReturn, status: 'APPROVED', stockPosted: false, lines: mockReturn.lines })
        .mockResolvedValueOnce({ ...mockReturn, status: 'APPROVED', stockPosted: true });
      lineRepo.find.mockResolvedValue(mockReturn.lines);

      await expect(service.receiveStock(UUID_SR, UUID_WH, UUID_USER)).rejects.toThrow(/already been posted/);
      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(stockLedgerService.create).not.toHaveBeenCalled();
      expect(balanceService.updateBalance).not.toHaveBeenCalled();
    });

    it('re-checks credit idempotency under the row lock (concurrent credit-note race)', async () => {
      repo.findOne
        .mockResolvedValueOnce({ ...mockReturn, status: 'APPROVED', creditPosted: false })
        .mockResolvedValueOnce({ ...mockReturn, status: 'APPROVED', creditPosted: true });

      await expect(service.generateCreditNote(UUID_SR, UUID_USER)).rejects.toThrow(/already been generated/);
      expect(customerLedgerService.recordEntry).not.toHaveBeenCalled();
      expect(mockManager.query).not.toHaveBeenCalled();
    });

    it('credit note recomputes invoice balance as total - paid - posted credits', async () => {
      repo.findOne.mockResolvedValue({
        ...mockReturn,
        status: 'RECEIVED',
        stockPosted: true,
        creditPosted: false,
        salesInvoice: { id: UUID_INV, invoiceNo: 'SI-2026-00001' },
      });
      customerMasterRepo.findOne.mockResolvedValue(mockMasterCustomer);
      invoiceRepo.findOne.mockResolvedValue({
        id: UUID_INV,
        invoiceNo: 'SI-2026-00001',
        status: 'Partial',
        totalAmount: 10000,
        paidAmount: 4000,
        balance: 6000,
      } as any);
      // Includes the return being credited now plus an earlier posted credit note
      repo.find.mockResolvedValue([
        { id: UUID_SR, salesInvoiceId: UUID_INV, totalAmount: 550, creditPosted: true },
        { id: 'other-return', salesInvoiceId: UUID_INV, totalAmount: 1000, creditPosted: true },
      ] as any);

      await service.generateCreditNote(UUID_SR, UUID_USER);

      // 10000 - 4000 paid - 1550 credits = 4450
      expect(invoiceRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ balance: 4450, status: 'Partial' }),
      );
    });
  });
});
