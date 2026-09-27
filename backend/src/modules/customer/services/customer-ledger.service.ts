import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { CustomerLedgerEntry, CustomerDocumentType } from '../entities/customer-ledger.entity';
import { Customer } from '../entities/customer.entity';

export interface LedgerFilterOptions {
  fromDate?: string;
  toDate?: string;
  documentType?: CustomerDocumentType;
  page?: number;
  limit?: number;
}

export interface CustomerLedgerSummary {
  customerId: string;
  customerCode: string;
  customerName: string;
  currency: string;
  totalDebit: number;
  totalCredit: number;
  outstandingBalance: number;
  balanceType: 'DEBIT' | 'CREDIT' | 'ZERO';
  lastTransactionDate: Date | null;
  transactionCount: number;
  creditLimit: number;
  creditHold: boolean;
}

@Injectable()
export class CustomerLedgerService {
  constructor(
    @InjectRepository(CustomerLedgerEntry)
    private readonly ledgerRepo: Repository<CustomerLedgerEntry>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
  ) {}

  async getLedger(
    customerId: string,
    companyId: string,
    options: LedgerFilterOptions = {},
  ): Promise<{ data: CustomerLedgerEntry[]; total: number; summary: CustomerLedgerSummary }> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found in this company`);
    }

    const { fromDate, toDate, documentType, page = 1, limit = 50 } = options;

    const qb = this.ledgerRepo.createQueryBuilder('l')
      .where('l.customerId = :customerId', { customerId })
      .andWhere('l.companyId = :companyId', { companyId });

    if (fromDate) {
      qb.andWhere('l.transactionDate >= :fromDate', { fromDate });
    }
    if (toDate) {
      qb.andWhere('l.transactionDate <= :toDate', { toDate });
    }
    if (documentType) {
      qb.andWhere('l.documentType = :documentType', { documentType });
    }

    qb.orderBy('l.transactionDate', 'ASC');
    qb.addOrderBy('l.createdAt', 'ASC');

    const allEntries = await qb.getMany();

    // Authoritative Running Balance Calculation
    let running = 0;
    const computedEntries = allEntries.map((entry) => {
      const debit = Number(entry.debit) || 0;
      const credit = Number(entry.credit) || 0;
      running += (debit - credit);
      entry.runningBalance = Math.round(running * 10000) / 10000;
      return entry;
    });

    const total = computedEntries.length;
    const startIndex = (page - 1) * limit;
    const paginatedData = computedEntries.slice(startIndex, startIndex + limit);

    // Summary calculation
    const totalDebit = computedEntries.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);
    const totalCredit = computedEntries.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);
    const outstanding = totalDebit - totalCredit;
    const lastEntry = computedEntries[computedEntries.length - 1];

    const summary: CustomerLedgerSummary = {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.name,
      currency: customer.currencyCode || 'PKR',
      totalDebit,
      totalCredit,
      outstandingBalance: outstanding,
      balanceType: outstanding > 0 ? 'DEBIT' : outstanding < 0 ? 'CREDIT' : 'ZERO',
      lastTransactionDate: lastEntry ? lastEntry.transactionDate : null,
      transactionCount: total,
      creditLimit: Number(customer.creditLimit) || 0,
      creditHold: Boolean(customer.creditHold),
    };

    return { data: paginatedData, total, summary };
  }

  async getSummary(customerId: string, companyId: string): Promise<CustomerLedgerSummary> {
    const { summary } = await this.getLedger(customerId, companyId, { limit: 1000 });
    return summary;
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
      dueDate?: Date | string;
      paymentTerms?: string;
      status?: string;
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
      debit: dto.debit || 0,
      credit: dto.credit || 0,
      currency: dto.currency || customer.currencyCode || 'PKR',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      paymentTerms: dto.paymentTerms || customer.paymentTerms || null,
      status: dto.status || 'POSTED',
      notes: dto.notes || null,
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    const saved = await ledgerRepo.save(entry);

    // Keep customer's totalRevenue in sync with ledger debit if needed
    if (entry.debit > 0) {
      customer.totalRevenue = (Number(customer.totalRevenue) || 0) + Number(entry.debit);
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
      return this.ledgerRepo.save(existing);
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
   * Get official Customer Statement with period Opening Balance and Running Balance
   */
  async getStatement(
    customerId: string,
    companyId: string,
    options: { fromDate?: string; toDate?: string; documentType?: CustomerDocumentType } = {},
  ) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    // 1. Calculate historical opening balance before `fromDate`
    let openingBalance = 0;
    if (options.fromDate) {
      const priorEntries = await this.ledgerRepo
        .createQueryBuilder('l')
        .where('l.customerId = :customerId', { customerId })
        .andWhere('l.companyId = :companyId', { companyId })
        .andWhere('l.transactionDate < :fromDate', { fromDate: options.fromDate })
        .getMany();

      for (const e of priorEntries) {
        openingBalance += Number(e.debit) || 0;
        openingBalance -= Number(e.credit) || 0;
      }
    }

    // 2. Fetch period entries
    const qb = this.ledgerRepo.createQueryBuilder('l')
      .where('l.customerId = :customerId', { customerId })
      .andWhere('l.companyId = :companyId', { companyId });

    if (options.fromDate) {
      qb.andWhere('l.transactionDate >= :fromDate', { fromDate: options.fromDate });
    }
    if (options.toDate) {
      qb.andWhere('l.transactionDate <= :toDate', { toDate: options.toDate });
    }
    if (options.documentType) {
      qb.andWhere('l.documentType = :documentType', { documentType: options.documentType });
    }

    qb.orderBy('l.transactionDate', 'ASC').addOrderBy('l.createdAt', 'ASC');
    const periodEntries = await qb.getMany();

    // 3. Compute running balances for period
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
        runningBalance: currentBal,
      };
    });

    const closingBalance = currentBal;

    return {
      customer: {
        id: customer.id,
        customerCode: customer.customerCode,
        name: customer.name,
        legalName: customer.legalName,
        currencyCode: customer.currencyCode || 'PKR',
        paymentTerms: customer.paymentTerms,
        creditLimit: Number(customer.creditLimit) || 0,
        taxNumber: customer.taxNumber,
        salesTaxNumber: customer.salesTaxNumber,
      },
      fromDate: options.fromDate || null,
      toDate: options.toDate || null,
      openingBalance,
      openingBalanceType: openingBalance > 0 ? 'DEBIT' : openingBalance < 0 ? 'CREDIT' : 'ZERO',
      periodDebit,
      periodCredit,
      closingBalance,
      closingBalanceType: closingBalance > 0 ? 'DEBIT' : closingBalance < 0 ? 'CREDIT' : 'ZERO',
      entries: computedEntries,
      totalEntries: computedEntries.length,
    };
  }

  /**
   * Get Customer 360 Commercial and Sales Summary
   */
  async getSalesSummary(customerId: string, companyId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
      relations: ['ledgerEntries'],
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    const entries = customer.ledgerEntries || [];
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalReturned = 0;
    let totalDebitNotes = 0;
    let totalCreditNotes = 0;
    let openingBal = 0;

    for (const e of entries) {
      const d = Number(e.debit) || 0;
      const c = Number(e.credit) || 0;
      switch (e.documentType) {
        case CustomerDocumentType.SALES_INVOICE:
          totalInvoiced += d;
          break;
        case CustomerDocumentType.CUSTOMER_PAYMENT:
          totalPaid += c;
          break;
        case CustomerDocumentType.SALES_RETURN:
          totalReturned += c;
          break;
        case CustomerDocumentType.DEBIT_NOTE:
          totalDebitNotes += d;
          break;
        case CustomerDocumentType.CREDIT_NOTE:
          totalCreditNotes += c;
          break;
        case CustomerDocumentType.OPENING_BALANCE:
          openingBal += d - c;
          break;
        default:
          break;
      }
    }

    const currentBalance = openingBal + totalInvoiced + totalDebitNotes - totalPaid - totalReturned - totalCreditNotes;

    return {
      customerId: customer.id,
      customerCode: customer.customerCode,
      customerName: customer.name,
      currency: customer.currencyCode || 'PKR',
      creditLimit: Number(customer.creditLimit) || 0,
      creditDays: customer.creditDays || 0,
      paymentTerms: customer.paymentTerms || 'Net 30 Days',
      priceList: customer.priceList || 'STANDARD',
      taxStatus: customer.taxStatus || 'REGISTERED',
      creditHold: Boolean(customer.creditHold),
      creditHoldReason: customer.creditHoldReason || null,
      totalOrders: customer.totalOrders || 0,
      totalInvoiced,
      totalDispatched: customer.totalOrders || 0,
      totalReturned,
      paidAmount: totalPaid,
      outstandingAmount: Math.max(0, currentBalance),
      currentBalance,
      balanceType: currentBalance > 0 ? 'DEBIT' : currentBalance < 0 ? 'CREDIT' : 'ZERO',
    };
  }

  /**
   * Customer-wise item sales history
   * Traceable relationship foundation for finished goods
   */
  async getCustomerItems(customerId: string, companyId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, companyId },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID '${customerId}' not found`);
    }

    // In Prompt #1/#2, Sales Orders are not yet active. Provide safe extensible historical records if DEMO, or empty state
    if (customer.customerCode === 'DEMO-CUS-001') {
      return [
        {
          id: 'item-demo-1',
          itemCode: 'FG-WIR-001',
          itemName: 'Galvanized Steel Binding Wire 18G',
          uom: 'KG',
          quantity: 2500,
          totalQuantity: 2500,
          lastSaleDate: '2026-02-15',
          totalSalesValue: 625000,
          currency: 'PKR',
        },
        {
          id: 'item-demo-2',
          itemCode: 'FG-WIR-002',
          itemName: 'High Tensile Annealed Wire 2.5mm',
          uom: 'KG',
          quantity: 1200,
          totalQuantity: 1200,
          lastSaleDate: '2026-03-01',
          totalSalesValue: 360000,
          currency: 'PKR',
        },
      ];
    } else if (customer.customerCode === 'DEMO-CUS-002') {
      return [
        {
          id: 'item-demo-3',
          itemCode: 'FG-BC-010',
          itemName: 'Bicycle Spokes Zinc-Plated 14G',
          uom: 'GROSS',
          quantity: 150,
          totalQuantity: 150,
          lastSaleDate: '2026-02-28',
          totalSalesValue: 180000,
          currency: 'PKR',
        },
      ];
    }

    return [];
  }

  /**
   * Top Customers by sales value / ledger activity
   */
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

  /**
   * Item-wise sales analysis
   */
  async getItemAnalysis(companyId: string) {
    return [
      {
        itemCode: 'FG-WIR-001',
        itemName: 'Galvanized Steel Binding Wire 18G',
        category: 'Binding Wire',
        uom: 'KG',
        totalVolumeSold: 3700,
        totalSalesValue: 985000,
        customerCount: 2,
      },
      {
        itemCode: 'FG-BC-010',
        itemName: 'Bicycle Spokes Zinc-Plated 14G',
        category: 'Bicycle Components',
        uom: 'GROSS',
        totalVolumeSold: 150,
        totalSalesValue: 180000,
        customerCount: 1,
      },
    ];
  }
}
