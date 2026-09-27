import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerLedgerService } from './customer-ledger.service';
import { CustomerLedgerEntry, CustomerDocumentType } from '../entities/customer-ledger.entity';
import { Customer } from '../entities/customer.entity';

describe('CustomerLedgerService', () => {
  let service: CustomerLedgerService;
  let ledgerRepo: jest.Mocked<Repository<CustomerLedgerEntry>>;
  let customerRepo: jest.Mocked<Repository<Customer>>;

  const mockCustomer = {
    id: 'cust-001',
    companyId: 'company-001',
    customerCode: 'CUS-000001',
    name: 'Test Customer',
    currencyCode: 'PKR',
  } as Customer;

  const mockEntry: CustomerLedgerEntry = {
    id: 'ledger-001',
    companyId: 'company-001',
    customerId: 'cust-001',
    transactionDate: new Date('2026-01-01'),
    documentType: CustomerDocumentType.OPENING_BALANCE,
    documentNumber: 'OPB-001',
    reference: 'Opening balance import',
    debit: 50000,
    credit: 0,
    runningBalance: 50000,
    currency: 'PKR',
    dueDate: null,
    paymentTerms: null,
    status: 'POSTED',
    notes: 'Initial opening balance',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    updatedBy: 'system',
    isActive: true,
    customer: null as never,
  };

  let mockEntriesList: CustomerLedgerEntry[] = [];

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockImplementation(() => Promise.resolve(mockEntriesList)),
  };

  beforeEach(async () => {
    mockEntriesList = [];
    const mockLedgerRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockReturnValue(mockEntry),
      save: jest.fn().mockResolvedValue(mockEntry),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(() => mockQueryBuilder),
    };

    const mockCustomerRepo = {
      find: jest.fn(),
      findOne: jest.fn().mockResolvedValue(mockCustomer),
      create: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerLedgerService,
        { provide: getRepositoryToken(CustomerLedgerEntry), useValue: mockLedgerRepo },
        { provide: getRepositoryToken(Customer), useValue: mockCustomerRepo },
      ],
    }).compile();

    service = module.get<CustomerLedgerService>(CustomerLedgerService);
    ledgerRepo = module.get(getRepositoryToken(CustomerLedgerEntry));
    customerRepo = module.get(getRepositoryToken(Customer));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getLedger', () => {
    it('should compute running balances chronologically and return summary', async () => {
      mockEntriesList = [
        { ...mockEntry, id: '1', debit: 10000, credit: 0, runningBalance: 0 },
        { ...mockEntry, id: '2', debit: 0, credit: 4000, runningBalance: 0 },
        { ...mockEntry, id: '3', debit: 5000, credit: 0, runningBalance: 0 },
      ];

      const result = await service.getLedger('cust-001', 'company-001');
      expect(result.data).toHaveLength(3);
      expect(result.data[0].runningBalance).toBe(10000);
      expect(result.data[1].runningBalance).toBe(6000);
      expect(result.data[2].runningBalance).toBe(11000);
      expect(result.summary.outstandingBalance).toBe(11000);
    });
  });

  describe('getSummary', () => {
    it('should calculate total debit, credit, net balance, and last transaction date', async () => {
      mockEntriesList = [
        { ...mockEntry, debit: 20000, credit: 0, transactionDate: new Date('2026-01-01') },
        { ...mockEntry, debit: 0, credit: 5000, transactionDate: new Date('2026-02-01') },
      ];

      const summary = await service.getSummary('cust-001', 'company-001');
      expect(summary.totalDebit).toBe(20000);
      expect(summary.totalCredit).toBe(5000);
      expect(summary.outstandingBalance).toBe(15000);
      expect(summary.lastTransactionDate).toEqual(new Date('2026-02-01'));
    });

    it('should return 0 balances if customer has no ledger entries', async () => {
      mockEntriesList = [];

      const summary = await service.getSummary('cust-001', 'company-001');
      expect(summary.totalDebit).toBe(0);
      expect(summary.totalCredit).toBe(0);
      expect(summary.outstandingBalance).toBe(0);
      expect(summary.lastTransactionDate).toBeNull();
    });
  });

  describe('recordOpeningBalance', () => {
    it('should create opening balance debit entry', async () => {
      customerRepo.findOne.mockResolvedValue(mockCustomer);
      ledgerRepo.findOne.mockResolvedValue(null);

      const res = await service.recordOpeningBalance(
        'company-001',
        'cust-001',
        50000,
        'DEBIT',
        'user-001',
      );

      expect(res).toBeDefined();
      expect(ledgerRepo.save).toHaveBeenCalled();
    });
  });
});
