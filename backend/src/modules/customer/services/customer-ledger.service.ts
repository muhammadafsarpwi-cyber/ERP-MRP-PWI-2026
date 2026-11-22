import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CustomerLedgerEntry, CustomerDocumentType } from '../entities/customer-ledger.entity';
import { Customer } from '../entities/customer.entity';

export interface LedgerFilterOptions {
  fromDate?: string;
  toDate?: string;
  documentType?: CustomerDocumentType | string;
  divisionId?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CustomerAgingBuckets {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90Plus: number;
  totalOpenBalance: number;
  overdueAmount: number;
  overdueInvoiceCount: number;
  openInvoiceCount: number;
}

export interface CustomerLedgerSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  currency: string;
  openingBalance: number;
  totalInvoiced: number;
  totalDebitNotes: number;
  totalReceiptsAndAdvances: number;
  totalReturnsAndCredits: number;
  unadjustedAdvanceBalance: number;
  netReceivableBalance: number;
  totalDebit: number;
  totalCredit: number;
  outstandingBalance: number;
  balanceType: 'DEBIT' | 'CREDIT' | 'ZERO';
  lastTransactionDate: Date | null;
  transactionCount: number;
  creditLimit: number;
  creditDays: number;
  paymentTerms: string;
  creditHold: boolean;
  creditHoldReason: string | null;
  aging: CustomerAgingBuckets;
  openInvoices: any[];
  availableAdvances: any[];
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000;

@Injectable()
export class CustomerLedgerService {
  private readonly logger = new Logger(CustomerLedgerService.name);

