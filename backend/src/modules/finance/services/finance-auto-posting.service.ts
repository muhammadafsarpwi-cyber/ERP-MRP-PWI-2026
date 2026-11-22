import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { FinanceJournal, FinanceJournalLine, JournalStatus, JournalType } from '../entities';
import { FinanceAccount, AccountType, NormalBalance } from '../entities/finance-account.entity';
import { FinanceAccountGroup } from '../entities/finance-account-group.entity';
import { FinanceAccountingPeriod } from '../entities/finance-accounting-period.entity';
import { FinanceFiscalYear } from '../entities/finance-fiscal-year.entity';

export interface AutoPostingLine {
  accountId?: string | null;
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Central accounting integration service.
 * Every automatic journal must balance, reference the source transaction,
 * be auditable, respect the accounting period and be protected after posting.
 *
 * Accounting mapping:
 *   Sales Invoice posted      -> DR AR (1100), CR Sales Revenue (4000)
 *   Customer receipt          -> DR Selected Cash/Bank (or 1020 PDC), CR AR (1100) + CR Customer Advances (2050)
 *   Advance adjustment        -> DR Customer Advances (2050), CR AR (1100)
 *   Cheque cleared            -> DR Selected Bank (1010/etc.), CR Cheques in Hand (1020)
 *   Purchase Invoice posted   -> DR Expense (5100/5000), CR AP (2000)
 *   Supplier payment          -> DR AP (2000), CR Cash/Bank (1000/1010)
 */
@Injectable()
export class FinanceAutoPostingService {
  private readonly logger = new Logger(FinanceAutoPostingService.name);

  constructor(
    @InjectRepository(FinanceJournal) private readonly journalRepo: Repository<FinanceJournal>,
    @InjectRepository(FinanceJournalLine) private readonly lineRepo: Repository<FinanceJournalLine>,
    @InjectRepository(FinanceAccount) private readonly accountRepo: Repository<FinanceAccount>,
    @InjectRepository(FinanceAccountingPeriod) private readonly periodRepo: Repository<FinanceAccountingPeriod>,
    @InjectRepository(FinanceFiscalYear) private readonly fyRepo: Repository<FinanceFiscalYear>,
  ) {}

