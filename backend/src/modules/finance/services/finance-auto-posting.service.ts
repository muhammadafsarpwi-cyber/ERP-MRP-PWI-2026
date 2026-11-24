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
  accountCodes?: string[];
  debit: number;
  credit: number;
  description?: string;
  divisionId?: string | null;
  partyType?: string | null;
  partyId?: string | null;
}

interface CorporateCoaSeedItem {
  code: string;
  name: string;
  type: AccountType;
  nb: NormalBalance;
  groupClass: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
  parentCode?: string;
  isBankCash?: boolean;
  isAr?: boolean;
  isAp?: boolean;
}

export const CORPORATE_COA_SEED: CorporateCoaSeedItem[] = [
  { code: '1000', name: 'Cash in Hand', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', isBankCash: true },
  { code: '1010', name: 'Bank Accounts', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', isBankCash: true },
  { code: '1011', name: 'Bank Account - Primary Current (PKR)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', parentCode: '1010', isBankCash: true },
  { code: '1012', name: 'Bank Account - Secondary Collection (PKR)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', parentCode: '1010', isBankCash: true },
  { code: '1020', name: 'Cheques in Hand (Uncleared)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET' },
  { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', isAr: true },
  { code: '1160', name: 'Input Sales Tax (GST Receivable)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET' },
  { code: '1170', name: 'Advance Income Tax (WHT)', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET' },
  { code: '1200', name: 'Inventory Control', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET' },
  { code: '1210', name: 'Raw Material Inventory', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', parentCode: '1200' },
  { code: '1220', name: 'WIP Inventory', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', parentCode: '1200' },
  { code: '1230', name: 'Finished Goods Inventory', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET', parentCode: '1200' },
  { code: '1300', name: 'Fixed Assets', type: AccountType.ASSET, nb: NormalBalance.DEBIT, groupClass: 'ASSET' },
  { code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY', isAp: true },
  { code: '2010', name: 'GRN Clearing (Unbilled Purchases)', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '2100', name: 'Customer Advances Liability', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '2110', name: 'Accrued Expenses', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '2150', name: 'Sales Tax / GST Payable', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '2160', name: 'Withholding Tax (WHT) Payable', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '2200', name: 'Short-term Loans', type: AccountType.LIABILITY, nb: NormalBalance.CREDIT, groupClass: 'LIABILITY' },
  { code: '3000', name: "Owner's Capital", type: AccountType.EQUITY, nb: NormalBalance.CREDIT, groupClass: 'EQUITY' },
  { code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, nb: NormalBalance.CREDIT, groupClass: 'EQUITY' },
  { code: '4000', name: 'Local Sales Revenue', type: AccountType.REVENUE, nb: NormalBalance.CREDIT, groupClass: 'REVENUE' },
  { code: '4090', name: 'Sales Returns & Allowances', type: AccountType.REVENUE, nb: NormalBalance.DEBIT, groupClass: 'REVENUE' },
  { code: '4100', name: 'Scrap & By-Product Sales', type: AccountType.REVENUE, nb: NormalBalance.CREDIT, groupClass: 'REVENUE' },
  { code: '4200', name: 'Other Income', type: AccountType.REVENUE, nb: NormalBalance.CREDIT, groupClass: 'REVENUE' },
  { code: '5000', name: 'Cost of Goods Sold (COGS)', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5100', name: 'Raw Material Purchases', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5200', name: 'Factory Overheads', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5300', name: 'Salaries & Wages', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5350', name: 'Factory & Office Rent', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5400', name: 'Utilities & Fuel', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5500', name: 'Freight & Carriage', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5600', name: 'Repairs & Maintenance', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5700', name: 'Office Expenses', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5800', name: 'Bank Charges', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
  { code: '5900', name: 'Depreciation', type: AccountType.EXPENSE, nb: NormalBalance.DEBIT, groupClass: 'EXPENSE' },
];

/**
 * Central accounting integration service.
 * Every automatic journal must balance, reference the source transaction,
 * be auditable, respect the accounting period and be protected after posting.
 *
 * Accounting mapping (PKR corporate COA):
 *   Sales Invoice posted      -> DR AR (1100), CR Local Sales Revenue (4000) + CR GST Payable (2150)
 *   Sales Return Credit Note  -> DR Sales Returns (4090) + DR GST Payable (2150), CR AR (1100)
 *   Customer receipt          -> DR Selected Cash/Bank (or 1020 PDC), CR AR (1100) + CR Advances (2100/2050)
 *   Advance adjustment        -> DR Customer Advances (2100/2050), CR AR (1100)
 *   Cheque cleared            -> DR Selected Bank (1011/1010), CR Cheques in Hand (1020)
 *   GRN posted                -> DR Raw Material Inventory (1210), CR GRN Clearing (2010)
 *   Purchase Invoice posted   -> DR GRN Clearing (2010) / Purchases (5100) + DR Input GST (1160), CR AP (2000)
 *   Supplier payment          -> DR AP (2000), CR Cash/Bank + CR WHT Payable (2160)
 */
@Injectable()
export class FinanceAutoPostingService {
  private readonly logger = new Logger(FinanceAutoPostingService.name);
  private readonly ensuredCompanies = new Set<string>();

  constructor(
    @InjectRepository(FinanceJournal) private readonly journalRepo: Repository<FinanceJournal>,
    @InjectRepository(FinanceJournalLine) private readonly lineRepo: Repository<FinanceJournalLine>,
    @InjectRepository(FinanceAccount) private readonly accountRepo: Repository<FinanceAccount>,
    @InjectRepository(FinanceAccountingPeriod) private readonly periodRepo: Repository<FinanceAccountingPeriod>,
    @InjectRepository(FinanceFiscalYear) private readonly fyRepo: Repository<FinanceFiscalYear>,
  ) {}

  async ensureSystemArAccounts(
    companyId: string,
    manager?: EntityManager,
    force = false,
  ): Promise<{ seededCount: number; totalAccounts: number }> {
    if (!companyId) return { seededCount: 0, totalAccounts: 0 };
    const accountRepo = manager ? manager.getRepository(FinanceAccount) : this.accountRepo;
    if (!accountRepo || typeof accountRepo.find !== 'function') {
      return { seededCount: 0, totalAccounts: 0 };
    }

    if (!force && this.ensuredCompanies.has(companyId)) {
      return { seededCount: 0, totalAccounts: 0 };
    }

    const existingList = await accountRepo.find({ where: { companyId } }).catch(() => []);
    const byCode = new Map<string, FinanceAccount>(
      (existingList || []).map((a) => [a.accountCode, a]),
    );

    const missing = CORPORATE_COA_SEED.filter((def) => !byCode.has(def.code));
    if (missing.length === 0) {
      this.ensuredCompanies.add(companyId);
      return { seededCount: 0, totalAccounts: existingList.length };
    }

    const groupRepo = manager
      ? manager.getRepository(FinanceAccountGroup)
      : accountRepo.manager?.getRepository?.(FinanceAccountGroup);
    const groups = groupRepo && typeof groupRepo.find === 'function'
      ? await groupRepo.find({ where: { companyId } }).catch(() => [])
      : [];

    const groupByClass = new Map<string, string>();
    for (const g of groups || []) {
      const cls = String((g as any).groupClass || '').toUpperCase();
      if (cls) groupByClass.set(cls, g.id);
    }

    let seededCount = 0;
    for (const def of missing) {
      if (byCode.has(def.code)) continue;
      const parentId = def.parentCode ? byCode.get(def.parentCode)?.id ?? null : null;
      const entity = accountRepo.create({
        companyId,
        accountCode: def.code,
        accountName: def.name,
        accountType: def.type,
        normalBalance: def.nb,
        groupId: groupByClass.get(def.groupClass) ?? null,
        parentAccountId: parentId,
        currency: 'PKR',
        isBankCash: def.isBankCash ?? false,
        isAr: def.isAr ?? false,
        isAp: def.isAp ?? false,
        status: 'ACTIVE',
      });
      const saved = await accountRepo.save(entity).catch(() => null);
      if (saved) {
        byCode.set(def.code, saved);
        seededCount += 1;
      }
    }

    this.ensuredCompanies.add(companyId);
    return { seededCount, totalAccounts: byCode.size };
  }

  private async nextJournalNumber(
    companyId: string,
    manager?: EntityManager,
    prefix = 'JV-AUTO-',
  ): Promise<string> {
    const repo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const r = await repo
      .createQueryBuilder('j')
      .select("MAX(CAST(NULLIF(SUBSTRING(j.journal_number FROM '([0-9]+)$'), '') AS INT))", 'maxNum')
      .addSelect('COUNT(*)::int', 'cnt')
      .where('j.company_id = :companyId', { companyId })
      .getRawOne();
    const nextNum = Math.max(Number(r?.maxNum) || 0, Number(r?.cnt) || 0) + 1;
    return `${prefix}${String(nextNum).padStart(6, '0')}`;
  }

  private async resolvePeriod(
    companyId: string,
    entryDate: Date,
    manager?: EntityManager,
  ): Promise<{ periodId: string | null; fiscalYearId: string | null }> {
    const periodRepo = manager ? manager.getRepository(FinanceAccountingPeriod) : this.periodRepo;
    const fyRepo = manager ? manager.getRepository(FinanceFiscalYear) : this.fyRepo;
    const dateStr = entryDate instanceof Date ? entryDate.toISOString().slice(0, 10) : String(entryDate).slice(0, 10);

    if (periodRepo && typeof periodRepo.createQueryBuilder === 'function') {
      const period = await periodRepo
        .createQueryBuilder('p')
        .innerJoinAndSelect('p.fiscalYear', 'fy')
        .where('fy.company_id = :companyId', { companyId })
        .andWhere('p.start_date <= :d AND p.end_date >= :d', { d: dateStr })
        .andWhere('p.status = :st', { st: 'OPEN' })
        .getOne()
        .catch(() => null);
      if (period) return { periodId: period.id, fiscalYearId: period.fiscalYearId };
    }

    const fy = await fyRepo?.findOne?.({ where: { companyId, status: 'OPEN' } }).catch(() => null);
    return { periodId: null, fiscalYearId: fy?.id ?? null };
  }

  private async resolveLineAccount(
    companyId: string,
    line: AutoPostingLine,
    accountRepo: Repository<FinanceAccount>,
    manager?: EntityManager,
  ): Promise<FinanceAccount | null> {
    if (line.accountId) {
      const byId = await accountRepo.findOne({ where: { id: line.accountId, companyId } });
      if (byId) return byId;
    }

    const candidates = Array.from(
      new Set([...(line.accountCodes || []), line.accountCode].filter(Boolean)),
    );
    for (const code of candidates) {
      const found = await accountRepo.findOne({ where: { companyId, accountCode: code } });
      if (found) return found;
    }

    await this.ensureSystemArAccounts(companyId, manager, true);
    for (const code of candidates) {
      const found = await accountRepo.findOne({ where: { companyId, accountCode: code } });
      if (found) return found;
    }
    return null;
  }

  private deriveVoucherType(journalType: JournalType, explicit?: string | null): string {
    if (explicit) return explicit;
    if (journalType === JournalType.PAYMENT) return 'PV';
    if (journalType === JournalType.RECEIPT) return 'RV';
    if (journalType === JournalType.CONTRA) return 'CV';
    return 'JV';
  }

  /**
   * Creates and immediately posts a balanced automatic journal.
   */
  async postAutoJournal(input: {
    companyId: string;
    journalType: JournalType;
    voucherType?: string | null;
    entryDate: Date;
    description: string;
    referenceType: string;
    referenceId: string;
    lines: AutoPostingLine[];
    divisionId?: string | null;
    partyType?: string | null;
    partyId?: string | null;
    paymentMode?: string | null;
    chequeNumber?: string | null;
    chequeDate?: Date | null;
    bankAccountId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }): Promise<FinanceJournal> {
    const {
      companyId,
      journalType,
      voucherType,
      entryDate,
      description,
      referenceType,
      referenceId,
      lines,
      divisionId,
      partyType,
      partyId,
      paymentMode,
      chequeNumber,
      chequeDate,
      bankAccountId,
      actorId,
      manager,
    } = input;

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
      const account = await this.resolveLineAccount(companyId, l, accountRepo, manager);
      if (!account) {
        throw new Error(`Auto-journal account ${l.accountCode} not found for company ${companyId}`);
      }
      journalLines.push(
        lineRepo.create({
          lineNumber: lineNumber++,
          accountId: account.id,
          description: l.description ?? description,
          debit: Math.round((Number(l.debit) || 0) * 10000) / 10000,
          credit: Math.round((Number(l.credit) || 0) * 10000) / 10000,
          referenceType,
          referenceId,
          divisionId: l.divisionId ?? divisionId ?? null,
          partyType: l.partyType ?? partyType ?? null,
          partyId: l.partyId ?? partyId ?? null,
        }),
      );
    }

    const { periodId, fiscalYearId } = await this.resolvePeriod(companyId, entryDate, manager);
    const journalNumber = await this.nextJournalNumber(companyId, manager);

    const journal = journalRepo.create({
      companyId,
      journalNumber,
      journalType,
      voucherType: this.deriveVoucherType(journalType, voucherType),
      entryDate,
      periodId,
      fiscalYearId,
      description,
      referenceType,
      referenceId,
      divisionId: divisionId ?? null,
      partyType: partyType ?? null,
      partyId: partyId ?? null,
      paymentMode: paymentMode ?? null,
      chequeNumber: chequeNumber ?? null,
      chequeDate: chequeDate ?? null,
      bankAccountId: bankAccountId ?? null,
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

  /**
   * Sales Invoice posted -> DR AR (1100), CR Local Sales Revenue (4000), CR GST Payable (2150 when taxAmount > 0)
   */
  async postSalesInvoice(
    companyId: string,
    invoiceNo: string,
    invoiceId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
    entryDate?: Date,
    opts?: {
      subtotal?: number;
      taxAmount?: number;
      divisionId?: string | null;
      customerId?: string | null;
    },
  ) {
    const journalRepo = manager ? manager.getRepository(FinanceJournal) : this.journalRepo;
    const existing = await journalRepo.findOne({
      where: {
        companyId,
        referenceType: 'SALES_INVOICE',
        referenceId: invoiceId,
        journalType: JournalType.SALES_INVOICE,
      },
    });
    if (existing) return existing;

    let subtotal = opts?.subtotal;
    let taxAmount = opts?.taxAmount;
    let divisionId = opts?.divisionId ?? null;
    let customerId = opts?.customerId ?? null;

    // Enrich missing tax/division/party metadata safely from sales_invoices when executing against real DB
    if ((taxAmount === undefined || !divisionId || !customerId) && invoiceId) {
      const qryMgr = manager || this.journalRepo.manager;
      if (qryMgr && typeof qryMgr.query === 'function') {
        const rows: any[] = await qryMgr
          .query(
            `SELECT subtotal, tax_amount, total_amount, division_id, customer_id
             FROM erp_sales.sales_invoices
             WHERE id = $1 LIMIT 1`,
            [invoiceId],
          )
          .catch(() => []);
        if (rows?.length) {
          const r = rows[0];
          if (taxAmount === undefined && Number(r.tax_amount) > 0) {
            taxAmount = Number(r.tax_amount);
            subtotal = Number(r.subtotal || amount - taxAmount);
          }
          if (!divisionId && r.division_id) divisionId = r.division_id;
          if (!customerId && r.customer_id) customerId = r.customer_id;
        }
      }
    }

    const total = Math.round(Number(amount || 0) * 10000) / 10000;
    const gst = Math.round(Number(taxAmount || 0) * 10000) / 10000;
    const netRevenue =
      gst > 0.005
        ? Math.round((subtotal !== undefined ? Number(subtotal) : total - gst) * 10000) / 10000
        : total;

    const lines: AutoPostingLine[] = [
      { accountCode: '1100', debit: total, credit: 0, description: `AR - invoice ${invoiceNo}` },
      {
        accountCode: '4000',
        debit: 0,
        credit: netRevenue,
        description: gst > 0.005 ? `Local sales revenue (excl. GST) - ${invoiceNo}` : `Sales revenue - invoice ${invoiceNo}`,
      },
    ];
    if (gst > 0.005) {
      lines.push({
        accountCode: '2150',
        debit: 0,
        credit: gst,
        description: `Output Sales Tax / GST (18%) - ${invoiceNo}`,
      });
    }

    return this.postAutoJournal({
      companyId,
      journalType: JournalType.SALES_INVOICE,
      voucherType: 'JV',
      entryDate: entryDate || new Date(),
      description: `AR from sales invoice ${invoiceNo}`,
      referenceType: 'SALES_INVOICE',
      referenceId: invoiceId,
      divisionId,
      partyType: customerId ? 'CUSTOMER' : null,
      partyId: customerId,
      actorId,
      manager,
      lines,
    });
  }

  /** Legacy single-invoice receipt helper */
  async postCustomerReceipt(
    companyId: string,
    invoiceNo: string,
    invoiceId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
  ) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.RECEIPT,
      voucherType: 'RV',
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

  /** Unified Customer Receipt / Advance Voucher -> DR Cash/Bank/PDC, CR AR (1100) + CR Customer Advances (2100/2050) */
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
    customerId?: string | null;
    customerName?: string;
    divisionId?: string | null;
    paymentMode?: string | null;
    chequeNumber?: string | null;
    chequeDate?: Date | null;
    invoiceNumbers?: string[];
    actorId?: string;
    manager?: EntityManager;
  }) {
    const lines: AutoPostingLine[] = [
      {
        accountId: input.debitAccountId || undefined,
        accountCode: input.debitAccountCode || '1011',
        accountCodes: input.debitAccountCode ? [input.debitAccountCode, '1010'] : ['1011', '1010'],
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
        accountCode: '2100',
        accountCodes: ['2100', '2050'],
        debit: 0,
        credit: input.advanceAmount,
        description: `Unallocated customer advance - ${input.receiptNumber}`,
      });
    }

    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.RECEIPT,
      voucherType: 'RV',
      entryDate: input.receiptDate,
      description: `Customer Receipt ${input.receiptNumber}${input.customerName ? ` - ${input.customerName}` : ''}`,
      referenceType: 'CUSTOMER_RECEIPT',
      referenceId: input.receiptId,
      divisionId: input.divisionId ?? null,
      partyType: input.customerId ? 'CUSTOMER' : null,
      partyId: input.customerId ?? null,
      paymentMode: input.paymentMode ?? null,
      chequeNumber: input.chequeNumber ?? null,
      chequeDate: input.chequeDate ?? null,
      bankAccountId: input.debitAccountId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines,
    });
  }

  /** Advance Adjustment -> DR Customer Advances (2100/2050), CR Accounts Receivable (1100) */
  async postAdvanceAdjustment(input: {
    companyId: string;
    referenceId: string;
    receiptNumber: string;
    invoiceNumbers: string[];
    adjustmentDate: Date;
    amount: number;
    customerId?: string | null;
    customerName?: string;
    divisionId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }) {
    const invSummary = input.invoiceNumbers.join(', ');
    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.GENERAL,
      voucherType: 'JV',
      entryDate: input.adjustmentDate,
      description: `Advance ${input.receiptNumber} adjusted against ${invSummary}`,
      referenceType: 'ADVANCE_ADJUSTMENT',
      referenceId: input.referenceId,
      divisionId: input.divisionId ?? null,
      partyType: input.customerId ? 'CUSTOMER' : null,
      partyId: input.customerId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines: [
        {
          accountCode: '2100',
          accountCodes: ['2100', '2050'],
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

  /** Cheque Clearance -> DR Bank (selected or 1011/1010), CR Cheques in Hand (1020) */
  async postChequeClearance(input: {
    companyId: string;
    receiptId: string;
    receiptNumber: string;
    clearanceDate: Date;
    amount: number;
    bankAccountId?: string | null;
    customerId?: string | null;
    divisionId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }) {
    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.CONTRA,
      voucherType: 'CV',
      entryDate: input.clearanceDate,
      description: `Cheque cleared for Receipt ${input.receiptNumber}`,
      referenceType: 'CUSTOMER_RECEIPT_CLEAR',
      referenceId: input.receiptId,
      divisionId: input.divisionId ?? null,
      partyType: input.customerId ? 'CUSTOMER' : null,
      partyId: input.customerId ?? null,
      bankAccountId: input.bankAccountId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines: [
        {
          accountId: input.bankAccountId || undefined,
          accountCode: '1011',
          accountCodes: ['1011', '1010'],
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

  /** Cheque Bounce Reversal -> DR AR (1100) + DR Advances (2100/2050), CR Bank/Cash/1020 */
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
    customerId?: string | null;
    divisionId?: string | null;
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
        accountCode: '2100',
        accountCodes: ['2100', '2050'],
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
      voucherType: 'JV',
      entryDate: input.bounceDate,
      description: `Bounced Cheque Reversal for Receipt ${input.receiptNumber}`,
      referenceType: 'CUSTOMER_RECEIPT_BOUNCE',
      referenceId: input.receiptId,
      divisionId: input.divisionId ?? null,
      partyType: input.customerId ? 'CUSTOMER' : null,
      partyId: input.customerId ?? null,
      bankAccountId: input.creditAccountId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines,
    });
  }

  /** Sales Return Credit Note -> DR Sales Returns (4090) + DR GST Payable (2150), CR AR (1100) */
  async postSalesReturnCreditNote(input: {
    companyId: string;
    returnId: string;
    returnNumber: string;
    creditNoteNumber: string;
    creditDate: Date;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    customerId?: string | null;
    customerName?: string;
    divisionId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }) {
    const journalRepo = input.manager ? input.manager.getRepository(FinanceJournal) : this.journalRepo;
    const existing = await journalRepo.findOne({
      where: {
        companyId: input.companyId,
        referenceType: 'SALES_RETURN',
        referenceId: input.returnId,
        journalType: JournalType.SALES_RETURN,
      },
    });
    if (existing) return existing;

    const total = Math.round(Number(input.totalAmount || 0) * 10000) / 10000;
    const gst = Math.round(Number(input.taxAmount || 0) * 10000) / 10000;
    const netReturn =
      gst > 0.005
        ? Math.round((Number(input.subtotal || 0) || total - gst) * 10000) / 10000
        : total;

    const lines: AutoPostingLine[] = [
      {
        accountCode: '4090',
        debit: netReturn,
        credit: 0,
        description: `Sales return credit note ${input.creditNoteNumber} (${input.returnNumber})`,
      },
    ];
    if (gst > 0.005) {
      lines.push({
        accountCode: '2150',
        debit: gst,
        credit: 0,
        description: `GST reversal on credit note ${input.creditNoteNumber}`,
      });
    }
    lines.push({
      accountCode: '1100',
      debit: 0,
      credit: total,
      description: `AR credit note ${input.creditNoteNumber} (${input.customerName || input.returnNumber})`,
    });

    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.SALES_RETURN,
      voucherType: 'JV',
      entryDate: input.creditDate,
      description: `Credit Note ${input.creditNoteNumber} for Sales Return ${input.returnNumber}`,
      referenceType: 'SALES_RETURN',
      referenceId: input.returnId,
      divisionId: input.divisionId ?? null,
      partyType: input.customerId ? 'CUSTOMER' : null,
      partyId: input.customerId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines,
    });
  }

  /** Goods Receipt (GRN) posted -> DR Raw Material Inventory (1210), CR GRN Clearing (2010) */
  async postGoodsReceiptAccrual(input: {
    companyId: string;
    grnId: string;
    grnNumber: string;
    receiptDate: Date;
    amount: number;
    supplierId?: string | null;
    supplierName?: string;
    divisionId?: string | null;
    actorId?: string;
    manager?: EntityManager;
  }) {
    const amount = Math.round(Number(input.amount || 0) * 10000) / 10000;
    if (amount <= 0.005) return null;

    const journalRepo = input.manager ? input.manager.getRepository(FinanceJournal) : this.journalRepo;
    const existing = await journalRepo.findOne({
      where: {
        companyId: input.companyId,
        referenceType: 'GOODS_RECEIPT',
        referenceId: input.grnId,
        journalType: JournalType.GRN_ACCRUAL,
      },
    });
    if (existing) return existing;

    return this.postAutoJournal({
      companyId: input.companyId,
      journalType: JournalType.GRN_ACCRUAL,
      voucherType: 'JV',
      entryDate: input.receiptDate,
      description: `GRN inventory accrual ${input.grnNumber}${input.supplierName ? ` (${input.supplierName})` : ''}`,
      referenceType: 'GOODS_RECEIPT',
      referenceId: input.grnId,
      divisionId: input.divisionId ?? null,
      partyType: input.supplierId ? 'SUPPLIER' : null,
      partyId: input.supplierId ?? null,
      actorId: input.actorId,
      manager: input.manager,
      lines: [
        {
          accountCode: '1210',
          debit: amount,
          credit: 0,
          description: `Raw material received - ${input.grnNumber}`,
        },
        {
          accountCode: '2010',
          debit: 0,
          credit: amount,
          description: `Unbilled GRN clearing - ${input.grnNumber}`,
        },
      ],
    });
  }

  /**
   * Purchase Invoice posted -> DR GRN Clearing (2010) or Purchases (5100) + DR Input GST (1160), CR AP (2000)
   */
  async postPurchaseInvoice(
    companyId: string,
    invoiceCode: string,
    invoiceId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
    opts?: {
      subtotal?: number;
      taxAmount?: number;
      hasGrnAccrual?: boolean;
      divisionId?: string | null;
      supplierId?: string | null;
      entryDate?: Date;
    },
  ) {
    const total = Math.round(Number(amount || 0) * 10000) / 10000;
    const tax = Math.round(Number(opts?.taxAmount || 0) * 10000) / 10000;
    const netAmount =
      tax > 0.005
        ? Math.round((opts?.subtotal !== undefined ? Number(opts.subtotal) : total - tax) * 10000) / 10000
        : total;
    const debitAccountCode = opts?.hasGrnAccrual ? '2010' : '5100';

    const lines: AutoPostingLine[] = [
      {
        accountCode: debitAccountCode,
        debit: netAmount,
        credit: 0,
        description: opts?.hasGrnAccrual
          ? `GRN clearing matched - invoice ${invoiceCode}`
          : `Purchases - invoice ${invoiceCode}`,
      },
    ];
    if (tax > 0.005) {
      lines.push({
        accountCode: '1160',
        debit: tax,
        credit: 0,
        description: `Input Sales Tax / GST - invoice ${invoiceCode}`,
      });
    }
    lines.push({
      accountCode: '2000',
      debit: 0,
      credit: total,
      description: `AP - invoice ${invoiceCode}`,
    });

    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PURCHASE_INVOICE,
      voucherType: 'JV',
      entryDate: opts?.entryDate || new Date(),
      description: `AP from purchase invoice ${invoiceCode}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: invoiceId,
      divisionId: opts?.divisionId ?? null,
      partyType: opts?.supplierId ? 'SUPPLIER' : null,
      partyId: opts?.supplierId ?? null,
      actorId,
      manager,
      lines,
    });
  }

  /** Supplier payment -> DR AP (2000), CR Cash/Bank + optional CR WHT Payable (2160) */
  async postSupplierPayment(
    companyId: string,
    invoiceCode: string,
    invoiceId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
    opts?: {
      bankAccountId?: string | null;
      paymentMode?: string | null;
      whtAmount?: number;
      chequeNumber?: string | null;
      chequeDate?: Date | null;
      divisionId?: string | null;
      supplierId?: string | null;
      entryDate?: Date;
    },
  ) {
    const grossSettlement = Math.round(Number(amount || 0) * 10000) / 10000;
    const wht = Math.round(Math.max(0, Number(opts?.whtAmount || 0)) * 10000) / 10000;
    const netDisbursed = Math.round(Math.max(0, grossSettlement - wht) * 10000) / 10000;

    const mode = String(opts?.paymentMode || 'CASH').toUpperCase();
    const isCash = mode === 'CASH';
    const creditCode = isCash ? '1000' : '1011';
    const creditCodes = isCash ? ['1000'] : ['1011', '1010'];

    const lines: AutoPostingLine[] = [
      {
        accountCode: '2000',
        debit: grossSettlement,
        credit: 0,
        description: `AP reduction - invoice ${invoiceCode}`,
      },
      {
        accountId: opts?.bankAccountId || undefined,
        accountCode: creditCode,
        accountCodes: creditCodes,
        debit: 0,
        credit: netDisbursed,
        description: `${isCash ? 'Cash' : 'Bank'} paid - invoice ${invoiceCode}`,
      },
    ];
    if (wht > 0.005) {
      lines.push({
        accountCode: '2160',
        debit: 0,
        credit: wht,
        description: `Withholding Tax deducted - invoice ${invoiceCode}`,
      });
    }

    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PAYMENT,
      voucherType: 'PV',
      entryDate: opts?.entryDate || new Date(),
      description: `Supplier payment against invoice ${invoiceCode}`,
      referenceType: 'PURCHASE_INVOICE',
      referenceId: invoiceId,
      divisionId: opts?.divisionId ?? null,
      partyType: opts?.supplierId ? 'SUPPLIER' : null,
      partyId: opts?.supplierId ?? null,
      paymentMode: opts?.paymentMode ?? null,
      chequeNumber: opts?.chequeNumber ?? null,
      chequeDate: opts?.chequeDate ?? null,
      bankAccountId: opts?.bankAccountId ?? null,
      actorId,
      manager,
      lines,
    });
  }

  /** Purchase return debit note -> DR AP (2000), CR Purchases (5100) */
  async postPurchaseReturnDebitNote(
    companyId: string,
    returnCode: string,
    returnId: string,
    amount: number,
    actorId?: string,
    manager?: EntityManager,
    opts?: {
      supplierId?: string | null;
      divisionId?: string | null;
      useInventoryAsset?: boolean;
    },
  ) {
    return this.postAutoJournal({
      companyId,
      journalType: JournalType.PURCHASE_INVOICE,
      voucherType: 'JV',
      entryDate: new Date(),
      description: `Debit note / AP reduction from purchase return ${returnCode}`,
      referenceType: 'PURCHASE_RETURN',
      referenceId: returnId,
      divisionId: opts?.divisionId ?? null,
      partyType: opts?.supplierId ? 'SUPPLIER' : null,
      partyId: opts?.supplierId ?? null,
      actorId,
      manager,
      lines: [
        { accountCode: '2000', debit: amount, credit: 0, description: `AP debit note - return ${returnCode}` },
        {
          accountCode: opts?.useInventoryAsset ? '1210' : '5100',
          debit: 0,
          credit: amount,
          description: `Purchase return reversal - ${returnCode}`,
        },
      ],
    });
  }
}
