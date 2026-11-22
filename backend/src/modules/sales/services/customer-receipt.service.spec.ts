import { BadRequestException } from '@nestjs/common';
import { CustomerReceiptService } from './customer-receipt.service';
import { CustomerCreditService } from './customer-credit.service';
import { CustomerLedgerService } from '../../customer/services/customer-ledger.service';
import { CustomerDocumentType } from '../../customer/entities/customer-ledger.entity';

describe('CustomerReceipt, Advance Allocation, Credit Control & Running Balance', () => {
  const COMP_ID = '11111111-1111-1111-1111-111111111111';
  const USER_ID = '22222222-2222-2222-2222-222222222222';
  const CUST_ID = '33333333-3333-3333-3333-333333333333';
  const DIV_ID = '44444444-4444-4444-4444-444444444444';
  const INV1_ID = '55555555-5555-5555-5555-555555555551';
  const INV2_ID = '55555555-5555-5555-5555-555555555552';
  const BANK_ACCT_ID = '66666666-6666-6666-6666-666666666661';

  function createInMemorySuite() {
    const customers: any[] = [
      {
        id: CUST_ID,
        companyId: COMP_ID,
        divisionId: DIV_ID,
        customerCode: 'CUS-ASA-005',
        name: 'ALI SHAH AUTOS',
        currencyCode: 'PKR',
        paymentTerms: 'Net 30 Days',
        creditDays: 30,
        creditLimit: 500000,
        creditHold: false,
        creditHoldReason: null,
        totalRevenue: 0,
      },
    ];
    const invoices: any[] = [
      {
        id: INV1_ID,
        companyId: COMP_ID,
        customerId: CUST_ID,
        divisionId: DIV_ID,
        invoiceNo: 'SI-2026-00004',
        invoiceDate: '2026-10-01',
        dueDate: '2026-10-31',
        paymentTerms: 'Net 30 Days',
        totalAmount: 100000,
        paidAmount: 0,
        balance: 100000,
        status: 'Posted',
      },
      {
        id: INV2_ID,
        companyId: COMP_ID,
        customerId: CUST_ID,
        divisionId: DIV_ID,
        invoiceNo: 'SI-2026-00005',
        invoiceDate: '2026-11-01',
        dueDate: '2026-12-01',
        paymentTerms: 'Net 30 Days',
        totalAmount: 200000,
        paidAmount: 0,
        balance: 200000,
        status: 'Pending',
      },
    ];
    const receipts: any[] = [];
    const allocations: any[] = [];
    const ledgerEntries: any[] = [];
    const postedJournals: any[] = [];
    const bankAccount = {
      id: BANK_ACCT_ID,
      companyId: COMP_ID,
      accountCode: '1010',
      accountName: 'Bank Accounts',
      isBankCash: true,
      status: 'ACTIVE',
    };

    const receiptRepo: any = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => {
        if (!d.id) {
          d.id = `77777777-7777-7777-7777-${String(receipts.length + 1).padStart(12, '0')}`;
          d.createdAt = new Date();
          receipts.push(d);
        } else {
          const i = receipts.findIndex((r) => r.id === d.id);
          if (i >= 0) receipts[i] = d;
          else receipts.push(d);
        }
        return d;
      }),
      findOne: jest.fn(async ({ where }: any) => receipts.find((r) => r.id === where.id) || null),
      createQueryBuilder: jest.fn((alias: string) => {
        if (alias === 'r' && receipts.length >= 0) {
          let filtered = [...receipts];
          const qb: any = {
            withDeleted: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockImplementation((_sql, params) => {
              if (params?.customerId) filtered = filtered.filter((r) => r.customerId === params.customerId);
              return qb;
            }),
            andWhere: jest.fn().mockImplementation((sql: string, params: any) => {
              if (params?.customerId) filtered = filtered.filter((r) => r.customerId === params.customerId);
              if (sql.includes('unallocated_advance_amount > 0')) {
                filtered = filtered.filter((r) => Number(r.unallocatedAdvanceAmount) > 0 && r.status === 'POSTED' && r.clearanceStatus !== 'BOUNCED');
              }
              if (params?.receiptId) filtered = filtered.filter((r) => r.id === params.receiptId);
              return qb;
            }),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            getRawOne: jest.fn(async () => ({ maxNum: receipts.length })),
            getMany: jest.fn(async () => filtered),
          };
          return qb;
        }
        return null;
      }),
      manager: {
        query: jest.fn(),
      },
    };

    const allocRepo: any = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => {
        if (!d.id) {
          d.id = `88888888-8888-8888-8888-${String(allocations.length + 1).padStart(12, '0')}`;
          d.createdAt = new Date();
          allocations.push(d);
        }
        return d;
      }),
      find: jest.fn(async ({ where }: any) =>
        allocations.filter((a) => (!where?.receiptId || a.receiptId === where.receiptId) && (!where?.status || a.status === where.status)),
      ),
    };

    const invoiceRepo: any = {
      findOne: jest.fn(async ({ where }: any) => invoices.find((i) => i.id === where.id) || null),
      find: jest.fn(async () => [...invoices]),
      save: jest.fn(async (inv) => {
        const idx = invoices.findIndex((i) => i.id === inv.id);
        if (idx >= 0) invoices[idx] = { ...inv };
        return inv;
      }),
    };

    const ledgerEntryRepo: any = {
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (d) => {
        if (Array.isArray(d)) {
          for (const item of d) {
            const idx = ledgerEntries.findIndex((e) => e.id === item.id);
            if (idx >= 0) ledgerEntries[idx] = item;
          }
          return d;
        }
        if (!d.id) {
          d.id = `99999999-9999-9999-9999-${String(ledgerEntries.length + 1).padStart(12, '0')}`;
          d.createdAt = new Date(Date.now() + ledgerEntries.length * 10);
          ledgerEntries.push(d);
        }
        return d;
      }),
      find: jest.fn(async ({ where }: any) =>
        ledgerEntries.filter((e) => e.customerId === where.customerId && e.companyId === where.companyId),
      ),
      findOne: jest.fn(async ({ where }: any) =>
        ledgerEntries.find(
          (e) =>
            (!where.documentNumber || e.documentNumber === where.documentNumber) &&
            (!where.documentType || e.documentType === where.documentType) &&
            (!where.customerId || e.customerId === where.customerId),
        ) || null,
      ),
      createQueryBuilder: jest.fn(() => {
        const qb: any = {
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          orderBy: jest.fn().mockReturnThis(),
          addOrderBy: jest.fn().mockReturnThis(),
          getMany: jest.fn(async () => [...ledgerEntries]),
        };
        return qb;
      }),
      manager: {},
    };

    const customerRepo: any = {
      findOne: jest.fn(async ({ where }: any) => customers.find((c) => c.id === where.id) || null),
      find: jest.fn(async () => customers),
      save: jest.fn(async (c) => c),
      manager: {
        query: jest.fn(),
      },
    };

    const financeAccountRepo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        if (where?.id === BANK_ACCT_ID || where?.accountCode === '1010') return bankAccount;
        return { id: `fa-${where?.accountCode || '1000'}`, accountCode: where?.accountCode || '1000', accountName: 'Account' };
      }),
    };

    const salesCustomerRepo: any = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
    };

    const orderRepo: any = {
      findOne: jest.fn(async () => null),
    };

    const returnRepo: any = {
      find: jest.fn(async () => []),
    };

    const manager: any = {
      getRepository: (entity: any) => {
        const name = entity?.name;
        if (name === 'CustomerReceipt') return receiptRepo;
        if (name === 'CustomerReceiptAllocation') return allocRepo;
        if (name === 'SalesInvoice') return invoiceRepo;
        if (name === 'Customer') return customerRepo;
        if (name === 'CustomerLedgerEntry') return ledgerEntryRepo;
        if (name === 'FinanceAccount') return financeAccountRepo;
        if (name === 'SalesCustomer') return salesCustomerRepo;
        if (name === 'SalesOrder') return orderRepo;
        if (name === 'SalesReturn') return returnRepo;
        return {};
      },
    };

    const dataSource: any = {
      createQueryRunner: () => ({
        connect: jest.fn().mockResolvedValue(undefined),
        startTransaction: jest.fn().mockResolvedValue(undefined),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        rollbackTransaction: jest.fn().mockResolvedValue(undefined),
        release: jest.fn().mockResolvedValue(undefined),
        isTransactionActive: true,
        manager,
      }),
    };

    const autoPosting: any = {
      ensureSystemArAccounts: jest.fn().mockResolvedValue(undefined),
      postSalesInvoice: jest.fn(async (_c, invNo, invId, amt) => {
        const j = { id: `jv-${postedJournals.length + 1}`, journalNumber: `JV-AUTO-${postedJournals.length + 1}`, type: 'SALES_INVOICE', invNo, invId, amt };
        postedJournals.push(j);
        return j;
      }),
      postUnifiedCustomerReceipt: jest.fn(async (input) => {
        const j = { id: `jv-${postedJournals.length + 1}`, journalNumber: `JV-AUTO-${postedJournals.length + 1}`, type: 'RECEIPT', ...input };
        postedJournals.push(j);
        return j;
      }),
      postAdvanceAdjustment: jest.fn(async (input) => {
        const j = { id: `jv-${postedJournals.length + 1}`, journalNumber: `JV-AUTO-${postedJournals.length + 1}`, type: 'ADVANCE_ADJUSTMENT', ...input };
        postedJournals.push(j);
        return j;
      }),
      postChequeClearance: jest.fn(async (input) => {
        const j = { id: `jv-${postedJournals.length + 1}`, journalNumber: `JV-AUTO-${postedJournals.length + 1}`, type: 'CONTRA', ...input };
        postedJournals.push(j);
        return j;
      }),
      postChequeBounce: jest.fn(async (input) => {
        const j = { id: `jv-${postedJournals.length + 1}`, journalNumber: `JV-AUTO-${postedJournals.length + 1}`, type: 'BOUNCE', ...input };
        postedJournals.push(j);
        return j;
      }),
    };

    const ledgerService = new CustomerLedgerService(ledgerEntryRepo, customerRepo);
    const receiptService = new CustomerReceiptService(
      receiptRepo,
      allocRepo,
      invoiceRepo,
      salesCustomerRepo,
      orderRepo,
      returnRepo,
      customerRepo,
      ledgerEntryRepo,
      ledgerService,
      autoPosting,
      dataSource,
    );

    // Override listReceipts & getReceipt query for pure unit-test isolation after transaction commits
    jest.spyOn(receiptService, 'getReceipt').mockImplementation(async (id: string) => {
      const r = receipts.find((x) => x.id === id);
      return {
        ...r,
        allocations: allocations.filter((a) => a.receiptId === id),
      };
    });

    return {
      customers,
      invoices,
      receipts,
      allocations,
      ledgerEntries,
      postedJournals,
      customerRepo,
      ledgerService,
      receiptService,
      autoPosting,
    };
  }

  it('settles multiple invoices bill-to-bill, stores excess as unallocated advance, and updates running balance & GL', async () => {
    const suite = createInMemorySuite();

    // Seed invoice 1 already posted to ledger (Debit 100,000)
    await suite.ledgerService.recordEntry(COMP_ID, CUST_ID, {
      transactionDate: '2026-10-01',
      documentType: CustomerDocumentType.SALES_INVOICE,
      documentNumber: 'SI-2026-00004',
      debit: 100000,
      credit: 0,
      dueDate: '2026-10-31',
      paymentTerms: 'Net 30 Days',
    });

    // Receipt of 250,000: pay 100,000 against SI-2026-00004 (full), 120,000 against SI-2026-00005 (partial), 30,000 remains unallocated Advance!
    const receipt = await suite.receiptService.createReceipt(
      {
        customerId: CUST_ID,
        divisionId: DIV_ID,
        receiptDate: '2026-11-22',
        paymentMode: 'BANK_TRANSFER',
        bankAccountId: BANK_ACCT_ID,
        bankName: 'HBL',
        amount: 250000,
        allocations: [
          { salesInvoiceId: INV1_ID, allocatedAmount: 100000 },
          { salesInvoiceId: INV2_ID, allocatedAmount: 120000 },
        ],
      },
      USER_ID,
      COMP_ID,
    );

    expect(receipt.receiptNumber).toMatch(/^RCV-\d{4}-00001$/);
    expect(receipt.allocatedAmount).toBe(220000);
    expect(receipt.unallocatedAdvanceAmount).toBe(30000);

    // Check invoices updated atomically
    expect(suite.invoices[0].paidAmount).toBe(100000);
    expect(suite.invoices[0].balance).toBe(0);
    expect(suite.invoices[0].status).toBe('Paid');

    // Note SI-2026-00005 was Pending, so its debit (200,000) was ensured first, then 120,000 settled -> 80,000 Partial
    expect(suite.invoices[1].paidAmount).toBe(120000);
    expect(suite.invoices[1].balance).toBe(80000);
    expect(suite.invoices[1].status).toBe('Partial');

    // Check GL received both AR reduction (220k) and Customer Advances (30k)
    expect(suite.autoPosting.postUnifiedCustomerReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        totalAmount: 250000,
        invoiceAllocatedAmount: 220000,
        advanceAmount: 30000,
      }),
    );

    // Check Ledger Running Balance: 100,000 + 200,000 - 250,000 = 50,000 DR (matches 80k open invoice - 30k advance!)
    const { summary } = await suite.ledgerService.getLedger(CUST_ID, COMP_ID);
    expect(summary.totalDebit).toBe(300000);
    expect(summary.totalCredit).toBe(250000);
    expect(summary.outstandingBalance).toBe(50000);
  });

  it('records pure Advance Payment and later adjusts it against an invoice with ZERO double-counting', async () => {
    const suite = createInMemorySuite();

    // Step 1: Pure Advance of 150,000 before invoice debit exists
    const adv = await suite.receiptService.createReceipt(
      {
        customerId: CUST_ID,
        receiptDate: '2026-11-10',
        receiptType: 'ADVANCE_PAYMENT',
        paymentMode: 'ONLINE',
        bankAccountId: BANK_ACCT_ID,
        amount: 150000,
        remarks: 'Advance for spoke batch',
      },
      USER_ID,
      COMP_ID,
    );

    expect(adv.receiptType).toBe('ADVANCE_PAYMENT');
    expect(adv.unallocatedAdvanceAmount).toBe(150000);

    // Customer Ledger has 150,000 CR (-150,000)
    const midLedger = await suite.ledgerService.getLedger(CUST_ID, COMP_ID);
    expect(midLedger.summary.outstandingBalance).toBe(-150000);

    // Step 2: Adjust 100,000 of the Advance against SI-2026-00004 (100,000)
    const adjResult = await suite.receiptService.applyAdvanceToInvoices(
      {
        customerId: CUST_ID,
        receiptId: adv.id,
        adjustmentDate: '2026-11-22',
        invoiceAllocations: [{ salesInvoiceId: INV1_ID, allocatedAmount: 100000 }],
      },
      USER_ID,
      COMP_ID,
    );

    expect(adjResult.totalAdjusted).toBe(100000);
    expect(suite.invoices[0].status).toBe('Paid');
    expect(suite.invoices[0].balance).toBe(0);
    expect(suite.receipts[0].unallocatedAdvanceAmount).toBe(50000);

    // GL reclassification DR 2050 / CR 1100
    expect(suite.autoPosting.postAdvanceAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 100000 }),
    );

    // Ledger check: -150,000 Advance + 100,000 Invoice Debit + 0 Adjustment = -50,000 (50k CR unadjusted advance remaining!)
    const finalLedger = await suite.ledgerService.getLedger(CUST_ID, COMP_ID);
    expect(finalLedger.summary.totalDebit).toBe(100000);
    expect(finalLedger.summary.totalCredit).toBe(150000);
    expect(finalLedger.summary.outstandingBalance).toBe(-50000);
  });

  it('enforces Customer Credit Limit and Credit Hold unless an explicit Override Reason is supplied', async () => {
    const suite = createInMemorySuite();
    suite.customerRepo.findOne.mockResolvedValue({
      id: CUST_ID,
      companyId: COMP_ID,
      customerCode: 'CUS-ASA-005',
      name: 'ALI SHAH AUTOS',
      creditLimit: 500000,
      creditDays: 30,
      paymentTerms: 'Net 30 Days',
      creditHold: false,
    });
    suite.customerRepo.manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('customer_ledger')) return [{ net_bal: '420000' }];
      return [];
    });

    const creditService = new CustomerCreditService(suite.customerRepo);

    // 420,000 + 100,000 = 520,000 > 500,000 => should block
    await expect(
      creditService.assertAllowedOrOverride({
        companyId: COMP_ID,
        customerId: CUST_ID,
        proposedAmount: 100000,
        documentLabel: 'Sales Order SOC-2026-09999',
      }),
    ).rejects.toThrow(BadRequestException);

    // With override + reason => allowed + audit note returned
    const res = await creditService.assertAllowedOrOverride({
      companyId: COMP_ID,
      customerId: CUST_ID,
      proposedAmount: 100000,
      documentLabel: 'Sales Order SOC-2026-09999',
      creditOverride: true,
      creditOverrideReason: 'Director approved PDC cheque on file',
      userId: USER_ID,
    });
    expect(res.overrideAuditNote).toContain('[CREDIT OVERRIDE');
    expect(res.overrideAuditNote).toContain('Director approved PDC cheque on file');
  });

  it('validates seeded PostgreSQL division UUIDs and division name/code inputs without divisionId UUID error', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { CreateCustomerReceiptDto } = await import('../dto/customer-receipt.dto');

    const withSeededUuid = plainToInstance(CreateCustomerReceiptDto, {
      customerId: 'c1000000-0000-0000-0000-000000000001',
      divisionId: 'd1000000-0000-0000-0000-000000000001',
      paymentMode: 'BANK_TRANSFER',
      receiptType: 'INVOICE_PAYMENT',
      amount: 200000,
    });
    expect(await validate(withSeededUuid)).toHaveLength(0);

    const withDivName = plainToInstance(CreateCustomerReceiptDto, {
      customerId: 'c1000000-0000-0000-0000-000000000001',
      divisionId: 'Spoke Division',
      paymentMode: 'BANK_TRANSFER',
      receiptType: 'INVOICE_PAYMENT',
      amount: 200000,
    });
    expect(await validate(withDivName)).toHaveLength(0);
  });
});