  constructor(
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  /**
   * Recompute and persist sequential running_balance on every ledger row for a customer.
   */
  async recalculateRunningBalances(
    customerId: string,
    companyId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const ledgerRepo = manager ? manager.getRepository(CustomerLedgerEntry) : this.ledgerRepo;
    if (typeof ledgerRepo.find !== 'function') return;

    const all = await Promise.resolve(
      ledgerRepo.find({
        where: { customerId, companyId },
        order: { transactionDate: 'ASC', createdAt: 'ASC' },
      }),
    ).catch(() => [] as CustomerLedgerEntry[]);

    if (!all || all.length === 0) return;

    let running = 0;
    const toUpdate: CustomerLedgerEntry[] = [];
    for (const row of all) {
      running = round4(running + (Number(row.debit) || 0) - (Number(row.credit) || 0));
      if (Math.abs((Number(row.runningBalance) || 0) - running) > 0.0001) {
        row.runningBalance = running;
        toUpdate.push(row);
      }
    }
    if (toUpdate.length > 0 && typeof ledgerRepo.save === 'function') {
      await ledgerRepo.save(toUpdate);
    }
  }

  private async fetchCustomerAgingAndOpenDocs(
    customerId: string,
    companyId: string,
    netLedgerBalance: number,
  ): Promise<{
    aging: CustomerAgingBuckets;
    unadjustedAdvanceBalance: number;
    openInvoices: any[];
    availableAdvances: any[];
    divisionMap: Map<string, string>;
  }> {
    const emptyAging: CustomerAgingBuckets = {
      current: 0,
      days1to30: 0,
      days31to60: 0,
      days61to90: 0,
      days90Plus: 0,
      totalOpenBalance: 0,
      overdueAmount: 0,
      overdueInvoiceCount: 0,
      openInvoiceCount: 0,
    };
    const divisionMap = new Map<string, string>();

    if (typeof this.ledgerRepo.manager?.query !== 'function') {
      return {
        aging: emptyAging,
        unadjustedAdvanceBalance: 0,
        openInvoices: [],
        availableAdvances: [],
        divisionMap,
      };
    }

    try {
      const [divRows, openInvRows, advRows]: [any[], any[], any[]] = await Promise.all([
        Promise.resolve(this.ledgerRepo.manager.query(`SELECT id, name FROM public.divisions`)).catch(() => []),
        Promise.resolve(this.ledgerRepo.manager.query(
          `SELECT si.id,
                  si.invoice_no,
                  si.invoice_date,
                  si.due_date,
                  si.payment_terms,
                  si.division_id,
                  si.sales_order_id,
                  so.order_number AS soc_number,
                  so.customer_po AS customer_po,
                  si.delivery_number,
                  si.gate_pass_number,
                  si.total_amount,
                  si.paid_amount,
                  si.balance,
                  si.status,
                  d.name AS division_name
           FROM erp_sales.sales_invoices si
           LEFT JOIN erp_sales.sales_orders so ON so.id = si.sales_order_id
           LEFT JOIN public.divisions d ON d.id = COALESCE(si.division_id, so.division_id)
           WHERE si.company_id = $1
             AND si.customer_id = $2
             AND si.deleted_at IS NULL
             AND LOWER(COALESCE(si.status, 'pending')) <> 'cancelled'
           ORDER BY COALESCE(si.due_date, si.invoice_date) ASC, si.created_at ASC`,
          [companyId, customerId],
        )).catch(() => []),
        Promise.resolve(this.ledgerRepo.manager.query(
          `SELECT r.id,
                  r.receipt_number,
                  r.receipt_date,
                  r.division_id,
                  d.name AS division_name,
                  r.soc_number,
                  r.po_reference,
                  r.payment_mode,
                  r.receipt_type,
                  r.cheque_number,
                  r.clearance_status,
                  r.amount,
                  r.allocated_amount,
                  r.unallocated_advance_amount,
                  r.remarks
           FROM erp_sales.customer_receipts r
           LEFT JOIN public.divisions d ON d.id = r.division_id
           WHERE r.company_id = $1
             AND r.customer_id = $2
             AND r.deleted_at IS NULL
             AND r.status = 'POSTED'
             AND COALESCE(r.clearance_status, 'CLEARED') <> 'BOUNCED'
             AND COALESCE(r.unallocated_advance_amount, 0) > 0
           ORDER BY r.receipt_date ASC, r.created_at ASC`,
          [companyId, customerId],
        )).catch(() => []),
      ]);

      for (const d of divRows || []) {
        divisionMap.set(d.id, d.name);
      }

      const todayUtc = new Date();
      const todayDay = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());

      const aging: CustomerAgingBuckets = { ...emptyAging };
      const openInvoices: any[] = [];

      for (const inv of openInvRows || []) {
        const total = round2(Number(inv.total_amount) || 0);
        const paid = round2(Number(inv.paid_amount) || 0);
        const balance = round2(
          inv.balance !== undefined && inv.balance !== null ? Number(inv.balance) : Math.max(0, total - paid),
        );
        const refDateRaw = inv.due_date || inv.invoice_date;
        const refDate = refDateRaw ? new Date(refDateRaw) : todayUtc;
        const refDay = Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate());
        const daysOverdue = balance > 0 ? Math.max(0, Math.floor((todayDay - refDay) / 86400000)) : 0;

        const mapped = {
          id: inv.id,
          invoiceNo: inv.invoice_no,
          invoiceDate: inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : null,
          dueDate: inv.due_date ? String(inv.due_date).slice(0, 10) : null,
          paymentTerms: inv.payment_terms || 'Cash / Immediate',
          divisionId: inv.division_id || null,
          divisionName: inv.division_name || null,
          socNumber: inv.soc_number || null,
          customerPo: inv.customer_po || null,
          deliveryNumber: inv.delivery_number || null,
          gatePassNumber: inv.gate_pass_number || null,
          totalAmount: total,
          paidAmount: paid,
          balance,
          status: inv.status,
          daysOverdue,
        };

        if (balance > 0) {
          openInvoices.push(mapped);
          aging.openInvoiceCount += 1;
          aging.totalOpenBalance = round2(aging.totalOpenBalance + balance);
          if (daysOverdue <= 0) {
            aging.current = round2(aging.current + balance);
          } else {
            aging.overdueInvoiceCount += 1;
            aging.overdueAmount = round2(aging.overdueAmount + balance);
            if (daysOverdue <= 30) aging.days1to30 = round2(aging.days1to30 + balance);
            else if (daysOverdue <= 60) aging.days31to60 = round2(aging.days31to60 + balance);
            else if (daysOverdue <= 90) aging.days61to90 = round2(aging.days61to90 + balance);
            else aging.days90Plus = round2(aging.days90Plus + balance);
          }
        }
      }

      // If net ledger receivable exceeds open invoice balances (e.g. debit Opening Balance not tied to an invoice),
      // include that un-invoiced receivable in Current so the aging total reconciles cleanly with open exposure.
      const uninvoicedReceivable = round2(Math.max(0, netLedgerBalance - aging.totalOpenBalance));
      if (uninvoicedReceivable > 0.01 && aging.openInvoiceCount === 0) {
        aging.current = round2(aging.current + uninvoicedReceivable);
        aging.totalOpenBalance = round2(aging.totalOpenBalance + uninvoicedReceivable);
      }

      const availableAdvances = (advRows || []).map((r: any) => ({
        id: r.id,
        receiptNumber: r.receipt_number,
        receiptDate: r.receipt_date ? String(r.receipt_date).slice(0, 10) : null,
        divisionId: r.division_id || null,
        divisionName: r.division_name || null,
        socNumber: r.soc_number || null,
        poReference: r.po_reference || null,
        paymentMode: r.payment_mode,
        receiptType: r.receipt_type,
        chequeNumber: r.cheque_number || null,
        clearanceStatus: r.clearance_status || 'CLEARED',
        amount: round2(Number(r.amount) || 0),
        allocatedAmount: round2(Number(r.allocated_amount) || 0),
        unallocatedAdvanceAmount: round2(Number(r.unallocated_advance_amount) || 0),
        remarks: r.remarks || null,
      }));

      const unadjustedAdvanceBalance = round2(
        availableAdvances.reduce((s, r) => s + r.unallocatedAdvanceAmount, 0),
      );

      return {
        aging,
        unadjustedAdvanceBalance,
        openInvoices,
        availableAdvances,
        divisionMap,
      };
    } catch (err: any) {
      this.logger.warn(`Could not load customer aging/open docs: ${err?.message || err}`);
      return {
        aging: emptyAging,
        unadjustedAdvanceBalance: 0,
        openInvoices: [],
        availableAdvances: [],
        divisionMap,
      };
    }
  }