  async ensureSystemArAccounts(companyId: string, manager?: EntityManager): Promise<void> {
    if (!companyId) return;
    const accountRepo = manager ? manager.getRepository(FinanceAccount) : this.accountRepo;
    const groupRepo = manager ? manager.getRepository(FinanceAccountGroup) : accountRepo.manager.getRepository(FinanceAccountGroup);

    const groups = await groupRepo.find({ where: { companyId } }).catch(() => []);
    const assetGroupId = groups.find((g) => String(g.groupClass).toUpperCase() === 'ASSET' || g.groupCode === 'GRP-ASSET')?.id || null;
    const liabGroupId = groups.find((g) => String(g.groupClass).toUpperCase() === 'LIABILITY' || g.groupCode === 'GRP-LIAB')?.id || null;
    const revGroupId = groups.find((g) => String(g.groupClass).toUpperCase() === 'REVENUE' || g.groupCode === 'GRP-REV')?.id || null;

    const defaults = [
      { code: '1000', name: 'Cash in Hand', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupId: assetGroupId, isBankCash: true, isAr: false },
      { code: '1010', name: 'Bank Accounts', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupId: assetGroupId, isBankCash: true, isAr: false },
      { code: '1020', name: 'Cheques in Hand (Uncleared)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupId: assetGroupId, isBankCash: false, isAr: false },
      { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupId: assetGroupId, isBankCash: false, isAr: true },
      { code: '2050', name: 'Customer Advances (Unearned Revenue)', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupId: liabGroupId, isBankCash: false, isAr: false },
      { code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, nb: NormalBalance.CREDIT, groupId: revGroupId, isBankCash: false, isAr: false },
    ];

    for (const def of defaults) {
      const existing = await accountRepo.findOne({ where: { companyId, accountCode: def.code } });
      if (!existing) {
        await accountRepo.save(
          accountRepo.create({
            companyId,
            accountCode: def.code,
            accountName: def.name,
            accountType: def.type,
            normalBalance: def.nb,
            groupId: def.groupId,
            currency: 'PKR',
            isBankCash: def.isBankCash,
            isAr: def.isAr,
            isAp: false,
            status: 'ACTIVE',
          }),
        );
      }
    }
  }

  private async nextJournalNumber(companyId: string, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const r = await repo
      .createQueryBuilder('j')
      .select("MAX(CAST(NULLIF(SUBSTRING(j.journal_number FROM '([0-9]+)$'), '') AS INT))", 'maxNum')
      .addSelect('COUNT(*)::int', 'cnt')
      .where('j.company_id = :companyId', { companyId })
      .getRawOne();
    const nextNum = Math.max(Number(r?.maxNum) || 0, Number(r?.cnt) || 0) + 1;
    return `JV-AUTO-${String(nextNum).padStart(6, '0')}`;
  }

  private async resolvePeriod(companyId: string, entryDate: Date, manager?: EntityManager): Promise<{ periodId: string | null; fiscalYearId: string | null }> {
    const periodRepo = manager ? manager.getRepository(FinanceAccountingPeriod) : this.periodRepo;
    const fyRepo = manager ? manager.getRepository(FinanceFiscalYear) : this.fyRepo;
    const period = await periodRepo
      .createQueryBuilder('p')
      .innerJoinAndSelect('p.fiscalYear', 'fy')
      .where('p.start_date <= :d AND p.end_date >= :d', { d: entryDate })
      .andWhere('p.status = :st', { st: 'OPEN' })
      .getOne();
    if (period) return { periodId: period.id, fiscalYearId: period.fiscalYearId };
    const fy = await fyRepo.findOne({ where: { companyId, status: 'OPEN' } });
    return { periodId: null, fiscalYearId: fy?.id ?? null };
  }

  /**
   * Creates and immediately posts a balanced automatic journal.
   */
  async postAutoJournal(input: {
    companyId: string;
    journalType: JournalType;
    entryDate: Date;
    description: string;
    referenceType: string;
    referenceId: string;
    lines: AutoPostingLine[];
    actorId?: string;
    manager?: EntityManager;
  }): Promise<FinanceJournal> {
    const { companyId, journalType, entryDate, description, referenceType, referenceId, lines, actorId, manager } = input;

    const journalRepo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const lineRepo = manager ? manager.getRepository(FinanceJournalLine) : this.lineRepo;
    const accountRepo = manager ? manager.getRepository(FinanceAccount) : this.accountRepo;

    const nonZeroLines = lines.filter(
      (l) => Math.abs(Number(l.debit || 0)) > 0.0001 || Math.abs(Number(l.credit || 0)) > 0.0001,
    );

    const totalDebit = Math.round(nonZeroLines.reduce((s, l) => s + Number(l.debit || 0), 0) * 10000) / 10000;
    const totalCredit = Math.round(nonZeroLines.reduce((s, l) => s + Number(l.credit || 0), 0) * 10000) / 10000;
    if (nonZeroLines.length === 0 || Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`Auto-journal unbalanced: debit ${totalDebit} <> credit ${totalCredit}`);
    }

    const journalLines: FinanceJournalLine[] = [];
    let lineNumber = 1;
    for (const l of nonZeroLines) {
      let account: FinanceAccount | null = null;
      if (l.accountId) {
        account = await accountRepo.findOne({ where: { id: l.accountId, companyId } });
      }
      if (!account) {
        account = await accountRepo.findOne({ where: { companyId, accountCode: l.accountCode } });
      }
      if (!account) {
        await this.ensureSystemArAccounts(companyId, manager);
        account = await accountRepo.findOne({ where: { companyId, accountCode: l.accountCode } });
      }
      if (!account) {
        throw new Error(`Auto-journal account ${l.accountCode} not found for company ${companyId}`);
      }
      journalLines.push(lineRepo.create({
        lineNumber: lineNumber++,
        accountId: account.id,
        description: l.description ?? description,
        debit: Math.round((Number(l.debit) || 0) * 10000) / 10000,
        credit: Math.round((Number(l.credit) || 0) * 10000) / 10000,
        referenceType,
        referenceId,
      }));
    }

    const { periodId, fiscalYearId } = await this.resolvePeriod(companyId, entryDate, manager);
    const journalNumber = await this.nextJournalNumber(companyId, manager);

    const journal = journalRepo.create({
      companyId,
      journalNumber,
      journalType,
      entryDate,
      periodId,
      fiscalYearId,
      description,
      referenceType,
      referenceId,
      status: JournalStatus.POSTED,
      totalDebit,
      totalCredit,
      postedAt: new Date(),
      postedBy: actorId ?? null,
      createdBy: actorId ?? null,
      lines: journalLines,
    });

    const saved = await journalRepo.save(journal);
    this.logger.log(`Auto-journal ${journalNumber} posted (${referenceType}:${referenceId})`);
    return saved;
  }

