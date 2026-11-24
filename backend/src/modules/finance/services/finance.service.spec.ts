import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceAutoPostingService } from './finance-auto-posting.service';
import { FinanceService } from './finance.service';
import {
  FinanceAccount,
  FinanceAccountGroup,
  FinanceAccountingPeriod,
  FinanceFiscalYear,
  FinanceJournal,
  FinanceJournalLine,
  AccountType,
  NormalBalance,
  JournalType,
  JournalStatus,
} from '../entities';

describe('FinanceAutoPostingService & FinanceService (Enterprise)', () => {
  const COMPANY = '7725aa04-a270-4314-9e82-90949cbe7791';
  const DIV_ID = 'd1000000-0000-0000-0000-000000000001';

  const makeMockAccounts = () => [
    { id: 'acc-1000', companyId: COMPANY, accountCode: '1000', accountName: 'Cash in Hand', accountType: AccountType.ASSET, normalBalance: NormalBalance.DEBIT, isBankCash: true },
    { id: 'acc-1011', companyId: COMPANY, accountCode: '1011', accountName: 'Bank Account - Primary Current (PKR)', accountType: AccountType.ASSET, normalBalance: NormalBalance.DEBIT, isBankCash: true },
    { id: 'acc-1100', companyId: COMPANY, accountCode: '1100', accountName: 'Accounts Receivable', accountType: AccountType.ASSET, normalBalance: NormalBalance.DEBIT, isAr: true },
    { id: 'acc-1160', companyId: COMPANY, accountCode: '1160', accountName: 'Input Sales Tax (GST Receivable)', accountType: AccountType.ASSET, normalBalance: NormalBalance.DEBIT },
    { id: 'acc-1210', companyId: COMPANY, accountCode: '1210', accountName: 'Raw Material Inventory', accountType: AccountType.ASSET, normalBalance: NormalBalance.DEBIT },
    { id: 'acc-2000', companyId: COMPANY, accountCode: '2000', accountName: 'Accounts Payable', accountType: AccountType.LIABILITY, normalBalance: NormalBalance.CREDIT, isAp: true },
    { id: 'acc-2010', companyId: COMPANY, accountCode: '2010', accountName: 'GRN Clearing (Unbilled Purchases)', accountType: AccountType.LIABILITY, normalBalance: NormalBalance.CREDIT },
    { id: 'acc-2100', companyId: COMPANY, accountCode: '2100', accountName: 'Customer Advances Liability', accountType: AccountType.LIABILITY, normalBalance: NormalBalance.CREDIT },
    { id: 'acc-2150', companyId: COMPANY, accountCode: '2150', accountName: 'Sales Tax / GST Payable', accountType: AccountType.LIABILITY, normalBalance: NormalBalance.CREDIT },
    { id: 'acc-2160', companyId: COMPANY, accountCode: '2160', accountName: 'Withholding Tax (WHT) Payable', accountType: AccountType.LIABILITY, normalBalance: NormalBalance.CREDIT },
    { id: 'acc-4000', companyId: COMPANY, accountCode: '4000', accountName: 'Local Sales Revenue', accountType: AccountType.REVENUE, normalBalance: NormalBalance.CREDIT },
    { id: 'acc-4090', companyId: COMPANY, accountCode: '4090', accountName: 'Sales Returns & Allowances', accountType: AccountType.REVENUE, normalBalance: NormalBalance.DEBIT },
    { id: 'acc-5100', companyId: COMPANY, accountCode: '5100', accountName: 'Raw Material Purchases', accountType: AccountType.EXPENSE, normalBalance: NormalBalance.DEBIT },
  ];

  const buildAutoPosting = () => {
    const accounts = makeMockAccounts();
    const savedJournals: any[] = [];

    const journalQb: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ maxNum: savedJournals.length, cnt: savedJournals.length }),
    };
    const journalRepo: any = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (j) => {
        const rec = { ...j, id: `j-${savedJournals.length + 1}` };
        savedJournals.push(rec);
        return rec;
      }),
      createQueryBuilder: jest.fn(() => journalQb),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    const lineRepo: any = {
      create: jest.fn((l) => ({ ...l })),
    };
    const accountRepo: any = {
      find: jest.fn().mockResolvedValue(accounts),
      findOne: jest.fn(async ({ where }: any) =>
        accounts.find(
          (a) =>
            (!where.id || a.id === where.id) &&
            (!where.accountCode || a.accountCode === where.accountCode),
        ) || null,
      ),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => x),
    };
    const periodRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      })),
    };
    const fyRepo: any = {
      findOne: jest.fn().mockResolvedValue({ id: 'fy-1' }),
    };

    const service = new FinanceAutoPostingService(journalRepo, lineRepo, accountRepo, periodRepo, fyRepo);
    return { service, savedJournals };
  };

  it('splits 18% Output Sales Tax into 2150 GST Payable on postSalesInvoice', async () => {
    const { service, savedJournals } = buildAutoPosting();

    const journal = await service.postSalesInvoice(
      COMPANY,
      'SI-2026-00004',
      'inv-4',
      472000,
      'user-1',
      undefined,
      new Date('2026-11-22'),
      { subtotal: 400000, taxAmount: 72000, divisionId: DIV_ID, customerId: 'cust-1' },
    );

    expect(savedJournals).toHaveLength(1);
    expect(journal.totalDebit).toBe(472000);
    expect(journal.totalCredit).toBe(472000);
    expect(journal.divisionId).toBe(DIV_ID);
    expect(journal.partyType).toBe('CUSTOMER');
    expect(journal.partyId).toBe('cust-1');
    expect(journal.lines).toHaveLength(3);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-1100')?.debit).toBe(472000);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-4000')?.credit).toBe(400000);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-2150')?.credit).toBe(72000);
  });

  it('posts Sales Return Credit Note (DR 4090 + DR 2150 GST / CR 1100 AR)', async () => {
    const { service } = buildAutoPosting();

    const journal = await service.postSalesReturnCreditNote({
      companyId: COMPANY,
      returnId: 'sr-1',
      returnNumber: 'SR-2026-0001',
      creditNoteNumber: 'CN-2026-0001',
      creditDate: new Date('2026-11-24'),
      subtotal: 100000,
      taxAmount: 18000,
      totalAmount: 118000,
      customerId: 'cust-1',
      customerName: 'Crown Fit Pakistan',
      divisionId: DIV_ID,
      actorId: 'user-1',
    });

    expect(journal.journalType).toBe(JournalType.SALES_RETURN);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-4090')?.debit).toBe(100000);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-2150')?.debit).toBe(18000);
    expect(journal.lines.find((l: any) => l.accountId === 'acc-1100')?.credit).toBe(118000);
  });

  it('posts GRN perpetual inventory accrual (DR 1210 Raw Material / CR 2010 GRN Clearing)', async () => {
    const { service } = buildAutoPosting();

    const journal = await service.postGoodsReceiptAccrual({
      companyId: COMPANY,
      grnId: 'grn-1',
      grnNumber: 'GRN-0011',
      receiptDate: new Date('2026-10-01'),
      amount: 9050000,
      supplierId: 'sup-7',
      supplierName: 'Chongqing Yuda',
      divisionId: DIV_ID,
    });

    expect(journal).not.toBeNull();
    expect(journal!.journalType).toBe(JournalType.GRN_ACCRUAL);
    expect(journal!.partyType).toBe('SUPPLIER');
    expect(journal!.lines.find((l: any) => l.accountId === 'acc-1210')?.debit).toBe(9050000);
    expect(journal!.lines.find((l: any) => l.accountId === 'acc-2010')?.credit).toBe(9050000);
  });

  it('clears 2010 GRN Clearing + posts Input GST 1160 on matched Purchase Invoice and deducts WHT 2160 on payment', async () => {
    const { service } = buildAutoPosting();

    const piJournal = await service.postPurchaseInvoice(COMPANY, 'PINV-001', 'pi-1', 1180000, 'user-1', undefined, {
      subtotal: 1000000,
      taxAmount: 180000,
      hasGrnAccrual: true,
      supplierId: 'sup-7',
    });

    expect(piJournal.lines.find((l: any) => l.accountId === 'acc-2010')?.debit).toBe(1000000);
    expect(piJournal.lines.find((l: any) => l.accountId === 'acc-1160')?.debit).toBe(180000);
    expect(piJournal.lines.find((l: any) => l.accountId === 'acc-2000')?.credit).toBe(1180000);

    const payJournal = await service.postSupplierPayment(COMPANY, 'PINV-001', 'pi-1', 1180000, 'user-1', undefined, {
      bankAccountId: 'acc-1011',
      paymentMode: 'BANK_TRANSFER',
      whtAmount: 45000,
      supplierId: 'sup-7',
    });

    expect(payJournal.voucherType).toBe('PV');
    expect(payJournal.lines.find((l: any) => l.accountId === 'acc-2000')?.debit).toBe(1180000);
    expect(payJournal.lines.find((l: any) => l.accountId === 'acc-1011')?.credit).toBe(1135000);
    expect(payJournal.lines.find((l: any) => l.accountId === 'acc-2160')?.credit).toBe(45000);
  });

  it('FinanceService creates balanced Contra Transfer (CV) and enforces P&L date filters + Balance Sheet Net Profit', async () => {
    const mockLineQb: any = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    const acctRepo: any = {
      findOne: jest.fn(async ({ where }: any) => makeMockAccounts().find((a) => a.id === where.id) || null),
    };
    const journalRepo: any = {
      findOne: jest.fn().mockResolvedValue({
        id: 'cv-1',
        companyId: COMPANY,
        journalNumber: 'CV-000001',
        journalType: JournalType.CONTRA,
        voucherType: 'CV',
        status: JournalStatus.DRAFT,
        totalDebit: 500000,
        totalCredit: 500000,
        lines: [],
      }),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...x, id: 'cv-1' })),
    };
    const lineRepo: any = {
      create: jest.fn((x) => x),
      createQueryBuilder: jest.fn(() => mockLineQb),
    };
    const fyRepo: any = { findOne: jest.fn().mockResolvedValue({ id: 'fy-1' }) };
    const periodRepo: any = {
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 'p-5', fiscalYearId: 'fy-1', status: 'OPEN' }),
      })),
    };
    const dataSource: any = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('MAX(CAST')) return [{ max_num: 0 }];
        return [];
      }),
    };
    const autoPosting: any = { ensureSystemArAccounts: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinanceService,
        { provide: getRepositoryToken(FinanceAccount), useValue: acctRepo },
        { provide: getRepositoryToken(FinanceAccountGroup), useValue: { find: jest.fn() } },
        { provide: getRepositoryToken(FinanceFiscalYear), useValue: fyRepo },
        { provide: getRepositoryToken(FinanceAccountingPeriod), useValue: periodRepo },
        { provide: getRepositoryToken(FinanceJournal), useValue: journalRepo },
        { provide: getRepositoryToken(FinanceJournalLine), useValue: lineRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: FinanceAutoPostingService, useValue: autoPosting },
      ],
    }).compile();

    const financeService = module.get(FinanceService);

    await expect(
      financeService.createContraTransfer(
        {
          entryDate: '2026-11-24',
          fromAccountId: 'acc-1000',
          toAccountId: 'acc-1000',
          amount: 1000,
        },
        'u-1',
        COMPANY,
      ),
    ).rejects.toThrow(BadRequestException);

    // P&L applies from and to filters on QueryBuilder
    mockLineQb.getRawMany.mockResolvedValueOnce([
      { accountId: 'acc-4000', accountCode: '4000', accountName: 'Local Sales Revenue', accountType: 'REVENUE', normalBalance: 'CREDIT', totalDebit: '0', totalCredit: '4000000' },
      { accountId: 'acc-5100', accountCode: '5100', accountName: 'Raw Material Purchases', accountType: 'EXPENSE', normalBalance: 'DEBIT', totalDebit: '1500000', totalCredit: '0' },
    ]);
    const pl = await financeService.plStatement(COMPANY, '2026-07-01', '2026-11-30');
    expect(mockLineQb.andWhere).toHaveBeenCalledWith('j.entry_date >= :from', { from: '2026-07-01' });
    expect(mockLineQb.andWhere).toHaveBeenCalledWith('j.entry_date <= :to', { to: '2026-11-30' });
    expect(pl.grossProfit).toBe(2500000);
    expect(pl.netProfit).toBe(2500000);

    // Balance Sheet includes Current Period Net Profit so Assets === Liabilities + Equity
    mockLineQb.getRawMany
      .mockResolvedValueOnce([
        { accountId: 'acc-1000', accountCode: '1000', accountName: 'Cash in Hand', accountType: 'ASSET', normalBalance: 'DEBIT', totalDebit: '4248000', totalCredit: '0' },
        { accountId: 'acc-1100', accountCode: '1100', accountName: 'Accounts Receivable', accountType: 'ASSET', normalBalance: 'DEBIT', totalDebit: '472000', totalCredit: '0' },
        { accountId: 'acc-2150', accountCode: '2150', accountName: 'Sales Tax / GST Payable', accountType: 'LIABILITY', normalBalance: 'CREDIT', totalDebit: '0', totalCredit: '720000' },
      ])
      .mockResolvedValueOnce([
        { accountId: 'acc-4000', accountCode: '4000', accountName: 'Local Sales Revenue', accountType: 'REVENUE', normalBalance: 'CREDIT', totalDebit: '0', totalCredit: '4000000' },
      ]);
    const bs = await financeService.balanceSheet(COMPANY, '2026-11-30');
    expect(bs.assets).toBe(4720000);
    expect(bs.liabilities).toBe(720000);
    expect(bs.currentYearNetProfit).toBe(4000000);
    expect(bs.equity).toBe(4000000);
    expect(bs.balanced).toBe(true);

    // Cross-company account update guard
    acctRepo.findOne.mockResolvedValueOnce({ id: 'acc-x', companyId: 'other-company' });
    await expect(financeService.updateAccount('acc-x', { accountName: 'Hack' }, COMPANY)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