  async getLedger(
    customerId: string,
    companyId: string,
    options: LedgerFilterOptions = {},
  ): Promise<{ data: any[]; total: number; summary: CustomerLedgerSummary }> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found in this company`);
    }

    const { fromDate, toDate, documentType, divisionId, search, page = 1, limit = 100 } = options;

    const qb = this.ledgerRepo.createQueryBuilder('l')
      .where('l.customerId = :customerId', { customerId })
      .andWhere('l.companyId = :companyId', { companyId });

    if (fromDate) qb.andWhere('l.transactionDate >= :fromDate', { fromDate });
    if (toDate) qb.andWhere('l.transactionDate <= :toDate', { toDate });
    if (documentType && String(documentType).toUpperCase() !== 'ALL') {
      qb.andWhere('l.documentType = :documentType', { documentType });
    }
    if (divisionId) qb.andWhere('l.divisionId = :divisionId', { divisionId });
    if (search && String(search).trim()) {
      const term = `%${String(search).trim()}%`;
      qb.andWhere(
        '(l.documentNumber ILIKE :term OR COALESCE(l.reference, \'\') ILIKE :term OR COALESCE(l.socNumber, \'\') ILIKE :term OR COALESCE(l.poReference, \'\') ILIKE :term OR COALESCE(l.notes, \'\') ILIKE :term)',
        { term },
      );
    }

    qb.orderBy('l.transactionDate', 'ASC');
    qb.addOrderBy('l.createdAt', 'ASC');

    const allEntries = await qb.getMany();

    // Compute authoritative running balance chronologically
    let running = 0;
    let openingBalance = 0;
    let totalInvoiced = 0;
    let totalDebitNotes = 0;
    let totalReceiptsAndAdvances = 0;
    let totalReturnsAndCredits = 0;

    const computedEntries = allEntries.map((entry) => {
      const debit = Number(entry.debit) || 0;
      const credit = Number(entry.credit) || 0;
      running = round4(running + debit - credit);
      entry.runningBalance = running;

      switch (entry.documentType) {
        case CustomerDocumentType.OPENING_BALANCE:
          openingBalance = round2(openingBalance + debit - credit);
          break;
        case CustomerDocumentType.SALES_INVOICE:
          totalInvoiced = round2(totalInvoiced + debit);
          break;
        case CustomerDocumentType.DEBIT_NOTE:
          totalDebitNotes = round2(totalDebitNotes + debit);
          break;
        case CustomerDocumentType.CUSTOMER_PAYMENT:
        case CustomerDocumentType.ADVANCE_RECEIPT:
          totalReceiptsAndAdvances = round2(totalReceiptsAndAdvances + credit);
          break;
        case CustomerDocumentType.CREDIT_NOTE:
        case CustomerDocumentType.SALES_RETURN:
          totalReturnsAndCredits = round2(totalReturnsAndCredits + credit);
          break;
        default:
          break;
      }

      return entry;
    });

    const totalDebit = round4(computedEntries.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0));
    const totalCredit = round4(computedEntries.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0));
    const outstanding = round4(totalDebit - totalCredit);
    const lastEntry = computedEntries[computedEntries.length - 1];

    const { aging, unadjustedAdvanceBalance, openInvoices, availableAdvances, divisionMap } =
      await this.fetchCustomerAgingAndOpenDocs(customerId, companyId, Math.max(0, outstanding));

    const openInvMap = new Map(openInvoices.map((inv) => [inv.invoiceNo, inv]));
    const todayUtc = new Date();
    const todayDay = Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate());

    const enrichedEntries = computedEntries.map((e: any) => {
      const openInv = openInvMap.get(e.documentNumber);
      let overdueDays = 0;
      if (e.documentType === CustomerDocumentType.SALES_INVOICE && e.dueDate && (openInv ? openInv.balance > 0 : true)) {
        const due = new Date(e.dueDate);
        const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
        overdueDays = Math.max(0, Math.floor((todayDay - dueDay) / 86400000));
      }
      return {
        ...e,
        divisionName: e.divisionId ? divisionMap.get(e.divisionId) || null : openInv?.divisionName || null,
        overdueDays: openInv ? openInv.daysOverdue : overdueDays,
        invoiceStatus: openInv?.status || (e.documentType === CustomerDocumentType.SALES_INVOICE && openInv === undefined ? 'Settled' : null),
      };
    });

    const total = enrichedEntries.length;
    const startIndex = (page - 1) * limit;
    const paginatedData = enrichedEntries.slice(startIndex, startIndex + limit);

    const summary: CustomerLedgerSummary = {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.name,
      currency: customer.currencyCode || 'PKR',
      openingBalance,
      totalInvoiced,
      totalDebitNotes,
      totalReceiptsAndAdvances,
      totalReturnsAndCredits,
      unadjustedAdvanceBalance,
      netReceivableBalance: round2(outstanding),
      totalDebit,
      totalCredit,
      outstandingBalance: outstanding,
      balanceType: outstanding > 0 ? 'DEBIT' : outstanding < 0 ? 'CREDIT' : 'ZERO',
      lastTransactionDate: lastEntry ? lastEntry.transactionDate : null,
      transactionCount: total,
      creditLimit: Number(customer.creditLimit) || 0,
      creditDays: Number(customer.creditDays) || 0,
      paymentTerms: customer.paymentTerms || (Number(customer.creditDays) > 0 ? `Net ${customer.creditDays} Days` : 'Cash / Immediate'),
      creditHold: Boolean(customer.creditHold),
      creditHoldReason: customer.creditHoldReason || null,
      aging,
      openInvoices,
      availableAdvances,
    };

    return { data: paginatedData, total, summary };
  }

  async getSummary(customerId: string, companyId: string): Promise<CustomerLedgerSummary> {
    const { summary } = await this.getLedger(customerId, companyId, { limit: 1000 });
    return summary;
  }

  async getAgingAnalysis(customerId: string, companyId: string): Promise<CustomerAgingBuckets> {
    const { summary } = await this.getLedger(customerId, companyId, { limit: 1000 });
    return summary.aging;
  }

  async recordEntry(
    companyId: string,
    customerId: string,
    dto: {
      transactionDate: Date | string;
      documentType: CustomerDocumentType;
      documentNumber: string;
      reference?: string;
      debit?: number;
      credit?: number;
      currency?: string;
      dueDate?: Date | string | null;
      paymentTerms?: string | null;
      status?: string;
      divisionId?: string | null;
      salesOrderId?: string | null;
      socNumber?: string | null;
      poReference?: string | null;
      paymentMode?: string | null;
      receiptId?: string | null;
      salesInvoiceId?: string | null;
      notes?: string;
    },
    userId?: string,
    manager?: EntityManager,
  ): Promise<CustomerLedgerEntry> {
    const custRepo = manager ? manager.getRepository(Customer) : this.customerRepo;
    const ledgerRepo = manager ? manager.getRepository(CustomerLedgerEntry) : this.ledgerRepo;
    const customer = await custRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    const entry = ledgerRepo.create({
      companyId,
      customerId,
      transactionDate: new Date(dto.transactionDate),
      documentType: dto.documentType,
      documentNumber: dto.documentNumber,
      reference: dto.reference || null,
      debit: round4(Number(dto.debit) || 0),
      credit: round4(Number(dto.credit) || 0),
      currency: dto.currency || customer.currencyCode || 'PKR',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      paymentTerms: dto.paymentTerms || customer.paymentTerms || null,
      status: dto.status || 'POSTED',
      divisionId: dto.divisionId || customer.divisionId || null,
      salesOrderId: dto.salesOrderId || null,
      socNumber: dto.socNumber || null,
      poReference: dto.poReference || null,
      paymentMode: dto.paymentMode || null,
      receiptId: dto.receiptId || null,
      salesInvoiceId: dto.salesInvoiceId || null,
      notes: dto.notes || null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const saved = await ledgerRepo.save(entry);
    await this.recalculateRunningBalances(customerId, companyId, manager);

    if (entry.debit > 0) {
      customer.totalRevenue = round4((Number(customer.totalRevenue) || 0) + Number(entry.debit));
      await custRepo.save(customer);
    }

    return saved;
  }

  async recordOpeningBalance(
    companyId: string,
    customerId: string,
    amount: number,
    type: 'DEBIT' | 'CREDIT' = 'DEBIT',
    userId?: string,
  ): Promise<CustomerLedgerEntry> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) throw new NotFoundException(`Customer '${customerId}' not found`);

    const docNum = `OB-${customer.customerCode}`;
    const existing = await this.ledgerRepo.findOne({
      where: { customerId, documentNumber: docNum },
    });
    if (existing) {
      existing.debit = type === 'DEBIT' ? amount : 0;
      existing.credit = type === 'CREDIT' ? amount : 0;
      existing.updatedBy = userId || null;
      const saved = await this.ledgerRepo.save(existing);
      await this.recalculateRunningBalances(customerId, companyId);
      return saved;
    }

    return this.recordEntry(
      companyId,
      customerId,
      {
        transactionDate: customer.customerSince || new Date(),
        documentType: CustomerDocumentType.OPENING_BALANCE,
        documentNumber: docNum,
        reference: 'Initial Opening Balance Migration',
        debit: type === 'DEBIT' ? amount : 0,
        credit: type === 'CREDIT' ? amount : 0,
        currency: customer.currencyCode || 'PKR',
        notes: `Opening balance (${type}) recorded for customer ${customer.name}`,
      },
      userId,
    );
  }

  /**
   * Official Customer Statement with period Opening Balance, Running Balance, Aging & Unallocated Advances
   */
  async getStatement(
    customerId: string,
    companyId: string,
    options: { fromDate?: string; toDate?: string; documentType?: CustomerDocumentType | string; divisionId?: string } = {},
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    let openingBalance = 0;
    if (options.fromDate) {
      const priorQb = this.ledgerRepo
        .createQueryBuilder('l')
        .where('l.customerId = :customerId', { customerId })
        .andWhere('l.companyId = :companyId', { companyId })
        .andWhere('l.transactionDate < :fromDate', { fromDate: options.fromDate });
      if (options.divisionId) priorQb.andWhere('l.divisionId = :divisionId', { divisionId: options.divisionId });

      const priorEntries = await priorQb.getMany();
      for (const e of priorEntries) {
        openingBalance += Number(e.debit) || 0;
        openingBalance -= Number(e.credit) || 0;
      }
    }

    const qb = this.ledgerRepo.createQueryBuilder('l')
      .where('l.customerId = :customerId', { customerId })
      .andWhere('l.companyId = :companyId', { companyId });

    if (options.fromDate) qb.andWhere('l.transactionDate >= :fromDate', { fromDate: options.fromDate });
    if (options.toDate) qb.andWhere('l.transactionDate <= :toDate', { toDate: options.toDate });
    if (options.documentType && String(options.documentType).toUpperCase() !== 'ALL') {
      qb.andWhere('l.documentType = :documentType', { documentType: options.documentType });
    }
    if (options.divisionId) qb.andWhere('l.divisionId = :divisionId', { divisionId: options.divisionId });

    qb.orderBy('l.transactionDate', 'ASC').addOrderBy('l.createdAt', 'ASC');
    const periodEntries = await qb.getMany();

    let currentBal = openingBalance;
    let periodDebit = 0;
    let periodCredit = 0;

    const computedEntries = periodEntries.map((e) => {
      const debit = Number(e.debit) || 0;
      const credit = Number(e.credit) || 0;
      periodDebit += debit;
      periodCredit += credit;
      currentBal += debit - credit;
      return {
        ...e,
        debit,
        credit,
        runningBalance: round4(currentBal),
      };
    });

    const closingBalance = round2(currentBal);
    const { aging, unadjustedAdvanceBalance, divisionMap } = await this.fetchCustomerAgingAndOpenDocs(
      customerId,
      companyId,
      Math.max(0, closingBalance),
    );

    const enrichedEntries = computedEntries.map((e: any) => ({
      ...e,
      divisionName: e.divisionId ? divisionMap.get(e.divisionId) || null : null,
    }));

    return {
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        name: customer.name,
        legalName: customer.legalName,
        currencyCode: customer.currencyCode || 'PKR',
        paymentTerms: customer.paymentTerms,
        creditLimit: Number(customer.creditLimit) || 0,
        creditDays: Number(customer.creditDays) || 0,
        creditHold: Boolean(customer.creditHold),
        taxNumber: customer.taxNumber,
        salesTaxNumber: customer.salesTaxNumber,
        phone: customer.phone,
        city: customer.city,
        addressLine1: customer.addressLine1,
      },
      fromDate: options.fromDate || null,
      toDate: options.toDate || null,
      openingBalance: round2(openingBalance),
      openingBalanceType: openingBalance > 0 ? 'DEBIT' : openingBalance < 0 ? 'CREDIT' : 'ZERO',
      periodDebit: round2(periodDebit),
      periodCredit: round2(periodCredit),
      closingBalance,
      closingBalanceType: closingBalance > 0 ? 'DEBIT' : closingBalance < 0 ? 'CREDIT' : 'ZERO',
      unadjustedAdvanceBalance,
      aging,
      entries: enrichedEntries,
      totalEntries: enrichedEntries.length,
    };
  }

  async getSalesSummary(customerId: string, companyId: string) {
    const { summary } = await this.getLedger(customerId, companyId, { limit: 1000 });
    return {
      customerId: summary.customerId,
      customerCode: summary.customerCode,
      customerName: summary.customerName,
      currency: summary.currency,
      creditLimit: summary.creditLimit,
      creditDays: summary.creditDays,
      paymentTerms: summary.paymentTerms,
      creditHold: summary.creditHold,
      creditHoldReason: summary.creditHoldReason,
      openingBalance: summary.openingBalance,
      totalInvoiced: summary.totalInvoiced,
      totalDebitNotes: summary.totalDebitNotes,
      paidAmount: summary.totalReceiptsAndAdvances,
      totalReturned: summary.totalReturnsAndCredits,
      unadjustedAdvanceBalance: summary.unadjustedAdvanceBalance,
      outstandingAmount: Math.max(0, summary.netReceivableBalance),
      currentBalance: summary.netReceivableBalance,
      balanceType: summary.balanceType,
      aging: summary.aging,
      openInvoices: summary.openInvoices,
      availableAdvances: summary.availableAdvances,
    };
  }

  /**
   * Real customer-wise purchased items queried from Sales Invoices & Orders (zero fake demo rows).
   */
  async getCustomerItems(customerId: string, companyId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }
    if (typeof this.ledgerRepo.manager?.query !== 'function') {
      return [];
    }

    try {
      const rows: any[] = await this.ledgerRepo.manager.query(
        `SELECT COALESCE(sil.item_code, i.item_code, 'ITEM') AS item_code,
                COALESCE(i.name, sil.description, 'Finished Goods Item') AS item_name,
                COALESCE(sil.uom_code, 'GRS') AS uom,
                SUM(COALESCE(sil.quantity, 0))::numeric AS total_quantity,
                SUM(COALESCE(sil.line_total, 0))::numeric AS total_sales_value,
                MAX(si.invoice_date) AS last_sale_date
         FROM erp_sales.sales_invoice_lines sil
         INNER JOIN erp_sales.sales_invoices si ON si.id = sil.invoice_id
         LEFT JOIN public.items i ON i.id = sil.item_id
         WHERE si.company_id = $1
           AND si.customer_id = $2
           AND si.deleted_at IS NULL
           AND LOWER(COALESCE(si.status, 'pending')) <> 'cancelled'
         GROUP BY COALESCE(sil.item_code, i.item_code, 'ITEM'),
                  COALESCE(i.name, sil.description, 'Finished Goods Item'),
                  COALESCE(sil.uom_code, 'GRS')
         ORDER BY SUM(COALESCE(sil.line_total, 0)) DESC`,
        [companyId, customerId],
      );

      if (rows && rows.length > 0) {
        return rows.map((r, idx) => ({
          id: `${r.item_code}-${idx}`,
          itemCode: r.item_code,
          itemName: r.item_name,
          uom: r.uom,
          quantity: Number(r.total_quantity) || 0,
          totalQuantity: Number(r.total_quantity) || 0,
          lastSaleDate: r.last_sale_date ? String(r.last_sale_date).slice(0, 10) : null,
          totalSalesValue: round2(Number(r.total_sales_value) || 0),
          currency: customer.currencyCode || 'PKR',
        }));
      }

      // Fallback to confirmed Sales Order items if not yet invoiced
      const orderRows: any[] = await this.ledgerRepo.manager.query(
        `SELECT COALESCE(i.item_code, 'ITEM') AS item_code,
                COALESCE(i.name, soi.description, 'Ordered Product') AS item_name,
                COALESCE(u.code, 'GRS') AS uom,
                SUM(COALESCE(soi.quantity, 0))::numeric AS total_quantity,
                SUM(COALESCE(soi.line_total, 0))::numeric AS total_sales_value,
                MAX(so.order_date) AS last_sale_date
         FROM erp_sales.sales_order_items soi
         INNER JOIN erp_sales.sales_orders so ON so.id = soi.sales_order_id
         LEFT JOIN public.items i ON i.id = soi.item_id
         LEFT JOIN public.uoms u ON u.id = soi.uom_id
         WHERE so.company_id = $1
           AND so.customer_id = $2
           AND so.deleted_at IS NULL
           AND LOWER(COALESCE(so.status, 'draft')) <> 'cancelled'
         GROUP BY COALESCE(i.item_code, 'ITEM'),
                  COALESCE(i.name, soi.description, 'Ordered Product'),
                  COALESCE(u.code, 'GRS')
         ORDER BY SUM(COALESCE(soi.line_total, 0)) DESC`,
        [companyId, customerId],
      ).catch(() => []);

      return (orderRows || []).map((r, idx) => ({
        id: `so-${r.item_code}-${idx}`,
        itemCode: r.item_code,
        itemName: r.item_name,
        uom: r.uom,
        quantity: Number(r.total_quantity) || 0,
        totalQuantity: Number(r.total_quantity) || 0,
        lastSaleDate: r.last_sale_date ? String(r.last_sale_date).slice(0, 10) : null,
        totalSalesValue: round2(Number(r.total_sales_value) || 0),
        currency: customer.currencyCode || 'PKR',
      }));
    } catch {
      return [];
    }
  }

  async getTopCustomers(companyId: string, limit = 5) {
    const customers = await this.customerRepo.find({
      where: { companyId, status: 'ACTIVE' },
      take: limit * 2,
    });

    const summaries = await Promise.all(
      customers.map(async (c) => {
        const { summary } = await this.getLedger(c.id, companyId, { limit: 100 });
        return {
          id: c.id,
          customerCode: c.customerCode,
          name: c.name,
          customerType: c.customerType,
          totalDebit: summary.totalDebit,
          outstandingBalance: summary.outstandingBalance,
          transactionCount: summary.transactionCount,
        };
      }),
    );

    summaries.sort((a, b) => b.totalDebit - a.totalDebit);
    return summaries.slice(0, limit);
  }

  async getItemAnalysis(companyId: string) {
    if (typeof this.ledgerRepo.manager?.query !== 'function') return [];
    try {
      const rows: any[] = await this.ledgerRepo.manager.query(
        `SELECT COALESCE(sil.item_code, i.item_code, 'ITEM') AS item_code,
                COALESCE(i.name, sil.description, 'Finished Goods Item') AS item_name,
                COALESCE(sil.uom_code, 'GRS') AS uom,
                SUM(COALESCE(sil.quantity, 0))::numeric AS total_volume_sold,
                SUM(COALESCE(sil.line_total, 0))::numeric AS total_sales_value,
                COUNT(DISTINCT si.customer_id)::int AS customer_count
         FROM erp_sales.sales_invoice_lines sil
         INNER JOIN erp_sales.sales_invoices si ON si.id = sil.invoice_id
         LEFT JOIN public.items i ON i.id = sil.item_id
         WHERE si.company_id = $1
           AND si.deleted_at IS NULL
           AND LOWER(COALESCE(si.status, 'pending')) <> 'cancelled'
         GROUP BY COALESCE(sil.item_code, i.item_code, 'ITEM'),
                  COALESCE(i.name, sil.description, 'Finished Goods Item'),
                  COALESCE(sil.uom_code, 'GRS')
         ORDER BY SUM(COALESCE(sil.line_total, 0)) DESC`,
        [companyId],
      );
      return (rows || []).map((r) => ({
        itemCode: r.item_code,
        itemName: r.item_name,
        category: 'Finished Goods',
        uom: r.uom,
        totalVolumeSold: Number(r.total_volume_sold) || 0,
        totalSalesValue: round2(Number(r.total_sales_value) || 0),
        customerCount: Number(r.customer_count) || 0,
      }));
    } catch {
      return [];
    }
  }
}