  /** Sales Invoice posted -> DR AR (1100), CR Sales Revenue (4000) */
  async postSalesInvoice(
    companyId: string,
    invoiceNo: string,
    invoiceId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
    entryDate?: Date,
  ) {
    const journalRepo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const existing = await journalRepo.findOne({
      where: { companyId, referenceType: 'SALES_INVOICE', referenceId: invoiceId, journalType: JournalType.SALES_INVOICE },
    });
    if (existing) return existing;

    return this.postAutoJournal({
      companyId,
      journalType: JournalType.SALES_INVOICE,
      entryDate: entryDate || new Date(),
      description: `AR from sales invoice ${invoiceNo}`,
      referenceType: 'SALES_INVOICE',
      referenceId: invoiceId,
      actorId,
      manager,
      lines: [
        { accountCode: '1100', debit: amount, credit: 0, description: `AR - invoice ${invoiceNo}` },
        { accountCode: '4000', debit: 0, credit: amount, description: `Sales revenue - invoice ${invoiceNo}` },
      ],
    });
  }

  /** Legacy single-invoice receipt helper */
  async postCustomerReceipt(companyId: string, invoiceNo: string, invoiceId: string, amount: number, actorId?: string, manager?: EntityManager) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.RECEIPT,
      entryDate: new Date(),
      description: `Customer payment against invoice ${invoiceNo}`,
      referenceType: 'SALES_INVOICE',
      referenceId: invoiceId,
      actorId,
      manager,
      lines: [
        { accountCode: '1000', debit: amount, credit: 0, description: `Cash received - invoice ${invoiceNo}` },
        { accountCode: '1100', debit: 0, credit: amount, description: `AR reduction - invoice ${invoiceNo}` },
      ],
    });
  }

  /** Unified Customer Receipt / Advance Voucher -> DR Cash/Bank/PDC, CR AR (1100) + CR Customer Advances (2050) */
  async postUnifiedCustomerReceipt(input: {
    companyId: string;
    receiptId: string;
    receiptNumber: string;
    receiptDate: Date;
    totalAmount: number;
    invoiceAllocatedAmount: number;
    advanceAmount: number;
    debitAccountId?: string | null;
    debitAccountCode?: string;
    customerName?: string;
    invoiceNumbers?: string[];
    actorId?: string;
    manager?: EntityManager;
  }) {
    const lines: AutoPostingLine[] = [
      {
        accountId: input.debitAccountId || undefined,
        accountCode: input.debitAccountCode || '1010',
        debit: input.totalAmount,
        credit: 0,
        description: `Receipt ${input.receiptNumber}${input.customerName ? ` from ${input.customerName}` : ''}`,
      },
    ];
    if (input.invoiceAllocatedAmount > 0.0001) {
      lines.push({
        accountCode: '1100',
        debit: 0,
        credit: input.invoiceAllocatedAmount,
        description: `AR settlement (${input.invoiceNumbers?.join(', ') || input.receiptNumber})`,
      });
    }
    if (input.advanceAmount > 0.0001) {
      lines.push({
        accountCode: '2050',
        debit: 0,
        credit: input.advanceAmount,
        description: `Unallocated customer advance - ${input.receiptNumber}`,
      });
    }

    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.RECEIPT,
      entryDate: input.receiptDate,
      description: `Customer Receipt ${input.receiptNumber}${input.customerName ? ` - ${input.customerName}` : ''}`,
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: input.receiptId,
      actorId: input.actorId,
      manager: input.manager,
      lines,
    });
  }

  /** Advance Adjustment -> DR Customer Advances (2050), CR Accounts Receivable (1100) */
  async postAdvanceAdjustment(input: {
    companyId: string;
    referenceId: string;
    receiptNumber: string;
    invoiceNumbers: string[];
    adjustmentDate: Date;
    amount: number;
    customerName?: string;
    actorId?: string;
    manager?: EntityManager;
  }) {
    const invSummary = input.invoiceNumbers.join(', ');
    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.GENERAL,
      entryDate: input.adjustmentDate,
      description: `Advance ${input.receiptNumber} adjusted against ${invSummary}`,
      referenceType: 'ADVANCE_ADJUSTMENT',
      referenceId: input.referenceId,
      actorId: input.actorId,
      manager: input.manager,
      lines: [
        {
          accountCode: '2050',
          debit: input.amount,
          credit: 0,
          description: `Advance utilized (${input.receiptNumber})`,
        },
        {
          accountCode: '1100',
          debit: 0,
          credit: input.amount,
          description: `AR settled from advance (${invSummary})`,
        },
      ],
    });
  }

  /** Cheque Clearance -> DR Bank (selected or 1010), CR Cheques in Hand (1020) */
  async postChequeClearance(input: {
    companyId: string;
    receiptId: string;
    receiptNumber: string;
    clearanceDate: Date;
    amount: number;
    bankAccountId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }) {
    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.CONTRA,
      entryDate: input.clearanceDate,
      description: `Cheque cleared for Receipt ${input.receiptNumber}`,
      referenceType: 'CUSTOMER_RECEIPT_CLEAR',
      referenceId: input.receiptId,
      actorId: input.actorId,
      manager: input.manager,
      lines: [
        {
          accountId: input.bankAccountId || undefined,
          accountCode: '1010',
          debit: input.amount,
          credit: 0,
          description: `Bank deposit cleared - ${input.receiptNumber}`,
        },
        {
          accountCode: '1020',
          debit: 0,
          credit: input.amount,
          description: `Cheques in hand cleared - ${input.receiptNumber}`,
        },
      ],
    });
  }

  /** Cheque Bounce Reversal -> DR AR (1100) + DR Advances (2050), CR Bank/Cash/1020 */
  async postChequeBounce(input: {
    companyId: string;
    receiptId: string;
    receiptNumber: string;
    bounceDate: Date;
    totalAmount: number;
    reversedInvoiceAmount: number;
    reversedAdvanceAmount: number;
    creditAccountId?: string | null;
    creditAccountCode?: string;
    actorId?: string;
    manager?: EntityManager;
  }) {
    const lines: AutoPostingLine[] = [];
    if (input.reversedInvoiceAmount > 0.0001) {
      lines.push({
        accountCode: '1100',
        debit: input.reversedInvoiceAmount,
        credit: 0,
        description: `AR reinstated (Cheque bounced ${input.receiptNumber})`,
      });
    }
    if (input.reversedAdvanceAmount > 0.0001) {
      lines.push({
        accountCode: '2050',
        debit: input.reversedAdvanceAmount,
        credit: 0,
        description: `Advance reversed (Cheque bounced ${input.receiptNumber})`,
      });
    }
    lines.push({
      accountId: input.creditAccountId || undefined,
      accountCode: input.creditAccountCode || '1020',
      debit: 0,
      credit: input.totalAmount,
      description: `Bounced cheque reversal - ${input.receiptNumber}`,
    });

    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.GENERAL,
      entryDate: input.bounceDate,
      description: `Bounced Cheque Reversal for Receipt ${input.receiptNumber}`,
      referenceType: 'CUSTOMER_RECEIPT_BOUNCE',
      referenceId: input.receiptId,
      actorId: input.actorId,
      manager: input.manager,
      lines,
    });
  }

  /** Purchase Invoice posted -> DR Expense, CR AP */
  async postPurchaseInvoice(companyId: string, invoiceCode: string, invoiceId: string, amount: number, actorId?: string, manager?: EntityManager) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PURCHASE_INVOICE,
      entryDate: new Date(),
      description: `AP from purchase invoice ${invoiceCode}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: invoiceId,
      actorId,
      manager,
      lines: [
        { accountCode: '5100', debit: amount, credit: 0, description: `Purchases - invoice ${invoiceCode}` },
        { accountCode: '2000', debit: 0, credit: amount, description: `AP - invoice ${invoiceCode}` },
      ],
    });
  }

  /** Supplier payment -> DR AP, CR Cash/Bank */
  async postSupplierPayment(companyId: string, invoiceCode: string, invoiceId: string, amount: number, actorId?: string, manager?: EntityManager) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PAYMENT,
      entryDate: new Date(),
      description: `Supplier payment against invoice ${invoiceCode}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: invoiceId,
      actorId,
      manager,
      lines: [
        { accountCode: '2000', debit: amount, credit: 0, description: `AP reduction - invoice ${invoiceCode}` },
        { accountCode: '1000', debit: 0, credit: amount, description: `Cash paid - invoice ${invoiceCode}` },
      ],
    });
  }

  /** Purchase return debit note -> DR AP, CR Purchases */
  async postPurchaseReturnDebitNote(
    companyId: string,
    returnCode: string,
    returnId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
  ) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PURCHASE_INVOICE,
      entryDate: new Date(),
      description: `Debit note / AP reduction from purchase return ${returnCode}`,
      referenceType: 'PURCHASE_RETURN',
      referenceId: returnId,
      actorId,
      manager,
      lines: [
        { accountCode: '2000', debit: amount, credit: 0, description: `AP debit note - return ${returnCode}` },
        { accountCode: '5100', debit: 0, credit: amount, description: `Purchase return reversal - ${returnCode}` },
      ],
    });
  }
}
