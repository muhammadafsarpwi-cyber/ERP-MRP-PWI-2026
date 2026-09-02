import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { FinanceJournal, FinanceJournalLine, JournalStatus, JournalType } from '../entities';
import { FinanceAccount } from '../entities/finance-account.entity';
import { FinanceAccountingPeriod } from '../entities/finance-accounting-period.entity';
import { FinanceFiscalYear } from '../entities/finance-fiscal-year.entity';

export interface AutoPostingLine {
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
 * Accounting mapping (explicit configuration, not invented policy):
 *   Sales Invoice posted      -> DR AR (1100), CR Sales Revenue (4000)
 *   Customer receipt          -> DR Cash/Bank (1000/1010), CR AR (1100)
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

  private async nextJournalNumber(companyId: string, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const r = await repo
      .createQueryBuilder('j')
      .select('COUNT(*)::int', 'cnt')
      .where('j.company_id = :companyId', { companyId })
      .getRawOne();
    return `JV-AUTO-${String((Number(r?.cnt) || 0) + 1).padStart(6, '0')}`;
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
   * Throws if lines do not balance or an account is missing.
   *
   * When an optional `manager` (EntityManager) is provided the whole journal is
   * written inside that caller's transaction, so an auto-posting can be committed
   * atomically together with the source transaction that triggered it (e.g. a
   * purchase invoice POSTED + its AP journal + the Purchase Order invoiced amount).
   * Without a manager it behaves exactly as before (independent, committed save).
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

    const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.0001) {
      throw new Error(`Auto-journal unbalanced: debit ${totalDebit} <> credit ${totalCredit}`);
    }

    const journalLines: FinanceJournalLine[] = [];
    let lineNumber = 1;
    for (const l of lines) {
      const account = await accountRepo.findOne({ where: { companyId, accountCode: l.accountCode } });
      if (!account) {
        throw new Error(`Auto-journal account ${l.accountCode} not found for company ${companyId}`);
      }
      journalLines.push(lineRepo.create({
        lineNumber: lineNumber++,
        accountId: account.id,
        description: l.description ?? description,
        debit: l.debit || 0,
        credit: l.credit || 0,
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

  /** Sales Invoice posted -> DR AR, CR Sales Revenue */
  async postSalesInvoice(companyId: string, invoiceNo: string, invoiceId: string, amount: number, actorId?: string) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.SALES_INVOICE,
      entryDate: new Date(),
      description: `AR from sales invoice ${invoiceNo}`,
      referenceType: 'SALES_INVOICE',
      referenceId: invoiceId,
      actorId,
      lines: [
        { accountCode: '1100', debit: amount, credit: 0, description: `AR - invoice ${invoiceNo}` },
        { accountCode: '4000', debit: 0, credit: amount, description: `Sales revenue - invoice ${invoiceNo}` },
      ],
    });
  }

  /** Customer receipt -> DR Cash/Bank, CR AR */
  async postCustomerReceipt(companyId: string, invoiceNo: string, invoiceId: string, amount: number, actorId?: string) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.RECEIPT,
      entryDate: new Date(),
      description: `Customer payment against invoice ${invoiceNo}`,
      referenceType: 'SALES_INVOICE',
      referenceId: invoiceId,
      actorId,
      lines: [
        { accountCode: '1000', debit: amount, credit: 0, description: `Cash received - invoice ${invoiceNo}` },
        { accountCode: '1100', debit: 0, credit: amount, description: `AR reduction - invoice ${invoiceNo}` },
      ],
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
}